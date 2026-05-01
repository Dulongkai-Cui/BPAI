import "server-only";

import type { AiCapabilityDescriptor } from "@/lib/ai-tools/gateway";
import {
  EXECUTION_MODES,
  PRIMARY_INTENTS,
  TARGET_DOMAINS,
  clampConfidence,
  isExecutionMode,
  isPrimaryIntent,
  isTargetDomain,
  type ExecutionMode,
  type PrimaryIntent,
  type TargetDomain,
  type DispatchDecision,
} from "@/lib/bp-ask/intents";

export type ModelDispatchInput = {
  prompt: string;
  rollingSummary: string | null;
  recentMessages: string[];
  memoryFacts: string[];
};

export type ModelDispatchClassification = {
  primaryIntent: PrimaryIntent;
  targetDomain: TargetDomain;
  executionMode: ExecutionMode;
  confidence: number;
  reason: string;
};

export type ModelChatGenerationInput = {
  prompt: string;
  userName: string;
  rollingSummary: string | null;
  recentMessages: string[];
};

export type ModelWorkOrderToolName =
  | "work_order.read"
  | "work_order.create"
  | "work_order.update"
  | "work_order.archive";

export type ModelWorkOrderToolPlan = {
  tool: ModelWorkOrderToolName;
  args: {
    workOrderNo?: string;
    title?: string;
    priority?: string;
    stage?: string;
    status?: string;
    nextAction?: string;
    riskFollowup?: string;
    sourceSummary?: string;
    projectName?: string;
    siteName?: string;
    siteAddress?: string;
    responsibleTeam?: string;
    progressSummary?: string;
    materialCompleteness?: string;
    missingItemCount?: string;
    blockingItemCount?: string;
    warningStatus?: string;
  };
  confidence: number;
  reason: string;
};

export type ModelWorkOrderToolPlannerInput = ModelDispatchInput & {
  dispatchDecision: DispatchDecision;
};

export type ModelAiCapabilityPlan = {
  toolName: string;
  args: Record<string, unknown>;
  confidence: number;
  reason: string;
};

export type ModelAiCapabilityStepPlanMode = "chat" | "task" | "delegate";

export type ModelAiCapabilityStep = {
  stepId: string;
  toolName: string;
  args: Record<string, unknown>;
  purpose: string;
  requiresPreviousResult: boolean;
};

export type ModelAiCapabilityStepPlan = {
  mode: ModelAiCapabilityStepPlanMode;
  taskTitle: string;
  steps: ModelAiCapabilityStep[];
  missingInformation: string[];
  followupQuestion: string;
  delegateTarget: string;
  delegateReason: string;
  confidence: number;
  reason: string;
};

export type ModelWorkOrderPatchRefineInput = {
  prompt: string;
  workOrder: Record<string, unknown>;
  existingArgs: Record<string, unknown>;
};

export type ModelAiCapabilityPlannerInput = ModelDispatchInput & {
  capabilities: AiCapabilityDescriptor[];
};

type BpAskModelProvider = "deepseek" | "kimi";

type ChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

type MessageContent = string | Array<{ type?: string; text?: string }> | undefined;

type ModelConfig = {
  provider: BpAskModelProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  errorPrefix: string;
};

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";
const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_KIMI_MODEL = "kimi-k2.5";
const WORK_ORDER_TOOL_NAMES = [
  "work_order.read",
  "work_order.create",
  "work_order.update",
  "work_order.archive",
] as const;
const WORK_ORDER_TOOL_PLANNER_PRIORITY_VALUES = ["low", "normal", "high", "urgent"];
const WORK_ORDER_TOOL_PLANNER_STAGE_VALUES = [
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
];
const WORK_ORDER_TOOL_PLANNER_STATUS_VALUES = [
  "open",
  "in_progress",
  "waiting",
  "blocked",
  "completed",
  "cancelled",
  "archived",
];
const WORK_ORDER_TOOL_PLANNER_WARNING_VALUES = [
  "normal",
  "warning",
  "critical",
  "resolved",
];

function resolveProvider(): BpAskModelProvider {
  const configured = process.env.BPASK_MODEL_PROVIDER?.trim().toLowerCase();

  if (configured === "kimi" || configured === "deepseek") {
    return configured;
  }

  return process.env.DEEPSEEK_API_KEY?.trim() ? "deepseek" : "kimi";
}

