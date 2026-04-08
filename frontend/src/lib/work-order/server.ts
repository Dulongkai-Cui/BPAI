import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { mutateAppStore } from "@/lib/auth/server";
import type {
  StoredBrowserFolderIcon,
  StoredBrowserFolderTone,
  StoredCollaborationSpace,
  AuthenticatedUser,
} from "@/lib/auth/types";
import {
  getSharedBrowserStateForWorkspace,
  saveSharedBrowserStateForWorkspace,
  type BrowserCustomFolderState,
} from "@/lib/content/browser-state";
import {
  isCadFileName,
  normalizeCadAssetKind,
  type CadAssetKind,
} from "@/lib/content/cad";
import { createUploadedAsset, type ContentKind } from "@/lib/content/server";
import { getDb } from "@/lib/db/client";
import {
  collaborationSpaces,
  contentAssets,
  deliveryResources,
  dispatchExecutions,
  engineeringMembers,
  engineeringSquadMembers,
  engineeringSquads,
  folderNodes,
  missingItems,
  sourceChannelEnum,
  sourceIntakes,
  workOrderPriorityEnum,
  workOrderStageEnum,
  workOrderDocumentLinks,
  workspaceMembers,
  workspaces,
  workOrders,
  users,
} from "@/lib/db/schema";
import {
  ensureEngineeringSeedData,
} from "@/lib/engineering-team/server";
import {
  insertCollaborationSpaceInRawStore,
  runShadowWrite,
} from "@/lib/store/raw-shadow";

type SourceChannel = (typeof sourceChannelEnum.enumValues)[number];
type WorkOrderPriority = (typeof workOrderPriorityEnum.enumValues)[number];
type WorkOrderStage = (typeof workOrderStageEnum.enumValues)[number];
type WorkOrderStatus =
  | "open"
  | "in_progress"
  | "waiting"
  | "blocked"
  | "completed"
  | "cancelled"
  | "archived";
type CollaborationTone = "blue" | "amber" | "emerald" | "violet";
type DispatchExecutionStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "paused"
  | "completed"
  | "cancelled";
type DbExecutor = ReturnType<typeof getDb>;
type DbTransaction = Parameters<Parameters<DbExecutor["transaction"]>[0]>[0];
type DbLike = DbExecutor | DbTransaction;

type DedicatedSpaceInput = {
  actor: AuthenticatedUser;
  name?: string;
  summary?: string;
  tone?: CollaborationTone;
};

type WorkOrderDocumentLinkType =
  | "source_attachment"
  | "dispatch_attachment"
  | "construction_evidence"
  | "return_sheet"
  | "drawing"
  | "resource"
  | "audit_material"
  | "design_package"
  | "other";

export type WorkOrderStageFolderPreset = {
  stage: WorkOrderStage;
  folderId: string;
  folderName: string;
  description: string;
  tone: StoredBrowserFolderTone;
  icon: StoredBrowserFolderIcon;
  linkType: WorkOrderDocumentLinkType;
};

export type WorkOrderStageAssetUploadInput = {
  workOrderId: string;
  stage: WorkOrderStage;
  actor: AuthenticatedUser;
  files: File[];
};

export type CreateWorkOrderInput = {
  workOrderNo?: string;
  title: string;
  createdByUserId: string;
  collaborationSpaceId?: string | null;
  dedicatedSpace?: DedicatedSpaceInput;
  businessType?: string;
  sourceType?: SourceChannel;
  sourceSummary?: string;
  projectName?: string;
  siteName?: string;
  siteAddress?: string;
  currentResponsibleTeam?: string;
  currentResponsibleUserId?: string | null;
  currentStage?: WorkOrderStage;
  progressPercent?: number | null;
  priority?: WorkOrderPriority;
  nextAction?: string;
  latestProgressSummary?: string;
  metadata?: Record<string, unknown> | null;
};

export type UpdateWorkOrderInput = {
  id: string;
  workOrderNo?: string;
  collaborationSpaceId?: string | null;
  dedicatedSpace?: DedicatedSpaceInput;
  sourceType?: SourceChannel;
  sourceSummary?: string;
  projectName?: string;
  siteName?: string;
  siteAddress?: string;
  currentResponsibleTeam?: string;
  currentResponsibleUserId?: string | null;
  currentStage?: WorkOrderStage;
  progressPercent?: number | null;
  priority?: WorkOrderPriority;
  title?: string;
};

export type AssignWorkOrderDispatchInput = {
  workOrderId: string;
  dispatchedByUserId: string;
  assignedTeamLabel: string;
  assignedSquadId?: string | null;
  assignedUserId?: string | null;
  crewLeaderName?: string;
  crewMemberIds?: string[];
  crewMemberNames?: string[];
  plannedStartAt?: Date | null;
  plannedEndAt?: Date | null;
  coordinationRecord?: string;
  anomalySummary?: string;
  warningReason?: string;
  nextAction?: string;
  executionStatus?: DispatchExecutionStatus;
};

export type WorkOrderCreationUserOption = {
  id: string;
  name: string;
  teamLabel: string;
  roleLabel: string;
};

export type WorkOrderCreationSpaceOption = {
  id: string;
  name: string;
  summary: string;
};

