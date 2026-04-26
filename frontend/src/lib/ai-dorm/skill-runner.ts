import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/types";
import { runAiTool, type AiToolRunRecord } from "@/lib/ai-tools/gateway";

export const AI_SKILL_IDS = ["skill-work-order-summary"] as const;

export type AiSkillId = (typeof AI_SKILL_IDS)[number];
export type AiSkillRunStatus = "completed" | "not_found" | "failed";

export type AiSkillExecutionContext = {
  user: AuthenticatedUser;
};

export type AiSkillRunRequest = {
  skillId: AiSkillId;
  input: unknown;
};

export type WorkOrderSummarySkillOutput = {
  summary: string;
  risks: string[];
  nextStep: string;
  workOrder: Record<string, unknown> | null;
  changedObjects: string[];
  artifacts: string[];
};

export type AiSkillRunRecord = {
  skillId: AiSkillId;
  skillName: string;
  status: AiSkillRunStatus;
  summaryText: string;
  input: Record<string, unknown>;
  output: WorkOrderSummarySkillOutput | null;
  toolRuns: AiToolRunRecord[];
  changedObjects: string[];
  artifacts: string[];
  startedAt: string;
  completedAt: string;
  errorCode?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeInput(input: unknown) {
  return isRecord(input) ? input : {};
}

function readRecord(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return isRecord(value) ? value : null;
}

function readString(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readWorkOrderFromToolRun(toolRun: AiToolRunRecord) {
  return readRecord(toolRun.structuredPayload, "workOrder");
}

function compactList(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim()));
}

function buildRiskBullets(workOrder: Record<string, unknown>) {
  const warningLabel = readString(workOrder, "warningLabel");
  const warningStatus = readString(workOrder, "warningStatus");
  const priorityLabel = readString(workOrder, "priorityLabel");
  const materialCompleteness = readNumber(workOrder, "materialCompleteness");
  const missingItemCount = readNumber(workOrder, "missingItemCount");
  const blockingItemCount = readNumber(workOrder, "blockingItemCount");
  const latestDispatch = readRecord(workOrder, "latestDispatchExecution");
  const warningReason = readString(latestDispatch, "warningReason");
  const anomalySummary = readString(latestDispatch, "anomalySummary");

  const risks = compactList([
    warningStatus && !["normal", "resolved"].includes(warningStatus)
      ? `预警状态为「${warningLabel || warningStatus}」，需要继续跟进。`
      : null,
    priorityLabel === "紧急" ? "优先级为「紧急」，不适合长期停留在当前节点。" : null,
    typeof blockingItemCount === "number" && blockingItemCount > 0
      ? `当前还有 ${blockingItemCount} 个阻塞缺项。`
      : null,
    typeof missingItemCount === "number" && missingItemCount > 0
      ? `仍有 ${missingItemCount} 个缺项需要补齐。`
      : null,
    typeof materialCompleteness === "number" && materialCompleteness < 80
      ? `材料完整度为 ${materialCompleteness}%，低于 80%。`
      : null,
    warningReason ? `预警原因：${warningReason}` : null,
    anomalySummary ? `异常摘要：${anomalySummary}` : null,
  ]);

  return risks.length > 0 ? risks : ["当前未识别到明确阻塞风险，按现有节点继续推进即可。"];
}

function buildNextStep(workOrder: Record<string, unknown>, risks: string[]) {
  const nextAction = readString(workOrder, "nextAction");

  if (nextAction) {
    return nextAction;
  }

  const blockingItemCount = readNumber(workOrder, "blockingItemCount");
  const stageLabel = readString(workOrder, "stageLabel");

  if (typeof blockingItemCount === "number" && blockingItemCount > 0) {
    return "先处理阻塞缺项，再继续推进当前工单节点。";
  }

  if (risks.length > 0 && !risks[0].includes("未识别到明确阻塞风险")) {
    return "先确认风险项责任人和处理时限，再推进下一节点。";
  }

  return stageLabel ? `继续按「${stageLabel}」节点推进。` : "继续按当前工单节点推进。";
}

