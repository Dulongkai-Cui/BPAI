import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/types";

export const AI_LONGXIA_AGENT_IDS = ["work-order-longxia"] as const;

export type AiLongxiaAgentId = (typeof AI_LONGXIA_AGENT_IDS)[number];
export type AiLongxiaRunMode = "dry_run";
export type AiLongxiaRunStatus = "completed" | "not_found" | "failed";
export type AiLongxiaRiskLevel =
  | "read"
  | "analysis"
  | "draft_write"
  | "restricted_write";

export type AiLongxiaExecutionContext = {
  user: AuthenticatedUser;
};

export type AiLongxiaRunRequest = {
  agentId: AiLongxiaAgentId;
  mode: AiLongxiaRunMode;
  input: unknown;
};

export type AiLongxiaProposedAction = {
  actionId: string;
  title: string;
  description: string;
  riskLevel: AiLongxiaRiskLevel;
  requiresConfirmation: boolean;
  status: "proposed";
};

export type AiLongxiaWritebackCandidate = {
  objectType: "work_order";
  objectRef: string;
  operation: "draft_next_action" | "draft_risk_followup";
  proposedValue: string;
  requiresConfirmation: true;
  status: "not_applied";
};

export type AiLongxiaRunOutput = {
  assignmentSummary: string;
  planSteps: string[];
  riskNotes: string[];
  requiredConfirmations: string[];
  proposedActions: AiLongxiaProposedAction[];
  writebackCandidates: AiLongxiaWritebackCandidate[];
};

export type AiLongxiaRunRecord = {
  agentId: AiLongxiaAgentId;
  agentName: string;
  mode: AiLongxiaRunMode;
  status: AiLongxiaRunStatus;
  summaryText: string;
  input: Record<string, unknown>;
  output: AiLongxiaRunOutput | null;
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

function readStringList(record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function compactList(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim()));
}

function buildFailureRun(params: {
  agentId: AiLongxiaAgentId;
  mode: AiLongxiaRunMode;
  input: Record<string, unknown>;
  startedAt: string;
  summaryText: string;
  errorCode: string;
}) {
  return {
    agentId: params.agentId,
    agentName: "工单龙虾",
    mode: params.mode,
    status: "failed",
    summaryText: params.summaryText,
    input: params.input,
    output: null,
    changedObjects: [],
    artifacts: [],
    startedAt: params.startedAt,
    completedAt: new Date().toISOString(),
    errorCode: params.errorCode,
  } satisfies AiLongxiaRunRecord;
}

