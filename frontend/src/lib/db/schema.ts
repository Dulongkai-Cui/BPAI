import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  point,
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

export const conversationThreadStatusEnum = pgEnum(
  "conversation_thread_status",
  ["active", "archived"],
);

export const conversationMessageRoleEnum = pgEnum("conversation_message_role", [
  "system",
  "user",
  "assistant",
  "tool",
]);

export const conversationSummaryKindEnum = pgEnum(
  "conversation_summary_kind",
  ["rolling", "snapshot"],
);

export const memoryScopeKindEnum = pgEnum("memory_scope_kind", [
  "user",
  "thread",
  "workspace",
  "collaboration_space",
  "system_form",
  "document",
  "work_order",
]);

export const executionTaskStatusEnum = pgEnum("execution_task_status", [
  "pending",
  "planned",
  "delegated",
  "completed",
  "failed",
  "cancelled",
]);

export const executionExecutorKindEnum = pgEnum("execution_executor_kind", [
  "bp_ask",
  "kimi",
  "longxia",
  "system",
]);

export const executionResultStatusEnum = pgEnum("execution_result_status", [
  "ready",
  "failed",
]);

export const workOrderStageEnum = pgEnum("work_order_stage", [
  "source_intake",
  "registration",
  "dispatch",
  "warning",
  "field_construction",
  "return_sheet",
  "drawing_delivery",
  "resource_entry",
  "resource_audit",
  "design_package",
]);

export const workOrderStatusEnum = pgEnum("work_order_status", [
  "open",
  "in_progress",
  "waiting",
  "blocked",
  "completed",
  "cancelled",
  "archived",
]);

export const workOrderPriorityEnum = pgEnum("work_order_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);

export const workOrderWarningStatusEnum = pgEnum("work_order_warning_status", [
  "normal",
  "warning",
  "critical",
  "resolved",
]);

export const sourceChannelEnum = pgEnum("source_channel", [
  "email",
  "wechat",
  "phone",
  "manual",
  "other",
]);

export const intakeConfirmationStatusEnum = pgEnum(
  "intake_confirmation_status",
  ["pending", "confirmed", "revised"],
);

export const dispatchExecutionStatusEnum = pgEnum(
  "dispatch_execution_status",
  ["pending", "assigned", "in_progress", "paused", "completed", "cancelled"],
);

export const engineeringMemberStatusEnum = pgEnum("engineering_member_status", [
  "available",
  "assigned",
  "on_site",
  "leave",
  "inactive",
]);

export const engineeringSquadStatusEnum = pgEnum("engineering_squad_status", [
  "standby",
  "assigned",
  "in_transit",
  "on_site",
  "paused",
  "archived",
]);

export const engineeringSquadMemberRoleEnum = pgEnum(
  "engineering_squad_member_role",
  ["leader", "member", "reserve"],
);

export const deliveryStageStatusEnum = pgEnum("delivery_stage_status", [
  "pending",
  "in_progress",
  "completed",
  "needs_revision",
  "not_applicable",
]);

export const missingItemStatusEnum = pgEnum("missing_item_status", [
  "open",
  "in_progress",
  "resolved",
  "waived",
]);

export const workOrderDocumentLinkTypeEnum = pgEnum(
  "work_order_document_link_type",
  [
    "source_attachment",
    "dispatch_attachment",
    "construction_evidence",
    "return_sheet",
    "drawing",
    "resource",
    "audit_material",
    "design_package",
    "other",
  ],
);

export const workOrderDocumentTargetTypeEnum = pgEnum(
  "work_order_document_target_type",
  ["asset", "folder_node", "external_ref"],
);

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

export const conversationThreads = pgTable(
  "conversation_threads",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    status: conversationThreadStatusEnum("status").notNull().default("active"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown> | null>()
      .default(null),
    ...timestamps,
  },
  (table) => [
    index("conversation_threads_user_idx").on(table.userId),
    index("conversation_threads_workspace_idx").on(table.workspaceId),
    index("conversation_threads_status_idx").on(table.status),
    index("conversation_threads_last_message_idx").on(table.lastMessageAt),
  ],
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => conversationThreads.id, { onDelete: "cascade" }),
    role: conversationMessageRoleEnum("role").notNull(),
    sequence: integer("sequence").notNull(),
    content: text("content").notNull(),
    tokenEstimate: integer("token_estimate").notNull().default(0),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown> | null>()
      .default(null),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("conversation_messages_thread_sequence_unique").on(
      table.threadId,
      table.sequence,
    ),
    index("conversation_messages_thread_idx").on(table.threadId),
    index("conversation_messages_role_idx").on(table.role),
    index("conversation_messages_created_idx").on(table.createdAt),
  ],
);

