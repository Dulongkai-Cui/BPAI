import "server-only";

import path from "node:path";
import { asc, eq } from "drizzle-orm";
import type {
  AppStore,
  StoredBrowserCustomFolder,
  StoredBrowserFileState,
  StoredBrowserInnerFolder,
  StoredCollaborationSpace,
  StoredCollaborationSpaceMembers,
  StoredContentAsset,
  StoredSharedWorkspaceBrowserState,
  StoredUser,
  StoredWorkspace,
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

type FolderNodeRow = typeof folderNodes.$inferSelect;
type FilePlacementRow = typeof filePlacements.$inferSelect;
type ContentAssetRow = typeof contentAssets.$inferSelect;
type UserWorkspaceViewStateRow = typeof userWorkspaceViewStates.$inferSelect;
type WorkspaceSharedStateRow = typeof workspaceSharedStates.$inferSelect;

type WorkspaceMemberWithEmailRow = {
  workspaceId: string;
  userId: string;
  memberRole: "owner" | "member" | "viewer";
  joinedAt: Date | string;
  updatedAt: Date | string;
  email: string | null;
};

function asIso(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asOptionalIso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function asStoredFileStates(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as StoredBrowserFileState[];
  }

  return value
    .filter(
      (
        entry,
      ): entry is {
        fileId: string;
        folderId: string;
        subfolderId?: string | null;
        titleOverride?: string;
        isTrashed?: boolean;
        isDeleted?: boolean;
        trashedAt?: string;
        updatedAt?: string;
      } =>
        Boolean(
          entry &&
            typeof entry === "object" &&
            typeof (entry as { fileId?: unknown }).fileId === "string" &&
            typeof (entry as { folderId?: unknown }).folderId === "string",
        ),
    )
    .map((entry) => ({
      fileId: entry.fileId,
      folderId: entry.folderId,
      subfolderId: typeof entry.subfolderId === "string" ? entry.subfolderId : null,
      titleOverride:
        typeof entry.titleOverride === "string" ? entry.titleOverride : undefined,
      isTrashed: entry.isTrashed === true ? true : undefined,
      isDeleted: entry.isDeleted === true ? true : undefined,
      trashedAt: typeof entry.trashedAt === "string" ? entry.trashedAt : undefined,
      updatedAt:
        typeof entry.updatedAt === "string" && entry.updatedAt
          ? entry.updatedAt
          : new Date(0).toISOString(),
    }));
}

function asStoredCustomFolders(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as StoredBrowserCustomFolder[];
  }

  return value
    .filter(
      (
        entry,
      ): entry is {
        id: string;
        name: string;
        description?: string;
        tone: StoredBrowserCustomFolder["tone"];
        icon?: StoredBrowserCustomFolder["icon"];
        createdAt?: string;
        updatedAt?: string;
      } =>
        Boolean(
          entry &&
            typeof entry === "object" &&
            typeof (entry as { id?: unknown }).id === "string" &&
            typeof (entry as { name?: unknown }).name === "string" &&
            typeof (entry as { tone?: unknown }).tone === "string",
        ),
    )
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: typeof entry.description === "string" ? entry.description : "",
      tone: entry.tone,
      icon: typeof entry.icon === "string" ? entry.icon : undefined,
      createdAt: entry.createdAt ?? new Date(0).toISOString(),
      updatedAt: entry.updatedAt ?? entry.createdAt ?? new Date(0).toISOString(),
    }));
}

function asStoredInnerFolders(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as StoredBrowserInnerFolder[];
  }

  return value
    .filter(
      (
        entry,
      ): entry is {
        id: string;
        parentFolderId: string;
        parentInnerFolderId?: string | null;
        name: string;
        description?: string;
        tone: StoredBrowserInnerFolder["tone"];
        icon?: StoredBrowserInnerFolder["icon"];
        createdAt?: string;
        updatedAt?: string;
      } =>
        Boolean(
          entry &&
            typeof entry === "object" &&
            typeof (entry as { id?: unknown }).id === "string" &&
            typeof (entry as { parentFolderId?: unknown }).parentFolderId === "string" &&
            typeof (entry as { name?: unknown }).name === "string" &&
            typeof (entry as { tone?: unknown }).tone === "string",
        ),
    )
    .map((entry) => ({
      id: entry.id,
      parentFolderId: entry.parentFolderId,
      parentInnerFolderId:
        typeof entry.parentInnerFolderId === "string" ? entry.parentInnerFolderId : null,
      name: entry.name,
      description: typeof entry.description === "string" ? entry.description : "",
      tone: entry.tone,
      icon: typeof entry.icon === "string" ? entry.icon : "folder",
      createdAt: entry.createdAt ?? new Date(0).toISOString(),
      updatedAt: entry.updatedAt ?? entry.createdAt ?? new Date(0).toISOString(),
    }));
}

