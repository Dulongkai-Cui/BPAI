import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { buildOpenClawLaunchUrl } from "@/lib/ai-dorm/openclaw";

type OpenClawLaunchRouteProps = {
  params: Promise<{
    agentId: string;
  }>;
};

export async function GET(
  request: Request,
  { params }: OpenClawLaunchRouteProps,
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { agentId } = await params;
  const target = buildOpenClawLaunchUrl(agentId);

  if (!target) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  return NextResponse.redirect(target);
}
