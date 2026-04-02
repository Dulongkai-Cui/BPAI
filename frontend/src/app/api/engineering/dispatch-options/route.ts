import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/server";
import { getEngineeringDispatchOptions } from "@/lib/engineering-team/server";

export async function GET() {
  try {
    await requireCurrentUser();
    const options = await getEngineeringDispatchOptions();
    return NextResponse.json(options);
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
      { message: "加载施工队派单目录失败，请稍后再试。" },
      { status: 500 },
    );
  }
}
