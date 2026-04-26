import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, asc, desc, eq, inArray, or } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/types";
import { runAiSkill, type AiSkillRunRecord } from "@/lib/ai-dorm/skill-runner";
import { matchAiWorkflow } from "@/lib/ai-dorm/workflow-matcher";
import {
  runAiWorkflow,
  type AiWorkflowRunRecord,
} from "@/lib/ai-dorm/workflow-runner";
import { runAiTool, type AiToolRunRecord } from "@/lib/ai-tools/gateway";
import { dispatchBpAskPrompt } from "@/lib/bp-ask/dispatch";
import type { DispatchDecision } from "@/lib/bp-ask/intents";
import {
  planWorkOrderToolWithModel,
  type ModelWorkOrderToolPlan,
} from "@/lib/bp-ask/model-provider";
import {
  createNewThreadLabel,
  pickThreadAccent,
  previewFromText,
  threadTitleFromPrompt,
  type BpAskMessage,
  type BpAskThreadDetail,
  type BpAskThreadSummary,
  type DispatchExecutionPreview,
  type InsightBlock,
} from "@/lib/bp-ask/shared";
import { getDb } from "@/lib/db/client";
import {
  conversationMessages,
  conversationSummaries,
  conversationThreads,
  executionResults,
  executionTasks,
  executionWritebackDrafts,
  memoryFacts,
  workOrders,
} from "@/lib/db/schema";

type MessageRow = typeof conversationMessages.$inferSelect;
type ThreadRow = typeof conversationThreads.$inferSelect;
type JsonRecord = Record<string, unknown> | null | undefined;
type MemoryScopeKind =
  | "user"
  | "thread"
  | "workspace"
  | "collaboration_space"
  | "system_form"
  | "document"
  | "work_order";
type BpAskExecutionRoute =
  | "dispatch_plan"
  | "direct_tool"
  | "skill"
  | "workflow"
  | "work_order_create"
  | "writeback_draft";
type BpAskConfirmationAction = "approve" | "reject" | "defer";
type BpAskConfirmationStatus = "approved" | "rejected" | "deferred";
type BpAskWritebackDraftReviewAction = "approve" | "reject" | "cancel";
type BpAskWritebackDraftReviewStatus =
  | "draft"
  | "ready"
  | "applied"
  | "rejected"
  | "cancelled";
type BpAskConfirmationEvaluation = NonNullable<
  DispatchExecutionPreview["confirmationEvaluation"]
>;
type BpAskPostConfirmationRun = NonNullable<
  DispatchExecutionPreview["postConfirmationRun"]
>;
type BpAskWritebackDraft = NonNullable<
  DispatchExecutionPreview["writebackDrafts"]
>[number];
type BpAskOpenClawRun = NonNullable<
  DispatchExecutionPreview["openClawRuns"]
>[number];
type WritebackDraftRow = typeof executionWritebackDrafts.$inferSelect;

type BpAskExecutionPlan = {
  route: BpAskExecutionRoute;
  toolName?: "work_order.read" | "work_order.create";
  skillId?: "skill-work-order-summary";
  workflowId?: "workflow-work-order-intake";
  createPlan?: BpAskWorkOrderCreatePlan;
  writebackPlan?: BpAskControlledWritebackPlan;
  directToolInput?: {
    workOrderNo?: string;
  };
  modelToolPlan?: ModelWorkOrderToolPlan;
};

type BpAskWorkOrderStepPlannerPlan = {
  workOrderNo: string;
  summary: string;
  candidates: BpAskControlledWritebackCandidate[];
};

type BpAskWorkOrderCreatePlan = {
  title: string;
  sourceSummary: string;
  priority: string;
  stage: string;
  nextAction: string;
};

type BpAskControlledWritebackOperation =
  | "draft_next_action"
  | "draft_risk_followup"
  | "draft_priority"
  | "draft_stage"
  | "draft_status"
  | "draft_title"
  | "draft_source_summary"
  | "draft_project_name"
  | "draft_site_name"
  | "draft_site_address"
  | "draft_responsible_team"
  | "draft_progress_summary"
  | "draft_material_completeness"
  | "draft_missing_item_count"
  | "draft_blocking_item_count"
  | "draft_warning_status"
  | "archive_work_order";

type BpAskControlledWritebackCandidate = {
  objectType: "work_order";
  objectRef: string;
  operation: BpAskControlledWritebackOperation;
  proposedValue: string;
  requiresConfirmation: true;
  status: "not_applied";
};

type BpAskControlledWritebackPlan = {
  workOrderNo: string;
  candidates: BpAskControlledWritebackCandidate[];
  directApply: boolean;
};

const WORK_ORDER_SUMMARY_KEYWORDS = [
  "总结",
  "摘要",
  "梳理",
  "整理",
  "归纳",
  "下一步",
  "建议",
  "风险",
  "缺项",
] as const;
const WORK_ORDER_NEXT_ACTION_FIELD_KEYWORDS = [
  "下一步",
  "下步",
  "后续动作",
  "后续处理",
  "推进动作",
  "待办",
  "next_action",
  "next action",
] as const;
const WORK_ORDER_RISK_FOLLOWUP_FIELD_KEYWORDS = [
  "风险跟进",
  "风险备注",
  "风险说明",
  "风险处置",
  "风险点",
] as const;
const WORK_ORDER_PRIORITY_FIELD_KEYWORDS = [
  "优先级",
  "紧急度",
  "priority",
] as const;
const WORK_ORDER_STAGE_FIELD_KEYWORDS = [
  "阶段",
  "节点",
  "推进到",
  "推进至",
  "进入到",
  "进入",
  "转到",
  "转入",
  "stage",
] as const;
const WORK_ORDER_STATUS_FIELD_KEYWORDS = [
  "状态",
  "工单状态",
  "status",
] as const;
const WORK_ORDER_BROAD_UPDATE_FIELD_KEYWORDS = [
  "标题",
  "工单标题",
  "项目名",
  "项目名称",
  "站点名",
  "站点名称",
  "站址",
  "地址",
  "责任团队",
  "负责团队",
  "最新进展",
  "进展摘要",
  "材料完整度",
  "完整度",
  "缺项数",
  "缺项数量",
  "阻塞缺项",
  "预警状态",
] as const;
const WORK_ORDER_TITLE_FIELD_KEYWORDS = ["标题", "工单标题", "名称"] as const;
const WORK_ORDER_SOURCE_SUMMARY_FIELD_KEYWORDS = ["来源摘要", "需求摘要", "来源说明"] as const;
const WORK_ORDER_PROJECT_NAME_FIELD_KEYWORDS = ["项目名", "项目名称"] as const;
const WORK_ORDER_SITE_NAME_FIELD_KEYWORDS = ["站点名", "站点名称", "站点"] as const;
const WORK_ORDER_SITE_ADDRESS_FIELD_KEYWORDS = ["站址", "站点地址", "地址"] as const;
const WORK_ORDER_RESPONSIBLE_TEAM_FIELD_KEYWORDS = [
  "责任团队",
  "负责团队",
  "当前责任团队",
] as const;
const WORK_ORDER_PROGRESS_SUMMARY_FIELD_KEYWORDS = [
  "最新进展",
  "进展摘要",
  "进展",
] as const;
const WORK_ORDER_MATERIAL_COMPLETENESS_FIELD_KEYWORDS = [
  "材料完整度",
  "完整度",
] as const;
const WORK_ORDER_MISSING_ITEM_COUNT_FIELD_KEYWORDS = [
  "阻塞缺项数",
  "阻塞缺项",
  "缺项数",
  "缺项数量",
] as const;
const WORK_ORDER_BLOCKING_ITEM_COUNT_FIELD_KEYWORDS = [
  "阻塞缺项数",
  "阻塞缺项",
] as const;
const WORK_ORDER_WARNING_STATUS_FIELD_KEYWORDS = [
  "预警状态",
  "告警状态",
] as const;
const WORK_ORDER_STEP_PLANNER_KEYWORDS = [
  "整理一下",
  "整理下",
  "该补的补",
  "该推进的推进",
  "推进一下",
  "处理一下",
  "一键整理",
  "自动处理",
  "帮我处理",
] as const;
const WORK_ORDER_ARCHIVE_KEYWORDS = [
  "归档",
  "删除",
  "移入归档",
  "移到归档",
  "移入回收站",
  "软删除",
] as const;
const WORK_ORDER_WRITE_COMMAND_KEYWORDS = [
  "把",
  "将",
  "请",
  "帮我",
  "改成",
  "改为",
  "设为",
  "设置为",
  "更新为",
  "调整为",
  "推进到",
  "推进至",
  "归档",
  "删除",
] as const;
const WORK_ORDER_CREATE_KEYWORDS = [
  "新建",
  "创建",
  "开一个",
  "增加一个",
  "新增",
] as const;
const WRITEBACK_DRAFT_ONLY_KEYWORDS = [
  "草案",
  "写回草案",
  "先生成",
  "先创建",
  "先让我确认",
  "让我确认",
  "需要确认",
  "不要直接",
  "别直接",
  "先别改",
  "先不要改",
  "只生成",
] as const;
const WORK_ORDER_WRITEBACK_VALUE_MARKERS = [
  "改成",
  "改为",
  "设为",
  "设置为",
  "更新为",
  "调整为",
  "写成",
  "写为",
  "追加为",
  "补充为",
  "记录为",
  "变成",
  "为",
  ":",
  "：",
] as const;
const WORK_ORDER_PRIORITY_VALUE_MAP: Record<string, string> = {
  低: "low",
  低优先级: "low",
  low: "low",
  普通: "normal",
  一般: "normal",
  正常: "normal",
  normal: "normal",
  高: "high",
  高优先级: "high",
  high: "high",
  紧急: "urgent",
  急: "urgent",
  最高: "urgent",
  urgent: "urgent",
};
const WORK_ORDER_STAGE_VALUE_MAP: Record<string, string> = {
  来源登记: "source_intake",
  来源: "source_intake",
  source_intake: "source_intake",
  工单登记: "registration",
  登记: "registration",
  registration: "registration",
  派单: "dispatch",
  dispatch: "dispatch",
  预警处置: "warning",
  预警: "warning",
  warning: "warning",
  现场施工: "field_construction",
  施工: "field_construction",
  field_construction: "field_construction",
  回单资料: "return_sheet",
  回单: "return_sheet",
  return_sheet: "return_sheet",
  图纸交付: "drawing_delivery",
  图纸: "drawing_delivery",
  drawing_delivery: "drawing_delivery",
  录资源: "resource_entry",
  资源录入: "resource_entry",
  resource_entry: "resource_entry",
  资源稽核: "resource_audit",
  稽核: "resource_audit",
  resource_audit: "resource_audit",
  打包出设计: "design_package",
  设计打包: "design_package",
  design_package: "design_package",
};
const WORK_ORDER_STATUS_VALUE_MAP: Record<string, string> = {
  待推进: "open",
  打开: "open",
  open: "open",
  推进中: "in_progress",
  进行中: "in_progress",
  in_progress: "in_progress",
  等待中: "waiting",
  等待: "waiting",
  waiting: "waiting",
  阻塞: "blocked",
  blocked: "blocked",
  已完成: "completed",
  完成: "completed",
  completed: "completed",
  已取消: "cancelled",
  取消: "cancelled",
  cancelled: "cancelled",
  已归档: "archived",
  归档: "archived",
  archived: "archived",
};
const WORK_ORDER_WARNING_STATUS_VALUE_MAP: Record<string, string> = {
  正常: "normal",
  normal: "normal",
  预警: "warning",
  warning: "warning",
  严重预警: "critical",
  严重: "critical",
  critical: "critical",
  已解除: "resolved",
  解除: "resolved",
  resolved: "resolved",
};

function nowDate() {
  return new Date();
}

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return new Date().toISOString();
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function buildId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

function buildStableId(parts: string[]) {
  return createHash("sha1").update(parts.join(":")).digest("hex");
}

function estimateTokenCount(text: string) {
  return Math.max(1, Math.ceil(text.trim().length / 3));
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(record: JsonRecord, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(record: JsonRecord, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseModelInteger(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/-?\d+/);

  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampModelPercent(value: string | null | undefined) {
  const parsed = parseModelInteger(value);

  if (parsed === null) {
    return null;
  }

  return Math.min(100, Math.max(0, parsed));
}

function readTargetWorkOrderNo(decision: DispatchDecision) {
  return readString(decision.targetRefs, "workOrderNo");
}

function normalizeWorkOrderLookupToken(value: string) {
  return value
    .replace(/工单/g, "")
    .replace(/项目/g, "")
    .replace(/\s+/g, "")
    .trim();
}

async function resolveWorkOrderNoForPrompt(
  decision: DispatchDecision,
  prompt: string,
) {
  const directWorkOrderNo = readTargetWorkOrderNo(decision);

  if (directWorkOrderNo) {
    return directWorkOrderNo;
  }

  if (decision.targetDomain !== "work_order" && !prompt.includes("工单")) {
    return "";
  }

  const db = getDb();
  const rows = await db
    .select({
      workOrderNo: workOrders.workOrderNo,
      title: workOrders.title,
      projectName: workOrders.projectName,
      siteName: workOrders.siteName,
      siteAddress: workOrders.siteAddress,
    })
    .from(workOrders);
  const promptToken = normalizeWorkOrderLookupToken(prompt);
  const scored = rows
    .map((row) => {
      const fields = [row.title, row.projectName, row.siteName, row.siteAddress]
        .filter(Boolean)
        .map(normalizeWorkOrderLookupToken);
      const score = fields.reduce((total, field) => {
        if (!field) {
          return total;
        }

        if (promptToken.includes(field) || field.includes(promptToken)) {
          return total + field.length + 20;
        }

        const chars = Array.from(new Set(field.split("")));
        return total + chars.filter((char) => promptToken.includes(char)).length;
      }, 0);

      return { row, score };
    })
    .sort((left, right) => right.score - left.score);

  return scored[0] && scored[0].score >= 4 ? scored[0].row.workOrderNo : "";
}

function includesAny(source: string, keywords: readonly string[]) {
  return keywords.some((keyword) => source.includes(keyword));
}

function shouldRunWorkOrderSummarySkill(decision: DispatchDecision, prompt: string) {
  if (
    decision.targetDomain !== "work_order" ||
    decision.requiresWrite ||
    decision.requiresConfirmation ||
    decision.suggestedExecutor === "longxia" ||
    includesAny(prompt, WORK_ORDER_BROAD_UPDATE_FIELD_KEYWORDS) ||
    !readTargetWorkOrderNo(decision)
  ) {
    return false;
  }

  return (
    decision.executionMode === "retrieve_and_summarize" ||
    decision.primaryIntent === "summarize" ||
    includesAny(prompt, WORK_ORDER_SUMMARY_KEYWORDS)
  );
}

function shouldRunDirectWorkOrderRead(decision: DispatchDecision, prompt = "") {
  if (
    decision.targetDomain !== "work_order" ||
    decision.executionMode !== "retrieve_then_answer" ||
    decision.requiresWrite ||
    decision.requiresConfirmation ||
    decision.suggestedExecutor === "longxia" ||
    includesAny(prompt, WORK_ORDER_BROAD_UPDATE_FIELD_KEYWORDS)
  ) {
    return false;
  }

  return Boolean(readTargetWorkOrderNo(decision));
}

function stripOuterQuotes(value: string) {
  return value
    .trim()
    .replace(/^["'“”‘’「『【\[\(（]+/g, "")
    .replace(/["'“”‘’」』】\]\)）]+$/g, "")
    .trim();
}

function trimAtNextWritebackField(value: string) {
  const separators = ["，", "；", "。", "\n"];
  let bestIndex = -1;

  for (const separator of separators) {
    const index = value.indexOf(separator);

    if (index === -1) {
      continue;
    }

    const after = value.slice(index + separator.length).trim();
    const startsNextField =
      after.startsWith("并") ||
      after.startsWith("同时") ||
      after.startsWith("另外") ||
      after.startsWith("然后") ||
      WORK_ORDER_NEXT_ACTION_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      ) ||
      WORK_ORDER_RISK_FOLLOWUP_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      ) ||
      WORK_ORDER_PRIORITY_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      ) ||
      WORK_ORDER_STAGE_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      ) ||
      WORK_ORDER_STATUS_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      ) ||
      WORK_ORDER_TITLE_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      ) ||
      WORK_ORDER_SOURCE_SUMMARY_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      ) ||
      WORK_ORDER_PROJECT_NAME_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      ) ||
      WORK_ORDER_SITE_NAME_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      ) ||
      WORK_ORDER_SITE_ADDRESS_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      ) ||
      WORK_ORDER_RESPONSIBLE_TEAM_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      ) ||
      WORK_ORDER_PROGRESS_SUMMARY_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      ) ||
      WORK_ORDER_MATERIAL_COMPLETENESS_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      ) ||
      WORK_ORDER_MISSING_ITEM_COUNT_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      ) ||
      WORK_ORDER_BLOCKING_ITEM_COUNT_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      ) ||
      WORK_ORDER_WARNING_STATUS_FIELD_KEYWORDS.some((keyword) =>
        after.startsWith(keyword),
      );

    if (startsNextField && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
    }
  }

  return bestIndex === -1 ? value : value.slice(0, bestIndex);
}

function normalizeWritebackProposedValue(value: string) {
  let nextValue = stripOuterQuotes(value)
    .replace(/^(?:=|＝)+/g, "")
    .trim();
  let consumedMarker = true;

  while (consumedMarker) {
    consumedMarker = false;

    for (const marker of WORK_ORDER_WRITEBACK_VALUE_MARKERS) {
      if (nextValue.startsWith(marker)) {
        nextValue = nextValue.slice(marker.length).trim();
        consumedMarker = true;
        break;
      }
    }
  }

  return stripOuterQuotes(trimAtNextWritebackField(nextValue));
}

function normalizeWritebackToken(value: string) {
  return stripOuterQuotes(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。；、,.;:：]+$/g, "")
    .replace(/阶段$/g, "")
    .trim();
}

function normalizeMappedWritebackValue(
  value: string,
  map: Record<string, string>,
) {
  const normalized = normalizeWritebackToken(value);

  return map[normalized] ?? "";
}

function extractMappedValueNearField(
  prompt: string,
  fieldKeywords: readonly string[],
  map: Record<string, string>,
) {
  const mapKeys = Object.keys(map).sort((left, right) => right.length - left.length);

  for (const keyword of fieldKeywords) {
    const index = prompt.indexOf(keyword);

    if (index === -1) {
      continue;
    }

    const tail = normalizeWritebackToken(prompt.slice(index + keyword.length, index + keyword.length + 48));
    const matchedKey = mapKeys.find((key) => tail.includes(normalizeWritebackToken(key)));

    if (matchedKey) {
      return map[matchedKey];
    }
  }

  return "";
}

function removeTrailingCreateOptions(value: string) {
  return value
    .split(/[，；。]/)[0]
    .replace(/(?:优先级|阶段|节点|状态|下一步|风险跟进).*/g, "")
    .trim();
}

function extractWorkOrderCreateTitle(prompt: string) {
  const firstSegment =
    prompt
      .split(/[，；。]/)
      .find((segment) => includesAny(segment, WORK_ORDER_CREATE_KEYWORDS)) ??
    prompt;
  const title = removeTrailingCreateOptions(firstSegment)
    .replace(/^(?:请|帮我|麻烦|给我|帮忙)?/g, "")
    .replace(/^(?:在|给)/g, "")
    .replace(/(?:新建|创建|开一个|增加一个|新增)/g, "")
    .replace(/(?:一个|一条|1个|1条)/g, "")
    .trim();

  if (title) {
    return title.includes("工单") ? title : `${title}工单`;
  }

  return "";
}

