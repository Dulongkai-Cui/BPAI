import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import {
  type BrowserBoardMessageState,
  type BrowserCustomFolderState,
  type BrowserFileState,
  type BrowserInnerFolderState,
  saveSharedBrowserStateForWorkspace,
  saveBrowserStateForUser,
} from "@/lib/content/browser-state";
import type {
  StoredContentKind,
  StoredBrowserViewMode,
} from "@/lib/auth/types";

type BrowserStatePayload = {
  kind: StoredContentKind;
  workspaceId?: string;
  shareMode?: "personal" | "workspace";
  activeFolderId: string;
  activeInnerFolderId: string | null;
  folderViewMode: StoredBrowserViewMode;
  deletedFolderIds: string[];
  customFolders: BrowserCustomFolderState[];
  innerFolders: BrowserInnerFolderState[];
  fileStates: BrowserFileState[];
  boardMessages?: BrowserBoardMessageState[];
};

function isContentKind(value: unknown): value is StoredContentKind {
  return value === "document" || value === "sheet" || value === "slide";
}

function isBrowserViewMode(value: unknown): value is StoredBrowserViewMode {
  return value === "small" || value === "medium" || value === "large" || value === "list";
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isStringArraySafe(value: unknown) {
  return Array.isArray(value);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as BrowserStatePayload | null;

  if (
    !payload ||
    !isContentKind(payload.kind) ||
    typeof payload.activeFolderId !== "string" ||
    !isNullableString(payload.activeInnerFolderId) ||
    !isBrowserViewMode(payload.folderViewMode) ||
    !isStringArraySafe(payload.deletedFolderIds) ||
    !isStringArraySafe(payload.customFolders) ||
    !isStringArraySafe(payload.innerFolders) ||
    !isStringArraySafe(payload.fileStates) ||
    (payload.boardMessages !== undefined && !isStringArraySafe(payload.boardMessages))
  ) {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  const workspaceId =
    typeof payload.workspaceId === "string" && payload.workspaceId.trim()
      ? payload.workspaceId.trim()
      : undefined;

  if (payload.shareMode === "workspace" && workspaceId) {
    await saveSharedBrowserStateForWorkspace({
      kind: payload.kind,
      workspaceId,
      state: {
        deletedFolderIds: payload.deletedFolderIds,
        customFolders: payload.customFolders,
        innerFolders: payload.innerFolders,
        fileStates: payload.fileStates,
        boardMessages: payload.boardMessages ?? [],
      },
    });
  } else {
    await saveBrowserStateForUser({
      user,
      kind: payload.kind,
      workspaceId,
      state: {
        activeFolderId: payload.activeFolderId,
        activeInnerFolderId: payload.activeInnerFolderId,
        folderViewMode: payload.folderViewMode,
        deletedFolderIds: payload.deletedFolderIds,
        customFolders: payload.customFolders,
        innerFolders: payload.innerFolders,
        fileStates: payload.fileStates,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
