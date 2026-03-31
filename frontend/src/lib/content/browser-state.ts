import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/types";
import { mutateAppStore, readAppStore } from "@/lib/auth/server";
import type {
  StoredBrowserFolderIcon,
  StoredBrowserFolderTone,
  StoredBrowserViewMode,
  StoredContentKind,
  StoredSharedWorkspaceBrowserState,
  StoredWorkspaceBoardMessage,
  StoredWorkspaceBrowserState,
} from "@/lib/auth/types";
import {
  mirrorSharedBrowserStateToPostgres,
  mirrorUserBrowserStateToPostgres,
} from "@/lib/db/app-store-write";
import {
  runShadowWrite,
  upsertSharedBrowserStateInRawStore,
  upsertUserBrowserStateInRawStore,
} from "@/lib/store/raw-shadow";

export type BrowserCustomFolderState = {
  id: string;
  name: string;
  description: string;
  tone: StoredBrowserFolderTone;
  icon?: StoredBrowserFolderIcon;
};

export type BrowserInnerFolderState = {
  id: string;
  parentFolderId: string;
  parentInnerFolderId: string | null;
  name: string;
  description: string;
  tone: StoredBrowserFolderTone;
  icon: StoredBrowserFolderIcon;
};

export type BrowserFileState = {
  fileId: string;
  folderId: string;
  subfolderId: string | null;
  titleOverride?: string;
  isTrashed?: boolean;
  isDeleted?: boolean;
  trashedAt?: string;
};

export type BrowserBoardMessageState = {
  id: string;
  folderId: string;
  innerFolderId: string | null;
  authorUserId?: string;
  authorName: string;
  authorRole?: string;
  message: string;
  postedAt: string;
};

export type BrowserLayoutState = {
  activeFolderId: string;
  activeInnerFolderId: string | null;
  folderViewMode: StoredBrowserViewMode;
  deletedFolderIds: string[];
  customFolders: BrowserCustomFolderState[];
  innerFolders: BrowserInnerFolderState[];
  fileStates: BrowserFileState[];
};

export type SharedBrowserLayoutState = {
  deletedFolderIds: string[];
  customFolders: BrowserCustomFolderState[];
  innerFolders: BrowserInnerFolderState[];
  fileStates: BrowserFileState[];
  boardMessages: BrowserBoardMessageState[];
};

function nowIso() {
  return new Date().toISOString();
}

function buildBrowserStateId(kind: StoredContentKind, workspaceId: string, userId: string) {
  return `browser-${kind}-${workspaceId}-${userId}`;
}

function buildSharedBrowserStateId(kind: StoredContentKind, workspaceId: string) {
  return `workspace-browser-${kind}-${workspaceId}`;
}

function emptyBrowserLayoutState(): BrowserLayoutState {
  return {
    activeFolderId: "all",
    activeInnerFolderId: null,
    folderViewMode: "small",
    deletedFolderIds: [],
    customFolders: [],
    innerFolders: [],
    fileStates: [],
  };
}

function emptySharedBrowserLayoutState(): SharedBrowserLayoutState {
  return {
    deletedFolderIds: [],
    customFolders: [],
    innerFolders: [],
    fileStates: [],
    boardMessages: [],
  };
}

function mapCustomFolders(
  folders: Array<{
    id: string;
    name: string;
    description: string;
    tone: StoredBrowserFolderTone;
    icon?: StoredBrowserFolderIcon;
  }>,
) {
  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    description: folder.description,
    tone: folder.tone,
    icon: folder.icon,
  }));
}

function mapInnerFolders(
  folders: Array<{
    id: string;
    parentFolderId: string;
    parentInnerFolderId: string | null;
    name: string;
    description: string;
    tone: StoredBrowserFolderTone;
    icon: StoredBrowserFolderIcon;
  }>,
) {
  return folders.map((folder) => ({
    id: folder.id,
    parentFolderId: folder.parentFolderId,
    parentInnerFolderId: folder.parentInnerFolderId,
    name: folder.name,
    description: folder.description,
    tone: folder.tone,
    icon: folder.icon,
  }));
}

