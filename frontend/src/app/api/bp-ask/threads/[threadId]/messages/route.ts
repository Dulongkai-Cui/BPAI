import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { appendMessageToThreadForUser } from "@/lib/bp-ask/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    threadId: string;
  }>;
};

type AppendMessagePayload = {
  prompt?: string;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await context.params;
  const payload = (await request.json().catch(() => null)) as AppendMessagePayload | null;

  if (!payload || typeof payload.prompt !== "string") {
    return NextResponse.json({ message: "请填写对话内容" }, { status: 400 });
  }

  try {
    const result = await appendMessageToThreadForUser(user, threadId, payload.prompt);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (!(error instanceof Error)) {
      return NextResponse.json(
        { message: "发送消息失败，请稍后再试" },
        { status: 500 },
      );
    }

    if (error.message === "THREAD_NOT_FOUND") {
      return NextResponse.json({ message: "对话线程不存在" }, { status: 404 });
    }

    if (error.message === "INVALID_PROMPT") {
      return NextResponse.json({ message: "请填写对话内容" }, { status: 400 });
    }

    return NextResponse.json(
      { message: "发送消息失败，请稍后再试" },
      { status: 500 },
    );
  }
}
