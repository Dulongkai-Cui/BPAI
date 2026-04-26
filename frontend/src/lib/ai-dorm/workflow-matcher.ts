import "server-only";

import type { DispatchDecision } from "@/lib/bp-ask/intents";

export const AI_WORKFLOW_IDS = ["workflow-work-order-intake"] as const;

export type AiWorkflowId = (typeof AI_WORKFLOW_IDS)[number];

export type AiWorkflowMatch = {
  workflowId: AiWorkflowId;
  workflowName: string;
  confidence: number;
  reason: string;
};

const WORK_ORDER_INTAKE_WORKFLOW_KEYWORDS = [
  "联动",
  "联动执行",
  "自动处理",
  "跑一遍",
] as const;

const WORK_ORDER_INTAKE_NAMED_WORKFLOW_KEYWORDS = [
  "工作流",
  "流程",
  "受理流程",
  "进入流程",
  "跑流程",
] as const;

function includesAny(source: string, keywords: readonly string[]) {
  return keywords.some((keyword) => source.includes(keyword));
}

function hasWorkOrderRef(decision: DispatchDecision) {
  return typeof decision.targetRefs?.workOrderNo === "string" && decision.targetRefs.workOrderNo.trim();
}

export function matchAiWorkflow(params: {
  decision: DispatchDecision;
  prompt: string;
}): AiWorkflowMatch | null {
  const { decision, prompt } = params;

  const namedWorkflowCue = includesAny(prompt, WORK_ORDER_INTAKE_NAMED_WORKFLOW_KEYWORDS);

  if (decision.targetDomain !== "work_order" || decision.requiresWrite || !hasWorkOrderRef(decision)) {
    return null;
  }

  if (
    !namedWorkflowCue &&
    (decision.suggestedExecutor === "longxia" ||
      decision.executionMode === "delegate_to_longxia")
  ) {
    return null;
  }

  const explicitWorkflowCue =
    namedWorkflowCue ||
    decision.primaryIntent === "workflow_execute" ||
    decision.executionMode === "start_workflow" ||
    includesAny(prompt, WORK_ORDER_INTAKE_WORKFLOW_KEYWORDS);

  if (!explicitWorkflowCue) {
    return null;
  }

  return {
    workflowId: "workflow-work-order-intake",
    workflowName: "工单受理流程",
    confidence: Math.max(72, Math.min(96, decision.confidence)),
    reason: "命中工单目标对象，并出现流程/联动/受理类工作流信号。",
  };
}