function mapFileStates(
  fileStates: Array<{
    fileId: string;
    folderId: string;
    subfolderId: string | null;
    titleOverride?: string;
    isTrashed?: boolean;
    isDeleted?: boolean;
    trashedAt?: string;
  }>,
) {
  return fileStates.map((fileState) => ({
    fileId: fileState.fileId,
    folderId: fileState.folderId,
    subfolderId: fileState.subfolderId,
    titleOverride: fileState.titleOverride,
    isTrashed: fileState.isTrashed,
    isDeleted: fileState.isDeleted,
    trashedAt: fileState.trashedAt,
  }));
}

function mapBoardMessages(messages: StoredWorkspaceBoardMessage[]): BrowserBoardMessageState[] {
  return messages.map((message) => ({
    id: message.id,
    folderId: message.folderId,
    innerFolderId: message.innerFolderId,
    authorUserId: message.authorUserId,
    authorName: message.authorName,
    authorRole: message.authorRole,
    message: message.message,
    postedAt: message.postedAt,
  }));
}

function serializeSharedBoardMessages(
  messages: BrowserBoardMessageState[],
  existingState: StoredSharedWorkspaceBrowserState | null,
  timestamp: string,
) {
  const existingMessageMap = new Map(
    existingState?.boardMessages.map((message) => [message.id, message]) ?? [],
  );

  return messages.map((message) => ({
    id: message.id,
    folderId: message.folderId,
    innerFolderId: message.innerFolderId,
    authorUserId: message.authorUserId,
    authorName: message.authorName,
    authorRole: message.authorRole,
    message: message.message,
    postedAt: message.postedAt,
    createdAt: existingMessageMap.get(message.id)?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }));
}

export async function getBrowserStateForUser(
  user: AuthenticatedUser,
  kind: StoredContentKind,
  options?: {
    workspaceId?: string;
  },
) {
  const store = await readAppStore();
  const workspaceId = options?.workspaceId ?? user.workspaceId;
  const state =
    store.browserStates.find(
      (item) =>
        item.kind === kind &&
        item.workspaceId === workspaceId &&
        item.ownerUserId === user.id,
    ) ?? null;

  if (!state) {
    return emptyBrowserLayoutState();
  }

  return {
    activeFolderId: state.activeFolderId ?? "all",
    activeInnerFolderId: state.activeInnerFolderId ?? null,
    folderViewMode: state.folderViewMode ?? "small",
    deletedFolderIds: Array.isArray(state.deletedFolderIds) ? state.deletedFolderIds : [],
    customFolders: mapCustomFolders(state.customFolders),
    innerFolders: mapInnerFolders(state.innerFolders),
    fileStates: mapFileStates(state.fileStates),
  };
}

export async function getSharedBrowserStateForWorkspace(
  workspaceId: string,
  kind: StoredContentKind,
) {
  const store = await readAppStore();
  const state =
    store.workspaceBrowserStates.find(
      (item) => item.kind === kind && item.workspaceId === workspaceId,
    ) ?? null;

  if (!state) {
    return emptySharedBrowserLayoutState();
  }

  return {
    deletedFolderIds: Array.isArray(state.deletedFolderIds) ? state.deletedFolderIds : [],
    customFolders: mapCustomFolders(state.customFolders),
    innerFolders: mapInnerFolders(state.innerFolders),
    fileStates: mapFileStates(state.fileStates),
    boardMessages: mapBoardMessages(state.boardMessages),
  };
}

