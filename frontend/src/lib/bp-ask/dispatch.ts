import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/types";
import type {
  ActionCard,
  DispatchExecutionPreview,
  InsightBlock,
} from "@/lib/bp-ask/shared";
import {
  clampConfidence,
  DISPATCH_PRIORITY_LABELS,
  EXECUTION_MODE_LABELS,
  PRIMARY_INTENT_LABELS,
  TARGET_DOMAIN_LABELS,
  type DispatchDecision,
  type DispatchPriority,
  type ExecutionMode,
  type PrimaryIntent,
  type SuggestedExecutor,
  type TargetDomain,
} from "@/lib/bp-ask/intents";
import {
  classifyWithModel,
  generateChatReplyWithModel,
  hasBpAskModelSupport,
  type ModelDispatchClassification,
} from "@/lib/bp-ask/model-provider";

export type DispatchContext = {
  user: AuthenticatedUser;
  prompt: string;
  rollingSummary: string | null;
  recentMessages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    text: string;
  }>;
  memoryFacts: Array<{
    factType: string;
    factKey: string;
    factValue: string;
  }>;
};

export type DispatchResult = {
  decision: DispatchDecision;
  assistantText: string;
  insight: InsightBlock;
  executionPreview: DispatchExecutionPreview;
};

type ScoreMap<T extends string> = Record<T, number>;
type RefMap = Record<string, unknown> | null;
type ConstraintMap = Record<string, unknown> | null;

const WORKSPACE_NAMES = [
  "桥梁送审联动区",
  "设计联审区",
  "仓储运营区",
  "工程异常跟进区",
  "超级电缆",
  "核心机房",
  "合作空间",
  "文档广场",
] as const;

const SYSTEM_FORM_NAMES = [
  "工单台账",
  "材料缺项表",
  "仓库材料总表",
  "仓库主库存表",
  "施工队状态表",
  "系统表单",
  "业务台账",
] as const;

const USER_NAMES = ["Dulongkai Cui", "李工", "周宇", "林敏"] as const;
const CITY_AREAS = [
  "长沙",
  "长沙市",
  "芙蓉区",
  "望城区",
  "雨花区",
  "岳麓区",
  "开福区",
  "天心区",
] as const;
const CAD_EXTENSIONS = ["dwg", "dxf"] as const;
const OFFICE_EXTENSIONS = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf"] as const;
const SMALL_TALK_KEYWORDS = [
  "你好",
  "您好",
  "哈喽",
  "hi",
  "hello",
  "在吗",
  "早上好",
  "晚上好",
  "下午好",
  "中午好",
] as const;
const META_CHAT_KEYWORDS = ["你是谁", "你能做什么", "你会什么", "介绍一下你自己"] as const;
const MEMORY_CHAT_KEYWORDS = ["我们刚刚聊到哪了", "记得我刚刚说的吗"] as const;
const QUERY_REQUEST_KEYWORDS = [
  "查看",
  "看看",
  "看下",
  "查一下",
  "查下",
  "还有哪些",
  "当前有哪些",
  "最近一周有哪些",
  "最近有哪些",
  "待确认意见",
  "最近更新情况",
] as const;
const SUMMARY_REQUEST_KEYWORDS = [
  "总结",
  "汇总",
  "概括",
  "整理",
  "归纳",
  "梳理",
  "帮我总结",
  "帮我归纳",
] as const;
const LIST_REQUEST_KEYWORDS = ["列出", "列一下", "列给我"] as const;
const EXPLICIT_WORKFLOW_KEYWORDS = [
  "自动处理",
  "跑一遍",
  "联动执行",
  "逐步处理",
  "逐步",
  "多步骤",
  "拆成",
  "委托执行",
] as const;
const EXPLICIT_WRITE_KEYWORDS = [
  "创建",
  "新建",
  "修改",
  "更新",
  "调整",
  "改成",
  "改为",
  "设为",
  "设置为",
  "写成",
  "写为",
  "追加",
  "补充",
  "记录为",
  "删除",
  "分配",
  "指派",
  "回写",
  "写入系统",
  "正式回写",
  "改权限",
  "加人",
  "踢人",
] as const;
const VAGUE_REQUEST_KEYWORDS = [
  "帮我处理一下这个",
  "看下这个事情",
  "你帮我安排一下",
  "帮我安排一下",
  "处理一下当前这个",
  "弄一下这个问题",
  "看下这个问题",
] as const;
const VAGUE_OBJECT_KEYWORDS = ["这个", "这件事", "这个事情", "这个问题", "当前这个"] as const;
const VAGUE_ACTION_KEYWORDS = ["处理一下", "看下", "安排一下", "弄一下", "帮我处理"] as const;
const DOMAIN_SIGNAL_KEYS: TargetDomain[] = [
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
] as const;

function includesAny(source: string, keywords: readonly string[]) {
  return keywords.some((keyword) => source.includes(keyword));
}

function isSmallTalk(prompt: string) {
  return includesAny(prompt.toLowerCase(), SMALL_TALK_KEYWORDS) && !isMemoryMetaChat(prompt);
}

function isMetaChat(prompt: string) {
  return includesAny(prompt, META_CHAT_KEYWORDS);
}

function isMemoryMetaChat(prompt: string) {
  return includesAny(prompt, MEMORY_CHAT_KEYWORDS);
}

function shouldEnterTaskDispatch(prompt: string, refs: RefMap, constraints: ConstraintMap) {
  if (isSmallTalk(prompt) || isMetaChat(prompt)) {
    return false;
  }

  if (isMemoryMetaChat(prompt)) {
    return true;
  }

  if (looksLikeVagueRequest(prompt, refs)) {
    return true;
  }

  if (includesAny(prompt, ["记住", "以后都按", "默认记成", "下次也这样"])) {
    return true;
  }

  return (
    hasExplicitTargetRef(refs) ||
    Boolean(constraints) ||
    hasQueryRequestCue(prompt) ||
    hasSummaryRequestCue(prompt) ||
    hasListRequestCue(prompt) ||
    hasExplicitWorkflowCue(prompt) ||
    hasExplicitWriteCue(prompt) ||
    includesAny(prompt, [
      "工单",
      "表单",
      "文档",
      "文件",
      "合作空间",
      "空间",
      "工程队",
      "施工队",
      "图纸",
      "CAD",
      "地图",
      "仓库",
      "库存",
      "材料",
    ])
  );
}

function countStrongDomainCandidates(scores: ScoreMap<TargetDomain>) {
  return DOMAIN_SIGNAL_KEYS.filter((key) => scores[key] >= 70).length;
}

function hasQueryRequestCue(prompt: string) {
  return includesAny(prompt, QUERY_REQUEST_KEYWORDS);
}

function hasSummaryRequestCue(prompt: string) {
  return includesAny(prompt, SUMMARY_REQUEST_KEYWORDS);
}

function hasListRequestCue(prompt: string) {
  return includesAny(prompt, LIST_REQUEST_KEYWORDS);
}

