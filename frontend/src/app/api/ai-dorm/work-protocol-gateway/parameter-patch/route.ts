import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { buildWorkProtocolCapabilityCatalog } from "@/lib/work-protocol/catalog";
import {
  getWorkProtocolDraftRecord,
  saveWorkProtocolDraftRecord,
  type StoredWorkProtocolGrooming,
  type WorkProtocolDraftRecord,
} from "@/lib/work-protocol/draft-store";
import {
  applyWorkProtocolParameterPatchTransaction,
  type WorkProtocolParameterPatchMode,
  type WorkProtocolParameterPatchResult,
} from "@/lib/work-protocol/parameter-patch";
import {
  listWorkProtocolParameterPatchAudits,
  saveWorkProtocolParameterPatchAudit,
} from "@/lib/work-protocol/parameter-patch-store";
import type { WorkProtocolDraft } from "@/lib/work-protocol/types";
import type { WorkProtocolValidationMode } from "@/lib/work-protocol/validator";

export const runtime = "nodejs";

type ParameterPatchPayload = {
  draft?: WorkProtocolDraft;
  operations?: unknown[];
  mode?: WorkProtocolParameterPatchMode;
  validationMode?: WorkProtocolValidationMode;
  allowMockCapabilities?: boolean;
  allowPlannedCapabilities?: boolean;
  allowDisabledCapabilities?: boolean;
  persistAudit?: boolean;
  commitDraft?: boolean;
  baseGroomedRecordId?: string;
  sourceRecordId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPatchMode(value: unknown): value is WorkProtocolParameterPatchMode {
  return value === "dry_run" || value === "apply";
}

function isValidationMode(value: unknown): value is WorkProtocolValidationMode {
  return value === "draft" || value === "register" || value === "runtime";
}

function buildStoredGroomingFromPatchResult(
  result: WorkProtocolParameterPatchResult,
): StoredWorkProtocolGrooming {
  const summary = result.validation.summary;
  const status: StoredWorkProtocolGrooming["status"] =
    !result.validation.valid || summary.errors > 0
      ? "invalid"
      : summary.warnings > 0
        ? "groomed_with_issues"
        : "groomed";

  return {
    schemaVersion: "work-protocol-grooming.v0",
    strategy: "deterministic_catalog",
    status,
    catalogHash: result.catalogHash,
    summary: {
      errors: summary.errors,
      warnings: summary.warnings,
      info: summary.info,
      nodes: result.draft.nodes.length,
      edges: result.draft.edges.length,
      departments: result.draft.departments.length,
      compiledNodes: result.draft.nodes.filter((node) => node.compiledSpec)
        .length,
      compiledEdges: result.draft.edges.filter((edge) => edge.compiledSpec)
        .length,
      parameterCodeBlocks: result.parameterCodeBlocks.length,
      canRegister: result.validation.canRegister,
    },
    parameterCodeBlocks: result.parameterCodeBlocks,
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const draftId = url.searchParams.get("draftId") ?? undefined;
  const limitParam = Number(url.searchParams.get("limit") ?? "");
  const records = await listWorkProtocolParameterPatchAudits({
    draftId,
    userId: user.id,
    limit: Number.isFinite(limitParam) ? limitParam : undefined,
  });

  return NextResponse.json({ records });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as
    | ParameterPatchPayload
    | null;

  if (!isRecord(payload?.draft)) {
    return NextResponse.json(
      { message: "Missing work protocol draft." },
      { status: 400 },
    );
  }

  if (!Array.isArray(payload?.operations)) {
    return NextResponse.json(
      { message: "Missing parameter patch operations." },
      { status: 400 },
    );
  }

  const catalog = await buildWorkProtocolCapabilityCatalog(user);
  const mode = isPatchMode(payload.mode) ? payload.mode : "dry_run";

  if (payload.commitDraft === true && mode !== "apply") {
    return NextResponse.json(
      { message: "commitDraft requires apply mode." },
      { status: 400 },
    );
  }

  let baseGroomedRecord: WorkProtocolDraftRecord | null = null;

  if (payload.commitDraft === true) {
    if (typeof payload.baseGroomedRecordId !== "string") {
      return NextResponse.json(
        { message: "commitDraft requires baseGroomedRecordId." },
        { status: 400 },
      );
    }

    baseGroomedRecord = await getWorkProtocolDraftRecord(
      payload.baseGroomedRecordId,
    );

    if (!baseGroomedRecord || baseGroomedRecord.savedBy !== user.id) {
      return NextResponse.json(
        { message: "Base groomed draft record not found." },
        { status: 404 },
      );
    }

    if (
      baseGroomedRecord.kind !== "groomed" ||
      baseGroomedRecord.draftId !== payload.draft.id
    ) {
      return NextResponse.json(
        { message: "Base draft record must be a groomed version of this draft." },
        { status: 400 },
      );
    }
  }

  const result = applyWorkProtocolParameterPatchTransaction({
    draft: payload.draft,
    catalog,
    operations: payload.operations,
    options: {
      mode,
      validationMode: isValidationMode(payload.validationMode)
        ? payload.validationMode
        : "register",
      allowMockCapabilities: payload.allowMockCapabilities,
      allowPlannedCapabilities: payload.allowPlannedCapabilities,
      allowDisabledCapabilities: payload.allowDisabledCapabilities,
    },
  });
  const sourceRecordId =
    typeof payload.sourceRecordId === "string"
      ? payload.sourceRecordId
      : baseGroomedRecord?.sourceRecordId;
  const committedDraftRecord =
    payload.commitDraft === true && result.status === "applied"
      ? (
          await saveWorkProtocolDraftRecord({
            draft: {
              ...result.draft,
              updatedAt: new Date().toISOString(),
            },
            kind: "groomed",
            savedBy: user.id,
            sourceRecordId,
            storedGrooming: buildStoredGroomingFromPatchResult(result),
            catalogHash: catalog.catalogHash,
          })
        ).record
      : undefined;
  const shouldPersistAudit =
    payload.persistAudit === true || payload.commitDraft === true;
  const auditRecord =
    shouldPersistAudit
      ? await saveWorkProtocolParameterPatchAudit({
          draft: payload.draft,
          operations: payload.operations,
          result,
          userId: user.id,
          catalogHash: catalog.catalogHash,
          commitRequested: payload.commitDraft,
          baseDraftRecordId: baseGroomedRecord?.id,
          sourceRecordId,
          committedDraftRecordId: committedDraftRecord?.id,
        })
      : undefined;

  return NextResponse.json({
    result,
    catalogHash: catalog.catalogHash,
    auditRecord,
    committedDraftRecord,
  });
}
