import "server-only";

import { desc, eq } from "drizzle-orm";
import { cache } from "react";

import {
  EXECUTION_MODE_LABELS,
  PRIMARY_INTENT_LABELS,
  TARGET_DOMAIN_LABELS,
  type ExecutionMode,
  type PrimaryIntent,
  type TargetDomain,
} from "@/lib/bp-ask/intents";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { getBrowserStateForUser } from "@/lib/content/browser-state";
import { listAssetsForUser } from "@/lib/content/server";
import { getDb } from "@/lib/db/client";
import {
  conversationThreads,
  executionResults,
  executionTasks,
} from "@/lib/db/schema";
import { documentFolders } from "@/lib/docs/mock-data";
import { getOpenClawConsoleEntryForAgent } from "@/lib/ai-dorm/openclaw";
import {
  getAiProductionApiKeyRecords,
  getAiProductionCommandPresets,
  getAiProductionSkillPackages,
  type AiProductionApiKeyRecord,
  type AiProductionCommandPreset,
  type AiProductionSkillPackage,
} from "@/lib/ai-dorm/production-assets";
import { getSpacesForUser } from "@/lib/workspace/server";

type JsonRecord = Record<string, unknown> | null;
type WorkflowNodeKind =
  | "input"
  | "skill"
  | "agent"
  | "condition"
  | "human"
  | "output";
type SkillSourceKind = "upload" | "template" | "bp_ask_draft";

type AgentBlueprint = {
  id: string;
  name: string;
  domains: TargetDomain[];
  statusLabel: string;
  description: string;
  ownerLabel: string;
  protocolSummary: string;
  capabilityTags: string[];
};

type AgentConsoleEntry = {
  href: string;
  label: string;
  note: string;
};

type SkillBlueprint = {
  id: string;
  name: string;
  summary: string;
  category: string;
  sourceKind: SkillSourceKind;
  statusLabel: string;
  inputSummary: string;
  outputSummary: string;
  linkedWorkflowIds: string[];
  linkedAgentIds: string[];
  updatedAt: string;
};

type WorkflowBlueprint = {
  id: string;
  name: string;
  goal: string;
  enabled: boolean;
  description: string;
  recentRunSummary: string;
  steps: Array<{
    id: string;
    title: string;
    kind: WorkflowNodeKind;
    description: string;
    column: 1 | 2 | 3;
    row: number;
    nextIds: string[];
  }>;
  linkedSkillIds: string[];
  linkedAgentIds: string[];
};