function hasExplicitWorkflowCue(prompt: string) {
  return includesAny(prompt, EXPLICIT_WORKFLOW_KEYWORDS);
}

function hasExplicitWriteCue(prompt: string) {
  return includesAny(prompt, EXPLICIT_WRITE_KEYWORDS);
}

function looksLikeVagueRequest(prompt: string, refs: RefMap) {
  if (hasExplicitTargetRef(refs)) {
    return false;
  }

  return (
    includesAny(prompt, VAGUE_REQUEST_KEYWORDS) ||
    (includesAny(prompt, VAGUE_OBJECT_KEYWORDS) && includesAny(prompt, VAGUE_ACTION_KEYWORDS))
  );
}

function addScore<T extends string>(map: ScoreMap<T>, key: T, value: number) {
  map[key] += value;
}

function buildScoreMap<T extends string>(keys: readonly T[]) {
  return Object.fromEntries(keys.map((key) => [key, 0])) as ScoreMap<T>;
}

function maxKey<T extends string>(map: ScoreMap<T>) {
  return (Object.entries(map) as Array<[T, number]>).sort((a, b) => b[1] - a[1])[0];
}

function normalizePrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ");
}

function compactRecord(record: Record<string, unknown>) {
  return Object.keys(record).length > 0 ? record : null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function normalizeFileName(value: string) {
  return value.trim().replace(/[，。；、】》）】\]】]+$/, "");
}

function extractTargetRefs(prompt: string): RefMap {
  const refs: Record<string, unknown> = {};

  const workspaceName = WORKSPACE_NAMES.find((name) => prompt.includes(name));
  if (workspaceName) {
    refs.workspaceName = workspaceName;
  }

  const formName = SYSTEM_FORM_NAMES.find((name) => prompt.includes(name));
  if (formName) {
    refs.formName = formName;
  }

  const assigneeName = USER_NAMES.find((name) => prompt.includes(name));
  if (assigneeName) {
    refs.assigneeName = assigneeName;
  }

  const workOrderNo =
    prompt.match(/\b(?:WO|PG|GD|WK)(?:[-_ ]?\d+){1,4}\b/i)?.[0] ??
    prompt.match(/\b\d{6,}\b/)?.[0] ??
    null;
  if (workOrderNo) {
    refs.workOrderNo = workOrderNo.replace(/\s+/g, "-").toUpperCase();
  }

  const fileName =
    prompt.match(/[\w\u4e00-\u9fa5.\-]+?\.(?:doc|docx|xls|xlsx|ppt|pptx|pdf|dwg|dxf)/i)?.[0] ??
    null;
  if (fileName) {
    refs.fileName = normalizeFileName(fileName);
  }

  const areaName = CITY_AREAS.find((name) => prompt.includes(name));
  if (areaName) {
    refs.areaName = areaName === "长沙" ? "长沙市" : areaName;
  }

  if (includesAny(prompt, ["工程队", "施工队", "班组", "队伍"])) {
    refs.entityType = "engineering_team";
  }

  if (includesAny(prompt, ["CAD", "dwg", "dxf", "图纸", "蓝图"])) {
    refs.entityType = "cad_asset";
  }

  if (includesAny(prompt, ["地图", "点位", "区域", "预警点"])) {
    refs.entityType = "map_overlay";
  }

  return compactRecord(refs);
}

function extractConstraints(prompt: string): ConstraintMap {
  const constraints: Record<string, unknown> = {};

  if (includesAny(prompt, ["最近一周", "近一周", "过去一周"])) {
    constraints.timeRange = "last_7_days";
  } else if (includesAny(prompt, ["本周", "这周"])) {
    constraints.timeRange = "this_week";
  } else if (prompt.includes("昨天")) {
    constraints.timeRange = "yesterday";
  } else if (prompt.includes("今天")) {
    constraints.timeRange = "today";
  } else if (includesAny(prompt, ["最近24小时", "过去24小时"])) {
    constraints.timeRange = "last_24_hours";
  } else if (includesAny(prompt, ["未来48小时", "48小时"])) {
    constraints.timeRange = "next_48_hours";
  }

  if (
    includesAny(prompt, [
      "当前",
      "这里",
      "这个空间",
      "当前空间",
      "这个表单",
      "当前文件夹",
    ])
  ) {
    constraints.scope = "current_context";
  }

  const topMatch =
    prompt.match(/(?:前|top)\s*(\d+)/i) ??
    prompt.match(/(\d+)\s*(?:个|条|项|份)?\s*(?:重点|结果|对象)?/);
  const limit = topMatch ? Number(topMatch[1]) : 0;
  if (limit > 0) {
    constraints.limit = limit;
  }

  if (includesAny(prompt, ["只读", "不要改", "先别回写", "先不要动"])) {
    constraints.writePolicy = "readonly";
  }

  if (includesAny(prompt, ["正式回写", "直接回写", "写入系统", "直接改系统"])) {
    constraints.writePolicy = "controlled_write";
  }

  if (includesAny(prompt, ["紧急", "立刻", "马上", "立即", "尽快", "今天必须"])) {
    constraints.urgency = "urgent";
  }

  return compactRecord(constraints);
}

function classifyPriority(prompt: string): DispatchPriority {
  if (includesAny(prompt, ["紧急", "立刻", "马上", "立即", "尽快", "今天必须"])) {
    return "urgent";
  }

  if (includesAny(prompt, ["异常", "预警", "风险", "瓶颈", "缺项", "阻塞"])) {
    return "high";
  }

  if (includesAny(prompt, ["顺便", "有空", "稍后"])) {
    return "low";
  }

  return "normal";
}

