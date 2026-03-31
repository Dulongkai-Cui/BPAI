import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://bpai:bpai@localhost:5433/bpai_dev";
const storePath =
  process.env.BPAI_STORE_PATH ?? path.join(process.cwd(), ".bpai", "app-store.json");
const shouldReset = process.argv.includes("--reset");

const knownSpaceDefinitions = {
  "space-bridge-review": {
    name: "桥梁送审联动区",
    summary: "送审资料、联审批注和回传结果集中协同。",
    ownerEmail: "dulongkai.cui@akane.waseda.jp",
    tone: "blue",
  },
  "space-design-review": {
    name: "设计联审区",
    summary: "设计院、工程组和项目负责人共用的联审空间。",
    ownerEmail: "li.gong@bpai.local",
    tone: "violet",
  },
  "space-storage-ops": {
    name: "仓储运营区",
    summary: "仓库表、材料清单和库存快照集中管理。",
    ownerEmail: "lin.min@bpai.local",
    tone: "amber",
  },
  "space-field-execution": {
    name: "工程异常跟进区",
    summary: "现场问题、施工队反馈和异常工单跟进集中处理。",
    ownerEmail: "zhou.yu@bpai.local",
    tone: "emerald",
  },
};

const knownRootFolderDefinitions = {
  "recent-uploads": {
    name: "最近上传",
    description: "个人工作区真实上传文件。",
    tone: "violet",
    icon: "briefcase",
  },
  "workspace-recent-uploads": {
    name: "空间上传",
    description: "合作空间最近上传资料。",
    tone: "slate",
    icon: "archive",
  },
  "weekly-reports": {
    name: "工程周报",
    description: "本周进度、风险与待办汇总。",
    tone: "blue",
    icon: "folder",
  },
  "submission-packs": {
    name: "送审资料包",
    description: "待送审和补件中的项目资料。",
    tone: "amber",
    icon: "folder",
  },
  "acceptance-files": {
    name: "验收归档",
    description: "验收记录、照片与签字材料。",
    tone: "emerald",
    icon: "folder",
  },
  "sheet-workbooks": {
    name: "表格归档",
    description: "台账、清单与跟踪表统一放置。",
    tone: "violet",
    icon: "briefcase",
  },
  "square-public": {
    name: "文档广场",
    description: "对外共享的方案、说明和通知资料。",
    tone: "blue",
    icon: "folder",
  },
  "system-forms": {
    name: "系统文档",
    description: "受控业务表单与主文件入口。",
    tone: "amber",
    icon: "briefcase",
  },
  "meeting-notes": {
    name: "留言资料",
    description: "会议纪要、批注意见和补件记录。",
    tone: "emerald",
    icon: "bookmark",
  },
  "design-square": {
    name: "文档广场",
    description: "设计说明、方案稿与共享汇报。",
    tone: "violet",
    icon: "folder",
  },
  "design-system": {
    name: "系统文档",
    description: "联审总表和设计回写主表。",
    tone: "blue",
    icon: "briefcase",
  },
  "storage-system": {
    name: "系统文档",
    description: "库存主表与缺项追踪。",
    tone: "amber",
    icon: "briefcase",
  },
  "storage-square": {
    name: "文档广场",
    description: "仓储制度、通知与照片记录。",
    tone: "emerald",
    icon: "folder",
  },
  "workspace-square": {
    name: "文档广场",
    description: "共享说明、通知与公开协作资料。",
    tone: "blue",
    icon: "folder",
  },
  "workspace-system": {
    name: "系统文档",
    description: "需要受控编辑和后续回写的业务文件。",
    tone: "amber",
    icon: "briefcase",
  },
  "workspace-board": {
    name: "留言资料",
    description: "会议纪要、沟通补件和留言沉淀。",
    tone: "emerald",
    icon: "bookmark",
  },
};

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

function safeJsonParse(source) {
  return JSON.parse(source);
}

function fallbackWorkspaceName(workspaceId) {
  if (workspaceId.startsWith("workspace-personal-")) {
    return workspaceId;
  }

  return knownSpaceDefinitions[workspaceId]?.name ?? workspaceId;
}

function fallbackWorkspaceSummary(workspaceId) {
  return knownSpaceDefinitions[workspaceId]?.summary ?? "";
}

