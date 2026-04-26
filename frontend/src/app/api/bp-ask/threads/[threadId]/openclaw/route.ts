import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { runOpenClawForUser } from "@/lib/bp-ask/server";

type BpAskOpenClawRouteProps = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function POST(
  request: Request,
  { params }: BpAskOpenClawRouteProps,
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;
  const payload = await request.json().catch(() => ({}));

  try {
    const result = await runOpenClawForUser(user, threadId, {
      executionResultId:
        typeof payload.executionResultId === "string"
          ? payload.executionResultId
          : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenClaw failed";
    const status =
      message === "EXECUTION_RESULT_NOT_FOUND" || message === "THREAD_NOT_FOUND"
        ? 404
        : message === "OPENCLAW_CONFIRMATION_REQUIRED"
          ? 409
          : 400;

    return NextResponse.json({ message }, { status });
  }
}