function scorePrimaryIntent(
  prompt: string,
  refs: RefMap,
  constraints: ConstraintMap,
): ScoreMap<PrimaryIntent> {
  const scores = buildScoreMap<PrimaryIntent>([
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
  ]);

  addScore(scores, "chat_general", 12);
  const queryRequestCue = hasQueryRequestCue(prompt);
  const summaryRequestCue = hasSummaryRequestCue(prompt);
  const listRequestCue = hasListRequestCue(prompt);
  const explicitWorkflowCue = hasExplicitWorkflowCue(prompt);
  const explicitWriteCue = hasExplicitWriteCue(prompt);

  if (prompt.length <= 4) {
    addScore(scores, "clarification", 18);
  }

  if (looksLikeVagueRequest(prompt, refs)) {
    addScore(scores, "clarification", 92);
  }

  if (queryRequestCue) {
    addScore(scores, "status_query", 72);
    addScore(scores, "lookup_entity", 18);
  }

  if (summaryRequestCue) {
    addScore(scores, "summarize", 72);
  }

  if (listRequestCue) {
    addScore(scores, "extract", 72);
  }

  if (includesAny(prompt, ["还记得", "你记得", "之前说过", "上次说过"])) {
    addScore(scores, "memory_query", 92);
  }

  if (includesAny(prompt, ["记住", "以后都按", "默认记成", "下次也这样"])) {
    addScore(scores, "memory_write", 90);
  }

  if (includesAny(prompt, ["怎么用", "如何使用", "帮助", "你能做什么"])) {
    addScore(scores, "help_meta", 84);
  }

  if (includesAny(prompt, ["打开", "进入", "跳到", "查看空间", "带我去"])) {
    addScore(scores, "navigate", 84);
  }

  if (includesAny(prompt, ["删除", "清空回收站", "移入回收站", "踢出", "移除"])) {
    addScore(scores, "delete_object", 94);
  }

  if (includesAny(prompt, ["分配", "指派", "交给", "负责人", "归给"])) {
    addScore(scores, "assign", 88);
  }

  if (includesAny(prompt, ["通知", "提醒", "催办", "发消息给"])) {
    addScore(scores, "notify", 82);
  }

  if (includesAny(prompt, ["新建", "创建", "开一个", "增加一个"])) {
    addScore(scores, "create_object", 84);
  }

  if (
    includesAny(prompt, [
      "修改",
      "更新",
      "调整",
      "改一个",
      "改成",
      "改为",
      "设为",
      "设置为",
      "写成",
      "写为",
      "追加",
      "补充",
      "记录为",
      "回写",
      "编辑",
    ])
  ) {
    addScore(scores, "update_object", 78);
    addScore(scores, "edit_draft", 48);
  }

  if (includesAny(prompt, ["权限", "加人", "踢人", "成员权限", "角色"])) {
    addScore(scores, "permission_change", 86);
  }

  if (includesAny(prompt, ["状态", "进度", "最近更新", "到哪一步", "情况怎么样"])) {
    addScore(scores, "status_query", 78);
  }

  if (includesAny(prompt, ["查找", "找到", "哪一个", "是谁", "在哪儿", "位置"])) {
    addScore(scores, "lookup_entity", 74);
  }

  if (includesAny(prompt, ["总结", "汇总", "概括", "整理一个"])) {
    addScore(scores, "summarize", 80);
  }

  if (includesAny(prompt, ["对比", "比较", "差异", "版本之间"])) {
    addScore(scores, "compare", 82);
  }

  if (includesAny(prompt, ["分析", "识别", "检查", "判断", "风险", "异常", "瓶颈"])) {
    addScore(scores, "analyze", 86);
  }

  if (includesAny(prompt, ["生成", "起草", "写一份", "输出一份", "周报", "报告"])) {
    addScore(scores, "generate", 84);
  }

  if (includesAny(prompt, ["抽取", "提取", "字段", "列出"])) {
    addScore(scores, "extract", 80);
  }

  if (includesAny(prompt, ["拆成", "处理一遍", "跑一遍", "联动", "自动处理", "逐步"])) {
    addScore(scores, "workflow_execute", 86);
  }

  if (includesAny(prompt, ["让龙虾", "调用龙虾", "交给龙虾", "让AI去做", "委托执行"])) {
    addScore(scores, "agent_delegate", 96);
  }

  if (refs?.fileName) {
    addScore(scores, "lookup_entity", 16);
    addScore(scores, "navigate", 12);

    if (!includesAny(prompt, ["生成", "起草", "写一份", "输出一份"])) {
      addScore(scores, "generate", -28);
    }
  }

  if (refs?.workOrderNo) {
    addScore(scores, "lookup_entity", 18);
    addScore(scores, "status_query", 12);
  }

  if (constraints?.writePolicy === "readonly") {
    addScore(scores, "summarize", 8);
    addScore(scores, "analyze", 8);
    addScore(scores, "status_query", 12);
    addScore(scores, "extract", 12);
    addScore(scores, "workflow_execute", -18);
    addScore(scores, "create_object", -18);
    addScore(scores, "update_object", -18);
    addScore(scores, "delete_object", -18);
    addScore(scores, "assign", -18);
    addScore(scores, "permission_change", -18);
  }

  if ((queryRequestCue || summaryRequestCue || listRequestCue) && !explicitWorkflowCue) {
    addScore(scores, "workflow_execute", -54);
  }

  if (!explicitWorkflowCue && WORKSPACE_NAMES.some((name) => prompt.includes(name))) {
    addScore(scores, "workflow_execute", -72);
  }

  if ((queryRequestCue || summaryRequestCue) && !explicitWriteCue) {
    addScore(scores, "generate", -24);
    addScore(scores, "create_object", -20);
    addScore(scores, "update_object", -20);
    addScore(scores, "delete_object", -24);
    addScore(scores, "assign", -24);
    addScore(scores, "permission_change", -24);
  }

  return scores;
}

function scoreTargetDomain(
  prompt: string,
  refs: RefMap,
  primaryIntent?: PrimaryIntent,
): ScoreMap<TargetDomain> {
  const scores = buildScoreMap<TargetDomain>([
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
  ]);

  addScore(scores, "bp_ask", 8);
  addScore(scores, "cross_domain", 10);

  if (
    primaryIntent &&
    ["chat_general", "clarification", "help_meta", "memory_query", "memory_write"].includes(
      primaryIntent,
    )
  ) {
    addScore(scores, "bp_ask", 48);
  }

  if (
    includesAny(prompt, ["系统表单", "总表", "台账", "缺项表", "材料总表", "业务台账"]) ||
    refs?.formName
  ) {
    addScore(scores, "system_form", 90);
  }

  if (includesAny(prompt, ["工单", "派单", "回单", "异常工单"]) || refs?.workOrderNo) {
    addScore(scores, "work_order", 86);
  }

  if (includesAny(prompt, ["仓库", "材料", "库存", "仓储"])) {
    addScore(scores, "warehouse", 82);
  }

  if (
    includesAny(prompt, ["合作空间", "联动区", "运营区", "跟进区", "联审区", "送审", "空间"]) ||
    refs?.workspaceName
  ) {
    addScore(scores, "collaboration_space", 84);
  }

  const fileName = typeof refs?.fileName === "string" ? refs.fileName : null;

  if (
    includesAny(prompt, ["文档", "文件", "周报", "演示", "表格", "我的文档空间"]) ||
    (fileName &&
      OFFICE_EXTENSIONS.some((extension) =>
        fileName.toLowerCase().endsWith(`.${extension}`),
      ))
  ) {
    addScore(scores, "document_space", 80);
  }

  if (
    includesAny(prompt, ["cad", "dwg", "dxf", "图纸", "蓝图"]) ||
    (fileName &&
      CAD_EXTENSIONS.some((extension) =>
        fileName.toLowerCase().endsWith(`.${extension}`),
      ))
  ) {
    addScore(scores, "cad", 92);
  }

  if (includesAny(prompt, ["工程队", "施工队", "班组", "队伍"])) {
    addScore(scores, "engineering_team", 84);
  }

  if (includesAny(prompt, ["地图", "全城", "预警点位", "位置", "定位"])) {
    addScore(scores, "map_dashboard", 82);
  }

  if (includesAny(prompt, ["账号", "用户", "邮箱", "个人账号"])) {
    addScore(scores, "user_account", 70);
  }

  if (includesAny(prompt, ["权限", "角色", "加人", "踢人"])) {
    addScore(scores, "permission_system", 88);
  }

  if (includesAny(prompt, ["AI宿舍", "AI 员工", "执行器", "龙虾"])) {
    addScore(scores, "ai_dorm", 76);
  }

  if (
    includesAny(prompt, ["同时", "一起", "联动", "并且"]) &&
    (scores.system_form > 0 || scores.work_order > 0 || scores.collaboration_space > 0)
  ) {
    addScore(scores, "cross_domain", 24);
  }

  const explicitTargetRefCount = countExplicitTargetRefs(refs);
  const strongDomainCount = countStrongDomainCandidates(scores);

  if (
    includesAny(prompt, ["同时", "一起", "并且"]) &&
    explicitTargetRefCount < 2 &&
    strongDomainCount < 2
  ) {
    addScore(scores, "cross_domain", -24);
  }

  if (
    !includesAny(prompt, ["同时", "一起", "并且"]) &&
    (prompt.includes("联动区") || Boolean(refs?.workspaceName))
  ) {
    addScore(scores, "cross_domain", -24);
  }

  return scores;
}