function buildWorkOrderCreatePlan(
  decision: DispatchDecision,
  prompt: string,
): BpAskWorkOrderCreatePlan | null {
  if (
    decision.targetDomain !== "work_order" ||
    decision.primaryIntent !== "create_object" ||
    !includesAny(prompt, WORK_ORDER_CREATE_KEYWORDS)
  ) {
    return null;
  }

  const title = extractWorkOrderCreateTitle(prompt);

  if (!title) {
    return null;
  }

  const priority =
    normalizeMappedWritebackValue(
      extractWritebackValueAfterField(prompt, WORK_ORDER_PRIORITY_FIELD_KEYWORDS),
      WORK_ORDER_PRIORITY_VALUE_MAP,
    ) ||
    extractMappedValueNearField(
      prompt,
      WORK_ORDER_PRIORITY_FIELD_KEYWORDS,
      WORK_ORDER_PRIORITY_VALUE_MAP,
    ) ||
    (includesAny(prompt, ["紧急", "急"]) ? "urgent" : "normal");
  const stage =
    normalizeMappedWritebackValue(
      extractWritebackValueAfterField(prompt, WORK_ORDER_STAGE_FIELD_KEYWORDS),
      WORK_ORDER_STAGE_VALUE_MAP,
    ) ||
    extractMappedValueNearField(
      prompt,
      WORK_ORDER_STAGE_FIELD_KEYWORDS,
      WORK_ORDER_STAGE_VALUE_MAP,
    ) ||
    "registration";
  const nextAction = extractWritebackValueAfterField(
    prompt,
    WORK_ORDER_NEXT_ACTION_FIELD_KEYWORDS,
  );

  return {
    title,
    sourceSummary: prompt,
    priority,
    stage,
    nextAction,
  };
}

function shouldDirectApplyWorkOrderWriteback(prompt: string) {
  return !includesAny(prompt, WRITEBACK_DRAFT_ONLY_KEYWORDS);
}

function extractWritebackValueAfterField(
  prompt: string,
  fieldKeywords: readonly string[],
) {
  for (const keyword of fieldKeywords) {
    const index = prompt.indexOf(keyword);

    if (index === -1) {
      continue;
    }

    const rawValue = prompt.slice(index + keyword.length);
    const value = normalizeWritebackProposedValue(rawValue);

    if (value.length >= 2) {
      return value;
    }
  }

  return "";
}

function extractMappedWritebackValue(
  prompt: string,
  fieldKeywords: readonly string[],
  map: Record<string, string>,
) {
  return (
    normalizeMappedWritebackValue(
      extractWritebackValueAfterField(prompt, fieldKeywords),
      map,
    ) || extractMappedValueNearField(prompt, fieldKeywords, map)
  );
}

