import "server-only";

import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { runOpenClawWorkOrderExecution } from "@/lib/ai-dorm/openclaw-gateway";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { getDb } from "@/lib/db/client";
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
  "work_order.create",
  "work_order.writeback_draft.create",
  "work_order.writeback.apply",
  "openclaw.work_order.execute",
] as const;

export type AiToolName = (typeof AI_TOOL_NAMES)[number];
export type AiToolRunStatus = "completed" | "not_found" | "failed";

export type AiToolExecutionContext = {
  user: AuthenticatedUser;
};

export type AiToolRunRequest = {
  toolName: AiToolName;
  input: unknown;
};

export type AiToolRunRecord = {
  toolName: AiToolName;
  status: AiToolRunStatus;
  summaryText: string;
  input: Record<string, unknown>;
  structuredPayload: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string;
  errorCode?: string;
};

type WorkOrderReadResult = Pick<
  AiToolRunRecord,
  "status" | "summaryText" | "structuredPayload" | "errorCode"
>;

type WorkOrderCreateResult = Pick<
  AiToolRunRecord,
  "status" | "summaryText" | "structuredPayload" | "errorCode"
>;

type WorkOrderWritebackDraftCreateResult = Pick<
  AiToolRunRecord,
  "status" | "summaryText" | "structuredPayload" | "errorCode"
>;

type WorkOrderWritebackApplyResult = Pick<
  AiToolRunRecord,
  "status" | "summaryText" | "structuredPayload" | "errorCode"
>;

type OpenClawWorkOrderExecuteResult = Pick<
  AiToolRunRecord,
  "status" | "summaryText" | "structuredPayload" | "errorCode"
>;

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

function readBoolean(record: Record<string, unknown>, key: string, fallback: boolean) {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

function readMetadataArray(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return Array.isArray(value) ? value : [];
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
        await tx
          .update(workOrders)
          .set({ warningStatus: draft.proposedValue as typeof workOrder.warningStatus, updatedAt: now })
          .where(eq(workOrders.id, workOrder.id));
        changes.push(workOrderTextUpdate(draft, "work_orders.warning_status", workOrder.warningStatus, draft.proposedValue));
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

export async function runAiTool(
  context: AiToolExecutionContext,
  request: AiToolRunRequest,
): Promise<AiToolRunRecord> {
  const startedAt = new Date().toISOString();
  const input = normalizeInput(request.input);

  try {
    const result =
      request.toolName === "work_order.read"
        ? await runWorkOrderRead(input)
        : request.toolName === "work_order.create"
          ? await runWorkOrderCreate(context, input)
        : request.toolName === "work_order.writeback_draft.create"
          ? await runWorkOrderWritebackDraftCreate(context, input)
        : request.toolName === "work_order.writeback.apply"
          ? await runWorkOrderWritebackApply(context, input)
          : request.toolName === "openclaw.work_order.execute"
            ? await runOpenClawWorkOrderExecute(context, input)
        : {
            status: "failed" as const,
            summaryText: `未知工具：${request.toolName}`,
            structuredPayload: null,
            errorCode: "UNKNOWN_AI_TOOL",
          };

    return {
      toolName: request.toolName,
      status: result.status,
      summaryText: result.summaryText,
      input,
      structuredPayload: {
        ...(result.structuredPayload ?? {}),
        actor: {
          userId: context.user.id,
          userName: context.user.name,
        },
      },
      errorCode: result.errorCode,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      toolName: request.toolName,
      status: "failed",
      summaryText:
        error instanceof Error
          ? `工具执行失败：${error.message}`
          : "工具执行失败：未知错误。",
      input,
      structuredPayload: {
        actor: {
          userId: context.user.id,
          userName: context.user.name,
        },
      },
      errorCode: "AI_TOOL_RUNTIME_ERROR",
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}