function shouldClarify(
  prompt: string,
  intent: PrimaryIntent,
  targetDomain: TargetDomain,
  refs: RefMap,
) {
  const hasExplicitRef = hasExplicitTargetRef(refs);

  if (prompt.length < 4) {
    return true;
  }

  if (looksLikeVagueRequest(prompt, refs)) {
    return true;
  }

  if (
    ["assign", "update_object", "delete_object", "permission_change", "navigate"].includes(
      intent,
    ) &&
    !hasExplicitRef
  ) {
    return true;
  }

  if (
    ["workflow_execute", "agent_delegate", "create_object"].includes(intent) &&
    !hasExplicitRef
  ) {
    return true;
  }

  if (
    ["status_query", "lookup_entity", "summarize", "compare", "analyze", "extract"].includes(
      intent,
    ) &&
    !hasExplicitRef &&
    targetDomain === "cross_domain"
  ) {
    return true;
  }

  return false;
}

function buildFollowupQuestion(
  intent: PrimaryIntent,
  targetDomain: TargetDomain,
  refs: RefMap,
) {
  if (refs?.workspaceName || refs?.formName || refs?.fileName || refs?.workOrderNo) {
    return null;
  }

  if (intent === "assign") {
    return "你要把哪一个对象分配给谁？请告诉我具体的表单、空间、工单或负责人。";
  }

  if (intent === "delete_object") {
    return "你要删除的是哪一个对象？请告诉我具体的文件、文件夹、空间成员或系统表单。";
  }

  if (intent === "navigate") {
    return "你想打开哪一个页面或对象？可以直接告诉我合作空间、文档、表单或工单名称。";
  }

  if (intent === "workflow_execute" || intent === "agent_delegate") {
    return "这项任务要作用在哪个对象上？请补充空间名、表单名、文档名或工单号。";
  }

  if (targetDomain === "cross_domain") {
    return "你这次主要想处理哪一类对象？是文档、合作空间、系统表单、工单，还是工程队？";
  }

  return "我还缺一个关键目标对象。你可以补充空间名、表单名、文档名、工单号或负责人。";
}

function deriveExecutionMode(
  intent: PrimaryIntent,
  targetDomain: TargetDomain,
  prompt: string,
): ExecutionMode {
  if (intent === "clarification") {
    return "ask_followup";
  }

  if (intent === "navigate") {
    return "open_target";
  }

  if (intent === "generate" || intent === "edit_draft" || intent === "notify") {
    return "draft_only";
  }

  if (intent === "create_object") {
    return "create_and_route";
  }

  if (intent === "agent_delegate") {
    return "delegate_to_longxia";
  }

  if (intent === "workflow_execute") {
    return includesAny(prompt, ["多步骤", "逐步", "自动处理", "跑一遍"])
      ? "delegate_to_longxia"
      : "start_workflow";
  }

  if (intent === "delete_object" || intent === "assign" || intent === "permission_change") {
    return "write_restricted";
  }

  if (intent === "memory_write") {
    return "write_safe";
  }

  if (intent === "update_object") {
    return targetDomain === "document_space" ? "draft_only" : "write_restricted";
  }

  if (intent === "status_query" || intent === "lookup_entity" || intent === "memory_query") {
    return "retrieve_then_answer";
  }

  if (
    intent === "summarize" ||
    intent === "compare" ||
    intent === "analyze" ||
    intent === "extract"
  ) {
    return "retrieve_and_summarize";
  }

  return "answer_directly";
}

function deriveSuggestedExecutor(
  intent: PrimaryIntent,
  executionMode: ExecutionMode,
  requiresWrite: boolean,
): SuggestedExecutor {
  if (intent === "agent_delegate" || executionMode === "delegate_to_longxia") {
    return "longxia";
  }

  if (
    requiresWrite ||
    executionMode === "write_restricted" ||
    executionMode === "create_and_route"
  ) {
    return "system";
  }

  return "bp_ask";
}

function deriveExpectedOutput(
  intent: PrimaryIntent,
  executionMode: ExecutionMode,
  targetDomain: TargetDomain,
) {
  if (executionMode === "ask_followup") {
    return "clarifying_question";
  }

  if (executionMode === "open_target") {
    return "navigation_target";
  }

  if (intent === "generate") {
    return "draft_document";
  }

  if (intent === "notify") {
    return "notification_draft";
  }

  if (intent === "memory_query") {
    return "memory_recap";
  }

  if (intent === "memory_write") {
    return "memory_confirmation";
  }

  if (intent === "assign") {
    return "assignment_plan";
  }

  if (intent === "delete_object") {
    return "delete_confirmation";
  }

  if (intent === "permission_change") {
    return "permission_change_plan";
  }

  if (intent === "workflow_execute" || executionMode === "delegate_to_longxia") {
    return "workflow_plan";
  }

  if (intent === "extract") {
    return "structured_extract";
  }

  if (intent === "compare") {
    return "comparison_summary";
  }

  if (intent === "analyze") {
    return targetDomain === "map_dashboard" ? "risk_map_summary" : "analysis_summary";
  }

  if (intent === "summarize") {
    return "summary";
  }

  return "direct_answer";
}

