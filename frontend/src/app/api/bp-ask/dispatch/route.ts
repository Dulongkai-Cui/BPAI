import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { previewDispatchForUser } from "@/lib/bp-ask/server";

export const runtime = "nodejs";

type DispatchPayload = {
  prompt?: string;
  message?: string;
  threadId?: string;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as DispatchPayload | null;
  const prompt =
    typeof payload?.prompt === "string" && payload.prompt.trim()
      ? payload.prompt.trim()
      : typeof payload?.message === "string" && payload.message.trim()
        ? payload.message.trim()
        : "";

  if (!prompt) {
    return NextResponse.json({ message: "请填写对话内容" }, { status: 400 });
  }

  try {
    const result = await previewDispatchForUser(user, prompt, payload?.threadId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "THREAD_NOT_FOUND") {
      return NextResponse.json({ message: "对话线程不存在" }, { status: 404 });
    }

    return NextResponse.json(
      { message: "调度预判失败，请稍后再试" },
      { status: 500 },
    );
  }
}
