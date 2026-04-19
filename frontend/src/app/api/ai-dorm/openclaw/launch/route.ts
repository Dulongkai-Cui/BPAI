import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { buildOpenClawLaunchUrl } from "@/lib/ai-dorm/openclaw";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.redirect(
    buildOpenClawLaunchUrl("work-order-longxia")!,
  );
}