function fallbackWorkspaceTone(workspaceId) {
  return knownSpaceDefinitions[workspaceId]?.tone ?? "blue";
}

function buildRootNodeId(scope, kind, workspaceId, legacyId) {
  return `root:${scope}:${kind}:${workspaceId}:${legacyId}`;
}

function buildInnerNodeId(scope, kind, workspaceId, legacyId) {
  return `inner:${scope}:${kind}:${workspaceId}:${legacyId}`;
}

function fallbackFolderLabel(legacyId) {
  return legacyId.replace(/[-_]+/g, " ").trim() || legacyId;
}

function pickLater(left, right) {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function pickEarlier(left, right) {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function addWorkspaceCandidate(map, candidate) {
  const current = map.get(candidate.id);

  if (!current) {
    map.set(candidate.id, {
      ...candidate,
      sourceTags: unique(candidate.sourceTags ?? []),
    });
    return;
  }

  map.set(candidate.id, {
    ...current,
    name:
      current.name && current.name !== current.id
        ? current.name
        : candidate.name ?? current.name,
    kind: current.kind ?? candidate.kind,
    visibility: current.visibility ?? candidate.visibility,
    ownerUserId: current.ownerUserId ?? candidate.ownerUserId ?? null,
    ownerEmail: current.ownerEmail ?? candidate.ownerEmail ?? null,
    summary: current.summary || candidate.summary || "",
    tone: current.tone ?? candidate.tone ?? "blue",
    createdAt: pickEarlier(current.createdAt, candidate.createdAt),
    updatedAt: pickLater(current.updatedAt, candidate.updatedAt),
    sourceTags: unique([...(current.sourceTags ?? []), ...(candidate.sourceTags ?? [])]),
    metadata: {
      ...(current.metadata ?? {}),
      ...(candidate.metadata ?? {}),
    },
  });
}

function buildWorkspaceCandidates(store) {
  const candidates = new Map();

  for (const workspace of store.workspaces) {
    addWorkspaceCandidate(candidates, {
      id: workspace.id,
      name: workspace.name,
      kind: workspace.kind,
      visibility: workspace.visibility,
      ownerUserId: workspace.ownerUserId ?? null,
      ownerEmail: null,
      summary: "",
      tone: "blue",
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      sourceTags: ["store.workspace"],
      metadata: {
        importSource: "app-store",
      },
    });
  }

  for (const space of store.collaborationSpaces) {
    addWorkspaceCandidate(candidates, {
      id: space.id,
      name: space.name,
      kind: "collaboration",
      visibility: "shared",
      ownerUserId: null,
      ownerEmail: normalizeEmail(space.ownerEmail),
      summary: space.summary,
      tone: space.tone,
      createdAt: space.createdAt,
      updatedAt: space.updatedAt,
      sourceTags: ["store.collaborationSpace"],
      metadata: {
        importSource: "app-store",
        systemFormCount: space.systemFormCount,
        documentCount: space.documentCount,
      },
    });
  }

  for (const state of [...store.browserStates, ...store.workspaceBrowserStates]) {
    if (candidates.has(state.workspaceId)) {
      continue;
    }

    addWorkspaceCandidate(candidates, {
      id: state.workspaceId,
      name: fallbackWorkspaceName(state.workspaceId),
      kind: "collaboration",
      visibility: "shared",
      ownerUserId: null,
      ownerEmail: knownSpaceDefinitions[state.workspaceId]?.ownerEmail ?? null,
      summary: fallbackWorkspaceSummary(state.workspaceId),
      tone: fallbackWorkspaceTone(state.workspaceId),
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      sourceTags: [
        "store.browserState-derived",
        "store.workspaceBrowserState-derived",
      ],
      metadata: {
        importSource: "derived-from-browser-state",
      },
    });
  }

  for (const memberState of store.collaborationSpaceMembers) {
    if (candidates.has(memberState.workspaceId)) {
      continue;
    }

    addWorkspaceCandidate(candidates, {
      id: memberState.workspaceId,
      name: fallbackWorkspaceName(memberState.workspaceId),
      kind: "collaboration",
      visibility: "shared",
      ownerUserId: null,
      ownerEmail: knownSpaceDefinitions[memberState.workspaceId]?.ownerEmail ?? null,
      summary: fallbackWorkspaceSummary(memberState.workspaceId),
      tone: fallbackWorkspaceTone(memberState.workspaceId),
      createdAt: memberState.createdAt,
      updatedAt: memberState.updatedAt,
      sourceTags: ["store.collaborationMember-derived"],
      metadata: {
        importSource: "derived-from-collaboration-members",
      },
    });
  }

  return [...candidates.values()];
}

function buildWorkspaceRows(workspaceCandidates, userIdByEmail) {
  return workspaceCandidates.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    kind: workspace.kind,
    owner_user_id:
      workspace.ownerUserId ??
      (workspace.ownerEmail ? userIdByEmail.get(workspace.ownerEmail) ?? null : null),
    visibility: workspace.visibility,
    metadata: {
      ...(workspace.metadata ?? {}),
      summary: workspace.summary,
      tone: workspace.tone,
      sourceTags: workspace.sourceTags,
      legacyOwnerEmail: workspace.ownerEmail ?? null,
    },
    created_at: workspace.createdAt,
    updated_at: workspace.updatedAt,
  }));
}