export type AiDormTaskRecord = {
  taskId: string;
  threadId: string;
  threadTitle: string;
  goal: string;
  primaryIntent: PrimaryIntent | string;
  primaryIntentLabel: string;
  targetDomain: TargetDomain | string;
  targetDomainLabel: string;
  executionMode: ExecutionMode | string;
  executionModeLabel: string;
  executorKind: string;
  status: string;
  resultStatus: string | null;
  confidence: number;
  requiresWrite: boolean;
  requiresConfirmation: boolean;
  needsMemory: boolean;
  needsTools: boolean;
  createdAt: string;
  updatedAt: string;
  targetRefs: JsonRecord;
  constraints: JsonRecord;
  metadata: JsonRecord;
  result: {
    summaryText: string;
    responseText: string;
    structuredPayload: JsonRecord;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type AiDormAgentCard = {
  id: string;
  name: string;
  domainLabels: string[];
  statusLabel: string;
  description: string;
  ownerLabel: string;
  protocolSummary: string;
  capabilityTags: string[];
  recentTaskCount: number;
  consoleEntry: AgentConsoleEntry | null;
};

export type AiDormSkillCard = {
  id: string;
  name: string;
  summary: string;
  category: string;
  sourceKind: SkillSourceKind;
  statusLabel: string;
  inputSummary: string;
  outputSummary: string;
  linkedWorkflowNames: string[];
  linkedAgentNames: string[];
  updatedAt: string;
};

export type AiDormWorkflowCard = {
  id: string;
  name: string;
  goal: string;
  stepCount: number;
  enabled: boolean;
  description: string;
  recentRunSummary: string;
  linkedSkillNames: string[];
  linkedAgentNames: string[];
  steps: Array<{
    id: string;
    title: string;
    kind: WorkflowNodeKind;
    description: string;
    column: 1 | 2 | 3;
    row: number;
    nextTitles: string[];
  }>;
};

export type AiDormPaletteGroup = {
  id: string;
  label: string;
  nodes: Array<{
    id: string;
    label: string;
    kind: WorkflowNodeKind;
    description: string;
  }>;
};

export type AiDormDepartmentScopeOption = {
  id: string;
  label: string;
  description: string;
  visibleAgents: string[];
};

export type AiDormDocumentScopeCatalog = {
  mySpaceFolders: AiDormDepartmentScopeOption[];
  collaborationSpaces: AiDormDepartmentScopeOption[];
};

export type AiDormLandingData = {
  counts: {
    totalTasks: number;
    pendingTasks: number;
    completedTasks: number;
    delegatedTasks: number;
    confirmationTasks: number;
  };
  coreEntries: Array<{
    id: "workflows" | "skills" | "agents";
    href: string;
    eyebrow: string;
    title: string;
    summary: string;
    metricLabel: string;
    metricValue: number;
    note: string;
  }>;
  taskInboxPreview: AiDormTaskRecord[];
  resourceNote: {
    title: string;
    summary: string;
  };
};

export type AiDormWorkflowStudioData = {
  workflows: AiDormWorkflowCard[];
  selectedWorkflow: AiDormWorkflowCard;
  paletteGroups: AiDormPaletteGroup[];
  taskInboxPreview: AiDormTaskRecord[];
  documentScopes: AiDormDocumentScopeCatalog;
};

export type AiDormSkillRepositoryData = {
  skills: AiDormSkillCard[];
  selectedSkill: AiDormSkillCard;
  apiKeys: AiProductionApiKeyRecord[];
  localSkillPackages: AiProductionSkillPackage[];
  commandPresets: AiProductionCommandPreset[];
  entryPoints: Array<{
    id: string;
    title: string;
    description: string;
    badge: string;
  }>;
  draftAssistant: {
    title: string;
    messages: Array<{
      role: "user" | "assistant";
      text: string;
    }>;
    ctaHref: string;
    ctaLabel: string;
  };
};

const AGENT_BLUEPRINTS: AgentBlueprint[] = [
  {
    id: "work-order-longxia",
    name: "工单龙虾",
    domains: ["work_order"],
    statusLabel: "已接入承接",
    description: "承接工单查询、流转建议、回执汇总与风险提示。",
    ownerLabel: "系统调度组",
    protocolSummary: "输入工单对象与约束，输出结构化回执与下一步建议。",
    capabilityTags: ["工单读取", "状态判断", "回执草案"],
  },
  {
    id: "document-longxia",
    name: "文档龙虾",
    domains: ["document_space"],
    statusLabel: "只读接入",
    description: "承接文档检查、归档准备、目录核对与摘要整理。",
    ownerLabel: "资料治理组",
    protocolSummary: "面向文档与文件对象，当前只读，不接真实改写。",
    capabilityTags: ["目录检查", "归档校验", "文档摘要"],
  },
  {
    id: "drawing-longxia",
    name: "图纸龙虾",
    domains: ["cad"],
    statusLabel: "只读接入",
    description: "承接 CAD / 图纸对象读取、元信息梳理与交付准备。",
    ownerLabel: "图纸交付组",
    protocolSummary: "读取图纸上下文并返回结构化图纸信息，不直接落真实执行器。",
    capabilityTags: ["CAD 读取", "元信息抽取", "交付清单"],
  },
  {
    id: "alert-longxia",
    name: "预警龙虾",
    domains: ["collaboration_space", "map_dashboard"],
    statusLabel: "观察中",
    description: "承接协作空间待确认意见、风险盘点和异常聚合。",
    ownerLabel: "风险协同组",
    protocolSummary: "围绕待确认意见和预警目标生成聚合结果与干预建议。",
    capabilityTags: ["异常汇总", "风险扫描", "待确认意见"],
  },
  {
    id: "report-longxia",
    name: "报表龙虾",
    domains: ["system_form", "cross_domain"],
    statusLabel: "样板就绪",
    description: "承接系统表单、跨域汇总和面向管理层的总结输出。",
    ownerLabel: "经营分析组",
    protocolSummary: "将跨域数据整理为汇总报告，当前以模板与预案为主。",
    capabilityTags: ["表单汇总", "周报生成", "跨域摘要"],
  },
];

const SKILL_BLUEPRINTS: SkillBlueprint[] = [
  {
    id: "skill-work-order-summary",
    name: "工单摘要 Skill",
    summary: "读取单个工单并输出简洁状态、风险与下一步建议。",
    category: "摘要",
    sourceKind: "template",
    statusLabel: "模板",
    inputSummary: "workOrderId / thread context / read-only constraints",
    outputSummary: "summary / risk bullets / next step",
    linkedWorkflowIds: ["workflow-work-order-intake"],
    linkedAgentIds: ["work-order-longxia", "report-longxia"],
    updatedAt: "2026-04-12T00:10:00.000Z",
  },
  {
    id: "skill-pending-comment-scan",
    name: "待确认意见扫描 Skill",
    summary: "扫描合作空间内待确认意见并输出分类结果。",
    category: "检索",
    sourceKind: "bp_ask_draft",
    statusLabel: "草案",
    inputSummary: "spaceRef / time range / review scope",
    outputSummary: "pending items / grouped findings / summary",
    linkedWorkflowIds: ["workflow-risk-digest"],
    linkedAgentIds: ["alert-longxia"],
    updatedAt: "2026-04-12T00:18:00.000Z",
  },
  {
    id: "skill-document-archive-check",
    name: "文档归档检查 Skill",
    summary: "检查文档目录、缺项和交付前是否满足归档条件。",
    category: "校验",
    sourceKind: "upload",
    statusLabel: "已上传",
    inputSummary: "document refs / archive rules / workspace scope",
    outputSummary: "missing items / archive readiness / notes",
    linkedWorkflowIds: ["workflow-document-archive"],
    linkedAgentIds: ["document-longxia"],
    updatedAt: "2026-04-11T18:30:00.000Z",
  },
  {
    id: "skill-cad-meta-read",
    name: "图纸元信息读取 Skill",
    summary: "读取最新 CAD 文件并输出元信息与交付字段草案。",
    category: "解析",
    sourceKind: "template",
    statusLabel: "模板",
    inputSummary: "cad asset ref / latest version constraint",
    outputSummary: "cad metadata / delivery fields / warnings",
    linkedWorkflowIds: ["workflow-risk-digest"],
    linkedAgentIds: ["drawing-longxia"],
    updatedAt: "2026-04-11T22:40:00.000Z",
  },
];

const WORKFLOW_BLUEPRINTS: WorkflowBlueprint[] = [
  {
    id: "workflow-work-order-intake",
    name: "工单受理流程",
    goal: "把新工单从识别转到承接、确认与结果回执。",
    enabled: true,
    description: "用于承接 BP问问识别出的工单型任务，先做读、审、确认，再形成受理结果。",
    recentRunSummary: "最近以工单查询和分派预案为主，仍是 dry-run / 回执阶段。",
    linkedSkillIds: ["skill-work-order-summary"],
    linkedAgentIds: ["work-order-longxia", "report-longxia"],
    steps: [
      {
        id: "wo-input",
        title: "接收入参",
        kind: "input",
        description: "接收 BP问问传来的工单目标、约束和确认要求。",
        column: 1,
        row: 1,
        nextIds: ["wo-skill"],
      },
      {
        id: "wo-skill",
        title: "工单摘要 Skill",
        kind: "skill",
        description: "读取工单并整理出状态、风险和下一步。",
        column: 2,
        row: 1,
        nextIds: ["wo-agent"],
      },
      {
        id: "wo-agent",
        title: "工单龙虾承接",
        kind: "agent",
        description: "根据工单上下文生成可执行预案和回执。",
        column: 2,
        row: 2,
        nextIds: ["wo-human"],
      },
      {
        id: "wo-human",
        title: "人工确认",
        kind: "human",
        description: "对写入风险、分派动作或流程启动做人工确认。",
        column: 3,
        row: 2,
        nextIds: ["wo-output"],
      },
      {
        id: "wo-output",
        title: "结果回执",
        kind: "output",
        description: "写回 execution_results，并由 BP问问做最终解释。",
        column: 3,
        row: 3,
        nextIds: [],
      },
    ],
  },
  {
    id: "workflow-risk-digest",
    name: "风险汇总流程",
    goal: "把待确认意见、风险线索和异常点汇成可追踪结果。",
    enabled: true,
    description: "用于承接合作空间、图纸和跨域异常的总结型任务，强调扫描、判断和汇总。",
    recentRunSummary: "最近主要承接合作空间待确认意见与跨域风险总览。",
    linkedSkillIds: ["skill-pending-comment-scan", "skill-cad-meta-read"],
    linkedAgentIds: ["alert-longxia", "report-longxia"],
    steps: [
      {
        id: "risk-input",
        title: "读取目标范围",
        kind: "input",
        description: "接收空间、时间窗口和待分析对象。",
        column: 1,
        row: 1,
        nextIds: ["risk-scan"],
      },
      {
        id: "risk-scan",
        title: "待确认意见扫描",
        kind: "skill",
        description: "扫描待确认意见、异常记录和协作风险线索。",
        column: 2,
        row: 1,
        nextIds: ["risk-condition"],
      },
      {
        id: "risk-condition",
        title: "风险阈值判断",
        kind: "condition",
        description: "判断是否需要切入预警龙虾或仅输出只读总结。",
        column: 2,
        row: 2,
        nextIds: ["risk-agent", "risk-output"],
      },
      {
        id: "risk-agent",
        title: "预警龙虾汇总",
        kind: "agent",
        description: "生成风险汇总、优先级和人工介入建议。",
        column: 3,
        row: 2,
        nextIds: ["risk-output"],
      },
      {
        id: "risk-output",
        title: "风险摘要输出",
        kind: "output",
        description: "形成可回收的结构化结果，供 BP问问解释或继续调度。",
        column: 3,
        row: 3,
        nextIds: [],
      },
    ],
  },
  {
    id: "workflow-document-archive",
    name: "文档归档流程",
    goal: "把归档前检查、缺项确认与回执打包成统一流程。",
    enabled: false,
    description: "当前作为模板保留，表达未来文档空间将如何进入画布式节点编排。",
    recentRunSummary: "当前未启用，仅作为画布式流程样板展示。",
    linkedSkillIds: ["skill-document-archive-check"],
    linkedAgentIds: ["document-longxia"],
    steps: [
      {
        id: "doc-input",
        title: "接收文档集合",
        kind: "input",
        description: "读取待归档的文档、目录和限制条件。",
        column: 1,
        row: 1,
        nextIds: ["doc-check"],
      },
      {
        id: "doc-check",
        title: "归档检查 Skill",
        kind: "skill",
        description: "检查目录、缺项和归档前置条件。",
        column: 2,
        row: 1,
        nextIds: ["doc-agent"],
      },
      {
        id: "doc-agent",
        title: "文档龙虾承接",
        kind: "agent",
        description: "整理出归档建议、缺口说明和回执草案。",
        column: 2,
        row: 2,
        nextIds: ["doc-output"],
      },
      {
        id: "doc-output",
        title: "归档预案输出",
        kind: "output",
        description: "生成后续归档动作和待确认清单。",
        column: 3,
        row: 2,
        nextIds: [],
      },
    ],
  },
];

const WORKFLOW_PALETTE: AiDormPaletteGroup[] = [
  {
    id: "palette-skill",
    label: "Skill 节点",
    nodes: [
      {
        id: "node-skill-read",
        label: "读取 Skill",
        kind: "skill",
        description: "面向检索、提取、只读分析的原子能力。",
      },
      {
        id: "node-skill-summary",
        label: "总结 Skill",
        kind: "skill",
        description: "面向摘要、归纳、报告草案的输出能力。",
      },
    ],
  },
  {
    id: "palette-agent",
    label: "AI员工节点",
    nodes: [
      {
        id: "node-agent-work-order",
        label: "工单龙虾",
        kind: "agent",
        description: "负责工单对象与流转预案的专业承接。",
      },
      {
        id: "node-agent-alert",
        label: "预警龙虾",
        kind: "agent",
        description: "负责待确认意见、风险与异常聚合。",
      },
    ],
  },
  {
    id: "palette-control",
    label: "控制节点",
    nodes: [
      {
        id: "node-condition",
        label: "条件判断",
        kind: "condition",
        description: "控制阈值分支、失败分支和人工回退。",
      },
      {
        id: "node-human",
        label: "人工确认",
        kind: "human",
        description: "在写入风险较高时挂入人工确认环节。",
      },
    ],
  },
  {
    id: "palette-io",
    label: "输入输出",
    nodes: [
      {
        id: "node-input",
        label: "BP问问入口",
        kind: "input",
        description: "作为工作协议的前台入口，接收用户自然语言和任务上下文。",
      },
      {
        id: "node-output",
        label: "输出节点",
        kind: "output",
        description: "产出 execution_results 与回执结构。",
      },
    ],
  },
];

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return new Date().toISOString();
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toJsonRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function isPendingLike(status: string) {
  return status === "pending" || status === "planned" || status === "delegated";
}

function isCompletedLike(taskStatus: string, resultStatus: string | null) {
  return taskStatus === "completed" || resultStatus === "ready";
}

function getAgentConsoleEntry(agentId: string): AgentConsoleEntry | null {
  return getOpenClawConsoleEntryForAgent(agentId);

  if (agentId !== "work-order-longxia") {
    return null;
  }

  return {
    href: "/api/ai-dorm/openclaw/launch",
    label: "OpenClaw 控制台",
    note: "以工单龙虾身份打开",
  };
}

function labelIntent(value: string) {
  return value in PRIMARY_INTENT_LABELS
    ? PRIMARY_INTENT_LABELS[value as PrimaryIntent]
    : value;
}

function labelDomain(value: string) {
  return value in TARGET_DOMAIN_LABELS
    ? TARGET_DOMAIN_LABELS[value as TargetDomain]
    : value;
}

function labelMode(value: string) {
  return value in EXECUTION_MODE_LABELS
    ? EXECUTION_MODE_LABELS[value as ExecutionMode]
    : value;
}

function mapWorkflowBlueprint(blueprint: WorkflowBlueprint): AiDormWorkflowCard {
  const stepTitleMap = new Map(blueprint.steps.map((step) => [step.id, step.title]));
  const workflowSkillNames = blueprint.linkedSkillIds
    .map((skillId) => SKILL_BLUEPRINTS.find((skill) => skill.id === skillId)?.name ?? null)
    .filter((value): value is string => Boolean(value));
  const workflowAgentNames = blueprint.linkedAgentIds
    .map((agentId) => AGENT_BLUEPRINTS.find((agent) => agent.id === agentId)?.name ?? null)
    .filter((value): value is string => Boolean(value));

  return {
    id: blueprint.id,
    name: blueprint.name,
    goal: blueprint.goal,
    stepCount: blueprint.steps.length,
    enabled: blueprint.enabled,
    description: blueprint.description,
    recentRunSummary: blueprint.recentRunSummary,
    linkedSkillNames: workflowSkillNames,
    linkedAgentNames: workflowAgentNames,
    steps: blueprint.steps.map((step) => ({
      id: step.id,
      title: step.title,
      kind: step.kind,
      description: step.description,
      column: step.column,
      row: step.row,
      nextTitles: step.nextIds
        .map((nextId) => stepTitleMap.get(nextId) ?? nextId)
        .filter(Boolean),
    })),
  };
}

function pickByIdOrFirst<T extends { id: string }>(items: T[], id?: string) {
  if (id) {
    const matched = items.find((item) => item.id === id);
    if (matched) {
      return matched;
    }
  }

  return items[0];
}

const getAiDormTaskFeedForUser = cache(async (userId: string) => {
  const db = getDb();
  const rows = await db
    .select({
      taskId: executionTasks.id,
      threadId: executionTasks.threadId,
      threadTitle: conversationThreads.title,
      goal: executionTasks.goal,
      primaryIntent: executionTasks.primaryIntent,
      targetDomain: executionTasks.targetDomain,
      executionMode: executionTasks.executionMode,
      executorKind: executionTasks.executorKind,
      status: executionTasks.status,
      confidence: executionTasks.confidence,
      needsMemory: executionTasks.needsMemory,
      needsTools: executionTasks.needsTools,
      requiresWrite: executionTasks.requiresWrite,
      requiresConfirmation: executionTasks.requiresConfirmation,
      targetRefs: executionTasks.targetRefs,
      constraints: executionTasks.constraints,
      metadata: executionTasks.metadata,
      taskCreatedAt: executionTasks.createdAt,
      taskUpdatedAt: executionTasks.updatedAt,
      resultStatus: executionResults.status,
      summaryText: executionResults.summaryText,
      responseText: executionResults.responseText,
      structuredPayload: executionResults.structuredPayload,
      resultCreatedAt: executionResults.createdAt,
      resultUpdatedAt: executionResults.updatedAt,
    })
    .from(executionTasks)
    .innerJoin(
      conversationThreads,
      eq(conversationThreads.id, executionTasks.threadId),
    )
    .leftJoin(executionResults, eq(executionResults.taskId, executionTasks.id))
    .where(eq(executionTasks.userId, userId))
    .orderBy(desc(executionTasks.createdAt), desc(executionTasks.updatedAt));

  return rows.map((row) => ({
    taskId: row.taskId,
    threadId: row.threadId,
    threadTitle: row.threadTitle,
    goal: row.goal,
    primaryIntent: row.primaryIntent,
    primaryIntentLabel: labelIntent(row.primaryIntent),
    targetDomain: row.targetDomain,
    targetDomainLabel: labelDomain(row.targetDomain),
    executionMode: row.executionMode,
    executionModeLabel: labelMode(row.executionMode),
    executorKind: row.executorKind,
    status: row.status,
    resultStatus: row.resultStatus ?? null,
    confidence: row.confidence,
    requiresWrite: row.requiresWrite,
    requiresConfirmation: row.requiresConfirmation,
    needsMemory: row.needsMemory,
    needsTools: row.needsTools,
    createdAt: toIso(row.taskCreatedAt),
    updatedAt: toIso(row.taskUpdatedAt),
    targetRefs: toJsonRecord(row.targetRefs),
    constraints: toJsonRecord(row.constraints),
    metadata: toJsonRecord(row.metadata),
    result: row.summaryText
      ? {
          summaryText: row.summaryText,
          responseText: row.responseText ?? "",
          structuredPayload: toJsonRecord(row.structuredPayload),
          createdAt: toIso(row.resultCreatedAt),
          updatedAt: toIso(row.resultUpdatedAt),
        }
      : null,
  }));
});

export function getAiDormAccessProfile(user: AuthenticatedUser) {
  const canManage = user.roleKey === "system_admin" || user.roleKey === "dispatcher";

  return {
    canManageWorkflows: canManage,
    canManageSkills: canManage,
    canManageAgents: canManage,
    scopeLabel: canManage ? "可配置" : "只读",
  };
}

export async function listAiDormTasksForUser(userId: string, limit = 40) {
  const tasks = await getAiDormTaskFeedForUser(userId);
  return tasks.slice(0, limit);
}

export async function getAiDormNavSummary(userId: string) {
  const tasks = await getAiDormTaskFeedForUser(userId);

  return {
    workflows: WORKFLOW_BLUEPRINTS.length,
    skills: SKILL_BLUEPRINTS.length,
    agents: AGENT_BLUEPRINTS.length,
    tasks: tasks.filter((task) => isPendingLike(task.status)).length,
  };
}

export async function getAiDormAgents(userId: string): Promise<AiDormAgentCard[]> {
  const tasks = await getAiDormTaskFeedForUser(userId);
  const domainCount = new Map<string, number>();

  for (const task of tasks) {
    domainCount.set(task.targetDomain, (domainCount.get(task.targetDomain) ?? 0) + 1);
  }

  return AGENT_BLUEPRINTS.map((agent) => ({
    id: agent.id,
    name: agent.name,
    domainLabels: agent.domains.map((domain) => TARGET_DOMAIN_LABELS[domain]),
    statusLabel:
      agent.domains.some((domain) => (domainCount.get(domain) ?? 0) > 0)
        ? agent.statusLabel
        : "待接入",
    description: agent.description,
    ownerLabel: agent.ownerLabel,
    protocolSummary: agent.protocolSummary,
    capabilityTags: agent.capabilityTags,
    recentTaskCount: agent.domains.reduce(
      (count, domain) => count + (domainCount.get(domain) ?? 0),
      0,
    ),
    consoleEntry: getAgentConsoleEntry(agent.id),
  }));
}

export async function getAiDormSkills(): Promise<AiDormSkillCard[]> {
  return SKILL_BLUEPRINTS.map((skill) => ({
    id: skill.id,
    name: skill.name,
    summary: skill.summary,
    category: skill.category,
    sourceKind: skill.sourceKind,
    statusLabel: skill.statusLabel,
    inputSummary: skill.inputSummary,
    outputSummary: skill.outputSummary,
    linkedWorkflowNames: skill.linkedWorkflowIds
      .map((workflowId) => WORKFLOW_BLUEPRINTS.find((workflow) => workflow.id === workflowId)?.name ?? null)
      .filter((value): value is string => Boolean(value)),
    linkedAgentNames: skill.linkedAgentIds
      .map((agentId) => AGENT_BLUEPRINTS.find((agent) => agent.id === agentId)?.name ?? null)
      .filter((value): value is string => Boolean(value)),
    updatedAt: skill.updatedAt,
  }));
}

export async function getAiDormLandingData(userId: string): Promise<AiDormLandingData> {
  const tasks = await getAiDormTaskFeedForUser(userId);

  return {
    counts: {
      totalTasks: tasks.length,
      pendingTasks: tasks.filter((task) => isPendingLike(task.status)).length,
      completedTasks: tasks.filter((task) =>
        isCompletedLike(task.status, task.resultStatus),
      ).length,
      delegatedTasks: tasks.filter((task) => task.status === "delegated").length,
      confirmationTasks: tasks.filter((task) => task.requiresConfirmation).length,
    },
    coreEntries: [
      {
        id: "workflows",
        href: "/ai-dorm/workflows",
        eyebrow: "怎么干活",
        title: "工作协议网关",
        summary: "协议列表、节点骨架、配置",
        metricLabel: "工作协议模板",
        metricValue: WORKFLOW_BLUEPRINTS.length,
        note: "",
      },
      {
        id: "skills",
        href: "/ai-dorm/skills",
        eyebrow: "能力资产层",
        title: "AI生产资料仓",
        summary: "上传、模板、草案",
        metricLabel: "生产资料",
        metricValue: SKILL_BLUEPRINTS.length,
        note: "",
      },
      {
        id: "agents",
        href: "/ai-dorm/agents",
        eyebrow: "谁来干活",
        title: "AI员工",
        summary: "列表、状态、配置",
        metricLabel: "AI员工",
        metricValue: AGENT_BLUEPRINTS.length,
        note: "",
      },
    ],
    taskInboxPreview: tasks.slice(0, 4),
    resourceNote: {
      title: "资源与账单",
      summary: "后续放到设置",
    },
  };
}

const spreadsheetFolderScope = {
  id: "sheet-workbooks",
  name: "表格归档",
  description: "台账、清单与跟踪表都统一放在这里。",
};

function getVisibleAgentsForDocumentScope(label: string) {
  if (/表格|台账|清单|报表|周报|xlsx|sheet/i.test(label)) {
    return ["文档龙虾", "报表龙虾"];
  }

  if (/异常|预警|跟踪|反馈/.test(label)) {
    return ["文档龙虾", "预警龙虾"];
  }

  if (/图纸|CAD|设计|联审/.test(label)) {
    return ["文档龙虾", "图纸龙虾"];
  }

  return ["文档龙虾"];
}

function mapDocumentFolderScope(folder: {
  id: string;
  name: string;
  description: string;
}): AiDormDepartmentScopeOption {
  return {
    id: `docs-folder-${folder.id}`,
    label: folder.name,
    description: folder.description || `${folder.name} 下的顶层文件。`,
    visibleAgents: getVisibleAgentsForDocumentScope(folder.name),
  };
}

async function getDefaultDocumentScopeCatalog(): Promise<AiDormDocumentScopeCatalog> {
  return {
    mySpaceFolders: [
      {
        id: "docs-folder-all",
        label: "全部文件",
        description: "我的文档空间下全部顶层文件。",
        visibleAgents: ["文档龙虾", "报表龙虾"],
      },
      ...documentFolders.map(mapDocumentFolderScope),
      mapDocumentFolderScope(spreadsheetFolderScope),
    ],
    collaborationSpaces: [],
  };
}

async function getDocumentScopeCatalogForUser(
  user: AuthenticatedUser,
): Promise<AiDormDocumentScopeCatalog> {
  const personalWorkspaceId = user.workspaceId;
  const [
    uploadedDocuments,
    uploadedSheets,
    uploadedSlides,
    browserState,
    userSpaces,
  ] = await Promise.all([
    listAssetsForUser(user, "document", { workspaceId: personalWorkspaceId }),
    listAssetsForUser(user, "sheet", { workspaceId: personalWorkspaceId }),
    listAssetsForUser(user, "slide", { workspaceId: personalWorkspaceId }),
    getBrowserStateForUser(user, "document", {
      workspaceId: personalWorkspaceId,
    }),
    getSpacesForUser(user.email),
  ]);
  const hiddenFolderIds = new Set(browserState.deletedFolderIds);
  const uploadedAssets = [
    ...uploadedDocuments,
    ...uploadedSheets,
    ...uploadedSlides,
  ];
  const baseFolders = [
    ...(uploadedAssets.length > 0
      ? [
          {
            id: "recent-uploads",
            name: "最近上传",
            description: "你真实上传到个人工作区的文件。",
          },
        ]
      : []),
    ...documentFolders,
    spreadsheetFolderScope,
  ];
  const baseFolderIds = new Set(baseFolders.map((folder) => folder.id));
  const folderOverrides = new Map(
    browserState.customFolders.map((folder) => [folder.id, folder]),
  );
  const extraCustomFolders = browserState.customFolders.filter(
    (folder) => !baseFolderIds.has(folder.id),
  );
  const resolvedFolders = [
    ...extraCustomFolders,
    ...baseFolders.map((folder) => {
      const override = folderOverrides.get(folder.id);
      return override ? { ...folder, ...override } : folder;
    }),
  ].filter((folder) => !hiddenFolderIds.has(folder.id));
  const spaces = [...userSpaces.createdSpaces, ...userSpaces.joinedSpaces];

  return {
    mySpaceFolders: [
      {
        id: "docs-folder-all",
        label: "全部文件",
        description: "我的文档空间下全部顶层文件。",
        visibleAgents: ["文档龙虾", "报表龙虾"],
      },
      ...resolvedFolders.map(mapDocumentFolderScope),
    ],
    collaborationSpaces: spaces.map((space) => ({
      id: `docs-collaboration-${space.id}`,
      label: space.name,
      description: space.summary || `${space.name} 的顶层资料范围。`,
      visibleAgents: getVisibleAgentsForDocumentScope(
        `${space.name} ${space.summary}`,
      ),
    })),
  };
}

export async function getAiDormWorkflowStudioData(
  user: AuthenticatedUser | string,
  selectedWorkflowId?: string,
): Promise<AiDormWorkflowStudioData> {
  const userId = typeof user === "string" ? user : user.id;
  const workflows = WORKFLOW_BLUEPRINTS.map(mapWorkflowBlueprint);
  const selectedWorkflow = pickByIdOrFirst(workflows, selectedWorkflowId);
  const [tasks, documentScopes] = await Promise.all([
    getAiDormTaskFeedForUser(userId),
    typeof user === "string"
      ? getDefaultDocumentScopeCatalog()
      : getDocumentScopeCatalogForUser(user),
  ]);

  return {
    workflows,
    selectedWorkflow,
    paletteGroups: WORKFLOW_PALETTE,
    taskInboxPreview: tasks.slice(0, 5),
    documentScopes,
  };
}

export async function getAiDormSkillRepositoryData(
  selectedSkillId?: string,
): Promise<AiDormSkillRepositoryData> {
  const [skills, apiKeys, localSkillPackages] = await Promise.all([
    getAiDormSkills(),
    getAiProductionApiKeyRecords(),
    getAiProductionSkillPackages(),
  ]);
  const selectedSkill = pickByIdOrFirst(skills, selectedSkillId);

  return {
    skills,
    selectedSkill,
    apiKeys,
    localSkillPackages,
    commandPresets: getAiProductionCommandPresets(),
    entryPoints: [
      {
        id: "skill-upload",
        title: "上传现成 Skill",
        description: "导入已有 skill 文件或团队共享能力，作为仓库资产托管。",
        badge: "导入",
      },
      {
        id: "skill-template",
        title: "按模板创建 Skill",
        description: "按读取、总结、校验、写入预案等模板快速起草新的 skill。",
        badge: "模板",
      },
      {
        id: "skill-bp-ask",
        title: "BP问问生成 Skill 草案",
        description: "在仓库内部以小窗口方式调用 BP问问生成草案，再回到仓库归档。",
        badge: "草案",
      },
    ],
    draftAssistant: {
      title: "仓库内 BP问问草案窗",
      messages: [
        {
          role: "user",
          text: "帮我做一个读取合作空间待确认意见并输出汇总的 skill。",
        },
        {
          role: "assistant",
          text: "我会先产出一个检索型 Skill 草案，包含输入范围、输出摘要和适用场景。",
        },
      ],
      ctaHref: "/bp-ask",
      ctaLabel: "去 BP问问生成草案",
    },
  };
}
