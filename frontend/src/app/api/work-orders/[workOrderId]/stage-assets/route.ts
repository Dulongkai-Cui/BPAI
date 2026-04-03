import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/server";
import { workOrderStageEnum } from "@/lib/db/schema";
import {
  ensureCanManageWorkOrder,
  uploadWorkOrderStageAssets,
} from "@/lib/work-order/server";

function isWorkOrderStage(value: unknown): value is (typeof workOrderStageEnum.enumValues)[number] {
  return (
    typeof value === "string" &&
    workOrderStageEnum.enumValues.includes(
      value as (typeof workOrderStageEnum.enumValues)[number],
    )
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  try {
    const currentUser = await requireCurrentUser();
    const { workOrderId } = await context.params;
    const access = await ensureCanManageWorkOrder(currentUser, workOrderId);

    if (!access) {
      return NextResponse.json({ message: "工单不存在" }, { status: 404 });
    }

    const formData = await request.formData().catch(() => null);

    if (!formData) {
      return NextResponse.json({ message: "上传表单无效" }, { status: 400 });
    }

    const stage = formData.get("stage");
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (!isWorkOrderStage(stage) || files.length === 0) {
      return NextResponse.json(
        { message: "请先选择节点并上传至少一个文件" },
        { status: 400 },
      );
    }

    const uploaded = await uploadWorkOrderStageAssets({
      workOrderId,
      actor: currentUser,
      stage,
      files,
    });

    if (!uploaded) {
      return NextResponse.json({ message: "工单不存在" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, ...uploaded });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { message: "没有权限修改这个工单" },
        { status: 403 },
      );
    }

    if (error instanceof Error && error.message === "WORKSPACE_REQUIRED") {
      return NextResponse.json(
        { message: "当前工单还没有关联合作空间，无法按节点上传资料" },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message === "INVALID_STAGE") {
      return NextResponse.json({ message: "节点类型无效" }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json(
      { message: "上传节点资料失败，请稍后再试" },
      { status: 500 },
    );
  }
}
