import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/types";
import {
  runAiSkill,
  type AiSkillRunRecord,
} from "@/lib/ai-dorm/skill-runner";
import {
  runLongxiaAgent,
  type AiLongxiaRunRecord,
} from "@/lib/ai-dorm/longxia-adapter";
import type { AiToolRunRecord } from "@/lib/ai-tools/gateway";

export const AI_WORKFLOW_RUNNER_IDS = ["workflow-work-order-intake"] as const;

export type AiWorkflowRunnerId = (typeof AI_WORKFLOW_RUNNER_IDS)[number];
export type AiWorkflowRunStatus =
  | "completed"
  | "waiting_confirmation"
  | "not_found"
  | "failed";
export type AiWorkflowNodeRunStatus =
  | "completed"
  | "waiting_confirmation"
  | "not_found"
  | "failed"
  | "skipped";
export type AiWorkflowNodeKind = "input" | "skill" | "agent" | "human" | "output";

export type AiWorkflowExecutionContext = {
  user: AuthenticatedUser;
};

export type AiWorkflowRunRequest = {
  workflowId: AiWorkflowRunnerId;
  input: unknown;
};

export type AiWorkflowNodeRunRecord = {
  nodeId: string;
  nodeTitle: string;
  kind: AiWorkflowNodeKind;
  status: AiWorkflowNodeRunStatus;
  summaryText: string;
  startedAt: string;
  completedAt: string;
};

export type AiWorkflowConfirmationRequest = {
  requestId: string;
  title: string;
  description: string;
  sourceNodeId: string;
  riskLevel: "draft_write" | "external_action" | "restricted_write";
  status: "waiting";
  requiredBefore: "openclaw_execution" | "business_writeback";
};

export type AiWorkflowRunOutput = {
  summary: string;
  risks: string[];
  nextStep: string;
  pendingConfirmation: string[];
  confirmationRequests: AiWorkflowConfirmationRequest[];
  skippedNodes: string[];
  agentSummary: string;
  agentPlanSteps: string[];
  writebackCandidates: Record<string, unknown>[];
};