export async function saveBrowserStateForUser(params: {
  user: AuthenticatedUser;
  kind: StoredContentKind;
  state: BrowserLayoutState;
  workspaceId?: string;
}) {
  const { user, kind, state } = params;
  const workspaceId = params.workspaceId ?? user.workspaceId;
  const timestamp = nowIso();
  const stateId = buildBrowserStateId(kind, workspaceId, user.id);
  const store = await readAppStore();
  const existingState = store.browserStates.find((item) => item.id === stateId) ?? null;
  const existingCustomFolderMap = new Map(
    existingState?.customFolders.map((folder) => [folder.id, folder]) ?? [],
  );
  const existingInnerFolderMap = new Map(
    existingState?.innerFolders.map((folder) => [folder.id, folder]) ?? [],
  );
  const existingFileStateMap = new Map(
    existingState?.fileStates.map((fileState) => [fileState.fileId, fileState]) ?? [],
  );
  const nextState: StoredWorkspaceBrowserState = {
    id: stateId,
    kind,
    ownerUserId: user.id,
    workspaceId,
    activeFolderId: state.activeFolderId,
    activeInnerFolderId: state.activeInnerFolderId,
    folderViewMode: state.folderViewMode,
    deletedFolderIds: state.deletedFolderIds,
    customFolders: state.customFolders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      description: folder.description,
      tone: folder.tone,
      icon: folder.icon,
      createdAt: existingCustomFolderMap.get(folder.id)?.createdAt ?? timestamp,
      updatedAt: timestamp,
    })),
    innerFolders: state.innerFolders.map((folder) => ({
      id: folder.id,
      parentFolderId: folder.parentFolderId,
      parentInnerFolderId: folder.parentInnerFolderId,
      name: folder.name,
      description: folder.description,
      tone: folder.tone,
      icon: folder.icon,
      createdAt: existingInnerFolderMap.get(folder.id)?.createdAt ?? timestamp,
      updatedAt: timestamp,
    })),
    fileStates: state.fileStates.map((fileState) => ({
      fileId: fileState.fileId,
      folderId: fileState.folderId,
      subfolderId: fileState.subfolderId,
      titleOverride: fileState.titleOverride,
      isTrashed: fileState.isTrashed,
      isDeleted: fileState.isDeleted,
      trashedAt: fileState.trashedAt,
      updatedAt: existingFileStateMap.get(fileState.fileId)?.updatedAt ?? timestamp,
    })),
    createdAt: existingState?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  await mirrorUserBrowserStateToPostgres(nextState);

  void runShadowWrite("user-browser-state-upsert-shadow", async () => {
    await mutateAppStore((store) => ({
      store: upsertUserBrowserStateInRawStore(store, nextState),
      result: undefined,
    }));
  });

  return nextState;
}

