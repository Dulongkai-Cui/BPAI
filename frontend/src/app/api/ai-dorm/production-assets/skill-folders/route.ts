import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import {
  createAiProductionSkillFolder,
  getAiProductionSkillFolders,
} from "@/lib/ai-dorm/production-assets";

export const runtime = "nodejs";

type CreateFolderPayload = {
  name?: string;
  description?: string;
};

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const folders = await getAiProductionSkillFolders();
  return NextResponse.json({ folders });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as CreateFolderPayload | null;
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";

  if (!name) {
    return NextResponse.json({ message: "请先填写文件夹名称。" }, { status: 400 });
  }

  try {
    const folders = await createAiProductionSkillFolder({
      name,
      description: payload?.description,
    });
    return NextResponse.json({ folders });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_FOLDER_NAME") {
      return NextResponse.json({ message: "请先填写文件夹名称。" }, { status: 400 });
    }

    throw error;
  }
}
