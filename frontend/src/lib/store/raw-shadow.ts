import "server-only";

import type {
  AppStore,
  StoredCollaborationSpace,
  StoredCollaborationSpaceMembers,
  StoredContentAsset,
  StoredSession,
  StoredSharedWorkspaceBrowserState,
  StoredWorkspaceBrowserState,
} from "@/lib/auth/types";

function getCollectionKey(kind: StoredContentAsset["kind"]) {
  if (kind === "document") {
    return "documents";
  }

  if (kind === "sheet") {
    return "sheets";
  }

  return "slides";
}

function upsertById<T extends { id: string }>(collection: T[], nextItem: T) {
  const existingIndex = collection.findIndex((item) => item.id === nextItem.id);

  if (existingIndex < 0) {
    return [...collection, nextItem];
  }

  return collection.map((item, index) => (index === existingIndex ? nextItem : item));
}

export async function runShadowWrite(label: string, operation: () => Promise<void>) {
  try {
    await operation();
  } catch (error) {
    console.error(`[bpai-shadow-write] ${label} failed`, error);
  }
}

export function upsertSessionInRawStore(store: AppStore, session: StoredSession): AppStore {
  const hasSession = store.sessions.some((current) => current.id === session.id);

  if (hasSession) {
    return store;
  }

  return {
    ...store,
    sessions: [...store.sessions, session],
  };
}

export function deleteSessionFromRawStore(store: AppStore, sessionId: string): AppStore {
  return {
    ...store,
    sessions: store.sessions.filter((session) => session.id !== sessionId),
  };
}

export function upsertAssetInRawStore(
  store: AppStore,
  asset: StoredContentAsset,
): AppStore {
  const collectionKey = getCollectionKey(asset.kind);
  const collection = store[collectionKey] as StoredContentAsset[];

  return {
    ...store,
    [collectionKey]: upsertById(
      collection.filter((current) => current.id !== asset.id),
      asset,
    ),
  } as AppStore;
}

export function deleteAssetsFromRawStore(store: AppStore, assetIds: string[]): AppStore {
  const removedIds = new Set(assetIds);

  return {
    ...store,
    documents: store.documents.filter((asset) => !removedIds.has(asset.id)),
    sheets: store.sheets.filter((asset) => !removedIds.has(asset.id)),
    slides: store.slides.filter((asset) => !removedIds.has(asset.id)),
    browserStates: store.browserStates.map((state) => ({
      ...state,
      fileStates: state.fileStates.filter((fileState) => !removedIds.has(fileState.fileId)),
    })),
    workspaceBrowserStates: store.workspaceBrowserStates.map((state) => ({
      ...state,
      fileStates: state.fileStates.filter((fileState) => !removedIds.has(fileState.fileId)),
    })),
  };
}

export function upsertUserBrowserStateInRawStore(
  store: AppStore,
  nextState: StoredWorkspaceBrowserState,
): AppStore {
  return {
    ...store,
    browserStates: upsertById(store.browserStates, nextState),
  };
}

export function upsertSharedBrowserStateInRawStore(
  store: AppStore,
  nextState: StoredSharedWorkspaceBrowserState,
): AppStore {
  return {
    ...store,
    workspaceBrowserStates: upsertById(store.workspaceBrowserStates, nextState),
  };
}

export function upsertCollaborationMemberStateInRawStore(
  store: AppStore,
  nextState: StoredCollaborationSpaceMembers,
): AppStore {
  const existingIndex = store.collaborationSpaceMembers.findIndex(
    (item) => item.workspaceId === nextState.workspaceId,
  );

  return {
    ...store,
    collaborationSpaceMembers:
      existingIndex >= 0
        ? store.collaborationSpaceMembers.map((item, index) =>
            index === existingIndex ? nextState : item,
          )
        : [...store.collaborationSpaceMembers, nextState],
  };
}

export function insertCollaborationSpaceInRawStore(
  store: AppStore,
  nextSpace: StoredCollaborationSpace,
): AppStore {
  return {
    ...store,
    collaborationSpaces: [
      nextSpace,
      ...store.collaborationSpaces.filter((space) => space.id !== nextSpace.id),
    ],
  };
}

export function dissolveCollaborationSpaceInRawStore(
  store: AppStore,
  params: {
    workspaceId: string;
    targetWorkspaceId: string;
    dissolvedAt: string;
  },
): AppStore {
  const { workspaceId, targetWorkspaceId, dissolvedAt } = params;
  const dissolvedIds = new Set(store.dissolvedCollaborationSpaceIds);
  dissolvedIds.add(workspaceId);

  const migrateAssets = <
    T extends { workspaceId: string; trashedAt?: string | null; updatedAt: string },
  >(
    assets: T[],
  ) =>
    assets.map((asset) =>
      asset.workspaceId === workspaceId
        ? {
            ...asset,
            workspaceId: targetWorkspaceId,
            trashedAt: asset.trashedAt ?? dissolvedAt,
            updatedAt: dissolvedAt,
          }
        : asset,
    );

  return {
    ...store,
    documents: migrateAssets(store.documents),
    sheets: migrateAssets(store.sheets),
    slides: migrateAssets(store.slides),
    collaborationSpaces: store.collaborationSpaces.filter((item) => item.id !== workspaceId),
    collaborationSpaceMembers: store.collaborationSpaceMembers.filter(
      (item) => item.workspaceId !== workspaceId,
    ),
    workspaceBrowserStates: store.workspaceBrowserStates.filter(
      (item) => item.workspaceId !== workspaceId,
    ),
    dissolvedCollaborationSpaceIds: [...dissolvedIds],
  };
}