function buildWorkspaceMemberRows(store, workspaceCandidates, userIdByEmail) {
  const rows = new Map();
  const workspaceById = new Map(workspaceCandidates.map((workspace) => [workspace.id, workspace]));

  const addMemberRow = ({ workspaceId, userId, memberRole, joinedAt, updatedAt }) => {
    const id = `workspace-member:${workspaceId}:${userId}`;
    rows.set(id, {
      id,
      workspace_id: workspaceId,
      user_id: userId,
      member_role: memberRole,
      joined_at: joinedAt,
      updated_at: updatedAt,
    });
  };

  for (const workspace of workspaceCandidates) {
    const ownerUserId =
      workspace.ownerUserId ??
      (workspace.ownerEmail ? userIdByEmail.get(workspace.ownerEmail) ?? null : null);

    if (!ownerUserId) {
      continue;
    }

    addMemberRow({
      workspaceId: workspace.id,
      userId: ownerUserId,
      memberRole: "owner",
      joinedAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    });
  }

  const memberEmailMap = new Map();

  for (const space of store.collaborationSpaces) {
    memberEmailMap.set(space.id, unique(space.memberEmails.map(normalizeEmail)));
  }

  for (const memberState of store.collaborationSpaceMembers) {
    memberEmailMap.set(memberState.workspaceId, unique(memberState.memberEmails.map(normalizeEmail)));
  }

  const skippedEmails = [];

  for (const [workspaceId, memberEmails] of memberEmailMap.entries()) {
    const workspace = workspaceById.get(workspaceId);
    const ownerUserId =
      workspace?.ownerUserId ??
      (workspace?.ownerEmail ? userIdByEmail.get(workspace.ownerEmail) ?? null : null);

    for (const email of memberEmails) {
      const userId = userIdByEmail.get(email);

      if (!userId) {
        skippedEmails.push({ workspaceId, email });
        continue;
      }

      addMemberRow({
        workspaceId,
        userId,
        memberRole: ownerUserId === userId ? "owner" : "member",
        joinedAt: workspace?.createdAt ?? new Date().toISOString(),
        updatedAt: workspace?.updatedAt ?? new Date().toISOString(),
      });
    }
  }

  return {
    rows: [...rows.values()],
    skippedEmails,
  };
}

function ensureRootFolderRow(params) {
  const {
    rootRows,
    rootIdMap,
    scope,
    kind,
    workspaceId,
    ownerUserId,
    legacyId,
    source,
    fallbackCreatedAt,
    fallbackUpdatedAt,
    deletedFolderIds,
  } = params;

  const mapKey = `${scope}|${kind}|${workspaceId}|${legacyId}`;

  if (rootIdMap.has(mapKey)) {
    return rootIdMap.get(mapKey);
  }

  const dbId = buildRootNodeId(scope, kind, workspaceId, legacyId);
  const folderDef = knownRootFolderDefinitions[legacyId] ?? {};
  const isCustom = source?.type === "custom";

  rootRows.push({
    id: dbId,
    workspace_id: workspaceId,
    owner_user_id: scope === "personal" ? ownerUserId ?? null : null,
    content_kind: kind,
    scope,
    parent_folder_id: null,
    system_key: isCustom ? null : legacyId,
    name: source?.name ?? folderDef.name ?? fallbackFolderLabel(legacyId),
    description: source?.description ?? folderDef.description ?? "",
    tone: source?.tone ?? folderDef.tone ?? "slate",
    icon: source?.icon ?? folderDef.icon ?? "folder",
    deleted_at: deletedFolderIds.has(legacyId) ? fallbackUpdatedAt : null,
    created_at: source?.createdAt ?? fallbackCreatedAt,
    updated_at: source?.updatedAt ?? fallbackUpdatedAt,
  });

  rootIdMap.set(mapKey, dbId);
  return dbId;
}

