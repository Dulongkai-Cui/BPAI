import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { mutateAppStore, readAppStore } from "@/lib/auth/server";
import type { StoredContentAsset } from "@/lib/auth/types";
import { deleteAssetsFromPostgres, mirrorAssetToPostgres } from "@/lib/db/app-store-write";
import {
  deleteAssetsFromRawStore,
  runShadowWrite,
  upsertAssetInRawStore,
} from "@/lib/store/raw-shadow";
import { getDocumentById, getSheetById } from "@/lib/docs/mock-data";

export type ContentKind = "document" | "sheet" | "slide";
type AssetTrashMode = "active" | "trashed" | "all";

const STORAGE_ROOT = path.join(process.cwd(), ".bpai", "storage");
const ONLYOFFICE_SAMPLE_ROOT = path.join(process.cwd(), "public", "onlyoffice");

function getCollectionKey(kind: ContentKind) {
  if (kind === "document") {
    return "documents";
  }

  if (kind === "sheet") {
    return "sheets";
  }

  return "slides";
}

function getFileExtension(fileName: string) {
  const extension = path.extname(fileName).replace(".", "").toLowerCase();
  return extension || (fileName.toLowerCase().endsWith(".csv") ? "csv" : "");
}

function nowIso() {
  return new Date().toISOString();
}

function ensureKindFromUnknown(value: string): ContentKind | null {
  if (value === "document" || value === "sheet" || value === "slide") {
    return value;
  }

  return null;
}

function getMimeTypeFromExtension(extension: string, fallback?: string) {
  if (fallback) {
    return fallback;
  }

  switch (extension) {
    case "dwg":
      return "image/vnd.dwg";
    case "dxf":
      return "image/vnd.dxf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "csv":
      return "text/csv; charset=utf-8";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "pps":
      return "application/vnd.ms-powerpoint";
    case "ppsx":
      return "application/vnd.openxmlformats-officedocument.presentationml.slideshow";
    case "odp":
      return "application/vnd.oasis.opendocument.presentation";
    case "txt":
      return "text/plain; charset=utf-8";
    case "md":
      return "text/markdown; charset=utf-8";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

function getAssetOpenPath(kind: ContentKind, assetId: string) {
  return `/docs/documents/${assetId}`;
}

function getAssetContentPath(kind: ContentKind, assetId: string) {
  return `/api/assets/${kind}/${assetId}/content`;
}

function getOnlyOfficeBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_ONLYOFFICE_FILE_BASE_URL ?? "http://bpai-front-dev:3000"
  );
}

function toStoredPath(relativePath: string) {
  return path.join(STORAGE_ROOT, relativePath);
}

function buildStoredAsset(params: {
  kind: ContentKind;
  user: AuthenticatedUser;
  workspaceId: string;
  folderId?: string;
  originalFileName: string;
  title: string;
  mimeType?: string;
  buffer: Buffer;
}) {
  const {
    kind,
    user,
    workspaceId,
    folderId,
    originalFileName,
    title,
    mimeType,
    buffer,
  } = params;
  const extension = getFileExtension(originalFileName);
  const id = `${kind}-${randomBytes(8).toString("hex")}`;
  const storedFileName = extension ? `${id}.${extension}` : id;
  const storedRelativePath = path.posix.join("uploads", user.id, kind, storedFileName);
  const createdAt = nowIso();

  const asset: StoredContentAsset = {
    id,
    kind,
    title,
    ownerUserId: user.id,
    workspaceId,
    folderId: folderId || "recent-uploads",
    originalFileName,
    storedFileName,
    storedRelativePath,
    mimeType: getMimeTypeFromExtension(extension, mimeType),
    sizeBytes: buffer.byteLength,
    createdAt,
    updatedAt: createdAt,
    trashedAt: null,
  };

  return {
    asset,
    absolutePath: toStoredPath(storedRelativePath),
  };
}

async function persistAsset(params: {
  kind: ContentKind;
  user: AuthenticatedUser;
  workspaceId: string;
  folderId?: string;
  originalFileName: string;
  title: string;
  mimeType?: string;
  buffer: Buffer;
}) {
  const { kind, buffer } = params;
  const { asset, absolutePath } = buildStoredAsset(params);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);

  await mirrorAssetToPostgres(asset);
  void runShadowWrite("asset-upsert-shadow", async () => {
    await mutateAppStore((store) => ({
      store: upsertAssetInRawStore(store, asset),
      result: undefined,
    }));
  });

  return {
    asset,
    openPath: getAssetOpenPath(kind, asset.id),
    contentUrl: `${getOnlyOfficeBaseUrl()}${getAssetContentPath(kind, asset.id)}`,
    editorKey: buildOnlyOfficeAssetKey(kind, asset.id),
  };
}