export const conversationSummaries = pgTable(
  "conversation_summaries",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => conversationThreads.id, { onDelete: "cascade" }),
    kind: conversationSummaryKindEnum("kind").notNull().default("rolling"),
    summaryText: text("summary_text").notNull(),
    messageCount: integer("message_count").notNull(),
    fromSequence: integer("from_sequence").notNull(),
    toSequence: integer("to_sequence").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown> | null>()
      .default(null),
    ...timestamps,
  },
  (table) => [
    index("conversation_summaries_thread_idx").on(table.threadId),
    index("conversation_summaries_kind_idx").on(table.kind),
    index("conversation_summaries_thread_to_sequence_idx").on(
      table.threadId,
      table.toSequence,
    ),
  ],
);

export const memoryFacts = pgTable(
  "memory_facts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    threadId: text("thread_id").references(() => conversationThreads.id, {
      onDelete: "cascade",
    }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    sourceMessageId: text("source_message_id").references(
      () => conversationMessages.id,
      { onDelete: "set null" },
    ),
    scopeKind: memoryScopeKindEnum("scope_kind").notNull(),
    scopeId: text("scope_id").notNull(),
    factType: text("fact_type").notNull(),
    factKey: text("fact_key").notNull(),
    factValue: text("fact_value").notNull(),
    confidence: integer("confidence").notNull().default(70),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown> | null>()
      .default(null),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("memory_facts_scope_key_unique").on(
      table.scopeKind,
      table.scopeId,
      table.factKey,
    ),
    index("memory_facts_user_idx").on(table.userId),
    index("memory_facts_thread_idx").on(table.threadId),
    index("memory_facts_workspace_idx").on(table.workspaceId),
    index("memory_facts_scope_idx").on(table.scopeKind, table.scopeId),
    index("memory_facts_type_idx").on(table.factType),
  ],
);

export const executionTasks = pgTable(
  "execution_tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => conversationThreads.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    sourceMessageId: text("source_message_id").references(
      () => conversationMessages.id,
      { onDelete: "set null" },
    ),
    status: executionTaskStatusEnum("status").notNull().default("planned"),
    executorKind: executionExecutorKindEnum("executor_kind")
      .notNull()
      .default("bp_ask"),
    primaryIntent: text("primary_intent").notNull(),
    targetDomain: text("target_domain").notNull(),
    executionMode: text("execution_mode").notNull(),
    goal: text("goal").notNull(),
    confidence: integer("confidence").notNull().default(0),
    needsMemory: boolean("needs_memory").notNull().default(false),
    needsTools: boolean("needs_tools").notNull().default(false),
    requiresWrite: boolean("requires_write").notNull().default(false),
    requiresConfirmation: boolean("requires_confirmation")
      .notNull()
      .default(false),
    targetRefs: jsonb("target_refs")
      .$type<Record<string, unknown> | null>()
      .default(null),
    constraints: jsonb("constraints")
      .$type<Record<string, unknown> | null>()
      .default(null),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown> | null>()
      .default(null),
    ...timestamps,
  },
  (table) => [
    index("execution_tasks_thread_idx").on(table.threadId),
    index("execution_tasks_user_idx").on(table.userId),
    index("execution_tasks_status_idx").on(table.status),
    index("execution_tasks_executor_idx").on(table.executorKind),
  ],
);

