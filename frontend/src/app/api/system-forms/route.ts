import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { createAssignedSystemForm } from "@/lib/workspace/server";
import type { StoredAssignedSystemFormState } from "@/lib/auth/types";

type CreateSystemFormPayload = {
  title?: string;
  spaceId?: string;
  assigneeEmail?: string;
  formType?: string;
  state?: StoredAssignedSystemFormState;
};

function isState(value: unknown): value is StoredAssignedSystemFormState {
  return (
    value === "处理中" ||
    value === "待确认" ||
    value === "已分配" ||
    value === "本周重点"
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as CreateSystemFormPayload | null;

  if (
    !payload ||
    typeof payload.title !== "string" ||
    typeof payload.assigneeEmail !== "string" ||
    typeof payload.formType !== "string"
  ) {
    return NextResponse.json({ message: "请填写表单名称、表单类型和分配对象" }, { status: 400 });
  }

  try {
    const form = await createAssignedSystemForm({
      actor: user,
      title: payload.title,
      spaceId: typeof payload.spaceId === "string" ? payload.spaceId : undefined,
      assigneeEmail: payload.assigneeEmail,
      formType: payload.formType,
      state: isState(payload.state) ? payload.state : "已分配",
    });

    return NextResponse.json({ ok: true, form });
  } catch (error) {
    if (!(error instanceof Error)) {
      return NextResponse.json({ message: "系统表单创建失败，请稍后再试" }, { status: 500 });
    }

    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "当前账号没有系统表单后台控制权限" }, { status: 403 });
    }

    if (error.message === "INVALID_TITLE") {
      return NextResponse.json({ message: "表单名称不能为空" }, { status: 400 });
    }

    if (error.message === "INVALID_FORM_TYPE") {
      return NextResponse.json({ message: "请选择表单类型" }, { status: 400 });
    }

    if (error.message === "SYSTEM_SCOPE_NOT_FOUND") {
      return NextResponse.json({ message: "未找到对应系统后台" }, { status: 404 });
    }

    if (error.message === "ASSIGNEE_NOT_FOUND") {
      return NextResponse.json({ message: "未找到要分配的账号" }, { status: 400 });
    }

    return NextResponse.json({ message: "系统表单创建失败，请稍后再试" }, { status: 500 });
  }
}
