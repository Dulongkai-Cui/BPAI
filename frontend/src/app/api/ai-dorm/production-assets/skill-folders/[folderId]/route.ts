import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { deleteAiProductionSkillFolder } from "@/lib/ai-dorm/production-assets";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    folderId: string;
  }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { folderId } = await context.params;
  const folders = await deleteAiProductionSkillFolder(folderId);

  return NextResponse.json({ folders });
}