export const executionResults = pgTable(
  "execution_results",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => executionTasks.id, { onDelete: "cascade" }),
    status: executionResultStatusEnum("status").notNull().default("ready"),
    summaryText: text("summary_text").notNull(),
    responseText: text("response_text").notNull(),
    structuredPayload: jsonb("structured_payload")
      .$type<Record<string, unknown> | null>()
      .default(null),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("execution_results_task_unique").on(table.taskId),
    index("execution_results_status_idx").on(table.status),
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

export const workOrders = pgTable(
  "work_orders",
  {
    id: text("id").primaryKey(),
    workOrderNo: text("work_order_no").notNull(),
    title: text("title").notNull(),
    businessType: text("business_type").notNull().default("general"),
    sourceType: sourceChannelEnum("source_type").notNull().default("manual"),
    sourceSummary: text("source_summary").notNull().default(""),
    projectName: text("project_name").notNull().default(""),
    siteName: text("site_name").notNull().default(""),
    siteAddress: text("site_address").notNull().default(""),
    siteLocation: point("site_location", { mode: "xy" }),
    constructionLocation: point("construction_location", { mode: "xy" }),
    stage: workOrderStageEnum("stage").notNull().default("source_intake"),
    status: workOrderStatusEnum("status").notNull().default("open"),
    priority: workOrderPriorityEnum("priority").notNull().default("normal"),
    warningStatus: workOrderWarningStatusEnum("warning_status")
      .notNull()
      .default("normal"),
    currentResponsibleTeam: text("current_responsible_team").notNull().default(""),
    currentResponsibleUserId: text("current_responsible_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    collaborationSpaceId: text("collaboration_space_id").references(
      () => collaborationSpaces.id,
      { onDelete: "set null" },
    ),
    nextAction: text("next_action").notNull().default(""),
    materialCompleteness: integer("material_completeness").notNull().default(0),
    missingItemCount: integer("missing_item_count").notNull().default(0),
    blockingItemCount: integer("blocking_item_count").notNull().default(0),
    latestProgressSummary: text("latest_progress_summary").notNull().default(""),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>().default(null),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("work_orders_work_order_no_unique").on(table.workOrderNo),
    index("work_orders_stage_idx").on(table.stage),
    index("work_orders_status_idx").on(table.status),
    index("work_orders_priority_idx").on(table.priority),
    index("work_orders_warning_status_idx").on(table.warningStatus),
    index("work_orders_responsible_user_idx").on(table.currentResponsibleUserId),
    index("work_orders_created_by_idx").on(table.createdByUserId),
    index("work_orders_space_idx").on(table.collaborationSpaceId),
  ],
);

