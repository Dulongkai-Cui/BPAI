import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  WorkProtocolParameterPatchResult,
} from "@/lib/work-protocol/parameter-patch";
import type { WorkProtocolDraft } from "@/lib/work-protocol/types";

export type WorkProtocolParameterPatchAuditRecord = {
  schemaVersion: "work-protocol-parameter-patch-audit.v1";
  id: string;
  draftId: string;
  draftName: string;
  mode: WorkProtocolParameterPatchResult["mode"];
  status: WorkProtocolParameterPatchResult["status"];
  operationCount: number;
  appliedChangeCount: number;
  rejectedChangeCount: number;
  preflightIssueCount: number;
  catalogHash?: string;
  commitRequested: boolean;
  commitStatus: "not_requested" | "skipped" | "committed";
  baseDraftRecordId?: string;
  sourceRecordId?: string;
  committedDraftRecordId?: string;
  operations: unknown[];
  result: WorkProtocolParameterPatchResult;
  createdByUserId: string;
  createdAt: string;
};

type ParameterPatchAuditStore = {
  records?: WorkProtocolParameterPatchAuditRecord[];
};

const PATCH_AUDIT_ROOT = path.join(
  process.cwd(),
  ".bpai",
  "work-protocol-gateway",
);
const PATCH_AUDIT_PATH = path.join(
  PATCH_AUDIT_ROOT,
  "parameter-patch-transactions.json",
);
const MAX_STORED_PATCH_AUDITS = 200;

function buildPatchAuditId(draftId: string) {
  return `patch-audit:${draftId}:${Date.now().toString(36)}:${randomBytes(4).toString("hex")}`;
}

async function ensurePatchAuditDir() {
  await mkdir(PATCH_AUDIT_ROOT, { recursive: true });
}

async function readPatchAuditStore(): Promise<ParameterPatchAuditStore> {
  await ensurePatchAuditDir();

  const raw = await readFile(PATCH_AUDIT_PATH, "utf8").catch(() => "");

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as ParameterPatchAuditStore;
  } catch {
    return {};
  }
}

async function writePatchAuditStore(store: ParameterPatchAuditStore) {
  await ensurePatchAuditDir();

  const tempPath = `${PATCH_AUDIT_PATH}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await rename(tempPath, PATCH_AUDIT_PATH);
}

function sortPatchAuditRecords(records: WorkProtocolParameterPatchAuditRecord[]) {
  return [...records].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function trimPatchAuditRecords(records: WorkProtocolParameterPatchAuditRecord[]) {
  return sortPatchAuditRecords(records).slice(0, MAX_STORED_PATCH_AUDITS);
}

export async function listWorkProtocolParameterPatchAudits(params?: {
  draftId?: string;
  userId?: string;
  limit?: number;
}) {
  const store = await readPatchAuditStore();
  const limit =
    typeof params?.limit === "number" && Number.isFinite(params.limit)
      ? Math.max(1, Math.min(100, Math.floor(params.limit)))
      : 50;

  return sortPatchAuditRecords(
    (store.records ?? []).filter((record) => {
      if (params?.draftId && record.draftId !== params.draftId) {
        return false;
      }

      if (params?.userId && record.createdByUserId !== params.userId) {
        return false;
      }

      return true;
    }),
  ).slice(0, limit);
}

export async function saveWorkProtocolParameterPatchAudit(params: {
  draft: WorkProtocolDraft;
  operations: unknown[];
  result: WorkProtocolParameterPatchResult;
  userId: string;
  catalogHash?: string;
  commitRequested?: boolean;
  baseDraftRecordId?: string;
  sourceRecordId?: string;
  committedDraftRecordId?: string;
}) {
  const store = await readPatchAuditStore();
  const now = new Date().toISOString();
  const record: WorkProtocolParameterPatchAuditRecord = {
    schemaVersion: "work-protocol-parameter-patch-audit.v1",
    id: buildPatchAuditId(params.draft.id),
    draftId: params.draft.id,
    draftName: params.draft.name,
    mode: params.result.mode,
    status: params.result.status,
    operationCount: params.operations.length,
    appliedChangeCount: params.result.appliedChanges.length,
    rejectedChangeCount: params.result.rejectedChanges.length,
    preflightIssueCount: params.result.preflightIssues.length,
    catalogHash: params.catalogHash,
    commitRequested: params.commitRequested === true,
    commitStatus: params.committedDraftRecordId
      ? "committed"
      : params.commitRequested === true
        ? "skipped"
        : "not_requested",
    baseDraftRecordId: params.baseDraftRecordId,
    sourceRecordId: params.sourceRecordId,
    committedDraftRecordId: params.committedDraftRecordId,
    operations: params.operations,
    result: params.result,
    createdByUserId: params.userId,
    createdAt: now,
  };
  const records = trimPatchAuditRecords([...(store.records ?? []), record]);

  await writePatchAuditStore({ records });

  return record;
}
