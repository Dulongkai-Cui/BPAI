import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { buildWorkProtocolCapabilityCatalog } from "@/lib/work-protocol/catalog";
import { groomWorkProtocolDraftV0 } from "@/lib/work-protocol/groomer";
import type { WorkProtocolDraft } from "@/lib/work-protocol/types";
import type { WorkProtocolValidationMode } from "@/lib/work-protocol/validator";

export const runtime = "nodejs";

type GroomPayload = {
  draft?: WorkProtocolDraft;
  mode?: WorkProtocolValidationMode;
  allowMockCapabilities?: boolean;
  allowPlannedCapabilities?: boolean;
  allowDisabledCapabilities?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as GroomPayload | null;

  if (!isRecord(payload?.draft)) {
    return NextResponse.json(
      { message: "Missing work protocol draft." },
      { status: 400 },
    );
  }

  const catalog = await buildWorkProtocolCapabilityCatalog(user);
  const result = groomWorkProtocolDraftV0(payload.draft, catalog, {
    mode: payload.mode,
    allowMockCapabilities: payload.allowMockCapabilities,
    allowPlannedCapabilities: payload.allowPlannedCapabilities,
    allowDisabledCapabilities: payload.allowDisabledCapabilities,
  });

  return NextResponse.json({
    result,
    catalogHash: catalog.catalogHash,
  });
}