function asStoredBoardMessages(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as StoredWorkspaceBoardMessage[];
  }

  return value
    .filter(
      (
        entry,
      ): entry is {
        id: string;
        folderId: string;
        innerFolderId?: string | null;
        authorUserId?: string;
        authorName: string;
        authorRole?: string;
        message: string;
        postedAt: string;
        createdAt?: string;
        updatedAt?: string;
      } =>
        Boolean(
          entry &&
            typeof entry === "object" &&
            typeof (entry as { id?: unknown }).id === "string" &&
            typeof (entry as { folderId?: unknown }).folderId === "string" &&
            typeof (entry as { authorName?: unknown }).authorName === "string" &&
            typeof (entry as { message?: unknown }).message === "string" &&
            typeof (entry as { postedAt?: unknown }).postedAt === "string",
        ),
    )
    .map((entry) => ({
      id: entry.id,
      folderId: entry.folderId,
      innerFolderId:
        typeof entry.innerFolderId === "string" ? entry.innerFolderId : null,
      authorUserId:
        typeof entry.authorUserId === "string" ? entry.authorUserId : undefined,
      authorName: entry.authorName,
      authorRole: typeof entry.authorRole === "string" ? entry.authorRole : undefined,
      message: entry.message,
      postedAt: entry.postedAt,
      createdAt: entry.createdAt ?? entry.updatedAt ?? new Date(0).toISOString(),
      updatedAt: entry.updatedAt ?? entry.createdAt ?? new Date(0).toISOString(),
    }));
}

function decodeLegacyFolderId(node: Pick<FolderNodeRow, "id" | "systemKey">) {
  if (node.systemKey) {
    return node.systemKey;
  }

  const parts = node.id.split(":");

  if ((parts[0] === "root" || parts[0] === "inner") && parts.length >= 5) {
    return parts.slice(4).join(":");
  }

  return node.id;
}

function resolveRootLegacyFolderId(
  node: FolderNodeRow,
  folderMap: Map<string, FolderNodeRow>,
) {
  let current: FolderNodeRow | undefined = node;

  while (current?.parentFolderId) {
    current = folderMap.get(current.parentFolderId);
  }

  return current ? decodeLegacyFolderId(current) : decodeLegacyFolderId(node);
}

function resolveParentInnerLegacyFolderId(
  node: FolderNodeRow,
  folderMap: Map<string, FolderNodeRow>,
) {
  if (!node.parentFolderId) {
    return null;
  }

  const parent = folderMap.get(node.parentFolderId);

  if (!parent || !parent.parentFolderId) {
    return null;
  }

  return decodeLegacyFolderId(parent);
}

function shouldReplaceByUpdatedAt(
  currentUpdatedAt: string | null | undefined,
  nextUpdatedAt: string | null | undefined,
) {
  if (!nextUpdatedAt) {
    return false;
  }

  if (!currentUpdatedAt) {
    return true;
  }

  return Date.parse(nextUpdatedAt) > Date.parse(currentUpdatedAt);
}

function toStoredAsset(row: ContentAssetRow): StoredContentAsset {
  const metadata = asRecord(row.metadata);
  const storedRelativePath = row.storageKey;
  const storedFileName =
    typeof metadata.storedFileName === "string" && metadata.storedFileName
      ? metadata.storedFileName
      : path.basename(storedRelativePath);
  const legacyFolderId =
    typeof metadata.legacyFolderId === "string" && metadata.legacyFolderId
      ? metadata.legacyFolderId
      : undefined;

  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    ownerUserId: row.ownerUserId,
    workspaceId: row.workspaceId,
    folderId: legacyFolderId,
    originalFileName: row.originalFileName,
    storedFileName,
    storedRelativePath,
    mimeType: row.mimeType ?? undefined,
    sizeBytes: row.sizeBytes,
    createdAt: asIso(row.createdAt),
    updatedAt: asIso(row.updatedAt),
    trashedAt: asOptionalIso(row.trashedAt),
  };
}

