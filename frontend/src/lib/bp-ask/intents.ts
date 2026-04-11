export const PRIMARY_INTENTS = [
  "chat_general",
  "clarification",
  "status_query",
  "lookup_entity",
  "summarize",
  "compare",
  "analyze",
  "generate",
  "extract",
  "edit_draft",
  "navigate",
  "assign",
  "notify",
  "create_object",
  "update_object",
  "delete_object",
  "permission_change",
  "workflow_execute",
  "agent_delegate",
  "memory_query",
  "memory_write",
  "help_meta",
] as const;

export const TARGET_DOMAINS = [
  "document_space",
  "collaboration_space",
  "system_form",
  "work_order",
  "engineering_team",
  "warehouse",
  "cad",
  "map_dashboard",
  "user_account",
  "permission_system",
  "ai_dorm",
  "bp_ask",
  "cross_domain",
] as const;

export const EXECUTION_MODES = [
  "answer_directly",
  "retrieve_then_answer",
  "retrieve_and_summarize",
  "open_target",
  "draft_only",
  "write_safe",
  "write_restricted",
  "create_and_route",
  "delegate_to_longxia",
  "start_workflow",
  "ask_followup",
] as const;

export const DISPATCH_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const SUGGESTED_EXECUTORS = ["bp_ask", "kimi", "longxia", "system"] as const;

export type PrimaryIntent = (typeof PRIMARY_INTENTS)[number];
export type TargetDomain = (typeof TARGET_DOMAINS)[number];
export type ExecutionMode = (typeof EXECUTION_MODES)[number];
export type DispatchPriority = (typeof DISPATCH_PRIORITIES)[number];
export type SuggestedExecutor = (typeof SUGGESTED_EXECUTORS)[number];

export type DispatchDecision = {
  primaryIntent: PrimaryIntent;
  targetDomain: TargetDomain;
  executionMode: ExecutionMode;
  confidence: number;
  reason: string;
  needsMemory: boolean;
  needsTools: boolean;
  requiresWrite: boolean;
  requiresConfirmation: boolean;
  targetRefs: Record<string, unknown> | null;
  constraints: Record<string, unknown> | null;
  expectedOutput: string | null;
  suggestedExecutor: SuggestedExecutor;
  toolHints: string[];
  memoryScopes: string[];
  followupQuestion: string | null;
  priority: DispatchPriority;
};

export const PRIMARY_INTENT_LABELS: Record<PrimaryIntent, string> = {
  chat_general: "普通对话",
  clarification: "澄清追问",
  status_query: "状态查询",
  lookup_entity: "定位对象",
  summarize: "总结归纳",
  compare: "比较分析",
  analyze: "分析判断",
  generate: "生成内容",
  extract: "抽取字段",
  edit_draft: "修改草稿",
  navigate: "页面跳转",
  assign: "分配动作",
  notify: "通知提醒",
  create_object: "创建对象",
  update_object: "更新对象",
  delete_object: "删除对象",
  permission_change: "权限变更",
  workflow_execute: "执行流程",
  agent_delegate: "委托执行",
  memory_query: "查询记忆",
  memory_write: "写入记忆",
  help_meta: "系统帮助",
};

export const TARGET_DOMAIN_LABELS: Record<TargetDomain, string> = {
  document_space: "文档空间",
  collaboration_space: "合作空间",
  system_form: "系统表单",
  work_order: "工单",
  engineering_team: "工程队",
  warehouse: "仓储业务",
  cad: "CAD 图纸",
  map_dashboard: "总览地图",
  user_account: "用户账号",
  permission_system: "权限系统",
  ai_dorm: "AI 宿舍",
  bp_ask: "BP问问",
  cross_domain: "跨域任务",
};

export const EXECUTION_MODE_LABELS: Record<ExecutionMode, string> = {
  answer_directly: "直接回答",
  retrieve_then_answer: "检索后回答",
  retrieve_and_summarize: "检索后总结",
  open_target: "打开目标",
  draft_only: "生成草稿",
  write_safe: "安全写入",
  write_restricted: "受限写入",
  create_and_route: "创建并路由",
  delegate_to_longxia: "委托龙虾执行",
  start_workflow: "启动流程",
  ask_followup: "继续追问",
};

export const DISPATCH_PRIORITY_LABELS: Record<DispatchPriority, string> = {
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
};

export function isPrimaryIntent(value: string): value is PrimaryIntent {
  return (PRIMARY_INTENTS as readonly string[]).includes(value);
}

export function isTargetDomain(value: string): value is TargetDomain {
  return (TARGET_DOMAINS as readonly string[]).includes(value);
}

export function isExecutionMode(value: string): value is ExecutionMode {
  return (EXECUTION_MODES as readonly string[]).includes(value);
}

export function isDispatchPriority(value: string): value is DispatchPriority {
  return (DISPATCH_PRIORITIES as readonly string[]).includes(value);
}

export function isSuggestedExecutor(value: string): value is SuggestedExecutor {
  return (SUGGESTED_EXECUTORS as readonly string[]).includes(value);
}

export function clampConfidence(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}
