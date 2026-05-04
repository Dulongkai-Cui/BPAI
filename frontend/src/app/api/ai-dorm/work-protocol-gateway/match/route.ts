import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import type { DispatchDecision } from "@/lib/bp-ask/intents";
import { matchEnabledWorkProtocols } from "@/lib/work-protocol/matcher";

export const runtime = "nodejs";

type MatchPayload = {
  prompt?: string;
  decision?: DispatchDecision;
  limit?: number;
  minConfidence?: number;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as MatchPayload | null;
  const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";

  if (!prompt) {
    return NextResponse.json(
      { message: "Missing prompt." },
      { status: 400 },
    );
  }

  const matches = await matchEnabledWorkProtocols({
    prompt,
    decision: payload?.decision,
    limit: payload?.limit,
    minConfidence: payload?.minConfidence,
  });

  return NextResponse.json({ matches });
}
