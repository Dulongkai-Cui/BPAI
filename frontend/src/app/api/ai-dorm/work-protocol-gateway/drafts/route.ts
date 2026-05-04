import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import {
  getWorkProtocolDraftRecords,
  saveWorkProtocolDraftRecord,
} from "@/lib/work-protocol/draft-store";
import type { WorkProtocolGroomingResult } from "@/lib/work-protocol/groomer";
import type {
  WorkProtocolDraft,
  WorkProtocolDraftRecordKind,
} from "@/lib/work-protocol/types";

export const runtime = "nodejs";

type SaveDraftPayload = {
  draft?: WorkProtocolDraft;
  kind?: WorkProtocolDraftRecordKind;
  sourceRecordId?: string;
  groomingResult?: WorkProtocolGroomingResult;
  catalogHash?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isDraftKind(value: unknown): value is WorkProtocolDraftRecordKind {
  return value === "source" || value === "groomed";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const draftId = url.searchParams.get("draftId") ?? undefined;
  const kindParam = url.searchParams.get("kind");
  const kind = isDraftKind(kindParam) ? kindParam : undefined;
  const records = await getWorkProtocolDraftRecords({ draftId, kind });

  return NextResponse.json({ records });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as SaveDraftPayload | null;

  if (!isRecord(payload?.draft)) {
    return NextResponse.json(
      { message: "Missing work protocol draft." },
      { status: 400 },
    );
  }

  const kind = isDraftKind(payload.kind) ? payload.kind : "source";
  const result = await saveWorkProtocolDraftRecord({
    draft: payload.draft,
    kind,
    savedBy: user.id,
    sourceRecordId:
      typeof payload.sourceRecordId === "string"
        ? payload.sourceRecordId
        : undefined,
    groomingResult: isRecord(payload.groomingResult)
      ? payload.groomingResult
      : undefined,
    catalogHash:
      typeof payload.catalogHash === "string" ? payload.catalogHash : undefined,
  });

  return NextResponse.json(result);
}
