import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { buildWorkProtocolCapabilityCatalog } from "@/lib/work-protocol/catalog";
import { compileWorkProtocolDraftV0 } from "@/lib/work-protocol/compiler";
import { getWorkProtocolDraftRecord } from "@/lib/work-protocol/draft-store";
import {
  getRegisteredWorkProtocols,
  registerWorkProtocol,
  setRegisteredWorkProtocolEnabled,
} from "@/lib/work-protocol/registry";
import type {
  ProtocolRuntimeMode,
  WorkProtocolDraft,
} from "@/lib/work-protocol/types";

export const runtime = "nodejs";

type RegisterPayload = {
  draft?: WorkProtocolDraft;
  draftRecordId?: string;
  enabled?: boolean;
  priority?: number;
  allowMockCapabilities?: boolean;
  allowPlannedCapabilities?: boolean;
  runtimeMode?: ProtocolRuntimeMode;
};

type TogglePayload = {
  protocolId?: string;
  enabled?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isProtocolRuntimeMode(value: unknown): value is ProtocolRuntimeMode {
  return value === "plan_only" || value === "live";
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const protocols = await getRegisteredWorkProtocols();
  return NextResponse.json({ protocols });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as RegisterPayload | null;

  const draftRecordId =
    typeof payload?.draftRecordId === "string" ? payload.draftRecordId : "";
  const draftRecord = draftRecordId
    ? await getWorkProtocolDraftRecord(draftRecordId)
    : null;
  const draft = draftRecord?.draft ?? (isRecord(payload?.draft) ? payload.draft : null);

  if (draftRecordId && !draftRecord) {
    return NextResponse.json(
      { message: "Work protocol draft record not found." },
      { status: 404 },
    );
  }

  if (draftRecord && draftRecord.kind !== "groomed") {
    return NextResponse.json(
      { message: "Only groomed draft records can be registered." },
      { status: 422 },
    );
  }

  if (!draft) {
    return NextResponse.json(
      { message: "Missing work protocol draft." },
      { status: 400 },
    );
  }

  if (
    payload?.runtimeMode &&
    (!isProtocolRuntimeMode(payload.runtimeMode) ||
      payload.runtimeMode !== "plan_only")
  ) {
    return NextResponse.json(
      { message: "Only plan_only protocol registration is supported now." },
      { status: 400 },
    );
  }

  const catalog = await buildWorkProtocolCapabilityCatalog(user);
  const result = compileWorkProtocolDraftV0(draft, catalog, {
    mode: "register",
    allowMockCapabilities: payload?.allowMockCapabilities ?? true,
    allowPlannedCapabilities: payload?.allowPlannedCapabilities ?? false,
    allowDisabledCapabilities: false,
  });

  if (!result.compiled) {
    return NextResponse.json(
      {
        message: "Work protocol did not pass registration validation.",
        result,
      },
      { status: 422 },
    );
  }

  const registration = await registerWorkProtocol({
    draft: result.draft,
    compiledDefinition: result.compiled,
    registeredBy: user.id,
    enabled: payload?.enabled ?? true,
    priority: payload?.priority,
    runtimeMode: payload?.runtimeMode ?? "plan_only",
    draftRecordId: draftRecord?.id,
    draftKind: draftRecord?.kind,
  });

  return NextResponse.json({
    result,
    registered: registration.registered,
    protocols: registration.protocols,
  });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as TogglePayload | null;
  const protocolId = typeof payload?.protocolId === "string" ? payload.protocolId : "";

  if (!protocolId || typeof payload?.enabled !== "boolean") {
    return NextResponse.json(
      { message: "Missing protocolId or enabled." },
      { status: 400 },
    );
  }

  try {
    const registration = await setRegisteredWorkProtocolEnabled({
      protocolId,
      enabled: payload.enabled,
    });

    return NextResponse.json({
      registered: registration.registered,
      protocols: registration.protocols,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PROTOCOL_NOT_FOUND") {
      return NextResponse.json({ message: "Protocol not found." }, { status: 404 });
    }

    throw error;
  }
}