function resolveModelConfig(): ModelConfig {
  const provider = resolveProvider();

  if (provider === "deepseek") {
    return {
      provider,
      apiKey: process.env.DEEPSEEK_API_KEY?.trim() || "",
      baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL,
      model: process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL,
      errorPrefix: "DEEPSEEK",
    };
  }

  return {
    provider,
    apiKey:
      process.env.KIMI_API_KEY?.trim() ||
      process.env.MOONSHOT_API_KEY?.trim() ||
      "",
    baseUrl:
      process.env.KIMI_BASE_URL?.trim() ||
      process.env.MOONSHOT_BASE_URL?.trim() ||
      DEFAULT_KIMI_BASE_URL,
    model:
      process.env.KIMI_MODEL?.trim() ||
      process.env.MOONSHOT_MODEL?.trim() ||
      DEFAULT_KIMI_MODEL,
    errorPrefix: "KIMI",
  };
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeMessageContent(content: MessageContent) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function stripMarkdownFence(value: string) {
  const fenced = value.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : value.trim();
}

function readDispatchTargetWorkOrderNo(decision: DispatchDecision) {
  return readString(
    isRecord(decision.targetRefs) ? decision.targetRefs : null,
    "workOrderNo",
  );
}

function safeSlice(values: string[], limit: number) {
  return values.slice(Math.max(0, values.length - limit));
}

function buildClassifierPrompt(input: ModelDispatchInput) {
  const rollingSummary = input.rollingSummary?.trim() || "(none)";
  const recentMessages = safeSlice(input.recentMessages, 6).join("\n") || "(none)";
  const memoryFacts = safeSlice(input.memoryFacts, 6).join("\n") || "(none)";

  return [
    "Return one JSON object only. Do not use markdown fences.",
    "Classify the user request for BPAI BP Ask using existing enums only.",
    `Allowed primaryIntent: ${PRIMARY_INTENTS.join(", ")}`,
    `Allowed targetDomain: ${TARGET_DOMAINS.join(", ")}`,
    `Allowed executionMode: ${EXECUTION_MODES.join(", ")}`,
    "Rules:",
    "- Output exactly: primaryIntent, targetDomain, executionMode, confidence, reason.",
    "- targetRefs and constraints are extracted by the rule layer, not by you.",
    "- If the request is ambiguous and lacks a concrete object, prefer clarification / bp_ask / ask_followup.",
    "- Keep reason short and concrete.",
    "",
    `rollingSummary:\n${rollingSummary}`,
    "",
    `recentMessages:\n${recentMessages}`,
    "",
    `memoryFacts:\n${memoryFacts}`,
    "",
    `userPrompt:\n${input.prompt}`,
  ].join("\n");
}

function buildChatPrompt(input: ModelChatGenerationInput) {
  const rollingSummary = input.rollingSummary?.trim() || "(none)";
  const recentMessages = safeSlice(input.recentMessages, 8).join("\n") || "(none)";

  return [
    `Current user: ${input.userName}`,
    "Product identity: 你是 BPAI 平台里的智能入口 BP问问，不是通用聊天助手。",
    "Domain: 你熟悉电信工程、施工协作、工单流转、合作空间、系统表单、文档资料、图纸交付、工程队协同。",
    "Style: 语气认真、克制、专业，不装可爱，不轻浮，不油腻。",
    "Boundary:",
    "- 不要说自己来自百融云创、ChatGPT、OpenAI 或其他外部品牌。",
    "- 不要把自己描述成万能写邮件/创意助手。",
    "- 不要虚构已经接通的系统能力。",
    "- 如果用户只是闲聊/问候/问你是谁，就正常自然回应，不要转成任务说明。",
    "- 如果用户问你能做什么，回答要围绕 BPAI 的业务：工单、合作空间、文档、系统表单、工程协同、任务整理、记忆承接。",
    "- 如果用户提到电信工程、站点、回单、图纸、材料、施工队等，要体现你懂这个行业语境。",
    "- 不要提 intent、targetDomain、executionMode、dispatch、toolHints、confidence 这些内部术语。",
    "Output: 用简体中文自然回复，默认 2 到 5 句，除非用户要求，否则不要长篇大论。",
    "",
    `rollingSummary:\n${rollingSummary}`,
    "",
    `recentMessages:\n${recentMessages}`,
    "",
    `userPrompt:\n${input.prompt}`,
  ].join("\n");
}

function buildWorkOrderPatchRefinePrompt(input: ModelWorkOrderPatchRefineInput) {
  return [
    "Return one JSON object only. Do not use markdown fences.",
    "You are BPAI's work-order patch refiner. Based on the user's original request and the resolved work order, fill only clear update fields.",
    'Allowed output schema: { "args": { ... }, "confidence": 0-100, "reason": "short reason" }',
    "Rules:",
    "- Keep workOrderNo from existingArgs if present.",
    "- Only fill fields that are clearly implied by the user's request.",
    "- Allowed fields: priority, stage, status, nextAction, riskFollowup, title, sourceSummary, projectName, siteName, siteAddress, responsibleTeam, progressSummary, materialCompleteness, missingItemCount, blockingItemCount, warningStatus.",
    "- Use canonical enum values when possible.",
    "- Do not invent facts from the workOrder object; use it only to resolve context.",
    "",
    `existingArgs:\n${JSON.stringify(input.existingArgs, null, 2)}`,
    "",
    `workOrder:\n${JSON.stringify(input.workOrder, null, 2)}`,
    "",
    `userPrompt:\n${input.prompt}`,
  ].join("\n");
}

function buildAiCapabilityPlannerPrompt(input: ModelAiCapabilityPlannerInput) {
  const rollingSummary = input.rollingSummary?.trim() || "(none)";
  const recentMessages = safeSlice(input.recentMessages, 8).join("\n") || "(none)";
  const memoryFacts = safeSlice(input.memoryFacts, 6).join("\n") || "(none)";
  const capabilities = input.capabilities.map((capability) => ({
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
    requiredContext: capability.requiredContext,
    plannerHints: capability.plannerHints,
    failureModes: capability.failureModes,
    mutatesDemoData: capability.mutatesDemoData,
    requiresConfirmationDefault: capability.requiresConfirmationDefault,
  }));

  return [
    "Return one JSON object only. Do not use markdown fences.",
    "You are BPAI's capability planner. Choose zero or one tool from the provided capability list.",
    'Allowed output schema: { "toolName": "capability.name|none", "args": { ... }, "confidence": 0-100, "reason": "short reason" }',
    "Rules:",
    "- Prefer the provided capability list over keyword routing. If the user asks to read, create, update, archive, list, or create documents/work orders, choose the matching capability.",
    "- Match the user request against capability.action, target.objectType, plannerHints.whenToUse, and examples.",
    "- Respect executionMode: direct means BP问问 can run it now; orchestrated means BP问问 will convert your args into internal steps; plan_only means choose it only when it is the right high-level capability.",
    "- If the user intent matches a capability but requiredInformation is missing, still choose that capability with the args you know; do not invent missing values.",
    "- Use only a capability name from the list, or toolName: none.",
    "- For work_order.update, put changed fields directly in args with workOrderNo; do not nest them under patch.",
    "- For work_order.archive, only workOrderNo is required.",
    "- Do not invent identifiers or arguments that are not supported by the capability inputSchema.",
    "- Demo data mutations are allowed when the user asks for a concrete change.",
    "- If a matching capability needs an identifier like workOrderNo and the user omitted it, still choose the matching capability with partial args so BP问问 can ask for the missing information.",
    "",
    `capabilities:\n${JSON.stringify(capabilities, null, 2)}`,
    "",
    `rollingSummary:\n${rollingSummary}`,
    "",
    `recentMessages:\n${recentMessages}`,
    "",
    `memoryFacts:\n${memoryFacts}`,
    "",
    `userPrompt:\n${input.prompt}`,
  ].join("\n");
}

function buildAiCapabilityStepPlannerPrompt(input: ModelAiCapabilityPlannerInput) {
  const rollingSummary = input.rollingSummary?.trim() || "(none)";
  const recentMessages = safeSlice(input.recentMessages, 8).join("\n") || "(none)";
  const memoryFacts = safeSlice(input.memoryFacts, 6).join("\n") || "(none)";
  const capabilities = input.capabilities.map((capability) => ({
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
    requiredContext: capability.requiredContext,
    plannerHints: capability.plannerHints,
    failureModes: capability.failureModes,
    mutatesDemoData: capability.mutatesDemoData,
    requiresConfirmationDefault: capability.requiresConfirmationDefault,
  }));

  return [
    "Return one JSON object only. Do not use markdown fences.",
    "You are BPAI's multi-step capability planner. Decide whether the user is chatting, asking BPAI to do an in-system task, or asking for work that should be delegated to an AI Dorm/Longxia worker.",
    "Allowed output schema:",
    '{ "mode": "chat|task|delegate", "taskTitle": "short title", "steps": [{ "stepId": "step-1", "toolName": "capability.name", "args": { ... }, "purpose": "why this step runs", "requiresPreviousResult": false }], "missingInformation": ["field or condition"], "followupQuestion": "question to ask user", "delegateTarget": "worker id or empty", "delegateReason": "short reason", "confidence": 0-100, "reason": "short reason" }',
    "Rules:",
    "- Use mode: chat when the user is just chatting, asking who you are, or asking a general question that does not require execution.",
    "- Default to mode: task whenever the user is asking BP问问 to do something inside BPAI and the request can be partially or fully grounded in the provided capabilities, even if some fields are still missing.",
    "- Use mode: task when the user asks BP问问 to read, create, update, archive, list, search, or create documents/work orders using the provided capabilities.",
    "- When the request includes an explicit workflow/process cue and the available capabilities are not enough to complete the flow end-to-end, prefer mode: delegate over returning mode: chat.",
    "- Use mode: delegate only when the request is clearly a task but cannot be completed with the provided capabilities after reasonable in-system planning; prefer delegateTarget: work-order-longxia for complex work-order execution/planning.",
    "- Prefer a short sequence of provided capabilities over keyword routing. Use only capability names from the list.",
    "- When the user asks to inspect, summarize,整理, compare, or update a known business object, prefer a task plan that starts from in-system read/search capabilities instead of mode: delegate.",
    "- First version should plan simple linear steps. Do not create loops or branches.",
    "- For read-then-change requests, return work_order.read before work_order.update when both are useful.",
    "- If the user describes a document by natural language instead of a clear documentId, use document.search first, then use the matched documentId in later steps if available.",
    "- For document.search, put the user's natural document description in args.query.",
    "- For document.write_content, put the target documentId in args along with the concrete content to write.",
    "- For read-then-update document requests, return document.read before document.write_content when both are useful.",
    "- For work_order.search, put the user's natural object description in args.query.",
    "- For work_order.update, put changed fields directly in args with workOrderNo; do not nest under patch.",
    "- If required information is missing, still return mode: task and the partial steps you can infer, then fill missingInformation and followupQuestion.",
    "- Do not invent identifiers. You may use explicit IDs from the prompt or recent messages.",
    "- Demo data mutations are allowed when the user asks for a concrete change.",
    "- Keep steps to at most 4.",
    "",
    `capabilities:\n${JSON.stringify(capabilities, null, 2)}`,
    "",
    `rollingSummary:\n${rollingSummary}`,
    "",
    `recentMessages:\n${recentMessages}`,
    "",
    `memoryFacts:\n${memoryFacts}`,
    "",
    `userPrompt:\n${input.prompt}`,
  ].join("\n");
}

function buildWorkOrderToolPlannerPrompt(input: ModelWorkOrderToolPlannerInput) {
  const rollingSummary = input.rollingSummary?.trim() || "(none)";
  const recentMessages = safeSlice(input.recentMessages, 8).join("\n") || "(none)";
  const memoryFacts = safeSlice(input.memoryFacts, 6).join("\n") || "(none)";

  return [
    "Return one JSON object only. Do not use markdown fences.",
    "You are BPAI's work-order tool planner. Decide whether the user request should call one work-order tool.",
    "Allowed output schema:",
    '{ "tool": "work_order.read|work_order.create|work_order.update|work_order.archive|none", "args": { ... }, "confidence": 0-100, "reason": "short reason" }',
    "Rules:",
    "- Return tool: none if this is a workflow run, Longxia delegation, OpenClaw execution, general chat, document/form/collaboration task, or ambiguous request.",
    "- For work_order.read: args.workOrderNo is required.",
    "- For work_order.create: args.title is required. Include args.priority/stage/projectName/siteName/sourceSummary/nextAction if clear.",
    "- For work_order.update: args.workOrderNo is required. Use any clear patch fields from: priority, stage, status, nextAction, riskFollowup, title, sourceSummary, projectName, siteName, siteAddress, responsibleTeam, progressSummary, materialCompleteness, missingItemCount, blockingItemCount, warningStatus.",
    "- For work_order.archive: args.workOrderNo is required.",
    "- Do not invent a workOrderNo. You may use the current user prompt, recent messages, or extracted dispatch refs.",
    "- Use canonical enum values when possible.",
    `Allowed priority values: ${WORK_ORDER_TOOL_PLANNER_PRIORITY_VALUES.join(", ")}`,
    `Allowed stage values: ${WORK_ORDER_TOOL_PLANNER_STAGE_VALUES.join(", ")}`,
    `Allowed status values: ${WORK_ORDER_TOOL_PLANNER_STATUS_VALUES.join(", ")}`,
    `Allowed warningStatus values: ${WORK_ORDER_TOOL_PLANNER_WARNING_VALUES.join(", ")}`,
    "- Numeric count/percent fields should be returned as strings if extracted from Chinese text.",
    "- If the user asks 删除/归档/收掉 a work order, use work_order.archive, not a hard delete.",
    "",
    `dispatchHint:\n${JSON.stringify(
      {
        primaryIntent: input.dispatchDecision.primaryIntent,
        targetDomain: input.dispatchDecision.targetDomain,
        executionMode: input.dispatchDecision.executionMode,
        targetRefs: input.dispatchDecision.targetRefs,
        requiresWrite: input.dispatchDecision.requiresWrite,
        suggestedExecutor: input.dispatchDecision.suggestedExecutor,
      },
      null,
      2,
    )}`,
    "",
    `rollingSummary:\n${rollingSummary}`,
    "",
    `recentMessages:\n${recentMessages}`,
    "",
    `memoryFacts:\n${memoryFacts}`,
    "",
    `userPrompt:\n${input.prompt}`,
  ].join("\n");
}

function parseClassification(rawText: string): ModelDispatchClassification | null {
  if (!rawText.trim()) {
    return null;
  }

  const payload = JSON.parse(stripMarkdownFence(rawText)) as {
    primaryIntent?: unknown;
    targetDomain?: unknown;
    executionMode?: unknown;
    confidence?: unknown;
    reason?: unknown;
  };

  if (
    !isPrimaryIntent(String(payload.primaryIntent)) ||
    !isTargetDomain(String(payload.targetDomain)) ||
    !isExecutionMode(String(payload.executionMode))
  ) {
    return null;
  }

  return {
    primaryIntent: String(payload.primaryIntent) as PrimaryIntent,
    targetDomain: String(payload.targetDomain) as TargetDomain,
    executionMode: String(payload.executionMode) as ExecutionMode,
    confidence: clampConfidence(payload.confidence ?? 72),
    reason:
      typeof payload.reason === "string" && payload.reason.trim()
        ? payload.reason.trim()
        : `${resolveModelConfig().provider} dispatch classification`,
  };
}

function isModelWorkOrderToolName(value: string): value is ModelWorkOrderToolName {
  return (WORK_ORDER_TOOL_NAMES as readonly string[]).includes(value);
}

function parseAiCapabilityPlan(
  rawText: string,
  capabilities: AiCapabilityDescriptor[],
): ModelAiCapabilityPlan | null {
  if (!rawText.trim()) {
    return null;
  }

  const payload = JSON.parse(stripMarkdownFence(rawText)) as {
    toolName?: unknown;
    args?: unknown;
    confidence?: unknown;
    reason?: unknown;
  };
  const toolName = typeof payload.toolName === "string" ? payload.toolName.trim() : "";

  if (toolName === "none" || !capabilities.some((capability) => capability.name === toolName)) {
    return null;
  }

  return {
    toolName,
    args: isRecord(payload.args) ? payload.args : {},
    confidence: clampConfidence(payload.confidence ?? 72),
    reason:
      typeof payload.reason === "string" && payload.reason.trim()
        ? payload.reason.trim()
        : `${resolveModelConfig().provider} capability planner`,
  };
}

function isModelAiCapabilityStepPlanMode(value: string): value is ModelAiCapabilityStepPlanMode {
  return value === "chat" || value === "task" || value === "delegate";
}

function parseAiCapabilityStepPlan(
  rawText: string,
  capabilities: AiCapabilityDescriptor[],
): ModelAiCapabilityStepPlan | null {
  if (!rawText.trim()) {
    return null;
  }

  const payload = JSON.parse(stripMarkdownFence(rawText)) as {
    mode?: unknown;
    taskTitle?: unknown;
    steps?: unknown;
    missingInformation?: unknown;
    followupQuestion?: unknown;
    delegateTarget?: unknown;
    delegateReason?: unknown;
    confidence?: unknown;
    reason?: unknown;
  };
  const mode = typeof payload.mode === "string" ? payload.mode.trim() : "";

  if (!isModelAiCapabilityStepPlanMode(mode)) {
    return null;
  }

  const allowedToolNames = new Set(capabilities.map((capability) => capability.name));
  const steps = Array.isArray(payload.steps)
    ? payload.steps
        .map((step, index): ModelAiCapabilityStep | null => {
          if (!isRecord(step)) {
            return null;
          }

          const toolName = readString(step, "toolName");

          if (!allowedToolNames.has(toolName)) {
            return null;
          }

          return {
            stepId: readString(step, "stepId") || `step-${index + 1}`,
            toolName,
            args: isRecord(step.args) ? step.args : {},
            purpose: readString(step, "purpose"),
            requiresPreviousResult: Boolean(step.requiresPreviousResult),
          };
        })
        .filter((step): step is ModelAiCapabilityStep => Boolean(step))
        .slice(0, 4)
    : [];

  if (mode === "task" && steps.length === 0) {
    return null;
  }

  return {
    mode,
    taskTitle: typeof payload.taskTitle === "string" ? payload.taskTitle.trim() : "",
    steps,
    missingInformation: Array.isArray(payload.missingInformation)
      ? payload.missingInformation.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
      : [],
    followupQuestion:
      typeof payload.followupQuestion === "string" ? payload.followupQuestion.trim() : "",
    delegateTarget: typeof payload.delegateTarget === "string" ? payload.delegateTarget.trim() : "",
    delegateReason: typeof payload.delegateReason === "string" ? payload.delegateReason.trim() : "",
    confidence: clampConfidence(payload.confidence ?? 72),
    reason:
      typeof payload.reason === "string" && payload.reason.trim()
        ? payload.reason.trim()
        : `${resolveModelConfig().provider} multi-step capability planner`,
  };
}

function parseWorkOrderToolPlan(
  rawText: string,
  fallbackWorkOrderNo: string,
): ModelWorkOrderToolPlan | null {
  if (!rawText.trim()) {
    return null;
  }

  const payload = JSON.parse(stripMarkdownFence(rawText)) as {
    tool?: unknown;
    args?: unknown;
    confidence?: unknown;
    reason?: unknown;
  };
  const tool = typeof payload.tool === "string" ? payload.tool.trim() : "";

  if (tool === "none" || !isModelWorkOrderToolName(tool)) {
    return null;
  }

  const args = isRecord(payload.args) ? payload.args : {};
  const patch = isRecord(args.patch) ? args.patch : args;
  const workOrderNo = readString(args, "workOrderNo") || fallbackWorkOrderNo;
  const normalizedArgs: ModelWorkOrderToolPlan["args"] = {};

  if (workOrderNo) {
    normalizedArgs.workOrderNo = workOrderNo;
  }

  if (tool === "work_order.create") {
    const title = readString(args, "title");

    if (!title) {
      return null;
    }

    normalizedArgs.title = title;
    normalizedArgs.priority = readString(args, "priority");
    normalizedArgs.stage = readString(args, "stage");
    normalizedArgs.nextAction = readString(args, "nextAction");
    normalizedArgs.sourceSummary = readString(args, "sourceSummary");
    normalizedArgs.projectName = readString(args, "projectName");
    normalizedArgs.siteName = readString(args, "siteName");
    normalizedArgs.siteAddress = readString(args, "siteAddress");
    normalizedArgs.responsibleTeam = readString(args, "responsibleTeam");
  } else if (!workOrderNo) {
    return null;
  }

  if (tool === "work_order.update") {
    normalizedArgs.priority = readString(patch, "priority");
    normalizedArgs.stage = readString(patch, "stage");
    normalizedArgs.status = readString(patch, "status");
    normalizedArgs.nextAction =
      readString(patch, "nextAction") || readString(patch, "next_action");
    normalizedArgs.riskFollowup =
      readString(patch, "riskFollowup") ||
      readString(patch, "risk_followup") ||
      readString(patch, "risk");
    normalizedArgs.title = readString(patch, "title");
    normalizedArgs.sourceSummary =
      readString(patch, "sourceSummary") || readString(patch, "source_summary");
    normalizedArgs.projectName =
      readString(patch, "projectName") || readString(patch, "project_name");
    normalizedArgs.siteName =
      readString(patch, "siteName") || readString(patch, "site_name");
    normalizedArgs.siteAddress =
      readString(patch, "siteAddress") || readString(patch, "site_address");
    normalizedArgs.responsibleTeam =
      readString(patch, "responsibleTeam") ||
      readString(patch, "currentResponsibleTeam") ||
      readString(patch, "responsible_team");
    normalizedArgs.progressSummary =
      readString(patch, "progressSummary") ||
      readString(patch, "latestProgressSummary") ||
      readString(patch, "progress_summary");
    normalizedArgs.materialCompleteness =
      readString(patch, "materialCompleteness") ||
      readString(patch, "material_completeness");
    normalizedArgs.missingItemCount =
      readString(patch, "missingItemCount") || readString(patch, "missing_item_count");
    normalizedArgs.blockingItemCount =
      readString(patch, "blockingItemCount") ||
      readString(patch, "blocking_item_count");
    normalizedArgs.warningStatus =
      readString(patch, "warningStatus") || readString(patch, "warning_status");

    const hasPatch = [
      normalizedArgs.priority,
      normalizedArgs.stage,
      normalizedArgs.status,
      normalizedArgs.nextAction,
      normalizedArgs.riskFollowup,
      normalizedArgs.title,
      normalizedArgs.sourceSummary,
      normalizedArgs.projectName,
      normalizedArgs.siteName,
      normalizedArgs.siteAddress,
      normalizedArgs.responsibleTeam,
      normalizedArgs.progressSummary,
      normalizedArgs.materialCompleteness,
      normalizedArgs.missingItemCount,
      normalizedArgs.blockingItemCount,
      normalizedArgs.warningStatus,
    ].some(Boolean);

    if (!hasPatch) {
      return null;
    }
  }

  return {
    tool,
    args: Object.fromEntries(
      Object.entries(normalizedArgs).filter(([, value]) => Boolean(value)),
    ) as ModelWorkOrderToolPlan["args"],
    confidence: clampConfidence(payload.confidence ?? 72),
    reason:
      typeof payload.reason === "string" && payload.reason.trim()
        ? payload.reason.trim()
        : `${resolveModelConfig().provider} work order tool plan`,
  };
}

function buildRequestBody(
  config: ModelConfig,
  messages: Array<{ role: "system" | "user"; content: string }>,
  maxTokens: number,
  forceJson = false,
) {
  return {
    model: config.model,
    messages,
    max_tokens: maxTokens,
    ...(config.provider === "deepseek"
      ? {
          thinking: {
            type: "disabled",
          },
        }
      : {}),
    ...(forceJson && config.provider === "deepseek"
      ? {
          response_format: {
            type: "json_object",
          },
        }
      : {}),
  };
}

async function postChatCompletion(
  config: ModelConfig,
  body: ReturnType<typeof buildRequestBody>,
  purpose: "CHAT" | "DISPATCH" | "TOOL_PLAN" | "CAPABILITY_PLAN" | "CAPABILITY_STEP_PLAN",
) {
  const response = await fetch(`${trimTrailingSlash(config.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`${config.errorPrefix}_${purpose}_HTTP_${response.status}`);
  }

  return (await response.json()) as ChatResponse;
}

export function hasBpAskModelSupport() {
  return Boolean(resolveModelConfig().apiKey);
}

export function getBpAskModelRuntimeLabel() {
  const config = resolveModelConfig();
  return `${config.provider}:${config.model}`;
}

export async function generateChatReplyWithModel(
  input: ModelChatGenerationInput,
): Promise<string | null> {
  const config = resolveModelConfig();

  if (!config.apiKey) {
    return null;
  }

  const payload = await postChatCompletion(
    config,
    buildRequestBody(
      config,
      [
        {
          role: "system",
          content:
            "你是 BPAI 平台里的 BP问问。你负责电信工程协作场景下的对话承接、任务理解与业务辅助。语气专业、认真、克制。不要把自己说成通用 AI 助手，不要提及百融云创、OpenAI、ChatGPT 等外部品牌，不要虚构未接通能力。",
        },
        {
          role: "user",
          content: buildChatPrompt(input),
        },
      ],
      320,
    ),
    "CHAT",
  );
  const rawText = normalizeMessageContent(payload.choices?.[0]?.message?.content).trim();

  return rawText || null;
}

export async function classifyWithModel(
  input: ModelDispatchInput,
): Promise<ModelDispatchClassification | null> {
  const config = resolveModelConfig();

  if (!config.apiKey) {
    return null;
  }

  const payload = await postChatCompletion(
    config,
    buildRequestBody(
      config,
      [
        {
          role: "system",
          content:
            "You are a BPAI dispatch classifier. Return JSON only and never invent enum values.",
        },
        {
          role: "user",
          content: buildClassifierPrompt(input),
        },
      ],
      256,
      true,
    ),
    "DISPATCH",
  );
  const rawText = normalizeMessageContent(payload.choices?.[0]?.message?.content);

  try {
    return parseClassification(rawText);
  } catch {
    return null;
  }
}

export async function planAiCapabilityWithModel(
  input: ModelAiCapabilityPlannerInput,
): Promise<ModelAiCapabilityPlan | null> {
  const config = resolveModelConfig();

  if (!config.apiKey || input.capabilities.length === 0) {
    return null;
  }

  const payload = await postChatCompletion(
    config,
    buildRequestBody(
      config,
      [
        {
          role: "system",
          content:
            "You are a BPAI capability planner. Return JSON only and use only provided capability names.",
        },
        {
          role: "user",
          content: buildAiCapabilityPlannerPrompt(input),
        },
      ],
      480,
      true,
    ),
    "CAPABILITY_PLAN",
  );
  const rawText = normalizeMessageContent(payload.choices?.[0]?.message?.content);

  try {
    return parseAiCapabilityPlan(rawText, input.capabilities);
  } catch {
    return null;
  }
}

export async function planAiCapabilityStepsWithModel(
  input: ModelAiCapabilityPlannerInput,
): Promise<ModelAiCapabilityStepPlan | null> {
  const config = resolveModelConfig();

  if (!config.apiKey || input.capabilities.length === 0) {
    return null;
  }

  const payload = await postChatCompletion(
    config,
    buildRequestBody(
      config,
      [
        {
          role: "system",
          content:
            "You are a BPAI multi-step capability planner. Return JSON only and use only provided capability names.",
        },
        {
          role: "user",
          content: buildAiCapabilityStepPlannerPrompt(input),
        },
      ],
      900,
      true,
    ),
    "CAPABILITY_STEP_PLAN",
  );
  const rawText = normalizeMessageContent(payload.choices?.[0]?.message?.content);

  try {
    return parseAiCapabilityStepPlan(rawText, input.capabilities);
  } catch {
    return null;
  }
}

export async function refineWorkOrderPatchWithModel(
  input: ModelWorkOrderPatchRefineInput,
): Promise<Record<string, unknown> | null> {
  const config = resolveModelConfig();

  if (!config.apiKey) {
    return null;
  }

  const payload = await postChatCompletion(
    config,
    buildRequestBody(
      config,
      [
        {
          role: "system",
          content:
            "You are a BPAI work-order patch refiner. Return JSON only and fill only clear update args.",
        },
        {
          role: "user",
          content: buildWorkOrderPatchRefinePrompt(input),
        },
      ],
      420,
      true,
    ),
    "CAPABILITY_STEP_PLAN",
  );
  const rawText = normalizeMessageContent(payload.choices?.[0]?.message?.content);

  try {
    const payloadJson = JSON.parse(stripMarkdownFence(rawText)) as {
      args?: unknown;
    };

    return isRecord(payloadJson.args) ? payloadJson.args : null;
  } catch {
    return null;
  }
}

export async function planWorkOrderToolWithModel(
  input: ModelWorkOrderToolPlannerInput,
): Promise<ModelWorkOrderToolPlan | null> {
  const config = resolveModelConfig();

  if (!config.apiKey) {
    return null;
  }

  const payload = await postChatCompletion(
    config,
    buildRequestBody(
      config,
      [
        {
          role: "system",
          content:
            "You are a BPAI work-order tool planner. Return JSON only and use only allowed work-order tool names.",
        },
        {
          role: "user",
          content: buildWorkOrderToolPlannerPrompt(input),
        },
      ],
      320,
      true,
    ),
    "TOOL_PLAN",
  );
  const rawText = normalizeMessageContent(payload.choices?.[0]?.message?.content);

  try {
    return parseWorkOrderToolPlan(
      rawText,
      readDispatchTargetWorkOrderNo(input.dispatchDecision),
    );
  } catch {
    return null;
  }
}