function extractWritebackIntegerAfterField(
  prompt: string,
  fieldKeywords: readonly string[],
) {
  for (const keyword of fieldKeywords) {
    const index = prompt.indexOf(keyword);

    if (index === -1) {
      continue;
    }

    const value = parseModelInteger(prompt.slice(index + keyword.length, index + keyword.length + 24));

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function addWritebackCandidate(
  candidates: BpAskControlledWritebackCandidate[],
  workOrderNo: string,
  operation: BpAskControlledWritebackOperation,
  proposedValue: string | number | null | undefined,
) {
  const value = typeof proposedValue === "number" ? String(proposedValue) : proposedValue?.trim();

  if (!value) {
    return;
  }

  candidates.push({
    objectType: "work_order",
    objectRef: workOrderNo,
    operation,
    proposedValue: value,
    requiresConfirmation: true,
    status: "not_applied",
  });
}

function buildControlledWorkOrderWritebackPlan(
  decision: DispatchDecision,
  prompt: string,
): BpAskControlledWritebackPlan | null {
  const workOrderNo = readTargetWorkOrderNo(decision);

  if (
    decision.targetDomain !== "work_order" &&
    !readTargetWorkOrderNo(decision) &&
    !/WO-\d{4,}/i.test(prompt)
  ) {
    return null;
  }

  const candidates: BpAskControlledWritebackCandidate[] = [];
  const nextAction = extractWritebackValueAfterField(
    prompt,
    WORK_ORDER_NEXT_ACTION_FIELD_KEYWORDS,
  );
  const riskFollowup = extractWritebackValueAfterField(
    prompt,
    WORK_ORDER_RISK_FOLLOWUP_FIELD_KEYWORDS,
  );
  const priority = extractMappedWritebackValue(
    prompt,
    WORK_ORDER_PRIORITY_FIELD_KEYWORDS,
    WORK_ORDER_PRIORITY_VALUE_MAP,
  );
  const stage = extractMappedWritebackValue(
    prompt,
    WORK_ORDER_STAGE_FIELD_KEYWORDS,
    WORK_ORDER_STAGE_VALUE_MAP,
  );
  const status = extractMappedWritebackValue(
    prompt,
    WORK_ORDER_STATUS_FIELD_KEYWORDS,
    WORK_ORDER_STATUS_VALUE_MAP,
  );
  const title = extractWritebackValueAfterField(prompt, WORK_ORDER_TITLE_FIELD_KEYWORDS);
  const sourceSummary = extractWritebackValueAfterField(
    prompt,
    WORK_ORDER_SOURCE_SUMMARY_FIELD_KEYWORDS,
  );
  const projectName = extractWritebackValueAfterField(
    prompt,
    WORK_ORDER_PROJECT_NAME_FIELD_KEYWORDS,
  );
  const siteName = extractWritebackValueAfterField(
    prompt,
    WORK_ORDER_SITE_NAME_FIELD_KEYWORDS,
  );
  const siteAddress = extractWritebackValueAfterField(
    prompt,
    WORK_ORDER_SITE_ADDRESS_FIELD_KEYWORDS,
  );
  const responsibleTeam = extractWritebackValueAfterField(
    prompt,
    WORK_ORDER_RESPONSIBLE_TEAM_FIELD_KEYWORDS,
  );
  const progressSummary = extractWritebackValueAfterField(
    prompt,
    WORK_ORDER_PROGRESS_SUMMARY_FIELD_KEYWORDS,
  );
  const warningStatus = extractMappedWritebackValue(
    prompt,
    WORK_ORDER_WARNING_STATUS_FIELD_KEYWORDS,
    WORK_ORDER_WARNING_STATUS_VALUE_MAP,
  );
  const materialCompleteness = clampModelPercent(
    extractWritebackValueAfterField(
      prompt,
      WORK_ORDER_MATERIAL_COMPLETENESS_FIELD_KEYWORDS,
    ),
  );
  const missingItemCount = extractWritebackIntegerAfterField(
    prompt.replace(/阻塞缺项(?:数)?(?:改成|改为|设为|设置为|更新为|调整为|写成|写为|变成|为)?\s*\d+/g, ""),
    WORK_ORDER_MISSING_ITEM_COUNT_FIELD_KEYWORDS,
  );
  const blockingItemCount = extractWritebackIntegerAfterField(
    prompt,
    WORK_ORDER_BLOCKING_ITEM_COUNT_FIELD_KEYWORDS,
  );
  const hasWriteCommandCue =
    decision.requiresWrite || includesAny(prompt, WORK_ORDER_WRITE_COMMAND_KEYWORDS);
  const shouldArchive =
    hasWriteCommandCue && includesAny(prompt, WORK_ORDER_ARCHIVE_KEYWORDS);

  if (nextAction) {
    candidates.push({
      objectType: "work_order",
      objectRef: workOrderNo,
      operation: "draft_next_action",
      proposedValue: nextAction,
      requiresConfirmation: true,
      status: "not_applied",
    });
  }

  if (riskFollowup && riskFollowup !== nextAction) {
    candidates.push({
      objectType: "work_order",
      objectRef: workOrderNo,
      operation: "draft_risk_followup",
      proposedValue: riskFollowup,
      requiresConfirmation: true,
      status: "not_applied",
    });
  }

  if (priority) {
    candidates.push({
      objectType: "work_order",
      objectRef: workOrderNo,
      operation: "draft_priority",
      proposedValue: priority,
      requiresConfirmation: true,
      status: "not_applied",
    });
  }

  if (stage) {
    candidates.push({
      objectType: "work_order",
      objectRef: workOrderNo,
      operation: "draft_stage",
      proposedValue: stage,
      requiresConfirmation: true,
      status: "not_applied",
    });
  }

  if (status && !shouldArchive) {
    candidates.push({
      objectType: "work_order",
      objectRef: workOrderNo,
      operation: "draft_status",
      proposedValue: status,
      requiresConfirmation: true,
      status: "not_applied",
    });
  }

  addWritebackCandidate(candidates, workOrderNo, "draft_title", title);
  addWritebackCandidate(candidates, workOrderNo, "draft_source_summary", sourceSummary);
  addWritebackCandidate(candidates, workOrderNo, "draft_project_name", projectName);
  addWritebackCandidate(candidates, workOrderNo, "draft_site_name", siteName);
  addWritebackCandidate(candidates, workOrderNo, "draft_site_address", siteAddress);
  addWritebackCandidate(candidates, workOrderNo, "draft_responsible_team", responsibleTeam);
  addWritebackCandidate(candidates, workOrderNo, "draft_progress_summary", progressSummary);
  addWritebackCandidate(candidates, workOrderNo, "draft_warning_status", warningStatus);
  if (materialCompleteness !== null) {
    addWritebackCandidate(
      candidates,
      workOrderNo,
      "draft_material_completeness",
      materialCompleteness,
    );
  }
  if (missingItemCount !== null) {
    addWritebackCandidate(
      candidates,
      workOrderNo,
      "draft_missing_item_count",
      Math.max(0, missingItemCount),
    );
  }
  if (blockingItemCount !== null) {
    addWritebackCandidate(
      candidates,
      workOrderNo,
      "draft_blocking_item_count",
      Math.max(0, blockingItemCount),
    );
  }

  if (shouldArchive) {
    candidates.push({
      objectType: "work_order",
      objectRef: workOrderNo,
      operation: "archive_work_order",
      proposedValue: "archived",
      requiresConfirmation: true,
      status: "not_applied",
    });
  }

  return candidates.length > 0
    ? {
        workOrderNo,
        candidates,
        directApply: shouldDirectApplyWorkOrderWriteback(prompt),
      }
    : null;
}

function normalizeModelMappedWritebackValue(
  value: string | null | undefined,
  map: Record<string, string>,
) {
  if (!value) {
    return "";
  }

  return normalizeMappedWritebackValue(value, map);
}

function shouldTryModelWorkOrderToolPlanner(
  decision: DispatchDecision,
  prompt: string,
) {
  if (
    decision.executionMode === "start_workflow" ||
    decision.executionMode === "delegate_to_longxia" ||
    decision.suggestedExecutor === "longxia"
  ) {
    return false;
  }

  if (
    ["summarize", "compare", "analyze", "extract", "help_meta", "chat_general"].includes(
      decision.primaryIntent,
    )
  ) {
    return false;
  }

  return (
    decision.targetDomain === "work_order" ||
    /WO-\d{4,}/i.test(prompt) ||
    includesAny(prompt, WORK_ORDER_BROAD_UPDATE_FIELD_KEYWORDS) ||
    includesAny(prompt, ["工单", "巡检单", "报修单", "派工单"])
  );
}

function buildWorkOrderCreatePlanFromModel(
  modelToolPlan: ModelWorkOrderToolPlan,
  prompt: string,
): BpAskWorkOrderCreatePlan | null {
  if (modelToolPlan.tool !== "work_order.create") {
    return null;
  }

  const title = modelToolPlan.args.title?.trim();

  if (!title) {
    return null;
  }

  return {
    title: title.includes("工单") ? title : `${title}工单`,
    sourceSummary: modelToolPlan.args.sourceSummary?.trim() || prompt,
    priority:
      normalizeModelMappedWritebackValue(
        modelToolPlan.args.priority,
        WORK_ORDER_PRIORITY_VALUE_MAP,
      ) || "normal",
    stage:
      normalizeModelMappedWritebackValue(
        modelToolPlan.args.stage,
        WORK_ORDER_STAGE_VALUE_MAP,
      ) || "registration",
    nextAction: modelToolPlan.args.nextAction?.trim() ?? "",
  };
}

function buildControlledWorkOrderWritebackPlanFromModel(
  decision: DispatchDecision,
  prompt: string,
  modelToolPlan: ModelWorkOrderToolPlan,
): BpAskControlledWritebackPlan | null {
  if (
    modelToolPlan.tool !== "work_order.update" &&
    modelToolPlan.tool !== "work_order.archive"
  ) {
    return null;
  }

  const workOrderNo = modelToolPlan.args.workOrderNo || readTargetWorkOrderNo(decision);

  if (!workOrderNo) {
    return null;
  }

  const candidates: BpAskControlledWritebackCandidate[] = [];
  const nextAction = modelToolPlan.args.nextAction?.trim() ?? "";
  const riskFollowup = modelToolPlan.args.riskFollowup?.trim() ?? "";
  const priority = normalizeModelMappedWritebackValue(
    modelToolPlan.args.priority,
    WORK_ORDER_PRIORITY_VALUE_MAP,
  );
  const stage = normalizeModelMappedWritebackValue(
    modelToolPlan.args.stage,
    WORK_ORDER_STAGE_VALUE_MAP,
  );
  const status = normalizeModelMappedWritebackValue(
    modelToolPlan.args.status,
    WORK_ORDER_STATUS_VALUE_MAP,
  );
  const warningStatus = normalizeModelMappedWritebackValue(
    modelToolPlan.args.warningStatus,
    WORK_ORDER_WARNING_STATUS_VALUE_MAP,
  );
  const materialCompleteness = clampModelPercent(
    modelToolPlan.args.materialCompleteness,
  );
  const missingItemCount = parseModelInteger(modelToolPlan.args.missingItemCount);
  const blockingItemCount = parseModelInteger(modelToolPlan.args.blockingItemCount);

  if (modelToolPlan.tool === "work_order.archive") {
    candidates.push({
      objectType: "work_order",
      objectRef: workOrderNo,
      operation: "archive_work_order",
      proposedValue: "archived",
      requiresConfirmation: true,
      status: "not_applied",
    });
  }

  if (nextAction) {
    candidates.push({
      objectType: "work_order",
      objectRef: workOrderNo,
      operation: "draft_next_action",
      proposedValue: nextAction,
      requiresConfirmation: true,
      status: "not_applied",
    });
  }

  if (riskFollowup) {
    candidates.push({
      objectType: "work_order",
      objectRef: workOrderNo,
      operation: "draft_risk_followup",
      proposedValue: riskFollowup,
      requiresConfirmation: true,
      status: "not_applied",
    });
  }

  if (priority) {
    candidates.push({
      objectType: "work_order",
      objectRef: workOrderNo,
      operation: "draft_priority",
      proposedValue: priority,
      requiresConfirmation: true,
      status: "not_applied",
    });
  }

  if (stage) {
    candidates.push({
      objectType: "work_order",
      objectRef: workOrderNo,
      operation: "draft_stage",
      proposedValue: stage,
      requiresConfirmation: true,
      status: "not_applied",
    });
  }

  if (status && modelToolPlan.tool !== "work_order.archive") {
    candidates.push({
      objectType: "work_order",
      objectRef: workOrderNo,
      operation: "draft_status",
      proposedValue: status,
      requiresConfirmation: true,
      status: "not_applied",
    });
  }

  addWritebackCandidate(candidates, workOrderNo, "draft_title", modelToolPlan.args.title);
  addWritebackCandidate(
    candidates,
    workOrderNo,
    "draft_source_summary",
    modelToolPlan.args.sourceSummary,
  );
  addWritebackCandidate(
    candidates,
    workOrderNo,
    "draft_project_name",
    modelToolPlan.args.projectName,
  );
  addWritebackCandidate(candidates, workOrderNo, "draft_site_name", modelToolPlan.args.siteName);
  addWritebackCandidate(
    candidates,
    workOrderNo,
    "draft_site_address",
    modelToolPlan.args.siteAddress,
  );
  addWritebackCandidate(
    candidates,
    workOrderNo,
    "draft_responsible_team",
    modelToolPlan.args.responsibleTeam,
  );
  addWritebackCandidate(
    candidates,
    workOrderNo,
    "draft_progress_summary",
    modelToolPlan.args.progressSummary,
  );
  if (materialCompleteness !== null) {
    addWritebackCandidate(
      candidates,
      workOrderNo,
      "draft_material_completeness",
      String(materialCompleteness),
    );
  }
  if (missingItemCount !== null) {
    addWritebackCandidate(
      candidates,
      workOrderNo,
      "draft_missing_item_count",
      String(Math.max(0, missingItemCount)),
    );
  }
  if (blockingItemCount !== null) {
    addWritebackCandidate(
      candidates,
      workOrderNo,
      "draft_blocking_item_count",
      String(Math.max(0, blockingItemCount)),
    );
  }
  addWritebackCandidate(
    candidates,
    workOrderNo,
    "draft_warning_status",
    warningStatus,
  );

  return candidates.length > 0
    ? {
        workOrderNo,
        candidates,
        directApply: shouldDirectApplyWorkOrderWriteback(prompt),
      }
    : null;
}

function writebackOperationLabel(operation: string) {
  const labels: Record<string, string> = {
    draft_progress_summary: "更新进展摘要",
    draft_status: "推进工单状态",
    draft_next_action: "更新下一步动作",
    draft_risk_followup: "追加风险跟进",
    draft_stage: "推进工单阶段",
    draft_warning_status: "更新预警状态",
    draft_title: "更新标题",
    draft_project_name: "更新项目名",
    draft_site_name: "更新站点名",
    draft_responsible_team: "更新责任团队",
  };

  return labels[operation] ?? operation;
}

function resolveNaturalStage(prompt: string) {
  if (prompt.includes("施工")) {
    return "field_construction";
  }

  return "";
}

function resolveNaturalWarningStatus(prompt: string) {
  if (prompt.includes("解除预警") || prompt.includes("预警解除")) {
    return "resolved";
  }

  return "";
}

function shouldRunWorkOrderStepPlanner(decision: DispatchDecision, prompt: string) {
  return Boolean(
    (decision.targetDomain === "work_order" || prompt.includes("工单")) &&
      !decision.suggestedExecutor.includes("longxia") &&
      includesAny(prompt, WORK_ORDER_STEP_PLANNER_KEYWORDS),
  );
}

function buildWorkOrderStepPlannerPlan(
  decision: DispatchDecision,
  prompt: string,
  workOrderNo: string,
): BpAskWorkOrderStepPlannerPlan | null {
  if (!shouldRunWorkOrderStepPlanner(decision, prompt) || !workOrderNo) {
    return null;
  }

  const candidates: BpAskControlledWritebackCandidate[] = [];

  if (prompt.includes("推进到") || prompt.includes("推进至")) {
    addWritebackCandidate(
      candidates,
      workOrderNo,
      "draft_stage",
      resolveNaturalStage(prompt),
    );
    addWritebackCandidate(
      candidates,
      workOrderNo,
      "draft_warning_status",
      resolveNaturalWarningStatus(prompt),
    );
  }

  addWritebackCandidate(
    candidates,
    workOrderNo,
    "draft_progress_summary",
    prompt.includes("解除预警") || prompt.includes("推进到") || prompt.includes("推进至")
      ? "BP问问已根据目标推进工单：进入施工处理并解除预警。"
      : "BP问问已根据目标完成工单整理：补齐执行摘要并准备推进。",
  );
  addWritebackCandidate(
    candidates,
    workOrderNo,
    "draft_status",
    "in_progress",
  );
  addWritebackCandidate(
    candidates,
    workOrderNo,
    "draft_next_action",
    prompt.includes("解除预警") || prompt.includes("推进到") || prompt.includes("推进至")
      ? "继续现场施工闭环，确认预警已解除并补齐施工资料。"
      : "按 BP问问整理结果继续推进：补齐缺项、跟进风险，并同步下一阶段资料。",
  );
  addWritebackCandidate(
    candidates,
    workOrderNo,
    "draft_risk_followup",
    "BP问问多步骤整理：已标记需要继续关注缺项、材料完整度和现场推进风险。",
  );

  return {
    workOrderNo,
    summary: "已规划读取工单、整理进展、推进状态、补下一步和风险跟进。",
    candidates,
  };
}

function planBpAskExecution(
  decision: DispatchDecision,
  prompt: string,
  modelToolPlan: ModelWorkOrderToolPlan | null = null,
): BpAskExecutionPlan {
  const createPlan = buildWorkOrderCreatePlan(decision, prompt);

  if (createPlan) {
    return {
      route: "work_order_create",
      toolName: "work_order.create",
      createPlan,
    };
  }

  const writebackPlan = buildControlledWorkOrderWritebackPlan(decision, prompt);

  if (writebackPlan) {
    return {
      route: "writeback_draft",
      writebackPlan,
    };
  }

  const workflowMatch = matchAiWorkflow({ decision, prompt });

  if (workflowMatch) {
    return {
      route: "workflow",
      workflowId: workflowMatch.workflowId,
    };
  }

  if (shouldRunWorkOrderSummarySkill(decision, prompt)) {
    return {
      route: "skill",
      skillId: "skill-work-order-summary",
    };
  }

  if (shouldRunDirectWorkOrderRead(decision, prompt)) {
    return {
      route: "direct_tool",
      toolName: "work_order.read",
      directToolInput: {
        workOrderNo: readTargetWorkOrderNo(decision),
      },
    };
  }

  if (modelToolPlan && modelToolPlan.confidence >= 70) {
    const modelCreatePlan = buildWorkOrderCreatePlanFromModel(modelToolPlan, prompt);

    if (modelCreatePlan) {
      return {
        route: "work_order_create",
        toolName: "work_order.create",
        createPlan: modelCreatePlan,
        modelToolPlan,
      };
    }

    const modelWritebackPlan = buildControlledWorkOrderWritebackPlanFromModel(
      decision,
      prompt,
      modelToolPlan,
    );

    if (modelWritebackPlan) {
      return {
        route: "writeback_draft",
        writebackPlan: modelWritebackPlan,
        modelToolPlan,
      };
    }

    if (modelToolPlan.tool === "work_order.read" && modelToolPlan.args.workOrderNo) {
      return {
        route: "direct_tool",
        toolName: "work_order.read",
        directToolInput: {
          workOrderNo: modelToolPlan.args.workOrderNo,
        },
        modelToolPlan,
      };
    }
  }

  return {
    route: "dispatch_plan",
  };
}

function readWorkOrderFromToolRun(toolRun: AiToolRunRecord) {
  const payload = asRecord(toolRun.structuredPayload);
  return asRecord(payload?.workOrder);
}

function buildDirectToolExecutionPreview(toolRun: AiToolRunRecord): DispatchExecutionPreview {
  const statusLabel =
    toolRun.status === "completed"
      ? "真实执行：已读取工单"
      : toolRun.status === "not_found"
        ? "真实执行：未命中工单"
        : "真实执行：读取失败";

  return {
    mode: "tool_result",
    title: statusLabel,
    summary: toolRun.summaryText,
    nextStep:
      toolRun.status === "completed"
        ? "已把读取结果写入 execution_results，并用于 BP问问本轮回复。"
        : "请检查工单编号是否正确，或换一个工单编号再查。",
    safety: "安全：本轮只调用只读工具 work_order.read，没有修改业务对象。",
    simulatedActions: [
      "dispatch 识别为工单只读查询",
      "BP问问直接调用 work_order.read",
      "工具结果写入 execution_results",
    ],
    toolRuns: [
      {
        toolName: toolRun.toolName,
        status: toolRun.status,
        summaryText: toolRun.summaryText,
      },
    ],
    changedObjects: [],
  };
}

function buildDirectToolInsight(
  insight: InsightBlock,
  toolRun: AiToolRunRecord,
): InsightBlock {
  const toolFinding =
    toolRun.status === "completed"
      ? `已执行真实只读工具 ${toolRun.toolName}，并拿到工单真源数据。`
      : `已执行真实只读工具 ${toolRun.toolName}，结果为 ${toolRun.status}。`;

  return {
    ...insight,
    metric: "DIRECT TOOL RUN",
    findings: [...insight.findings, toolFinding],
    summary: `${insight.summary} ${toolRun.summaryText}`,
  };
}

function buildWorkOrderCreateExecutionPreview(
  toolRun: AiToolRunRecord,
): DispatchExecutionPreview {
  const changedObjects = readChangedObjectsFromToolRun(toolRun);

  return {
    mode: "tool_result",
    title:
      toolRun.status === "completed"
        ? "真实执行：已创建工单"
        : "真实执行：工单创建失败",
    summary: toolRun.summaryText,
    nextStep:
      toolRun.status === "completed"
        ? "工单已写入 work_orders，刷新工单列表或总览即可看到。"
        : "请补充工单标题或检查创建参数后重试。",
    safety:
      "安全：本轮直接创建 demo 工单，并记录 changedObjects；没有改动代码或数据库结构。",
    simulatedActions: [
      "dispatch 识别为创建工单",
      "BP问问调用 work_order.create",
      "工具结果写入 execution_results",
      `changedObjects：${changedObjects.join("；") || "无"}`,
    ],
    toolRuns: [
      {
        toolName: toolRun.toolName,
        status: toolRun.status,
        summaryText: toolRun.summaryText,
      },
    ],
    changedObjects,
  };
}

function buildWorkOrderCreateInsight(
  insight: InsightBlock,
  toolRun: AiToolRunRecord,
): InsightBlock {
  return {
    ...insight,
    metric: "WORK ORDER CREATE",
    findings: [
      ...insight.findings,
      `已执行真实工具 ${toolRun.toolName}，结果为 ${toolRun.status}。`,
      "创建结果已进入 work_orders，并可在工单列表/总览中读取。",
    ],
    summary: `${insight.summary} ${toolRun.summaryText}`,
  };
}

function buildWorkOrderCreateAssistantText(
  userName: string,
  toolRun: AiToolRunRecord,
) {
  const workOrder = readWorkOrderFromToolRun(toolRun);
  const workOrderNo = readString(workOrder, "workOrderNo");
  const title = readString(workOrder, "title");

  if (toolRun.status === "completed" && workOrderNo) {
    return `${userName}，我已经真实创建工单 ${workOrderNo}${title ? `「${title}」` : ""}。这次写入了 work_orders，刷新工单列表就能看到。`;
  }

  return `${userName}，这次工单创建没有完成。${toolRun.summaryText}`;
}

function buildControlledWritebackExecutionPreview(params: {
  plan: BpAskControlledWritebackPlan;
  readToolRun: AiToolRunRecord | null;
  draftToolRun: AiToolRunRecord | null;
  writebackDrafts: BpAskWritebackDraft[];
}): DispatchExecutionPreview {
  const { plan, readToolRun, draftToolRun, writebackDrafts } = params;
  const readStatus = readToolRun?.status ?? "skipped";
  const draftStatus = draftToolRun?.status ?? "not_created";
  const candidateCount = plan.candidates.length;
  const draftCount = writebackDrafts.length;
  const readCompleted = readStatus === "completed";
  const draftCreated = draftToolRun?.status === "completed" && draftCount > 0;
  const toolRuns = [readToolRun, draftToolRun]
    .filter((toolRun): toolRun is AiToolRunRecord => Boolean(toolRun))
    .map((toolRun) => ({
      toolName: toolRun.toolName,
      status: toolRun.status,
      summaryText: toolRun.summaryText,
    }));

  return {
    mode: "writeback_result",
    title: draftCreated
      ? "真实执行：已创建受控写回草案"
      : readCompleted
        ? "真实执行：写回草案创建失败"
        : "真实执行：工单校验失败",
    summary: draftCreated
      ? `已为 ${plan.workOrderNo} 创建/同步 ${draftCount} 个写回草案，当前未修改任何工单业务字段。`
      : readCompleted
        ? `已校验 ${plan.workOrderNo}，但写回草案未创建成功：${draftToolRun?.summaryText ?? "缺少草案工具结果"}`
        : readToolRun?.summaryText ??
          `未能校验 ${plan.workOrderNo}，因此没有创建写回草案。`,
    nextStep: draftCreated
      ? "请先审阅草案；只有批准待写回后，才允许进入正式业务写回。"
      : "请检查工单编号、写回字段和值是否明确，再重新发起受控写回。",
    safety:
      "安全：本轮只允许把白名单字段变更落为写回草案；正式修改工单字段仍需单独批准并触发正式写回。",
    simulatedActions: [
      `工单校验：${readStatus}`,
      `候选写回：${candidateCount}`,
      `写回草案：${draftCreated ? "draft_created" : draftStatus}`,
      "业务字段：not_modified",
    ],
    toolRuns,
    writebackCandidates: plan.candidates,
    writebackDrafts,
    changedObjects: [],
  };
}

function buildControlledWritebackInsight(params: {
  insight: InsightBlock;
  plan: BpAskControlledWritebackPlan;
  readToolRun: AiToolRunRecord | null;
  draftToolRun: AiToolRunRecord | null;
  writebackDrafts: BpAskWritebackDraft[];
}): InsightBlock {
  const draftCreated =
    params.draftToolRun?.status === "completed" &&
    params.writebackDrafts.length > 0;
  const findings = [
    ...params.insight.findings,
    `已识别为工单受控写回：${params.plan.workOrderNo}。`,
    params.readToolRun
      ? `已调用 ${params.readToolRun.toolName} 校验工单，结果为 ${params.readToolRun.status}。`
      : "尚未调用工单读取工具。",
    draftCreated
      ? `已调用 work_order.writeback_draft.create 创建/同步 ${params.writebackDrafts.length} 个写回草案。`
      : "尚未完成写回草案创建。",
    "正式业务字段仍未修改，后续必须经过草案审阅和正式写回。",
  ];

  return {
    ...params.insight,
    metric: "WRITEBACK DRAFT",
    status: draftCreated ? "待审阅" : "未完成",
    findings,
    summary: draftCreated
      ? `已为 ${params.plan.workOrderNo} 创建 ${params.writebackDrafts.length} 个受控写回草案。`
      : `未能为 ${params.plan.workOrderNo} 创建受控写回草案。`,
  };
}

function buildControlledWritebackAssistantText(params: {
  userName: string;
  plan: BpAskControlledWritebackPlan;
  readToolRun: AiToolRunRecord | null;
  draftToolRun: AiToolRunRecord | null;
  writebackDrafts: BpAskWritebackDraft[];
}) {
  const draftCreated =
    params.draftToolRun?.status === "completed" &&
    params.writebackDrafts.length > 0;

  if (draftCreated) {
    const draftSummary = params.writebackDrafts
      .map((draft) => `${draft.operation} -> ${draft.proposedValue}`)
      .join("；");

    return [
      `${params.userName}，我已把 ${params.plan.workOrderNo} 的修改请求落成受控写回草案。`,
      `草案内容：${draftSummary}。`,
      `现在还没有改动工单业务字段；你需要先点“批准待写回”，再点“正式写回”，工单页面才会看到真实变化。`,
    ].join(" ");
  }

  return [
    `${params.userName}，这次工单写回没有完成。`,
    params.draftToolRun?.summaryText ??
      params.readToolRun?.summaryText ??
      "我没有拿到可创建草案的工具结果。",
    `当前没有修改任何工单业务字段。`,
  ].join(" ");
}

function buildDirectWritebackAssistantText(params: {
  userName: string;
  plan: BpAskControlledWritebackPlan;
  toolRun: AiToolRunRecord;
}) {
  const changedObjects = readChangedObjectsFromToolRun(params.toolRun);

  if (params.toolRun.status === "completed") {
    return [
      `${params.userName}，我已经直接执行了 ${params.plan.workOrderNo} 的工单修改。`,
      params.toolRun.summaryText,
      changedObjects.length
        ? `真实改变：${changedObjects.join("；")}。`
        : "这次执行完成，但字段值和原值一致，所以没有产生新的业务字段变化。",
    ].join(" ");
  }

  return [
    `${params.userName}，这次工单修改没有完成。`,
    params.toolRun.summaryText,
  ].join(" ");
}

function buildSkillExecutionPreview(skillRun: AiSkillRunRecord): DispatchExecutionPreview {
  const statusLabel =
    skillRun.status === "completed"
      ? "真实执行：已运行工单摘要 Skill"
      : skillRun.status === "not_found"
        ? "真实执行：Skill 未命中工单"
        : "真实执行：Skill 执行失败";

  return {
    mode: "skill_result",
    title: statusLabel,
    summary: skillRun.summaryText,
    nextStep:
      skillRun.status === "completed"
        ? "已把 Skill 输出写入 execution_results，并用于 BP问问本轮回复。"
        : "请检查工单编号是否正确，或换一个工单编号再试。",
    safety: "安全：本轮 Skill 只调用只读工具 work_order.read，没有修改业务对象。",
    simulatedActions: [
      "dispatch 识别为工单摘要请求",
      "BP问问调用 skill-work-order-summary",
      "Skill 内部调用 work_order.read",
      "Skill 输出写入 execution_results",
    ],
    toolRuns: skillRun.toolRuns.map((toolRun) => ({
      toolName: toolRun.toolName,
      status: toolRun.status,
      summaryText: toolRun.summaryText,
    })),
    changedObjects: skillRun.changedObjects,
  };
}

function buildSkillInsight(
  insight: InsightBlock,
  skillRun: AiSkillRunRecord,
): InsightBlock {
  const skillFinding =
    skillRun.status === "completed"
      ? `已执行真实 Skill ${skillRun.skillId}，并回收 ${skillRun.toolRuns.length} 个工具结果。`
      : `已执行真实 Skill ${skillRun.skillId}，结果为 ${skillRun.status}。`;

  return {
    ...insight,
    metric: "SKILL RUN",
    findings: [...insight.findings, skillFinding],
    summary: `${insight.summary} ${skillRun.summaryText}`,
  };
}

function buildWorkflowExecutionPreview(
  workflowRun: AiWorkflowRunRecord,
): DispatchExecutionPreview {
  const confirmationEvaluation = evaluateConfirmationRequests(
    workflowRun.output?.confirmationRequests ?? [],
  );
  const statusLabel =
    workflowRun.status === "completed"
      ? "真实执行：已运行工单受理流程"
      : workflowRun.status === "waiting_confirmation"
        ? "真实执行：已运行到人工确认"
      : workflowRun.status === "not_found"
        ? "真实执行：流程未命中工单"
        : "真实执行：流程执行失败";

  return {
    mode: "workflow_result",
    title: statusLabel,
    summary: workflowRun.summaryText,
    nextStep:
      workflowRun.status === "completed"
        ? "已把 Workflow 输出写入 execution_results，并用于 BP问问本轮回复。"
        : workflowRun.status === "waiting_confirmation"
          ? "已把确认请求和候选写回写入 execution_results；等待人工确认后再继续真实执行或业务写回。"
        : "请检查工单编号或流程入参，再重新发起。",
    safety: "安全：本轮 Workflow 运行 input -> 工单摘要 Skill -> 工单龙虾 dry-run -> 人工确认记录 -> output；确认请求只是等待态，没有调用 OpenClaw sidecar 或业务写回。",
    simulatedActions: workflowRun.nodeRuns.map(
      (nodeRun) => `${nodeRun.nodeTitle}：${nodeRun.status}`,
    ),
    agentRuns: workflowRun.agentRuns.map((agentRun) => ({
      agentId: agentRun.agentId,
      mode: agentRun.mode,
      status: agentRun.status,
      summaryText: agentRun.summaryText,
    })),
    confirmationRequests:
      workflowRun.output?.confirmationRequests.map((request) => ({
        requestId: request.requestId,
        title: request.title,
        description: request.description,
        riskLevel: request.riskLevel,
        status: request.status,
      })) ?? [],
    confirmationEvaluation,
    writebackCandidates:
      workflowRun.output?.writebackCandidates.map((candidate) => ({
        objectType: readString(candidate, "objectType"),
        objectRef: readString(candidate, "objectRef"),
        operation: readString(candidate, "operation"),
        proposedValue: readString(candidate, "proposedValue"),
        requiresConfirmation: Boolean(candidate.requiresConfirmation),
        status: readString(candidate, "status"),
      })) ?? [],
    toolRuns: workflowRun.toolRuns.map((toolRun) => ({
      toolName: toolRun.toolName,
      status: toolRun.status,
      summaryText: toolRun.summaryText,
    })),
    changedObjects: workflowRun.changedObjects,
  };
}

function buildWorkflowInsight(
  insight: InsightBlock,
  workflowRun: AiWorkflowRunRecord,
): InsightBlock {
  const workflowFinding =
    workflowRun.status === "completed"
      ? `已执行真实 Workflow ${workflowRun.workflowId}，完成 ${workflowRun.nodeRuns.length} 个节点，包含 ${workflowRun.agentRuns.length} 个龙虾 dry-run。`
      : workflowRun.status === "waiting_confirmation"
        ? `已执行真实 Workflow ${workflowRun.workflowId}，当前停在人工确认节点，等待 ${workflowRun.output?.confirmationRequests.length ?? 0} 个确认请求。`
      : `已执行真实 Workflow ${workflowRun.workflowId}，结果为 ${workflowRun.status}。`;

  return {
    ...insight,
    metric: "WORKFLOW RUN",
    findings: [...insight.findings, workflowFinding],
    summary: `${insight.summary} ${workflowRun.summaryText}`,
  };
}

function buildWorkflowAssistantText(
  userName: string,
  workflowRun: AiWorkflowRunRecord,
) {
  if (workflowRun.status === "not_found") {
    return [
      `${userName}，我尝试启动「工单受理流程」，但没有找到匹配工单。`,
      workflowRun.summaryText,
      "这次流程没有修改任何业务数据。",
    ].join("\n");
  }

  if (workflowRun.status === "failed" || !workflowRun.output) {
    return [
      `${userName}，这次「工单受理流程」没有成功完成。`,
      workflowRun.summaryText,
      "这次流程没有修改任何业务数据。",
    ].join("\n");
  }

  return [
    `${userName}，我已经把「工单受理流程」跑到人工确认节点。`,
    `流程节点：${workflowRun.nodeRuns.map((nodeRun) => nodeRun.nodeTitle).join(" -> ")}。`,
    `摘要：${workflowRun.output.summary}`,
    `工单龙虾：${workflowRun.output.agentSummary}`,
    `风险：${workflowRun.output.risks.join("；")}`,
    `待确认：${workflowRun.output.confirmationRequests.map((request) => request.title).join("；")}`,
    `候选写回：${workflowRun.output.writebackCandidates.length} 个，当前全部未应用。`,
    `建议下一步：${workflowRun.output.nextStep}`,
    `暂未进入：${workflowRun.output.skippedNodes.join("、")}。`,
    "本轮 Workflow 只生成龙虾承接预案、确认请求和候选写回，没有调用 OpenClaw sidecar，也没有修改任何业务数据。",
  ].join("\n");
}

function buildWorkOrderSummarySkillAssistantText(
  userName: string,
  skillRun: AiSkillRunRecord,
) {
  if (skillRun.status === "not_found") {
    return [
      `${userName}，我让「工单摘要 Skill」查了一遍，但没有找到匹配工单。`,
      skillRun.summaryText,
      "这次只执行了只读查询，没有修改任何业务数据。",
    ].join("\n");
  }

  if (skillRun.status === "failed" || !skillRun.output) {
    return [
      `${userName}，这次「工单摘要 Skill」没有成功完成。`,
      skillRun.summaryText,
      "这次没有修改任何业务数据。",
    ].join("\n");
  }

  return [
    `${userName}，我用「工单摘要 Skill」整理好了。`,
    `摘要：${skillRun.output.summary}`,
    `风险：${skillRun.output.risks.join("；")}`,
    `建议下一步：${skillRun.output.nextStep}`,
    "本轮 Skill 内部只调用了 work_order.read，没有修改任何业务数据。",
  ].join("\n");
}

function buildWorkOrderReadAssistantText(
  userName: string,
  toolRun: AiToolRunRecord,
) {
  const workOrder = readWorkOrderFromToolRun(toolRun);
  const query = asRecord(toolRun.structuredPayload)?.query;
  const requestedNo = readString(asRecord(query), "workOrderNo");
  const requestedId = readString(asRecord(query), "workOrderId");
  const label = requestedNo || requestedId || "这个工单";

  if (toolRun.status === "not_found") {
    return [
      `${userName}，我按「${label}」查了一遍工单真源表，没有找到匹配工单。`,
      "这次只执行了只读查询，没有修改任何业务数据。",
      "你可以换一个完整工单号再发我，比如 WO-20260401-001。",
    ].join("\n");
  }

  if (toolRun.status === "failed" || !workOrder) {
    return [
      `${userName}，我尝试读取「${label}」时没有成功。`,
      toolRun.summaryText,
      "这次没有修改任何业务数据。",
    ].join("\n");
  }

  const workOrderNo = readString(workOrder, "workOrderNo");
  const title = readString(workOrder, "title");
  const statusLabel = readString(workOrder, "statusLabel");
  const stageLabel = readString(workOrder, "stageLabel");
  const priorityLabel = readString(workOrder, "priorityLabel");
  const warningLabel = readString(workOrder, "warningLabel");
  const responsibleTeam = readString(workOrder, "currentResponsibleTeam");
  const responsibleUser = readString(workOrder, "currentResponsibleUserName");
  const completeness = readNumber(workOrder, "materialCompleteness");
  const missingCount = readNumber(workOrder, "missingItemCount");
  const blockingCount = readNumber(workOrder, "blockingItemCount");
  const progress = readString(workOrder, "latestProgressSummary");
  const nextAction = readString(workOrder, "nextAction");

  const responsibility =
    responsibleTeam || responsibleUser
      ? `${responsibleTeam || "未指定团队"}${responsibleUser ? ` / ${responsibleUser}` : ""}`
      : "暂未指定";

  return [
    `${userName}，我查到了 ${workOrderNo}${title ? `「${title}」` : ""}。`,
    `当前状态：${statusLabel || "未知"}；节点：${stageLabel || "未知"}；优先级：${priorityLabel || "未知"}；预警：${warningLabel || "未知"}。`,
    `责任归属：${responsibility}。材料完整度：${completeness ?? "未知"}%；缺项：${missingCount ?? "未知"} 个，其中阻塞项：${blockingCount ?? "未知"} 个。`,
    progress ? `最近进展：${progress}` : null,
    nextAction ? `下一步：${nextAction}` : null,
    "我这次只调用了 work_order.read 读取工单，没有修改任何业务数据。",
  ]
    .filter(Boolean)
    .join("\n");
}

function readInsight(metadata: JsonRecord) {
  const insight = metadata?.insight;
  return insight && typeof insight === "object" ? (insight as InsightBlock) : null;
}

function readPreview(metadata: JsonRecord) {
  const preview = metadata?.lastMessagePreview;
  return typeof preview === "string" ? preview : "";
}

function readExecutionPreview(metadata: JsonRecord) {
  const executionPreview = metadata?.executionPreview;
  return executionPreview && typeof executionPreview === "object"
    ? (executionPreview as DispatchExecutionPreview)
    : null;
}

function readExecutionResultId(metadata: JsonRecord) {
  return readString(metadata, "executionResultId") || undefined;
}

function mapThreadSummary(row: ThreadRow): BpAskThreadSummary {
  return {
    id: row.id,
    title: row.title,
    updatedAt: toIso(row.lastMessageAt),
    lastMessagePreview: readPreview(asRecord(row.metadata)),
    accent: pickThreadAccent(row.id),
  };
}

function mapMessage(row: MessageRow): BpAskMessage {
  return {
    id: row.id,
    role: row.role,
    text: row.content,
    createdAt: toIso(row.createdAt),
    executionResultId: readExecutionResultId(asRecord(row.metadata)),
    insight: readInsight(asRecord(row.metadata)) ?? undefined,
    executionPreview: readExecutionPreview(asRecord(row.metadata)) ?? undefined,
  };
}

function buildRollingSummary(params: {
  messages: BpAskMessage[];
  latestAssistantText?: string;
  latestInsight?: InsightBlock | null;
}) {
  if (params.messages.length === 0) {
    return null;
  }

  const recentMessages = params.messages.slice(-12);
  const latestUserMessage = [...recentMessages]
    .reverse()
    .find((message) => message.role === "user");
  const latestAssistantMessage = [...recentMessages]
    .reverse()
    .find((message) => message.role === "assistant");
  const insight = params.latestInsight ?? latestAssistantMessage?.insight ?? null;
  const assistantText =
    params.latestAssistantText ?? latestAssistantMessage?.text ?? "";

  const parts = [
    latestUserMessage ? `当前用户目标：${latestUserMessage.text}` : null,
    assistantText ? `分析结论：${assistantText}` : null,
    insight?.findings?.length
      ? `识别出的重点：${insight.findings.join("；")}`
      : null,
    insight?.summary ? `下一步建议：${insight.summary}` : null,
  ].filter(Boolean);

  return parts.join("\n");
}

async function getThreadRowForUser(user: AuthenticatedUser, threadId: string) {
  const db = getDb();
  const [thread] = await db
    .select()
    .from(conversationThreads)
    .where(
      and(
        eq(conversationThreads.id, threadId),
        eq(conversationThreads.userId, user.id),
      ),
    )
    .limit(1);

  if (!thread) {
    throw new Error("THREAD_NOT_FOUND");
  }

  return thread;
}

async function getMessagesForThread(threadId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.threadId, threadId))
    .orderBy(asc(conversationMessages.sequence));

  return rows.map(mapMessage);
}