function buildFolderRows(store, workspaceCandidates) {
  const rootRows = [];
  const innerRows = [];
  const rootIdMap = new Map();
  const innerIdMap = new Map();
  const workspaceKindById = new Map(workspaceCandidates.map((workspace) => [workspace.id, workspace.kind]));

  const browserStates = [
    ...store.browserStates.map((state) => ({ ...state, scope: "personal" })),
    ...store.workspaceBrowserStates.map((state) => ({ ...state, scope: "workspace", ownerUserId: null })),
  ];

  for (const state of browserStates) {
    const deletedFolderIds = new Set(state.deletedFolderIds ?? []);
    const customFolderMap = new Map((state.customFolders ?? []).map((folder) => [folder.id, folder]));
    const referencedRootIds = new Set([
      ...(state.deletedFolderIds ?? []),
      ...(state.innerFolders ?? []).map((folder) => folder.parentFolderId),
      ...(state.fileStates ?? []).map((fileState) => fileState.folderId),
      ...((state.boardMessages ?? []).map((message) => message.folderId)),
      ...(state.activeFolderId && state.activeFolderId !== "all" ? [state.activeFolderId] : []),
    ]);

    for (const legacyRootId of referencedRootIds) {
      ensureRootFolderRow({
        rootRows,
        rootIdMap,
        scope: state.scope,
        kind: state.kind,
        workspaceId: state.workspaceId,
        ownerUserId: state.ownerUserId,
        legacyId: legacyRootId,
        source: customFolderMap.has(legacyRootId)
          ? { type: "custom", ...customFolderMap.get(legacyRootId) }
          : null,
        fallbackCreatedAt: state.createdAt,
        fallbackUpdatedAt: state.updatedAt,
        deletedFolderIds,
      });
    }

    for (const innerFolder of state.innerFolders ?? []) {
      const parentRootDbId = ensureRootFolderRow({
        rootRows,
        rootIdMap,
        scope: state.scope,
        kind: state.kind,
        workspaceId: state.workspaceId,
        ownerUserId: state.ownerUserId,
        legacyId: innerFolder.parentFolderId,
        source: customFolderMap.has(innerFolder.parentFolderId)
          ? { type: "custom", ...customFolderMap.get(innerFolder.parentFolderId) }
          : null,
        fallbackCreatedAt: state.createdAt,
        fallbackUpdatedAt: state.updatedAt,
        deletedFolderIds,
      });

      const dbId = buildInnerNodeId(
        state.scope,
        state.kind,
        state.workspaceId,
        innerFolder.id,
      );
      const mapKey = `${state.scope}|${state.kind}|${state.workspaceId}|${innerFolder.id}`;
      const parentKey = innerFolder.parentInnerFolderId
        ? `${state.scope}|${state.kind}|${state.workspaceId}|${innerFolder.parentInnerFolderId}`
        : null;

      innerIdMap.set(mapKey, dbId);

      innerRows.push({
        id: dbId,
        workspace_id: state.workspaceId,
        owner_user_id: state.scope === "personal" ? state.ownerUserId ?? null : null,
        content_kind: state.kind,
        scope: state.scope,
        parent_folder_id: parentKey ? innerIdMap.get(parentKey) ?? parentRootDbId : parentRootDbId,
        system_key: null,
        name: innerFolder.name,
        description: innerFolder.description ?? "",
        tone: innerFolder.tone,
        icon: innerFolder.icon ?? "folder",
        deleted_at: deletedFolderIds.has(innerFolder.id) ? state.updatedAt : null,
        created_at: innerFolder.createdAt,
        updated_at: innerFolder.updatedAt,
      });
    }
  }

  const uniqueAssets = [...store.documents, ...store.sheets, ...store.slides];
  for (const asset of uniqueAssets) {
    const workspaceKind = workspaceKindById.get(asset.workspaceId) ?? "personal";
    const scope = workspaceKind === "collaboration" ? "workspace" : "personal";
    const defaultLegacyRootId =
      scope === "workspace" ? "workspace-recent-uploads" : asset.folderId ?? "recent-uploads";

    ensureRootFolderRow({
      rootRows,
      rootIdMap,
      scope,
      kind: "document",
      workspaceId: asset.workspaceId,
      ownerUserId: asset.ownerUserId,
      legacyId: defaultLegacyRootId,
      source: null,
      fallbackCreatedAt: asset.createdAt,
      fallbackUpdatedAt: asset.updatedAt,
      deletedFolderIds: new Set(),
    });
  }

  return {
    rootRows,
    innerRows,
    rootIdMap,
    innerIdMap,
  };
}