function resolveSampleSource(params: {
  kind: ContentKind;
  assetId: string;
  sampleFileName?: string;
  title?: string;
}) {
  const { kind, assetId, sampleFileName, title } = params;

  if (sampleFileName) {
    return {
      fileName: sampleFileName,
      title: title?.trim() || sampleFileName,
    };
  }

  if (kind === "document") {
    const item = getDocumentById(assetId);
    return {
      fileName: item.fileName ?? "sample.docx",
      title: title?.trim() || item.title,
    };
  }

  if (kind === "sheet") {
    const item = getSheetById(assetId);
    return {
      fileName: item.fileName ?? "sheet-new.xlsx",
      title: title?.trim() || item.title,
    };
  }

  return null;
}

export function buildOnlyOfficeAssetKey(kind: ContentKind, assetId: string) {
  return `bpai-asset-${kind}-${assetId}`;
}

export function parseOnlyOfficeAssetKey(key?: string | null) {
  if (!key) {
    return null;
  }

  const match = /^bpai-asset-(document|sheet|slide)-([a-z0-9-]+)$/i.exec(key);

  if (!match) {
    return null;
  }

  const kind = ensureKindFromUnknown(match[1].toLowerCase());

  if (!kind) {
    return null;
  }

  return {
    kind,
    assetId: match[2],
  };
}