async function getLatestRollingSummary(threadId: string) {
  const db = getDb();
  const [summary] = await db
    .select()
    .from(conversationSummaries)
    .where(
      and(
        eq(conversationSummaries.threadId, threadId),
        eq(conversationSummaries.kind, "rolling"),
      ),
    )
    .orderBy(desc(conversationSummaries.updatedAt))
    .limit(1);

  return summary?.summaryText ?? null;
}

async function getRecentMemoryFactsForUser(
  userId: string,
  threadId: string,
  limit = 8,
) {
  const db = getDb();
  return db
    .select()
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.userId, userId),
        or(
          eq(memoryFacts.threadId, threadId),
          and(eq(memoryFacts.scopeKind, "user"), eq(memoryFacts.scopeId, userId)),
        ),
      ),
    )
    .orderBy(desc(memoryFacts.updatedAt))
    .limit(limit);
}

async function replaceRollingSummary(params: {
  threadId: string;
  messages: BpAskMessage[];
  latestAssistantText?: string;
  latestInsight?: InsightBlock | null;
}) {
  const summaryText = buildRollingSummary({
    messages: params.messages,
    latestAssistantText: params.latestAssistantText,
    latestInsight: params.latestInsight,
  });

  if (!summaryText) {
    return null;
  }

  const db = getDb();
  const now = nowDate();

  await db
    .delete(conversationSummaries)
    .where(
      and(
        eq(conversationSummaries.threadId, params.threadId),
        eq(conversationSummaries.kind, "rolling"),
      ),
    );

  const [summary] = await db
    .insert(conversationSummaries)
    .values({
      id: buildStableId([params.threadId, "rolling-summary"]),
      threadId: params.threadId,
      kind: "rolling",
      summaryText,
      messageCount: params.messages.length,
      fromSequence: Math.max(1, params.messages.length - 11),
      toSequence: params.messages.length,
      metadata: {
        latestMessageId: params.messages.at(-1)?.id ?? null,
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return summary ?? null;
}

async function upsertMemoryFact(params: {
  userId: string;
  threadId: string;
  workspaceId: string | null;
  sourceMessageId: string;
  scopeKind: MemoryScopeKind;
  scopeId: string;
  factType: string;
  factKey: string;
  factValue: string;
  confidence?: number;
  metadata?: Record<string, unknown> | null;
}) {
  const db = getDb();
  const now = nowDate();
  const id = buildStableId([
    params.scopeKind,
    params.scopeId,
    params.factKey,
    "memory-fact",
  ]);

  await db
    .insert(memoryFacts)
    .values({
      id,
      userId: params.userId,
      threadId: params.threadId,
      workspaceId: params.workspaceId,
      sourceMessageId: params.sourceMessageId,
      scopeKind: params.scopeKind,
      scopeId: params.scopeId,
      factType: params.factType,
      factKey: params.factKey,
      factValue: params.factValue,
      confidence: params.confidence ?? 80,
      lastConfirmedAt: now,
      metadata: params.metadata ?? { source: "bp_ask" },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: memoryFacts.id,
      set: {
        userId: params.userId,
        threadId: params.threadId,
        workspaceId: params.workspaceId,
        sourceMessageId: params.sourceMessageId,
        factType: params.factType,
        factValue: params.factValue,
        confidence: params.confidence ?? 80,
        lastConfirmedAt: now,
        metadata: params.metadata ?? { source: "bp_ask" },
        updatedAt: now,
      },
    });
}

async function syncCoreMemoryFacts(params: {
  user: AuthenticatedUser;
  thread: ThreadRow;
  userMessageId: string;
  assistantMessageId: string;
  prompt: string;
  assistantText: string;
  decision: {
    primaryIntent: string;
    targetDomain: string;
    executionMode: string;
  };
  insight: InsightBlock;
}) {
  const base = {
    userId: params.user.id,
    threadId: params.thread.id,
    workspaceId: params.thread.workspaceId ?? null,
  };

  await Promise.all([
    upsertMemoryFact({
      ...base,
      sourceMessageId: params.userMessageId,
      scopeKind: "user",
      scopeId: params.user.id,
      factType: "goal",
      factKey: "last_user_goal",
      factValue: params.prompt,
      confidence: 84,
    }),
    upsertMemoryFact({
      ...base,
      sourceMessageId: params.userMessageId,
      scopeKind: "thread",
      scopeId: params.thread.id,
      factType: "focus",
      factKey: "current_focus",
      factValue: params.prompt,
      confidence: 82,
    }),
    upsertMemoryFact({
      ...base,
      sourceMessageId: params.assistantMessageId,
      scopeKind: "thread",
      scopeId: params.thread.id,
      factType: "dispatch",
      factKey: "last_dispatch_mode",
      factValue: `${params.decision.primaryIntent} / ${params.decision.targetDomain} / ${params.decision.executionMode}`,
      confidence: 78,
      metadata: {
        source: "bp_ask",
        findings: params.insight.findings,
      },
    }),
    upsertMemoryFact({
      ...base,
      sourceMessageId: params.assistantMessageId,
      scopeKind: "thread",
      scopeId: params.thread.id,
      factType: "assistant_summary",
      factKey: "last_assistant_summary",
      factValue: params.assistantText,
      confidence: 76,
    }),
  ]);
}

function confirmationStatusFromAction(
  action: BpAskConfirmationAction,
): BpAskConfirmationStatus {
  if (action === "approve") {
    return "approved";
  }

  return action === "reject" ? "rejected" : "deferred";
}

function confirmationActionLabel(action: BpAskConfirmationAction) {
  if (action === "approve") {
    return "同意";
  }

  return action === "reject" ? "拒绝" : "暂缓";
}

function assertWritebackDraftReviewAction(
  value: string,
): asserts value is BpAskWritebackDraftReviewAction {
  if (!["approve", "reject", "cancel"].includes(value)) {
    throw new Error("INVALID_WRITEBACK_DRAFT_ACTION");
  }
}

function writebackDraftStatusFromAction(
  action: BpAskWritebackDraftReviewAction,
): BpAskWritebackDraftReviewStatus {
  if (action === "approve") {
    return "ready";
  }

  return action === "reject" ? "rejected" : "cancelled";
}

function writebackDraftActionLabel(action: BpAskWritebackDraftReviewAction) {
  if (action === "approve") {
    return "批准待写回";
  }

  return action === "reject" ? "拒绝" : "取消";
}

function normalizeConfirmationStatus(status: string) {
  if (
    status === "approved" ||
    status === "rejected" ||
    status === "deferred" ||
    status === "waiting"
  ) {
    return status;
  }

  return "waiting";
}

function evaluateConfirmationRequests(
  requests: unknown,
): BpAskConfirmationEvaluation {
  const rows = Array.isArray(requests) ? requests : [];
  const counts = rows.reduce(
    (current, request) => {
      const status = normalizeConfirmationStatus(
        readString(asRecord(request), "status"),
      );

      return {
        ...current,
        total: current.total + 1,
        [status]: current[status] + 1,
      };
    },
    {
      total: 0,
      waiting: 0,
      approved: 0,
      rejected: 0,
      deferred: 0,
    },
  );

  if (counts.total === 0) {
    return {
      state: "not_required",
      summary: "当前没有待确认项。",
      nextStep: "无需人工确认，可以按原流程继续。",
      counts,
    };
  }

  if (counts.waiting > 0) {
    return {
      state: "waiting_confirmation",
      summary: `已记录 ${counts.approved + counts.rejected + counts.deferred}/${counts.total} 个确认结果，仍有 ${counts.waiting} 个待确认。`,
      nextStep: "继续完成剩余确认项；在全部确认前不会继续真实执行或业务写回。",
      counts,
    };
  }

  if (counts.rejected > 0) {
    return {
      state: "blocked_by_rejection",
      summary: `全部确认项已处理，其中 ${counts.rejected} 个被拒绝，流程不能继续执行原方案。`,
      nextStep: "需要调整龙虾承接预案或重新生成候选写回后再发起确认。",
      counts,
    };
  }

  if (counts.deferred > 0) {
    return {
      state: "paused_by_defer",
      summary: `全部确认项已处理，其中 ${counts.deferred} 个被暂缓，流程暂停在人工确认后。`,
      nextStep: "需要补充暂缓事项的条件或责任人，再决定是否重新确认。",
      counts,
    };
  }

  return {
    state: "ready_to_continue",
    summary: `全部 ${counts.total} 个确认项均已同意，流程具备进入下一阶段的条件。`,
    nextStep: "下一阶段可以进入续跑 dry-run；当前仍未调用 OpenClaw sidecar，也未业务写回。",
    counts,
  };
}

function findFirstWorkflowConfirmationRequests(workflowRuns: unknown) {
  if (!Array.isArray(workflowRuns)) {
    return [];
  }

  for (const workflowRun of workflowRuns) {
    const output = asRecord(asRecord(workflowRun)?.output);
    const requests = output?.confirmationRequests;

    if (Array.isArray(requests)) {
      return requests;
    }
  }

  return [];
}

function findFirstWorkflowOutput(workflowRuns: unknown) {
  if (!Array.isArray(workflowRuns)) {
    return null;
  }

  for (const workflowRun of workflowRuns) {
    const output = asRecord(asRecord(workflowRun)?.output);

    if (output) {
      return output;
    }
  }

  return null;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readWritebackCandidateRefs(candidates: unknown) {
  return readArray(candidates)
    .map((candidate) => {
      const record = asRecord(candidate);
      const objectType = readString(record, "objectType");
      const objectRef = readString(record, "objectRef");
      const operation = readString(record, "operation");

      if (!objectType || !objectRef || !operation) {
        return null;
      }

      return `${objectType}/${objectRef}/${operation}`;
    })
    .filter((value): value is string => Boolean(value));
}

function readStringArray(value: unknown) {
  return readArray(value).filter((item): item is string => typeof item === "string");
}

function upsertSimulatedActionStatus(
  actions: unknown,
  title: string,
  status: string,
) {
  const nextAction = `${title}：${status}`;
  const current = readStringArray(actions);
  let replaced = false;

  const nextActions = current.map((action) => {
    if (!action.startsWith(`${title}：`)) {
      return action;
    }

    replaced = true;
    return nextAction;
  });

  return replaced ? nextActions : [...nextActions, nextAction];
}

function updatePreviewConfirmationEvaluation(params: {
  confirmationEvaluation: unknown;
  state: string;
  summarySuffix: string;
  nextStep: string;
}) {
  const evaluation = asRecord(params.confirmationEvaluation);

  if (!evaluation) {
    return params.confirmationEvaluation;
  }

  const summary = readString(evaluation, "summary");
  const baseSummary = summary
    .replace(/\s*已完成续跑 dry-run，并生成写回草案。/g, "")
    .replace(/\s*已完成续跑 dry-run。/g, "")
    .trim();
  const nextSummary = `${baseSummary}${params.summarySuffix}`.trim();

  return {
    ...evaluation,
    state: params.state,
    summary: nextSummary,
    nextStep: params.nextStep,
  };
}

function readWritebackCandidatesFromPayload(payload: Record<string, unknown>) {
  const workflowOutput = findFirstWorkflowOutput(payload.workflowRuns);
  const writebackCandidates =
    workflowOutput?.writebackCandidates ??
    asRecord(payload.executionPreview)?.writebackCandidates;

  return readArray(writebackCandidates).filter((candidate): candidate is Record<string, unknown> =>
    Boolean(asRecord(candidate)),
  );
}

function readWritebackDraftsFromToolRun(
  toolRun: AiToolRunRecord,
): BpAskWritebackDraft[] {
  const payload = asRecord(toolRun.structuredPayload);

  return readArray(payload?.drafts)
    .map((draft): BpAskWritebackDraft | null => {
      const record = asRecord(draft);
      const draftId = readString(record, "draftId");
      const objectType = readString(record, "objectType");
      const objectRef = readString(record, "objectRef");
      const operation = readString(record, "operation");
      const proposedValue = readString(record, "proposedValue");
      const status = readString(record, "status");

      if (!draftId || !objectType || !objectRef || !operation || !proposedValue) {
        return null;
      }

      return {
        draftId,
        objectType,
        objectRef,
        operation,
        proposedValue,
        requiresConfirmation: Boolean(record?.requiresConfirmation ?? true),
        status: status || "draft",
        source: readString(record, "source") || undefined,
        createdAt: readString(record, "createdAt") || null,
        updatedAt: readString(record, "updatedAt") || null,
        reviewedAt: readString(record, "reviewedAt") || null,
        reviewedByUserName: readString(record, "reviewedByUserName") || null,
        reviewAction: readString(record, "reviewAction") || null,
        appliedAt: readString(record, "appliedAt") || null,
        appliedByUserName: readString(record, "appliedByUserName") || null,
      };
    })
    .filter((draft): draft is BpAskWritebackDraft => Boolean(draft));
}

function mapWritebackDraftRow(row: WritebackDraftRow): BpAskWritebackDraft {
  const metadata = asRecord(row.metadata);

  return {
    draftId: row.id,
    objectType: row.objectType,
    objectRef: row.objectRef,
    operation: row.operation,
    proposedValue: row.proposedValue,
    requiresConfirmation: row.requiresConfirmation,
    status: row.status,
    source: row.source,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    reviewedAt: readString(metadata, "reviewedAt") || null,
    reviewedByUserName: readString(metadata, "reviewedByUserName") || null,
    reviewAction: readString(metadata, "reviewAction") || null,
    appliedAt: readString(metadata, "appliedAt") || null,
    appliedByUserName: readString(metadata, "appliedByUserName") || null,
  };
}

function countWritebackDraftStatuses(writebackDrafts: BpAskWritebackDraft[]) {
  return writebackDrafts.reduce(
    (counts, draft) => {
      const status = draft.status as BpAskWritebackDraftReviewStatus;

      if (status === "ready") {
        counts.ready += 1;
      } else if (status === "rejected") {
        counts.rejected += 1;
      } else if (status === "cancelled") {
        counts.cancelled += 1;
      } else if (status === "applied") {
        counts.applied += 1;
      } else {
        counts.draft += 1;
      }

      return counts;
    },
    {
      draft: 0,
      ready: 0,
      rejected: 0,
      cancelled: 0,
      applied: 0,
    },
  );
}

function writebackDraftReviewState(writebackDrafts: BpAskWritebackDraft[]) {
  const counts = countWritebackDraftStatuses(writebackDrafts);

  if (counts.ready > 0 && counts.draft === 0) {
    return "ready_for_writeback";
  }

  if (counts.ready > 0) {
    return "partially_ready";
  }

  if (counts.draft > 0) {
    return "draft_reviewing";
  }

  return "draft_reviewed_closed";
}

function buildWritebackDraftReviewNextStep(writebackDrafts: BpAskWritebackDraft[]) {
  const counts = countWritebackDraftStatuses(writebackDrafts);
  const parts = [];

  if (counts.ready > 0) {
    parts.push(`${counts.ready} 个草案已批准待正式写回`);
  }

  if (counts.draft > 0) {
    parts.push(`${counts.draft} 个草案仍待审阅`);
  }

  if (counts.rejected > 0) {
    parts.push(`${counts.rejected} 个草案已拒绝`);
  }

  if (counts.cancelled > 0) {
    parts.push(`${counts.cancelled} 个草案已取消`);
  }

  return `${parts.join("；") || "草案审阅状态已更新"}。下一步只允许对 ready 草案进入正式业务写回。`;
}

function buildPostConfirmationDryRun(params: {
  payload: Record<string, unknown>;
  user: AuthenticatedUser;
  createdAt: string;
}): BpAskPostConfirmationRun {
  const workflowOutput = findFirstWorkflowOutput(params.payload.workflowRuns);
  const writebackCandidates =
    workflowOutput?.writebackCandidates ??
    asRecord(params.payload.executionPreview)?.writebackCandidates;
  const candidateRefs = readWritebackCandidateRefs(writebackCandidates);
  const evaluation = asRecord(params.payload.confirmationEvaluation);
  const approvedCount = readNumber(asRecord(evaluation?.counts), "approved") ?? 0;
  const nextStep = readString(workflowOutput, "nextStep") || "进入下一阶段执行准备。";

  return {
    runId: buildStableId([
      "post-confirmation-dry-run",
      params.createdAt,
      params.user.id,
    ]),
    mode: "dry_run",
    status: "completed",
    summaryText: `确认后续跑 dry-run 已生成：基于 ${approvedCount} 个已同意确认项，整理下一阶段执行计划；未调用 OpenClaw sidecar，未写回业务数据。`,
    planSteps: [
      "锁定已同意的确认请求，作为续跑前置条件。",
      candidateRefs.length > 0
        ? `整理 ${candidateRefs.length} 个候选写回为待执行草案：${candidateRefs.join("；")}。`
        : "当前没有候选写回，保留为只读执行准备。",
      `把下一步候选动作保留为执行草案：${nextStep}`,
      "生成 OpenClaw 输入 payload 草案，但不下发 sidecar。",
      "等待单独的真实执行开关或业务写回工具接入后再继续。",
    ],
    safeguards: [
      "未调用 OpenClaw sidecar",
      "未修改工单字段",
      "候选写回仍保持 not_applied",
      "真实执行前仍需单独触发",
    ],
    nextStep: "下一步可以审阅写回草案，再接入正式业务写回工具或真实执行开关。",
    createdAt: params.createdAt,
    createdByUserName: params.user.name,
  };
}

function assertConfirmationAction(value: string): asserts value is BpAskConfirmationAction {
  if (!["approve", "reject", "defer"].includes(value)) {
    throw new Error("INVALID_CONFIRMATION_ACTION");
  }
}

function updateConfirmationRequests(
  requests: unknown,
  params: {
    requestId: string;
    action: BpAskConfirmationAction;
    user: AuthenticatedUser;
    decidedAt: string;
  },
) {
  if (!Array.isArray(requests)) {
    return {
      requests,
      updated: false,
      updatedRequestTitle: "",
    };
  }

  let updated = false;
  let updatedRequestTitle = "";
  const status = confirmationStatusFromAction(params.action);

  const nextRequests = requests.map((request) => {
    const requestRecord = asRecord(request);

    if (readString(requestRecord, "requestId") !== params.requestId) {
      return request;
    }

    updated = true;
    updatedRequestTitle = readString(requestRecord, "title");

    return {
      ...(requestRecord ?? {}),
      status,
      decisionAction: params.action,
      decidedAt: params.decidedAt,
      decidedByUserId: params.user.id,
      decidedByUserName: params.user.name,
    };
  });

  return {
    requests: nextRequests,
    updated,
    updatedRequestTitle,
  };
}

function updateWorkflowRunsConfirmation(
  workflowRuns: unknown,
  params: {
    requestId: string;
    action: BpAskConfirmationAction;
    user: AuthenticatedUser;
    decidedAt: string;
  },
) {
  if (!Array.isArray(workflowRuns)) {
    return {
      workflowRuns,
      updated: false,
      updatedRequestTitle: "",
    };
  }

  let updated = false;
  let updatedRequestTitle = "";

  const nextWorkflowRuns = workflowRuns.map((workflowRun) => {
    const workflowRecord = asRecord(workflowRun);
    const output = asRecord(workflowRecord?.output);
    const result = updateConfirmationRequests(
      output?.confirmationRequests,
      params,
    );

    if (!result.updated) {
      return workflowRun;
    }

    updated = true;
    updatedRequestTitle = result.updatedRequestTitle;

    return {
      ...(workflowRecord ?? {}),
      output: {
        ...(output ?? {}),
        confirmationRequests: result.requests,
        confirmationEvaluation: evaluateConfirmationRequests(result.requests),
      },
    };
  });

  return {
    workflowRuns: nextWorkflowRuns,
    updated,
    updatedRequestTitle,
  };
}

function updateExecutionPreviewConfirmation(
  executionPreview: unknown,
  params: {
    requestId: string;
    action: BpAskConfirmationAction;
    user: AuthenticatedUser;
    decidedAt: string;
    updatedRequestTitle: string;
    evaluation: BpAskConfirmationEvaluation;
  },
) {
  const preview = asRecord(executionPreview);
  const result = updateConfirmationRequests(preview?.confirmationRequests, params);

  if (!result.updated) {
    return executionPreview;
  }

  const actionLabel = confirmationActionLabel(params.action);
  const readyToContinue = params.evaluation.state === "ready_to_continue";

  return {
    ...(preview ?? {}),
    confirmationRequests: result.requests,
    confirmationEvaluation: params.evaluation,
    simulatedActions: readyToContinue
      ? upsertSimulatedActionStatus(preview?.simulatedActions, "人工确认", "completed")
      : preview?.simulatedActions,
    nextStep: `已记录「${params.updatedRequestTitle || result.updatedRequestTitle}」的确认结果：${actionLabel}。${params.evaluation.nextStep}`,
    safety:
      "安全：本次只记录人工确认结果，没有调用 OpenClaw sidecar，也没有修改业务数据。",
  };
}

function updateConfirmationPayload(params: {
  payload: Record<string, unknown>;
  requestId: string;
  action: BpAskConfirmationAction;
  user: AuthenticatedUser;
  decidedAt: string;
}) {
  const workflowResult = updateWorkflowRunsConfirmation(params.payload.workflowRuns, {
    requestId: params.requestId,
    action: params.action,
    user: params.user,
    decidedAt: params.decidedAt,
  });

  if (!workflowResult.updated) {
    throw new Error("CONFIRMATION_REQUEST_NOT_FOUND");
  }

  const confirmationEvaluation = evaluateConfirmationRequests(
    findFirstWorkflowConfirmationRequests(workflowResult.workflowRuns),
  );
  const executionPreview = updateExecutionPreviewConfirmation(
    params.payload.executionPreview,
    {
      requestId: params.requestId,
      action: params.action,
      user: params.user,
      decidedAt: params.decidedAt,
      updatedRequestTitle: workflowResult.updatedRequestTitle,
      evaluation: confirmationEvaluation,
    },
  );

  const decisions = Array.isArray(params.payload.confirmationDecisions)
    ? params.payload.confirmationDecisions
    : [];

  return {
    ...params.payload,
    executionPreview,
    workflowRuns: workflowResult.workflowRuns,
    confirmationEvaluation,
    confirmationDecisions: [
      ...decisions,
      {
        requestId: params.requestId,
        action: params.action,
        status: confirmationStatusFromAction(params.action),
        title: workflowResult.updatedRequestTitle,
        decidedAt: params.decidedAt,
        decidedByUserId: params.user.id,
        decidedByUserName: params.user.name,
      },
    ],
  };
}

function updateAssistantMessageMetadata(params: {
  metadata: Record<string, unknown>;
  updatedPayload: Record<string, unknown>;
}) {
  return {
    ...params.metadata,
    insight: params.updatedPayload.insight,
    executionPreview: params.updatedPayload.executionPreview,
    workflowRuns: params.updatedPayload.workflowRuns,
    confirmationEvaluation: params.updatedPayload.confirmationEvaluation,
    confirmationDecisions: params.updatedPayload.confirmationDecisions,
    postConfirmationRun: params.updatedPayload.postConfirmationRun,
    writebackDrafts: params.updatedPayload.writebackDrafts,
    writebackDraftReview: params.updatedPayload.writebackDraftReview,
    writebackApply: params.updatedPayload.writebackApply,
    openClawRuns: params.updatedPayload.openClawRuns,
    changedObjects: params.updatedPayload.changedObjects,
    toolRuns: params.updatedPayload.toolRuns,
  };
}

function updateWorkflowRunsPostConfirmationRun(
  workflowRuns: unknown,
  postConfirmationRun: BpAskPostConfirmationRun,
) {
  if (!Array.isArray(workflowRuns)) {
    return workflowRuns;
  }

  return workflowRuns.map((workflowRun, index) => {
    if (index > 0) {
      return workflowRun;
    }

    const workflowRecord = asRecord(workflowRun);
    const output = asRecord(workflowRecord?.output);

    return {
      ...(workflowRecord ?? {}),
      output: {
        ...(output ?? {}),
        postConfirmationRun,
      },
    };
  });
}

function updateExecutionPreviewPostConfirmationRun(
  executionPreview: unknown,
  postConfirmationRun: BpAskPostConfirmationRun,
) {
  const preview = asRecord(executionPreview);
  const simulatedActions = upsertSimulatedActionStatus(
    upsertSimulatedActionStatus(preview?.simulatedActions, "人工确认", "completed"),
    "续跑 dry-run",
    postConfirmationRun.status,
  );
  const confirmationEvaluation = updatePreviewConfirmationEvaluation({
    confirmationEvaluation: preview?.confirmationEvaluation,
    state: "continued_dry_run",
    summarySuffix: " 已完成续跑 dry-run。",
    nextStep: "已完成续跑 dry-run；等待写回草案落库或正式执行开关。",
  });

  return {
    ...(preview ?? {}),
    title: "真实执行：确认后续跑 dry-run",
    postConfirmationRun,
    simulatedActions,
    confirmationEvaluation,
    nextStep: postConfirmationRun.nextStep,
    safety:
      "安全：本次只生成确认后续跑 dry-run 计划，没有调用 OpenClaw sidecar，也没有修改业务数据。",
  };
}

function updatePostConfirmationPayload(params: {
  payload: Record<string, unknown>;
  user: AuthenticatedUser;
  createdAt: string;
}) {
  const evaluation = asRecord(params.payload.confirmationEvaluation);
  const evaluationState = readString(evaluation, "state");

  if (evaluationState !== "ready_to_continue") {
    throw new Error("CONFIRMATION_NOT_READY_TO_CONTINUE");
  }

  if (asRecord(params.payload.postConfirmationRun)) {
    return params.payload;
  }

  const postConfirmationRun = buildPostConfirmationDryRun({
    payload: params.payload,
    user: params.user,
    createdAt: params.createdAt,
  });

  const workflowRuns = updateWorkflowRunsPostConfirmationRun(
    params.payload.workflowRuns,
    postConfirmationRun,
  );
  const executionPreview = updateExecutionPreviewPostConfirmationRun(
    params.payload.executionPreview,
    postConfirmationRun,
  );

  return {
    ...params.payload,
    workflowRuns,
    executionPreview,
    postConfirmationRun,
  };
}

function appendToolRun(toolRuns: unknown, toolRun: AiToolRunRecord) {
  const existing = readArray(toolRuns);
  const hasSameRun = existing.some((item) => {
    const record = asRecord(item);

    return (
      readString(record, "toolName") === toolRun.toolName &&
      readString(asRecord(record?.input), "resultId") ===
        readString(asRecord(toolRun.input), "resultId")
    );
  });

  return hasSameRun ? existing : [...existing, toolRun];
}

function updateWorkflowRunsWritebackDrafts(
  workflowRuns: unknown,
  writebackDrafts: BpAskWritebackDraft[],
) {
  if (!Array.isArray(workflowRuns)) {
    return workflowRuns;
  }

  return workflowRuns.map((workflowRun, index) => {
    if (index > 0) {
      return workflowRun;
    }

    const workflowRecord = asRecord(workflowRun);
    const output = asRecord(workflowRecord?.output);

    return {
      ...(workflowRecord ?? {}),
      output: {
        ...(output ?? {}),
        writebackDrafts,
      },
    };
  });
}

function updatePostConfirmationRunWritebackDrafts(
  postConfirmationRun: unknown,
  writebackDrafts: BpAskWritebackDraft[],
) {
  const run = asRecord(postConfirmationRun);

  if (!run || writebackDrafts.length === 0) {
    return postConfirmationRun;
  }

  const planSteps = readArray(run.planSteps).filter(
    (step): step is string => typeof step === "string",
  );
  const safeguards = readArray(run.safeguards).filter(
    (safeguard): safeguard is string => typeof safeguard === "string",
  );
  const draftStep = `已通过 work_order.writeback_draft.create 创建/同步 ${writebackDrafts.length} 个写回草案，状态保持 draft。`;
  const draftSafeguard = "写回草案只进入 execution_writeback_drafts，未写入工单业务字段";

  return {
    ...run,
    summaryText: `${readString(run, "summaryText")} 已落库 ${writebackDrafts.length} 个写回草案。`,
    planSteps: planSteps.includes(draftStep) ? planSteps : [...planSteps, draftStep],
    safeguards: safeguards.includes(draftSafeguard)
      ? safeguards
      : [...safeguards, draftSafeguard],
    nextStep: "下一步可以审阅写回草案，再接入正式业务写回工具或真实执行开关。",
  };
}

function cleanWorkflowWaitingText(text: string, writebackDraftCount: number) {
  return text
    .replace(
      /当前停在人工确认节点，等待\s*\d+\s*个确认请求。?/g,
      `已完成人工确认并生成 ${writebackDraftCount} 个写回草案。`,
    )
    .replace(
      /工单受理流程已跑到人工确认节点/g,
      "工单受理流程已完成确认后续跑",
    )
    .replace(
      /等待\s*\d+\s*个确认请求。?/g,
      "已完成全部人工确认。",
    )
    .trim();
}

function buildWritebackDraftPreviewSummary(
  preview: JsonRecord,
  writebackDraftCount: number,
) {
  const summary = readString(preview, "summary");
  const cleanedSummary = cleanWorkflowWaitingText(summary, writebackDraftCount);
  const suffix = `已生成 ${writebackDraftCount} 个写回草案。`;

  if (!cleanedSummary) {
    return suffix;
  }

  return cleanedSummary.includes(suffix)
    ? cleanedSummary
    : `${cleanedSummary} ${suffix}`;
}

function updateInsightWritebackDrafts(
  insight: unknown,
  writebackDrafts: BpAskWritebackDraft[],
) {
  const record = asRecord(insight);

  if (!record || writebackDrafts.length === 0) {
    return insight;
  }

  const draftFinding = `已完成人工确认和续跑 dry-run，并创建 ${writebackDrafts.length} 个写回草案。`;
  const findings = readStringArray(record.findings)
    .map((finding) => cleanWorkflowWaitingText(finding, writebackDrafts.length))
    .filter((finding) => finding.length > 0);
  const nextFindings = findings.some((finding) => finding.includes("写回草案"))
    ? findings
    : [...findings, draftFinding];

  return {
    ...record,
    findings: nextFindings,
    summary: cleanWorkflowWaitingText(
      readString(record, "summary"),
      writebackDrafts.length,
    ),
  };
}

function updateExecutionPreviewWritebackDrafts(params: {
  executionPreview: unknown;
  toolRun: AiToolRunRecord;
  writebackDrafts: BpAskWritebackDraft[];
}) {
  const preview = asRecord(params.executionPreview);
  const toolRuns = readArray(preview?.toolRuns);
  const hasToolPreview = toolRuns.some(
    (toolRun) =>
      readString(asRecord(toolRun), "toolName") === params.toolRun.toolName,
  );
  const draftStatus =
    params.writebackDrafts.length > 0 ? "draft_created" : "not_created";
  const simulatedActions = upsertSimulatedActionStatus(
    upsertSimulatedActionStatus(preview?.simulatedActions, "人工确认", "completed"),
    "写回草案",
    draftStatus,
  );
  const confirmationEvaluation = updatePreviewConfirmationEvaluation({
    confirmationEvaluation: preview?.confirmationEvaluation,
    state: params.writebackDrafts.length > 0 ? "draft_created" : "continued_dry_run",
    summarySuffix:
      params.writebackDrafts.length > 0
        ? " 已完成续跑 dry-run，并生成写回草案。"
        : " 已完成续跑 dry-run。",
    nextStep:
      params.writebackDrafts.length > 0
        ? `已创建 ${params.writebackDrafts.length} 个写回草案；下一步审阅草案后再决定是否正式写回。`
        : "确认后续跑 dry-run 已完成，但没有生成可落库写回草案。",
  });

  return {
    ...(preview ?? {}),
    title:
      params.writebackDrafts.length > 0
        ? "真实执行：已生成写回草案"
        : "真实执行：确认后续跑 dry-run",
    summary:
      params.writebackDrafts.length > 0
        ? buildWritebackDraftPreviewSummary(preview, params.writebackDrafts.length)
        : preview?.summary,
    postConfirmationRun: updatePostConfirmationRunWritebackDrafts(
      preview?.postConfirmationRun,
      params.writebackDrafts,
    ),
    writebackDrafts: params.writebackDrafts,
    simulatedActions,
    confirmationEvaluation,
    toolRuns: hasToolPreview
      ? toolRuns
      : [
          ...toolRuns,
          {
            toolName: params.toolRun.toolName,
            status: params.toolRun.status,
            summaryText: params.toolRun.summaryText,
          },
        ],
    nextStep:
      params.writebackDrafts.length > 0
        ? `已创建 ${params.writebackDrafts.length} 个写回草案；下一步审阅草案后再决定是否正式写回。`
        : "确认后续跑 dry-run 已完成，但没有生成可落库写回草案。",
    safety:
      "安全：本次只把候选写回落为草案记录，没有调用 OpenClaw sidecar，也没有修改业务工单字段。",
  };
}

function updateWritebackDraftPayload(params: {
  payload: Record<string, unknown>;
  toolRun: AiToolRunRecord;
  writebackDrafts: BpAskWritebackDraft[];
}) {
  const postConfirmationRun = updatePostConfirmationRunWritebackDrafts(
    params.payload.postConfirmationRun,
    params.writebackDrafts,
  );
  const workflowRuns = updateWorkflowRunsWritebackDrafts(
    params.payload.workflowRuns,
    params.writebackDrafts,
  );
  const executionPreview = updateExecutionPreviewWritebackDrafts({
    executionPreview: params.payload.executionPreview,
    toolRun: params.toolRun,
    writebackDrafts: params.writebackDrafts,
  });
  const insight = updateInsightWritebackDrafts(
    params.payload.insight,
    params.writebackDrafts,
  );

  return {
    ...params.payload,
    insight,
    workflowRuns,
    executionPreview,
    postConfirmationRun,
    writebackDrafts: params.writebackDrafts,
    toolRuns: appendToolRun(params.payload.toolRuns, params.toolRun),
  };
}

function updateWritebackDraftReviewPayload(params: {
  payload: Record<string, unknown>;
  writebackDrafts: BpAskWritebackDraft[];
  actionLabel: string;
}) {
  const reviewState = writebackDraftReviewState(params.writebackDrafts);
  const reviewNextStep = buildWritebackDraftReviewNextStep(
    params.writebackDrafts,
  );
  const executionPreview = asRecord(params.payload.executionPreview);
  const workflowRuns = updateWorkflowRunsWritebackDrafts(
    params.payload.workflowRuns,
    params.writebackDrafts,
  );
  const nextExecutionPreview = {
    ...(executionPreview ?? {}),
    title:
      reviewState === "ready_for_writeback" || reviewState === "partially_ready"
        ? "真实执行：草案已批准待写回"
        : "真实执行：草案审阅已更新",
    writebackDrafts: params.writebackDrafts,
    simulatedActions: upsertSimulatedActionStatus(
      executionPreview?.simulatedActions,
      "写回草案审阅",
      reviewState,
    ),
    nextStep: reviewNextStep,
    safety:
      "安全：本次只更新写回草案审阅状态，没有调用 OpenClaw sidecar，也没有修改业务工单字段。",
  };
  const insight = updateInsightWritebackDrafts(
    params.payload.insight,
    params.writebackDrafts,
  );

  return {
    ...params.payload,
    insight,
    workflowRuns,
    executionPreview: nextExecutionPreview,
    writebackDrafts: params.writebackDrafts,
    writebackDraftReview: {
      state: reviewState,
      actionLabel: params.actionLabel,
      counts: countWritebackDraftStatuses(params.writebackDrafts),
      nextStep: reviewNextStep,
    },
  };
}

function readWritebackDraftsFromApplyToolRun(
  toolRun: AiToolRunRecord,
): BpAskWritebackDraft[] {
  return readWritebackDraftsFromToolRun(toolRun);
}

function readChangedObjectsFromToolRun(toolRun: AiToolRunRecord) {
  const payload = asRecord(toolRun.structuredPayload);

  return readArray(payload?.changedObjects).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function mergeChangedObjects(...sources: unknown[]) {
  const merged = new Set<string>();

  sources.forEach((source) => {
    readArray(source).forEach((value) => {
      if (typeof value === "string" && value.length > 0) {
        merged.add(value);
      }
    });
  });

  return [...merged];
}

function updatePostConfirmationRunWritebackApply(params: {
  postConfirmationRun: unknown;
  writebackDrafts: BpAskWritebackDraft[];
  changedObjects: string[];
}) {
  const run = asRecord(params.postConfirmationRun);

  if (!run) {
    return params.postConfirmationRun;
  }

  const appliedCount = countWritebackDraftStatuses(params.writebackDrafts).applied;
  const planSteps = readArray(run.planSteps).filter(
    (step): step is string => typeof step === "string",
  );
  const safeguards = readArray(run.safeguards)
    .filter((safeguard): safeguard is string => typeof safeguard === "string")
    .filter(
      (safeguard) =>
        safeguard !== "未修改工单字段" &&
        safeguard !== "候选写回仍保持 not_applied",
    );
  const applyStep = `正式业务写回已单独完成：${appliedCount} 个草案 applied，${params.changedObjects.length} 个字段路径已记录。`;
  const dryRunSafeguard =
    "dry-run 阶段未调用 OpenClaw sidecar，也未直接修改工单字段";
  const applySafeguard = "正式写回仅通过 ready 草案和白名单字段执行";
  const summaryText = readString(run, "summaryText")
    .replace(/；后续正式写回已另行完成。?$/g, "")
    .replace(/。?$/g, "");

  return {
    ...run,
    summaryText: `${summaryText}；后续正式写回已另行完成。`,
    planSteps: [
      ...planSteps.filter((step) => !step.startsWith("正式业务写回已单独完成：")),
      applyStep,
    ],
    safeguards: [
      ...safeguards.filter(
        (safeguard) =>
          safeguard !== dryRunSafeguard && safeguard !== applySafeguard,
      ),
      dryRunSafeguard,
      applySafeguard,
    ],
    nextStep: "正式写回已完成；后续可以汇总最终结果或继续执行 OpenClaw。",
  };
}

function updateWritebackApplyPayload(params: {
  payload: Record<string, unknown>;
  toolRun: AiToolRunRecord;
  writebackDrafts: BpAskWritebackDraft[];
}) {
  const executionPreview = asRecord(params.payload.executionPreview);
  const changedObjects = mergeChangedObjects(
    params.payload.changedObjects,
    executionPreview?.changedObjects,
    readChangedObjectsFromToolRun(params.toolRun),
  );
  const appliedDraftCount = countWritebackDraftStatuses(params.writebackDrafts)
    .applied;
  const workflowRuns = updateWorkflowRunsWritebackDrafts(
    params.payload.workflowRuns,
    params.writebackDrafts,
  );
  const postConfirmationRun = updatePostConfirmationRunWritebackApply({
    postConfirmationRun:
      params.payload.postConfirmationRun ?? executionPreview?.postConfirmationRun,
    writebackDrafts: params.writebackDrafts,
    changedObjects,
  });
  const nextExecutionPreview = {
    ...(executionPreview ?? {}),
    title: "真实执行：已正式写回",
    postConfirmationRun,
    writebackDrafts: params.writebackDrafts,
    simulatedActions: upsertSimulatedActionStatus(
      executionPreview?.simulatedActions,
      "正式业务写回",
      params.toolRun.status === "completed" ? "applied" : params.toolRun.status,
    ),
    toolRuns: appendToolRun(executionPreview?.toolRuns, params.toolRun),
    changedObjects,
    nextStep:
      params.toolRun.status === "completed"
        ? `已正式写回 ${appliedDraftCount} 个草案，涉及 ${changedObjects.length} 个白名单字段路径；下一步可以让 BP问问汇总最终结果或继续执行 OpenClaw。`
        : "正式写回失败，请检查草案状态和白名单操作。",
    safety:
      params.toolRun.status === "completed"
        ? "安全：本次只对 ready 草案执行白名单字段写回，并已记录 changedObjects；dry-run 阶段的未改数说明不会覆盖本次正式写回结果。"
        : "安全：正式写回未完成，未确认产生业务字段修改。",
  };
  const insight = updateInsightWritebackDrafts(
    params.payload.insight,
    params.writebackDrafts,
  );

  return {
    ...params.payload,
    insight,
    workflowRuns,
    executionPreview: nextExecutionPreview,
    postConfirmationRun,
    writebackDrafts: params.writebackDrafts,
    changedObjects,
    writebackApply: {
      status: params.toolRun.status,
      summaryText: params.toolRun.summaryText,
      changedObjects,
      toolRun: params.toolRun,
    },
    toolRuns: appendToolRun(params.payload.toolRuns, params.toolRun),
  };
}

function findFirstWorkflowInput(payload: Record<string, unknown>) {
  const workflowRuns = readArray(payload.workflowRuns);
  const firstWorkflow = asRecord(workflowRuns[0]);

  return asRecord(firstWorkflow?.input);
}

function readWorkflowWorkOrderNo(payload: Record<string, unknown>) {
  return readString(findFirstWorkflowInput(payload), "workOrderNo");
}

function isOpenClawExecutionApproved(payload: Record<string, unknown>) {
  const confirmationRequests = findFirstWorkflowConfirmationRequests(
    payload.workflowRuns,
  );

  return confirmationRequests.some((request) => {
    const record = asRecord(request);

    return (
      readString(record, "requiredBefore") === "openclaw_execution" &&
      readString(record, "status") === "approved"
    );
  });
}

function readOpenClawRunFromToolRun(toolRun: AiToolRunRecord): BpAskOpenClawRun {
  const payload = asRecord(toolRun.structuredPayload);
  const submitEnabled = payload?.submitEnabled;

  return {
    agentId: readString(payload, "agentId") || "work-order-longxia",
    status: toolRun.status,
    summaryText: toolRun.summaryText,
    submitEnabled: typeof submitEnabled === "boolean" ? submitEnabled : false,
    startedAt: toolRun.startedAt,
    completedAt: toolRun.completedAt,
    errorCode: toolRun.errorCode ?? null,
  };
}

function updateOpenClawPayload(params: {
  payload: Record<string, unknown>;
  toolRun: AiToolRunRecord;
}) {
  const executionPreview = asRecord(params.payload.executionPreview);
  const openClawRun = readOpenClawRunFromToolRun(params.toolRun);
  const existingRuns = readArray(params.payload.openClawRuns).filter(
    (run): run is BpAskOpenClawRun => Boolean(asRecord(run)),
  );
  const nextRuns = [...existingRuns, openClawRun];
  const statusLabel =
    params.toolRun.status === "completed"
      ? openClawRun.submitEnabled
        ? "completed"
        : "probe_only"
      : params.toolRun.status;
  const nextExecutionPreview = {
    ...(executionPreview ?? {}),
    title:
      params.toolRun.status === "completed"
        ? "真实执行：OpenClaw sidecar 已连通"
        : "真实执行：OpenClaw sidecar 未完成",
    openClawRuns: nextRuns,
    simulatedActions: upsertSimulatedActionStatus(
      executionPreview?.simulatedActions,
      "OpenClaw sidecar",
      statusLabel,
    ),
    toolRuns: appendToolRun(executionPreview?.toolRuns, params.toolRun),
    nextStep:
      params.toolRun.status === "completed"
        ? openClawRun.submitEnabled
          ? "OpenClaw sidecar 已收到任务；下一步等待 sidecar 结果进入 artifacts 或候选写回。"
          : "OpenClaw sidecar 已连通；当前是 probe_only，开启 OPENCLAW_WORK_ORDER_SUBMIT_ENABLED 后可正式下发。"
        : "OpenClaw sidecar 未完成，请检查 gateway URL、token 权限或 openclaw profile。",
    safety:
      "安全：OpenClaw sidecar 不直接写 BPAI 业务数据；返回内容仍需进入 artifacts、候选写回或人工确认链路。",
  };

  return {
    ...params.payload,
    executionPreview: nextExecutionPreview,
    openClawRuns: nextRuns,
    toolRuns: appendToolRun(params.payload.toolRuns, params.toolRun),
  };
}

export async function listConversationThreadsForUser(
  user: AuthenticatedUser,
): Promise<BpAskThreadSummary[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversationThreads)
    .where(
      and(
        eq(conversationThreads.userId, user.id),
        eq(conversationThreads.status, "active"),
      ),
    )
    .orderBy(
      desc(conversationThreads.lastMessageAt),
      desc(conversationThreads.updatedAt),
    );

  return rows.map(mapThreadSummary);
}

export async function createConversationThreadForUser(
  user: AuthenticatedUser,
  title?: string,
) {
  const existingThreads = await listConversationThreadsForUser(user);
  const now = nowDate();
  const nextTitle =
    typeof title === "string" && title.trim()
      ? title.trim()
      : createNewThreadLabel(existingThreads.length);

  const [thread] = await getDb()
    .insert(conversationThreads)
    .values({
      id: buildId("thread"),
      userId: user.id,
      workspaceId: user.workspaceId,
      title: nextTitle,
      status: "active",
      lastMessageAt: now,
      metadata: {
        lastMessagePreview: "",
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const summary = mapThreadSummary(thread);

  return {
    summary,
    thread: {
      ...summary,
      messages: [],
      rollingSummary: null,
    } satisfies BpAskThreadDetail,
  };
}

export async function getConversationThreadDetailForUser(
  user: AuthenticatedUser,
  threadId: string,
): Promise<BpAskThreadDetail> {
  const thread = await getThreadRowForUser(user, threadId);
  const [messages, rollingSummary] = await Promise.all([
    getMessagesForThread(thread.id),
    getLatestRollingSummary(thread.id),
  ]);

  return {
    ...mapThreadSummary(thread),
    messages,
    rollingSummary,
  };
}

export async function archiveConversationThreadForUser(
  user: AuthenticatedUser,
  threadId: string,
) {
  const thread = await getThreadRowForUser(user, threadId);
  const now = nowDate();

  await getDb()
    .update(conversationThreads)
    .set({
      status: "archived",
      updatedAt: now,
      metadata: {
        ...(asRecord(thread.metadata) ?? {}),
        archivedAt: now.toISOString(),
      },
    })
    .where(eq(conversationThreads.id, thread.id));
}

export async function updateConfirmationForUser(
  user: AuthenticatedUser,
  threadId: string,
  payload: {
    executionResultId?: string;
    requestId?: string;
    action?: string;
  },
) {
  const executionResultId = payload.executionResultId?.trim();
  const requestId = payload.requestId?.trim();
  const action = payload.action?.trim() ?? "";

  if (!executionResultId || !requestId) {
    throw new Error("INVALID_CONFIRMATION_PAYLOAD");
  }

  assertConfirmationAction(action);

  const thread = await getThreadRowForUser(user, threadId);
  const db = getDb();
  const now = nowDate();
  const decidedAt = now.toISOString();

  const [resultRow] = await db
    .select()
    .from(executionResults)
    .where(eq(executionResults.id, executionResultId))
    .limit(1);

  if (!resultRow) {
    throw new Error("EXECUTION_RESULT_NOT_FOUND");
  }

  const [taskRow] = await db
    .select()
    .from(executionTasks)
    .where(
      and(
        eq(executionTasks.id, resultRow.taskId),
        eq(executionTasks.threadId, thread.id),
        eq(executionTasks.userId, user.id),
      ),
    )
    .limit(1);

  if (!taskRow) {
    throw new Error("EXECUTION_RESULT_NOT_FOUND");
  }

  const structuredPayload = asRecord(resultRow.structuredPayload);

  if (!structuredPayload) {
    throw new Error("CONFIRMATION_PAYLOAD_NOT_FOUND");
  }

  const updatedPayload = updateConfirmationPayload({
    payload: structuredPayload,
    requestId,
    action,
    user,
    decidedAt,
  });

  const updatedRequestTitle = readString(
    asRecord(
      (updatedPayload.confirmationDecisions as Array<Record<string, unknown>>).at(-1),
    ),
    "title",
  );
  const actionLabel = confirmationActionLabel(action);
  const confirmationEvaluation = updatedPayload.confirmationEvaluation as
    | BpAskConfirmationEvaluation
    | undefined;

  await db
    .update(executionResults)
    .set({
      structuredPayload: updatedPayload,
      summaryText: `${resultRow.summaryText} 已记录确认：${updatedRequestTitle} -> ${actionLabel}。${confirmationEvaluation?.summary ?? ""}`,
      updatedAt: now,
    })
    .where(eq(executionResults.id, resultRow.id));

  const messageRows = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.threadId, thread.id))
    .orderBy(asc(conversationMessages.sequence));

  const assistantMessage = messageRows.find(
    (message) =>
      readString(asRecord(message.metadata), "executionResultId") ===
      executionResultId,
  );

  if (assistantMessage) {
    await db
      .update(conversationMessages)
      .set({
        metadata: updateAssistantMessageMetadata({
          metadata: asRecord(assistantMessage.metadata) ?? {},
          updatedPayload,
        }),
        updatedAt: now,
      })
      .where(eq(conversationMessages.id, assistantMessage.id));
  }

  const lastPreview = `确认：${updatedRequestTitle} -> ${actionLabel}`;
  const [updatedThread] = await db
    .update(conversationThreads)
    .set({
      lastMessageAt: now,
      metadata: {
        ...(asRecord(thread.metadata) ?? {}),
        lastMessagePreview: previewFromText(lastPreview),
      },
      updatedAt: now,
    })
    .where(eq(conversationThreads.id, thread.id))
    .returning();

  const detail = await getConversationThreadDetailForUser(user, thread.id);

  return {
    summary: mapThreadSummary(updatedThread ?? thread),
    thread: detail,
  };
}

export async function continueWorkflowDryRunForUser(
  user: AuthenticatedUser,
  threadId: string,
  payload: {
    executionResultId?: string;
  },
) {
  const executionResultId = payload.executionResultId?.trim();

  if (!executionResultId) {
    throw new Error("INVALID_CONTINUATION_PAYLOAD");
  }

  const thread = await getThreadRowForUser(user, threadId);
  const db = getDb();
  const now = nowDate();
  const createdAt = now.toISOString();

  const [resultRow] = await db
    .select()
    .from(executionResults)
    .where(eq(executionResults.id, executionResultId))
    .limit(1);

  if (!resultRow) {
    throw new Error("EXECUTION_RESULT_NOT_FOUND");
  }

  const [taskRow] = await db
    .select()
    .from(executionTasks)
    .where(
      and(
        eq(executionTasks.id, resultRow.taskId),
        eq(executionTasks.threadId, thread.id),
        eq(executionTasks.userId, user.id),
      ),
    )
    .limit(1);

  if (!taskRow) {
    throw new Error("EXECUTION_RESULT_NOT_FOUND");
  }

  const structuredPayload = asRecord(resultRow.structuredPayload);

  if (!structuredPayload) {
    throw new Error("CONTINUATION_PAYLOAD_NOT_FOUND");
  }

  let updatedPayload = updatePostConfirmationPayload({
    payload: structuredPayload,
    user,
    createdAt,
  });
  let draftToolRun: AiToolRunRecord | null = null;
  let writebackDrafts = readArray(updatedPayload.writebackDrafts).filter(
    (draft): draft is BpAskWritebackDraft => Boolean(asRecord(draft)),
  );

  if (writebackDrafts.length === 0) {
    const candidates = readWritebackCandidatesFromPayload(updatedPayload);

    if (candidates.length > 0) {
      draftToolRun = await runAiTool(
        { user },
        {
          toolName: "work_order.writeback_draft.create",
          input: {
            taskId: taskRow.id,
            resultId: resultRow.id,
            source: "bp_ask_workflow",
            sourceRequestId: readString(
              asRecord(updatedPayload.postConfirmationRun),
              "runId",
            ),
            candidates,
          },
        },
      );
      writebackDrafts = readWritebackDraftsFromToolRun(draftToolRun);
      updatedPayload = updateWritebackDraftPayload({
        payload: updatedPayload,
        toolRun: draftToolRun,
        writebackDrafts,
      });
    }
  }

  const postConfirmationRun = asRecord(updatedPayload.postConfirmationRun);
  const summaryText = readString(postConfirmationRun, "summaryText");
  const draftSummary = draftToolRun ? ` ${draftToolRun.summaryText}` : "";

  await db
    .update(executionResults)
    .set({
      structuredPayload: updatedPayload,
      summaryText: `${resultRow.summaryText} ${summaryText}${draftSummary}`,
      updatedAt: now,
    })
    .where(eq(executionResults.id, resultRow.id));

  const messageRows = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.threadId, thread.id))
    .orderBy(asc(conversationMessages.sequence));

  const assistantMessage = messageRows.find(
    (message) =>
      readString(asRecord(message.metadata), "executionResultId") ===
      executionResultId,
  );

  if (assistantMessage) {
    await db
      .update(conversationMessages)
      .set({
        metadata: updateAssistantMessageMetadata({
          metadata: asRecord(assistantMessage.metadata) ?? {},
          updatedPayload,
        }),
        updatedAt: now,
      })
      .where(eq(conversationMessages.id, assistantMessage.id));
  }

  const lastPreview = "确认后续跑 dry-run 已生成";
  const [updatedThread] = await db
    .update(conversationThreads)
    .set({
      lastMessageAt: now,
      metadata: {
        ...(asRecord(thread.metadata) ?? {}),
        lastMessagePreview: previewFromText(lastPreview),
      },
      updatedAt: now,
    })
    .where(eq(conversationThreads.id, thread.id))
    .returning();

  const detail = await getConversationThreadDetailForUser(user, thread.id);

  return {
    summary: mapThreadSummary(updatedThread ?? thread),
    thread: detail,
  };
}

export async function reviewWritebackDraftForUser(
  user: AuthenticatedUser,
  threadId: string,
  payload: {
    executionResultId?: string;
    draftId?: string;
    action?: string;
  },
) {
  const executionResultId = payload.executionResultId?.trim();
  const draftId = payload.draftId?.trim();
  const action = payload.action?.trim() ?? "";

  if (action === "apply") {
    return applyWritebackDraftForUser(user, threadId, payload);
  }

  if (!executionResultId || !draftId) {
    throw new Error("INVALID_WRITEBACK_DRAFT_PAYLOAD");
  }

  assertWritebackDraftReviewAction(action);

  const thread = await getThreadRowForUser(user, threadId);
  const db = getDb();
  const now = nowDate();
  const reviewedAt = now.toISOString();
  const nextStatus = writebackDraftStatusFromAction(action);
  const actionLabel = writebackDraftActionLabel(action);

  const [resultRow] = await db
    .select()
    .from(executionResults)
    .where(eq(executionResults.id, executionResultId))
    .limit(1);

  if (!resultRow) {
    throw new Error("EXECUTION_RESULT_NOT_FOUND");
  }

  const [taskRow] = await db
    .select()
    .from(executionTasks)
    .where(
      and(
        eq(executionTasks.id, resultRow.taskId),
        eq(executionTasks.threadId, thread.id),
        eq(executionTasks.userId, user.id),
      ),
    )
    .limit(1);

  if (!taskRow) {
    throw new Error("EXECUTION_RESULT_NOT_FOUND");
  }

  const structuredPayload = asRecord(resultRow.structuredPayload);

  if (!structuredPayload) {
    throw new Error("WRITEBACK_DRAFT_PAYLOAD_NOT_FOUND");
  }

  const [draftRow] = await db
    .select()
    .from(executionWritebackDrafts)
    .where(
      and(
        eq(executionWritebackDrafts.id, draftId),
        eq(executionWritebackDrafts.resultId, resultRow.id),
        eq(executionWritebackDrafts.userId, user.id),
      ),
    )
    .limit(1);

  if (!draftRow) {
    throw new Error("WRITEBACK_DRAFT_NOT_FOUND");
  }

  if (draftRow.status === "applied") {
    throw new Error("WRITEBACK_DRAFT_ALREADY_APPLIED");
  }

  await db
    .update(executionWritebackDrafts)
    .set({
      status: nextStatus,
      metadata: {
        ...(asRecord(draftRow.metadata) ?? {}),
        reviewAction: action,
        reviewActionLabel: actionLabel,
        reviewedAt,
        reviewedByUserId: user.id,
        reviewedByUserName: user.name,
        approvedForBusinessWriteback: nextStatus === "ready",
        businessWritebackApplied: false,
      },
      updatedAt: now,
    })
    .where(eq(executionWritebackDrafts.id, draftRow.id));

  const writebackDraftRows = await db
    .select()
    .from(executionWritebackDrafts)
    .where(eq(executionWritebackDrafts.resultId, resultRow.id))
    .orderBy(asc(executionWritebackDrafts.operation));
  const writebackDrafts = writebackDraftRows.map(mapWritebackDraftRow);
  const updatedPayload = updateWritebackDraftReviewPayload({
    payload: structuredPayload,
    writebackDrafts,
    actionLabel,
  });

  await db
    .update(executionResults)
    .set({
      structuredPayload: updatedPayload,
      summaryText: `${resultRow.summaryText} 已审阅写回草案：${draftRow.operation} -> ${actionLabel}。`,
      updatedAt: now,
    })
    .where(eq(executionResults.id, resultRow.id));

  const messageRows = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.threadId, thread.id))
    .orderBy(asc(conversationMessages.sequence));

  const assistantMessage = messageRows.find(
    (message) =>
      readString(asRecord(message.metadata), "executionResultId") ===
      executionResultId,
  );

  if (assistantMessage) {
    await db
      .update(conversationMessages)
      .set({
        metadata: updateAssistantMessageMetadata({
          metadata: asRecord(assistantMessage.metadata) ?? {},
          updatedPayload,
        }),
        updatedAt: now,
      })
      .where(eq(conversationMessages.id, assistantMessage.id));
  }

  const lastPreview = `写回草案：${draftRow.operation} -> ${actionLabel}`;
  const [updatedThread] = await db
    .update(conversationThreads)
    .set({
      lastMessageAt: now,
      metadata: {
        ...(asRecord(thread.metadata) ?? {}),
        lastMessagePreview: previewFromText(lastPreview),
      },
      updatedAt: now,
    })
    .where(eq(conversationThreads.id, thread.id))
    .returning();

  const detail = await getConversationThreadDetailForUser(user, thread.id);

  return {
    summary: mapThreadSummary(updatedThread ?? thread),
    thread: detail,
  };
}

export async function applyWritebackDraftForUser(
  user: AuthenticatedUser,
  threadId: string,
  payload: {
    executionResultId?: string;
    draftId?: string;
  },
) {
  const executionResultId = payload.executionResultId?.trim();
  const draftId = payload.draftId?.trim();

  if (!executionResultId || !draftId) {
    throw new Error("INVALID_WRITEBACK_APPLY_PAYLOAD");
  }

  const thread = await getThreadRowForUser(user, threadId);
  const db = getDb();
  const now = nowDate();

  const [resultRow] = await db
    .select()
    .from(executionResults)
    .where(eq(executionResults.id, executionResultId))
    .limit(1);

  if (!resultRow) {
    throw new Error("EXECUTION_RESULT_NOT_FOUND");
  }

  const [taskRow] = await db
    .select()
    .from(executionTasks)
    .where(
      and(
        eq(executionTasks.id, resultRow.taskId),
        eq(executionTasks.threadId, thread.id),
        eq(executionTasks.userId, user.id),
      ),
    )
    .limit(1);

  if (!taskRow) {
    throw new Error("EXECUTION_RESULT_NOT_FOUND");
  }

  const structuredPayload = asRecord(resultRow.structuredPayload);

  if (!structuredPayload) {
    throw new Error("WRITEBACK_APPLY_PAYLOAD_NOT_FOUND");
  }

  const [draftRow] = await db
    .select()
    .from(executionWritebackDrafts)
    .where(
      and(
        eq(executionWritebackDrafts.id, draftId),
        eq(executionWritebackDrafts.resultId, resultRow.id),
        eq(executionWritebackDrafts.userId, user.id),
      ),
    )
    .limit(1);

  if (!draftRow) {
    throw new Error("WRITEBACK_DRAFT_NOT_FOUND");
  }

  if (draftRow.status !== "ready") {
    throw new Error("WRITEBACK_DRAFT_NOT_READY");
  }

  const toolRun = await runAiTool(
    { user },
    {
      toolName: "work_order.writeback.apply",
      input: {
        taskId: taskRow.id,
        resultId: resultRow.id,
        draftIds: [draftRow.id],
      },
    },
  );

  if (toolRun.status !== "completed") {
    throw new Error(toolRun.errorCode ?? "WRITEBACK_APPLY_FAILED");
  }

  const writebackDrafts = readWritebackDraftsFromApplyToolRun(toolRun);
  const updatedPayload = updateWritebackApplyPayload({
    payload: structuredPayload,
    toolRun,
    writebackDrafts,
  });
  const changedObjects = readChangedObjectsFromToolRun(toolRun);

  await db
    .update(executionResults)
    .set({
      structuredPayload: updatedPayload,
      summaryText: `${resultRow.summaryText} ${toolRun.summaryText}`,
      updatedAt: now,
    })
    .where(eq(executionResults.id, resultRow.id));

  const messageRows = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.threadId, thread.id))
    .orderBy(asc(conversationMessages.sequence));

  const assistantMessage = messageRows.find(
    (message) =>
      readString(asRecord(message.metadata), "executionResultId") ===
      executionResultId,
  );

  if (assistantMessage) {
    await db
      .update(conversationMessages)
      .set({
        metadata: updateAssistantMessageMetadata({
          metadata: asRecord(assistantMessage.metadata) ?? {},
          updatedPayload,
        }),
        updatedAt: now,
      })
      .where(eq(conversationMessages.id, assistantMessage.id));
  }

  const lastPreview = `正式写回：${changedObjects.join("；") || draftRow.operation}`;
  const [updatedThread] = await db
    .update(conversationThreads)
    .set({
      lastMessageAt: now,
      metadata: {
        ...(asRecord(thread.metadata) ?? {}),
        lastMessagePreview: previewFromText(lastPreview),
      },
      updatedAt: now,
    })
    .where(eq(conversationThreads.id, thread.id))
    .returning();

  const detail = await getConversationThreadDetailForUser(user, thread.id);

  return {
    summary: mapThreadSummary(updatedThread ?? thread),
    thread: detail,
  };
}

