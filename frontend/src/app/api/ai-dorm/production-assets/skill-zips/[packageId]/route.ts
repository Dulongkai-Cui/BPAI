import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { deleteAiProductionSkillPackage } from "@/lib/ai-dorm/production-assets";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    packageId: string;
  }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { packageId } = await context.params;
  const packages = await deleteAiProductionSkillPackage(packageId);

  return NextResponse.json({ packages });
}