function buildToolHints(
  targetDomain: TargetDomain,
  executionMode: ExecutionMode,
  requiresWrite: boolean,
  refs: RefMap,
) {
  const hints = new Set<string>();

  switch (targetDomain) {
    case "document_space":
      hints.add("read_document_space");
      hints.add("open_document");
      break;
    case "collaboration_space":
      hints.add("read_collaboration_space");
      hints.add("read_workspace_feed");
      break;
    case "system_form":
      hints.add("read_system_form");
      break;
    case "work_order":
      hints.add("read_work_order");
      break;
    case "engineering_team":
      hints.add("read_engineering_team");
      break;
    case "warehouse":
      hints.add("read_warehouse_status");
      break;
    case "cad":
      hints.add("open_cad_asset");
      break;
    case "map_dashboard":
      hints.add("read_map_overlay");
      break;
    case "permission_system":
      hints.add("read_member_permissions");
      break;
    case "ai_dorm":
      hints.add("read_ai_agents");
      break;
    default:
      break;
  }

  if (executionMode === "retrieve_then_answer" || executionMode === "retrieve_and_summarize") {
    hints.add("retrieve_context");
  }

  if (executionMode === "open_target") {
    hints.add("navigate_to_target");
  }

  if (executionMode === "delegate_to_longxia" || executionMode === "start_workflow") {
    hints.add("create_execution_task");
  }

  if (requiresWrite) {
    hints.add("validate_write_permission");
  }

  if (refs?.assigneeName) {
    hints.add("resolve_member");
  }

  return [...hints];
}

function buildMemoryScopes(
  targetDomain: TargetDomain,
  needsMemory: boolean,
  refs: RefMap,
) {
  if (!needsMemory) {
    return [];
  }

  const scopes = new Set<string>(["user", "thread"]);

  if (refs?.workspaceName || targetDomain === "collaboration_space") {
    scopes.add("workspace");
    scopes.add("collaboration_space");
  }

  if (refs?.formName || targetDomain === "system_form") {
    scopes.add("system_form");
  }

  if (refs?.fileName || targetDomain === "document_space" || targetDomain === "cad") {
    scopes.add("document");
  }

  if (refs?.workOrderNo || targetDomain === "work_order") {
    scopes.add("work_order");
  }

  return [...scopes];
}

type DispatchClassification = {
  primaryIntent: PrimaryIntent;
  targetDomain: TargetDomain;
  executionMode?: ExecutionMode;
  confidence: number;
  reason: string;
};

function countExplicitTargetRefs(refs: RefMap) {
  if (!refs) {
    return 0;
  }

  const values = [
    refs.workspaceName,
    refs.formName,
    refs.fileName,
    refs.workOrderNo,
    refs.assigneeName,
    refs.entityType,
    refs.areaName,
  ];

  return values.filter(Boolean).length;
}

function hasExplicitTargetRef(refs: RefMap) {
  return countExplicitTargetRefs(refs) > 0;
}

function normalizeTargetDomainForIntent(
  intent: PrimaryIntent,
  targetDomain: TargetDomain,
  refs: RefMap,
): TargetDomain {
  if (
    ["chat_general", "clarification", "help_meta", "memory_query", "memory_write"].includes(
      intent,
    ) &&
    !hasExplicitTargetRef(refs)
  ) {
    return "bp_ask";
  }

  return targetDomain;
}

function buildDispatchDecisionFromClassification(params: {
  prompt: string;
  targetRefs: RefMap;
  constraints: ConstraintMap;
  classification: DispatchClassification;
}): DispatchDecision {
  const normalizedTargetDomain = normalizeTargetDomainForIntent(
    params.classification.primaryIntent,
    params.classification.targetDomain,
    params.targetRefs,
  );
  const clarified = shouldClarify(
    params.prompt,
    params.classification.primaryIntent,
    normalizedTargetDomain,
    params.targetRefs,
  );
  const primaryIntent: PrimaryIntent = clarified
    ? "clarification"
    : params.classification.primaryIntent;
  const targetDomain: TargetDomain = clarified ? "bp_ask" : normalizedTargetDomain;

  const requiresWrite =
    primaryIntent === "assign" ||
    primaryIntent === "create_object" ||
    primaryIntent === "update_object" ||
    primaryIntent === "delete_object" ||
    primaryIntent === "permission_change" ||
    primaryIntent === "memory_write";

  const requiresConfirmation =
    requiresWrite ||
    primaryIntent === "workflow_execute" ||
    primaryIntent === "agent_delegate";

  const needsTools =
    !["chat_general", "help_meta", "memory_write", "clarification"].includes(primaryIntent) ||
    targetDomain !== "bp_ask";

  const needsMemory =
    !["help_meta", "clarification", "navigate"].includes(primaryIntent) ||
    Boolean(params.targetRefs?.workspaceName || params.targetRefs?.formName);

  const executionMode = clarified
    ? "ask_followup"
    : params.classification.executionMode ??
      deriveExecutionMode(primaryIntent, targetDomain, params.prompt);
  const suggestedExecutor = clarified
    ? "bp_ask"
    : deriveSuggestedExecutor(primaryIntent, executionMode, requiresWrite);
  const followupQuestion = clarified
    ? buildFollowupQuestion(
        params.classification.primaryIntent,
        normalizedTargetDomain,
        params.targetRefs,
      )
    : null;

  return {
    primaryIntent,
    targetDomain,
    executionMode,
    confidence: Math.max(24, clampConfidence(params.classification.confidence)),
    reason: params.classification.reason.trim(),
    needsMemory,
    needsTools,
    requiresWrite,
    requiresConfirmation,
    targetRefs: params.targetRefs,
    constraints: params.constraints,
    expectedOutput: deriveExpectedOutput(primaryIntent, executionMode, targetDomain),
    suggestedExecutor,
    toolHints: buildToolHints(targetDomain, executionMode, requiresWrite, params.targetRefs),
    memoryScopes: buildMemoryScopes(targetDomain, needsMemory, params.targetRefs),
    followupQuestion,
    priority: classifyPriority(params.prompt),
  };
}