export async function runOpenClawForUser(
  user: AuthenticatedUser,
  threadId: string,
  payload: {
    executionResultId?: string;
  },
) {
  const executionResultId = payload.executionResultId?.trim();

  if (!executionResultId) {
    throw new Error("INVALID_OPENCLAW_PAYLOAD");
  }

  const thread = await getThreadRowForUser(user, threadId);
  const db = getDb();
  const now = nowDate();

  const [resultRow] = await db
    .select()
    .from(executionResults)
    .where(eq(executionResults.id, executionResultId))
    .limit(1);

  if (!resultRow) {
    throw new Error("EXECUTION_RESULT_NOT_FOUND");
  }

  const [taskRow] = await db
    .select()
    .from(executionTasks)
    .where(
      and(
        eq(executionTasks.id, resultRow.taskId),
        eq(executionTasks.threadId, thread.id),
        eq(executionTasks.userId, user.id),
      ),
    )
    .limit(1);

  if (!taskRow) {
    throw new Error("EXECUTION_RESULT_NOT_FOUND");
  }

  const structuredPayload = asRecord(resultRow.structuredPayload);

  if (!structuredPayload) {
    throw new Error("OPENCLAW_PAYLOAD_NOT_FOUND");
  }

  if (!isOpenClawExecutionApproved(structuredPayload)) {
    throw new Error("OPENCLAW_CONFIRMATION_REQUIRED");
  }

  const workOrderNo = readWorkflowWorkOrderNo(structuredPayload);

  if (!workOrderNo) {
    throw new Error("OPENCLAW_WORK_ORDER_NOT_FOUND");
  }

  const toolRun = await runAiTool(
    { user },
    {
      toolName: "openclaw.work_order.execute",
      input: {
        taskId: taskRow.id,
        resultId: resultRow.id,
        workOrderNo,
        workflowId: readString(asRecord(taskRow.metadata), "workflowId") ||
          "workflow-work-order-intake",
        payload: {
          executionResultId: resultRow.id,
          workOrderNo,
          workflowRuns: structuredPayload.workflowRuns,
          postConfirmationRun: structuredPayload.postConfirmationRun,
          writebackDrafts: structuredPayload.writebackDrafts,
          changedObjects: structuredPayload.changedObjects,
        },
      },
    },
  );

  const updatedPayload = updateOpenClawPayload({
    payload: structuredPayload,
    toolRun,
  });

  await db
    .update(executionResults)
    .set({
      structuredPayload: updatedPayload,
      summaryText: `${resultRow.summaryText} ${toolRun.summaryText}`,
      updatedAt: now,
    })
    .where(eq(executionResults.id, resultRow.id));

  const messageRows = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.threadId, thread.id))
    .orderBy(asc(conversationMessages.sequence));

  const assistantMessage = messageRows.find(
    (message) =>
      readString(asRecord(message.metadata), "executionResultId") ===
      executionResultId,
  );

  if (assistantMessage) {
    await db
      .update(conversationMessages)
      .set({
        metadata: updateAssistantMessageMetadata({
          metadata: asRecord(assistantMessage.metadata) ?? {},
          updatedPayload,
        }),
        updatedAt: now,
      })
      .where(eq(conversationMessages.id, assistantMessage.id));
  }

  const lastPreview = `OpenClaw sidecar：${toolRun.status}`;
  const [updatedThread] = await db
    .update(conversationThreads)
    .set({
      lastMessageAt: now,
      metadata: {
        ...(asRecord(thread.metadata) ?? {}),
        lastMessagePreview: previewFromText(lastPreview),
      },
      updatedAt: now,
    })
    .where(eq(conversationThreads.id, thread.id))
    .returning();

  const detail = await getConversationThreadDetailForUser(user, thread.id);

  return {
    summary: mapThreadSummary(updatedThread ?? thread),
    thread: detail,
  };
}