function buildWorkOrderLongxiaDryRun(
  input: Record<string, unknown>,
  startedAt: string,
): AiLongxiaRunRecord {
  const workOrderNo = readString(input, "workOrderNo");

  if (!workOrderNo) {
    return buildFailureRun({
      agentId: "work-order-longxia",
      mode: "dry_run",
      input,
      startedAt,
      summaryText: "工单龙虾 dry-run 缺少 workOrderNo，无法承接。",
      errorCode: "LONGXIA_INPUT_MISSING_WORK_ORDER_NO",
    });
  }

  const workOrder = readRecord(input, "workOrder");
  const title = readString(workOrder, "title");
  const stageLabel = readString(workOrder, "stageLabel");
  const statusLabel = readString(workOrder, "statusLabel");
  const priorityLabel = readString(workOrder, "priorityLabel");
  const materialCompleteness = readNumber(workOrder, "materialCompleteness");
  const missingItemCount = readNumber(workOrder, "missingItemCount");
  const blockingItemCount = readNumber(workOrder, "blockingItemCount");
  const nextStep = readString(input, "nextStep");
  const risks = readStringList(input, "risks");
  const riskNotes =
    risks.length > 0 ? risks : ["工单龙虾 dry-run 未识别到额外风险，按当前工单节点继续推进。"];

  const planSteps = compactList([
    `复核 ${workOrderNo}${title ? `「${title}」` : ""} 的状态、责任归属和当前节点。`,
    stageLabel || statusLabel
      ? `按「${stageLabel || "未知节点"} / ${statusLabel || "未知状态"}」整理可执行事项。`
      : null,
    typeof blockingItemCount === "number" && blockingItemCount > 0
      ? `优先处理 ${blockingItemCount} 个阻塞缺项，避免流程继续空转。`
      : null,
    typeof missingItemCount === "number" && missingItemCount > 0
      ? `补齐 ${missingItemCount} 个缺项，并把补齐责任人与时限放入确认清单。`
      : null,
    typeof materialCompleteness === "number" && materialCompleteness < 80
      ? `材料完整度 ${materialCompleteness}%，先补到 80% 以上再进入强写回动作。`
      : null,
    nextStep ? `把下一步候选动作整理为：${nextStep}` : null,
    "所有正式分派、写回或外部执行动作都等待人工确认后再继续。",
  ]);

  const requiredConfirmations = compactList([
    "确认是否允许工单龙虾从 dry-run 进入真实执行。",
    nextStep ? `确认下一步候选动作是否采用：${nextStep}` : null,
    typeof blockingItemCount === "number" && blockingItemCount > 0
      ? "确认阻塞缺项的责任人与处理时限。"
      : null,
    priorityLabel === "紧急" ? "确认紧急工单是否需要插队或升级通知。" : null,
  ]);

  const proposedActions: AiLongxiaProposedAction[] = [
    {
      actionId: "review-work-order-context",
      title: "复核工单上下文",
      description: "读取并复核工单状态、节点、风险和材料完整度。",
      riskLevel: "read",
      requiresConfirmation: false,
      status: "proposed",
    },
    {
      actionId: "prepare-next-step-draft",
      title: "生成下一步草案",
      description: nextStep || "按当前节点生成下一步推进草案。",
      riskLevel: "draft_write",
      requiresConfirmation: true,
      status: "proposed",
    },
  ];

  if (typeof blockingItemCount === "number" && blockingItemCount > 0) {
    proposedActions.push({
      actionId: "follow-up-blocking-items",
      title: "跟进阻塞缺项",
      description: "整理阻塞缺项的责任人、时限和处理口径。",
      riskLevel: "draft_write",
      requiresConfirmation: true,
      status: "proposed",
    });
  }

  const writebackCandidates: AiLongxiaWritebackCandidate[] = [
    nextStep
      ? ({
          objectType: "work_order",
          objectRef: workOrderNo,
          operation: "draft_next_action",
          proposedValue: nextStep,
          requiresConfirmation: true,
          status: "not_applied",
        } satisfies AiLongxiaWritebackCandidate)
      : null,
    riskNotes.length > 0
      ? ({
          objectType: "work_order",
          objectRef: workOrderNo,
          operation: "draft_risk_followup",
          proposedValue: riskNotes.join("；"),
          requiresConfirmation: true,
          status: "not_applied",
        } satisfies AiLongxiaWritebackCandidate)
      : null,
  ].filter(
    (candidate): candidate is AiLongxiaWritebackCandidate => Boolean(candidate),
  );

  const assignmentSummary = `工单龙虾已 dry-run 承接 ${workOrderNo}${title ? `「${title}」` : ""}，形成 ${planSteps.length} 步执行预案和 ${requiredConfirmations.length} 个待确认项。`;

  return {
    agentId: "work-order-longxia",
    agentName: "工单龙虾",
    mode: "dry_run",
    status: "completed",
    summaryText: `${assignmentSummary} 未调用 OpenClaw sidecar，未修改业务数据。`,
    input,
    output: {
      assignmentSummary,
      planSteps,
      riskNotes,
      requiredConfirmations,
      proposedActions,
      writebackCandidates,
    },
    changedObjects: [],
    artifacts: ["工单龙虾 dry-run 承接预案"],
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

export async function runLongxiaAgent(
  _context: AiLongxiaExecutionContext,
  request: AiLongxiaRunRequest,
): Promise<AiLongxiaRunRecord> {
  const startedAt = new Date().toISOString();
  const input = normalizeInput(request.input);

  if (request.agentId === "work-order-longxia" && request.mode === "dry_run") {
    return buildWorkOrderLongxiaDryRun(input, startedAt);
  }

  return buildFailureRun({
    agentId: request.agentId,
    mode: request.mode,
    input,
    startedAt,
    summaryText: `未知龙虾执行器：${request.agentId} / ${request.mode}`,
    errorCode: "UNKNOWN_LONGXIA_AGENT",
  });
}