function buildRuleDecision(prompt: string): DispatchDecision {
  const normalizedPrompt = normalizePrompt(prompt);

  if (!normalizedPrompt) {
    return {
      primaryIntent: "clarification",
      targetDomain: "bp_ask",
      executionMode: "ask_followup",
      confidence: 18,
      reason: "当前输入为空，无法识别有效任务。",
      needsMemory: false,
      needsTools: false,
      requiresWrite: false,
      requiresConfirmation: false,
      targetRefs: null,
      constraints: null,
      expectedOutput: "clarifying_question",
      suggestedExecutor: "bp_ask",
      toolHints: [],
      memoryScopes: [],
      followupQuestion: "你现在想让我帮你处理什么？可以直接说文档、合作空间、系统表单或工单问题。",
      priority: "low",
    };
  }

  const targetRefs = extractTargetRefs(normalizedPrompt);
  const constraints = extractConstraints(normalizedPrompt);

  if (!shouldEnterTaskDispatch(normalizedPrompt, targetRefs, constraints)) {
    const primaryIntent: PrimaryIntent = isMetaChat(normalizedPrompt)
      ? "help_meta"
      : isMemoryMetaChat(normalizedPrompt)
        ? "memory_query"
        : "chat_general";

    return {
      primaryIntent,
      targetDomain: "bp_ask",
      executionMode: "answer_directly",
      confidence: 94,
      reason: isMetaChat(normalizedPrompt)
        ? "识别为 BP问问 元对话/能力询问，当前不进入任务调度。"
        : isMemoryMetaChat(normalizedPrompt)
          ? "识别为轻量上下文回顾，当前不进入任务调度。"
          : "识别为普通对话，当前不进入任务调度。",
      needsMemory: primaryIntent === "memory_query",
      needsTools: false,
      requiresWrite: false,
      requiresConfirmation: false,
      targetRefs: null,
      constraints: null,
      expectedOutput: "direct_answer",
      suggestedExecutor: "bp_ask",
      toolHints: [],
      memoryScopes: primaryIntent === "memory_query" ? ["user", "thread"] : [],
      followupQuestion: null,
      priority: "normal",
    };
  }

  const intentScores = scorePrimaryIntent(normalizedPrompt, targetRefs, constraints);
  const [intent, intentScore] = maxKey(intentScores);
  const domainScores = scoreTargetDomain(normalizedPrompt, targetRefs, intent);
  const [domain, domainScore] = maxKey(domainScores);
  const normalizedDomain = normalizeTargetDomainForIntent(intent, domain, targetRefs);

  const clarified = shouldClarify(normalizedPrompt, intent, normalizedDomain, targetRefs);
  const primaryIntent: PrimaryIntent = clarified ? "clarification" : intent;
  const targetDomain: TargetDomain = clarified ? "bp_ask" : normalizedDomain;

  const requiresWrite =
    primaryIntent === "assign" ||
    primaryIntent === "create_object" ||
    primaryIntent === "update_object" ||
    primaryIntent === "delete_object" ||
    primaryIntent === "permission_change" ||
    primaryIntent === "memory_write";

  const requiresConfirmation =
    requiresWrite ||
    primaryIntent === "workflow_execute" ||
    primaryIntent === "agent_delegate";

  const needsTools =
    !["chat_general", "help_meta", "memory_write", "clarification"].includes(primaryIntent) ||
    targetDomain !== "bp_ask";

  const needsMemory =
    !["help_meta", "clarification", "navigate"].includes(primaryIntent) ||
    Boolean(targetRefs?.workspaceName || targetRefs?.formName);

  const executionMode = clarified
    ? "ask_followup"
    : deriveExecutionMode(primaryIntent, targetDomain, normalizedPrompt);
  const suggestedExecutor = clarified
    ? "bp_ask"
    : deriveSuggestedExecutor(primaryIntent, executionMode, requiresWrite);
  const priority = classifyPriority(normalizedPrompt);

  const confidenceBase =
    42 +
    intentScore * 4 +
    (domainScore > 10 ? 8 : 0) +
    (targetRefs ? 6 : 0) +
    (constraints ? 4 : 0) -
    (clarified ? 24 : 0);
  const confidence = Math.max(24, Math.min(95, Math.round(confidenceBase)));
  const followupQuestion = clarified
    ? buildFollowupQuestion(intent, domain, targetRefs)
    : null;

  const reasonParts = [
    `主意图命中为“${PRIMARY_INTENT_LABELS[primaryIntent]}”`,
    targetDomain !== "bp_ask" ? `目标域偏向“${TARGET_DOMAIN_LABELS[targetDomain]}”` : null,
    targetRefs ? "已经提取到明确对象或名称" : "当前缺少足够的目标对象信息",
    clarified ? "需要先追问澄清" : null,
  ].filter(Boolean);

  return {
    primaryIntent,
    targetDomain,
    executionMode,
    confidence,
    reason: `${reasonParts.join("；")}。`,
    needsMemory,
    needsTools,
    requiresWrite,
    requiresConfirmation,
    targetRefs,
    constraints,
    expectedOutput: deriveExpectedOutput(primaryIntent, executionMode, targetDomain),
    suggestedExecutor,
    toolHints: buildToolHints(targetDomain, executionMode, requiresWrite, targetRefs),
    memoryScopes: buildMemoryScopes(targetDomain, needsMemory, targetRefs),
    followupQuestion,
    priority,
  };
}

function priorityWeight(value: DispatchPriority) {
  switch (value) {
    case "urgent":
      return 4;
    case "high":
      return 3;
    case "normal":
      return 2;
    default:
      return 1;
  }
}

function combineDecision(
  ruleDecision: DispatchDecision,
  modelDecision: DispatchDecision,
): DispatchDecision {
  const preferModel =
    modelDecision.confidence >= ruleDecision.confidence + 6 ||
    ruleDecision.primaryIntent === "clarification" ||
    ruleDecision.targetDomain === "cross_domain";

  const primary = preferModel ? modelDecision : ruleDecision;
  const secondary = preferModel ? ruleDecision : modelDecision;

  const combinedRequiresWrite = primary.requiresWrite || secondary.requiresWrite;
  const combinedRequiresConfirmation =
    primary.requiresConfirmation || secondary.requiresConfirmation || combinedRequiresWrite;

  const mergedTargetRefs =
    primary.targetRefs || secondary.targetRefs
      ? { ...(secondary.targetRefs ?? {}), ...(primary.targetRefs ?? {}) }
      : null;

  const mergedConstraints =
    primary.constraints || secondary.constraints
      ? { ...(secondary.constraints ?? {}), ...(primary.constraints ?? {}) }
      : null;

  const toolHints = uniqueStrings([...primary.toolHints, ...secondary.toolHints]);
  const memoryScopes = uniqueStrings([...primary.memoryScopes, ...secondary.memoryScopes]);

  const suggestedExecutor: SuggestedExecutor =
    primary.suggestedExecutor === "longxia" || secondary.suggestedExecutor === "longxia"
      ? "longxia"
      : combinedRequiresWrite ||
          primary.suggestedExecutor === "system" ||
          secondary.suggestedExecutor === "system"
        ? "system"
        : primary.suggestedExecutor;

  const priority =
    priorityWeight(primary.priority) >= priorityWeight(secondary.priority)
      ? primary.priority
      : secondary.priority;

  return {
    ...primary,
    confidence: Math.max(primary.confidence, secondary.confidence),
    needsMemory: primary.needsMemory || secondary.needsMemory,
    needsTools: primary.needsTools || secondary.needsTools,
    requiresWrite: combinedRequiresWrite,
    requiresConfirmation: combinedRequiresConfirmation,
    targetRefs: mergedTargetRefs,
    constraints: mergedConstraints,
    expectedOutput: primary.expectedOutput ?? secondary.expectedOutput,
    suggestedExecutor,
    toolHints,
    memoryScopes,
    followupQuestion: primary.followupQuestion ?? secondary.followupQuestion,
    priority,
    reason: `${primary.reason} 模型复核：${modelDecision.reason}`,
  };
}

function pickBars(decision: DispatchDecision) {
  const confidence = Math.max(18, Math.min(100, decision.confidence));

  return [
    Math.max(18, Math.round(confidence * 0.4)),
    Math.max(22, Math.round(confidence * 0.56)),
    Math.max(24, Math.round(confidence * 0.68)),
    confidence,
    decision.needsTools ? Math.max(28, confidence - 10) : Math.max(16, confidence - 26),
    decision.requiresConfirmation
      ? Math.max(28, confidence - 6)
      : Math.max(14, confidence - 30),
  ];
}

