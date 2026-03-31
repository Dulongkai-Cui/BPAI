import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
};

export const userRoleKeyEnum = pgEnum("user_role_key", [
  "dispatcher",
  "document_editor",
  "comment_reviewer",
  "system_admin",
]);

export const workspaceKindEnum = pgEnum("workspace_kind", [
  "personal",
  "collaboration",
]);

export const workspaceVisibilityEnum = pgEnum("workspace_visibility", [
  "private",
  "shared",
]);

export const contentKindEnum = pgEnum("content_kind", [
  "document",
  "sheet",
  "slide",
]);

export const folderToneEnum = pgEnum("folder_tone", [
  "blue",
  "amber",
  "emerald",
  "slate",
  "violet",
  "rose",
]);

export const folderIconEnum = pgEnum("folder_icon", [
  "folder",
  "archive",
  "bookmark",
  "briefcase",
  "spark",
]);

export const viewModeEnum = pgEnum("workspace_view_mode", [
  "small",
  "medium",
  "large",
  "list",
]);

export const folderScopeEnum = pgEnum("folder_scope", ["personal", "workspace"]);

export const collaborationToneEnum = pgEnum("collaboration_tone", [
  "blue",
  "amber",
  "emerald",
  "violet",
]);

export const workspaceMemberRoleEnum = pgEnum("workspace_member_role", [
  "owner",
  "member",
  "viewer",
]);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    roleKey: userRoleKeyEnum("role_key").notNull(),
    roleLabel: text("role_label").notNull(),
    teamLabel: text("team_label").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    primaryWorkspaceId: text("primary_workspace_id").references(
      (): AnyPgColumn => workspaces.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    index("users_primary_workspace_idx").on(table.primaryWorkspaceId),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: workspaceKindEnum("kind").notNull(),
    ownerUserId: text("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    visibility: workspaceVisibilityEnum("visibility").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>().default(null),
    ...timestamps,
  },
  (table) => [
    index("workspaces_owner_idx").on(table.ownerUserId),
    index("workspaces_kind_idx").on(table.kind),
  ],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memberRole: workspaceMemberRoleEnum("member_role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("workspace_members_workspace_user_unique").on(
      table.workspaceId,
      table.userId,
    ),
    index("workspace_members_workspace_idx").on(table.workspaceId),
    index("workspace_members_user_idx").on(table.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
    index("sessions_expires_idx").on(table.expiresAt),
  ],
);

export const contentAssets = pgTable(
  "content_assets",
  {
    id: text("id").primaryKey(),
    kind: contentKindEnum("kind").notNull(),
    title: text("title").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    originalFileName: text("original_file_name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    fileHash: text("file_hash"),
    trashedAt: timestamp("trashed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>().default(null),
    ...timestamps,
  },
  (table) => [
    index("content_assets_workspace_idx").on(table.workspaceId),
    index("content_assets_owner_idx").on(table.ownerUserId),
    index("content_assets_kind_idx").on(table.kind),
  ],
);

export const folderNodes = pgTable(
  "folder_nodes",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    contentKind: contentKindEnum("content_kind").notNull(),
    scope: folderScopeEnum("scope").notNull(),
    parentFolderId: text("parent_folder_id").references(
      (): AnyPgColumn => folderNodes.id,
      { onDelete: "cascade" },
    ),
    systemKey: text("system_key"),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    tone: folderToneEnum("tone").notNull(),
    icon: folderIconEnum("icon").notNull().default("folder"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("folder_nodes_workspace_idx").on(table.workspaceId),
    index("folder_nodes_parent_idx").on(table.parentFolderId),
    index("folder_nodes_owner_idx").on(table.ownerUserId),
    index("folder_nodes_kind_idx").on(table.contentKind),
  ],
);

export const filePlacements = pgTable(
  "file_placements",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => contentAssets.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    rootFolderId: text("root_folder_id")
      .notNull()
      .references(() => folderNodes.id, { onDelete: "cascade" }),
    innerFolderId: text("inner_folder_id").references(() => folderNodes.id, {
      onDelete: "set null",
    }),
    titleOverride: text("title_override"),
    isTrashed: boolean("is_trashed").notNull().default(false),
    isDeleted: boolean("is_deleted").notNull().default(false),
    trashedAt: timestamp("trashed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("file_placements_asset_unique").on(table.assetId),
    index("file_placements_workspace_idx").on(table.workspaceId),
    index("file_placements_root_folder_idx").on(table.rootFolderId),
    index("file_placements_inner_folder_idx").on(table.innerFolderId),
  ],
);

export const userWorkspaceViewStates = pgTable(
  "user_workspace_view_states",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contentKind: contentKindEnum("content_kind").notNull(),
    activeRootFolderId: text("active_root_folder_id").references(
      () => folderNodes.id,
      { onDelete: "set null" },
    ),
    activeInnerFolderId: text("active_inner_folder_id").references(
      () => folderNodes.id,
      { onDelete: "set null" },
    ),
    folderViewMode: viewModeEnum("folder_view_mode"),
    payload: jsonb("payload").$type<Record<string, unknown> | null>().default(null),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_workspace_view_states_scope_unique").on(
      table.userId,
      table.workspaceId,
      table.contentKind,
    ),
    index("user_workspace_view_states_workspace_idx").on(table.workspaceId),
  ],
);

export const workspaceSharedStates = pgTable(
  "workspace_shared_states",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contentKind: contentKindEnum("content_kind").notNull(),
    activeRootFolderId: text("active_root_folder_id").references(
      () => folderNodes.id,
      { onDelete: "set null" },
    ),
    activeInnerFolderId: text("active_inner_folder_id").references(
      () => folderNodes.id,
      { onDelete: "set null" },
    ),
    folderViewMode: viewModeEnum("folder_view_mode"),
    payload: jsonb("payload").$type<Record<string, unknown> | null>().default(null),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspace_shared_states_scope_unique").on(
      table.workspaceId,
      table.contentKind,
    ),
    index("workspace_shared_states_workspace_idx").on(table.workspaceId),
  ],
);

export const collaborationSpaces = pgTable(
  "collaboration_spaces",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    summary: text("summary").notNull().default(""),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tone: collaborationToneEnum("tone").notNull(),
    documentCount: integer("document_count").notNull().default(0),
    systemFormCount: integer("system_form_count").notNull().default(0),
    dissolvedAt: timestamp("dissolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("collaboration_spaces_workspace_unique").on(table.workspaceId),
    index("collaboration_spaces_owner_idx").on(table.ownerUserId),
  ],
);
