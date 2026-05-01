import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { runAiTool } from "@/lib/ai-tools/gateway";

export const runtime = "nodejs";

type RunAiToolPayload = {
  toolName?: string;
  input?: unknown;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as RunAiToolPayload | null;
  const toolName = typeof payload?.toolName === "string" ? payload.toolName.trim() : "";

  if (!toolName) {
    return NextResponse.json({ message: "Missing toolName" }, { status: 400 });
  }

  const input =
    payload?.input && typeof payload.input === "object" && !Array.isArray(payload.input)
      ? (payload.input as Record<string, unknown>)
      : {};

  const toolRun = await runAiTool(
    { user },
    {
      toolName,
      input,
    },
  );

  return NextResponse.json({ toolRun });
}
