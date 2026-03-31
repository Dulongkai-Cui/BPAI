import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { createCollaborationSpace } from "@/lib/workspace/server";
import type { SpaceTone } from "@/lib/workspace/mock-data";

type CreateCollaborationSpacePayload = {
  name?: string;
  summary?: string;
  tone?: SpaceTone;
  memberEmails?: string[];
};

function isTone(value: unknown): value is SpaceTone {
  return value === "blue" || value === "amber" || value === "emerald" || value === "violet";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as CreateCollaborationSpacePayload | null;

  if (!payload || typeof payload.name !== "string" || !payload.name.trim() || !isTone(payload.tone)) {
    return NextResponse.json({ message: "请填写合作空间名称并选择颜色" }, { status: 400 });
  }

  try {
    const space = await createCollaborationSpace({
      actor: user,
      name: payload.name,
      summary: typeof payload.summary === "string" ? payload.summary : "",
      tone: payload.tone,
      memberEmails: Array.isArray(payload.memberEmails) ? payload.memberEmails : [],
    });

    return NextResponse.json({ ok: true, space });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_NAME") {
      return NextResponse.json({ message: "合作空间名称不能为空" }, { status: 400 });
    }

    return NextResponse.json({ message: "新建合作空间失败，请稍后再试" }, { status: 500 });
  }
}
