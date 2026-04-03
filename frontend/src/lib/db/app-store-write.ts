import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import type {
  StoredBrowserCustomFolder,
  StoredBrowserFileState,
  StoredBrowserInnerFolder,
  StoredContentAsset,
  StoredSession,
  StoredSharedWorkspaceBrowserState,
  StoredWorkspaceBoardMessage,
  StoredWorkspaceBrowserState,
} from "@/lib/auth/types";
import { getDb } from "@/lib/db/client";
import {
  collaborationSpaces,
  contentAssets,
  filePlacements,
  folderNodes,
  sessions,
  userWorkspaceViewStates,
  users,
  workspaceMembers,
  workspaceSharedStates,
  workspaces,
} from "@/lib/db/schema";

function asDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return new Date(value);
}

function assetMetadata(asset: StoredContentAsset) {
  return {
    importSource: "json-runtime",
    legacyFolderId: asset.folderId ?? null,
    storedFileName: asset.storedFileName,
    storedRelativePath: asset.storedRelativePath,
  };
}

function userBrowserPayload(state: StoredWorkspaceBrowserState) {
  return {
    importSource: "json-runtime",
    deletedFolderIds: state.deletedFolderIds ?? [],
    rawActiveFolderId: state.activeFolderId ?? "all",
    rawActiveInnerFolderId: state.activeInnerFolderId ?? null,
    rawFolderViewMode: state.folderViewMode ?? "small",
    rawCustomFolders: state.customFolders ?? [],
    rawInnerFolders: state.innerFolders ?? [],
    rawFileStates: state.fileStates ?? [],
  };
}