function toStoredCustomFolder(row: FolderNodeRow): StoredBrowserCustomFolder {
  return {
    id: decodeLegacyFolderId(row),
    name: row.name,
    description: row.description,
    tone: row.tone,
    icon: row.icon,
    createdAt: asIso(row.createdAt),
    updatedAt: asIso(row.updatedAt),
  };
}

function toStoredInnerFolder(
  row: FolderNodeRow,
  folderMap: Map<string, FolderNodeRow>,
): StoredBrowserInnerFolder {
  return {
    id: decodeLegacyFolderId(row),
    parentFolderId: resolveRootLegacyFolderId(row, folderMap),
    parentInnerFolderId: resolveParentInnerLegacyFolderId(row, folderMap),
    name: row.name,
    description: row.description,
    tone: row.tone,
    icon: row.icon,
    createdAt: asIso(row.createdAt),
    updatedAt: asIso(row.updatedAt),
  };
}

function buildUserBrowserState(
  row: UserWorkspaceViewStateRow,
  folderRows: FolderNodeRow[],
  placementRows: FilePlacementRow[],
  folderMap: Map<string, FolderNodeRow>,
  assetMap: Map<string, StoredContentAsset>,
): StoredWorkspaceBrowserState {
  const payload = asRecord(row.payload);
  const rawFileStates = asStoredFileStates(payload.rawFileStates);
  const rawCustomFolders = asStoredCustomFolders(payload.rawCustomFolders);
  const rawInnerFolders = asStoredInnerFolders(payload.rawInnerFolders);
  const scopeFolderRows = folderRows.filter(
    (folder) =>
      folder.scope === "personal" &&
      folder.workspaceId === row.workspaceId &&
      folder.contentKind === row.contentKind &&
      folder.ownerUserId === row.userId,
  );
  const customFolderMap = new Map(
    scopeFolderRows
    .filter((folder) => !folder.parentFolderId && !folder.systemKey)
    .map(toStoredCustomFolder)
    .map((folder) => [folder.id, folder]),
  );
  for (const folder of rawCustomFolders) {
    const current = customFolderMap.get(folder.id);
    if (!current || shouldReplaceByUpdatedAt(current.updatedAt, folder.updatedAt)) {
      customFolderMap.set(folder.id, folder);
    }
  }

  const innerFolderMap = new Map(
    scopeFolderRows
    .filter((folder) => Boolean(folder.parentFolderId))
    .map((folder) => toStoredInnerFolder(folder, folderMap))
    .map((folder) => [folder.id, folder]),
  );
  for (const folder of rawInnerFolders) {
    const current = innerFolderMap.get(folder.id);
    if (!current || shouldReplaceByUpdatedAt(current.updatedAt, folder.updatedAt)) {
      innerFolderMap.set(folder.id, folder);
    }
  }
  const deletedFolderIds = Array.from(
    new Set([
      ...asStringArray(payload.deletedFolderIds),
      ...scopeFolderRows
        .filter((folder) => folder.deletedAt)
        .map((folder) => decodeLegacyFolderId(folder)),
    ]),
  );
  const fileStateMap = new Map<string, StoredBrowserFileState>();

  for (const placement of placementRows) {
    const asset = assetMap.get(placement.assetId);
    const rootFolder = folderMap.get(placement.rootFolderId);
    const innerFolder = placement.innerFolderId
      ? folderMap.get(placement.innerFolderId)
      : null;

    if (!asset || !rootFolder) {
      continue;
    }

    if (
      asset.kind !== row.contentKind ||
      rootFolder.scope !== "personal" ||
      rootFolder.workspaceId !== row.workspaceId ||
      rootFolder.ownerUserId !== row.userId
    ) {
      continue;
    }

    fileStateMap.set(asset.id, {
      fileId: asset.id,
      folderId: decodeLegacyFolderId(rootFolder),
      subfolderId: innerFolder ? decodeLegacyFolderId(innerFolder) : null,
      titleOverride: placement.titleOverride ?? undefined,
      isTrashed: placement.isTrashed ? true : undefined,
      isDeleted: placement.isDeleted ? true : undefined,
      trashedAt: asOptionalIso(placement.trashedAt) ?? undefined,
      updatedAt: asIso(placement.updatedAt),
    });
  }

  for (const rawFileState of rawFileStates) {
    const current = fileStateMap.get(rawFileState.fileId);

    if (!current || shouldReplaceByUpdatedAt(current.updatedAt, rawFileState.updatedAt)) {
      fileStateMap.set(rawFileState.fileId, rawFileState);
    }
  }

  return {
    id: row.id,
    kind: row.contentKind,
    ownerUserId: row.userId,
    workspaceId: row.workspaceId,
    activeFolderId:
      typeof payload.rawActiveFolderId === "string"
        ? payload.rawActiveFolderId
        : row.activeRootFolderId
          ? decodeLegacyFolderId(
              folderMap.get(row.activeRootFolderId) ?? {
                id: row.activeRootFolderId,
                systemKey: null,
              },
            )
          : "all",
    activeInnerFolderId:
      payload.rawActiveInnerFolderId === null ||
      typeof payload.rawActiveInnerFolderId === "string"
        ? (payload.rawActiveInnerFolderId as string | null)
        : row.activeInnerFolderId
          ? decodeLegacyFolderId(
              folderMap.get(row.activeInnerFolderId) ?? {
                id: row.activeInnerFolderId,
                systemKey: null,
              },
            )
          : null,
    folderViewMode:
      payload.rawFolderViewMode === "small" ||
      payload.rawFolderViewMode === "medium" ||
      payload.rawFolderViewMode === "large" ||
      payload.rawFolderViewMode === "list"
        ? payload.rawFolderViewMode
        : (row.folderViewMode ?? "small"),
    deletedFolderIds,
    customFolders: [...customFolderMap.values()],
    innerFolders: [...innerFolderMap.values()],
    fileStates: [...fileStateMap.values()].sort((left, right) =>
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    ),
    createdAt: asIso(row.createdAt),
    updatedAt: asIso(row.updatedAt),
  };
}