export async function saveSharedBrowserStateForWorkspace(params: {
  kind: StoredContentKind;
  workspaceId: string;
  state: SharedBrowserLayoutState;
}) {
  const { kind, workspaceId, state } = params;
  const timestamp = nowIso();
  const stateId = buildSharedBrowserStateId(kind, workspaceId);
  const store = await readAppStore();
  const existingState =
    store.workspaceBrowserStates.find((item) => item.id === stateId) ?? null;
  const existingCustomFolderMap = new Map(
    existingState?.customFolders.map((folder) => [folder.id, folder]) ?? [],
  );
  const existingInnerFolderMap = new Map(
    existingState?.innerFolders.map((folder) => [folder.id, folder]) ?? [],
  );
  const existingFileStateMap = new Map(
    existingState?.fileStates.map((fileState) => [fileState.fileId, fileState]) ?? [],
  );

  const nextState: StoredSharedWorkspaceBrowserState = {
    id: stateId,
    kind,
    workspaceId,
    deletedFolderIds: state.deletedFolderIds,
    customFolders: state.customFolders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      description: folder.description,
      tone: folder.tone,
      icon: folder.icon,
      createdAt: existingCustomFolderMap.get(folder.id)?.createdAt ?? timestamp,
      updatedAt: timestamp,
    })),
    innerFolders: state.innerFolders.map((folder) => ({
      id: folder.id,
      parentFolderId: folder.parentFolderId,
      parentInnerFolderId: folder.parentInnerFolderId,
      name: folder.name,
      description: folder.description,
      tone: folder.tone,
      icon: folder.icon,
      createdAt: existingInnerFolderMap.get(folder.id)?.createdAt ?? timestamp,
      updatedAt: timestamp,
    })),
    fileStates: state.fileStates.map((fileState) => ({
      fileId: fileState.fileId,
      folderId: fileState.folderId,
      subfolderId: fileState.subfolderId,
      titleOverride: fileState.titleOverride,
      isTrashed: fileState.isTrashed,
      isDeleted: fileState.isDeleted,
      trashedAt: fileState.trashedAt,
      updatedAt: existingFileStateMap.get(fileState.fileId)?.updatedAt ?? timestamp,
    })),
    boardMessages: serializeSharedBoardMessages(
      state.boardMessages,
      existingState,
      timestamp,
    ),
    createdAt: existingState?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  await mirrorSharedBrowserStateToPostgres(nextState);

  void runShadowWrite("shared-browser-state-upsert-shadow", async () => {
    await mutateAppStore((store) => ({
      store: upsertSharedBrowserStateInRawStore(store, nextState),
      result: undefined,
    }));
  });

  return nextState;
}

export async function finalizeTrashedBrowserFilesForUser(params: {
  user: AuthenticatedUser;
  kind: StoredContentKind;
  removedAssetFileIds?: string[];
  workspaceId?: string;
}) {
  const { user, kind, removedAssetFileIds = [] } = params;
  const workspaceId = params.workspaceId ?? user.workspaceId;
  const timestamp = nowIso();
  const stateId = buildBrowserStateId(kind, workspaceId, user.id);
  const removedAssetIds = new Set(removedAssetFileIds);
  const store = await readAppStore();
  const existingState = store.browserStates.find((item) => item.id === stateId) ?? null;

  if (!existingState) {
    return null;
  }

  const nextFileStates = existingState.fileStates.flatMap((fileState) => {
    if (removedAssetIds.has(fileState.fileId)) {
      return [];
    }

    if (!fileState.isTrashed) {
      return [fileState];
    }

    return [
      {
        ...fileState,
        isTrashed: false,
        isDeleted: true,
        updatedAt: timestamp,
      },
    ];
  });

  const nextState: StoredWorkspaceBrowserState = {
    ...existingState,
    fileStates: nextFileStates,
    updatedAt: timestamp,
  };

  await mirrorUserBrowserStateToPostgres(nextState);

  void runShadowWrite("user-browser-state-finalize-trash-shadow", async () => {
    await mutateAppStore((store) => ({
      store: upsertUserBrowserStateInRawStore(store, nextState),
      result: undefined,
    }));
  });

  return nextState;
}

