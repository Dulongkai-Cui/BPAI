import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import {
  applyWritebackDraftForUser,
  reviewWritebackDraftForUser,
} from "@/lib/bp-ask/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    threadId: string;
  }>;
};

type WritebackDraftPayload = {
  executionResultId?: string;
  draftId?: string;
  action?: string;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await context.params;
  const payload = (await request.json().catch(() => null)) as
    | WritebackDraftPayload
    | null;

  if (!payload) {
    return NextResponse.json({ message: "写回草案参数不完整" }, { status: 400 });
  }

  try {
    const result =
      payload.action === "apply"
        ? await applyWritebackDraftForUser(user, threadId, payload)
        : await reviewWritebackDraftForUser(user, threadId, payload);
    return NextResponse.json(result);
  } catch (error) {
    if (!(error instanceof Error)) {
      return NextResponse.json(
        { message: "写回草案审阅失败，请稍后再试" },
        { status: 500 },
      );
    }

    if (error.message === "THREAD_NOT_FOUND") {
      return NextResponse.json({ message: "对话线程不存在" }, { status: 404 });
    }

    if (
      error.message === "INVALID_WRITEBACK_DRAFT_PAYLOAD" ||
      error.message === "INVALID_WRITEBACK_DRAFT_ACTION" ||
      error.message === "INVALID_WRITEBACK_APPLY_PAYLOAD"
    ) {
      return NextResponse.json({ message: "写回草案参数不完整" }, { status: 400 });
    }

    if (
      error.message === "EXECUTION_RESULT_NOT_FOUND" ||
      error.message === "WRITEBACK_DRAFT_PAYLOAD_NOT_FOUND" ||
      error.message === "WRITEBACK_APPLY_PAYLOAD_NOT_FOUND" ||
      error.message === "WRITEBACK_DRAFT_NOT_FOUND"
    ) {
      return NextResponse.json({ message: "写回草案不存在" }, { status: 404 });
    }

    if (error.message === "WRITEBACK_DRAFT_NOT_READY") {
      return NextResponse.json(
        { message: "只有 ready 草案允许正式写回" },
        { status: 409 },
      );
    }

    if (error.message === "WRITEBACK_DRAFT_ALREADY_APPLIED") {
      return NextResponse.json(
        { message: "该写回草案已经应用，不能再次审阅" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { message: "写回草案审阅失败，请稍后再试" },
      { status: 500 },
    );
  }
}