export function formatAssetUpdatedAt(timestamp: string) {
  const date = new Date(timestamp);

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export async function listAssetsForUser(
  user: AuthenticatedUser,
  kind: ContentKind,
  options?: {
    trashMode?: AssetTrashMode;
    workspaceId?: string;
  },
) {
  const store = await readAppStore();
  const collection = store[getCollectionKey(kind)] as StoredContentAsset[];
  const trashMode = options?.trashMode ?? "active";
  // Personal pages should stay scoped to the user's own workspace.
  // Collaboration spaces must opt in by passing an explicit workspaceId.
  const workspaceId = options?.workspaceId ?? user.workspaceId;

  return collection
    .filter(
      (asset) => {
        if (asset.workspaceId !== workspaceId) {
          return false;
        }

        if (trashMode === "all") {
          return true;
        }

        if (trashMode === "trashed") {
          return Boolean(asset.trashedAt);
        }

        return !asset.trashedAt;
      },
    )
    .sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
}

export async function getAssetById(
  kind: ContentKind,
  assetId: string,
  options?: {
    includeTrashed?: boolean;
  },
) {
  const store = await readAppStore();
  const collection = store[getCollectionKey(kind)] as StoredContentAsset[];

  return (
    collection.find(
      (asset) => asset.id === assetId && (options?.includeTrashed ? true : !asset.trashedAt),
    ) ?? null
  );
}

export async function readAssetBinary(kind: ContentKind, assetId: string) {
  const asset = await getAssetById(kind, assetId);

  if (!asset) {
    return null;
  }

  const absolutePath = toStoredPath(asset.storedRelativePath);
  const buffer = await readFile(absolutePath);

  return {
    asset,
    buffer,
    absolutePath,
  };
}

export async function createUploadedAsset(params: {
  kind: ContentKind;
  file: File;
  user: AuthenticatedUser;
  workspaceId?: string;
  folderId?: string;
}) {
  const { kind, file, user } = params;
  const workspaceId = params.workspaceId ?? user.workspaceId;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const originalFileName = file.name || `${kind}-upload`;

  return persistAsset({
    kind,
    user,
    workspaceId,
    folderId: params.folderId,
    originalFileName,
    title: originalFileName,
    mimeType: file.type || undefined,
    buffer,
  });
}

export async function copyAssetToWorkspace(params: {
  kind: ContentKind;
  assetId: string;
  source: "asset" | "sample";
  user: AuthenticatedUser;
  targetWorkspaceId: string;
  sampleFileName?: string;
  title?: string;
}) {
  const { kind, assetId, source, user, targetWorkspaceId, sampleFileName, title } = params;

  if (source === "asset") {
    const asset = await getAssetById(kind, assetId, { includeTrashed: false });

    if (!asset) {
      return null;
    }

    const absolutePath = toStoredPath(asset.storedRelativePath);
    const buffer = await readFile(absolutePath);

    return persistAsset({
      kind,
      user,
      workspaceId: targetWorkspaceId,
      originalFileName: asset.originalFileName,
      title: title?.trim() || asset.title,
      mimeType: asset.mimeType,
      buffer,
    });
  }

  const sampleSource = resolveSampleSource({
    kind,
    assetId,
    sampleFileName,
    title,
  });

  if (!sampleSource) {
    return null;
  }

  const absolutePath = path.join(ONLYOFFICE_SAMPLE_ROOT, sampleSource.fileName);
  const buffer = await readFile(absolutePath).catch(() => null);

  if (!buffer) {
    return null;
  }

  return persistAsset({
    kind,
    user,
    workspaceId: targetWorkspaceId,
    originalFileName: sampleSource.fileName,
    title: sampleSource.title,
    buffer,
  });
}

export async function overwriteAssetTextContent(params: {
  kind: ContentKind;
  assetId: string;
  text: string;
}) {
  const { kind, assetId, text } = params;
  const asset = await getAssetById(kind, assetId);

  if (!asset) {
    return null;
  }

  const absolutePath = toStoredPath(asset.storedRelativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const buffer = Buffer.from(text, "utf8");
  await writeFile(absolutePath, buffer);

  const nextAsset: StoredContentAsset = {
    ...asset,
    sizeBytes: buffer.byteLength,
    updatedAt: nowIso(),
  };
  await mirrorAssetToPostgres(nextAsset);
  void runShadowWrite("asset-overwrite-text-shadow", async () => {
    await mutateAppStore((store) => ({
      store: upsertAssetInRawStore(store, nextAsset),
      result: undefined,
    }));
  });

  return nextAsset;
}

export async function overwriteAssetBinary(
  kind: ContentKind,
  assetId: string,
  buffer: Buffer,
) {
  const asset = await getAssetById(kind, assetId);

  if (!asset) {
    return null;
  }

  const absolutePath = toStoredPath(asset.storedRelativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);

  const nextAsset: StoredContentAsset = {
    ...asset,
    sizeBytes: buffer.byteLength,
    updatedAt: nowIso(),
  };
  await mirrorAssetToPostgres(nextAsset);
  void runShadowWrite("asset-overwrite-shadow", async () => {
    await mutateAppStore((store) => ({
      store: upsertAssetInRawStore(store, nextAsset),
      result: undefined,
    }));
  });

  return nextAsset;
}

export async function moveAssetToTrash(params: {
  kind: ContentKind;
  assetId: string;
  user: AuthenticatedUser;
  workspaceId?: string;
}) {
  const { kind, assetId, user } = params;
  const workspaceId = params.workspaceId ?? user.workspaceId;
  const timestamp = nowIso();
  const asset = await getAssetById(kind, assetId, { includeTrashed: false });

  if (!asset || asset.workspaceId !== workspaceId || asset.trashedAt) {
    return null;
  }

  const nextAsset: StoredContentAsset = {
    ...asset,
    trashedAt: timestamp,
    updatedAt: timestamp,
  };
  await mirrorAssetToPostgres(nextAsset);
  void runShadowWrite("asset-trash-shadow", async () => {
    await mutateAppStore((store) => ({
      store: upsertAssetInRawStore(store, nextAsset),
      result: undefined,
    }));
  });

  return nextAsset;
}

export async function clearTrashedAssetsForUser(
  user: AuthenticatedUser,
  workspaceId: string = user.workspaceId,
) {
  const store = await readAppStore();
  const removedAssets = [
    ...store.documents.filter((asset) => asset.trashedAt && asset.workspaceId === workspaceId),
    ...store.sheets.filter((asset) => asset.trashedAt && asset.workspaceId === workspaceId),
    ...store.slides.filter((asset) => asset.trashedAt && asset.workspaceId === workspaceId),
  ];
  const removedIds = new Set(removedAssets.map((asset) => asset.id));

  await Promise.all(
    removedAssets.map((asset) =>
      unlink(toStoredPath(asset.storedRelativePath)).catch(() => undefined),
    ),
  );

  await deleteAssetsFromPostgres(removedAssets.map((asset) => asset.id));
  void runShadowWrite("asset-delete-many-shadow", async () => {
    await mutateAppStore((rawStore) => ({
      store: deleteAssetsFromRawStore(rawStore, [...removedIds]),
      result: undefined,
    }));
  });

  return removedAssets;
}

export async function restoreAssetFromTrash(params: {
  kind: ContentKind;
  assetId: string;
  user: AuthenticatedUser;
  workspaceId?: string;
}) {
  const { kind, assetId, user } = params;
  const workspaceId = params.workspaceId ?? user.workspaceId;
  const timestamp = nowIso();
  const asset = await getAssetById(kind, assetId, { includeTrashed: true });

  if (!asset || asset.workspaceId !== workspaceId || !asset.trashedAt) {
    return null;
  }

  const nextAsset: StoredContentAsset = {
    ...asset,
    trashedAt: null,
    updatedAt: timestamp,
  };
  await mirrorAssetToPostgres(nextAsset);
  void runShadowWrite("asset-restore-shadow", async () => {
    await mutateAppStore((store) => ({
      store: upsertAssetInRawStore(store, nextAsset),
      result: undefined,
    }));
  });

  return nextAsset;
}
