import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { requireCurrentUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import {
  collaborationSpaces,
  sourceChannelEnum,
  users,
  workOrderPriorityEnum,
  workOrderStageEnum,
} from "@/lib/db/schema";
import {
  deleteWorkOrder,
  ensureCanManageWorkOrder,
  ensureCanViewWorkOrder,
  getWorkOrderDetailById,
  updateWorkOrder,
} from "@/lib/work-order/server";

type UpdateWorkOrderPayload = {
  workOrderNo?: string;
  title?: string;
  sourceType?: string;
  priority?: string;
  sourceSummary?: string;
  projectName?: string;
  siteName?: string;
  siteAddress?: string;
  currentResponsibleUserId?: string | null;
  currentResponsibleTeam?: string;
  currentStage?: string;
  progressPercent?: number | null;
  collaborationSpaceId?: string | null;
  createDedicatedSpace?: boolean;
  dedicatedSpaceName?: string;
  dedicatedSpaceSummary?: string;
  dedicatedSpaceTone?: "blue" | "amber" | "emerald" | "violet";
};

function isTone(
  value: unknown,
): value is "blue" | "amber" | "emerald" | "violet" {
  return (
    value === "blue" ||
    value === "amber" ||
    value === "emerald" ||
    value === "violet"
  );
}

function getSafeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const currentUser = await requireCurrentUser();
    const { workOrderId } = await context.params;
    const access = await ensureCanViewWorkOrder(currentUser, workOrderId);

    if (!access) {
      return NextResponse.json({ message: "工单不存在" }, { status: 404 });
    }

    const detail = await getWorkOrderDetailById(workOrderId);

    if (!detail) {
      return NextResponse.json({ message: "工单不存在" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, detail });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { message: "没有权限查看这个工单" },
        { status: 403 },
      );
    }
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      error.message === "Unauthorized"
    ) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json(
      { message: "读取工单详情失败，请稍后再试" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const currentUser = await requireCurrentUser();
    const { workOrderId } = await context.params;
    const payload = (await request.json()) as UpdateWorkOrderPayload;
    const title =
      typeof payload.title === "string" ? payload.title.trim() : undefined;

    if (typeof payload.title === "string" && !title) {
      return NextResponse.json({ message: "请先填写工单标题" }, { status: 400 });
    }

    const access = await ensureCanManageWorkOrder(currentUser, workOrderId);

    if (!access) {
      return NextResponse.json({ message: "工单不存在" }, { status: 404 });
    }

    const sourceType =
      typeof payload.sourceType === "undefined"
        ? undefined
        : sourceChannelEnum.enumValues.includes(
              payload.sourceType as (typeof sourceChannelEnum.enumValues)[number],
            )
          ? (payload.sourceType as (typeof sourceChannelEnum.enumValues)[number])
          : "manual";

    const priority =
      typeof payload.priority === "undefined"
        ? undefined
        : workOrderPriorityEnum.enumValues.includes(
              payload.priority as (typeof workOrderPriorityEnum.enumValues)[number],
            )
          ? (payload.priority as (typeof workOrderPriorityEnum.enumValues)[number])
          : "normal";

    const currentStage =
      typeof payload.currentStage === "undefined"
        ? undefined
        : workOrderStageEnum.enumValues.includes(
              payload.currentStage as (typeof workOrderStageEnum.enumValues)[number],
            )
          ? (payload.currentStage as (typeof workOrderStageEnum.enumValues)[number])
          : "registration";

    const progressPercent =
      typeof payload.progressPercent === "number"
        ? Math.max(0, Math.min(100, Math.round(payload.progressPercent)))
        : typeof payload.progressPercent === "undefined"
          ? undefined
          : null;

    const db = getDb();
    const collaborationSpaceId =
      payload.createDedicatedSpace ||
      typeof payload.collaborationSpaceId === "undefined"
        ? undefined
        : payload.collaborationSpaceId;

    if (collaborationSpaceId) {
      const ownedSpace = await db
        .select({ id: collaborationSpaces.id })
        .from(collaborationSpaces)
        .where(
          and(
            eq(collaborationSpaces.id, collaborationSpaceId),
            eq(collaborationSpaces.ownerUserId, currentUser.id),
            isNull(collaborationSpaces.dissolvedAt),
          ),
        )
        .limit(1);

      if (ownedSpace.length === 0) {
        return NextResponse.json(
          { message: "只能关联你自己创建且未解散的合作空间" },
          { status: 403 },
        );
      }
    }

    if (payload.currentResponsibleUserId) {
      const responsibleUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, payload.currentResponsibleUserId))
        .limit(1);

      if (responsibleUser.length === 0) {
        return NextResponse.json(
          { message: "当前节点负责人不存在" },
          { status: 400 },
        );
      }
    }

    const workOrder = await updateWorkOrder({
      id: workOrderId,
      workOrderNo:
        typeof payload.workOrderNo === "string" ? payload.workOrderNo : undefined,
      title,
      collaborationSpaceId,
      dedicatedSpace: payload.createDedicatedSpace
        ? {
            actor: currentUser,
            name:
              getSafeText(payload.dedicatedSpaceName) ||
              title ||
              "工单专属合作空间",
            summary:
              getSafeText(payload.dedicatedSpaceSummary) ||
              `服务于工单「${title || workOrderId}」的专属合作空间，可直接在这里整理资料、图纸、回单和协作记录。`,
            tone: isTone(payload.dedicatedSpaceTone)
              ? payload.dedicatedSpaceTone
              : "blue",
          }
        : undefined,
      sourceType,
      priority,
      sourceSummary: payload.sourceSummary,
      projectName: payload.projectName,
      siteName: payload.siteName,
      siteAddress: payload.siteAddress,
      currentResponsibleUserId:
        typeof payload.currentResponsibleUserId === "undefined"
          ? undefined
          : payload.currentResponsibleUserId,
      currentResponsibleTeam: payload.currentResponsibleTeam,
      currentStage,
      progressPercent,
    });

    if (!workOrder) {
      return NextResponse.json({ message: "工单不存在" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, workOrder });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("工单编号已存在")
    ) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { message: "没有权限修改这个工单" },
        { status: 403 },
      );
    }
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      error.message === "Unauthorized"
    ) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json(
      { message: "保存工单失败，请稍后再试" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const currentUser = await requireCurrentUser();
    const { workOrderId } = await context.params;
    const access = await ensureCanManageWorkOrder(currentUser, workOrderId);

    if (!access) {
      return NextResponse.json({ message: "工单不存在" }, { status: 404 });
    }

    const deleted = await deleteWorkOrder(workOrderId);

    if (!deleted) {
      return NextResponse.json({ message: "工单不存在" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { message: "没有权限删除这个工单" },
        { status: 403 },
      );
    }
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      error.message === "Unauthorized"
    ) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json(
      { message: "删除工单失败，请稍后再试" },
      { status: 500 },
    );
  }
}
