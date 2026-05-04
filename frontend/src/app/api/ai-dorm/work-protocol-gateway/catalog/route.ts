import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import {
  buildWorkProtocolCapabilityCatalog,
  summarizeWorkProtocolCapabilityCatalog,
} from "@/lib/work-protocol/catalog";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const catalog = await buildWorkProtocolCapabilityCatalog(user);

  return NextResponse.json({
    catalog,
    counts: summarizeWorkProtocolCapabilityCatalog(catalog),
  });
}