function buildSharedBrowserState(
  row: WorkspaceSharedStateRow,
  folderRows: FolderNodeRow[],
  placementRows: FilePlacementRow[],
  folderMap: Map<string, FolderNodeRow>,
  assetMap: Map<string, StoredContentAsset>,
): StoredSharedWorkspaceBrowserState {
  const payload = asRecord(row.payload);
  const rawFileStates = asStoredFileStates(payload.rawFileStates);
  const rawCustomFolders = asStoredCustomFolders(payload.rawCustomFolders);
  const rawInnerFolders = asStoredInnerFolders(payload.rawInnerFolders);
  const boardMessages = asStoredBoardMessages(
    payload.rawBoardMessages ?? payload.boardMessages,
  );
  const scopeFolderRows = folderRows.filter(
    (folder) =>
      folder.scope === "workspace" &&
      folder.workspaceId === row.workspaceId &&
      folder.contentKind === row.contentKind,
  );
  const customFolderMap = new Map(
    scopeFolderRows
    .filter((folder) => !folder.parentFolderId && !folder.systemKey)
    .map(toStoredCustomFolder)
    .map((folder) => [folder.id, folder]),
  );
  for (const folder of rawCustomFolders) {
    const current = customFolderMap.get(folder.id);
    if (!current || shouldReplaceByUpdatedAt(current.updatedAt, folder.updatedAt)) {
      customFolderMap.set(folder.id, folder);
    }
  }

  const innerFolderMap = new Map(
    scopeFolderRows
    .filter((folder) => Boolean(folder.parentFolderId))
    .map((folder) => toStoredInnerFolder(folder, folderMap))
    .map((folder) => [folder.id, folder]),
  );
  for (const folder of rawInnerFolders) {
    const current = innerFolderMap.get(folder.id);
    if (!current || shouldReplaceByUpdatedAt(current.updatedAt, folder.updatedAt)) {
      innerFolderMap.set(folder.id, folder);
    }
  }
  const deletedFolderIds = Array.from(
    new Set([
      ...asStringArray(payload.deletedFolderIds),
      ...scopeFolderRows
        .filter((folder) => folder.deletedAt)
        .map((folder) => decodeLegacyFolderId(folder)),
    ]),
  );
  const fileStateMap = new Map<string, StoredBrowserFileState>();

  for (const placement of placementRows) {
    const asset = assetMap.get(placement.assetId);
    const rootFolder = folderMap.get(placement.rootFolderId);
    const innerFolder = placement.innerFolderId
      ? folderMap.get(placement.innerFolderId)
      : null;

    if (!asset || !rootFolder) {
      continue;
    }

    if (
      asset.kind !== row.contentKind ||
      rootFolder.scope !== "workspace" ||
      rootFolder.workspaceId !== row.workspaceId
    ) {
      continue;
    }

    fileStateMap.set(asset.id, {
      fileId: asset.id,
      folderId: decodeLegacyFolderId(rootFolder),
      subfolderId: innerFolder ? decodeLegacyFolderId(innerFolder) : null,
      titleOverride: placement.titleOverride ?? undefined,
      isTrashed: placement.isTrashed ? true : undefined,
      isDeleted: placement.isDeleted ? true : undefined,
      trashedAt: asOptionalIso(placement.trashedAt) ?? undefined,
      updatedAt: asIso(placement.updatedAt),
    });
  }

  for (const rawFileState of rawFileStates) {
    const current = fileStateMap.get(rawFileState.fileId);

    if (!current || shouldReplaceByUpdatedAt(current.updatedAt, rawFileState.updatedAt)) {
      fileStateMap.set(rawFileState.fileId, rawFileState);
    }
  }

  return {
    id: row.id,
    kind: row.contentKind,
    workspaceId: row.workspaceId,
    deletedFolderIds,
    customFolders: [...customFolderMap.values()],
    innerFolders: [...innerFolderMap.values()],
    fileStates: [...fileStateMap.values()].sort((left, right) =>
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    ),
    boardMessages,
    createdAt: asIso(row.createdAt),
    updatedAt: asIso(row.updatedAt),
  };
}

