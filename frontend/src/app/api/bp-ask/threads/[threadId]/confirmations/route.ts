import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { updateConfirmationForUser } from "@/lib/bp-ask/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    threadId: string;
  }>;
};

type ConfirmationPayload = {
  executionResultId?: string;
  requestId?: string;
  action?: string;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await context.params;
  const payload = (await request.json().catch(() => null)) as ConfirmationPayload | null;

  if (!payload) {
    return NextResponse.json({ message: "确认参数不完整" }, { status: 400 });
  }

  try {
    const result = await updateConfirmationForUser(user, threadId, payload);
    return NextResponse.json(result);
  } catch (error) {
    if (!(error instanceof Error)) {
      return NextResponse.json(
        { message: "记录确认失败，请稍后再试" },
        { status: 500 },
      );
    }

    if (error.message === "THREAD_NOT_FOUND") {
      return NextResponse.json({ message: "对话线程不存在" }, { status: 404 });
    }

    if (
      error.message === "INVALID_CONFIRMATION_PAYLOAD" ||
      error.message === "INVALID_CONFIRMATION_ACTION"
    ) {
      return NextResponse.json({ message: "确认参数不完整" }, { status: 400 });
    }

    if (
      error.message === "EXECUTION_RESULT_NOT_FOUND" ||
      error.message === "CONFIRMATION_PAYLOAD_NOT_FOUND" ||
      error.message === "CONFIRMATION_REQUEST_NOT_FOUND"
    ) {
      return NextResponse.json({ message: "确认请求不存在" }, { status: 404 });
    }

    return NextResponse.json(
      { message: "记录确认失败，请稍后再试" },
      { status: 500 },
    );
  }
}
