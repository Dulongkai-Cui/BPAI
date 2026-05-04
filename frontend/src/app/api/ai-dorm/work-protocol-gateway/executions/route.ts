import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import type { DispatchDecision } from "@/lib/bp-ask/intents";
import type { WorkProtocolGatewayMatch } from "@/lib/work-protocol/matcher";
import {
  advanceWorkProtocolExecutionPlan,
  createWorkProtocolExecutionPlan,
  listWorkProtocolExecutionPlans,
  type WorkProtocolExecutionAdvanceAction,
} from "@/lib/work-protocol/runtime";

export const runtime = "nodejs";

type CreateExecutionPayload = {
  match?: WorkProtocolGatewayMatch;
  prompt?: string;
  threadId?: string;
  sourceMessageId?: string;
  executionTaskId?: string;
  dispatchDecision?: DispatchDecision;
  minConfidence?: number;
};

type AdvanceExecutionPayload = {
  executionId?: string;
  action?: WorkProtocolExecutionAdvanceAction;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isAdvanceAction(
  value: unknown,
): value is WorkProtocolExecutionAdvanceAction {
  return value === "advance" || value === "confirm_waiting";
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const executions = (await listWorkProtocolExecutionPlans()).filter(
    (execution) => execution.createdByUserId === user.id,
  );
  return NextResponse.json({ executions });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as CreateExecutionPayload | null;

  if (!isRecord(payload?.match) || typeof payload?.prompt !== "string") {
    return NextResponse.json(
      { message: "Missing match or prompt." },
      { status: 400 },
    );
  }

  const execution = await createWorkProtocolExecutionPlan({
    match: payload.match,
    userId: user.id,
    threadId: payload.threadId,
    sourceMessageId: payload.sourceMessageId,
    executionTaskId: payload.executionTaskId,
    userPrompt: payload.prompt,
    dispatchDecision: payload.dispatchDecision,
    minConfidence: payload.minConfidence,
  });

  if (!execution) {
    return NextResponse.json(
      { message: "No enabled protocol execution plan was created." },
      { status: 422 },
    );
  }

  return NextResponse.json({ execution });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as
    | AdvanceExecutionPayload
    | null;
  const action = payload?.action ?? "advance";

  if (typeof payload?.executionId !== "string" || payload.executionId.length === 0) {
    return NextResponse.json(
      { message: "Missing executionId." },
      { status: 400 },
    );
  }

  if (!isAdvanceAction(action)) {
    return NextResponse.json(
      { message: "Unsupported execution action." },
      { status: 400 },
    );
  }

  try {
    const execution = await advanceWorkProtocolExecutionPlan({
      executionId: payload.executionId,
      user,
      action,
    });

    return NextResponse.json({ execution });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "PROTOCOL_EXECUTION_NOT_FOUND"
    ) {
      return NextResponse.json(
        { message: "Execution plan was not found." },
        { status: 404 },
      );
    }

    throw error;
  }
}