function buildContentAssetRows(store) {
  return [...store.documents, ...store.sheets, ...store.slides].map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    title: asset.title,
    owner_user_id: asset.ownerUserId,
    workspace_id: asset.workspaceId,
    original_file_name: asset.originalFileName,
    mime_type: asset.mimeType ?? null,
    size_bytes: asset.sizeBytes,
    storage_key: asset.storedRelativePath,
    current_version: 1,
    file_hash: null,
    trashed_at: asset.trashedAt ?? null,
    metadata: {
      importSource: "app-store",
      legacyFolderId: asset.folderId ?? null,
      storedFileName: asset.storedFileName,
      storedRelativePath: asset.storedRelativePath,
    },
    created_at: asset.createdAt,
    updated_at: asset.updatedAt,
  }));
}

function buildPlacementRows(store, workspaceCandidates, rootIdMap, innerIdMap) {
  const workspaceKindById = new Map(workspaceCandidates.map((workspace) => [workspace.id, workspace.kind]));
  const assets = [...store.documents, ...store.sheets, ...store.slides];
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const placements = new Map();

  const setPlacement = ({ asset, scope, kindScope, legacyRootId, legacyInnerId, fromState }) => {
    const rootKey = `${scope}|${kindScope}|${asset.workspaceId}|${legacyRootId}`;
    const innerKey = legacyInnerId
      ? `${scope}|${kindScope}|${asset.workspaceId}|${legacyInnerId}`
      : null;

    placements.set(asset.id, {
      id: `placement:${asset.id}`,
      asset_id: asset.id,
      workspace_id: asset.workspaceId,
      root_folder_id: rootIdMap.get(rootKey) ?? null,
      inner_folder_id: innerKey ? innerIdMap.get(innerKey) ?? null : null,
      title_override: fromState?.titleOverride ?? null,
      is_trashed: Boolean(fromState?.isTrashed ?? asset.trashedAt),
      is_deleted: Boolean(fromState?.isDeleted ?? false),
      trashed_at: fromState?.trashedAt ?? asset.trashedAt ?? null,
      updated_at: fromState?.updatedAt ?? asset.updatedAt,
    });
  };

  for (const asset of assets) {
    const workspaceKind = workspaceKindById.get(asset.workspaceId) ?? "personal";
    const scope = workspaceKind === "collaboration" ? "workspace" : "personal";
    const legacyRootId =
      scope === "workspace" ? "workspace-recent-uploads" : asset.folderId ?? "recent-uploads";

    setPlacement({
      asset,
      scope,
      kindScope: "document",
      legacyRootId,
      legacyInnerId: null,
      fromState: null,
    });
  }

  for (const state of store.workspaceBrowserStates) {
    for (const fileState of state.fileStates ?? []) {
      const asset = assetMap.get(fileState.fileId);

      if (!asset) {
        continue;
      }

      setPlacement({
        asset,
        scope: "workspace",
        kindScope: state.kind,
        legacyRootId: fileState.folderId,
        legacyInnerId: fileState.subfolderId ?? null,
        fromState: fileState,
      });
    }
  }

  for (const state of store.browserStates) {
    const workspaceKind = workspaceKindById.get(state.workspaceId) ?? "personal";

    if (workspaceKind !== "personal") {
      continue;
    }

    for (const fileState of state.fileStates ?? []) {
      const asset = assetMap.get(fileState.fileId);

      if (!asset) {
        continue;
      }

      setPlacement({
        asset,
        scope: "personal",
        kindScope: state.kind,
        legacyRootId: fileState.folderId,
        legacyInnerId: fileState.subfolderId ?? null,
        fromState: fileState,
      });
    }
  }

  return [...placements.values()].filter((row) => row.root_folder_id);
}

