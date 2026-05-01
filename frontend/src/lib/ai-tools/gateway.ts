import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { runOpenClawWorkOrderExecution } from "@/lib/ai-dorm/openclaw-gateway";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { getDb } from "@/lib/db/client";
import {
  copyAssetToWorkspace,
  getAssetById,
  listAssetsForUser,
  overwriteAssetTextContent,
  type ContentKind,
} from "@/lib/content/server";
import {
  executionResults,
  executionTasks,
  executionWritebackDrafts,
  workOrders,
} from "@/lib/db/schema";
import {
  createWorkOrder,
  getWorkOrderDetailById,
  listWorkOrders,
} from "@/lib/work-order/server";

export const AI_TOOL_NAMES = [
  "work_order.read",
  "work_order.search",
  "work_order.create",
  "work_order.update",
  "work_order.archive",
  "work_order.writeback_draft.create",
  "work_order.writeback.apply",
  "openclaw.work_order.execute",
  "document.list",
  "document.search",
  "document.read",
  "document.write_content",
  "document.create",
] as const;

export type AiToolName = (typeof AI_TOOL_NAMES)[number];
export type AiToolRunStatus = "completed" | "not_found" | "failed";

export type AiToolExecutionContext = {
  user: AuthenticatedUser;
};

export type AiToolRunRequest = {
  toolName: AiToolName | string;
  input: unknown;
};

export type AiToolRunRecord = {
  callId: string;
  toolName: string;
  sourceKind: AiCapabilitySourceKind | "unknown";
  riskLevel: AiCapabilityRiskLevel | "unknown";
  status: AiToolRunStatus;
  summaryText: string;
  input: Record<string, unknown>;
  structuredPayload: Record<string, unknown> | null;
  trace: AiToolCallTrace;
  startedAt: string;
  completedAt: string;
  errorCode?: string;
};

type AiToolResult = Pick<
  AiToolRunRecord,
  "status" | "summaryText" | "structuredPayload" | "errorCode"
>;

export type AiCapabilityDomain = "work_order" | "document" | "openclaw";
export type AiCapabilitySourceKind = "internal" | "mcp" | "longxia";
export type AiCapabilityRiskLevel =
  | "read"
  | "analysis"
  | "draft_write"
  | "safe_write"
  | "restricted_write"
  | "external_action"
  | "destructive";
export type AiCapabilityAction =
  | "read"
  | "list"
  | "search"
  | "create"
  | "update"
  | "archive"
  | "draft"
  | "apply"
  | "delegate";
export type AiCapabilityExecutionMode = "direct" | "plan_only" | "orchestrated";

export type AiResourceDescriptor = {
  type: AiCapabilityDomain | string;
  displayName: string;
  identifierKeys: string[];
  sourceKind: AiCapabilitySourceKind;
  description: string;
};

export type AiToolStandardPayload = {
  data: Record<string, unknown> | null;
  changedObjects: string[];
  artifacts: Array<Record<string, unknown>>;
  followupQuestions: string[];
  candidates: Array<Record<string, unknown>>;
  raw: Record<string, unknown> | null;
};

export type AiToolCallTrace = {
  callId: string;
  toolName: string;
  sourceKind: AiCapabilitySourceKind | "unknown";
  riskLevel: AiCapabilityRiskLevel | "unknown";
  input: Record<string, unknown>;
  output: AiToolStandardPayload | null;
  status: AiToolRunStatus;
  summaryText: string;
  startedAt: string;
  completedAt: string;
  changedObjects: string[];
  artifacts: Array<Record<string, unknown>>;
  errorCode?: string;
};

export type AiToolRegistrySnapshot = {
  resources: AiResourceDescriptor[];
  capabilities: AiCapabilityDescriptor[];
};

export type AiCapabilityTarget = {
  objectType: string;
  identifierKeys: string[];
  mutates: boolean;
};

export type AiCapabilityPlannerHints = {
  whenToUse: string;
  requiredInformation: string[];
  missingInformationPrompt: string;
  examples: string[];
};

export type AiCapabilityDescriptor = {
  name: string;
  displayName: string;
  domain: AiCapabilityDomain;
  action: AiCapabilityAction;
  sourceKind: AiCapabilitySourceKind;
  riskLevel: AiCapabilityRiskLevel;
  executionMode: AiCapabilityExecutionMode;
  description: string;
  target: AiCapabilityTarget;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requiredContext: string[];
  plannerHints: AiCapabilityPlannerHints;
  failureModes: string[];
  mutatesDemoData: boolean;
  requiresConfirmationDefault: boolean;
};

export type AiCapability = AiCapabilityDescriptor & {
  execute: (
    context: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) => Promise<AiToolResult>;
};

type WorkOrderReadResult = AiToolResult;

type WorkOrderSearchResult = AiToolResult;

type WorkOrderCreateResult = AiToolResult;

type WorkOrderWritebackDraftCreateResult = AiToolResult;

type WorkOrderWritebackApplyResult = AiToolResult;

type OpenClawWorkOrderExecuteResult = AiToolResult;

type DocumentListResult = AiToolResult;

type DocumentSearchResult = AiToolResult;

type DocumentReadResult = AiToolResult;

type DocumentWriteContentResult = AiToolResult;

type DocumentCreateResult = AiToolResult;

type WorkOrderRow = Awaited<ReturnType<typeof listWorkOrders>>[number];

type WritebackCandidateInput = {
  objectType: string;
  objectRef: string;
  operation: string;
  proposedValue: string;
  requiresConfirmation: boolean;
  status: string;
};

type AppliedWritebackChange = {
  draftId: string;
  objectType: string;
  objectRef: string;
  operation: string;
  fieldPath: string;
  previousValue: unknown;
  nextValue: unknown;
  applied: boolean;
  noOpReason?: string;
};

const WORK_ORDER_WRITEBACK_OPERATIONS = [
  "draft_next_action",
  "draft_risk_followup",
  "draft_priority",
  "draft_stage",
  "draft_status",
  "draft_title",
  "draft_source_summary",
  "draft_project_name",
  "draft_site_name",
  "draft_site_address",
  "draft_responsible_team",
  "draft_progress_summary",
  "draft_material_completeness",
  "draft_missing_item_count",
  "draft_blocking_item_count",
  "draft_warning_status",
  "archive_work_order",
] as const;

const WORK_ORDER_STAGE_LABELS: Record<string, string> = {
  source_intake: "来源登记",
  registration: "工单登记",
  dispatch: "派单",
  warning: "预警处置",
  field_construction: "现场施工",
  return_sheet: "回单资料",
  drawing_delivery: "图纸交付",
  resource_entry: "录资源",
  resource_audit: "资源稽核",
  design_package: "打包出设计",
};

const WORK_ORDER_STATUS_LABELS: Record<string, string> = {
  open: "待推进",
  in_progress: "推进中",
  waiting: "等待中",
  blocked: "阻塞",
  completed: "已完成",
  cancelled: "已取消",
  archived: "已归档",
};

const WORK_ORDER_PRIORITY_LABELS: Record<string, string> = {
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
};

const WORK_ORDER_STAGE_VALUES = new Set(Object.keys(WORK_ORDER_STAGE_LABELS));
const WORK_ORDER_STATUS_VALUES = new Set(Object.keys(WORK_ORDER_STATUS_LABELS));
const WORK_ORDER_PRIORITY_VALUES = new Set(Object.keys(WORK_ORDER_PRIORITY_LABELS));