function isNaturalOpenClawCommand(prompt: string) {
  const lower = prompt.toLowerCase();

  return (
    lower.includes("openclaw") &&
    /继续|执行|下发|提交|发送|发给|交给|启动|跑|sidecar/.test(prompt)
  );
}

function extractWorkOrderNoFromPrompt(prompt: string) {
  const matched = prompt.match(/\bWO-\d{8}-\d{3}\b/i);

  return matched?.[0]?.toUpperCase() ?? "";
}

async function findLatestOpenClawExecutionResultIdForPrompt(params: {
  user: AuthenticatedUser;
  thread: ThreadRow;
  prompt: string;
}) {
  const targetWorkOrderNo = extractWorkOrderNoFromPrompt(params.prompt);
  const db = getDb();
  const taskRows = await db
    .select()
    .from(executionTasks)
    .where(
      and(
        eq(executionTasks.threadId, params.thread.id),
        eq(executionTasks.userId, params.user.id),
      ),
    )
    .orderBy(desc(executionTasks.updatedAt))
    .limit(20);

  for (const taskRow of taskRows) {
    const resultRows = await db
      .select()
      .from(executionResults)
      .where(eq(executionResults.taskId, taskRow.id))
      .orderBy(desc(executionResults.updatedAt))
      .limit(5);

    for (const resultRow of resultRows) {
      const structuredPayload = asRecord(resultRow.structuredPayload);

      if (!structuredPayload || !isOpenClawExecutionApproved(structuredPayload)) {
        continue;
      }

      const payloadWorkOrderNo = readWorkflowWorkOrderNo(structuredPayload);

      if (
        targetWorkOrderNo &&
        payloadWorkOrderNo &&
        payloadWorkOrderNo.toUpperCase() !== targetWorkOrderNo
      ) {
        continue;
      }

      return resultRow.id;
    }
  }

  return null;
}