function buildUserWorkspaceViewStateRows(store, rootIdMap, innerIdMap) {
  return store.browserStates.map((state) => ({
    id: state.id,
    user_id: state.ownerUserId,
    workspace_id: state.workspaceId,
    content_kind: state.kind,
    active_root_folder_id:
      state.activeFolderId && state.activeFolderId !== "all"
        ? rootIdMap.get(`personal|${state.kind}|${state.workspaceId}|${state.activeFolderId}`) ?? null
        : null,
    active_inner_folder_id: state.activeInnerFolderId
      ? innerIdMap.get(`personal|${state.kind}|${state.workspaceId}|${state.activeInnerFolderId}`) ??
        null
      : null,
    folder_view_mode: state.folderViewMode ?? null,
    payload: {
      importSource: "app-store",
      deletedFolderIds: state.deletedFolderIds ?? [],
      rawFileStates: state.fileStates ?? [],
    },
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  }));
}

function buildWorkspaceSharedStateRows(store, rootIdMap, innerIdMap) {
  return store.workspaceBrowserStates.map((state) => ({
    id: state.id,
    workspace_id: state.workspaceId,
    content_kind: state.kind,
    active_root_folder_id: null,
    active_inner_folder_id: null,
    folder_view_mode: null,
    payload: {
      importSource: "app-store",
      deletedFolderIds: state.deletedFolderIds ?? [],
      boardMessages: state.boardMessages ?? [],
      rawFileStates: state.fileStates ?? [],
      rootFolderIds: unique([
        ...(state.innerFolders ?? []).map((folder) => folder.parentFolderId),
        ...(state.fileStates ?? []).map((fileState) => fileState.folderId),
        ...((state.boardMessages ?? []).map((message) => message.folderId)),
      ]),
      knownRootFolderDbIds: unique([
        ...(state.fileStates ?? [])
          .map((fileState) =>
            rootIdMap.get(`workspace|${state.kind}|${state.workspaceId}|${fileState.folderId}`) ??
            null,
          )
          .filter(Boolean),
        ...(state.innerFolders ?? [])
          .map((folder) =>
            rootIdMap.get(`workspace|${state.kind}|${state.workspaceId}|${folder.parentFolderId}`) ??
            null,
          )
          .filter(Boolean),
        ...(state.boardMessages ?? [])
          .map((message) =>
            rootIdMap.get(`workspace|${state.kind}|${state.workspaceId}|${message.folderId}`) ??
            null,
          )
          .filter(Boolean),
      ]),
      knownInnerFolderDbIds: unique(
        (state.innerFolders ?? [])
          .map((folder) =>
            innerIdMap.get(`workspace|${state.kind}|${state.workspaceId}|${folder.id}`) ?? null,
          )
          .filter(Boolean),
      ),
    },
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  }));
}

function buildCollaborationSpaceRows(store, userIdByEmail) {
  const skipped = [];
  const rows = [];

  for (const space of store.collaborationSpaces) {
    const ownerUserId = userIdByEmail.get(normalizeEmail(space.ownerEmail));

    if (!ownerUserId) {
      skipped.push({
        id: space.id,
        ownerEmail: space.ownerEmail,
      });
      continue;
    }

    rows.push({
      id: space.id,
      workspace_id: space.id,
      name: space.name,
      summary: space.summary,
      owner_user_id: ownerUserId,
      tone: space.tone,
      document_count: space.documentCount,
      system_form_count: space.systemFormCount,
      dissolved_at: null,
      created_at: space.createdAt,
      updated_at: space.updatedAt,
    });
  }

  return { rows, skipped };
}

async function upsertRow(client, tableName, columns, conflictColumns, row) {
  const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
  const values = columns.map((column) => (row[column] === undefined ? null : row[column]));
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  const updateClause = updateColumns
    .map((column) => `"${column}" = EXCLUDED."${column}"`)
    .join(", ");

  const sql = `
    insert into "${tableName}" (${columns.map((column) => `"${column}"`).join(", ")})
    values (${placeholders})
    on conflict (${conflictColumns.map((column) => `"${column}"`).join(", ")})
    do update set ${updateClause}
  `;

  await client.query(sql, values);
}