function buildActions(decision: DispatchDecision): ActionCard[] {
  const actions: ActionCard[] = [
    {
      title: `主意图：${PRIMARY_INTENT_LABELS[decision.primaryIntent]}`,
      subtitle: `${TARGET_DOMAIN_LABELS[decision.targetDomain]} / ${EXECUTION_MODE_LABELS[decision.executionMode]}`,
      tone: "blue",
    },
  ];

  if (decision.suggestedExecutor === "longxia") {
    actions.push({
      title: "委托龙虾执行",
      subtitle: "这条请求更适合拆成多步骤任务，进入执行器链路。",
      tone: "purple",
    });
  } else if (decision.requiresWrite) {
    actions.push({
      title: "等待人工确认",
      subtitle: "当前动作涉及正式写入、分配、删除或权限变更，执行前需要确认。",
      tone: "emerald",
    });
  } else {
    actions.push({
      title: "先在问问内处理",
      subtitle: "优先读取上下文和目标对象，再生成总结、草稿或下一步建议。",
      tone: "emerald",
    });
  }

  if (decision.followupQuestion) {
    actions.push({
      title: "继续补充信息",
      subtitle: decision.followupQuestion,
      tone: "purple",
    });
  }

  return actions.slice(0, 3);
}

function buildInsight(decision: DispatchDecision): InsightBlock {
  const executorLabel =
    decision.suggestedExecutor === "longxia"
      ? "龙虾执行器"
      : decision.suggestedExecutor === "system"
        ? "系统受控写入"
        : decision.suggestedExecutor === "kimi"
          ? "模型结构化分类"
          : "BP问问内部处理";

  const findings = [
    `识别为“${PRIMARY_INTENT_LABELS[decision.primaryIntent]}”，目标域为“${TARGET_DOMAIN_LABELS[decision.targetDomain]}”。`,
    `执行模式是“${EXECUTION_MODE_LABELS[decision.executionMode]}”，优先级为“${DISPATCH_PRIORITY_LABELS[decision.priority]}”。`,
    `建议执行器：${executorLabel}。`,
    decision.toolHints.length > 0
      ? `建议工具：${decision.toolHints.join(" / ")}。`
      : "当前不需要额外工具即可先处理。",
  ];

  if (decision.followupQuestion) {
    findings.push(`仍需补充：${decision.followupQuestion}`);
  }

  return {
    metric: "DISPATCH PLAN",
    status: EXECUTION_MODE_LABELS[decision.executionMode],
    bars: pickBars(decision),
    findings,
    actions: buildActions(decision),
    summary: `识别置信度 ${decision.confidence}% 。${decision.reason}`,
  };
}

function buildExecutionPreview(decision: DispatchDecision): DispatchExecutionPreview {
  const targetLabel = TARGET_DOMAIN_LABELS[decision.targetDomain];
  const modeLabel = EXECUTION_MODE_LABELS[decision.executionMode];
  const targetText = decision.targetRefs
    ? JSON.stringify(decision.targetRefs)
    : "尚未锁定明确业务对象";
  const constraintText = decision.constraints
    ? JSON.stringify(decision.constraints)
    : "暂无额外约束";

  if (decision.executionMode === "ask_followup") {
    return {
      mode: "simulation",
      title: "模拟执行：等待补充信息",
      summary: `我已识别这是一个需要澄清的请求，当前不会触发真实工具或写入。`,
      nextStep: decision.followupQuestion ?? "请补充目标对象、范围或希望采取的动作。",
      safety: "安全：未调用外部工具，未写入业务对象。",
      simulatedActions: [
        "保留当前对话上下文",
        "等待用户补充目标对象或操作范围",
        "补充后重新进入 dispatch 判断",
      ],
    };
  }

  if (decision.requiresWrite) {
    return {
      mode: "simulation",
      title: `模拟执行：${targetLabel}受控写入预案`,
      summary: `这次请求被识别为“${PRIMARY_INTENT_LABELS[decision.primaryIntent]}”，涉及正式写入或权限/分配变更。`,
      nextStep: `真实执行前应先展示写入预案并等待人工确认；当前目标：${targetText}；约束：${constraintText}。`,
      safety: "安全：当前仅生成模拟预案，不调用真实写入 API，不修改数据库业务对象。",
      simulatedActions: [
        "校验当前用户是否有写入权限",
        "生成待确认的变更摘要",
        "等待用户确认后再交给真实工具链执行",
      ],
    };
  }

  if (decision.executionMode === "delegate_to_longxia") {
    return {
      mode: "simulation",
      title: "模拟执行：龙虾委托任务草案",
      summary: `这次请求适合委托执行器处理，建议执行器是“${decision.suggestedExecutor}”。`,
      nextStep: `真实 LongxiaAdapter 尚未接入；当前只生成执行任务草案，目标：${targetText}。`,
      safety: "安全：未调用龙虾/浏览器执行器，未触发外部自动化动作。",
      simulatedActions: [
        "创建执行任务草案",
        "准备目标对象和约束参数",
        "等待 LongxiaAdapter 接入后再触发真实执行",
      ],
    };
  }

  if (
    decision.executionMode === "retrieve_then_answer" ||
    decision.executionMode === "retrieve_and_summarize"
  ) {
    return {
      mode: "simulation",
      title: `模拟执行：${targetLabel}上下文读取`,
      summary: `这次请求被识别为只读的“${PRIMARY_INTENT_LABELS[decision.primaryIntent]}”，应先读取相关上下文再回答。`,
      nextStep: `真实工具链接入后，应按工具提示读取：${decision.toolHints.join(" / ") || "retrieve_context"}。当前目标：${targetText}；约束：${constraintText}。`,
      safety: "安全：当前只模拟读取计划，不访问真实业务读取工具之外的新链路，不执行写入。",
      simulatedActions: [
        `定位${targetLabel}对象`,
        "读取相关上下文和最近动态",
        decision.executionMode === "retrieve_and_summarize"
          ? "汇总为可读摘要"
          : "返回匹配对象与当前状态",
      ],
    };
  }

  if (decision.executionMode === "open_target") {
    return {
      mode: "simulation",
      title: "模拟执行：导航目标解析",
      summary: `这次请求应打开或定位到${targetLabel}对象。`,
      nextStep: `真实导航工具接入后，应根据目标对象生成可打开路径；当前目标：${targetText}。`,
      safety: "安全：当前不自动跳转页面，只返回模拟导航计划。",
      simulatedActions: ["解析目标对象", "生成候选跳转路径", "等待前端导航能力接入"],
    };
  }

  return {
    mode: "simulation",
    title: `模拟执行：${modeLabel}`,
    summary: `这次请求被识别为“${PRIMARY_INTENT_LABELS[decision.primaryIntent]}”，目标域是“${targetLabel}”。`,
    nextStep: `当前先由 BP问问给出受控模拟反馈；目标：${targetText}；约束：${constraintText}。`,
    safety: "安全：未调用真实工具链，未写入业务对象。",
    simulatedActions: ["记录调度判断", "生成下一步处理计划", "等待真实工具链接入"],
  };
}

