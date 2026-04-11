import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import {
  archiveConversationThreadForUser,
  getConversationThreadDetailForUser,
} from "@/lib/bp-ask/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await context.params;

  try {
    const thread = await getConversationThreadDetailForUser(user, threadId);
    return NextResponse.json({ thread });
  } catch (error) {
    if (error instanceof Error && error.message === "THREAD_NOT_FOUND") {
      return NextResponse.json({ message: "对话线程不存在" }, { status: 404 });
    }

    throw error;
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await context.params;

  try {
    await archiveConversationThreadForUser(user, threadId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "THREAD_NOT_FOUND") {
      return NextResponse.json({ message: "对话线程不存在" }, { status: 404 });
    }

    throw error;
  }
}
