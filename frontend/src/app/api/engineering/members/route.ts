import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/server";
import { listEngineeringMembers } from "@/lib/engineering-team/server";

export async function GET() {
  try {
    await requireCurrentUser();
    const members = await listEngineeringMembers();
    return NextResponse.json({ members });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      error.message === "Unauthorized"
    ) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json(
      { message: "加载工程队成员失败，请稍后再试。" },
      { status: 500 },
    );
  }
}