const WORK_ORDER_WARNING_LABELS: Record<string, string> = {
  normal: "正常",
  warning: "预警",
  critical: "严重预警",
  resolved: "已解除",
};
const WORK_ORDER_WARNING_VALUES = new Set(Object.keys(WORK_ORDER_WARNING_LABELS));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeInput(input: unknown) {
  return isRecord(input) ? input : {};
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function readTextContent(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function readBoolean(record: Record<string, unknown>, key: string, fallback: boolean) {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

function readContentKind(record: Record<string, unknown>, fallback: ContentKind) {
  const value = readString(record, "kind");
  return value === "document" || value === "sheet" || value === "slide"
    ? value
    : fallback;
}

function buildDocumentAssetPayload(asset: Awaited<ReturnType<typeof getAssetById>>) {
  if (!asset) {
    return null;
  }

  return {
    id: asset.id,
    kind: asset.kind,
    title: asset.title,
    workspaceId: asset.workspaceId,
    folderId: asset.folderId ?? null,
    originalFileName: asset.originalFileName,
    mimeType: asset.mimeType ?? null,
    sizeBytes: asset.sizeBytes,
    openPath: `/docs/documents/${asset.id}`,
    contentPath: `/api/assets/${asset.kind}/${asset.id}/content`,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    trashedAt: asset.trashedAt ?? null,
  };
}

function summarizeDocumentKind(kind: ContentKind) {
  return kind === "document" ? "文档" : kind === "sheet" ? "表格" : "演示文稿";
}

function readMetadataArray(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function readStringArrayPayload(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readRecordArrayPayload(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function buildToolCallId(toolName: string, startedAt: string) {
  return `tool-call-${createHash("sha1")
    .update(`${toolName}:${startedAt}:${randomBytes(8).toString("hex")}`)
    .digest("hex")
    .slice(0, 16)}`;
}

function standardizeToolPayload(payload: Record<string, unknown> | null | undefined): AiToolStandardPayload {
  const record = payload ?? null;
  const changedObjects = readStringArrayPayload(record, "changedObjects");
  const artifacts = readRecordArrayPayload(record, "artifacts");
  const followupQuestions = readStringArrayPayload(record, "followupQuestions");
  const candidates = readRecordArrayPayload(record, "candidates");
  const reservedKeys = new Set([
    "actor",
    "standard",
    "trace",
    "changedObjects",
    "artifacts",
    "followupQuestions",
    "candidates",
  ]);
  const data = record
    ? Object.fromEntries(Object.entries(record).filter(([key]) => !reservedKeys.has(key)))
    : null;

  return {
    data,
    changedObjects,
    artifacts,
    followupQuestions,
    candidates,
    raw: record,
  };
}

function buildToolTrace(params: {
  callId: string;
  capability: AiCapability | null;
  toolName: string;
  input: Record<string, unknown>;
  result: AiToolResult;
  payload: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string;
}): AiToolCallTrace {
  const output = standardizeToolPayload(params.payload);

  return {
    callId: params.callId,
    toolName: params.toolName,
    sourceKind: params.capability?.sourceKind ?? "unknown",
    riskLevel: params.capability?.riskLevel ?? "unknown",
    input: params.input,
    output,
    status: params.result.status,
    summaryText: params.result.summaryText,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    changedObjects: output.changedObjects,
    artifacts: output.artifacts,
    errorCode: params.result.errorCode,
  };
}

function findRiskFollowupByValue(items: unknown[], value: string) {
  return items.find((item) => isRecord(item) && readString(item, "value") === value);
}

function isAllowedWritebackOperation(value: string) {
  return (WORK_ORDER_WRITEBACK_OPERATIONS as readonly string[]).includes(value);
}

function validateWorkOrderWritebackValue(operation: string, value: string) {
  if (operation === "draft_priority") {
    return WORK_ORDER_PRIORITY_VALUES.has(value);
  }

  if (operation === "draft_stage") {
    return WORK_ORDER_STAGE_VALUES.has(value);
  }

  if (operation === "draft_status") {
    return WORK_ORDER_STATUS_VALUES.has(value);
  }

  if (operation === "draft_warning_status") {
    return WORK_ORDER_WARNING_VALUES.has(value);
  }

  if (
    operation === "draft_material_completeness" ||
    operation === "draft_missing_item_count" ||
    operation === "draft_blocking_item_count"
  ) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0;
  }

  return Boolean(value);
}

function normalizeWorkOrderNo(value: string) {
  return value.trim().replace(/\s+/g, "-").replace(/_/g, "-").toUpperCase();
}

function workOrderCompareKey(value: string) {
  return normalizeWorkOrderNo(value).replace(/[^A-Z0-9]/g, "");
}

function toIsoOrNull(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseNonNegativeInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function parsePercent(value: string) {
  return Math.min(100, parseNonNegativeInteger(value));
}

function workOrderTextUpdate(
  draft: typeof executionWritebackDrafts.$inferSelect,
  fieldPath: string,
  previousValue: string,
  nextValue: string,
) {
  const unchanged = previousValue === nextValue;

  return {
    draftId: draft.id,
    objectType: draft.objectType,
    objectRef: draft.objectRef,
    operation: draft.operation,
    fieldPath,
    previousValue,
    nextValue,
    applied: !unchanged,
    ...(unchanged ? { noOpReason: "unchanged" } : {}),
  } satisfies AppliedWritebackChange;
}

function workOrderNumberUpdate(
  draft: typeof executionWritebackDrafts.$inferSelect,
  fieldPath: string,
  previousValue: number,
  nextValue: number,
) {
  const unchanged = previousValue === nextValue;

  return {
    draftId: draft.id,
    objectType: draft.objectType,
    objectRef: draft.objectRef,
    operation: draft.operation,
    fieldPath,
    previousValue,
    nextValue,
    applied: !unchanged,
    ...(unchanged ? { noOpReason: "unchanged" } : {}),
  } satisfies AppliedWritebackChange;
}

function labelFrom(map: Record<string, string>, value: string | null | undefined) {
  return value ? (map[value] ?? value) : "";
}

function findWorkOrderByNo(rows: WorkOrderRow[], workOrderNo: string) {
  const normalized = normalizeWorkOrderNo(workOrderNo);
  const compareKey = workOrderCompareKey(workOrderNo);

  return (
    rows.find((row) => normalizeWorkOrderNo(row.workOrderNo) === normalized) ??
    rows.find((row) => workOrderCompareKey(row.workOrderNo) === compareKey) ??
    null
  );
}

function normalizeSearchToken(value: string) {
  return value
    .toLowerCase()
    .replace(/工单|项目|站点|地址|那张|这个|这张|一下/g, "")
    .replace(/[\s#，。、“”‘’：:；;,.\-_/\\]+/g, "")
    .trim();
}

function scoreWorkOrderSearch(row: WorkOrderRow, query: string) {
  const queryToken = normalizeSearchToken(query);
  const fieldEntries = [
    ["workOrderNo", row.workOrderNo, 120],
    ["title", row.title, 80],
    ["projectName", row.projectName, 50],
    ["siteName", row.siteName, 45],
    ["siteAddress", row.siteAddress, 35],
    ["sourceSummary", row.sourceSummary, 30],
    ["currentResponsibleTeam", row.currentResponsibleTeam, 20],
  ] as const;
  const matchedFields: string[] = [];
  let score = 0;

  for (const [fieldName, fieldValue, weight] of fieldEntries) {
    const fieldToken = normalizeSearchToken(fieldValue ?? "");

    if (!queryToken || !fieldToken) {
      continue;
    }

    if (fieldToken === queryToken) {
      score += weight + 80;
      matchedFields.push(fieldName);
      continue;
    }

    if (fieldToken.includes(queryToken) || queryToken.includes(fieldToken)) {
      score += weight + Math.min(fieldToken.length, queryToken.length);
      matchedFields.push(fieldName);
      continue;
    }

    const uniqueChars = Array.from(new Set(queryToken.split("")));
    const overlap = uniqueChars.filter((char) => fieldToken.includes(char)).length;

    if (overlap >= 2) {
      score += Math.min(weight, overlap * 3);
      matchedFields.push(fieldName);
    }
  }

  return { score, matchedFields: [...new Set(matchedFields)] };
}

function buildWorkOrderSearchCandidate(row: WorkOrderRow, score: number, matchedFields: string[]) {
  return {
    workOrderId: row.id,
    workOrderNo: row.workOrderNo,
    title: row.title,
    projectName: row.projectName,
    siteName: row.siteName,
    siteAddress: row.siteAddress,
    stage: row.stage,
    stageLabel: labelFrom(WORK_ORDER_STAGE_LABELS, row.stage),
    status: row.status,
    statusLabel: labelFrom(WORK_ORDER_STATUS_LABELS, row.status),
    priority: row.priority,
    priorityLabel: labelFrom(WORK_ORDER_PRIORITY_LABELS, row.priority),
    warningStatus: row.warningStatus,
    warningLabel: labelFrom(WORK_ORDER_WARNING_LABELS, row.warningStatus),
    score,
    matchedFields,
  };
}

function buildWritebackDraftId(params: {
  resultId: string;
  objectType: string;
  objectRef: string;
  operation: string;
}) {
  const digest = createHash("sha1")
    .update(
      [
        "writeback-draft",
        params.resultId,
        params.objectType,
        params.objectRef,
        params.operation,
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 24);

  return `writeback-draft-${digest}`;
}

function readWritebackCandidates(input: Record<string, unknown>) {
  const candidates = input.candidates;

  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .map((candidate): WritebackCandidateInput | null => {
      if (!isRecord(candidate)) {
        return null;
      }

      const objectType = readString(candidate, "objectType");
      const objectRef = readString(candidate, "objectRef");
      const operation = readString(candidate, "operation");
      const proposedValue = readString(candidate, "proposedValue");

      if (!objectType || !objectRef || !operation || !proposedValue) {
        return null;
      }

      return {
        objectType,
        objectRef,
        operation,
        proposedValue,
        requiresConfirmation: readBoolean(candidate, "requiresConfirmation", true),
        status: readString(candidate, "status") || "not_applied",
      };
    })
    .filter((candidate): candidate is WritebackCandidateInput => Boolean(candidate));
}

function readStringArrayInput(input: Record<string, unknown>, key: string) {
  const value = input[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function buildWorkOrderPayload(row: WorkOrderRow, detail: Awaited<ReturnType<typeof getWorkOrderDetailById>>) {
  const detailWorkOrder = detail?.workOrder ?? null;
  const latestDispatch = detail?.dispatchExecutions?.[0] ?? null;

  return {
    id: row.id,
    workOrderNo: row.workOrderNo,
    title: row.title,
    projectName: row.projectName,
    siteName: row.siteName,
    siteAddress: row.siteAddress,
    stage: row.stage,
    stageLabel: labelFrom(WORK_ORDER_STAGE_LABELS, row.stage),
    status: row.status,
    statusLabel: labelFrom(WORK_ORDER_STATUS_LABELS, row.status),
    priority: row.priority,
    priorityLabel: labelFrom(WORK_ORDER_PRIORITY_LABELS, row.priority),
    warningStatus: row.warningStatus,
    warningLabel: labelFrom(WORK_ORDER_WARNING_LABELS, row.warningStatus),
    currentResponsibleTeam: row.currentResponsibleTeam,
    currentResponsibleUserId: row.currentResponsibleUserId,
    currentResponsibleUserName: detailWorkOrder?.currentResponsibleUserName ?? null,
    currentResponsibleUserRoleLabel:
      detailWorkOrder?.currentResponsibleUserRoleLabel ?? null,
    collaborationSpaceId: row.collaborationSpaceId,
    collaborationSpaceName: detail?.collaborationSpace?.name ?? null,
    materialCompleteness: row.materialCompleteness,
    nextAction: row.nextAction,
    latestProgressSummary: row.latestProgressSummary,
    missingItemCount: row.missingItemCount,
    blockingItemCount: row.blockingItemCount,
    openMissingItemCount: detail?.missingItems.open.length ?? row.missingItemCount,
    resolvedMissingItemCount: detail?.missingItems.resolved.length ?? null,
    documentLinkCount: detail?.documentLinks.length ?? null,
    latestDispatchExecution: latestDispatch
      ? {
          id: latestDispatch.id,
          status: latestDispatch.executionStatus,
          assignedTeamLabel: latestDispatch.assignedTeamLabel,
          assignedUserName: latestDispatch.assignedUserName,
          anomalySummary: latestDispatch.anomalySummary,
          warningReason: latestDispatch.warningReason,
          nextAction: latestDispatch.nextAction,
          updatedAt: toIsoOrNull(latestDispatch.updatedAt),
        }
      : null,
    updatedAt: toIsoOrNull(row.updatedAt),
    archivedAt: toIsoOrNull(row.archivedAt),
  };
}

async function runWorkOrderRead(input: Record<string, unknown>): Promise<WorkOrderReadResult> {
  const requestedWorkOrderId = readString(input, "workOrderId");
  const requestedWorkOrderNo = readString(input, "workOrderNo");

  if (!requestedWorkOrderId && !requestedWorkOrderNo) {
    return {
      status: "failed",
      summaryText: "work_order.read 缺少 workOrderId 或 workOrderNo，无法定位工单。",
      structuredPayload: {
        query: { workOrderId: requestedWorkOrderId, workOrderNo: requestedWorkOrderNo },
        workOrder: null,
      },
      errorCode: "INVALID_WORK_ORDER_QUERY",
    };
  }

  const rows = await listWorkOrders();
  const row =
    (requestedWorkOrderId
      ? rows.find((item) => item.id === requestedWorkOrderId)
      : null) ??
    (requestedWorkOrderNo ? findWorkOrderByNo(rows, requestedWorkOrderNo) : null);

  if (!row) {
    const label = requestedWorkOrderNo || requestedWorkOrderId;

    return {
      status: "not_found",
      summaryText: `没有在工单真源表中找到「${label}」。`,
      structuredPayload: {
        query: {
          workOrderId: requestedWorkOrderId || null,
          workOrderNo: requestedWorkOrderNo || null,
        },
        workOrder: null,
        matched: false,
      },
      errorCode: "WORK_ORDER_NOT_FOUND",
    };
  }

  const detail = await getWorkOrderDetailById(row.id);
  const workOrder = buildWorkOrderPayload(row, detail);

  return {
    status: "completed",
    summaryText: `${workOrder.workOrderNo} 当前为「${workOrder.statusLabel}」，节点是「${workOrder.stageLabel}」，下一步是：${workOrder.nextAction || "暂无明确下一步"}。`,
    structuredPayload: {
      query: {
        workOrderId: requestedWorkOrderId || null,
        workOrderNo: requestedWorkOrderNo || null,
      },
      matched: true,
      workOrder,
    },
  };
}

async function runWorkOrderSearch(input: Record<string, unknown>): Promise<WorkOrderSearchResult> {
  const query = readString(input, "query") || readString(input, "naturalLanguageQuery");
  const limitInput = Number(readString(input, "limit") || 5);
  const limit = Number.isFinite(limitInput) ? Math.min(10, Math.max(1, limitInput)) : 5;

  if (!query) {
    return {
      status: "failed",
      summaryText: "work_order.search 缺少 query，无法搜索工单。",
      structuredPayload: {
        query,
        candidates: [],
        count: 0,
      },
      errorCode: "INVALID_WORK_ORDER_SEARCH_QUERY",
    };
  }

  const rows = await listWorkOrders();
  const genericQuery = normalizeSearchToken(query).length === 0;
  const candidates = genericQuery
    ? rows
        .slice(0, limit)
        .map((row) => buildWorkOrderSearchCandidate(row, 1, ["recent"]))
    : rows
        .map((row) => {
          const { score, matchedFields } = scoreWorkOrderSearch(row, query);
          return { row, score, matchedFields };
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, limit)
        .map((item) =>
          buildWorkOrderSearchCandidate(item.row, item.score, item.matchedFields),
        );

  if (candidates.length === 0) {
    return {
      status: "not_found",
      summaryText: `没有找到和「${query}」匹配的工单。`,
      structuredPayload: {
        query,
        candidates: [],
        count: 0,
      },
      errorCode: "WORK_ORDER_SEARCH_NOT_FOUND",
    };
  }

  return {
    status: "completed",
    summaryText: `找到 ${candidates.length} 个和「${query}」相关的工单，首个候选是 ${candidates[0]?.workOrderNo}「${candidates[0]?.title}」。`,
    structuredPayload: {
      query,
      candidates,
      count: candidates.length,
      bestCandidate: candidates[0] ?? null,
    },
  };
}

async function runWorkOrderCreate(
  context: AiToolExecutionContext,
  input: Record<string, unknown>,
): Promise<WorkOrderCreateResult> {
  const title = readString(input, "title");
  const sourceSummary = readString(input, "sourceSummary") || title;
  const projectName = readString(input, "projectName");
  const siteName = readString(input, "siteName");
  const nextAction = readString(input, "nextAction");
  const priority = readString(input, "priority") || "normal";
  const stage = readString(input, "stage") || "registration";

  if (!title) {
    return {
      status: "failed",
      summaryText: "work_order.create 缺少 title，无法创建工单。",
      structuredPayload: {
        workOrder: null,
        changedObjects: [],
      },
      errorCode: "INVALID_WORK_ORDER_CREATE_INPUT",
    };
  }

  if (!WORK_ORDER_PRIORITY_VALUES.has(priority)) {
    return {
      status: "failed",
      summaryText: `work_order.create 的优先级 ${priority} 不在允许范围内。`,
      structuredPayload: {
        title,
        priority,
        workOrder: null,
        changedObjects: [],
      },
      errorCode: "INVALID_WORK_ORDER_PRIORITY",
    };
  }

  if (!WORK_ORDER_STAGE_VALUES.has(stage)) {
    return {
      status: "failed",
      summaryText: `work_order.create 的阶段 ${stage} 不在允许范围内。`,
      structuredPayload: {
        title,
        stage,
        workOrder: null,
        changedObjects: [],
      },
      errorCode: "INVALID_WORK_ORDER_STAGE",
    };
  }

  const created = await createWorkOrder({
    title,
    createdByUserId: context.user.id,
    sourceType: "manual",
    sourceSummary,
    projectName,
    siteName,
    currentStage: stage as Parameters<typeof createWorkOrder>[0]["currentStage"],
    priority: priority as Parameters<typeof createWorkOrder>[0]["priority"],
    nextAction,
    latestProgressSummary:
      readString(input, "latestProgressSummary") ||
      `由 BP问问根据自然语言创建：${sourceSummary}`,
    metadata: {
      bpAskCreated: true,
      createdByBpAskAt: new Date().toISOString(),
      createdByBpAskUserId: context.user.id,
      createdByBpAskUserName: context.user.name,
      sourcePrompt: readString(input, "sourcePrompt"),
    },
  });

  if (!created) {
    return {
      status: "failed",
      summaryText: "work_order.create 未能创建工单。",
      structuredPayload: {
        title,
        workOrder: null,
        changedObjects: [],
      },
      errorCode: "WORK_ORDER_CREATE_FAILED",
    };
  }

  const detail = await getWorkOrderDetailById(created.id);
  const workOrder = buildWorkOrderPayload(created, detail);
  const changedObjects = [`work_order/${workOrder.workOrderNo}/created`];

  return {
    status: "completed",
    summaryText: `已创建工单 ${workOrder.workOrderNo}「${workOrder.title}」，优先级为「${workOrder.priorityLabel}」，节点为「${workOrder.stageLabel}」。`,
    structuredPayload: {
      workOrder,
      changedObjects,
      businessWritebackApplied: true,
    },
  };
}

async function runWorkOrderWritebackDraftCreate(
  context: AiToolExecutionContext,
  input: Record<string, unknown>,
): Promise<WorkOrderWritebackDraftCreateResult> {
  const taskId = readString(input, "taskId");
  const resultId = readString(input, "resultId");
  const source = readString(input, "source") || "bp_ask_workflow";
  const sourceRequestId = readString(input, "sourceRequestId");
  const candidates = readWritebackCandidates(input);

  if (!taskId || !resultId || candidates.length === 0) {
    return {
      status: "failed",
      summaryText:
        "work_order.writeback_draft.create 缺少 taskId、resultId 或候选写回，无法创建草案。",
      structuredPayload: {
        taskId: taskId || null,
        resultId: resultId || null,
        candidateCount: candidates.length,
        drafts: [],
      },
      errorCode: "INVALID_WRITEBACK_DRAFT_INPUT",
    };
  }

  if (candidates.some((candidate) => candidate.objectType !== "work_order")) {
    return {
      status: "failed",
      summaryText:
        "work_order.writeback_draft.create 当前只允许创建 work_order 类型的写回草案。",
      structuredPayload: {
        taskId,
        resultId,
        candidateCount: candidates.length,
        drafts: [],
      },
      errorCode: "UNSUPPORTED_WRITEBACK_DRAFT_OBJECT",
    };
  }

  const db = getDb();
  const [taskRow] = await db
    .select()
    .from(executionTasks)
    .where(and(eq(executionTasks.id, taskId), eq(executionTasks.userId, context.user.id)))
    .limit(1);

  if (!taskRow) {
    return {
      status: "not_found",
      summaryText: "没有找到当前用户可访问的 execution task，未创建写回草案。",
      structuredPayload: {
        taskId,
        resultId,
        candidateCount: candidates.length,
        drafts: [],
      },
      errorCode: "EXECUTION_TASK_NOT_FOUND",
    };
  }

  const [resultRow] = await db
    .select()
    .from(executionResults)
    .where(
      and(eq(executionResults.id, resultId), eq(executionResults.taskId, taskRow.id)),
    )
    .limit(1);

  if (!resultRow) {
    return {
      status: "not_found",
      summaryText: "没有找到匹配的 execution result，未创建写回草案。",
      structuredPayload: {
        taskId,
        resultId,
        candidateCount: candidates.length,
        drafts: [],
      },
      errorCode: "EXECUTION_RESULT_NOT_FOUND",
    };
  }

  const now = new Date();
  const values = candidates.map((candidate) => ({
    id: buildWritebackDraftId({
      resultId,
      objectType: candidate.objectType,
      objectRef: candidate.objectRef,
      operation: candidate.operation,
    }),
    taskId: taskRow.id,
    resultId: resultRow.id,
    userId: context.user.id,
    threadId: taskRow.threadId,
    workspaceId: taskRow.workspaceId ?? null,
    objectType: candidate.objectType,
    objectRef: candidate.objectRef,
    operation: candidate.operation,
    proposedValue: candidate.proposedValue,
    requiresConfirmation: candidate.requiresConfirmation,
    status: "draft" as const,
    source,
    sourceRequestId,
    metadata: {
      originalCandidateStatus: candidate.status,
      businessWritebackApplied: false,
      safety: "draft_only",
    },
    createdAt: now,
    updatedAt: now,
  }));

  await db
    .insert(executionWritebackDrafts)
    .values(values)
    .onConflictDoNothing();

  const rows = await db
    .select()
    .from(executionWritebackDrafts)
    .where(eq(executionWritebackDrafts.resultId, resultRow.id));

  const drafts = rows.map((row) => ({
    draftId: row.id,
    objectType: row.objectType,
    objectRef: row.objectRef,
    operation: row.operation,
    proposedValue: row.proposedValue,
    requiresConfirmation: row.requiresConfirmation,
    status: row.status,
    source: row.source,
    sourceRequestId: row.sourceRequestId,
    createdAt: toIsoOrNull(row.createdAt),
    updatedAt: toIsoOrNull(row.updatedAt),
  }));

  return {
    status: "completed",
    summaryText: `已创建/同步 ${drafts.length} 个工单写回草案，仍未修改任何业务工单字段。`,
    structuredPayload: {
      taskId: taskRow.id,
      resultId: resultRow.id,
      candidateCount: candidates.length,
      draftCount: drafts.length,
      businessWritebackApplied: false,
      drafts,
    },
  };
}

async function runWorkOrderWritebackApply(
  context: AiToolExecutionContext,
  input: Record<string, unknown>,
): Promise<WorkOrderWritebackApplyResult> {
  const taskId = readString(input, "taskId");
  const resultId = readString(input, "resultId");
  const draftIds = readStringArrayInput(input, "draftIds");

  if (!taskId || !resultId || draftIds.length === 0) {
    return {
      status: "failed",
      summaryText:
        "work_order.writeback.apply 缺少 taskId、resultId 或 draftIds，无法正式写回。",
      structuredPayload: {
        taskId: taskId || null,
        resultId: resultId || null,
        draftIds,
        appliedDrafts: [],
        changedObjects: [],
      },
      errorCode: "INVALID_WRITEBACK_APPLY_INPUT",
    };
  }

  const db = getDb();
  const now = new Date();
  const [taskRow] = await db
    .select()
    .from(executionTasks)
    .where(and(eq(executionTasks.id, taskId), eq(executionTasks.userId, context.user.id)))
    .limit(1);

  if (!taskRow) {
    return {
      status: "not_found",
      summaryText: "没有找到当前用户可访问的 execution task，未执行正式写回。",
      structuredPayload: {
        taskId,
        resultId,
        draftIds,
        appliedDrafts: [],
        changedObjects: [],
      },
      errorCode: "EXECUTION_TASK_NOT_FOUND",
    };
  }

  const [resultRow] = await db
    .select()
    .from(executionResults)
    .where(
      and(eq(executionResults.id, resultId), eq(executionResults.taskId, taskRow.id)),
    )
    .limit(1);

  if (!resultRow) {
    return {
      status: "not_found",
      summaryText: "没有找到匹配的 execution result，未执行正式写回。",
      structuredPayload: {
        taskId,
        resultId,
        draftIds,
        appliedDrafts: [],
        changedObjects: [],
      },
      errorCode: "EXECUTION_RESULT_NOT_FOUND",
    };
  }

  const draftRows = await db
    .select()
    .from(executionWritebackDrafts)
    .where(eq(executionWritebackDrafts.resultId, resultRow.id));
  const selectedDrafts = draftRows.filter((draft) => draftIds.includes(draft.id));

  if (selectedDrafts.length !== draftIds.length) {
    return {
      status: "not_found",
      summaryText: "部分写回草案不存在，未执行正式写回。",
      structuredPayload: {
        taskId,
        resultId,
        draftIds,
        appliedDrafts: [],
        changedObjects: [],
      },
      errorCode: "WRITEBACK_DRAFT_NOT_FOUND",
    };
  }

  const notReadyDraft = selectedDrafts.find((draft) => draft.status !== "ready");

  if (notReadyDraft) {
    return {
      status: "failed",
      summaryText: `写回草案 ${notReadyDraft.id} 当前状态为 ${notReadyDraft.status}，只有 ready 草案允许正式写回。`,
      structuredPayload: {
        taskId,
        resultId,
        draftIds,
        blockedDraftId: notReadyDraft.id,
        blockedStatus: notReadyDraft.status,
        appliedDrafts: [],
        changedObjects: [],
      },
      errorCode: "WRITEBACK_DRAFT_NOT_READY",
    };
  }

  const unsupportedDraft = selectedDrafts.find(
    (draft) =>
      draft.objectType !== "work_order" ||
      !isAllowedWritebackOperation(draft.operation),
  );

  if (unsupportedDraft) {
    return {
      status: "failed",
      summaryText: `写回草案 ${unsupportedDraft.id} 的操作 ${unsupportedDraft.operation} 不在白名单内。`,
      structuredPayload: {
        taskId,
        resultId,
        draftIds,
        blockedDraftId: unsupportedDraft.id,
        blockedOperation: unsupportedDraft.operation,
        appliedDrafts: [],
        changedObjects: [],
      },
      errorCode: "WRITEBACK_OPERATION_NOT_ALLOWED",
    };
  }

  const invalidValueDraft = selectedDrafts.find(
    (draft) =>
      !validateWorkOrderWritebackValue(draft.operation, draft.proposedValue),
  );

  if (invalidValueDraft) {
    return {
      status: "failed",
      summaryText: `写回草案 ${invalidValueDraft.id} 的值 ${invalidValueDraft.proposedValue} 不适用于操作 ${invalidValueDraft.operation}。`,
      structuredPayload: {
        taskId,
        resultId,
        draftIds,
        blockedDraftId: invalidValueDraft.id,
        blockedOperation: invalidValueDraft.operation,
        blockedValue: invalidValueDraft.proposedValue,
        appliedDrafts: [],
        changedObjects: [],
      },
      errorCode: "WRITEBACK_VALUE_NOT_ALLOWED",
    };
  }

  const changes: AppliedWritebackChange[] = [];

  await db.transaction(async (tx) => {
    for (const draft of selectedDrafts) {
      const [workOrder] = await tx
        .select()
        .from(workOrders)
        .where(eq(workOrders.workOrderNo, draft.objectRef))
        .limit(1);

      if (!workOrder) {
        throw new Error(`WORK_ORDER_NOT_FOUND:${draft.objectRef}`);
      }

      if (draft.operation === "draft_next_action") {
        const unchanged = workOrder.nextAction === draft.proposedValue;

        if (!unchanged) {
          await tx
            .update(workOrders)
            .set({
              nextAction: draft.proposedValue,
              updatedAt: now,
            })
            .where(eq(workOrders.id, workOrder.id));
        }

        changes.push({
          draftId: draft.id,
          objectType: draft.objectType,
          objectRef: draft.objectRef,
          operation: draft.operation,
          fieldPath: "work_orders.next_action",
          previousValue: workOrder.nextAction,
          nextValue: draft.proposedValue,
          applied: !unchanged,
          ...(unchanged ? { noOpReason: "unchanged" } : {}),
        });
      } else if (draft.operation === "draft_risk_followup") {
        const metadata = {
          ...(workOrder.metadata ?? {}),
        };
        const existingFollowups = readMetadataArray(metadata, "bpAskRiskFollowups");
        const existingFollowup = findRiskFollowupByValue(
          existingFollowups,
          draft.proposedValue,
        );
        const latestFollowup = isRecord(metadata.bpAskLatestRiskFollowup)
          ? metadata.bpAskLatestRiskFollowup
          : null;
        const latestAlreadyMatches =
          latestFollowup && readString(latestFollowup, "value") === draft.proposedValue;
        const nextFollowup = {
          ...(isRecord(existingFollowup) ? existingFollowup : {}),
          draftId: draft.id,
          value: draft.proposedValue,
          appliedAt:
            readString(isRecord(existingFollowup) ? existingFollowup : {}, "appliedAt") ||
            now.toISOString(),
          appliedByUserId: context.user.id,
          appliedByUserName: context.user.name,
          source: "work_order.writeback.apply",
        };
        const nextFollowups = existingFollowup
          ? existingFollowups
          : [...existingFollowups, nextFollowup];
        const unchanged = Boolean(existingFollowup && latestAlreadyMatches);
        const fieldPath = existingFollowup
          ? "work_orders.metadata.bpAskLatestRiskFollowup"
          : "work_orders.metadata.bpAskRiskFollowups";

        if (!unchanged) {
          await tx
            .update(workOrders)
            .set({
              metadata: {
                ...metadata,
                bpAskRiskFollowups: nextFollowups,
                bpAskLatestRiskFollowup: nextFollowup,
              },
              updatedAt: now,
            })
            .where(eq(workOrders.id, workOrder.id));
        }

        changes.push({
          draftId: draft.id,
          objectType: draft.objectType,
          objectRef: draft.objectRef,
          operation: draft.operation,
          fieldPath,
          previousValue: existingFollowups,
          nextValue: nextFollowups,
          applied: !unchanged,
          ...(unchanged ? { noOpReason: "duplicate_followup" } : {}),
        });
      } else if (draft.operation === "draft_priority") {
        const unchanged = workOrder.priority === draft.proposedValue;

        if (!unchanged) {
          await tx
            .update(workOrders)
            .set({
              priority: draft.proposedValue as typeof workOrder.priority,
              updatedAt: now,
            })
            .where(eq(workOrders.id, workOrder.id));
        }

        changes.push({
          draftId: draft.id,
          objectType: draft.objectType,
          objectRef: draft.objectRef,
          operation: draft.operation,
          fieldPath: "work_orders.priority",
          previousValue: workOrder.priority,
          nextValue: draft.proposedValue,
          applied: !unchanged,
          ...(unchanged ? { noOpReason: "unchanged" } : {}),
        });
      } else if (draft.operation === "draft_stage") {
        const unchanged = workOrder.stage === draft.proposedValue;

        if (!unchanged) {
          await tx
            .update(workOrders)
            .set({
              stage: draft.proposedValue as typeof workOrder.stage,
              updatedAt: now,
            })
            .where(eq(workOrders.id, workOrder.id));
        }

        changes.push({
          draftId: draft.id,
          objectType: draft.objectType,
          objectRef: draft.objectRef,
          operation: draft.operation,
          fieldPath: "work_orders.stage",
          previousValue: workOrder.stage,
          nextValue: draft.proposedValue,
          applied: !unchanged,
          ...(unchanged ? { noOpReason: "unchanged" } : {}),
        });
      } else if (draft.operation === "draft_status") {
        const unchanged = workOrder.status === draft.proposedValue;

        if (!unchanged) {
          await tx
            .update(workOrders)
            .set({
              status: draft.proposedValue as typeof workOrder.status,
              updatedAt: now,
            })
            .where(eq(workOrders.id, workOrder.id));
        }

        changes.push({
          draftId: draft.id,
          objectType: draft.objectType,
          objectRef: draft.objectRef,
          operation: draft.operation,
          fieldPath: "work_orders.status",
          previousValue: workOrder.status,
          nextValue: draft.proposedValue,
          applied: !unchanged,
          ...(unchanged ? { noOpReason: "unchanged" } : {}),
        });
      } else if (draft.operation === "draft_title") {
        await tx
          .update(workOrders)
          .set({ title: draft.proposedValue, updatedAt: now })
          .where(eq(workOrders.id, workOrder.id));
        changes.push(workOrderTextUpdate(draft, "work_orders.title", workOrder.title, draft.proposedValue));
      } else if (draft.operation === "draft_source_summary") {
        await tx
          .update(workOrders)
          .set({ sourceSummary: draft.proposedValue, updatedAt: now })
          .where(eq(workOrders.id, workOrder.id));
        changes.push(workOrderTextUpdate(draft, "work_orders.source_summary", workOrder.sourceSummary, draft.proposedValue));
      } else if (draft.operation === "draft_project_name") {
        await tx
          .update(workOrders)
          .set({ projectName: draft.proposedValue, updatedAt: now })
          .where(eq(workOrders.id, workOrder.id));
        changes.push(workOrderTextUpdate(draft, "work_orders.project_name", workOrder.projectName, draft.proposedValue));
      } else if (draft.operation === "draft_site_name") {
        await tx
          .update(workOrders)
          .set({ siteName: draft.proposedValue, updatedAt: now })
          .where(eq(workOrders.id, workOrder.id));
        changes.push(workOrderTextUpdate(draft, "work_orders.site_name", workOrder.siteName, draft.proposedValue));
      } else if (draft.operation === "draft_site_address") {
        await tx
          .update(workOrders)
          .set({ siteAddress: draft.proposedValue, updatedAt: now })
          .where(eq(workOrders.id, workOrder.id));
        changes.push(workOrderTextUpdate(draft, "work_orders.site_address", workOrder.siteAddress, draft.proposedValue));
      } else if (draft.operation === "draft_responsible_team") {
        await tx
          .update(workOrders)
          .set({ currentResponsibleTeam: draft.proposedValue, updatedAt: now })
          .where(eq(workOrders.id, workOrder.id));
        changes.push(workOrderTextUpdate(draft, "work_orders.current_responsible_team", workOrder.currentResponsibleTeam, draft.proposedValue));
      } else if (draft.operation === "draft_progress_summary") {
        await tx
          .update(workOrders)
          .set({ latestProgressSummary: draft.proposedValue, updatedAt: now })
          .where(eq(workOrders.id, workOrder.id));
        changes.push(workOrderTextUpdate(draft, "work_orders.latest_progress_summary", workOrder.latestProgressSummary, draft.proposedValue));
      } else if (draft.operation === "draft_material_completeness") {
        const nextValue = parsePercent(draft.proposedValue);
        await tx
          .update(workOrders)
          .set({ materialCompleteness: nextValue, updatedAt: now })
          .where(eq(workOrders.id, workOrder.id));
        changes.push(workOrderNumberUpdate(draft, "work_orders.material_completeness", workOrder.materialCompleteness, nextValue));
      } else if (draft.operation === "draft_missing_item_count") {
        const nextValue = parseNonNegativeInteger(draft.proposedValue);
        await tx
          .update(workOrders)
          .set({ missingItemCount: nextValue, updatedAt: now })
          .where(eq(workOrders.id, workOrder.id));
        changes.push(workOrderNumberUpdate(draft, "work_orders.missing_item_count", workOrder.missingItemCount, nextValue));
      } else if (draft.operation === "draft_blocking_item_count") {
        const nextValue = parseNonNegativeInteger(draft.proposedValue);
        await tx
          .update(workOrders)
          .set({ blockingItemCount: nextValue, updatedAt: now })
          .where(eq(workOrders.id, workOrder.id));
        changes.push(workOrderNumberUpdate(draft, "work_orders.blocking_item_count", workOrder.blockingItemCount, nextValue));
      } else if (draft.operation === "draft_warning_status") {
        const nextWarningStatus = draft.proposedValue as typeof workOrder.warningStatus;
        const updateValues =
          nextWarningStatus === "resolved"
            ? { warningStatus: nextWarningStatus, status: workOrder.status === "blocked" ? "in_progress" : workOrder.status, updatedAt: now }
            : { warningStatus: nextWarningStatus, updatedAt: now };

        await tx
          .update(workOrders)
          .set(updateValues)
          .where(eq(workOrders.id, workOrder.id));
        changes.push(workOrderTextUpdate(draft, "work_orders.warning_status", workOrder.warningStatus, draft.proposedValue));
        if (nextWarningStatus === "resolved" && workOrder.status === "blocked") {
          changes.push(workOrderTextUpdate(draft, "work_orders.status", workOrder.status, "in_progress"));
        }
      } else if (draft.operation === "archive_work_order") {
        const archivedAt = workOrder.archivedAt ? new Date(workOrder.archivedAt) : null;
        const statusAlreadyArchived = workOrder.status === "archived";
        const archivedAtAlreadySet = Boolean(archivedAt);
        const metadata = {
          ...(workOrder.metadata ?? {}),
          bpAskArchived: {
            draftId: draft.id,
            appliedAt: now.toISOString(),
            appliedByUserId: context.user.id,
            appliedByUserName: context.user.name,
            source: "work_order.writeback.apply",
          },
        };

        if (!statusAlreadyArchived || !archivedAtAlreadySet) {
          await tx
            .update(workOrders)
            .set({
              status: "archived",
              archivedAt: archivedAt ?? now,
              metadata,
              updatedAt: now,
            })
            .where(eq(workOrders.id, workOrder.id));
        }

        changes.push({
          draftId: draft.id,
          objectType: draft.objectType,
          objectRef: draft.objectRef,
          operation: draft.operation,
          fieldPath: "work_orders.status",
          previousValue: workOrder.status,
          nextValue: "archived",
          applied: !statusAlreadyArchived,
          ...(statusAlreadyArchived ? { noOpReason: "unchanged" } : {}),
        });
        changes.push({
          draftId: draft.id,
          objectType: draft.objectType,
          objectRef: draft.objectRef,
          operation: draft.operation,
          fieldPath: "work_orders.archived_at",
          previousValue: toIsoOrNull(workOrder.archivedAt),
          nextValue: toIsoOrNull(archivedAt ?? now),
          applied: !archivedAtAlreadySet,
          ...(archivedAtAlreadySet ? { noOpReason: "already_archived" } : {}),
        });
      }

      const draftChanges = changes.filter((change) => change.draftId === draft.id);

      await tx
        .update(executionWritebackDrafts)
        .set({
          status: "applied",
          metadata: {
            ...(draft.metadata ?? {}),
            businessWritebackApplied: draftChanges.some((change) => change.applied),
            appliedAt: now.toISOString(),
            appliedByUserId: context.user.id,
            appliedByUserName: context.user.name,
            appliedChanges: draftChanges,
            writebackNoOpReasons: draftChanges
              .map((change) => change.noOpReason)
              .filter(Boolean),
          },
          updatedAt: now,
        })
        .where(eq(executionWritebackDrafts.id, draft.id));
    }
  });

  const rows = await db
    .select()
    .from(executionWritebackDrafts)
    .where(eq(executionWritebackDrafts.resultId, resultRow.id));
  const appliedChanges = changes.filter((change) => change.applied);
  const drafts = rows.map((row) => {
    const metadata = isRecord(row.metadata) ? row.metadata : {};

    return {
      draftId: row.id,
      objectType: row.objectType,
      objectRef: row.objectRef,
      operation: row.operation,
      proposedValue: row.proposedValue,
      requiresConfirmation: row.requiresConfirmation,
      status: row.status,
      source: row.source,
      sourceRequestId: row.sourceRequestId,
      createdAt: toIsoOrNull(row.createdAt),
      updatedAt: toIsoOrNull(row.updatedAt),
      appliedAt: readString(metadata, "appliedAt") || null,
      appliedByUserName: readString(metadata, "appliedByUserName") || null,
    };
  });

  return {
    status: "completed",
    summaryText: `已处理 ${selectedDrafts.length} 个写回草案，实际改变 ${appliedChanges.length} 个工单白名单字段，并将对应草案标记为 applied。`,
    structuredPayload: {
      taskId: taskRow.id,
      resultId: resultRow.id,
      appliedDrafts: selectedDrafts.map((draft) => draft.id),
      changedObjects: appliedChanges.map(
        (change) => `${change.objectType}/${change.objectRef}/${change.fieldPath}`,
      ),
      changes,
      drafts,
      businessWritebackApplied: appliedChanges.length > 0,
      appliedAt: now.toISOString(),
    },
  };
}

async function runOpenClawWorkOrderExecute(
  context: AiToolExecutionContext,
  input: Record<string, unknown>,
): Promise<OpenClawWorkOrderExecuteResult> {
  const taskId = readString(input, "taskId");
  const resultId = readString(input, "resultId");
  const workOrderNo = readString(input, "workOrderNo");
  const workflowId = readString(input, "workflowId") || "workflow-work-order-intake";
  const payload = isRecord(input.payload) ? input.payload : {};

  if (!taskId || !resultId || !workOrderNo) {
    return {
      status: "failed",
      summaryText:
        "openclaw.work_order.execute 缺少 taskId、resultId 或 workOrderNo，无法执行 sidecar。",
      structuredPayload: {
        taskId: taskId || null,
        resultId: resultId || null,
        workOrderNo: workOrderNo || null,
        changedObjects: [],
      },
      errorCode: "INVALID_OPENCLAW_WORK_ORDER_INPUT",
    };
  }

  const db = getDb();
  const [taskRow] = await db
    .select()
    .from(executionTasks)
    .where(and(eq(executionTasks.id, taskId), eq(executionTasks.userId, context.user.id)))
    .limit(1);

  if (!taskRow) {
    return {
      status: "not_found",
      summaryText: "没有找到当前用户可访问的 execution task，未执行 OpenClaw sidecar。",
      structuredPayload: {
        taskId,
        resultId,
        workOrderNo,
        changedObjects: [],
      },
      errorCode: "EXECUTION_TASK_NOT_FOUND",
    };
  }

  const [resultRow] = await db
    .select()
    .from(executionResults)
    .where(
      and(eq(executionResults.id, resultId), eq(executionResults.taskId, taskRow.id)),
    )
    .limit(1);

  if (!resultRow) {
    return {
      status: "not_found",
      summaryText: "没有找到匹配的 execution result，未执行 OpenClaw sidecar。",
      structuredPayload: {
        taskId,
        resultId,
        workOrderNo,
        changedObjects: [],
      },
      errorCode: "EXECUTION_RESULT_NOT_FOUND",
    };
  }

  const openClawRun = await runOpenClawWorkOrderExecution({
    agentId: "work-order-longxia",
    taskId: taskRow.id,
    resultId: resultRow.id,
    workOrderNo,
    workflowId,
    payload: {
      ...payload,
      actor: {
        userId: context.user.id,
        userName: context.user.name,
      },
      safety: {
        businessWriteback: "forbidden_inside_openclaw",
        writebackPolicy: "return_candidates_to_bpask",
      },
    },
  });

  return {
    status: openClawRun.status,
    summaryText: openClawRun.summaryText,
    structuredPayload: {
      ...openClawRun.structuredPayload,
      taskId: taskRow.id,
      resultId: resultRow.id,
      workOrderNo,
      workflowId,
      agentId: openClawRun.agentId,
      startedAt: openClawRun.startedAt,
      completedAt: openClawRun.completedAt,
    },
    errorCode: openClawRun.errorCode,
  };
}

async function runDocumentList(
  context: AiToolExecutionContext,
  input: Record<string, unknown>,
): Promise<DocumentListResult> {
  const kind = readContentKind(input, "document");
  const workspaceId = readString(input, "workspaceId") || context.user.workspaceId;
  const limit = Math.min(Math.max(Number(readString(input, "limit")) || 20, 1), 50);
  const assets = await listAssetsForUser(context.user, kind, {
    workspaceId,
    trashMode: "active",
  });
  const items = assets.slice(0, limit).map((asset) => buildDocumentAssetPayload(asset));

  return {
    status: "completed",
    summaryText: `已找到 ${assets.length} 个${summarizeDocumentKind(kind)}，返回前 ${items.length} 个。`,
    structuredPayload: {
      kind,
      workspaceId,
      count: assets.length,
      items,
    },
  };
}

async function runDocumentRead(input: Record<string, unknown>): Promise<DocumentReadResult> {
  const kind = readContentKind(input, "document");
  const documentId = readString(input, "documentId") || readString(input, "assetId");

  if (!documentId) {
    return {
      status: "failed",
      summaryText: "document.read 缺少 documentId 或 assetId，无法读取文档。",
      structuredPayload: { kind, document: null },
      errorCode: "INVALID_DOCUMENT_READ_INPUT",
    };
  }

  const asset = await getAssetById(kind, documentId);

  if (!asset) {
    return {
      status: "not_found",
      summaryText: `没有找到 ${summarizeDocumentKind(kind)}「${documentId}」。`,
      structuredPayload: { kind, documentId, document: null },
      errorCode: "DOCUMENT_NOT_FOUND",
    };
  }

  return {
    status: "completed",
    summaryText: `已读取${summarizeDocumentKind(kind)}「${asset.title}」，可在 ${`/docs/documents/${asset.id}`} 打开。`,
    structuredPayload: {
      kind,
      document: buildDocumentAssetPayload(asset),
    },
  };
}

async function runDocumentSearch(
  context: AiToolExecutionContext,
  input: Record<string, unknown>,
): Promise<DocumentSearchResult> {
  const kind = readContentKind(input, "document");
  const workspaceId = readString(input, "workspaceId") || context.user.workspaceId;
  const query = readString(input, "query");
  const limit = Math.min(Math.max(Number(readString(input, "limit")) || 10, 1), 20);

  if (!query) {
    return {
      status: "failed",
      summaryText: "document.search 缺少 query，无法搜索文档。",
      structuredPayload: {
        kind,
        workspaceId,
        query: null,
        count: 0,
        candidates: [],
      },
      errorCode: "INVALID_DOCUMENT_SEARCH_INPUT",
    };
  }

  const assets = await listAssetsForUser(context.user, kind, {
    workspaceId,
    trashMode: "active",
  });
  const normalizedQuery = query.trim().toLowerCase();
  const ranked = assets
    .map((asset) => {
      const haystack = [asset.title, asset.originalFileName, asset.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const exactTitle = asset.title.trim().toLowerCase() === normalizedQuery;
      const titleIncludes = asset.title.toLowerCase().includes(normalizedQuery);
      const fileIncludes = asset.originalFileName.toLowerCase().includes(normalizedQuery);
      const idIncludes = asset.id.toLowerCase().includes(normalizedQuery);
      const score = exactTitle ? 400 : 0 + (titleIncludes ? 120 : 0) + (fileIncludes ? 60 : 0) + (idIncludes ? 40 : 0) + (haystack.includes(normalizedQuery) ? 20 : 0);

      return {
        asset,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || Date.parse(right.asset.updatedAt) - Date.parse(left.asset.updatedAt));

  const candidates = ranked.slice(0, limit).map(({ asset }) => ({
    documentId: asset.id,
    assetId: asset.id,
    kind: asset.kind,
    title: asset.title,
    originalFileName: asset.originalFileName,
    workspaceId: asset.workspaceId,
    folderId: asset.folderId ?? null,
    openPath: `/docs/documents/${asset.id}`,
    updatedAt: asset.updatedAt,
  }));
  const bestCandidate = candidates[0] ?? null;

  return {
    status: candidates.length > 0 ? "completed" : "not_found",
    summaryText:
      candidates.length > 0
        ? `已找到 ${candidates.length} 个匹配的${summarizeDocumentKind(kind)}，最接近的是「${candidates[0]?.title}」。`
        : `没有找到和「${query}」匹配的${summarizeDocumentKind(kind)}。`,
    structuredPayload: {
      kind,
      workspaceId,
      query: {
        value: query,
      },
      count: candidates.length,
      bestCandidate,
      candidates,
      followupQuestions:
        candidates.length > 1
          ? ["我找到了多份相似文档，请回复文档标题、文档 ID，或再补一句更具体的关键词。"]
          : [],
    },
    errorCode: candidates.length > 0 ? undefined : "DOCUMENT_NOT_FOUND",
  };
}

async function runDocumentCreate(
  context: AiToolExecutionContext,
  input: Record<string, unknown>,
): Promise<DocumentCreateResult> {
  const kind = readContentKind(input, "document");
  const title = readString(input, "title") || `未命名${summarizeDocumentKind(kind)}`;
  const sampleFileName = readString(input, "sampleFileName") || undefined;
  const sampleAssetId = readString(input, "sampleAssetId") || (kind === "sheet" ? "sheet-ledger-001" : "doc-weekly-001");
  const targetWorkspaceId = readString(input, "workspaceId") || context.user.workspaceId;
  const created = await copyAssetToWorkspace({
    kind,
    assetId: sampleAssetId,
    source: "sample",
    user: context.user,
    targetWorkspaceId,
    sampleFileName,
    title,
  });

  if (!created) {
    return {
      status: "failed",
      summaryText: `document.create 未能创建${summarizeDocumentKind(kind)}，可能缺少样本文档文件。`,
      structuredPayload: {
        kind,
        title,
        document: null,
        changedObjects: [],
      },
      errorCode: "DOCUMENT_CREATE_FAILED",
    };
  }

  return {
    status: "completed",
    summaryText: `已创建${summarizeDocumentKind(kind)}「${created.asset.title}」。`,
    structuredPayload: {
      kind,
      document: buildDocumentAssetPayload(created.asset),
      changedObjects: [`document/${created.asset.id}/created`],
    },
  };
}

async function runDocumentWriteContent(
  _context: AiToolExecutionContext,
  input: Record<string, unknown>,
): Promise<DocumentWriteContentResult> {
  const kind = readContentKind(input, "document");
  const documentId = readString(input, "documentId") || readString(input, "assetId");
  const content = readTextContent(input, "content");

  if (!documentId || !content) {
    return {
      status: "failed",
      summaryText: "document.write_content 缺少 documentId/assetId 或 content，无法写入文档内容。",
      structuredPayload: {
        kind,
        document: null,
        changedObjects: [],
      },
      errorCode: "INVALID_DOCUMENT_WRITE_CONTENT_INPUT",
    };
  }

  const updatedAsset = await overwriteAssetTextContent({
    kind,
    assetId: documentId,
    text: content,
  });

  if (!updatedAsset) {
    return {
      status: "not_found",
      summaryText: `没有找到 ${summarizeDocumentKind(kind)}「${documentId}」，无法写入内容。`,
      structuredPayload: {
        kind,
        documentId,
        document: null,
        changedObjects: [],
      },
      errorCode: "DOCUMENT_NOT_FOUND",
    };
  }

  return {
    status: "completed",
    summaryText: `已写入${summarizeDocumentKind(kind)}「${updatedAsset.title}」的新内容。`,
    structuredPayload: {
      kind,
      document: buildDocumentAssetPayload(updatedAsset),
      changedObjects: [`document/${updatedAsset.id}/content`],
      artifacts: [
        {
          type: "document_content_write",
          documentId: updatedAsset.id,
          bytes: Buffer.from(content, "utf8").byteLength,
        },
      ],
    },
  };
}

function buildObjectOutputSchema(objectKey: string) {
  return {
    type: "object",
    properties: {
      [objectKey]: { type: ["object", "null"] },
      changedObjects: { type: "array", items: { type: "string" } },
    },
  };
}

function buildListOutputSchema(itemKey: string) {
  return {
    type: "object",
    properties: {
      count: { type: "number" },
      [itemKey]: { type: "array" },
    },
  };
}

const AI_RESOURCES: AiResourceDescriptor[] = [
  {
    type: "work_order",
    displayName: "工单",
    identifierKeys: ["workOrderId", "workOrderNo"],
    sourceKind: "internal",
    description: "BPAI demo work_orders resource, including lifecycle stage, status, warning state, progress, and writeback targets.",
  },
  {
    type: "document",
    displayName: "文档",
    identifierKeys: ["documentId", "assetId"],
    sourceKind: "internal",
    description: "Workspace document/sheet/slide assets that can be listed, read, created, and later edited through document capabilities.",
  },
  {
    type: "openclaw",
    displayName: "OpenClaw 执行入口",
    identifierKeys: ["workOrderNo", "workflowId"],
    sourceKind: "longxia",
    description: "Longxia/OpenClaw sidecar execution bridge for work-order delegation.",
  },
];

const AI_CAPABILITIES = {
  "work_order.read": {
    name: "work_order.read",
    displayName: "读取工单",
    domain: "work_order",
    action: "read",
    sourceKind: "internal",
    riskLevel: "read",
    executionMode: "direct",
    description: "Read one work order from the source table by workOrderId or workOrderNo.",
    target: {
      objectType: "work_order",
      identifierKeys: ["workOrderId", "workOrderNo"],
      mutates: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        workOrderId: { type: "string" },
        workOrderNo: { type: "string" },
      },
      anyOf: [{ required: ["workOrderId"] }, { required: ["workOrderNo"] }],
    },
    outputSchema: buildObjectOutputSchema("workOrder"),
    requiredContext: ["currentUser"],
    plannerHints: {
      whenToUse: "Use when the user asks to view, inspect, check, summarize from source data, or answer a question about one known work order.",
      requiredInformation: ["workOrderId or workOrderNo"],
      missingInformationPrompt: "请告诉我要查看的工单编号，或者先描述能唯一定位这张工单的信息。",
      examples: ["查一下 WO-20260427-001", "这个工单现在到哪一步了"],
    },
    failureModes: ["missing_identifier", "work_order_not_found"],
    mutatesDemoData: false,
    requiresConfirmationDefault: false,
    execute: (_context, input) => runWorkOrderRead(input),
  },
  "work_order.search": {
    name: "work_order.search",
    displayName: "搜索工单",
    domain: "work_order",
    action: "search",
    sourceKind: "internal",
    riskLevel: "read",
    executionMode: "direct",
    description: "Search demo work orders by natural language text, work order number, title, project, site, address, source summary, or responsible team.",
    target: {
      objectType: "work_order",
      identifierKeys: ["query"],
      mutates: false,
    },
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        limit: { type: "string" },
      },
    },
    outputSchema: buildListOutputSchema("candidates"),
    requiredContext: ["currentUser"],
    plannerHints: {
      whenToUse: "Use before work_order.read or work_order.update when the user describes a work order naturally instead of giving a workOrderNo, such as by title, project, site, address, or partial wording.",
      requiredInformation: ["query"],
      missingInformationPrompt: "请描述要查找的工单标题、项目、站点、地址或工单号。",
      examples: ["找一下主干光缆割接回单整理那张工单", "搜索雨花区电缆铺设工单", "先找到核心机房巡检那张单再改下一步"],
    },
    failureModes: ["missing_query", "no_matches", "ambiguous_matches"],
    mutatesDemoData: false,
    requiresConfirmationDefault: false,
    execute: (_context, input) => runWorkOrderSearch(input),
  },
  "work_order.create": {
    name: "work_order.create",
    displayName: "创建工单",
    domain: "work_order",
    action: "create",
    sourceKind: "internal",
    riskLevel: "restricted_write",
    executionMode: "direct",
    description: "Create a real demo work order from structured intake fields.",
    target: {
      objectType: "work_order",
      identifierKeys: [],
      mutates: true,
    },
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string" },
        sourceSummary: { type: "string" },
        projectName: { type: "string" },
        siteName: { type: "string" },
        nextAction: { type: "string" },
        priority: { type: "string", enum: Object.keys(WORK_ORDER_PRIORITY_LABELS) },
        stage: { type: "string", enum: Object.keys(WORK_ORDER_STAGE_LABELS) },
      },
    },
    outputSchema: buildObjectOutputSchema("workOrder"),
    requiredContext: ["currentUser", "currentWorkspace"],
    plannerHints: {
      whenToUse: "Use when the user asks to create, add, open, or register a new work order.",
      requiredInformation: ["title"],
      missingInformationPrompt: "请告诉我要创建的工单标题或核心事项。",
      examples: ["新建一个芙蓉区基站回单工单", "帮我创建紧急施工协调工单"],
    },
    failureModes: ["missing_title", "database_write_failed"],
    mutatesDemoData: true,
    requiresConfirmationDefault: false,
    execute: runWorkOrderCreate,
  },
  "work_order.update": {
    name: "work_order.update",
    displayName: "更新工单",
    domain: "work_order",
    action: "update",
    sourceKind: "internal",
    riskLevel: "restricted_write",
    executionMode: "orchestrated",
    description: "Update one real demo work order by workOrderNo. Provide only fields that should change.",
    target: {
      objectType: "work_order",
      identifierKeys: ["workOrderNo"],
      mutates: true,
    },
    inputSchema: {
      type: "object",
      required: ["workOrderNo"],
      properties: {
        workOrderNo: { type: "string" },
        title: { type: "string" },
        sourceSummary: { type: "string" },
        projectName: { type: "string" },
        siteName: { type: "string" },
        siteAddress: { type: "string" },
        responsibleTeam: { type: "string" },
        progressSummary: { type: "string" },
        nextAction: { type: "string" },
        riskFollowup: { type: "string" },
        materialCompleteness: { type: "string" },
        missingItemCount: { type: "string" },
        blockingItemCount: { type: "string" },
        priority: { type: "string", enum: Object.keys(WORK_ORDER_PRIORITY_LABELS) },
        stage: { type: "string", enum: Object.keys(WORK_ORDER_STAGE_LABELS) },
        status: { type: "string", enum: Object.keys(WORK_ORDER_STATUS_LABELS) },
        warningStatus: { type: "string", enum: Object.keys(WORK_ORDER_WARNING_LABELS) },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        drafts: { type: "array" },
        changes: { type: "array" },
        changedObjects: { type: "array", items: { type: "string" } },
      },
    },
    requiredContext: ["currentUser", "executionTask", "executionResult"],
    plannerHints: {
      whenToUse: "Use when the user asks to change fields on an existing work order, including next action, status, stage, progress, priority, site, project, material completeness, missing item counts, or warning status.",
      requiredInformation: ["workOrderNo", "at least one field to change"],
      missingInformationPrompt: "请告诉我要修改哪张工单，以及要改哪个字段或内容。",
      examples: ["把 WO-20260427-001 下一步改成联系施工队", "把这个工单推进到现场施工并解除预警"],
    },
    failureModes: ["missing_work_order_no", "missing_update_fields", "work_order_not_found", "writeback_validation_failed"],
    mutatesDemoData: true,
    requiresConfirmationDefault: false,
    execute: () => Promise.resolve({
      status: "failed",
      summaryText: "work_order.update 需要由 BP问问先生成写回草案并调用 work_order.writeback.apply。",
      structuredPayload: null,
      errorCode: "WORK_ORDER_UPDATE_PLAN_ONLY",
    }),
  },
  "work_order.archive": {
    name: "work_order.archive",
    displayName: "归档工单",
    domain: "work_order",
    action: "archive",
    sourceKind: "internal",
    riskLevel: "restricted_write",
    executionMode: "orchestrated",
    description: "Archive one real demo work order by workOrderNo.",
    target: {
      objectType: "work_order",
      identifierKeys: ["workOrderNo"],
      mutates: true,
    },
    inputSchema: {
      type: "object",
      required: ["workOrderNo"],
      properties: {
        workOrderNo: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        drafts: { type: "array" },
        changes: { type: "array" },
        changedObjects: { type: "array", items: { type: "string" } },
      },
    },
    requiredContext: ["currentUser", "executionTask", "executionResult"],
    plannerHints: {
      whenToUse: "Use when the user asks to archive, remove from active list, soft-delete, close out, or put away one known work order.",
      requiredInformation: ["workOrderNo"],
      missingInformationPrompt: "请告诉我要归档的工单编号。",
      examples: ["归档 WO-20260427-001", "把这个工单收掉"],
    },
    failureModes: ["missing_work_order_no", "work_order_not_found", "writeback_validation_failed"],
    mutatesDemoData: true,
    requiresConfirmationDefault: false,
    execute: () => Promise.resolve({
      status: "failed",
      summaryText: "work_order.archive 需要由 BP问问先生成归档写回草案并调用 work_order.writeback.apply。",
      structuredPayload: null,
      errorCode: "WORK_ORDER_ARCHIVE_PLAN_ONLY",
    }),
  },
  "work_order.writeback_draft.create": {
    name: "work_order.writeback_draft.create",
    displayName: "创建工单写回草案",
    domain: "work_order",
    action: "draft",
    sourceKind: "internal",
    riskLevel: "draft_write",
    executionMode: "direct",
    description: "Create or sync draft writeback candidates for work order changes.",
    target: {
      objectType: "execution_writeback_draft",
      identifierKeys: ["taskId", "resultId"],
      mutates: true,
    },
    inputSchema: {
      type: "object",
      required: ["taskId", "resultId", "candidates"],
      properties: {
        taskId: { type: "string" },
        resultId: { type: "string" },
        source: { type: "string" },
        sourceRequestId: { type: "string" },
        candidates: { type: "array" },
      },
    },
    outputSchema: buildListOutputSchema("drafts"),
    requiredContext: ["currentUser", "executionTask", "executionResult"],
    plannerHints: {
      whenToUse: "Use internally after BP问问 has already planned work order writeback candidates.",
      requiredInformation: ["taskId", "resultId", "candidates"],
      missingInformationPrompt: "需要先形成可写回的候选变更。",
      examples: ["create drafts for planned work order updates"],
    },
    failureModes: ["missing_execution_ids", "invalid_candidates", "database_write_failed"],
    mutatesDemoData: true,
    requiresConfirmationDefault: false,
    execute: runWorkOrderWritebackDraftCreate,
  },
  "work_order.writeback.apply": {
    name: "work_order.writeback.apply",
    displayName: "应用工单写回草案",
    domain: "work_order",
    action: "apply",
    sourceKind: "internal",
    riskLevel: "restricted_write",
    executionMode: "direct",
    description: "Apply approved work order writeback drafts to the demo business table.",
    target: {
      objectType: "work_order",
      identifierKeys: ["taskId", "resultId", "draftIds"],
      mutates: true,
    },
    inputSchema: {
      type: "object",
      required: ["taskId", "resultId", "draftIds"],
      properties: {
        taskId: { type: "string" },
        resultId: { type: "string" },
        draftIds: { type: "array", items: { type: "string" } },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        appliedDrafts: { type: "array", items: { type: "string" } },
        changes: { type: "array" },
        changedObjects: { type: "array", items: { type: "string" } },
      },
    },
    requiredContext: ["currentUser", "executionTask", "executionResult", "readyWritebackDrafts"],
    plannerHints: {
      whenToUse: "Use internally to apply ready work order writeback drafts after orchestration marks them ready.",
      requiredInformation: ["taskId", "resultId", "draftIds"],
      missingInformationPrompt: "需要先选择已批准待写回的草案。",
      examples: ["apply ready work order writeback drafts"],
    },
    failureModes: ["missing_execution_ids", "draft_not_ready", "writeback_validation_failed", "work_order_not_found"],
    mutatesDemoData: true,
    requiresConfirmationDefault: false,
    execute: runWorkOrderWritebackApply,
  },
  "openclaw.work_order.execute": {
    name: "openclaw.work_order.execute",
    displayName: "下发工单给 OpenClaw",
    domain: "openclaw",
    action: "delegate",
    sourceKind: "longxia",
    riskLevel: "external_action",
    executionMode: "direct",
    description: "Delegate a work order execution task to the OpenClaw work-order sidecar.",
    target: {
      objectType: "openclaw_work_order_run",
      identifierKeys: ["workOrderNo"],
      mutates: false,
    },
    inputSchema: {
      type: "object",
      required: ["workOrderNo"],
      properties: {
        workOrderNo: { type: "string" },
        workflowId: { type: "string" },
        payload: { type: "object" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        openClawRuns: { type: "array" },
        changedObjects: { type: "array", items: { type: "string" } },
      },
    },
    requiredContext: ["currentUser", "executionTask", "executionResult"],
    plannerHints: {
      whenToUse: "Use when internal tools/workflows cannot complete the requested work order task and BP问问 needs to delegate to the OpenClaw work-order sidecar.",
      requiredInformation: ["workOrderNo", "task payload"],
      missingInformationPrompt: "需要先确认要交给 OpenClaw 的工单和任务目标。",
      examples: ["把这个工单交给 OpenClaw 继续执行"],
    },
    failureModes: ["missing_work_order_no", "openclaw_not_configured", "openclaw_submit_failed"],
    mutatesDemoData: false,
    requiresConfirmationDefault: false,
    execute: runOpenClawWorkOrderExecute,
  },
  "document.list": {
    name: "document.list",
    displayName: "列出文档",
    domain: "document",
    action: "list",
    sourceKind: "internal",
    riskLevel: "read",
    executionMode: "direct",
    description: "List active document workspace assets for the current user workspace.",
    target: {
      objectType: "document",
      identifierKeys: ["workspaceId", "kind"],
      mutates: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["document", "sheet", "slide"] },
        workspaceId: { type: "string" },
        limit: { type: "number" },
      },
    },
    outputSchema: buildListOutputSchema("items"),
    requiredContext: ["currentUser", "currentWorkspace"],
    plannerHints: {
      whenToUse: "Use when the user asks what documents, sheets, or slides are available in the workspace.",
      requiredInformation: [],
      missingInformationPrompt: "",
      examples: ["列一下我的文档", "有哪些表格资料"],
    },
    failureModes: ["workspace_not_found"],
    mutatesDemoData: false,
    requiresConfirmationDefault: false,
    execute: runDocumentList,
  },
  "document.search": {
    name: "document.search",
    displayName: "搜索文档",
    domain: "document",
    action: "search",
    sourceKind: "internal",
    riskLevel: "read",
    executionMode: "direct",
    description: "Search active document workspace assets by title, file name, or asset id.",
    target: {
      objectType: "document",
      identifierKeys: ["query", "kind", "workspaceId"],
      mutates: false,
    },
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        kind: { type: "string", enum: ["document", "sheet", "slide"] },
        query: { type: "string" },
        workspaceId: { type: "string" },
        limit: { type: "number" },
      },
    },
    outputSchema: buildListOutputSchema("candidates"),
    requiredContext: ["currentUser", "currentWorkspace"],
    plannerHints: {
      whenToUse: "Use when the user describes a document naturally by title, file name, or keyword instead of giving a documentId.",
      requiredInformation: ["query"],
      missingInformationPrompt: "请告诉我要找的文档标题、文件名或关键词。",
      examples: ["找一下施工周报", "搜索材料台账表格", "打开那份核心机房巡检文档"],
    },
    failureModes: ["missing_query", "document_not_found", "ambiguous_matches"],
    mutatesDemoData: false,
    requiresConfirmationDefault: false,
    execute: runDocumentSearch,
  },
  "document.read": {
    name: "document.read",
    displayName: "读取文档",
    domain: "document",
    action: "read",
    sourceKind: "internal",
    riskLevel: "read",
    executionMode: "direct",
    description: "Read metadata and open links for one document workspace asset.",
    target: {
      objectType: "document",
      identifierKeys: ["documentId", "assetId"],
      mutates: false,
    },
    inputSchema: {
      type: "object",
      required: ["documentId"],
      properties: {
        kind: { type: "string", enum: ["document", "sheet", "slide"] },
        documentId: { type: "string" },
        assetId: { type: "string" },
      },
    },
    outputSchema: buildObjectOutputSchema("document"),
    requiredContext: ["currentUser"],
    plannerHints: {
      whenToUse: "Use when the user asks to open, inspect, or get metadata/links for one known document asset.",
      requiredInformation: ["documentId or assetId"],
      missingInformationPrompt: "请告诉我要读取的文档 ID，或者先让我列出可用文档。",
      examples: ["打开这个文档", "读取 doc-weekly-001"],
    },
    failureModes: ["missing_document_id", "document_not_found"],
    mutatesDemoData: false,
    requiresConfirmationDefault: false,
    execute: (_context, input) => runDocumentRead(input),
  },
  "document.write_content": {
    name: "document.write_content",
    displayName: "写入文档内容",
    domain: "document",
    action: "update",
    sourceKind: "internal",
    riskLevel: "restricted_write",
    executionMode: "direct",
    description: "Overwrite one document workspace asset with provided text content.",
    target: {
      objectType: "document",
      identifierKeys: ["documentId", "assetId"],
      mutates: true,
    },
    inputSchema: {
      type: "object",
      required: ["documentId", "content"],
      properties: {
        kind: { type: "string", enum: ["document", "sheet", "slide"] },
        documentId: { type: "string" },
        assetId: { type: "string" },
        content: { type: "string" },
      },
    },
    outputSchema: buildObjectOutputSchema("document"),
    requiredContext: ["currentUser"],
    plannerHints: {
      whenToUse: "Use when the user asks BP问问 to replace or write concrete text content into one known document asset.",
      requiredInformation: ["documentId or assetId", "content"],
      missingInformationPrompt: "请告诉我要写入哪份文档，以及要写入的具体内容。",
      examples: ["把这份周报写成新的摘要", "往这份文档里写入施工进展说明"],
    },
    failureModes: ["missing_document_id", "missing_content", "document_not_found", "document_write_failed"],
    mutatesDemoData: true,
    requiresConfirmationDefault: false,
    execute: runDocumentWriteContent,
  },
  "document.create": {
    name: "document.create",
    displayName: "创建文档",
    domain: "document",
    action: "create",
    sourceKind: "internal",
    riskLevel: "restricted_write",
    executionMode: "direct",
    description: "Create a new document workspace asset from an existing local sample template.",
    target: {
      objectType: "document",
      identifierKeys: [],
      mutates: true,
    },
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        kind: { type: "string", enum: ["document", "sheet", "slide"] },
        title: { type: "string" },
        workspaceId: { type: "string" },
        sampleAssetId: { type: "string" },
        sampleFileName: { type: "string" },
      },
    },
    outputSchema: buildObjectOutputSchema("document"),
    requiredContext: ["currentUser", "currentWorkspace"],
    plannerHints: {
      whenToUse: "Use when the user asks to create a new document, sheet, or slide in the workspace.",
      requiredInformation: ["title"],
      missingInformationPrompt: "请告诉我要创建的文档标题。",
      examples: ["新建一份施工周报", "创建一个材料台账表格"],
    },
    failureModes: ["missing_title", "sample_asset_not_found", "document_create_failed"],
    mutatesDemoData: true,
    requiresConfirmationDefault: false,
    execute: runDocumentCreate,
  },
} satisfies Record<AiToolName, AiCapability>;

export function listAiCapabilityDescriptors(): AiCapabilityDescriptor[] {
  return Object.values(AI_CAPABILITIES).map((capability) => ({
    name: capability.name,
    displayName: capability.displayName,
    domain: capability.domain,
    action: capability.action,
    sourceKind: capability.sourceKind,
    riskLevel: capability.riskLevel,
    executionMode: capability.executionMode,
    description: capability.description,
    target: capability.target,
    inputSchema: capability.inputSchema,
    outputSchema: capability.outputSchema,
    requiredContext: capability.requiredContext,
    plannerHints: capability.plannerHints,
    failureModes: capability.failureModes,
    mutatesDemoData: capability.mutatesDemoData,
    requiresConfirmationDefault: capability.requiresConfirmationDefault,
  }));
}

export function listAiResourceDescriptors(): AiResourceDescriptor[] {
  return AI_RESOURCES.map((resource) => ({ ...resource }));
}

export function getAiToolRegistrySnapshot(): AiToolRegistrySnapshot {
  return {
    resources: listAiResourceDescriptors(),
    capabilities: listAiCapabilityDescriptors(),
  };
}

export function getAiCapability(name: string): AiCapability | null {
  return Object.hasOwn(AI_CAPABILITIES, name)
    ? AI_CAPABILITIES[name as AiToolName]
    : null;
}

export async function runAiTool(
  context: AiToolExecutionContext,
  request: AiToolRunRequest,
): Promise<AiToolRunRecord> {
  const startedAt = new Date().toISOString();
  const callId = buildToolCallId(request.toolName, startedAt);
  const input = normalizeInput(request.input);

  try {
    const capability = getAiCapability(request.toolName);
    const result = capability
      ? await capability.execute(context, input)
      : {
          status: "failed" as const,
          summaryText: `未知工具：${request.toolName}`,
          structuredPayload: null,
          errorCode: "UNKNOWN_AI_TOOL",
        };
    const completedAt = new Date().toISOString();
    const payload = {
      ...(result.structuredPayload ?? {}),
      actor: {
        userId: context.user.id,
        userName: context.user.name,
      },
    };
    const trace = buildToolTrace({
      callId,
      capability,
      toolName: request.toolName,
      input,
      result,
      payload,
      startedAt,
      completedAt,
    });

    return {
      callId,
      toolName: request.toolName,
      sourceKind: trace.sourceKind,
      riskLevel: trace.riskLevel,
      status: result.status,
      summaryText: result.summaryText,
      input,
      structuredPayload: {
        ...payload,
        standard: trace.output,
        trace,
      },
      trace,
      errorCode: result.errorCode,
      startedAt,
      completedAt,
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const result = {
      status: "failed" as const,
      summaryText:
        error instanceof Error
          ? `工具执行失败：${error.message}`
          : "工具执行失败：未知错误。",
      structuredPayload: null,
      errorCode: "AI_TOOL_RUNTIME_ERROR",
    };
    const trace = buildToolTrace({
      callId,
      capability: getAiCapability(request.toolName),
      toolName: request.toolName,
      input,
      result,
      payload: null,
      startedAt,
      completedAt,
    });

    return {
      callId,
      toolName: request.toolName,
      sourceKind: trace.sourceKind,
      riskLevel: trace.riskLevel,
      status: "failed",
      summaryText: result.summaryText,
      input,
      structuredPayload: {
        actor: {
          userId: context.user.id,
          userName: context.user.name,
        },
        standard: trace.output,
        trace,
      },
      trace,
      errorCode: "AI_TOOL_RUNTIME_ERROR",
      startedAt,
      completedAt,
    };
  }
}
