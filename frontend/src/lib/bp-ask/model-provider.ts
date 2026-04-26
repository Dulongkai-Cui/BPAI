import "server-only";

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
  purpose: "CHAT" | "DISPATCH" | "TOOL_PLAN",
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
