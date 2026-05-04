import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { WorkProtocolParameterCodeBlock } from "@/lib/work-protocol/compiler";
import type { WorkProtocolGroomingResult } from "@/lib/work-protocol/groomer";
import type {
  WorkProtocolDraft,
  WorkProtocolDraftRecordKind,
} from "@/lib/work-protocol/types";

export type StoredWorkProtocolGrooming = {
  schemaVersion: WorkProtocolGroomingResult["schemaVersion"];
  strategy: WorkProtocolGroomingResult["strategy"];
  status: WorkProtocolGroomingResult["status"];
  catalogHash?: string;
  summary: WorkProtocolGroomingResult["summary"];
  parameterCodeBlocks: WorkProtocolParameterCodeBlock[];
};

export type WorkProtocolDraftRecord = {
  id: string;
  draftId: string;
  kind: WorkProtocolDraftRecordKind;
  name: string;
  draft: WorkProtocolDraft;
  sourceRecordId?: string;
  grooming?: StoredWorkProtocolGrooming;
  savedBy: string;
  createdAt: string;
  updatedAt: string;
};

type DraftStoreFile = {
  records?: WorkProtocolDraftRecord[];
};

const DRAFT_STORE_ROOT = path.join(
  process.cwd(),
  ".bpai",
  "work-protocol-gateway",
);
const DRAFT_STORE_PATH = path.join(DRAFT_STORE_ROOT, "draft-records.json");

async function ensureDraftStoreDir() {
  await mkdir(DRAFT_STORE_ROOT, { recursive: true });
}

async function readDraftStoreFile(): Promise<DraftStoreFile> {
  await ensureDraftStoreDir();

  const raw = await readFile(DRAFT_STORE_PATH, "utf8").catch(() => "");

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as DraftStoreFile;
  } catch {
    return {};
  }
}

async function writeDraftStoreFile(store: DraftStoreFile) {
  await ensureDraftStoreDir();

  const tempPath = `${DRAFT_STORE_PATH}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await rename(tempPath, DRAFT_STORE_PATH);
}

function sortRecords(records: WorkProtocolDraftRecord[]) {
  return [...records].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function buildRecordId(kind: WorkProtocolDraftRecordKind, draftId: string) {
  return `draft-record:${kind}:${draftId}:${Date.now()}`;
}

function buildStoredGrooming(params: {
  groomingResult?: WorkProtocolGroomingResult;
  catalogHash?: string;
}): StoredWorkProtocolGrooming | undefined {
  if (!params.groomingResult) {
    return undefined;
  }

  return {
    schemaVersion: params.groomingResult.schemaVersion,
    strategy: params.groomingResult.strategy,
    status: params.groomingResult.status,
    catalogHash: params.catalogHash,
    summary: params.groomingResult.summary,
    parameterCodeBlocks: params.groomingResult.parameterCodeBlocks,
  };
}

export async function getWorkProtocolDraftRecords(params?: {
  draftId?: string;
  kind?: WorkProtocolDraftRecordKind;
}) {
  const store = await readDraftStoreFile();
  const records = store.records ?? [];

  return sortRecords(
    records.filter((record) => {
      if (params?.draftId && record.draftId !== params.draftId) {
        return false;
      }

      if (params?.kind && record.kind !== params.kind) {
        return false;
      }

      return true;
    }),
  );
}

export async function getWorkProtocolDraftRecord(recordId: string) {
  const store = await readDraftStoreFile();
  return (store.records ?? []).find((record) => record.id === recordId) ?? null;
}

export async function saveWorkProtocolDraftRecord(params: {
  draft: WorkProtocolDraft;
  kind: WorkProtocolDraftRecordKind;
  savedBy: string;
  sourceRecordId?: string;
  groomingResult?: WorkProtocolGroomingResult;
  storedGrooming?: StoredWorkProtocolGrooming;
  catalogHash?: string;
}) {
  const store = await readDraftStoreFile();
  const records = store.records ?? [];
  const now = new Date().toISOString();
  const record: WorkProtocolDraftRecord = {
    id: buildRecordId(params.kind, params.draft.id),
    draftId: params.draft.id,
    kind: params.kind,
    name: params.draft.name,
    draft: params.draft,
    sourceRecordId: params.sourceRecordId,
    grooming:
      params.storedGrooming ??
      buildStoredGrooming({
        groomingResult: params.groomingResult,
        catalogHash: params.catalogHash,
      }),
    savedBy: params.savedBy,
    createdAt: now,
    updatedAt: now,
  };
  const nextRecords = sortRecords([...records, record]);

  await writeDraftStoreFile({ records: nextRecords });

  return {
    record,
    records: nextRecords,
  };
}
