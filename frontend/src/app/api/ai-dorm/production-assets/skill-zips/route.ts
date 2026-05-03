import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import {
  getAiProductionSkillPackages,
  saveAiProductionSkillZip,
} from "@/lib/ai-dorm/production-assets";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const packages = await getAiProductionSkillPackages();
  return NextResponse.json({ packages });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "请上传 Skill zip 文件。" }, { status: 400 });
  }

  try {
    const packages = await saveAiProductionSkillZip(file);
    return NextResponse.json({ packages });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_SKILL_ZIP") {
      return NextResponse.json({ message: "只支持 .zip 压缩包。" }, { status: 400 });
    }

    if (error instanceof Error && error.message === "SKILL_ZIP_TOO_LARGE") {
      return NextResponse.json(
        { message: "压缩包太大，当前限制为 80MB。" },
        { status: 400 },
      );
    }

    throw error;
  }
}