function sharedBrowserPayload(state: StoredSharedWorkspaceBrowserState) {
  return {
    importSource: "json-runtime",
    deletedFolderIds: state.deletedFolderIds ?? [],
    rawCustomFolders: state.customFolders ?? [],
    rawInnerFolders: state.innerFolders ?? [],
    rawFileStates: state.fileStates ?? [],
    rawBoardMessages: state.boardMessages ?? [],
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function buildRootFolderNodeId(
  scope: "personal" | "workspace",
  kind: StoredWorkspaceBrowserState["kind"] | StoredSharedWorkspaceBrowserState["kind"],
  workspaceId: string,
  legacyId: string,
) {
  return `root:${scope}:${kind}:${workspaceId}:${legacyId}`;
}

function buildInnerFolderNodeId(
  scope: "personal" | "workspace",
  kind: StoredWorkspaceBrowserState["kind"] | StoredSharedWorkspaceBrowserState["kind"],
  workspaceId: string,
  legacyId: string,
) {
  return `inner:${scope}:${kind}:${workspaceId}:${legacyId}`;
}

function fallbackFolderLabel(legacyId: string) {
  return legacyId.replace(/[-_]+/g, " ").trim() || legacyId;
}

function rootFolderDefinition(
  legacyId: string,
  customFolderMap: Map<string, StoredBrowserCustomFolder>,
) {
  const folder = customFolderMap.get(legacyId);

  if (folder) {
    return {
      name: folder.name,
      description: folder.description,
      tone: folder.tone,
      icon: folder.icon ?? "folder",
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
      systemKey: null,
    };
  }

  return {
    name: fallbackFolderLabel(legacyId),
    description: "",
    tone: "slate" as const,
    icon: "folder" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    systemKey: legacyId,
  };
}

async function upsertFolderGraphForState(params: {
  scope: "personal" | "workspace";
  workspaceId: string;
  ownerUserId: string | null;
  kind: StoredWorkspaceBrowserState["kind"] | StoredSharedWorkspaceBrowserState["kind"];
  updatedAt: string;
  customFolders: StoredBrowserCustomFolder[];
  innerFolders: StoredBrowserInnerFolder[];
  fileStates: StoredBrowserFileState[];
  boardMessages?: StoredWorkspaceBoardMessage[];
  deletedFolderIds?: string[];
}) {
  const {
    scope,
    workspaceId,
    ownerUserId,
    kind,
    updatedAt,
    customFolders,
    innerFolders,
    fileStates,
    boardMessages = [],
    deletedFolderIds = [],
  } = params;
  const db = getDb();
  const deletedSet = new Set(deletedFolderIds);
  const customFolderMap = new Map(customFolders.map((folder) => [folder.id, folder]));
  const referencedRootIds = new Set<string>([
    ...customFolders.map((folder) => folder.id),
    ...innerFolders.map((folder) => folder.parentFolderId),
    ...fileStates.map((fileState) => fileState.folderId),
    ...boardMessages.map((message) => message.folderId),
  ]);

  for (const legacyId of referencedRootIds) {
    const rootId = buildRootFolderNodeId(scope, kind, workspaceId, legacyId);
    const definition = rootFolderDefinition(legacyId, customFolderMap);

    await db
      .insert(folderNodes)
      .values({
        id: rootId,
        workspaceId,
        ownerUserId: scope === "personal" ? ownerUserId : null,
        contentKind: kind,
        scope,
        parentFolderId: null,
        systemKey: definition.systemKey,
        name: definition.name,
        description: definition.description,
        tone: definition.tone,
        icon: definition.icon,
        deletedAt: deletedSet.has(legacyId) ? new Date(updatedAt) : null,
        createdAt: new Date(definition.createdAt),
        updatedAt: new Date(definition.updatedAt),
      })
      .onConflictDoUpdate({
        target: folderNodes.id,
        set: {
          ownerUserId: scope === "personal" ? ownerUserId : null,
          name: definition.name,
          description: definition.description,
          tone: definition.tone,
          icon: definition.icon,
          deletedAt: deletedSet.has(legacyId) ? new Date(updatedAt) : null,
          updatedAt: new Date(definition.updatedAt),
        },
      });
  }

  for (const folder of innerFolders) {
    const innerId = buildInnerFolderNodeId(scope, kind, workspaceId, folder.id);
    const parentId = folder.parentInnerFolderId
      ? buildInnerFolderNodeId(scope, kind, workspaceId, folder.parentInnerFolderId)
      : buildRootFolderNodeId(scope, kind, workspaceId, folder.parentFolderId);

    await db
      .insert(folderNodes)
      .values({
        id: innerId,
        workspaceId,
        ownerUserId: scope === "personal" ? ownerUserId : null,
        contentKind: kind,
        scope,
        parentFolderId: parentId,
        systemKey: null,
        name: folder.name,
        description: folder.description,
        tone: folder.tone,
        icon: folder.icon,
        deletedAt: deletedSet.has(folder.id) ? new Date(updatedAt) : null,
        createdAt: new Date(folder.createdAt),
        updatedAt: new Date(folder.updatedAt),
      })
      .onConflictDoUpdate({
        target: folderNodes.id,
        set: {
          ownerUserId: scope === "personal" ? ownerUserId : null,
          parentFolderId: parentId,
          name: folder.name,
          description: folder.description,
          tone: folder.tone,
          icon: folder.icon,
          deletedAt: deletedSet.has(folder.id) ? new Date(updatedAt) : null,
          updatedAt: new Date(folder.updatedAt),
        },
      });
  }
}

async function upsertFilePlacementsForState(params: {
  scope: "personal" | "workspace";
  workspaceId: string;
  kind: StoredWorkspaceBrowserState["kind"] | StoredSharedWorkspaceBrowserState["kind"];
  fileStates: StoredBrowserFileState[];
}) {
  const { scope, workspaceId, kind, fileStates } = params;

  if (!fileStates.length) {
    return;
  }

  const db = getDb();
  const assetIds = Array.from(new Set(fileStates.map((fileState) => fileState.fileId)));
  const existingAssets = await db
    .select({
      id: contentAssets.id,
    })
    .from(contentAssets)
    .where(inArray(contentAssets.id, assetIds));
  const existingAssetIds = new Set(existingAssets.map((asset) => asset.id));
  const innerFolderIds = Array.from(
    new Set(
      fileStates
        .map((fileState) =>
          fileState.subfolderId
            ? buildInnerFolderNodeId(scope, kind, workspaceId, fileState.subfolderId)
            : null,
        )
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const existingInnerFolderRows = innerFolderIds.length
    ? await db
        .select({
          id: folderNodes.id,
        })
        .from(folderNodes)
        .where(inArray(folderNodes.id, innerFolderIds))
    : [];
  const existingInnerFolderIds = new Set(existingInnerFolderRows.map((folder) => folder.id));

  for (const fileState of fileStates) {
    if (!existingAssetIds.has(fileState.fileId)) {
      continue;
    }

    const innerFolderId = fileState.subfolderId
      ? buildInnerFolderNodeId(scope, kind, workspaceId, fileState.subfolderId)
      : null;
    const safeInnerFolderId =
      innerFolderId && existingInnerFolderIds.has(innerFolderId) ? innerFolderId : null;

    await db
      .insert(filePlacements)
      .values({
        id: `placement:${fileState.fileId}`,
        assetId: fileState.fileId,
        workspaceId,
        rootFolderId: buildRootFolderNodeId(scope, kind, workspaceId, fileState.folderId),
        innerFolderId: safeInnerFolderId,
        titleOverride: fileState.titleOverride ?? null,
        isTrashed: Boolean(fileState.isTrashed),
        isDeleted: Boolean(fileState.isDeleted),
        trashedAt: asDate(fileState.trashedAt ?? null),
        updatedAt: new Date(fileState.updatedAt),
      })
      .onConflictDoUpdate({
        target: filePlacements.id,
        set: {
          workspaceId,
          rootFolderId: buildRootFolderNodeId(scope, kind, workspaceId, fileState.folderId),
          innerFolderId: safeInnerFolderId,
          titleOverride: fileState.titleOverride ?? null,
          isTrashed: Boolean(fileState.isTrashed),
          isDeleted: Boolean(fileState.isDeleted),
          trashedAt: asDate(fileState.trashedAt ?? null),
          updatedAt: new Date(fileState.updatedAt),
        },
      });
  }
}

async function resolveDefaultPlacementContext(asset: StoredContentAsset) {
  const db = getDb();
  const [workspace] = await db
    .select({
      kind: workspaces.kind,
    })
    .from(workspaces)
    .where(eq(workspaces.id, asset.workspaceId))
    .limit(1);

  if (!workspace) {
    return null;
  }

  const scope = workspace.kind === "collaboration" ? "workspace" : "personal";
  const preferredFolderKey = asset.folderId?.trim() ?? "";
  let rootFolder: { id: string } | undefined;

  if (preferredFolderKey) {
    const [matchedBySystemKey] = await db
      .select({
        id: folderNodes.id,
      })
      .from(folderNodes)
      .where(
        and(
          eq(folderNodes.workspaceId, asset.workspaceId),
          eq(folderNodes.contentKind, asset.kind),
          eq(folderNodes.scope, scope),
          eq(folderNodes.systemKey, preferredFolderKey),
        ),
      )
      .limit(1);

    rootFolder = matchedBySystemKey;

    if (!rootFolder) {
      const [matchedByLegacyId] = await db
        .select({
          id: folderNodes.id,
        })
        .from(folderNodes)
        .where(
          eq(
            folderNodes.id,
            buildRootFolderNodeId(scope, asset.kind, asset.workspaceId, preferredFolderKey),
          ),
        )
        .limit(1);

      rootFolder = matchedByLegacyId;
    }
  }

  if (!rootFolder) {
    const fallbackSystemKey =
      scope === "workspace" ? "workspace-recent-uploads" : "recent-uploads";
    const [fallbackRootFolder] = await db
      .select({
        id: folderNodes.id,
      })
      .from(folderNodes)
      .where(
        and(
          eq(folderNodes.workspaceId, asset.workspaceId),
          eq(folderNodes.contentKind, asset.kind),
          eq(folderNodes.scope, scope),
          eq(folderNodes.systemKey, fallbackSystemKey),
        ),
      )
      .limit(1);

    rootFolder = fallbackRootFolder;
  }

  if (!rootFolder) {
    return null;
  }

  return {
    scope,
    rootFolderId: rootFolder.id,
  };
}

export async function mirrorSessionToPostgres(session: StoredSession) {
  const db = getDb();

  await db
    .insert(sessions)
    .values({
      id: session.id,
      userId: session.userId,
      createdAt: new Date(session.createdAt),
      expiresAt: new Date(session.expiresAt),
      lastSeenAt: new Date(session.lastSeenAt),
    })
    .onConflictDoUpdate({
      target: sessions.id,
      set: {
        userId: session.userId,
        createdAt: new Date(session.createdAt),
        expiresAt: new Date(session.expiresAt),
        lastSeenAt: new Date(session.lastSeenAt),
      },
    });
}

export async function deleteSessionFromPostgres(sessionId: string) {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function mirrorAssetToPostgres(asset: StoredContentAsset) {
  const db = getDb();

  await db
    .insert(contentAssets)
    .values({
      id: asset.id,
      kind: asset.kind,
      title: asset.title,
      ownerUserId: asset.ownerUserId,
      workspaceId: asset.workspaceId,
      originalFileName: asset.originalFileName,
      mimeType: asset.mimeType ?? null,
      sizeBytes: asset.sizeBytes,
      storageKey: asset.storedRelativePath,
      currentVersion: 1,
      fileHash: null,
      trashedAt: asDate(asset.trashedAt ?? null),
      metadata: assetMetadata(asset),
      createdAt: new Date(asset.createdAt),
      updatedAt: new Date(asset.updatedAt),
    })
    .onConflictDoUpdate({
      target: contentAssets.id,
      set: {
        kind: asset.kind,
        title: asset.title,
        ownerUserId: asset.ownerUserId,
        workspaceId: asset.workspaceId,
        originalFileName: asset.originalFileName,
        mimeType: asset.mimeType ?? null,
        sizeBytes: asset.sizeBytes,
        storageKey: asset.storedRelativePath,
        trashedAt: asDate(asset.trashedAt ?? null),
        metadata: assetMetadata(asset),
        updatedAt: new Date(asset.updatedAt),
      },
    });

  const placementContext = await resolveDefaultPlacementContext(asset);

  if (!placementContext) {
    return;
  }

  await db
    .insert(filePlacements)
    .values({
      id: `placement:${asset.id}`,
      assetId: asset.id,
      workspaceId: asset.workspaceId,
      rootFolderId: placementContext.rootFolderId,
      innerFolderId: null,
      titleOverride: null,
      isTrashed: Boolean(asset.trashedAt),
      isDeleted: false,
      trashedAt: asDate(asset.trashedAt ?? null),
      updatedAt: new Date(asset.updatedAt),
    })
    .onConflictDoUpdate({
      target: filePlacements.id,
      set: {
        workspaceId: asset.workspaceId,
        rootFolderId: placementContext.rootFolderId,
        innerFolderId: null,
        titleOverride: null,
        isTrashed: Boolean(asset.trashedAt),
        isDeleted: false,
        trashedAt: asDate(asset.trashedAt ?? null),
        updatedAt: new Date(asset.updatedAt),
      },
    });
}

export async function deleteAssetsFromPostgres(assetIds: string[]) {
  if (!assetIds.length) {
    return;
  }

  const db = getDb();

  await db.delete(filePlacements).where(inArray(filePlacements.assetId, assetIds));
  await db.delete(contentAssets).where(inArray(contentAssets.id, assetIds));
}

export async function mirrorUserBrowserStateToPostgres(
  state: StoredWorkspaceBrowserState,
) {
  const db = getDb();

  await upsertFolderGraphForState({
    scope: "personal",
    workspaceId: state.workspaceId,
    ownerUserId: state.ownerUserId,
    kind: state.kind,
    updatedAt: state.updatedAt,
    customFolders: state.customFolders,
    innerFolders: state.innerFolders,
    fileStates: state.fileStates,
    deletedFolderIds: state.deletedFolderIds,
  });
  await upsertFilePlacementsForState({
    scope: "personal",
    workspaceId: state.workspaceId,
    kind: state.kind,
    fileStates: state.fileStates,
  });

  await db
    .insert(userWorkspaceViewStates)
    .values({
      id: state.id,
      userId: state.ownerUserId,
      workspaceId: state.workspaceId,
      contentKind: state.kind,
      activeRootFolderId:
        state.activeFolderId && state.activeFolderId !== "all"
          ? buildRootFolderNodeId("personal", state.kind, state.workspaceId, state.activeFolderId)
          : null,
      activeInnerFolderId: state.activeInnerFolderId
        ? buildInnerFolderNodeId("personal", state.kind, state.workspaceId, state.activeInnerFolderId)
        : null,
      folderViewMode: state.folderViewMode ?? null,
      payload: userBrowserPayload(state),
      createdAt: new Date(state.createdAt),
      updatedAt: new Date(state.updatedAt),
    })
    .onConflictDoUpdate({
      target: userWorkspaceViewStates.id,
      set: {
        activeRootFolderId:
          state.activeFolderId && state.activeFolderId !== "all"
            ? buildRootFolderNodeId("personal", state.kind, state.workspaceId, state.activeFolderId)
            : null,
        activeInnerFolderId: state.activeInnerFolderId
          ? buildInnerFolderNodeId("personal", state.kind, state.workspaceId, state.activeInnerFolderId)
          : null,
        folderViewMode: state.folderViewMode ?? null,
        payload: userBrowserPayload(state),
        updatedAt: new Date(state.updatedAt),
      },
    });
}

export async function mirrorSharedBrowserStateToPostgres(
  state: StoredSharedWorkspaceBrowserState,
) {
  const db = getDb();

  await upsertFolderGraphForState({
    scope: "workspace",
    workspaceId: state.workspaceId,
    ownerUserId: null,
    kind: state.kind,
    updatedAt: state.updatedAt,
    customFolders: state.customFolders,
    innerFolders: state.innerFolders,
    fileStates: state.fileStates,
    boardMessages: state.boardMessages,
    deletedFolderIds: state.deletedFolderIds,
  });
  await upsertFilePlacementsForState({
    scope: "workspace",
    workspaceId: state.workspaceId,
    kind: state.kind,
    fileStates: state.fileStates,
  });

  await db
    .insert(workspaceSharedStates)
    .values({
      id: state.id,
      workspaceId: state.workspaceId,
      contentKind: state.kind,
      activeRootFolderId: null,
      activeInnerFolderId: null,
      folderViewMode: null,
      payload: sharedBrowserPayload(state),
      createdAt: new Date(state.createdAt),
      updatedAt: new Date(state.updatedAt),
    })
    .onConflictDoUpdate({
      target: workspaceSharedStates.id,
      set: {
        payload: sharedBrowserPayload(state),
        updatedAt: new Date(state.updatedAt),
      },
    });
}

export async function mirrorCollaborationSpaceToPostgres(params: {
  id: string;
  name: string;
  summary: string;
  ownerEmail: string;
  memberEmails: string[];
  documentCount: number;
  systemFormCount: number;
  tone: "blue" | "amber" | "emerald" | "violet";
  createdAt: string;
  updatedAt: string;
}) {
  const db = getDb();
  const normalizedOwnerEmail = normalizeEmail(params.ownerEmail);
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedOwnerEmail))
    .limit(1);

  if (!owner) {
    return;
  }

  await db
    .insert(workspaces)
    .values({
      id: params.id,
      name: params.name,
      kind: "collaboration",
      ownerUserId: owner.id,
      visibility: "shared",
      metadata: {
        summary: params.summary,
        tone: params.tone,
        importSource: "json-runtime",
      },
      createdAt: new Date(params.createdAt),
      updatedAt: new Date(params.updatedAt),
    })
    .onConflictDoUpdate({
      target: workspaces.id,
      set: {
        name: params.name,
        kind: "collaboration",
        ownerUserId: owner.id,
        visibility: "shared",
        metadata: {
          summary: params.summary,
          tone: params.tone,
          importSource: "json-runtime",
        },
        updatedAt: new Date(params.updatedAt),
      },
    });

  await db
    .insert(collaborationSpaces)
    .values({
      id: params.id,
      workspaceId: params.id,
      name: params.name,
      summary: params.summary,
      ownerUserId: owner.id,
      tone: params.tone,
      documentCount: params.documentCount,
      systemFormCount: params.systemFormCount,
      dissolvedAt: null,
      createdAt: new Date(params.createdAt),
      updatedAt: new Date(params.updatedAt),
    })
    .onConflictDoUpdate({
      target: collaborationSpaces.id,
      set: {
        name: params.name,
        summary: params.summary,
        ownerUserId: owner.id,
        tone: params.tone,
        documentCount: params.documentCount,
        systemFormCount: params.systemFormCount,
        dissolvedAt: null,
        updatedAt: new Date(params.updatedAt),
      },
    });

  const normalizedMemberEmails = Array.from(
    new Set(params.memberEmails.map((email) => normalizeEmail(email))),
  );
  const memberRows = normalizedMemberEmails.length
    ? await db
        .select({
          id: users.id,
          email: users.email,
        })
        .from(users)
        .where(inArray(users.email, normalizedMemberEmails))
    : [];
  const memberUserIdByEmail = new Map(
    memberRows.map((row) => [normalizeEmail(row.email), row.id]),
  );
  const memberUserIds = Array.from(
    new Set([
      owner.id,
      ...normalizedMemberEmails
        .map((email) => memberUserIdByEmail.get(email) ?? null)
        .filter((value): value is string => Boolean(value)),
    ]),
  );

  await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, params.id));

  for (const userId of memberUserIds) {
    await db
      .insert(workspaceMembers)
      .values({
        id: `workspace-member:${params.id}:${userId}`,
        workspaceId: params.id,
        userId,
        memberRole: userId === owner.id ? "owner" : "member",
        joinedAt: new Date(params.createdAt),
        updatedAt: new Date(params.updatedAt),
      })
      .onConflictDoUpdate({
        target: workspaceMembers.id,
        set: {
          memberRole: userId === owner.id ? "owner" : "member",
          updatedAt: new Date(params.updatedAt),
        },
      });
  }
}

export async function dissolveCollaborationSpaceInPostgres(params: {
  workspaceId: string;
  dissolvedAt: string;
}) {
  const db = getDb();

  await db
    .update(collaborationSpaces)
    .set({
      dissolvedAt: new Date(params.dissolvedAt),
      updatedAt: new Date(params.dissolvedAt),
    })
    .where(eq(collaborationSpaces.id, params.workspaceId));

  await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, params.workspaceId));
  await db
    .delete(workspaceSharedStates)
    .where(eq(workspaceSharedStates.workspaceId, params.workspaceId));
}
