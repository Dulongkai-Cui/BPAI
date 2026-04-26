export type BpAskActionTone = "blue" | "purple" | "emerald";

export type QuickAction = {
  title: string;
  tone: BpAskActionTone;
};

export type ActionCard = {
  title: string;
  subtitle: string;
  tone: BpAskActionTone;
};

export type InsightBlock = {
  metric: string;
  status: string;
  bars: number[];
  findings: string[];
  actions: ActionCard[];
  summary: string;
};

export type DispatchExecutionPreview = {
  mode: "simulation" | "tool_result" | "skill_result" | "workflow_result";
  title: string;
  summary: string;
  nextStep: string;
  safety: string;
  simulatedActions: string[];
  toolRuns?: Array<{
    toolName: string;
    status: string;
    summaryText: string;
  }>;
  agentRuns?: Array<{
    agentId: string;
    mode: string;
    status: string;
    summaryText: string;
  }>;
  confirmationRequests?: Array<{
    requestId: string;
    title: string;
    description: string;
    riskLevel: string;
    status: "waiting" | "approved" | "rejected" | "deferred" | string;
    decidedAt?: string;
    decidedByUserName?: string;
  }>;
  confirmationEvaluation?: {
    state:
      | "not_required"
      | "waiting_confirmation"
      | "blocked_by_rejection"
      | "paused_by_defer"
      | "ready_to_continue"
      | string;
    summary: string;
    nextStep: string;
    counts: {
      total: number;
      waiting: number;
      approved: number;
      rejected: number;
      deferred: number;
    };
  };
  postConfirmationRun?: {
    runId: string;
    mode: "dry_run" | string;
    status: "completed" | "failed" | string;
    summaryText: string;
    planSteps: string[];
    safeguards: string[];
    nextStep: string;
    createdAt: string;
    createdByUserName: string;
  };
  writebackCandidates?: Array<{
    objectType: string;
    objectRef: string;
    operation: string;
    proposedValue: string;
    requiresConfirmation: boolean;
    status: string;
  }>;
  writebackDrafts?: Array<{
    draftId: string;
    objectType: string;
    objectRef: string;
    operation: string;
    proposedValue: string;
    requiresConfirmation: boolean;
    status: string;
    source?: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    reviewedAt?: string | null;
    reviewedByUserName?: string | null;
    reviewAction?: string | null;
    appliedAt?: string | null;
    appliedByUserName?: string | null;
  }>;
  changedObjects?: string[];
};

export type BpAskMessageRole = "system" | "user" | "assistant" | "tool";

export type BpAskMessage = {
  id: string;
  role: BpAskMessageRole;
  text: string;
  createdAt: string;
  executionResultId?: string;
  insight?: InsightBlock;
  executionPreview?: DispatchExecutionPreview;
};

export type BpAskThreadAccent = "blue" | "violet" | "emerald" | "amber";

export type BpAskThreadSummary = {
  id: string;
  title: string;
  updatedAt: string;
  lastMessagePreview: string;
  accent: BpAskThreadAccent;
};

export type BpAskThreadDetail = BpAskThreadSummary & {
  messages: BpAskMessage[];
  rollingSummary: string | null;
};

export const threadAccents: BpAskThreadAccent[] = [
  "blue",
  "violet",
  "emerald",
  "amber",
];

export const quickActions: QuickAction[] = [
  { title: "生成周报", tone: "blue" },
  { title: "查看项目延期", tone: "purple" },
  { title: "汇总系统表单", tone: "emerald" },
];

export const composerExamples = [
  "帮我总结仓储运营区最近一周的缺项重点。",
  "查看桥梁送审联动区还有哪些待确认意见。",
  "把本周异常工单的风险点归纳成 3 类。",
  "检查仓库材料总表近一周的更新缺口。",
];

export function createNewThreadLabel(existingCount: number) {
  return `新对话 ${existingCount + 1}`;
}

export function threadTitleFromPrompt(prompt: string) {
  const compact = prompt.trim().replace(/\s+/g, " ");
  if (!compact) {
    return "新对话";
  }

  return compact.length > 22 ? `${compact.slice(0, 22)}...` : compact;
}

export function pickThreadAccent(threadId: string): BpAskThreadAccent {
  const value = threadId
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return threadAccents[value % threadAccents.length];
}

export function previewFromText(text: string) {
  const compact = text.trim().replace(/\s+/g, " ");
  if (!compact) {
    return "还没有消息，点击来继续开始。";
  }

  return compact.length > 32 ? `${compact.slice(0, 32)}...` : compact;
}