function readTargetLabel(decision: DispatchDecision) {
  if (decision.targetRefs?.workspaceName && typeof decision.targetRefs.workspaceName === "string") {
    return `「${decision.targetRefs.workspaceName}」`;
  }

  if (decision.targetRefs?.formName && typeof decision.targetRefs.formName === "string") {
    return `「${decision.targetRefs.formName}」`;
  }

  if (decision.targetRefs?.fileName && typeof decision.targetRefs.fileName === "string") {
    return `「${decision.targetRefs.fileName}」`;
  }

  if (decision.targetRefs?.workOrderNo && typeof decision.targetRefs.workOrderNo === "string") {
    return `「${decision.targetRefs.workOrderNo}」`;
  }

  if (decision.targetRefs?.areaName && typeof decision.targetRefs.areaName === "string") {
    return `「${decision.targetRefs.areaName}」`;
  }

  return TARGET_DOMAIN_LABELS[decision.targetDomain];
}

function buildAssistantText(
  decision: DispatchDecision,
  executionPreview: DispatchExecutionPreview,
  userName: string,
) {
  const targetLabel = readTargetLabel(decision);

  if (decision.followupQuestion) {
    return [
      `${userName}，我先接住你的这句话了。`,
      `不过现在还缺一个关键对象或范围，所以我还不能往下处理。`,
      `你可以直接补一句：${decision.followupQuestion}`,
    ].join(" ");
  }

  if (decision.primaryIntent === "help_meta") {
    return [
      `${userName}，我是 BPAI 里的 BP问问。`,
      `你可以直接跟我说想查哪个工单、看哪个合作空间、总结哪些问题，或者让我记住你的偏好。`,
      `如果你明确交代任务，我会自然进入处理流程；如果只是聊天，我就先按聊天来接。`,
    ].join(" ");
  }

  if (decision.primaryIntent === "memory_query") {
    return [
      `${userName}，我可以继续沿着当前线程和已保存的记忆来接话。`,
      `你可以直接问我“我们刚刚聊到哪了”或者继续补一句具体对象，我会尽量顺着上下文往下走。`,
    ].join(" ");
  }

  if (decision.primaryIntent === "chat_general" && decision.executionMode === "answer_directly") {
    return [
      `${userName}，你好，我在。`,
      `你可以直接告诉我想查什么、整理什么，或者想推进哪个工单/空间/文档。`,
    ].join(" ");
  }

  if (decision.executionMode === "retrieve_then_answer") {
    return [
      `${userName}，我理解你的意思了：你想查看 ${targetLabel} 里的相关状态。`,
      `${executionPreview.summary}`,
      `当前工具链还在接入中，所以我先按模拟执行返回下一步计划，不会改动任何数据。`,
    ].join(" ");
  }

  if (decision.executionMode === "retrieve_and_summarize") {
    return [
      `${userName}，我已经把这次请求理解成一个“先读取、再整理”的问题。`,
      `目标对象是 ${targetLabel}。`,
      `${executionPreview.summary}`,
      `等真实读取链路接上后，我会把结果整理成更像正式回答的摘要。`,
    ].join(" ");
  }

  if (decision.requiresWrite) {
    return [
      `${userName}，我理解你的目标了，这次请求会影响系统对象。`,
      `${executionPreview.summary}`,
      `当前我只返回模拟执行预案，不会直接写入真实业务对象。`,
    ].join(" ");
  }

  if (decision.suggestedExecutor === "longxia") {
    return [
      `${userName}，这次请求更像一个要交给执行器处理的任务。`,
      `${executionPreview.summary}`,
      `Longxia 真实执行链还没接上，所以现在先给你一份委托草案。`,
    ].join(" ");
  }

  return [
    `${userName}，我已经接住你的问题了。`,
    `这次请求当前被归到 ${TARGET_DOMAIN_LABELS[decision.targetDomain]}。`,
    `${executionPreview.summary}`,
    `当前先按模拟执行方式继续，等真实工具链接上后再替换成正式动作。`,
  ].join(" ");
}

function shouldUseModelForChat(decision: DispatchDecision) {
  return (
    decision.targetDomain === "bp_ask" &&
    decision.executionMode === "answer_directly" &&
    (decision.primaryIntent === "chat_general" ||
      decision.primaryIntent === "help_meta" ||
      decision.primaryIntent === "memory_query")
  );
}

function shouldUseModelForDecision(decision: DispatchDecision) {
  return (
    decision.confidence < 84 ||
    decision.primaryIntent === "clarification" ||
    decision.targetDomain === "cross_domain" ||
    decision.executionMode === "delegate_to_longxia" ||
    decision.executionMode === "write_restricted" ||
    decision.primaryIntent === "workflow_execute"
  );
}

export async function dispatchBpAskPrompt(
  context: DispatchContext,
): Promise<DispatchResult> {
  const normalizedPrompt = normalizePrompt(context.prompt);
  const ruleDecision = buildRuleDecision(normalizedPrompt);
  let decision = ruleDecision;

  if (hasBpAskModelSupport() && shouldUseModelForDecision(ruleDecision)) {
    try {
      const modelDecision = await classifyWithModel({
        prompt: normalizedPrompt,
        rollingSummary: context.rollingSummary,
        recentMessages: context.recentMessages.map((item) => `${item.role}: ${item.text}`),
        memoryFacts: context.memoryFacts.map(
          (item) => `${item.factType}/${item.factKey}: ${item.factValue}`,
        ),
      });

      if (modelDecision) {
        decision = combineDecision(
          ruleDecision,
          buildDispatchDecisionFromClassification({
            prompt: normalizedPrompt,
            targetRefs: ruleDecision.targetRefs,
            constraints: ruleDecision.constraints,
            classification: modelDecision satisfies ModelDispatchClassification,
          }),
        );
      }
    } catch {
      decision = ruleDecision;
    }
  }

  const executionPreview = buildExecutionPreview(decision);
  const insight = buildInsight(decision);
  let assistantText = buildAssistantText(
    decision,
    executionPreview,
    context.user.name,
  );

  if (hasBpAskModelSupport() && shouldUseModelForChat(decision)) {
    try {
      const modelChatReply = await generateChatReplyWithModel({
        prompt: normalizedPrompt,
        userName: context.user.name,
        rollingSummary: context.rollingSummary,
        recentMessages: context.recentMessages.map((item) => `${item.role}: ${item.text}`),
      });

      if (modelChatReply) {
        assistantText = modelChatReply;
      }
    } catch {
      assistantText = buildAssistantText(
        decision,
        executionPreview,
        context.user.name,
      );
    }
  }

  return {
    decision,
    assistantText,
    insight,
    executionPreview,
  };
}