function buildNaturalOpenClawAssistantText(params: {
  userName: string;
  executionPreview?: DispatchExecutionPreview;
  errorCode?: string;
}) {
  if (params.errorCode) {
    const reason =
      params.errorCode === "OPENCLAW_CONFIRMATION_REQUIRED"
        ? "当前 workflow 还没有完成 OpenClaw 前置人工确认。"
        : params.errorCode === "OPENCLAW_WORK_ORDER_NOT_FOUND"
          ? "当前 workflow 结果里没有可下发的工单编号。"
          : params.errorCode === "NATURAL_OPENCLAW_RESULT_NOT_FOUND"
            ? "我没有在当前对话里找到已经通过确认、可继续 OpenClaw 的工单受理流程。"
            : `OpenClaw 执行没有完成，错误码：${params.errorCode}。`;

    return [
      `${params.userName}，这句我已经识别成“继续 OpenClaw 执行”。`,
      reason,
      "你可以先在这条对话里跑完工单受理流程、完成全部人工确认和草案写回，再继续下发 OpenClaw。",
    ].join("\n");
  }

  const openClawRuns = params.executionPreview?.openClawRuns ?? [];
  const latestRun = openClawRuns.at(-1);
  const submitMode = latestRun?.submitEnabled ? "submitted" : "probe_only";
  const status = latestRun?.status ?? "unknown";

  return [
    `${params.userName}，我已经按这句话继续执行 OpenClaw sidecar。`,
    `OpenClaw 状态：${status}；下发模式：${submitMode}。`,
    latestRun?.summaryText ?? "OpenClaw 已执行，但当前没有返回额外摘要。",
    "安全边界：OpenClaw sidecar 不直接写 BPAI 业务数据，后续结果仍要回到 artifacts、候选写回或人工确认链路。",
  ].join("\n");
}

