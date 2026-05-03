import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { moveAiProductionSkillPackageToFolder } from "@/lib/ai-dorm/production-assets";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    packageId: string;
  }>;
};

type MovePackagePayload = {
  folderId?: string | null;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { packageId } = await context.params;
  const payload = (await request.json().catch(() => null)) as MovePackagePayload | null;
  const folderId =
    typeof payload?.folderId === "string" && payload.folderId.trim()
      ? payload.folderId.trim()
      : null;

  try {
    const result = await moveAiProductionSkillPackageToFolder({
      packageId,
      folderId,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PACKAGE_ID") {
      return NextResponse.json({ message: "Invalid package id" }, { status: 400 });
    }

    if (error instanceof Error && error.message === "INVALID_FOLDER_ID") {
      return NextResponse.json({ message: "文件夹不存在。" }, { status: 400 });
    }

    throw error;
  }
}