export const sourceIntakes = pgTable(
  "source_intakes",
  {
    id: text("id").primaryKey(),
    workOrderId: text("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    sourceChannel: sourceChannelEnum("source_channel").notNull(),
    initiatorName: text("initiator_name").notNull().default(""),
    sourceAccount: text("source_account").notNull().default(""),
    originalMessageSummary: text("original_message_summary").notNull().default(""),
    originalAttachmentRefs: jsonb("original_attachment_refs")
      .$type<Record<string, unknown> | null>()
      .default(null),
    requirementSummary: text("requirement_summary").notNull().default(""),
    extractedProjectName: text("extracted_project_name").notNull().default(""),
    extractedSiteName: text("extracted_site_name").notNull().default(""),
    extractionPayload: jsonb("extraction_payload")
      .$type<Record<string, unknown> | null>()
      .default(null),
    confirmationStatus: intakeConfirmationStatusEnum("confirmation_status")
      .notNull()
      .default("pending"),
    confirmedByUserId: text("confirmed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("source_intakes_work_order_idx").on(table.workOrderId),
    index("source_intakes_channel_idx").on(table.sourceChannel),
    index("source_intakes_confirm_status_idx").on(table.confirmationStatus),
  ],
);

export const dispatchExecutions = pgTable(
  "dispatch_executions",
  {
    id: text("id").primaryKey(),
    workOrderId: text("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    dispatchRound: integer("dispatch_round").notNull().default(1),
    dispatchedByUserId: text("dispatched_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedSquadId: text("assigned_squad_id").references(
      (): AnyPgColumn => engineeringSquads.id,
      { onDelete: "set null" },
    ),
    assignedTeamLabel: text("assigned_team_label").notNull().default(""),
    assignedUserId: text("assigned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    plannedStartAt: timestamp("planned_start_at", { withTimezone: true }),
    plannedEndAt: timestamp("planned_end_at", { withTimezone: true }),
    actualStartAt: timestamp("actual_start_at", { withTimezone: true }),
    actualEndAt: timestamp("actual_end_at", { withTimezone: true }),
    executionStatus: dispatchExecutionStatusEnum("execution_status")
      .notNull()
      .default("pending"),
    warningStatus: workOrderWarningStatusEnum("warning_status")
      .notNull()
      .default("normal"),
    warningReason: text("warning_reason").notNull().default(""),
    anomalySummary: text("anomaly_summary").notNull().default(""),
    coordinationRecord: text("coordination_record").notNull().default(""),
    nextAction: text("next_action").notNull().default(""),
    payload: jsonb("payload").$type<Record<string, unknown> | null>().default(null),
    ...timestamps,
  },
  (table) => [
    index("dispatch_executions_work_order_idx").on(table.workOrderId),
    index("dispatch_executions_round_idx").on(table.workOrderId, table.dispatchRound),
    index("dispatch_executions_assigned_squad_idx").on(table.assignedSquadId),
    index("dispatch_executions_assigned_user_idx").on(table.assignedUserId),
    index("dispatch_executions_status_idx").on(table.executionStatus),
  ],
);

export const deliveryResources = pgTable(
  "delivery_resources",
  {
    id: text("id").primaryKey(),
    workOrderId: text("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    deliveryRound: integer("delivery_round").notNull().default(1),
    returnSheetStatus: deliveryStageStatusEnum("return_sheet_status")
      .notNull()
      .default("pending"),
    returnSheetSummary: text("return_sheet_summary").notNull().default(""),
    drawingDeliveryStatus: deliveryStageStatusEnum("drawing_delivery_status")
      .notNull()
      .default("pending"),
    drawingDeliveryList: jsonb("drawing_delivery_list")
      .$type<Record<string, unknown> | null>()
      .default(null),
    resourceEntryStatus: deliveryStageStatusEnum("resource_entry_status")
      .notNull()
      .default("pending"),
    resourceAuditConclusion: text("resource_audit_conclusion")
      .notNull()
      .default(""),
    designPackageStatus: deliveryStageStatusEnum("design_package_status")
      .notNull()
      .default("pending"),
    finalDeliveryNote: text("final_delivery_note").notNull().default(""),
    submittedByUserId: text("submitted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    payload: jsonb("payload").$type<Record<string, unknown> | null>().default(null),
    ...timestamps,
  },
  (table) => [
    index("delivery_resources_work_order_idx").on(table.workOrderId),
    index("delivery_resources_round_idx").on(table.workOrderId, table.deliveryRound),
    index("delivery_resources_submitted_by_idx").on(table.submittedByUserId),
  ],
);

export const missingItems = pgTable(
  "missing_items",
  {
    id: text("id").primaryKey(),
    workOrderId: text("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    stage: workOrderStageEnum("stage").notNull(),
    itemType: text("item_type").notNull(),
    fieldKey: text("field_key").notNull().default(""),
    materialLabel: text("material_label").notNull().default(""),
    isBlocking: boolean("is_blocking").notNull().default(false),
    ownerUserId: text("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    targetDueAt: timestamp("target_due_at", { withTimezone: true }),
    status: missingItemStatusEnum("status").notNull().default("open"),
    aiSuggestedContent: text("ai_suggested_content").notNull().default(""),
    humanResolution: text("human_resolution").notNull().default(""),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload").$type<Record<string, unknown> | null>().default(null),
    ...timestamps,
  },
  (table) => [
    index("missing_items_work_order_idx").on(table.workOrderId),
    index("missing_items_stage_idx").on(table.stage),
    index("missing_items_status_idx").on(table.status),
    index("missing_items_owner_idx").on(table.ownerUserId),
    index("missing_items_blocking_idx").on(table.isBlocking),
  ],
);

export const workOrderDocumentLinks = pgTable(
  "work_order_document_links",
  {
    id: text("id").primaryKey(),
    workOrderId: text("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    linkType: workOrderDocumentLinkTypeEnum("link_type").notNull(),
    targetType: workOrderDocumentTargetTypeEnum("target_type").notNull(),
    targetId: text("target_id").notNull(),
    linkedWorkspaceId: text("linked_workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    relationNote: text("relation_note").notNull().default(""),
    linkedByUserId: text("linked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>().default(null),
    ...timestamps,
  },
  (table) => [
    index("work_order_document_links_work_order_idx").on(table.workOrderId),
    index("work_order_document_links_target_idx").on(
      table.targetType,
      table.targetId,
    ),
    index("work_order_document_links_workspace_idx").on(table.linkedWorkspaceId),
  ],
);

export const engineeringMembers = pgTable(
  "engineering_members",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phoneNumber: text("phone_number").notNull().default(""),
    roleLabel: text("role_label").notNull().default("施工人员"),
    status: engineeringMemberStatusEnum("status").notNull().default("available"),
    linkedUserId: text("linked_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    baseLabel: text("base_label").notNull().default(""),
    currentLocation: point("current_location", { mode: "xy" }),
    note: text("note").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>().default(null),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("engineering_members_name_unique").on(table.name),
    index("engineering_members_status_idx").on(table.status),
    index("engineering_members_linked_user_idx").on(table.linkedUserId),
  ],
);

export const engineeringSquads = pgTable(
  "engineering_squads",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: engineeringSquadStatusEnum("status").notNull().default("standby"),
    leaderMemberId: text("leader_member_id").references(() => engineeringMembers.id, {
      onDelete: "set null",
    }),
    managerUserId: text("manager_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    baseLabel: text("base_label").notNull().default(""),
    summary: text("summary").notNull().default(""),
    currentLocation: point("current_location", { mode: "xy" }),
    note: text("note").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>().default(null),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("engineering_squads_code_unique").on(table.code),
    uniqueIndex("engineering_squads_name_unique").on(table.name),
    index("engineering_squads_status_idx").on(table.status),
    index("engineering_squads_leader_idx").on(table.leaderMemberId),
    index("engineering_squads_manager_idx").on(table.managerUserId),
  ],
);

export const engineeringSquadMembers = pgTable(
  "engineering_squad_members",
  {
    id: text("id").primaryKey(),
    squadId: text("squad_id")
      .notNull()
      .references(() => engineeringSquads.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => engineeringMembers.id, { onDelete: "cascade" }),
    memberRole: engineeringSquadMemberRoleEnum("member_role")
      .notNull()
      .default("member"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    note: text("note").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("engineering_squad_members_pair_unique").on(
      table.squadId,
      table.memberId,
    ),
    index("engineering_squad_members_squad_idx").on(table.squadId),
    index("engineering_squad_members_member_idx").on(table.memberId),
    index("engineering_squad_members_active_idx").on(table.isActive),
  ],
);