export async function readAppStoreFromPostgres() {
  try {
    const db = getDb();
    const [
      userRows,
      workspaceRows,
      sessionRows,
      assetRows,
      folderRows,
      placementRows,
      userViewRows,
      sharedStateRows,
      collaborationSpaceRows,
      workspaceMemberRows,
    ] = await Promise.all([
      db.select().from(users).orderBy(asc(users.createdAt)),
      db.select().from(workspaces).orderBy(asc(workspaces.createdAt)),
      db.select().from(sessions).orderBy(asc(sessions.createdAt)),
      db.select().from(contentAssets).orderBy(asc(contentAssets.createdAt)),
      db.select().from(folderNodes).orderBy(asc(folderNodes.createdAt)),
      db.select().from(filePlacements).orderBy(asc(filePlacements.updatedAt)),
      db.select().from(userWorkspaceViewStates).orderBy(asc(userWorkspaceViewStates.createdAt)),
      db.select().from(workspaceSharedStates).orderBy(asc(workspaceSharedStates.createdAt)),
      db.select().from(collaborationSpaces).orderBy(asc(collaborationSpaces.createdAt)),
      db
        .select({
          workspaceId: workspaceMembers.workspaceId,
          userId: workspaceMembers.userId,
          memberRole: workspaceMembers.memberRole,
          joinedAt: workspaceMembers.joinedAt,
          updatedAt: workspaceMembers.updatedAt,
          email: users.email,
        })
        .from(workspaceMembers)
        .leftJoin(users, eq(workspaceMembers.userId, users.id)),
    ]);

    const storedUsers: StoredUser[] = userRows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      roleKey: row.roleKey,
      roleLabel: row.roleLabel,
      teamLabel: row.teamLabel,
      passwordHash: row.passwordHash,
      passwordSalt: row.passwordSalt,
      primaryWorkspaceId: row.primaryWorkspaceId ?? "",
      createdAt: asIso(row.createdAt),
      updatedAt: asIso(row.updatedAt),
    }));

    const storedWorkspaces: StoredWorkspace[] = workspaceRows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      ownerUserId: row.ownerUserId ?? "",
      visibility: row.visibility,
      createdAt: asIso(row.createdAt),
      updatedAt: asIso(row.updatedAt),
    }));

    const storedSessions = sessionRows.map((row) => ({
      id: row.id,
      userId: row.userId,
      createdAt: asIso(row.createdAt),
      expiresAt: asIso(row.expiresAt),
      lastSeenAt: asIso(row.lastSeenAt),
    }));

    const storedAssets = assetRows.map(toStoredAsset);
    const assetMap = new Map(storedAssets.map((asset) => [asset.id, asset]));
    const folderMap = new Map(folderRows.map((row) => [row.id, row]));

    const storedBrowserStates = userViewRows.map((row) =>
      buildUserBrowserState(row, folderRows, placementRows, folderMap, assetMap),
    );
    const storedSharedStates = sharedStateRows.map((row) =>
      buildSharedBrowserState(row, folderRows, placementRows, folderMap, assetMap),
    );

    const collaborationWorkspaceIds = new Set(
      storedWorkspaces
        .filter((workspace) => workspace.kind === "collaboration")
        .map((workspace) => workspace.id),
    );
    const memberStateGroups = new Map<string, WorkspaceMemberWithEmailRow[]>();

    for (const row of workspaceMemberRows) {
      if (!collaborationWorkspaceIds.has(row.workspaceId)) {
        continue;
      }

      const collection = memberStateGroups.get(row.workspaceId) ?? [];
      collection.push(row);
      memberStateGroups.set(row.workspaceId, collection);
    }

    const storedCollaborationMemberStates: StoredCollaborationSpaceMembers[] = [
      ...memberStateGroups.entries(),
    ].map(([workspaceId, rows]) => ({
      id: `collaboration-members-${workspaceId}`,
      workspaceId,
      memberEmails: Array.from(
        new Set(
          rows
            .map((row) => row.email)
            .filter((email): email is string => typeof email === "string" && Boolean(email)),
        ),
      ),
      createdAt: rows.reduce(
        (earliest, row) =>
          !earliest || Date.parse(asIso(row.joinedAt)) < Date.parse(earliest)
            ? asIso(row.joinedAt)
            : earliest,
        "",
      ),
      updatedAt: rows.reduce(
        (latest, row) =>
          !latest || Date.parse(asIso(row.updatedAt)) > Date.parse(latest)
            ? asIso(row.updatedAt)
            : latest,
        "",
      ),
    }));

    const userEmailById = new Map(storedUsers.map((user) => [user.id, user.email]));
    const memberEmailsByWorkspaceId = new Map(
      storedCollaborationMemberStates.map((state) => [state.workspaceId, state.memberEmails]),
    );

    const storedCollaborationSpaces: StoredCollaborationSpace[] = collaborationSpaceRows
      .filter((row) => !row.dissolvedAt)
      .map((row) => ({
        id: row.id,
        name: row.name,
        summary: row.summary,
        ownerEmail: userEmailById.get(row.ownerUserId) ?? "",
        memberEmails: memberEmailsByWorkspaceId.get(row.workspaceId) ?? [],
        documentCount: row.documentCount,
        systemFormCount: row.systemFormCount,
        tone: row.tone,
        createdAt: asIso(row.createdAt),
        updatedAt: asIso(row.updatedAt),
      }));

    return {
      version: 1 as const,
      users: storedUsers,
      workspaces: storedWorkspaces,
      sessions: storedSessions,
      documents: storedAssets.filter((asset) => asset.kind === "document"),
      sheets: storedAssets.filter((asset) => asset.kind === "sheet"),
      slides: storedAssets.filter((asset) => asset.kind === "slide"),
      browserStates: storedBrowserStates,
      workspaceBrowserStates: storedSharedStates,
      collaborationSpaces: storedCollaborationSpaces,
      collaborationSpaceMembers: storedCollaborationMemberStates,
      dissolvedCollaborationSpaceIds: collaborationSpaceRows
        .filter((row) => row.dissolvedAt)
        .map((row) => row.id),
    } satisfies AppStore;
  } catch {
    return null;
  }
}
