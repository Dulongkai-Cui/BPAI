import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import {
  assignWorkOrderDispatch,
  ensureCanManageWorkOrder,
} from "@/lib/work-order/server";

type CreateDispatchExecutionPayload = {
  assignedTeamLabel?: string;
  assignedSquadId?: string | null;
  assignedUserId?: string | null;
  crewLeaderName?: string;
  crewMemberIds?: string[];
  crewMembersText?: string;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  coordinationRecord?: string;
  anomalySummary?: string;
  warningReason?: string;
  nextAction?: string;
};

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseCrewMembers(value: string | undefined) {
  return (value ?? "")
    .split(/[\n,，、；;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const currentUser = await requireCurrentUser();
    const { workOrderId } = await context.params;
    const payload = (await request.json()) as CreateDispatchExecutionPayload;
    const assignedTeamLabel = payload.assignedTeamLabel?.trim() ?? "";
    const assignedSquadId = payload.assignedSquadId?.trim() ?? "";

    if (!assignedTeamLabel && !assignedSquadId) {
      return NextResponse.json(
        { message: "请先填写施工队名称或选择现有编队。" },
        { status: 400 },
      );
    }

    const access = await ensureCanManageWorkOrder(currentUser, workOrderId);
    if (!access) {
      return NextResponse.json({ message: "工单不存在。" }, { status: 404 });
    }

    if (payload.assignedUserId) {
      const db = getDb();
      const responsibleUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, payload.assignedUserId))
        .limit(1);

      if (responsibleUser.length === 0) {
        return NextResponse.json(
          { message: "选择的系统内负责人不存在。" },
          { status: 400 },
        );
      }
    }

    const detail = await assignWorkOrderDispatch({
      workOrderId,
      dispatchedByUserId: currentUser.id,
      assignedTeamLabel,
      assignedSquadId: assignedSquadId || null,
      assignedUserId: payload.assignedUserId ?? null,
      crewLeaderName: payload.crewLeaderName ?? "",
      crewMemberIds: Array.isArray(payload.crewMemberIds)
        ? payload.crewMemberIds
        : [],
      crewMemberNames: parseCrewMembers(payload.crewMembersText),
      plannedStartAt: parseDate(payload.plannedStartAt),
      plannedEndAt: parseDate(payload.plannedEndAt),
      coordinationRecord: payload.coordinationRecord ?? "",
      anomalySummary: payload.anomalySummary ?? "",
      warningReason: payload.warningReason ?? "",
      nextAction: payload.nextAction ?? "",
      executionStatus: "assigned",
    });

    if (!detail) {
      return NextResponse.json({ message: "工单不存在。" }, { status: 404 });
    }

    return NextResponse.json(
      {
        ok: true,
        dispatchExecution: detail.dispatchExecutions[0] ?? null,
        detail,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "FORBIDDEN") {
        return NextResponse.json(
          { message: "没有权限给这个工单派施工队。" },
          { status: 403 },
        );
      }

      if (error.message === "INVALID_SQUAD_ID") {
        return NextResponse.json(
          { message: "选择的编队不存在或已归档。" },
          { status: 400 },
        );
      }

      if (error.message === "INVALID_SQUAD_MEMBER_IDS") {
        return NextResponse.json(
          { message: "选择的施工成员不在当前编队里。" },
          { status: 400 },
        );
      }
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
      { message: "施工队分配失败，请稍后再试。" },
      { status: 500 },
    );
  }
}