export type AiWorkflowRunRecord = {
  workflowId: AiWorkflowRunnerId;
  workflowName: string;
  status: AiWorkflowRunStatus;
  summaryText: string;
  input: Record<string, unknown>;
  output: AiWorkflowRunOutput | null;
  nodeRuns: AiWorkflowNodeRunRecord[];
  skillRuns: AiSkillRunRecord[];
  agentRuns: AiLongxiaRunRecord[];
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

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function buildNodeRun(params: {
  nodeId: string;
  nodeTitle: string;
  kind: AiWorkflowNodeKind;
  status: AiWorkflowNodeRunStatus;
  summaryText: string;
  startedAt?: string;
}) {
  const timestamp = new Date().toISOString();

  return {
    nodeId: params.nodeId,
    nodeTitle: params.nodeTitle,
    kind: params.kind,
    status: params.status,
    summaryText: params.summaryText,
    startedAt: params.startedAt ?? timestamp,
    completedAt: timestamp,
  } satisfies AiWorkflowNodeRunRecord;
}

function buildFailureRun(params: {
  workflowId: AiWorkflowRunnerId;
  startedAt: string;
  input: Record<string, unknown>;
  summaryText: string;
  errorCode: string;
  nodeRuns?: AiWorkflowNodeRunRecord[];
  skillRun?: AiSkillRunRecord;
}) {
  const skillRuns = params.skillRun ? [params.skillRun] : [];
  const toolRuns = skillRuns.flatMap((skillRun) => skillRun.toolRuns);

  return {
    workflowId: params.workflowId,
    workflowName: "工单受理流程",
    status: params.skillRun?.status === "not_found" ? "not_found" : "failed",
    summaryText: params.summaryText,
    input: params.input,
    output: null,
    nodeRuns: params.nodeRuns ?? [],
    skillRuns,
    agentRuns: [],
    toolRuns,
    changedObjects: [],
    artifacts: [],
    errorCode: params.errorCode,
    startedAt: params.startedAt,
    completedAt: new Date().toISOString(),
  } satisfies AiWorkflowRunRecord;
}

function buildConfirmationRequests(params: {
  confirmations: string[];
  writebackCandidateCount: number;
}) {
  const baseRequests = params.confirmations.map((confirmation, index) => ({
    requestId: `wo-human-confirm-${index + 1}`,
    title: confirmation,
    description:
      index === 0
        ? "确认后才允许工单龙虾从 dry-run 进入真实执行链路。"
        : "确认后才会进入后续候选写回或执行动作。",
    sourceNodeId: "wo-human",
    riskLevel: index === 0 ? "external_action" : "draft_write",
    status: "waiting",
    requiredBefore: index === 0 ? "openclaw_execution" : "business_writeback",
  })) satisfies AiWorkflowConfirmationRequest[];

  if (params.writebackCandidateCount === 0) {
    return baseRequests;
  }

  return [
    ...baseRequests,
    {
      requestId: "wo-human-confirm-writeback-candidates",
      title: `确认 ${params.writebackCandidateCount} 个候选写回是否可以进入正式处理。`,
      description: "当前只生成候选写回，不会直接修改工单字段。",
      sourceNodeId: "wo-human",
      riskLevel: "restricted_write",
      status: "waiting",
      requiredBefore: "business_writeback",
    },
  ] satisfies AiWorkflowConfirmationRequest[];
}

async function runWorkOrderIntakeWorkflow(
  context: AiWorkflowExecutionContext,
  input: Record<string, unknown>,
): Promise<AiWorkflowRunRecord> {
  const startedAt = new Date().toISOString();
  const workOrderNo = readString(input, "workOrderNo");
  const nodeRuns: AiWorkflowNodeRunRecord[] = [];

  if (!workOrderNo) {
    nodeRuns.push(
      buildNodeRun({
        nodeId: "wo-input",
        nodeTitle: "接收入参",
        kind: "input",
        status: "failed",
        summaryText: "缺少 workOrderNo，无法启动工单受理流程。",
        startedAt,
      }),
    );

    return buildFailureRun({
      workflowId: "workflow-work-order-intake",
      startedAt,
      input,
      summaryText: "工单受理流程缺少工单号，未执行后续节点。",
      errorCode: "WORKFLOW_INPUT_MISSING_WORK_ORDER_NO",
      nodeRuns,
    });
  }

  nodeRuns.push(
    buildNodeRun({
      nodeId: "wo-input",
      nodeTitle: "接收入参",
      kind: "input",
      status: "completed",
      summaryText: `已接收工单 ${workOrderNo}，进入最小工单受理流程。`,
      startedAt,
    }),
  );

  const skillRun = await runAiSkill(context, {
    skillId: "skill-work-order-summary",
    input: {
      workOrderNo,
    },
  });

  nodeRuns.push(
    buildNodeRun({
      nodeId: "wo-skill",
      nodeTitle: "工单摘要 Skill",
      kind: "skill",
      status: skillRun.status,
      summaryText: skillRun.summaryText,
      startedAt: skillRun.startedAt,
    }),
  );

  if (skillRun.status !== "completed" || !skillRun.output) {
    nodeRuns.push(
      buildNodeRun({
        nodeId: "wo-output",
        nodeTitle: "结果回执",
        kind: "output",
        status: skillRun.status,
        summaryText: "Skill 未完成，流程输出节点只记录失败回执。",
      }),
    );

    return buildFailureRun({
      workflowId: "workflow-work-order-intake",
      startedAt,
      input,
      summaryText: skillRun.summaryText,
      errorCode: skillRun.errorCode ?? "WORKFLOW_SKILL_FAILED",
      nodeRuns,
      skillRun,
    });
  }

  const longxiaRun = await runLongxiaAgent(context, {
    agentId: "work-order-longxia",
    mode: "dry_run",
    input: {
      workOrderNo,
      summary: skillRun.output.summary,
      risks: skillRun.output.risks,
      nextStep: skillRun.output.nextStep,
      workOrder: skillRun.output.workOrder,
    },
  });

  nodeRuns.push(
    buildNodeRun({
      nodeId: "wo-agent",
      nodeTitle: "工单龙虾承接",
      kind: "agent",
      status: longxiaRun.status,
      summaryText: longxiaRun.summaryText,
      startedAt: longxiaRun.startedAt,
    }),
  );

  if (longxiaRun.status !== "completed" || !longxiaRun.output) {
    nodeRuns.push(
      buildNodeRun({
        nodeId: "wo-output",
        nodeTitle: "结果回执",
        kind: "output",
        status: longxiaRun.status,
        summaryText: "工单龙虾 dry-run 未完成，流程输出节点只记录失败回执。",
      }),
    );

    return {
      workflowId: "workflow-work-order-intake",
      workflowName: "工单受理流程",
      status: longxiaRun.status === "not_found" ? "not_found" : "failed",
      summaryText: longxiaRun.summaryText,
      input,
      output: null,
      nodeRuns,
      skillRuns: [skillRun],
      agentRuns: [longxiaRun],
      toolRuns: skillRun.toolRuns,
      changedObjects: [],
      artifacts: longxiaRun.artifacts,
      errorCode: longxiaRun.errorCode ?? "WORKFLOW_LONGXIA_DRY_RUN_FAILED",
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  nodeRuns.push(
    buildNodeRun({
      nodeId: "wo-human",
      nodeTitle: "人工确认",
      kind: "human",
      status: "waiting_confirmation",
      summaryText: `已生成 ${longxiaRun.output.requiredConfirmations.length} 个待确认项，等待人工确认后再进入真实执行或业务写回。`,
    }),
  );

  const confirmationRequests = buildConfirmationRequests({
    confirmations: longxiaRun.output.requiredConfirmations,
    writebackCandidateCount: longxiaRun.output.writebackCandidates.length,
  });

  const output: AiWorkflowRunOutput = {
    summary: skillRun.output.summary,
    risks: skillRun.output.risks,
    nextStep: skillRun.output.nextStep,
    pendingConfirmation: longxiaRun.output.requiredConfirmations,
    confirmationRequests,
    skippedNodes: ["OpenClaw sidecar", "业务写回"],
    agentSummary: longxiaRun.output.assignmentSummary,
    agentPlanSteps: longxiaRun.output.planSteps,
    writebackCandidates: longxiaRun.output.writebackCandidates,
  };
  const summaryText = `工单受理流程已跑到人工确认节点：${output.summary} ${output.agentSummary} 等待 ${output.confirmationRequests.length} 个确认请求。建议下一步：${output.nextStep}`;

  nodeRuns.push(
    buildNodeRun({
      nodeId: "wo-output",
      nodeTitle: "结果回执",
      kind: "output",
      status: "completed",
      summaryText: "已把工单摘要、龙虾承接预案、确认请求、候选写回和下一步建议形成流程输出。",
    }),
  );

  return {
    workflowId: "workflow-work-order-intake",
    workflowName: "工单受理流程",
    status: "waiting_confirmation",
    summaryText,
    input,
    output,
    nodeRuns,
    skillRuns: [skillRun],
    agentRuns: [longxiaRun],
    toolRuns: skillRun.toolRuns,
    changedObjects: [],
    artifacts: longxiaRun.artifacts,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

export async function runAiWorkflow(
  context: AiWorkflowExecutionContext,
  request: AiWorkflowRunRequest,
): Promise<AiWorkflowRunRecord> {
  const input = normalizeInput(request.input);

  if (request.workflowId === "workflow-work-order-intake") {
    return runWorkOrderIntakeWorkflow(context, input);
  }

  const startedAt = new Date().toISOString();

  return buildFailureRun({
    workflowId: request.workflowId,
    startedAt,
    input,
    summaryText: `未知工作流：${request.workflowId}`,
    errorCode: "UNKNOWN_AI_WORKFLOW",
  });
}
