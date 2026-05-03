import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import {
  getAiProductionSkillPackages,
  runAiProductionSkillCommand,
} from "@/lib/ai-dorm/production-assets";

export const runtime = "nodejs";

type SkillCommandPayload = {
  command?: string;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as SkillCommandPayload | null;
  const command = typeof payload?.command === "string" ? payload.command.trim() : "";

  if (!command) {
    return NextResponse.json({ message: "Missing command" }, { status: 400 });
  }

  const result = await runAiProductionSkillCommand(command);
  const packages = await getAiProductionSkillPackages();

  return NextResponse.json({ result, packages });
}