function buildWorkOrderSummaryOutput(workOrder: Record<string, unknown>): WorkOrderSummarySkillOutput {
  const workOrderNo = readString(workOrder, "workOrderNo");
  const title = readString(workOrder, "title");
  const statusLabel = readString(workOrder, "statusLabel") || "未知状态";
  const stageLabel = readString(workOrder, "stageLabel") || "未知节点";
  const priorityLabel = readString(workOrder, "priorityLabel") || "未知优先级";
  const materialCompleteness = readNumber(workOrder, "materialCompleteness");
  const latestProgressSummary = readString(workOrder, "latestProgressSummary");
  const risks = buildRiskBullets(workOrder);
  const nextStep = buildNextStep(workOrder, risks);
  const completenessText =
    typeof materialCompleteness === "number" ? `，材料完整度 ${materialCompleteness}%` : "";
  const progressText = latestProgressSummary ? `最近进展：${latestProgressSummary}` : "";

  return {
    summary: compactList([
      `${workOrderNo}${title ? `「${title}」` : ""} 当前处于「${stageLabel} / ${statusLabel}」，优先级为「${priorityLabel}」${completenessText}。`,
      progressText,
    ]).join(" "),
    risks,
    nextStep,
    workOrder,
    changedObjects: [],
    artifacts: [],
  };
}

async function runWorkOrderSummarySkill(
  context: AiSkillExecutionContext,
  input: Record<string, unknown>,
): Promise<AiSkillRunRecord> {
  const startedAt = new Date().toISOString();
  const toolRun = await runAiTool(context, {
    toolName: "work_order.read",
    input: {
      workOrderId: readString(input, "workOrderId") || undefined,
      workOrderNo: readString(input, "workOrderNo") || undefined,
    },
  });

  if (toolRun.status !== "completed") {
    return {
      skillId: "skill-work-order-summary",
      skillName: "工单摘要 Skill",
      status: toolRun.status,
      summaryText: toolRun.summaryText,
      input,
      output: null,
      toolRuns: [toolRun],
      changedObjects: [],
      artifacts: [],
      errorCode: toolRun.errorCode,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  const workOrder = readWorkOrderFromToolRun(toolRun);

  if (!workOrder) {
    return {
      skillId: "skill-work-order-summary",
      skillName: "工单摘要 Skill",
      status: "failed",
      summaryText: "工单摘要 Skill 没有拿到 work_order.read 的工单结构化结果。",
      input,
      output: null,
      toolRuns: [toolRun],
      changedObjects: [],
      artifacts: [],
      errorCode: "WORK_ORDER_SUMMARY_EMPTY_PAYLOAD",
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  const output = buildWorkOrderSummaryOutput(workOrder);

  return {
    skillId: "skill-work-order-summary",
    skillName: "工单摘要 Skill",
    status: "completed",
    summaryText: `${output.summary} 建议下一步：${output.nextStep}`,
    input,
    output,
    toolRuns: [toolRun],
    changedObjects: output.changedObjects,
    artifacts: output.artifacts,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

export async function runAiSkill(
  context: AiSkillExecutionContext,
  request: AiSkillRunRequest,
): Promise<AiSkillRunRecord> {
  const input = normalizeInput(request.input);

  if (request.skillId === "skill-work-order-summary") {
    return runWorkOrderSummarySkill(context, input);
  }

  const timestamp = new Date().toISOString();

  return {
    skillId: request.skillId,
    skillName: request.skillId,
    status: "failed",
    summaryText: `未知 Skill：${request.skillId}`,
    input,
    output: null,
    toolRuns: [],
    changedObjects: [],
    artifacts: [],
    errorCode: "UNKNOWN_AI_SKILL",
    startedAt: timestamp,
    completedAt: timestamp,
  };
}