async function countRows(client, tableName) {
  const result = await client.query(`select count(*)::int as count from "${tableName}"`);
  return result.rows[0]?.count ?? 0;
}

const pool = new Pool({
  connectionString: databaseUrl,
});

try {
  const store = safeJsonParse(await readFile(storePath, "utf8"));
  const userIdByEmail = new Map(store.users.map((user) => [normalizeEmail(user.email), user.id]));
  const workspaceCandidates = buildWorkspaceCandidates(store);
  const workspaceRows = buildWorkspaceRows(workspaceCandidates, userIdByEmail);
  const workspaceMemberResult = buildWorkspaceMemberRows(store, workspaceCandidates, userIdByEmail);
  const contentAssetRows = buildContentAssetRows(store);
  const folderResult = buildFolderRows(store, workspaceCandidates);
  const filePlacementRows = buildPlacementRows(
    store,
    workspaceCandidates,
    folderResult.rootIdMap,
    folderResult.innerIdMap,
  );
  const userWorkspaceViewStateRows = buildUserWorkspaceViewStateRows(
    store,
    folderResult.rootIdMap,
    folderResult.innerIdMap,
  );
  const workspaceSharedStateRows = buildWorkspaceSharedStateRows(
    store,
    folderResult.rootIdMap,
    folderResult.innerIdMap,
  );
  const collaborationSpaceResult = buildCollaborationSpaceRows(store, userIdByEmail);

  const client = await pool.connect();

  try {
    await client.query("begin");

    if (shouldReset) {
      await client.query(`
        truncate table
          "collaboration_spaces",
          "workspace_shared_states",
          "user_workspace_view_states",
          "file_placements",
          "folder_nodes",
          "workspace_members",
          "sessions",
          "content_assets",
          "users",
          "workspaces"
        restart identity cascade
      `);
    }

    for (const workspace of workspaceRows) {
      await upsertRow(
        client,
        "workspaces",
        ["id", "name", "kind", "owner_user_id", "visibility", "metadata", "created_at", "updated_at"],
        ["id"],
        {
          ...workspace,
          owner_user_id: null,
        },
      );
    }

    for (const user of store.users) {
      await upsertRow(
        client,
        "users",
        [
          "id",
          "name",
          "email",
          "role_key",
          "role_label",
          "team_label",
          "password_hash",
          "password_salt",
          "primary_workspace_id",
          "created_at",
          "updated_at",
        ],
        ["id"],
        {
          id: user.id,
          name: user.name,
          email: normalizeEmail(user.email),
          role_key: user.roleKey,
          role_label: user.roleLabel,
          team_label: user.teamLabel,
          password_hash: user.passwordHash,
          password_salt: user.passwordSalt,
          primary_workspace_id: user.primaryWorkspaceId,
          created_at: user.createdAt,
          updated_at: user.updatedAt,
        },
      );
    }

    for (const workspace of workspaceRows) {
      await upsertRow(
        client,
        "workspaces",
        ["id", "name", "kind", "owner_user_id", "visibility", "metadata", "created_at", "updated_at"],
        ["id"],
        workspace,
      );
    }

    for (const row of workspaceMemberResult.rows) {
      await upsertRow(
        client,
        "workspace_members",
        ["id", "workspace_id", "user_id", "member_role", "joined_at", "updated_at"],
        ["id"],
        row,
      );
    }

    for (const session of store.sessions) {
      await upsertRow(
        client,
        "sessions",
        ["id", "user_id", "created_at", "expires_at", "last_seen_at"],
        ["id"],
        {
          id: session.id,
          user_id: session.userId,
          created_at: session.createdAt,
          expires_at: session.expiresAt,
          last_seen_at: session.lastSeenAt,
        },
      );
    }

    for (const row of contentAssetRows) {
      await upsertRow(
        client,
        "content_assets",
        [
          "id",
          "kind",
          "title",
          "owner_user_id",
          "workspace_id",
          "original_file_name",
          "mime_type",
          "size_bytes",
          "storage_key",
          "current_version",
          "file_hash",
          "trashed_at",
          "metadata",
          "created_at",
          "updated_at",
        ],
        ["id"],
        row,
      );
    }

    for (const row of folderResult.rootRows) {
      await upsertRow(
        client,
        "folder_nodes",
        [
          "id",
          "workspace_id",
          "owner_user_id",
          "content_kind",
          "scope",
          "parent_folder_id",
          "system_key",
          "name",
          "description",
          "tone",
          "icon",
          "deleted_at",
          "created_at",
          "updated_at",
        ],
        ["id"],
        row,
      );
    }

    for (const row of folderResult.innerRows) {
      await upsertRow(
        client,
        "folder_nodes",
        [
          "id",
          "workspace_id",
          "owner_user_id",
          "content_kind",
          "scope",
          "parent_folder_id",
          "system_key",
          "name",
          "description",
          "tone",
          "icon",
          "deleted_at",
          "created_at",
          "updated_at",
        ],
        ["id"],
        row,
      );
    }

    for (const row of filePlacementRows) {
      await upsertRow(
        client,
        "file_placements",
        [
          "id",
          "asset_id",
          "workspace_id",
          "root_folder_id",
          "inner_folder_id",
          "title_override",
          "is_trashed",
          "is_deleted",
          "trashed_at",
          "updated_at",
        ],
        ["id"],
        row,
      );
    }

    for (const row of userWorkspaceViewStateRows) {
      await upsertRow(
        client,
        "user_workspace_view_states",
        [
          "id",
          "user_id",
          "workspace_id",
          "content_kind",
          "active_root_folder_id",
          "active_inner_folder_id",
          "folder_view_mode",
          "payload",
          "created_at",
          "updated_at",
        ],
        ["id"],
        row,
      );
    }

    for (const row of workspaceSharedStateRows) {
      await upsertRow(
        client,
        "workspace_shared_states",
        [
          "id",
          "workspace_id",
          "content_kind",
          "active_root_folder_id",
          "active_inner_folder_id",
          "folder_view_mode",
          "payload",
          "created_at",
          "updated_at",
        ],
        ["id"],
        row,
      );
    }

    for (const row of collaborationSpaceResult.rows) {
      await upsertRow(
        client,
        "collaboration_spaces",
        [
          "id",
          "workspace_id",
          "name",
          "summary",
          "owner_user_id",
          "tone",
          "document_count",
          "system_form_count",
          "dissolved_at",
          "created_at",
          "updated_at",
        ],
        ["id"],
        row,
      );
    }

    await client.query("commit");

    const contentAssetIds = new Set(contentAssetRows.map((asset) => asset.id));
    const sampleFileStateRefs = [
      ...store.browserStates.flatMap((state) => state.fileStates ?? []),
      ...store.workspaceBrowserStates.flatMap((state) => state.fileStates ?? []),
    ].filter((fileState) => !contentAssetIds.has(fileState.fileId)).length;

    console.log(
      JSON.stringify(
        {
          databaseUrl,
          storePath,
          resetApplied: shouldReset,
          prepared: {
            users: store.users.length,
            workspaces: workspaceRows.length,
            workspaceMembers: workspaceMemberResult.rows.length,
            sessions: store.sessions.length,
            contentAssets: contentAssetRows.length,
            folderNodes: folderResult.rootRows.length + folderResult.innerRows.length,
            filePlacements: filePlacementRows.length,
            userWorkspaceViewStates: userWorkspaceViewStateRows.length,
            workspaceSharedStates: workspaceSharedStateRows.length,
            collaborationSpaces: collaborationSpaceResult.rows.length,
          },
          actualCounts: {
            users: await countRows(client, "users"),
            workspaces: await countRows(client, "workspaces"),
            workspaceMembers: await countRows(client, "workspace_members"),
            sessions: await countRows(client, "sessions"),
            contentAssets: await countRows(client, "content_assets"),
            folderNodes: await countRows(client, "folder_nodes"),
            filePlacements: await countRows(client, "file_placements"),
            userWorkspaceViewStates: await countRows(client, "user_workspace_view_states"),
            workspaceSharedStates: await countRows(client, "workspace_shared_states"),
            collaborationSpaces: await countRows(client, "collaboration_spaces"),
          },
          skipped: {
            sampleFileStateRefs,
            collaborationSpacesWithoutKnownOwner: collaborationSpaceResult.skipped,
            workspaceMemberEmailsWithoutKnownUser: workspaceMemberResult.skippedEmails,
            dissolvedCollaborationSpaceIds: store.dissolvedCollaborationSpaceIds,
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