async function appendNaturalOpenClawAssistantMessage(params: {
  user: AuthenticatedUser;
  thread: ThreadRow;
  prompt: string;
  userMessageId: string;
  currentSequence: number;
  executionResultId?: string;
  executionPreview?: DispatchExecutionPreview;
  insight?: InsightBlock;
  errorCode?: string;
}) {
  const db = getDb();
  const now = nowDate();
  const assistantText = buildNaturalOpenClawAssistantText({
    userName: params.user.name,
    executionPreview: params.executionPreview,
    errorCode: params.errorCode,
  });
  const assistantMessageId = buildId("message-assistant");

  const [assistantMessageRow] = await db
    .insert(conversationMessages)
    .values({
      id: assistantMessageId,
      threadId: params.thread.id,
      role: "assistant",
      sequence: params.currentSequence + 2,
      content: assistantText,
      tokenEstimate: estimateTokenCount(assistantText),
      metadata: {
        insight: params.insight ?? null,
        executionPreview: params.executionPreview ?? null,
        executionResultId: params.executionResultId ?? null,
        executionRoute: params.executionResultId ? "workflow" : "dispatch_plan",
        naturalAction: "openclaw_continue",
        errorCode: params.errorCode ?? null,
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const nextTitle =
    params.currentSequence === 0
      ? threadTitleFromPrompt(params.prompt)
      : params.thread.title;
  const lastPreview = params.errorCode
    ? "OpenClaw sidecar 未完成"
    : "OpenClaw sidecar 已继续执行";

  const [updatedThread] = await db
    .update(conversationThreads)
    .set({
      title: nextTitle,
      lastMessageAt: now,
      metadata: {
        ...(asRecord(params.thread.metadata) ?? {}),
        lastMessagePreview: previewFromText(lastPreview),
      },
      updatedAt: now,
    })
    .where(eq(conversationThreads.id, params.thread.id))
    .returning();

  const messages = await getMessagesForThread(params.thread.id);
  const rollingSummaryRow = await replaceRollingSummary({
    threadId: params.thread.id,
    messages,
    latestAssistantText: assistantText,
    latestInsight: params.insight ?? null,
  });

  await upsertMemoryFact({
    userId: params.user.id,
    threadId: params.thread.id,
    workspaceId: params.thread.workspaceId ?? null,
    sourceMessageId: params.userMessageId,
    scopeKind: "thread",
    scopeId: params.thread.id,
    factType: "action",
    factKey: "last_openclaw_action",
    factValue: assistantText,
    confidence: params.errorCode ? 66 : 86,
    metadata: {
      source: "bp_ask",
      assistantMessageId: assistantMessageRow.id,
      executionResultId: params.executionResultId ?? null,
    },
  });

  const summary = mapThreadSummary(updatedThread ?? params.thread);

  return {
    summary,
    thread: {
      ...summary,
      messages,
      rollingSummary: rollingSummaryRow?.summaryText ?? null,
    } satisfies BpAskThreadDetail,
  };
}

async function handleNaturalOpenClawCommand(params: {
  user: AuthenticatedUser;
  thread: ThreadRow;
  prompt: string;
  userMessageId: string;
  currentSequence: number;
}) {
  if (!isNaturalOpenClawCommand(params.prompt)) {
    return null;
  }

  const executionResultId = await findLatestOpenClawExecutionResultIdForPrompt({
    user: params.user,
    thread: params.thread,
    prompt: params.prompt,
  });

  if (!executionResultId) {
    return appendNaturalOpenClawAssistantMessage({
      ...params,
      errorCode: "NATURAL_OPENCLAW_RESULT_NOT_FOUND",
    });
  }

  try {
    const result = await runOpenClawForUser(params.user, params.thread.id, {
      executionResultId,
    });
    const sourceMessage = result.thread.messages.find(
      (message) => message.executionResultId === executionResultId,
    );

    return appendNaturalOpenClawAssistantMessage({
      ...params,
      executionResultId,
      executionPreview: sourceMessage?.executionPreview,
      insight: sourceMessage?.insight,
    });
  } catch (error) {
    return appendNaturalOpenClawAssistantMessage({
      ...params,
      executionResultId,
      errorCode: error instanceof Error ? error.message : "OPENCLAW_FAILED",
    });
  }
}

export async function previewDispatchForUser(
  user: AuthenticatedUser,
  prompt: string,
  threadId?: string,
) {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    throw new Error("INVALID_PROMPT");
  }

  let rollingSummary: string | null = null;
  let recentMessages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    text: string;
  }> = [];
  let recentFacts: Array<{
    factType: string;
    factKey: string;
    factValue: string;
  }> = [];

  if (threadId) {
    const thread = await getThreadRowForUser(user, threadId);
    const [messages, summaryText, memoryRows] = await Promise.all([
      getMessagesForThread(thread.id),
      getLatestRollingSummary(thread.id),
      getRecentMemoryFactsForUser(user.id, thread.id),
    ]);

    rollingSummary = summaryText;
    recentMessages = messages.slice(-8).map((message) => ({
      role: message.role,
      text: message.text,
    }));
    recentFacts = memoryRows.map((fact) => ({
      factType: fact.factType,
      factKey: fact.factKey,
      factValue: fact.factValue,
    }));
  }

  return dispatchBpAskPrompt({
    user,
    prompt: normalizedPrompt,
    rollingSummary,
    recentMessages,
    memoryFacts: recentFacts,
  });
}

export async function appendMessageToThreadForUser(
  user: AuthenticatedUser,
  threadId: string,
  prompt: string,
) {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    throw new Error("INVALID_PROMPT");
  }

  const thread = await getThreadRowForUser(user, threadId);
  const db = getDb();

  const [lastMessage] = await db
    .select({ sequence: conversationMessages.sequence })
    .from(conversationMessages)
    .where(eq(conversationMessages.threadId, thread.id))
    .orderBy(desc(conversationMessages.sequence))
    .limit(1);

  const currentSequence = lastMessage?.sequence ?? 0;
  const now = nowDate();

  const userMessageId = buildId("message-user");
  const [userMessageRow] = await db
    .insert(conversationMessages)
    .values({
      id: userMessageId,
      threadId: thread.id,
      role: "user",
      sequence: currentSequence + 1,
      content: normalizedPrompt,
      tokenEstimate: estimateTokenCount(normalizedPrompt),
      metadata: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const naturalOpenClawResult = await handleNaturalOpenClawCommand({
    user,
    thread,
    prompt: normalizedPrompt,
    userMessageId: userMessageRow.id,
    currentSequence,
  });

  if (naturalOpenClawResult) {
    return naturalOpenClawResult;
  }

  const recentMemoryRows = await getRecentMemoryFactsForUser(user.id, thread.id);
  const recentMessages = await getMessagesForThread(thread.id);
  const rollingSummary = await getLatestRollingSummary(thread.id);
  const recentDispatchMessages = recentMessages.slice(-8).map((message) => ({
    role: message.role,
    text: message.text,
  }));
  const recentDispatchFacts = recentMemoryRows.map((fact) => ({
    factType: fact.factType,
    factKey: fact.factKey,
    factValue: fact.factValue,
  }));
  const dispatch = await dispatchBpAskPrompt({
    user,
    prompt: normalizedPrompt,
    rollingSummary,
    recentMessages: recentDispatchMessages,
    memoryFacts: recentDispatchFacts,
  });

  let modelToolPlan: ModelWorkOrderToolPlan | null = null;
  let modelToolPlannerAttempted = false;
  let modelToolPlannerError: string | null = null;

  if (shouldTryModelWorkOrderToolPlanner(dispatch.decision, normalizedPrompt)) {
    modelToolPlannerAttempted = true;

    try {
      modelToolPlan = await planWorkOrderToolWithModel({
        prompt: normalizedPrompt,
        rollingSummary,
        recentMessages: recentDispatchMessages.map(
          (message) => `${message.role}: ${message.text}`,
        ),
        memoryFacts: recentDispatchFacts.map(
          (fact) => `${fact.factType}.${fact.factKey}: ${fact.factValue}`,
        ),
        dispatchDecision: dispatch.decision,
      });
    } catch (error) {
      modelToolPlannerError =
        error instanceof Error ? error.message : "MODEL_TOOL_PLANNER_FAILED";
    }
  }

  let assistantText = dispatch.assistantText;
  let insight = dispatch.insight;
  let executionPreview = dispatch.executionPreview;
  const stepPlannerWorkOrderNo = await resolveWorkOrderNoForPrompt(
    dispatch.decision,
    normalizedPrompt,
  );
  const stepPlannerPlan = buildWorkOrderStepPlannerPlan(
    dispatch.decision,
    normalizedPrompt,
    stepPlannerWorkOrderNo,
  );
  const executionPlan = stepPlannerPlan
    ? ({ route: "writeback_draft", writebackPlan: { workOrderNo: stepPlannerPlan.workOrderNo, candidates: stepPlannerPlan.candidates, directApply: true } } satisfies BpAskExecutionPlan)
    : planBpAskExecution(
        dispatch.decision,
        normalizedPrompt,
        modelToolPlan,
      );
  const modelToolPlanUsed = executionPlan.modelToolPlan === modelToolPlan && Boolean(modelToolPlan);
  let directToolRun: AiToolRunRecord | null = null;
  let writebackDraftToolRun: AiToolRunRecord | null = null;
  let writebackApplyToolRun: AiToolRunRecord | null = null;
  let writebackDrafts: BpAskWritebackDraft[] = [];
  let skillRun: AiSkillRunRecord | null = null;
  let workflowRun: AiWorkflowRunRecord | null = null;
  const executionRoute: BpAskExecutionRoute = executionPlan.route;
  let taskStatus: "planned" | "delegated" | "completed" | "failed" =
    dispatch.decision.suggestedExecutor === "longxia" ? "delegated" : "planned";
  let resultStatus: "ready" | "failed" = "ready";

  if (executionPlan.route === "writeback_draft" && executionPlan.writebackPlan) {
    directToolRun = await runAiTool(
      { user },
      {
        toolName: "work_order.read",
        input: {
          workOrderNo: executionPlan.writebackPlan.workOrderNo,
        },
      },
    );
    taskStatus = directToolRun.status === "completed" ? "planned" : "failed";
    resultStatus = directToolRun.status === "completed" ? "ready" : "failed";
    executionPreview = buildControlledWritebackExecutionPreview({
      plan: executionPlan.writebackPlan,
      readToolRun: directToolRun,
      draftToolRun: null,
      writebackDrafts: [],
    });
    insight = buildControlledWritebackInsight({
      insight: dispatch.insight,
      plan: executionPlan.writebackPlan,
      readToolRun: directToolRun,
      draftToolRun: null,
      writebackDrafts: [],
    });
    assistantText = buildControlledWritebackAssistantText({
      userName: user.name,
      plan: executionPlan.writebackPlan,
      readToolRun: directToolRun,
      draftToolRun: null,
      writebackDrafts: [],
    });
  } else if (
    executionPlan.route === "work_order_create" &&
    executionPlan.createPlan
  ) {
    directToolRun = await runAiTool(
      { user },
      {
        toolName: "work_order.create",
        input: {
          ...executionPlan.createPlan,
          sourcePrompt: normalizedPrompt,
        },
      },
    );
    taskStatus = directToolRun.status === "failed" ? "failed" : "completed";
    resultStatus = directToolRun.status === "failed" ? "failed" : "ready";
    executionPreview = buildWorkOrderCreateExecutionPreview(directToolRun);
    insight = buildWorkOrderCreateInsight(dispatch.insight, directToolRun);
    assistantText = buildWorkOrderCreateAssistantText(user.name, directToolRun);
  } else if (executionPlan.route === "workflow" && executionPlan.workflowId) {
    workflowRun = await runAiWorkflow(
      { user },
      {
        workflowId: executionPlan.workflowId,
        input: {
          workOrderNo: readTargetWorkOrderNo(dispatch.decision),
        },
      },
    );
    taskStatus = workflowRun.status === "failed" ? "failed" : "completed";
    resultStatus = workflowRun.status === "failed" ? "failed" : "ready";
    executionPreview = buildWorkflowExecutionPreview(workflowRun);
    insight = buildWorkflowInsight(dispatch.insight, workflowRun);
    assistantText = buildWorkflowAssistantText(user.name, workflowRun);
  } else if (executionPlan.route === "skill" && executionPlan.skillId) {
    skillRun = await runAiSkill(
      { user },
      {
        skillId: executionPlan.skillId,
        input: {
          workOrderNo: readTargetWorkOrderNo(dispatch.decision),
        },
      },
    );
    taskStatus = skillRun.status === "failed" ? "failed" : "completed";
    resultStatus = skillRun.status === "failed" ? "failed" : "ready";
    executionPreview = buildSkillExecutionPreview(skillRun);
    insight = buildSkillInsight(dispatch.insight, skillRun);
    assistantText = buildWorkOrderSummarySkillAssistantText(user.name, skillRun);
  } else if (executionPlan.route === "direct_tool" && executionPlan.toolName) {
    const directToolWorkOrderNo =
      executionPlan.directToolInput?.workOrderNo ||
      readTargetWorkOrderNo(dispatch.decision);

    if (directToolWorkOrderNo) {
      directToolRun = await runAiTool(
        { user },
        {
          toolName: executionPlan.toolName,
          input: {
            workOrderNo: directToolWorkOrderNo,
          },
        },
      );
      taskStatus = directToolRun.status === "failed" ? "failed" : "completed";
      resultStatus = directToolRun.status === "failed" ? "failed" : "ready";
      executionPreview = buildDirectToolExecutionPreview(directToolRun);
      insight = buildDirectToolInsight(dispatch.insight, directToolRun);
      assistantText = buildWorkOrderReadAssistantText(user.name, directToolRun);
    }
  }

  const executionTaskId = buildId("exec-task");
  const executionResultId = buildId("exec-result");

  await db.insert(executionTasks).values({
    id: executionTaskId,
    userId: user.id,
    threadId: thread.id,
    workspaceId: thread.workspaceId ?? null,
    sourceMessageId: userMessageId,
    status: taskStatus,
    executorKind:
      executionRoute === "direct_tool" || executionRoute === "skill"
        ? "bp_ask"
        : executionRoute === "workflow" ||
            executionRoute === "writeback_draft" ||
            executionRoute === "work_order_create"
          ? "system"
        : dispatch.decision.suggestedExecutor,
    primaryIntent: dispatch.decision.primaryIntent,
    targetDomain: dispatch.decision.targetDomain,
    executionMode: dispatch.decision.executionMode,
    goal: normalizedPrompt,
    confidence: dispatch.decision.confidence,
    needsMemory: dispatch.decision.needsMemory,
    needsTools: dispatch.decision.needsTools,
    requiresWrite: dispatch.decision.requiresWrite,
    requiresConfirmation: dispatch.decision.requiresConfirmation,
    targetRefs: dispatch.decision.targetRefs,
    constraints: dispatch.decision.constraints,
    metadata: {
      expectedOutput: dispatch.decision.expectedOutput,
      reason: dispatch.decision.reason,
      priority: dispatch.decision.priority,
      toolHints: dispatch.decision.toolHints,
      memoryScopes: dispatch.decision.memoryScopes,
      followupQuestion: dispatch.decision.followupQuestion,
      executionRoute,
      directToolName: directToolRun?.toolName ?? null,
      directToolStatus: directToolRun?.status ?? null,
      skillId: skillRun?.skillId ?? executionPlan.skillId ?? null,
      skillStatus: skillRun?.status ?? null,
      workflowId: workflowRun?.workflowId ?? executionPlan.workflowId ?? null,
      workflowStatus: workflowRun?.status ?? null,
      modelToolPlannerAttempted,
      modelToolPlanUsed,
      modelToolPlannerError,
      modelToolPlan,
      createPlan: executionPlan.createPlan ?? null,
      writebackOperations:
        executionPlan.writebackPlan?.candidates.map(
          (candidate) => candidate.operation,
        ) ?? [],
      writebackCandidateCount:
        executionPlan.writebackPlan?.candidates.length ?? 0,
      stepPlannerPlan: stepPlannerPlan ?? null,
    },
    createdAt: now,
    updatedAt: now,
  });

  let resultStructuredPayload: Record<string, unknown> = {
    decision: dispatch.decision,
    insight,
    executionPreview,
    executionRoute,
    modelToolPlanner: {
      attempted: modelToolPlannerAttempted,
      used: modelToolPlanUsed,
      error: modelToolPlannerError,
    },
    modelToolPlan,
    stepPlannerPlan,
    workflowRuns: workflowRun ? [workflowRun] : [],
    skillRuns: skillRun ? [skillRun] : (workflowRun?.skillRuns ?? []),
    agentRuns: workflowRun?.agentRuns ?? [],
    toolRuns: directToolRun
      ? [directToolRun]
      : (skillRun?.toolRuns ?? workflowRun?.toolRuns ?? []),
    changedObjects:
      workflowRun?.changedObjects ??
      skillRun?.changedObjects ??
      (directToolRun ? readChangedObjectsFromToolRun(directToolRun) : []),
    artifacts: workflowRun?.artifacts ?? skillRun?.artifacts ?? [],
  };

  await db.insert(executionResults).values({
    id: executionResultId,
    taskId: executionTaskId,
    status: resultStatus,
    summaryText:
      workflowRun?.summaryText ??
      skillRun?.summaryText ??
      directToolRun?.summaryText ??
      insight.summary,
    responseText: assistantText,
    structuredPayload: resultStructuredPayload,
    createdAt: now,
    updatedAt: now,
  });

  if (
    executionPlan.route === "writeback_draft" &&
    executionPlan.writebackPlan &&
    directToolRun?.status === "completed"
  ) {
    writebackDraftToolRun = await runAiTool(
      { user },
      {
        toolName: "work_order.writeback_draft.create",
        input: {
          taskId: executionTaskId,
          resultId: executionResultId,
          source: "bp_ask_direct_writeback",
          sourceRequestId: userMessageId,
          candidates: executionPlan.writebackPlan.candidates,
        },
      },
    );
    writebackDrafts = readWritebackDraftsFromToolRun(writebackDraftToolRun);
    taskStatus =
      writebackDraftToolRun.status === "completed" && writebackDrafts.length > 0
        ? "completed"
        : "failed";
    resultStatus = taskStatus === "completed" ? "ready" : "failed";
    executionPreview = buildControlledWritebackExecutionPreview({
      plan: executionPlan.writebackPlan,
      readToolRun: directToolRun,
      draftToolRun: writebackDraftToolRun,
      writebackDrafts,
    });
    insight = buildControlledWritebackInsight({
      insight: dispatch.insight,
      plan: executionPlan.writebackPlan,
      readToolRun: directToolRun,
      draftToolRun: writebackDraftToolRun,
      writebackDrafts,
    });
    assistantText = buildControlledWritebackAssistantText({
      userName: user.name,
      plan: executionPlan.writebackPlan,
      readToolRun: directToolRun,
      draftToolRun: writebackDraftToolRun,
      writebackDrafts,
    });
    resultStructuredPayload = {
      ...resultStructuredPayload,
      insight,
      executionPreview,
      writebackDrafts,
      toolRuns: appendToolRun(
        resultStructuredPayload.toolRuns,
        writebackDraftToolRun,
      ),
      changedObjects: [],
    };

    if (
      executionPlan.writebackPlan.directApply &&
      writebackDraftToolRun.status === "completed" &&
      writebackDrafts.length > 0
    ) {
      const draftIds = writebackDrafts.map((draft) => draft.draftId);

      await db
        .update(executionWritebackDrafts)
        .set({
          status: "ready",
          metadata: {
            autoApproved: true,
            reviewedAt: now.toISOString(),
            reviewedByUserId: user.id,
            reviewedByUserName: user.name,
            reviewAction: "approve",
            reviewReason: "bp_ask_direct_apply",
          },
          updatedAt: now,
        })
        .where(inArray(executionWritebackDrafts.id, draftIds));

      writebackApplyToolRun = await runAiTool(
        { user },
        {
          toolName: "work_order.writeback.apply",
          input: {
            taskId: executionTaskId,
            resultId: executionResultId,
            draftIds,
          },
        },
      );
      writebackDrafts = readWritebackDraftsFromApplyToolRun(writebackApplyToolRun);
      taskStatus = writebackApplyToolRun.status === "completed" ? "completed" : "failed";
      resultStatus = writebackApplyToolRun.status === "completed" ? "ready" : "failed";
      resultStructuredPayload = updateWritebackApplyPayload({
        payload: resultStructuredPayload,
        toolRun: writebackApplyToolRun,
        writebackDrafts,
      });
      executionPreview =
        (asRecord(resultStructuredPayload.executionPreview) as DispatchExecutionPreview) ??
        executionPreview;
      insight = (asRecord(resultStructuredPayload.insight) as InsightBlock) ?? insight;
      assistantText = buildDirectWritebackAssistantText({
        userName: user.name,
        plan: executionPlan.writebackPlan,
        toolRun: writebackApplyToolRun,
      });

      if (stepPlannerPlan && writebackApplyToolRun.status === "completed") {
        assistantText = [
          `${user.name}，我已经按多步骤工单计划真实处理完 ${stepPlannerPlan.workOrderNo}。`,
          stepPlannerPlan.summary,
          `本次真实执行了 ${writebackDrafts.length} 个动作：${writebackDrafts.map((draft) => writebackOperationLabel(draft.operation)).join("、")}。`,
          "前端重新读取工单后会看到这些字段变化。",
        ].join("\n");
      }
    }

    await db
      .update(executionTasks)
      .set({
        status: taskStatus,
        updatedAt: now,
      })
      .where(eq(executionTasks.id, executionTaskId));

    await db
      .update(executionResults)
      .set({
        status: resultStatus,
        summaryText: (writebackApplyToolRun ?? writebackDraftToolRun).summaryText,
        responseText: assistantText,
        structuredPayload: resultStructuredPayload,
        updatedAt: now,
      })
      .where(eq(executionResults.id, executionResultId));
  }

  const assistantMessageId = buildId("message-assistant");
  const [assistantMessageRow] = await db
    .insert(conversationMessages)
    .values({
      id: assistantMessageId,
      threadId: thread.id,
      role: "assistant",
      sequence: currentSequence + 2,
      content: assistantText,
      tokenEstimate: estimateTokenCount(assistantText),
      metadata: {
        insight,
        dispatch: dispatch.decision,
        executionPreview,
        executionTaskId,
        executionResultId,
        executionRoute,
        modelToolPlanner: resultStructuredPayload.modelToolPlanner,
        modelToolPlan: resultStructuredPayload.modelToolPlan,
        stepPlannerPlan: resultStructuredPayload.stepPlannerPlan,
        workflowRuns: resultStructuredPayload.workflowRuns,
        skillRuns: resultStructuredPayload.skillRuns,
        agentRuns: resultStructuredPayload.agentRuns,
        toolRuns: resultStructuredPayload.toolRuns,
        writebackDrafts: resultStructuredPayload.writebackDrafts,
        changedObjects: resultStructuredPayload.changedObjects,
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const nextTitle =
    currentSequence === 0 || thread.title.startsWith("新对话")
      ? threadTitleFromPrompt(normalizedPrompt)
      : thread.title;
  const lastPreview = previewFromText(normalizedPrompt);

  await db
    .update(conversationThreads)
    .set({
      title: nextTitle,
      lastMessageAt: now,
      metadata: {
        ...(asRecord(thread.metadata) ?? {}),
        lastMessagePreview: lastPreview,
      },
      updatedAt: now,
    })
    .where(eq(conversationThreads.id, thread.id));

  const messages = await getMessagesForThread(thread.id);
  const rollingSummaryRow = await replaceRollingSummary({
    threadId: thread.id,
    messages,
    latestAssistantText: assistantText,
    latestInsight: insight,
  });

  await syncCoreMemoryFacts({
    user,
    thread,
    userMessageId: userMessageRow.id,
    assistantMessageId: assistantMessageRow.id,
    prompt: normalizedPrompt,
    assistantText,
    decision: dispatch.decision,
    insight,
  });

  const summary: BpAskThreadSummary = {
    id: thread.id,
    title: nextTitle,
    updatedAt: now.toISOString(),
    lastMessagePreview: lastPreview,
    accent: pickThreadAccent(thread.id),
  };

  return {
    summary,
    thread: {
      ...summary,
      messages,
      rollingSummary: rollingSummaryRow?.summaryText ?? null,
    } satisfies BpAskThreadDetail,
  };
}
