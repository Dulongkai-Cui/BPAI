import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { continueWorkflowDryRunForUser } from "@/lib/bp-ask/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    threadId: string;
  }>;
};

type ContinuationPayload = {
  executionResultId?: string;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await context.params;
  const payload = (await request.json().catch(() => null)) as ContinuationPayload | null;

  if (!payload) {
    return NextResponse.json({ message: "续跑参数不完整" }, { status: 400 });
  }

  try {
    const result = await continueWorkflowDryRunForUser(user, threadId, payload);
    return NextResponse.json(result);
  } catch (error) {
    if (!(error instanceof Error)) {
      return NextResponse.json(
        { message: "续跑 dry-run 失败，请稍后再试" },
        { status: 500 },
      );
    }

    if (error.message === "THREAD_NOT_FOUND") {
      return NextResponse.json({ message: "对话线程不存在" }, { status: 404 });
    }

    if (error.message === "INVALID_CONTINUATION_PAYLOAD") {
      return NextResponse.json({ message: "续跑参数不完整" }, { status: 400 });
    }

    if (
      error.message === "EXECUTION_RESULT_NOT_FOUND" ||
      error.message === "CONTINUATION_PAYLOAD_NOT_FOUND"
    ) {
      return NextResponse.json({ message: "续跑对象不存在" }, { status: 404 });
    }

    if (error.message === "CONFIRMATION_NOT_READY_TO_CONTINUE") {
      return NextResponse.json(
        { message: "确认结果尚未达到可续跑状态" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { message: "续跑 dry-run 失败，请稍后再试" },
      { status: 500 },
    );
  }
}