export async function setBrowserFileLifecycleForUser(params: {
  user: AuthenticatedUser;
  kind: StoredContentKind;
  fileId: string;
  action: "trash" | "restore";
  folderId?: string;
  subfolderId?: string | null;
  titleOverride?: string;
  workspaceId?: string;
}) {
  const { user, kind, fileId, action, folderId, subfolderId, titleOverride } = params;
  const workspaceId = params.workspaceId ?? user.workspaceId;
  const timestamp = nowIso();
  const stateId = buildBrowserStateId(kind, workspaceId, user.id);
  const store = await readAppStore();
  const existingState = store.browserStates.find((item) => item.id === stateId) ?? null;
  const existingFileState =
    existingState?.fileStates.find((fileState) => fileState.fileId === fileId) ?? null;

  if (action === "restore" && !existingFileState) {
    return existingState;
  }

  const nextFileState = {
    fileId,
    folderId: folderId ?? existingFileState?.folderId ?? "all",
    subfolderId:
      subfolderId !== undefined ? subfolderId : (existingFileState?.subfolderId ?? null),
    titleOverride:
      titleOverride !== undefined ? titleOverride : existingFileState?.titleOverride,
    isTrashed: action === "trash",
    isDeleted: false,
    trashedAt: action === "trash" ? timestamp : undefined,
    updatedAt: timestamp,
  };

  const baseState: StoredWorkspaceBrowserState =
    existingState ?? {
      id: stateId,
      kind,
      ownerUserId: user.id,
      workspaceId,
      activeFolderId: "all",
      activeInnerFolderId: null,
      folderViewMode: "small",
      deletedFolderIds: [],
      customFolders: [],
      innerFolders: [],
      fileStates: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

  const hasExistingFileState = baseState.fileStates.some(
    (fileState) => fileState.fileId === fileId,
  );
  const nextFileStates = hasExistingFileState
    ? baseState.fileStates.map((fileState) =>
        fileState.fileId === fileId ? nextFileState : fileState,
      )
    : [...baseState.fileStates, nextFileState];

  const nextState: StoredWorkspaceBrowserState = {
    ...baseState,
    fileStates: nextFileStates,
    updatedAt: timestamp,
  };

  await mirrorUserBrowserStateToPostgres(nextState);

  void runShadowWrite("user-browser-state-file-lifecycle-shadow", async () => {
    await mutateAppStore((store) => ({
      store: upsertUserBrowserStateInRawStore(store, nextState),
      result: undefined,
    }));
  });

  return nextState;
}

export async function setBrowserFileLifecycleForWorkspace(params: {
  kind: StoredContentKind;
  workspaceId: string;
  fileId: string;
  action: "trash" | "restore";
  folderId?: string;
  subfolderId?: string | null;
  titleOverride?: string;
}) {
  const { kind, workspaceId, fileId, action, folderId, subfolderId, titleOverride } =
    params;
  const timestamp = nowIso();
  const stateId = buildSharedBrowserStateId(kind, workspaceId);
  const store = await readAppStore();
  const existingState =
    store.workspaceBrowserStates.find((item) => item.id === stateId) ?? null;
  const existingFileState =
    existingState?.fileStates.find((fileState) => fileState.fileId === fileId) ?? null;

  if (action === "restore" && !existingFileState) {
    return existingState;
  }

  const nextFileState = {
    fileId,
    folderId: folderId ?? existingFileState?.folderId ?? "all",
    subfolderId:
      subfolderId !== undefined ? subfolderId : (existingFileState?.subfolderId ?? null),
    titleOverride:
      titleOverride !== undefined ? titleOverride : existingFileState?.titleOverride,
    isTrashed: action === "trash",
    isDeleted: false,
    trashedAt: action === "trash" ? timestamp : undefined,
    updatedAt: timestamp,
  };

  const baseState: StoredSharedWorkspaceBrowserState =
    existingState ?? {
      id: stateId,
      kind,
      workspaceId,
      deletedFolderIds: [],
      customFolders: [],
      innerFolders: [],
      fileStates: [],
      boardMessages: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

  const hasExistingFileState = baseState.fileStates.some(
    (fileState) => fileState.fileId === fileId,
  );
  const nextFileStates = hasExistingFileState
    ? baseState.fileStates.map((fileState) =>
        fileState.fileId === fileId ? nextFileState : fileState,
      )
    : [...baseState.fileStates, nextFileState];

  const nextState: StoredSharedWorkspaceBrowserState = {
    ...baseState,
    fileStates: nextFileStates,
    updatedAt: timestamp,
  };

  await mirrorSharedBrowserStateToPostgres(nextState);

  void runShadowWrite("shared-browser-state-file-lifecycle-shadow", async () => {
    await mutateAppStore((store) => ({
      store: upsertSharedBrowserStateInRawStore(store, nextState),
      result: undefined,
    }));
  });

  return nextState;
}