function now() {
  return new Date();
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCrewMemberNames(values: string[] | undefined) {
  return (values ?? [])
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function buildWorkOrderStageFolderId(stage: WorkOrderStage) {
  return `wo-stage-${stage}`;
}

function stageUploadLinkType(stage: WorkOrderStage): WorkOrderDocumentLinkType {
  switch (stage) {
    case "source_intake":
      return "source_attachment";
    case "registration":
    case "dispatch":
      return "dispatch_attachment";
    case "field_construction":
      return "construction_evidence";
    case "return_sheet":
      return "return_sheet";
    case "drawing_delivery":
      return "drawing";
    case "resource_entry":
      return "resource";
    case "resource_audit":
    case "warning":
      return "audit_material";
    case "design_package":
      return "design_package";
    default:
      return "other";
  }
}

export const WORK_ORDER_STAGE_FOLDER_PRESETS: WorkOrderStageFolderPreset[] = [
  {
    stage: "source_intake",
    folderId: buildWorkOrderStageFolderId("source_intake"),
    folderName: "01_来源登记箱",
    description: "收原始需求、聊天记录、邮件与初始附件。",
    tone: "blue",
    icon: "bookmark",
    linkType: stageUploadLinkType("source_intake"),
  },
  {
    stage: "registration",
    folderId: buildWorkOrderStageFolderId("registration"),
    folderName: "02_工单立项资料",
    description: "放工单编号、立项说明、初始登记表和核准信息。",
    tone: "violet",
    icon: "briefcase",
    linkType: stageUploadLinkType("registration"),
  },
  {
    stage: "dispatch",
    folderId: buildWorkOrderStageFolderId("dispatch"),
    folderName: "03_派单记录",
    description: "放派单记录、班组安排、计划表和协调纪要。",
    tone: "rose",
    icon: "briefcase",
    linkType: stageUploadLinkType("dispatch"),
  },
  {
    stage: "warning",
    folderId: buildWorkOrderStageFolderId("warning"),
    folderName: "04_预警处置",
    description: "放预警说明、补件清单、风险确认和处置记录。",
    tone: "amber",
    icon: "bookmark",
    linkType: stageUploadLinkType("warning"),
  },
  {
    stage: "field_construction",
    folderId: buildWorkOrderStageFolderId("field_construction"),
    folderName: "05_现场施工",
    description: "放施工照片、施工表、签证单和现场回传资料。",
    tone: "emerald",
    icon: "folder",
    linkType: stageUploadLinkType("field_construction"),
  },
  {
    stage: "return_sheet",
    folderId: buildWorkOrderStageFolderId("return_sheet"),
    folderName: "06_回单资料",
    description: "放回单草稿、签字件、验收记录和补录说明。",
    tone: "amber",
    icon: "archive",
    linkType: stageUploadLinkType("return_sheet"),
  },
  {
    stage: "drawing_delivery",
    folderId: buildWorkOrderStageFolderId("drawing_delivery"),
    folderName: "07_图纸交付",
    description: "放竣工图、交付图纸、设计修订件和打包输出。",
    tone: "blue",
    icon: "archive",
    linkType: stageUploadLinkType("drawing_delivery"),
  },
  {
    stage: "resource_entry",
    folderId: buildWorkOrderStageFolderId("resource_entry"),
    folderName: "08_录资源",
    description: "放资源录入凭据、表单截图和系统回写材料。",
    tone: "emerald",
    icon: "spark",
    linkType: stageUploadLinkType("resource_entry"),
  },
  {
    stage: "resource_audit",
    folderId: buildWorkOrderStageFolderId("resource_audit"),
    folderName: "09_资源稽核",
    description: "放稽核意见、缺陷项、整改回执和最终确认。",
    tone: "slate",
    icon: "bookmark",
    linkType: stageUploadLinkType("resource_audit"),
  },
  {
    stage: "design_package",
    folderId: buildWorkOrderStageFolderId("design_package"),
    folderName: "10_出设计资料",
    description: "放打包图纸、最终文本、归档设计包和交付说明。",
    tone: "violet",
    icon: "archive",
    linkType: stageUploadLinkType("design_package"),
  },
];

function parseDispatchPayload(payload: Record<string, unknown> | null) {
  const assignedSquadId =
    payload && typeof payload.assignedSquadId === "string"
      ? normalizeText(payload.assignedSquadId)
      : "";
  const crewLeaderName =
    payload && typeof payload.crewLeaderName === "string"
      ? normalizeText(payload.crewLeaderName)
      : "";
  const assignmentNote =
    payload && typeof payload.assignmentNote === "string"
      ? normalizeText(payload.assignmentNote)
      : "";
  const crewMemberNames =
    payload && Array.isArray(payload.crewMemberNames)
      ? normalizeCrewMemberNames(
          payload.crewMemberNames.filter(
            (value): value is string => typeof value === "string",
          ),
        )
      : [];

  return {
    assignedSquadId,
    crewLeaderName,
    assignmentNote,
    crewMemberNames,
    crewMemberIds:
      payload && Array.isArray(payload.crewMemberIds)
        ? uniqueStringArray(
            payload.crewMemberIds.filter(
              (value): value is string => typeof value === "string",
            ),
          )
        : [],
    crewMemberCount: crewMemberNames.length,
  };
}

function inferContentKindFromFile(file: File): ContentKind {
  const fileName = file.name.toLowerCase();
  const mimeType = file.type.toLowerCase();

  if (
    fileName.endsWith(".xls") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".csv") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv"
  ) {
    return "sheet";
  }

  if (
    fileName.endsWith(".ppt") ||
    fileName.endsWith(".pptx") ||
    fileName.endsWith(".pps") ||
    fileName.endsWith(".ppsx") ||
    fileName.endsWith(".odp") ||
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint")
  ) {
    return "slide";
  }

  return "document";
}

function buildStageFolderState(preset: WorkOrderStageFolderPreset): BrowserCustomFolderState {
  return {
    id: preset.folderId,
    name: preset.folderName,
    description: preset.description,
    tone: preset.tone,
    icon: preset.icon,
  };
}

function clampPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function uniqueStringArray(values: string[] | undefined) {
  return [...new Set((values ?? []).map((value) => normalizeText(value)).filter(Boolean))];
}

function buildCollaborationSpaceId(name: string) {
  const safeSeed = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);

  return `space-${safeSeed || "custom"}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
}

function deriveWarningStatus(stage: WorkOrderStage, blockingItemCount: number) {
  if (stage === "warning") {
    return blockingItemCount > 0 ? "critical" : "warning";
  }

  if (blockingItemCount > 0) {
    return "warning";
  }

  return "normal";
}

function deriveWorkOrderStatus(stage: WorkOrderStage): WorkOrderStatus {
  switch (stage) {
    case "source_intake":
    case "registration":
    case "dispatch":
      return "open";
    case "warning":
      return "blocked";
    case "field_construction":
    case "drawing_delivery":
    case "resource_entry":
    case "resource_audit":
      return "in_progress";
    case "return_sheet":
      return "waiting";
    case "design_package":
      return "completed";
    default:
      return "open";
  }
}

async function resolveResponsibleUser(
  executor: DbLike,
  userId: string | null | undefined,
) {
  if (!userId) {
    return null;
  }

  return (
    (
      await executor
        .select({
          id: users.id,
          name: users.name,
          roleLabel: users.roleLabel,
          teamLabel: users.teamLabel,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    )[0] ?? null
  );
}

async function createDedicatedCollaborationSpaceInExecutor(
  executor: DbLike,
  input: DedicatedSpaceInput & { fallbackName: string },
) {
  const timestamp = now();
  const timestampIso = timestamp.toISOString();
  const name = normalizeText(input.name) || `${input.fallbackName} 协作空间`;
  const summary =
    normalizeText(input.summary) ||
    `服务于工单「${input.fallbackName}」的专属协作空间，可直接在这里整理资料、图纸、回单和协作记录。`;
  const tone = input.tone ?? "blue";
  const id = buildCollaborationSpaceId(name);
  const ownerEmail = normalizeEmail(input.actor.email);
  const shadowSpace: StoredCollaborationSpace = {
    id,
    name,
    summary,
    ownerEmail,
    memberEmails: [ownerEmail],
    documentCount: 0,
    systemFormCount: 0,
    tone,
    createdAt: timestampIso,
    updatedAt: timestampIso,
  };

  await executor.insert(workspaces).values({
    id,
    name,
    kind: "collaboration",
    ownerUserId: input.actor.id,
    visibility: "shared",
    metadata: {
      summary,
      tone,
      importSource: "work-order-runtime",
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await executor.insert(collaborationSpaces).values({
    id,
    workspaceId: id,
    name,
    summary,
    ownerUserId: input.actor.id,
    tone,
    documentCount: 0,
    systemFormCount: 0,
    dissolvedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await executor.insert(workspaceMembers).values({
    id: `workspace-member:${id}:${input.actor.id}`,
    workspaceId: id,
    userId: input.actor.id,
    memberRole: "owner",
    joinedAt: timestamp,
    updatedAt: timestamp,
  });

  return {
    id,
    shadowSpace,
  };
}

function scheduleDedicatedCollaborationSpaceShadow(space: StoredCollaborationSpace) {
  void runShadowWrite("work-order-dedicated-space-shadow", async () => {
    await mutateAppStore((store) => ({
      store: insertCollaborationSpaceInRawStore(store, space),
      result: undefined,
    }));
  });
}

function stageLabel(stage: WorkOrderStage) {
  const labels: Record<WorkOrderStage, string> = {
    source_intake: "来源",
    registration: "登记",
    dispatch: "派单",
    warning: "预警",
    field_construction: "施工",
    return_sheet: "回单",
    drawing_delivery: "图纸交付",
    resource_entry: "录资源",
    resource_audit: "资源稽核",
    design_package: "打包出设计",
  };

  return labels[stage];
}

const PRIMARY_CAD_STAGES: WorkOrderStage[] = [
  "source_intake",
  "registration",
  "drawing_delivery",
];

function extractStageFromLinkMetadata(metadata: unknown): WorkOrderStage | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const stage = (metadata as { stage?: unknown }).stage;
  return typeof stage === "string" && workOrderStageEnum.enumValues.includes(stage as WorkOrderStage)
    ? (stage as WorkOrderStage)
    : null;
}

function calculateMaterialCompleteness(input: {
  sourceSummary: string;
  projectName: string;
  siteName: string;
  siteAddress: string;
  currentResponsibleTeam: string;
  currentResponsibleUserId: string | null;
}) {
  const checkpoints = [
    input.sourceSummary,
    input.projectName,
    input.siteName,
    input.siteAddress,
    input.currentResponsibleTeam || input.currentResponsibleUserId,
  ];
  const completedCount = checkpoints.filter(Boolean).length;

  return Math.round((completedCount / checkpoints.length) * 100);
}

function buildInitialMissingItems(input: {
  sourceSummary: string;
  projectName: string;
  siteName: string;
  siteAddress: string;
  currentResponsibleTeam: string;
  currentResponsibleUserId: string | null;
  currentStage: WorkOrderStage;
  workOrderId: string;
  createdByUserId: string;
}) {
  const rows: Array<{
    id: string;
    workOrderId: string;
    stage: WorkOrderStage;
    itemType: string;
    fieldKey: string;
    materialLabel: string;
    isBlocking: boolean;
    ownerUserId: string | null;
    status: "open";
    aiSuggestedContent: string;
    createdByUserId: string;
    updatedByUserId: string;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  const timestamp = now();

  const pushMissing = (config: {
    itemType: string;
    fieldKey: string;
    materialLabel: string;
    isBlocking: boolean;
    aiSuggestedContent: string;
  }) => {
    rows.push({
      id: crypto.randomUUID(),
      workOrderId: input.workOrderId,
      stage: input.currentStage,
      itemType: config.itemType,
      fieldKey: config.fieldKey,
      materialLabel: config.materialLabel,
      isBlocking: config.isBlocking,
      ownerUserId: input.currentResponsibleUserId,
      status: "open",
      aiSuggestedContent: config.aiSuggestedContent,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.createdByUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  };

  if (!input.sourceSummary) {
    pushMissing({
      itemType: "source_summary",
      fieldKey: "sourceSummary",
      materialLabel: "原始需求摘要",
      isBlocking: false,
      aiSuggestedContent: "先补一条需求来源和核心诉求，后续再补原始记录。",
    });
  }

  if (!input.projectName) {
    pushMissing({
      itemType: "project",
      fieldKey: "projectName",
      materialLabel: "项目名称",
      isBlocking: false,
      aiSuggestedContent: "先补最小项目归属，后续再细化项目阶段和编号。",
    });
  }

  if (!input.siteName) {
    pushMissing({
      itemType: "site",
      fieldKey: "siteName",
      materialLabel: "站点名称",
      isBlocking: false,
      aiSuggestedContent: "至少补一个站点或机房名称，便于后续派单与归档。",
    });
  }

  if (!input.siteAddress) {
    pushMissing({
      itemType: "address",
      fieldKey: "siteAddress",
      materialLabel: "现场地址",
      isBlocking: false,
      aiSuggestedContent: "地址可以先写粗略位置，后续再补详细楼层和定位。",
    });
  }

  if (!input.currentResponsibleUserId && !input.currentResponsibleTeam) {
    pushMissing({
      itemType: "assignment",
      fieldKey: "currentResponsibleUserId",
      materialLabel: "当前节点负责人 / 责任团队",
      isBlocking: true,
      aiSuggestedContent: "先明确当前谁来接住这单，再继续往下推进。",
    });
  }

  return rows;
}

async function generateWorkOrderNo() {
  const db = getDb();
  const datePart = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
    const candidate = `WO-${datePart}-${suffix}`;
    const existing = await db
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(eq(workOrders.workOrderNo, candidate))
      .limit(1);

    if (existing.length === 0) {
      return candidate;
    }
  }

  throw new Error("Failed to generate a unique work order number.");
}

async function ensureUniqueWorkOrderNo(workOrderNo: string, excludeId?: string) {
  const db = getDb();
  const existing = await db
    .select({ id: workOrders.id })
    .from(workOrders)
    .where(eq(workOrders.workOrderNo, workOrderNo))
    .limit(1);

  if (existing.length === 0) {
    return;
  }

  if (excludeId && existing[0].id === excludeId) {
    return;
  }

  throw new Error("工单编号已存在，请换一个。");
}

async function resolveWorkOrderNo(preferred: string | null | undefined, excludeId?: string) {
  const normalized = normalizeText(preferred);

  if (!normalized) {
    return excludeId ? null : generateWorkOrderNo();
  }

  await ensureUniqueWorkOrderNo(normalized, excludeId);
  return normalized;
}

type WorkOrderAccessSnapshot = {
  id: string;
  createdByUserId: string;
  currentResponsibleUserId: string | null;
  currentResponsibleTeam: string;
  collaborationSpaceId: string | null;
};

export async function ensureCanManageWorkOrder(
  actor: AuthenticatedUser,
  workOrderId: string,
) {
  const db = getDb();
  const rows = await db
    .select({
      id: workOrders.id,
      createdByUserId: workOrders.createdByUserId,
      currentResponsibleUserId: workOrders.currentResponsibleUserId,
      currentResponsibleTeam: workOrders.currentResponsibleTeam,
      collaborationSpaceId: workOrders.collaborationSpaceId,
    })
    .from(workOrders)
    .where(eq(workOrders.id, workOrderId))
    .limit(1);

  const current: WorkOrderAccessSnapshot | undefined = rows[0];

  if (!current) {
    return null;
  }

  if (actor.roleKey === "system_admin") {
    return current;
  }

  if (
    current.createdByUserId === actor.id ||
    current.currentResponsibleUserId === actor.id ||
    (current.currentResponsibleTeam &&
      normalizeText(current.currentResponsibleTeam) === normalizeText(actor.teamLabel))
  ) {
    return current;
  }

  if (current.collaborationSpaceId) {
    const membership = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, current.collaborationSpaceId),
          eq(workspaceMembers.userId, actor.id),
        ),
      )
      .limit(1);

    if (membership.length > 0) {
      return current;
    }
  }

  throw new Error("FORBIDDEN");
}

export async function getWorkOrderCreationOptions(currentUserId: string) {
  const db = getDb();
  const [userRows, spaceRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        teamLabel: users.teamLabel,
        roleLabel: users.roleLabel,
      })
      .from(users)
      .orderBy(asc(users.name)),
    db
      .select({
        id: collaborationSpaces.id,
        name: collaborationSpaces.name,
        summary: collaborationSpaces.summary,
      })
      .from(collaborationSpaces)
      .where(
        and(
          eq(collaborationSpaces.ownerUserId, currentUserId),
          isNull(collaborationSpaces.dissolvedAt),
        ),
      )
      .orderBy(desc(collaborationSpaces.updatedAt)),
  ]);

  return {
    responsibleUsers: userRows satisfies WorkOrderCreationUserOption[],
    collaborationSpaces: spaceRows satisfies WorkOrderCreationSpaceOption[],
  };
}

export async function createWorkOrder(input: CreateWorkOrderInput) {
  const db = getDb();
  const timestamp = now();
  const id = crypto.randomUUID();
  const workOrderNo =
    (await resolveWorkOrderNo(input.workOrderNo)) ?? (await generateWorkOrderNo());
  const responsibleUser = await resolveResponsibleUser(
    db,
    input.currentResponsibleUserId,
  );
  let dedicatedSpaceShadow: StoredCollaborationSpace | null = null;
  let collaborationSpaceId = input.collaborationSpaceId ?? null;

  const sourceSummary = normalizeText(input.sourceSummary);
  const projectName = normalizeText(input.projectName);
  const siteName = normalizeText(input.siteName);
  const siteAddress = normalizeText(input.siteAddress);
  const currentStage = input.currentStage ?? "registration";
  const currentResponsibleTeam =
    normalizeText(input.currentResponsibleTeam) ||
    responsibleUser?.teamLabel ||
    "";
  const currentResponsibleUserId = responsibleUser?.id ?? null;
  const materialCompleteness =
    typeof input.progressPercent === "number"
      ? clampPercent(input.progressPercent)
      : calculateMaterialCompleteness({
          sourceSummary,
          projectName,
          siteName,
          siteAddress,
          currentResponsibleTeam,
          currentResponsibleUserId,
        });
  const missingRows = buildInitialMissingItems({
    sourceSummary,
    projectName,
    siteName,
    siteAddress,
    currentResponsibleTeam,
    currentResponsibleUserId,
    currentStage,
    workOrderId: id,
    createdByUserId: input.createdByUserId,
  });
  const blockingItemCount = missingRows.filter((item) => item.isBlocking).length;
  const status = deriveWorkOrderStatus(currentStage);
  const latestProgressSummary =
    normalizeText(input.latestProgressSummary) ||
    `当前已推进到${stageLabel(currentStage)}，暂按 ${materialCompleteness}% 记录。`;
  const nextAction =
    normalizeText(input.nextAction) ||
    (blockingItemCount > 0
      ? "先补当前节点负责人或责任团队，再继续往下推进。"
      : `继续补齐 ${stageLabel(currentStage)} 节点所需信息。`);
  await db.transaction(async (tx) => {
    if (input.dedicatedSpace) {
      const dedicatedSpace = await createDedicatedCollaborationSpaceInExecutor(tx, {
        ...input.dedicatedSpace,
        fallbackName: normalizeText(input.title),
      });
      collaborationSpaceId = dedicatedSpace.id;
      dedicatedSpaceShadow = dedicatedSpace.shadowSpace;
    }

    await tx.insert(workOrders).values({
      id,
      workOrderNo,
      title: normalizeText(input.title),
      businessType: normalizeText(input.businessType) || "general",
      sourceType: input.sourceType ?? "manual",
      sourceSummary,
      projectName,
      siteName,
      siteAddress,
      stage: currentStage,
      status,
      priority: input.priority ?? "normal",
      warningStatus: deriveWarningStatus(currentStage, blockingItemCount),
      currentResponsibleTeam,
      currentResponsibleUserId,
      createdByUserId: input.createdByUserId,
      collaborationSpaceId,
      nextAction,
      materialCompleteness,
      missingItemCount: missingRows.length,
      blockingItemCount,
      latestProgressSummary,
      metadata: input.metadata ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await tx.insert(sourceIntakes).values({
      id: crypto.randomUUID(),
      workOrderId: id,
      sourceChannel: input.sourceType ?? "manual",
      initiatorName: "",
      sourceAccount: "",
      originalMessageSummary: sourceSummary,
      requirementSummary: sourceSummary,
      extractedProjectName: projectName,
      extractedSiteName: siteName,
      confirmationStatus: "pending",
      confirmedByUserId: null,
      confirmedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    if (missingRows.length > 0) {
      await tx.insert(missingItems).values(missingRows);
    }
  });

  if (dedicatedSpaceShadow) {
    scheduleDedicatedCollaborationSpaceShadow(dedicatedSpaceShadow);
  }

  return getWorkOrderById(id);
}

export async function updateWorkOrder(input: UpdateWorkOrderInput) {
  const db = getDb();
  const timestamp = now();
  const existing = await db
    .select({
      id: workOrders.id,
      workOrderNo: workOrders.workOrderNo,
      createdByUserId: workOrders.createdByUserId,
      title: workOrders.title,
      sourceType: workOrders.sourceType,
      sourceSummary: workOrders.sourceSummary,
      projectName: workOrders.projectName,
      siteName: workOrders.siteName,
      siteAddress: workOrders.siteAddress,
      currentResponsibleTeam: workOrders.currentResponsibleTeam,
      currentResponsibleUserId: workOrders.currentResponsibleUserId,
      stage: workOrders.stage,
      priority: workOrders.priority,
      materialCompleteness: workOrders.materialCompleteness,
      collaborationSpaceId: workOrders.collaborationSpaceId,
    })
    .from(workOrders)
    .where(eq(workOrders.id, input.id))
    .limit(1);

  if (existing.length === 0) {
    return null;
  }

  const current = existing[0];
  const resolvedWorkOrderNo =
    (await resolveWorkOrderNo(input.workOrderNo, input.id)) ?? current.workOrderNo;
  const responsibleUser =
    typeof input.currentResponsibleUserId === "undefined"
      ? null
      : await resolveResponsibleUser(db, input.currentResponsibleUserId);
  let dedicatedSpaceShadow: StoredCollaborationSpace | null = null;
  let collaborationSpaceId =
    typeof input.collaborationSpaceId === "undefined"
      ? current.collaborationSpaceId
      : input.collaborationSpaceId;

  const title =
    typeof input.title === "undefined" ? current.title : normalizeText(input.title);
  const sourceSummary =
    typeof input.sourceSummary === "undefined"
      ? current.sourceSummary
      : normalizeText(input.sourceSummary);
  const projectName =
    typeof input.projectName === "undefined"
      ? current.projectName
      : normalizeText(input.projectName);
  const siteName =
    typeof input.siteName === "undefined"
      ? current.siteName
      : normalizeText(input.siteName);
  const siteAddress =
    typeof input.siteAddress === "undefined"
      ? current.siteAddress
      : normalizeText(input.siteAddress);
  const currentStage = input.currentStage ?? current.stage;
  const currentResponsibleTeam =
    typeof input.currentResponsibleTeam !== "undefined"
      ? normalizeText(input.currentResponsibleTeam) ||
        (responsibleUser?.teamLabel ?? "")
      : typeof input.currentResponsibleUserId !== "undefined"
        ? (responsibleUser?.teamLabel ?? "")
        : current.currentResponsibleTeam;
  const currentResponsibleUserId =
    typeof input.currentResponsibleUserId === "undefined"
      ? current.currentResponsibleUserId
      : (responsibleUser?.id ?? null);
  const materialCompleteness =
    typeof input.progressPercent === "number"
      ? clampPercent(input.progressPercent)
      : input.progressPercent === null
        ? calculateMaterialCompleteness({
            sourceSummary,
            projectName,
            siteName,
            siteAddress,
            currentResponsibleTeam,
            currentResponsibleUserId,
          })
        : current.materialCompleteness;
  const missingRows = buildInitialMissingItems({
    sourceSummary,
    projectName,
    siteName,
    siteAddress,
    currentResponsibleTeam,
    currentResponsibleUserId,
    currentStage,
    workOrderId: input.id,
    createdByUserId: current.createdByUserId,
  });
  const blockingItemCount = missingRows.filter((item) => item.isBlocking).length;
  const status = deriveWorkOrderStatus(currentStage);
  const latestProgressSummary = `当前已推进到${stageLabel(currentStage)}，暂按 ${materialCompleteness}% 记录。`;
  const nextAction =
    blockingItemCount > 0
      ? "先补当前节点负责人或责任团队，再继续往下推进。"
      : `继续补齐 ${stageLabel(currentStage)} 节点所需信息。`;

  await db.transaction(async (tx) => {
    if (input.dedicatedSpace) {
      const dedicatedSpace = await createDedicatedCollaborationSpaceInExecutor(tx, {
        ...input.dedicatedSpace,
        fallbackName: title,
      });
      collaborationSpaceId = dedicatedSpace.id;
      dedicatedSpaceShadow = dedicatedSpace.shadowSpace;
    }

    await tx
      .update(workOrders)
      .set({
        workOrderNo: resolvedWorkOrderNo,
        title,
        sourceType: input.sourceType ?? current.sourceType,
        sourceSummary,
        projectName,
        siteName,
        siteAddress,
        stage: currentStage,
        status,
        priority: input.priority ?? current.priority,
        warningStatus: deriveWarningStatus(currentStage, blockingItemCount),
        currentResponsibleTeam,
        currentResponsibleUserId,
        collaborationSpaceId,
        nextAction,
        materialCompleteness,
        missingItemCount: missingRows.length,
        blockingItemCount,
        latestProgressSummary,
        updatedAt: timestamp,
      })
      .where(eq(workOrders.id, input.id));

    const intakeRows = await tx
      .select({ id: sourceIntakes.id })
      .from(sourceIntakes)
      .where(eq(sourceIntakes.workOrderId, input.id))
      .orderBy(asc(sourceIntakes.createdAt))
      .limit(1);

    if (intakeRows.length > 0) {
      await tx
        .update(sourceIntakes)
        .set({
          sourceChannel: input.sourceType ?? current.sourceType,
          originalMessageSummary: sourceSummary,
          requirementSummary: sourceSummary,
          extractedProjectName: projectName,
          extractedSiteName: siteName,
          updatedAt: timestamp,
        })
        .where(eq(sourceIntakes.id, intakeRows[0].id));
    } else {
      await tx.insert(sourceIntakes).values({
        id: crypto.randomUUID(),
        workOrderId: input.id,
        sourceChannel: input.sourceType ?? current.sourceType,
        initiatorName: "",
        sourceAccount: "",
        originalMessageSummary: sourceSummary,
        requirementSummary: sourceSummary,
        extractedProjectName: projectName,
        extractedSiteName: siteName,
        confirmationStatus: "pending",
        confirmedByUserId: null,
        confirmedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    await tx.delete(missingItems).where(eq(missingItems.workOrderId, input.id));

    if (missingRows.length > 0) {
      await tx.insert(missingItems).values(missingRows);
    }
  });

  if (dedicatedSpaceShadow) {
    scheduleDedicatedCollaborationSpaceShadow(dedicatedSpaceShadow);
  }

  return getWorkOrderById(input.id);
}

async function assignWorkOrderDispatchLegacy(input: AssignWorkOrderDispatchInput) {
  const db = getDb();
  const timestamp = now();
  const assignedTeamLabel = normalizeText(input.assignedTeamLabel);

  if (!assignedTeamLabel) {
    throw new Error("璇峰厛濉啓鏂藉伐闃熷悕绉般€?");
  }

  const currentRows = await db
    .select({ id: workOrders.id })
    .from(workOrders)
    .where(eq(workOrders.id, input.workOrderId))
    .limit(1);

  if (currentRows.length === 0) {
    return null;
  }

  const responsibleUser = await resolveResponsibleUser(db, input.assignedUserId);
  const crewMemberNames = normalizeCrewMemberNames(input.crewMemberNames);
  const crewLeaderName =
    normalizeText(input.crewLeaderName) || responsibleUser?.name || "";

  const nextRoundRows = await db
    .select({
      nextRound: sql<number>`coalesce(max(${dispatchExecutions.dispatchRound}), 0) + 1`,
    })
    .from(dispatchExecutions)
    .where(eq(dispatchExecutions.workOrderId, input.workOrderId));

  const dispatchRound = nextRoundRows[0]?.nextRound ?? 1;
  const payload = {
    crewLeaderName,
    crewMemberNames,
    assignmentNote: normalizeText(input.coordinationRecord),
  } satisfies Record<string, unknown>;
  const dispatchPayload = payload;
  const nextActionValue =
    normalizeText(input.nextAction) ||
    `已派给施工队「${assignedTeamLabel}」，请按计划时间继续推进。`;
  const normalizedNextAction =
    normalizeText(input.nextAction) ||
    `宸叉淳缁欐柦宸ラ槦銆?${assignedTeamLabel}銆嶏紝璇锋寜璁″垝鏃堕棿鎺ㄨ繘銆?`;

  void normalizedNextAction;

  await db.transaction(async (tx) => {
    await tx.insert(dispatchExecutions).values({
      id: crypto.randomUUID(),
      workOrderId: input.workOrderId,
      dispatchRound,
      dispatchedByUserId: input.dispatchedByUserId,
      assignedTeamLabel,
      assignedUserId: responsibleUser?.id ?? null,
      plannedStartAt: input.plannedStartAt ?? null,
      plannedEndAt: input.plannedEndAt ?? null,
      actualStartAt: null,
      actualEndAt: null,
      executionStatus: input.executionStatus ?? "assigned",
      warningStatus: "normal",
      warningReason: normalizeText(input.warningReason),
      anomalySummary: normalizeText(input.anomalySummary),
      coordinationRecord: normalizeText(input.coordinationRecord),
      nextAction: nextActionValue,
      payload: dispatchPayload,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await tx
      .update(workOrders)
      .set({
        nextAction: nextActionValue,
        updatedAt: timestamp,
      })
      .where(eq(workOrders.id, input.workOrderId));
  });

  return getWorkOrderDetailById(input.workOrderId);
}

export async function assignWorkOrderDispatch(input: AssignWorkOrderDispatchInput) {
  const db = getDb();
  const timestamp = now();
  const assignedSquadId = normalizeText(input.assignedSquadId);
  let assignedTeamLabel = normalizeText(input.assignedTeamLabel);

  const currentRows = await db
    .select({ id: workOrders.id })
    .from(workOrders)
    .where(eq(workOrders.id, input.workOrderId))
    .limit(1);

  if (currentRows.length === 0) {
    return null;
  }

  const responsibleUser = await resolveResponsibleUser(db, input.assignedUserId);
  let crewMemberIds = uniqueStringArray(input.crewMemberIds);
  let crewMemberNames = normalizeCrewMemberNames(input.crewMemberNames);
  let crewLeaderName = normalizeText(input.crewLeaderName) || responsibleUser?.name || "";
  let assignedSquad:
    | {
        id: string;
        code: string;
        name: string;
        leaderMemberId: string | null;
      }
    | null = null;

  if (assignedSquadId) {
    await ensureEngineeringSeedData();

    const squadRows = await db
      .select({
        id: engineeringSquads.id,
        code: engineeringSquads.code,
        name: engineeringSquads.name,
        leaderMemberId: engineeringSquads.leaderMemberId,
      })
      .from(engineeringSquads)
      .where(
        and(
          eq(engineeringSquads.id, assignedSquadId),
          isNull(engineeringSquads.archivedAt),
        ),
      )
      .limit(1);

    assignedSquad = squadRows[0] ?? null;

    if (!assignedSquad) {
      throw new Error("INVALID_SQUAD_ID");
    }

    assignedTeamLabel = assignedSquad.name;

    const activeSquadMemberRows = await db
      .select({
        memberId: engineeringSquadMembers.memberId,
        memberName: engineeringMembers.name,
      })
      .from(engineeringSquadMembers)
      .innerJoin(
        engineeringMembers,
        eq(engineeringMembers.id, engineeringSquadMembers.memberId),
      )
      .where(
        and(
          eq(engineeringSquadMembers.squadId, assignedSquad.id),
          eq(engineeringSquadMembers.isActive, true),
        ),
      )
      .orderBy(
        asc(engineeringSquadMembers.sortOrder),
        asc(engineeringMembers.name),
      );

    const squadMemberMap = new Map(
      activeSquadMemberRows.map((row) => [row.memberId, row.memberName]),
    );

    if (crewMemberIds.length === 0) {
      crewMemberIds = activeSquadMemberRows.map((row) => row.memberId);
    } else {
      const invalidMemberId = crewMemberIds.find((memberId) => !squadMemberMap.has(memberId));
      if (invalidMemberId) {
        throw new Error("INVALID_SQUAD_MEMBER_IDS");
      }
    }

    if (crewMemberNames.length === 0) {
      crewMemberNames = crewMemberIds
        .map((memberId) => squadMemberMap.get(memberId) ?? "")
        .filter(Boolean);
    }

    if (!crewLeaderName && assignedSquad.leaderMemberId) {
      crewLeaderName = squadMemberMap.get(assignedSquad.leaderMemberId) ?? crewLeaderName;
    }
  }

  if (!assignedTeamLabel) {
    return assignWorkOrderDispatchLegacy(input);
  }

  const nextRoundRows = await db
    .select({
      nextRound: sql<number>`coalesce(max(${dispatchExecutions.dispatchRound}), 0) + 1`,
    })
    .from(dispatchExecutions)
    .where(eq(dispatchExecutions.workOrderId, input.workOrderId));

  const dispatchRound = nextRoundRows[0]?.nextRound ?? 1;
  const dispatchPayload = {
    assignedSquadId: assignedSquad?.id ?? "",
    assignedSquadCode: assignedSquad?.code ?? "",
    crewLeaderName,
    crewMemberIds,
    crewMemberNames,
    assignmentNote: normalizeText(input.coordinationRecord),
  } satisfies Record<string, unknown>;
  const nextActionValue =
    normalizeText(input.nextAction) ||
    `已派给施工队「${assignedTeamLabel}」，请按计划时间继续推进。`;

  await db.transaction(async (tx) => {
    await tx.insert(dispatchExecutions).values({
      id: crypto.randomUUID(),
      workOrderId: input.workOrderId,
      dispatchRound,
      dispatchedByUserId: input.dispatchedByUserId,
      assignedSquadId: assignedSquad?.id ?? null,
      assignedTeamLabel,
      assignedUserId: responsibleUser?.id ?? null,
      plannedStartAt: input.plannedStartAt ?? null,
      plannedEndAt: input.plannedEndAt ?? null,
      actualStartAt: null,
      actualEndAt: null,
      executionStatus: input.executionStatus ?? "assigned",
      warningStatus: "normal",
      warningReason: normalizeText(input.warningReason),
      anomalySummary: normalizeText(input.anomalySummary),
      coordinationRecord: normalizeText(input.coordinationRecord),
      nextAction: nextActionValue,
      payload: dispatchPayload,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await tx
      .update(workOrders)
      .set({
        nextAction: nextActionValue,
        updatedAt: timestamp,
      })
      .where(eq(workOrders.id, input.workOrderId));

    if (assignedSquad?.id) {
      await tx
        .update(engineeringSquads)
        .set({
          status: "assigned",
          updatedAt: timestamp,
        })
        .where(eq(engineeringSquads.id, assignedSquad.id));

      if (crewMemberIds.length > 0) {
        await tx
          .update(engineeringMembers)
          .set({
            status: "assigned",
            updatedAt: timestamp,
          })
          .where(inArray(engineeringMembers.id, crewMemberIds));
      }
    }
  });

  return getWorkOrderDetailById(input.workOrderId);
}

export async function ensureCanViewWorkOrder(
  actor: AuthenticatedUser,
  workOrderId: string,
) {
  return ensureCanManageWorkOrder(actor, workOrderId);
}

export async function ensureWorkOrderStageFolders(workOrderId: string) {
  const workOrder = await getWorkOrderById(workOrderId);

  if (!workOrder?.collaborationSpaceId) {
    return {
      collaborationSpaceId: null,
      presets: WORK_ORDER_STAGE_FOLDER_PRESETS,
    };
  }

  const kinds: ContentKind[] = ["document", "sheet", "slide"];

  await Promise.all(
    kinds.map(async (kind) => {
      const currentState = await getSharedBrowserStateForWorkspace(
        workOrder.collaborationSpaceId!,
        kind,
      );
      const nextCustomFolders = [...currentState.customFolders];
      const existingFolderIds = new Set(nextCustomFolders.map((folder) => folder.id));
      let hasChanges = false;

      for (const preset of WORK_ORDER_STAGE_FOLDER_PRESETS) {
        if (existingFolderIds.has(preset.folderId)) {
          continue;
        }

        nextCustomFolders.push(buildStageFolderState(preset));
        existingFolderIds.add(preset.folderId);
        hasChanges = true;
      }

      if (!hasChanges) {
        return;
      }

      await saveSharedBrowserStateForWorkspace({
        kind,
        workspaceId: workOrder.collaborationSpaceId!,
        state: {
          deletedFolderIds: currentState.deletedFolderIds,
          customFolders: nextCustomFolders,
          innerFolders: currentState.innerFolders,
          fileStates: currentState.fileStates,
          boardMessages: currentState.boardMessages,
        },
      });
    }),
  );

  return {
    collaborationSpaceId: workOrder.collaborationSpaceId,
    presets: WORK_ORDER_STAGE_FOLDER_PRESETS,
  };
}

export async function uploadWorkOrderStageAssets(
  input: WorkOrderStageAssetUploadInput,
) {
  const workOrder = await getWorkOrderById(input.workOrderId);

  if (!workOrder) {
    return null;
  }

  if (!workOrder.collaborationSpaceId) {
    throw new Error("WORKSPACE_REQUIRED");
  }

  const preset =
    WORK_ORDER_STAGE_FOLDER_PRESETS.find((item) => item.stage === input.stage) ?? null;

  if (!preset) {
    throw new Error("INVALID_STAGE");
  }

  await ensureWorkOrderStageFolders(input.workOrderId);

  const sharedState = await getSharedBrowserStateForWorkspace(
    workOrder.collaborationSpaceId,
    "document",
  );
  const nextFileStates = [...sharedState.fileStates];
  const existingFileIds = new Set(nextFileStates.map((state) => state.fileId));
  const db = getDb();
  const uploadedAssets: Array<{
    id: string;
    kind: ContentKind;
    title: string;
    updatedAt: string;
  }> = [];

  for (const file of input.files) {
    const kind = inferContentKindFromFile(file);
    const uploaded = await createUploadedAsset({
      kind,
      file,
      user: input.actor,
      workspaceId: workOrder.collaborationSpaceId,
      folderId: preset.folderId,
    });

    if (!existingFileIds.has(uploaded.asset.id)) {
      nextFileStates.push({
        fileId: uploaded.asset.id,
        folderId: preset.folderId,
        subfolderId: null,
      });
      existingFileIds.add(uploaded.asset.id);
    }

    await db.insert(workOrderDocumentLinks).values({
      id: crypto.randomUUID(),
      workOrderId: input.workOrderId,
      linkType: preset.linkType,
      targetType: "asset",
      targetId: uploaded.asset.id,
      linkedWorkspaceId: workOrder.collaborationSpaceId,
      relationNote: `上传到「${preset.folderName}」`,
      linkedByUserId: input.actor.id,
      metadata: {
        stage: input.stage,
        stageLabel: stageLabel(input.stage),
        folderId: preset.folderId,
        folderName: preset.folderName,
        uploadSource: "work-order-detail",
      },
      createdAt: now(),
      updatedAt: now(),
    });

    uploadedAssets.push({
      id: uploaded.asset.id,
      kind: uploaded.asset.kind,
      title: uploaded.asset.title,
      updatedAt: uploaded.asset.updatedAt,
    });
  }

  await saveSharedBrowserStateForWorkspace({
    kind: "document",
    workspaceId: workOrder.collaborationSpaceId,
    state: {
      deletedFolderIds: sharedState.deletedFolderIds,
      customFolders: sharedState.customFolders,
      innerFolders: sharedState.innerFolders,
      fileStates: nextFileStates,
      boardMessages: sharedState.boardMessages,
    },
  });

  return {
    collaborationSpaceId: workOrder.collaborationSpaceId,
    preset,
    uploadedAssets,
  };
}

function sortMissingItemsForDetail<
  T extends { isBlocking: boolean; status: string; updatedAt: Date; createdAt: Date },
>(items: T[]) {
  return [...items].sort((left, right) => {
    if (left.isBlocking !== right.isBlocking) {
      return left.isBlocking ? -1 : 1;
    }

    if (left.status !== right.status) {
      return left.status === "open" ? -1 : 1;
    }

    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });
}

export async function getWorkOrderDetailById(id: string) {
  const db = getDb();
  const workOrderRows = await db
    .select()
    .from(workOrders)
    .where(eq(workOrders.id, id))
    .limit(1);

  const workOrder = workOrderRows[0] ?? null;

  if (!workOrder) {
    return null;
  }

  const [
    sourceRows,
    dispatchRows,
    deliveryRows,
    missingRows,
    documentLinkRows,
    collaborationSpaceRows,
  ] = await Promise.all([
    db
      .select()
      .from(sourceIntakes)
      .where(eq(sourceIntakes.workOrderId, id))
      .orderBy(desc(sourceIntakes.createdAt)),
    db
      .select()
      .from(dispatchExecutions)
      .where(eq(dispatchExecutions.workOrderId, id))
      .orderBy(desc(dispatchExecutions.dispatchRound), desc(dispatchExecutions.createdAt)),
    db
      .select()
      .from(deliveryResources)
      .where(eq(deliveryResources.workOrderId, id))
      .orderBy(desc(deliveryResources.deliveryRound), desc(deliveryResources.createdAt)),
    db
      .select()
      .from(missingItems)
      .where(eq(missingItems.workOrderId, id))
      .orderBy(desc(missingItems.updatedAt), desc(missingItems.createdAt)),
    db
      .select()
      .from(workOrderDocumentLinks)
      .where(eq(workOrderDocumentLinks.workOrderId, id))
      .orderBy(desc(workOrderDocumentLinks.updatedAt)),
    workOrder.collaborationSpaceId
      ? db
          .select()
          .from(collaborationSpaces)
          .where(eq(collaborationSpaces.id, workOrder.collaborationSpaceId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const userIds = [
    workOrder.createdByUserId,
    workOrder.currentResponsibleUserId,
    ...sourceRows.map((row) => row.confirmedByUserId),
    ...dispatchRows.flatMap((row) => [row.dispatchedByUserId, row.assignedUserId]),
    ...deliveryRows.map((row) => row.submittedByUserId),
    ...missingRows.flatMap((row) => [
      row.ownerUserId,
      row.createdByUserId,
      row.updatedByUserId,
    ]),
    ...collaborationSpaceRows.map((row) => row.ownerUserId),
  ].filter((value): value is string => Boolean(value));

  const assetIds = documentLinkRows
    .filter((row) => row.targetType === "asset")
    .map((row) => row.targetId);
  const folderIds = documentLinkRows
    .filter((row) => row.targetType === "folder_node")
    .map((row) => row.targetId);
  const assignedSquadIds = dispatchRows
    .map((row) => row.assignedSquadId)
    .filter((value): value is string => Boolean(value));
  const linkedWorkspaceIds = documentLinkRows
    .map((row) => row.linkedWorkspaceId)
    .filter((value): value is string => Boolean(value));

  const [userRows, assetRows, folderRows, workspaceRows, squadRows] = await Promise.all([
    userIds.length > 0
      ? db
          .select({
            id: users.id,
            name: users.name,
            roleLabel: users.roleLabel,
            teamLabel: users.teamLabel,
          })
          .from(users)
          .where(inArray(users.id, [...new Set(userIds)]))
      : Promise.resolve([]),
    assetIds.length > 0
      ? db
          .select({
            id: contentAssets.id,
            title: contentAssets.title,
            kind: contentAssets.kind,
            workspaceId: contentAssets.workspaceId,
            trashedAt: contentAssets.trashedAt,
          })
          .from(contentAssets)
          .where(inArray(contentAssets.id, [...new Set(assetIds)]))
      : Promise.resolve([]),
    folderIds.length > 0
      ? db
          .select({
            id: folderNodes.id,
            name: folderNodes.name,
            description: folderNodes.description,
            contentKind: folderNodes.contentKind,
            workspaceId: folderNodes.workspaceId,
            deletedAt: folderNodes.deletedAt,
          })
          .from(folderNodes)
          .where(inArray(folderNodes.id, [...new Set(folderIds)]))
      : Promise.resolve([]),
    linkedWorkspaceIds.length > 0
      ? db
          .select({
            id: workspaces.id,
            name: workspaces.name,
            kind: workspaces.kind,
          })
          .from(workspaces)
          .where(inArray(workspaces.id, [...new Set(linkedWorkspaceIds)]))
      : Promise.resolve([]),
    assignedSquadIds.length > 0
      ? db
          .select({
            id: engineeringSquads.id,
            code: engineeringSquads.code,
            name: engineeringSquads.name,
            status: engineeringSquads.status,
            leaderMemberId: engineeringSquads.leaderMemberId,
          })
          .from(engineeringSquads)
          .where(inArray(engineeringSquads.id, [...new Set(assignedSquadIds)]))
      : Promise.resolve([]),
  ]);

  const userMap = new Map(userRows.map((row) => [row.id, row]));
  const assetMap = new Map(assetRows.map((row) => [row.id, row]));
  const folderMap = new Map(folderRows.map((row) => [row.id, row]));
  const workspaceMap = new Map(workspaceRows.map((row) => [row.id, row]));
  const squadMap = new Map(squadRows.map((row) => [row.id, row]));
  const collaborationSpace = collaborationSpaceRows[0] ?? null;
  const detailDocumentLinks = documentLinkRows.map((row) => {
    const linkedAsset = row.targetType === "asset" ? assetMap.get(row.targetId) : null;
    const linkedFolder =
      row.targetType === "folder_node" ? folderMap.get(row.targetId) : null;
    const linkedWorkspace = row.linkedWorkspaceId
      ? (workspaceMap.get(row.linkedWorkspaceId) ?? null)
      : null;

    return {
      ...row,
      linkedByUserName: row.linkedByUserId
        ? (userMap.get(row.linkedByUserId)?.name ?? null)
        : null,
      linkedWorkspaceName: linkedWorkspace?.name ?? null,
      targetTitle:
        linkedAsset?.title ?? linkedFolder?.name ?? row.relationNote ?? row.targetId,
      targetKind: linkedAsset?.kind ?? linkedFolder?.contentKind ?? null,
      targetWorkspaceId:
        linkedAsset?.workspaceId ?? linkedFolder?.workspaceId ?? row.linkedWorkspaceId,
      targetDescription: linkedFolder?.description ?? null,
      targetDeletedAt: linkedAsset?.trashedAt ?? linkedFolder?.deletedAt ?? null,
      stage: extractStageFromLinkMetadata(row.metadata),
    };
  });
  const primaryCadLink =
    [...detailDocumentLinks]
      .filter((item) => {
        const normalizedKind = normalizeCadAssetKind(item.targetKind);

        return (
          item.targetType === "asset" &&
          !item.targetDeletedAt &&
          normalizedKind !== null &&
          isCadFileName(item.targetTitle) &&
          item.stage !== null &&
          PRIMARY_CAD_STAGES.includes(item.stage)
        );
      })
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0] ?? null;
  const primaryCadAsset =
    primaryCadLink && normalizeCadAssetKind(primaryCadLink.targetKind)
      ? {
          assetId: primaryCadLink.targetId,
          kind: normalizeCadAssetKind(primaryCadLink.targetKind) as CadAssetKind,
          fileName: primaryCadLink.targetTitle,
          stage: primaryCadLink.stage as WorkOrderStage,
          stageLabel: stageLabel(primaryCadLink.stage as WorkOrderStage),
          relationNote: primaryCadLink.relationNote,
          updatedAt: primaryCadLink.updatedAt,
        }
      : null;
  const detailMissingItems = sortMissingItemsForDetail(missingRows).map((row) => ({
    ...row,
    ownerUserName: row.ownerUserId ? (userMap.get(row.ownerUserId)?.name ?? null) : null,
    createdByUserName: row.createdByUserId
      ? (userMap.get(row.createdByUserId)?.name ?? null)
      : null,
    updatedByUserName: row.updatedByUserId
      ? (userMap.get(row.updatedByUserId)?.name ?? null)
      : null,
  }));

  return {
    workOrder: {
      ...workOrder,
      createdByUserName: userMap.get(workOrder.createdByUserId)?.name ?? null,
      currentResponsibleUserName: workOrder.currentResponsibleUserId
        ? (userMap.get(workOrder.currentResponsibleUserId)?.name ?? null)
        : null,
      currentResponsibleUserRoleLabel: workOrder.currentResponsibleUserId
        ? (userMap.get(workOrder.currentResponsibleUserId)?.roleLabel ?? null)
        : null,
      currentResponsibleUserTeamLabel: workOrder.currentResponsibleUserId
        ? (userMap.get(workOrder.currentResponsibleUserId)?.teamLabel ?? null)
        : null,
    },
    collaborationSpace: collaborationSpace
      ? {
          ...collaborationSpace,
          ownerUserName: userMap.get(collaborationSpace.ownerUserId)?.name ?? null,
        }
      : null,
    sourceIntakes: sourceRows.map((row) => ({
      ...row,
      confirmedByUserName: row.confirmedByUserId
        ? (userMap.get(row.confirmedByUserId)?.name ?? null)
        : null,
    })),
    dispatchExecutions: dispatchRows.map((row) => {
      const payload = parseDispatchPayload(row.payload);
      const linkedSquad =
        row.assignedSquadId ? (squadMap.get(row.assignedSquadId) ?? null) : null;

      return {
        ...row,
        ...payload,
        assignedSquadCode: linkedSquad?.code ?? null,
        assignedSquadName: linkedSquad?.name ?? row.assignedTeamLabel,
        assignedSquadStatus: linkedSquad?.status ?? null,
        dispatchedByUserName: row.dispatchedByUserId
          ? (userMap.get(row.dispatchedByUserId)?.name ?? null)
          : null,
        assignedUserName: row.assignedUserId
          ? (userMap.get(row.assignedUserId)?.name ?? null)
          : null,
        assignedUserRoleLabel: row.assignedUserId
          ? (userMap.get(row.assignedUserId)?.roleLabel ?? null)
          : null,
        assignedUserTeamLabel: row.assignedUserId
          ? (userMap.get(row.assignedUserId)?.teamLabel ?? null)
          : null,
      };
    }),
    deliveryResources: deliveryRows.map((row) => ({
      ...row,
      submittedByUserName: row.submittedByUserId
        ? (userMap.get(row.submittedByUserId)?.name ?? null)
        : null,
    })),
    missingItems: {
      totalCount: detailMissingItems.length,
      blockingCount: detailMissingItems.filter((row) => row.isBlocking).length,
      open: detailMissingItems.filter(
        (row) => row.status !== "resolved" && row.status !== "waived",
      ),
      resolved: detailMissingItems.filter(
        (row) => row.status === "resolved" || row.status === "waived",
      ),
    },
    documentLinks: detailDocumentLinks,
    primaryCadAsset,
    permissions: {
      canView: true,
      canManage: true,
      canEdit: true,
      canDelete: true,
    },
  };
}

export async function deleteWorkOrder(id: string) {
  const db = getDb();
  const existing = await db
    .select({ id: workOrders.id })
    .from(workOrders)
    .where(eq(workOrders.id, id))
    .limit(1);

  if (existing.length === 0) {
    return false;
  }

  await db.delete(workOrders).where(eq(workOrders.id, id));
  return true;
}

export async function getWorkOrderById(id: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(workOrders)
    .where(eq(workOrders.id, id))
    .limit(1);

  return rows[0] ?? null;
}

export async function listWorkOrdersForCollaborationSpace(
  collaborationSpaceId: string,
) {
  const db = getDb();

  return db
    .select()
    .from(workOrders)
    .where(eq(workOrders.collaborationSpaceId, collaborationSpaceId))
    .orderBy(desc(workOrders.updatedAt));
}

export async function listAssignedWorkOrders(userId: string) {
  const db = getDb();

  return db
    .select({
      id: workOrders.id,
      workOrderNo: workOrders.workOrderNo,
      title: workOrders.title,
      stage: workOrders.stage,
      status: workOrders.status,
      priority: workOrders.priority,
      warningStatus: workOrders.warningStatus,
      projectName: workOrders.projectName,
      siteName: workOrders.siteName,
      materialCompleteness: workOrders.materialCompleteness,
      nextAction: workOrders.nextAction,
      latestProgressSummary: workOrders.latestProgressSummary,
      missingItemCount: workOrders.missingItemCount,
      blockingItemCount: workOrders.blockingItemCount,
      updatedAt: workOrders.updatedAt,
    })
    .from(workOrders)
    .where(
      and(
        eq(workOrders.currentResponsibleUserId, userId),
        sql`${workOrders.archivedAt} is null`,
      ),
    )
    .orderBy(desc(workOrders.updatedAt));
}

function countExpr() {
  return sql<number>`count(*)::int`;
}

export async function listWorkOrders() {
  const db = getDb();

  return db
    .select({
      id: workOrders.id,
      workOrderNo: workOrders.workOrderNo,
      title: workOrders.title,
      sourceType: workOrders.sourceType,
      sourceSummary: workOrders.sourceSummary,
      projectName: workOrders.projectName,
      siteName: workOrders.siteName,
      siteAddress: workOrders.siteAddress,
      stage: workOrders.stage,
      status: workOrders.status,
      priority: workOrders.priority,
      warningStatus: workOrders.warningStatus,
      currentResponsibleTeam: workOrders.currentResponsibleTeam,
      currentResponsibleUserId: workOrders.currentResponsibleUserId,
      collaborationSpaceId: workOrders.collaborationSpaceId,
      materialCompleteness: workOrders.materialCompleteness,
      nextAction: workOrders.nextAction,
      latestProgressSummary: workOrders.latestProgressSummary,
      missingItemCount: workOrders.missingItemCount,
      blockingItemCount: workOrders.blockingItemCount,
      updatedAt: workOrders.updatedAt,
      archivedAt: workOrders.archivedAt,
    })
    .from(workOrders)
    .orderBy(desc(workOrders.updatedAt));
}

export async function getWorkOrderDashboardData(userId: string) {
  const db = getDb();

  const [
    totalRows,
    activeRows,
    warningRows,
    archivedRows,
    assignedRows,
    latestRows,
    userRows,
  ] = await Promise.all([
    db.select({ count: countExpr() }).from(workOrders),
    db
      .select({ count: countExpr() })
      .from(workOrders)
      .where(isNull(workOrders.archivedAt)),
    db
      .select({ count: countExpr() })
      .from(workOrders)
      .where(eq(workOrders.stage, "warning")),
    db
      .select({ count: countExpr() })
      .from(workOrders)
      .where(sql`${workOrders.archivedAt} is not null`),
    db
      .select({ count: countExpr() })
      .from(workOrders)
      .where(eq(workOrders.currentResponsibleUserId, userId)),
    listWorkOrders(),
    db
      .select({
        id: users.id,
        name: users.name,
      })
      .from(users),
  ]);

  const userMap = new Map(userRows.map((row) => [row.id, row.name]));
  const workOrderIds = latestRows.map((row) => row.id);
  const latestDispatchRows =
    workOrderIds.length > 0
      ? await db
          .select({
            workOrderId: dispatchExecutions.workOrderId,
            assignedSquadId: dispatchExecutions.assignedSquadId,
            assignedTeamLabel: dispatchExecutions.assignedTeamLabel,
            assignedUserId: dispatchExecutions.assignedUserId,
            plannedStartAt: dispatchExecutions.plannedStartAt,
            payload: dispatchExecutions.payload,
            createdAt: dispatchExecutions.createdAt,
            dispatchRound: dispatchExecutions.dispatchRound,
          })
          .from(dispatchExecutions)
          .where(inArray(dispatchExecutions.workOrderId, workOrderIds))
          .orderBy(
            desc(dispatchExecutions.dispatchRound),
            desc(dispatchExecutions.createdAt),
          )
      : [];
  const latestDispatchMap = new Map<
    string,
    (typeof latestDispatchRows)[number]
  >();

  for (const row of latestDispatchRows) {
    if (!latestDispatchMap.has(row.workOrderId)) {
      latestDispatchMap.set(row.workOrderId, row);
    }
  }

  return {
    totalCount: totalRows[0]?.count ?? 0,
    activeCount: activeRows[0]?.count ?? 0,
    warningCount: warningRows[0]?.count ?? 0,
    archivedCount: archivedRows[0]?.count ?? 0,
    assignedToMeCount: assignedRows[0]?.count ?? 0,
    workOrders: latestRows.map((row) => ({
      ...row,
      currentResponsibleUserName: row.currentResponsibleUserId
        ? (userMap.get(row.currentResponsibleUserId) ?? null)
        : null,
      ...(function dispatchSummary() {
        const latestDispatch = latestDispatchMap.get(row.id);
        if (!latestDispatch) {
          return {
            assignedCrewTeamLabel: "",
            assignedCrewLeaderName: null,
            assignedCrewMemberCount: 0,
            assignedCrewMemberNames: [] as string[],
            assignedCrewPlannedStartAt: null as Date | null,
          };
        }

        const payload = parseDispatchPayload(latestDispatch.payload);

        return {
          assignedCrewSquadId: latestDispatch.assignedSquadId,
          assignedCrewTeamLabel: latestDispatch.assignedTeamLabel,
          assignedCrewLeaderName:
            payload.crewLeaderName ||
            (latestDispatch.assignedUserId
              ? (userMap.get(latestDispatch.assignedUserId) ?? null)
              : null),
          assignedCrewMemberCount: payload.crewMemberCount,
          assignedCrewMemberNames: payload.crewMemberNames,
          assignedCrewPlannedStartAt: latestDispatch.plannedStartAt,
        };
      })(),
    })),
  };
}
