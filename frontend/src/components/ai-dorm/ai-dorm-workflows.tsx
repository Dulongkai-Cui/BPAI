"use client";

import type { PointerEvent as ReactPointerEvent, WheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";

import type {
  AiDormDocumentScopeCatalog,
  AiDormPaletteGroup,
  AiDormWorkflowCard,
  AiDormWorkflowStudioData,
} from "@/lib/ai-dorm/server";
import type {
  ProtocolIssue as GatewayProtocolIssue,
  ProtocolNodeKind as GatewayProtocolNodeKind,
  ProtocolReferenceKind,
  WorkProtocolDraft as GatewayWorkProtocolDraft,
} from "@/lib/work-protocol/types";
import type {
  WorkProtocolGroomingAudit,
  WorkProtocolGroomingAuditEvent,
  WorkProtocolGroomingAuditSeverity,
  WorkProtocolGroomingAuditStatus,
} from "@/lib/work-protocol/grooming-audit";
import type { WorkProtocolExecutorAdapterRegistrySummary } from "@/lib/work-protocol/executor-adapters";
import {
  WorkProtocolAdapterRegistryPanel,
  buildAdapterRegistryCompileIssues,
} from "@/components/ai-dorm/work-protocol-adapter-diagnostics";
import {
  PendingParameterPatchApplyPanel,
  WorkProtocolParameterPatchAuditPanel,
} from "@/components/ai-dorm/work-protocol-parameter-patch-panels";
import {
  ParameterCodeDetails,
  TargetProtocolDetails,
  type ParameterPatchCandidatePreview,
} from "@/components/ai-dorm/work-protocol-parameter-code-details";

type AiDormWorkflowsProps = {
  studio: AiDormWorkflowStudioData;
};

type WorkflowStep = AiDormWorkflowCard["steps"][number];
type ProtocolNodeKind =
  | "input"
  | "tool"
  | "skill"
  | "rag"
  | "agent"
  | "dispatch"
  | "aggregate"
  | "condition"
  | "human"
  | "bp_question"
  | "writeback"
  | "bp_report"
  | "output";
type CompileStatus =
  | "draft"
  | "compiling"
  | "valid"
  | "valid_with_warnings"
  | "invalid"
  | "dirty_after_compile";
type RegistryActionStatus = "idle" | "registering" | "toggling";
type ExecutionActionStatus = "idle" | "loading" | "creating";

type CanvasNodeDraft = {
  id: string;
  title: string;
  kind: ProtocolNodeKind;
  departmentId: string;
  userIntent: string;
  x: number;
  y: number;
};

type TopDepartmentId =
  | "overview"
  | "engineering"
  | "work_orders"
  | "documents"
  | "ai_dorm";

type DepartmentScopeOption = {
  id: string;
  label: string;
  description: string;
  visibleAgents: string[];
};

type DepartmentDefinition = {
  id: TopDepartmentId;
  label: string;
  note: string;
  scopes: DepartmentScopeOption[];
};

type CanvasDepartmentAgentDraft = {
  id: string;
  name: string;
  userIntent: string;
  x: number;
  y: number;
};

type CanvasDepartmentDraft = {
  id: string;
  departmentId: TopDepartmentId;
  scopeId: string;
  secondaryScopeId?: string;
  agents?: CanvasDepartmentAgentDraft[];
  collapsed?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

type CanvasEdgeDraft = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  transferIntent: string;
};

type CompileIssue = {
  id: string;
  severity: "error" | "warning" | "info";
  targetKind: "node" | "edge" | "canvas" | "department";
  targetId?: string;
  code: string;
  message: string;
  suggestion: string;
};

type ProtocolParameterCodeBlock = {
  id: string;
  target: "protocol" | "node" | "edge";
  targetId: string;
  label: string;
  status: "fresh" | "invalid";
  language: "json";
  code: Record<string, unknown>;
};

type GatewayCompileApiResponse = {
  result?: {
    status: "compiled" | "compiled_with_warnings" | "invalid";
    validation: {
      issues: GatewayProtocolIssue[];
    };
    parameterCodeBlocks: ProtocolParameterCodeBlock[];
  };
  message?: string;
};

type GatewayGroomingAnnotationStatus = "ok" | "warning" | "error";
type GatewayGroomingStatus = "groomed" | "groomed_with_issues" | "invalid";

type GatewayGroomingTargetAnnotation = {
  targetId: string;
  label: string;
  status: GatewayGroomingAnnotationStatus;
  issues: GatewayProtocolIssue[];
  parameterCodeBlock?: ProtocolParameterCodeBlock;
};

type GatewayGroomingProtocolSummary = {
  status: GatewayGroomingAnnotationStatus;
  groomingStatus: GatewayGroomingStatus;
  errors: number;
  warnings: number;
  info: number;
  canRegister: boolean;
  message: string;
  suggestions: string[];
  issues: GatewayProtocolIssue[];
  parameterCodeBlock?: ProtocolParameterCodeBlock;
};

type GatewayGroomApiResponse = {
  result?: {
    schemaVersion: "work-protocol-grooming.v0";
    strategy: "deterministic_catalog";
    status: GatewayGroomingStatus;
    groomedDraft: GatewayWorkProtocolDraft;
    compileResult: NonNullable<GatewayCompileApiResponse["result"]>;
    parameterCodeBlocks: ProtocolParameterCodeBlock[];
    protocolSummary: GatewayGroomingProtocolSummary;
    departmentAnnotations: Record<string, GatewayGroomingTargetAnnotation>;
    nodeAnnotations: Record<string, GatewayGroomingTargetAnnotation>;
    edgeAnnotations: Record<string, GatewayGroomingTargetAnnotation>;
    audit?: WorkProtocolGroomingAudit;
    summary: {
      errors: number;
      warnings: number;
      info: number;
      nodes: number;
      edges: number;
      departments: number;
      compiledNodes: number;
      compiledEdges: number;
      parameterCodeBlocks: number;
      canRegister: boolean;
    };
  };
  catalogHash?: string;
  message?: string;
};

type GatewayGroomingResult = NonNullable<GatewayGroomApiResponse["result"]>;

type GatewayDraftRecordSummary = {
  id: string;
  draftId: string;
  kind: "source" | "groomed";
  name?: string;
  draft?: GatewayWorkProtocolDraft;
  sourceRecordId?: string;
  grooming?: {
    status: GatewayGroomingStatus;
    catalogHash?: string;
    summary: GatewayGroomingResult["summary"];
    parameterCodeBlocks: ProtocolParameterCodeBlock[];
  };
  createdAt?: string;
  updatedAt?: string;
};

type GatewayDraftsApiResponse = {
  record?: GatewayDraftRecordSummary;
  records?: GatewayDraftRecordSummary[];
  message?: string;
};

type RegisteredProtocolSummary = {
  id: string;
  draftId: string;
  name: string;
  enabled: boolean;
  runtimeMode?: "plan_only";
  priority?: number;
  activeVersionId: string;
  versions?: Array<{
    versionId: string;
    versionNumber: number;
    draftSnapshot?: GatewayWorkProtocolDraft;
    draftRecordId?: string;
    draftKind?: "source" | "groomed";
    capabilityCatalogHash?: string;
    registeredAt: string;
  }>;
  updatedAt: string;
};

type WorkProtocolTrace = {
  sourceRecord?: GatewayDraftRecordSummary;
  groomedRecord?: GatewayDraftRecordSummary;
  catalogHash?: string;
  canRegister: boolean;
  blockingIssues: number;
  warnings: number;
  parameterCodeBlocks: number;
  stale: boolean;
};

type GatewayRegistryApiResponse = {
  result?: GatewayCompileApiResponse["result"];
  registered?: RegisteredProtocolSummary;
  protocols?: RegisteredProtocolSummary[];
  message?: string;
};

type WorkProtocolExecutionPlanSummary = {
  id: string;
  protocolId: string;
  protocolName: string;
  draftId: string;
  versionId: string;
  versionNumber: number;
  status: "queued" | "running" | "waiting_confirmation" | "completed" | "failed" | "cancelled";
  mode: "plan_only";
  startedAt: string;
  matchedConfidence: number;
  matchedReason: string;
  nodePlan: Array<{
    sequence: number;
    nodeId: string;
    title: string;
    kind: GatewayProtocolNodeKind;
    executorKind: string;
    status: "queued" | "running" | "waiting_confirmation" | "completed" | "skipped" | "failed";
    approvalPolicy: "none" | "recommended" | "required";
    riskLevel: "none" | "low" | "medium" | "high" | "critical";
    adapterId?: string;
    adapterLabel?: string;
    adapterAvailable?: boolean;
    requiredInputNames?: string[];
    optionalInputNames?: string[];
    plannedOutputNames?: string[];
    requiredPermissions?: string[];
    mutatesData?: boolean;
    externalCallPlanned?: boolean;
  }>;
  edgePlan: Array<{
    edgeId: string;
    sourceNodeId: string;
    targetNodeId: string;
    transferMode: string;
  }>;
  permissionSummary: Array<{
    kind: string;
    id: string;
    label?: string;
  }>;
  confirmationNodeIds: string[];
};

type GatewayExecutionsApiResponse = {
  executions?: WorkProtocolExecutionPlanSummary[];
  execution?: WorkProtocolExecutionPlanSummary;
  message?: string;
};

type WorkProtocolParameterPatchAuditSummary = {
  schemaVersion: "work-protocol-parameter-patch-audit.v1";
  id: string;
  draftId: string;
  draftName: string;
  mode: "dry_run" | "apply";
  status: "validated" | "applied" | "rejected" | "no_effect";
  operationCount: number;
  appliedChangeCount: number;
  rejectedChangeCount: number;
  preflightIssueCount: number;
  catalogHash?: string;
  commitRequested?: boolean;
  commitStatus?: "not_requested" | "skipped" | "committed";
  baseDraftRecordId?: string;
  sourceRecordId?: string;
  committedDraftRecordId?: string;
  createdAt: string;
  result?: {
    rejectedChanges?: Array<{
      code: string;
      message: string;
      path: string;
      operationId?: string;
    }>;
    appliedChanges?: Array<{
      path: string;
      operationId?: string;
    }>;
  };
};

type GatewayParameterPatchAuditsApiResponse = {
  records?: WorkProtocolParameterPatchAuditSummary[];
  message?: string;
};

type GatewayParameterPatchApiResponse = {
  result?: {
    status: WorkProtocolParameterPatchAuditSummary["status"];
    parameterCodeBlocks?: ProtocolParameterCodeBlock[];
    rejectedChanges?: NonNullable<
      WorkProtocolParameterPatchAuditSummary["result"]
    >["rejectedChanges"];
    appliedChanges?: NonNullable<
      WorkProtocolParameterPatchAuditSummary["result"]
    >["appliedChanges"];
  };
  auditRecord?: WorkProtocolParameterPatchAuditSummary;
  committedDraftRecord?: GatewayDraftRecordSummary;
  message?: string;
};

type GatewayCapabilitiesApiResponse = {
  adapterRegistry?: WorkProtocolExecutorAdapterRegistrySummary;
  message?: string;
};

type PaletteNode = {
  id: string;
  label: string;
  kind: ProtocolNodeKind;
  description: string;
  groupLabel: string;
};
type CanvasPan = {
  x: number;
  y: number;
};
type DragState =
  | {
      kind: "canvas";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startPan: CanvasPan;
    }
  | {
      kind: "node";
      id: string;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startX: number;
      startY: number;
    }
  | {
      kind: "department";
      id: string;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startX: number;
      startY: number;
    }
  | {
      kind: "departmentAgent";
      departmentId: string;
      agentId: string;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startX: number;
      startY: number;
    };

const CANVAS_WIDTH = 1800;
const CANVAS_HEIGHT = 1200;
const NODE_WIDTH = 260;
const NODE_HEIGHT = 172;
const DEPARTMENT_DEFAULT_WIDTH = 1040;
const DEPARTMENT_DEFAULT_HEIGHT = 468;
const DEPARTMENT_AGENT_WIDTH = NODE_WIDTH;
const DEPARTMENT_AGENT_HEIGHT = NODE_HEIGHT;
const DEPARTMENT_AGENT_MIN_X = 452;
const DEPARTMENT_AGENT_PADDING = 22;
const DEPARTMENT_COLLAPSED_PADDING = 28;
const DEPARTMENT_COLLAPSED_TOP_PADDING = 64;
const MIN_ZOOM = 0.48;
const MAX_ZOOM = 1.45;
const DEFAULT_EDGE_DISPLAY_TEXT = "请编辑传输内容，默认是通讯提示词";
const ALL_SCOPE_ID = "__all";
const DOC_MY_SPACE_SCOPE_ID = "docs-my-space";
const DOC_COLLAB_SCOPE_ID = "docs-collaboration";

const WORK_PROTOCOL_BLOCKS: PaletteNode[] = [
  {
    id: "block-bp-entry",
    label: "BP问问入口",
    kind: "input",
    groupLabel: "入口类",
    description: "作为工作协议的前台入口，接收用户自然语言、任务目标和上下文。",
  },
  {
    id: "block-tool-call",
    label: "Tool调用",
    kind: "tool",
    groupLabel: "执行类",
    description: "调用系统内置工具，例如工单、文档、表格、地图或系统表单。",
  },
  {
    id: "block-skill-call",
    label: "Skill调用",
    kind: "skill",
    groupLabel: "执行类",
    description: "调用 AI生产资料仓里的 Skill，并声明输入、输出和适用范围。",
  },
  {
    id: "block-rag-search",
    label: "RAG检索",
    kind: "rag",
    groupLabel: "执行类",
    description: "从知识库、文档片段或历史资料中检索可用上下文。",
  },
  {
    id: "block-task-dispatch",
    label: "任务分派",
    kind: "dispatch",
    groupLabel: "协作类",
    description: "把一个任务拆成多个子任务，分派给部门里的 AI员工或下游节点。",
  },
  {
    id: "block-result-aggregate",
    label: "结果汇总",
    kind: "aggregate",
    groupLabel: "协作类",
    description: "把多个节点的输出合并成统一摘要、风险点和下一步建议。",
  },
  {
    id: "block-condition",
    label: "条件判断",
    kind: "condition",
    groupLabel: "判断类",
    description: "根据字段、风险、状态或人工选择决定下一条路径。",
  },
  {
    id: "block-human-confirm",
    label: "人工确认",
    kind: "human",
    groupLabel: "协作类",
    description: "在高风险写入、删除、通知或对外输出前等待人工确认。",
  },
  {
    id: "block-bp-question",
    label: "BP问问追问",
    kind: "bp_question",
    groupLabel: "协作类",
    description: "信息不够或存在冲突时，回到 BP问问向用户追问并补齐条件。",
  },
  {
    id: "block-writeback",
    label: "写入对象",
    kind: "writeback",
    groupLabel: "出口类",
    description: "把结构化结果写入工单、文档、表格或业务对象。",
  },
  {
    id: "block-bp-report",
    label: "BP问问汇报出口",
    kind: "bp_report",
    groupLabel: "出口类",
    description: "把执行结果、风险和下一步建议整理后返回给 BP问问。",
  },
];

const FALLBACK_DOCUMENT_SCOPE_CATALOG: AiDormDocumentScopeCatalog = {
  mySpaceFolders: [
    {
      id: "docs-folder-all",
      label: "全部文件",
      description: "我的文档空间下全部文件。",
      visibleAgents: ["文档龙虾", "报表龙虾"],
    },
    {
      id: "docs-my-project-folder",
      label: "项目资料文件夹",
      description: "项目资料文件夹内的顶层文件。",
      visibleAgents: ["文档龙虾"],
    },
    {
      id: "docs-my-tracking-folder",
      label: "异常跟踪文件夹",
      description: "异常跟踪文件夹内的顶层文件。",
      visibleAgents: ["文档龙虾", "预警龙虾"],
    },
  ],
  collaborationSpaces: [
    {
      id: "collab-main",
      label: "项目主协作空间",
      description: "项目主协作空间内的顶层资料范围。",
      visibleAgents: ["文档龙虾", "预警龙虾"],
    },
    {
      id: "collab-design",
      label: "设计会审协作空间",
      description: "设计会审协作空间内的顶层资料范围。",
      visibleAgents: ["文档龙虾", "图纸龙虾"],
    },
  ],
};

const DEPARTMENT_DEFINITIONS: DepartmentDefinition[] = [
  {
    id: "overview",
    label: "总览",
    note: "总览页和左侧二级看板。",
    scopes: [
      {
        id: ALL_SCOPE_ID,
        label: "全部总览",
        description: "默认覆盖总览下所有范围。",
        visibleAgents: [],
      },
      {
        id: "overview-map",
        label: "全城实时地图",
        description: "长沙全域协同地图与空间态势。",
        visibleAgents: ["预警龙虾", "报表龙虾"],
      },
      {
        id: "overview-engineering",
        label: "工程队状态",
        description: "工程队状态、人员态势和资源状态。",
        visibleAgents: ["预警龙虾", "报表龙虾"],
      },
      {
        id: "overview-alerts",
        label: "预警中心",
        description: "风险、异常和待处理预警集合。",
        visibleAgents: ["预警龙虾"],
      },
      {
        id: "overview-settings",
        label: "设置",
        description: "总览相关配置入口。",
        visibleAgents: ["报表龙虾"],
      },
    ],
  },
  {
    id: "engineering",
    label: "工程队",
    note: "工程队成员、班组和状态空间。",
    scopes: [
      {
        id: ALL_SCOPE_ID,
        label: "全部工程队",
        description: "默认覆盖工程队全部范围。",
        visibleAgents: [],
      },
      {
        id: "engineering-members",
        label: "成员与班组",
        description: "工程队成员、班组和排班信息。",
        visibleAgents: ["报表龙虾"],
      },
      {
        id: "engineering-status",
        label: "状态与负载",
        description: "工程队状态、负载和异常聚合。",
        visibleAgents: ["预警龙虾", "报表龙虾"],
      },
    ],
  },
  {
    id: "work_orders",
    label: "工单",
    note: "工单列表、详情和流转上下文。",
    scopes: [
      {
        id: ALL_SCOPE_ID,
        label: "全部工单",
        description: "默认覆盖工单全部范围。",
        visibleAgents: [],
      },
      {
        id: "work-orders-board",
        label: "工单列表",
        description: "工单列表、筛选和批量查看。",
        visibleAgents: ["工单龙虾", "报表龙虾"],
      },
      {
        id: "work-orders-detail",
        label: "当前工单详情",
        description: "当前工单、相关资料和流转上下文。",
        visibleAgents: ["工单龙虾"],
      },
      {
        id: "work-orders-missing",
        label: "缺件与受理",
        description: "缺件记录、受理动作和待确认项。",
        visibleAgents: ["工单龙虾", "预警龙虾"],
      },
    ],
  },
  {
    id: "documents",
    label: "文档档案室",
    note: "文档空间、文件夹和合作空间。",
    scopes: [
      {
        id: ALL_SCOPE_ID,
        label: "全部",
        description: "默认覆盖文档档案室全部范围。",
        visibleAgents: [],
      },
      {
        id: DOC_MY_SPACE_SCOPE_ID,
        label: "我的文档空间",
        description: "选择后读取我的文档空间顶层大文件夹。",
        visibleAgents: [],
      },
      {
        id: DOC_COLLAB_SCOPE_ID,
        label: "合作空间",
        description: "选择后读取当前账号可访问的合作空间。",
        visibleAgents: [],
      },
    ],
  },
  {
    id: "ai_dorm",
    label: "AI宿舍",
    note: "工作协议、AI生产资料、AI员工和任务收件箱。",
    scopes: [
      {
        id: ALL_SCOPE_ID,
        label: "全部 AI宿舍",
        description: "默认覆盖 AI宿舍全部范围。",
        visibleAgents: [],
      },
      {
        id: "ai-dorm-protocols",
        label: "工作协议网关",
        description: "工作协议定义、画布和梳理结果。",
        visibleAgents: ["报表龙虾"],
      },
      {
        id: "ai-dorm-skills",
        label: "AI生产资料仓",
        description: "Skill 上传、模板和草案。",
        visibleAgents: ["文档龙虾", "报表龙虾"],
      },
      {
        id: "ai-dorm-agents",
        label: "AI员工",
        description: "AI员工列表、状态和配置。",
        visibleAgents: ["报表龙虾"],
      },
      {
        id: "ai-dorm-tasks",
        label: "任务收件箱",
        description: "execution_tasks / execution_results。",
        visibleAgents: ["报表龙虾", "预警龙虾"],
      },
    ],
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function kindLabel(kind: ProtocolNodeKind) {
  const labels = {
    input: "输入",
    tool: "Tool",
    skill: "Skill",
    rag: "RAG",
    agent: "AI员工",
    dispatch: "分派",
    aggregate: "汇总",
    condition: "条件",
    human: "人工确认",
    bp_question: "BP追问",
    writeback: "写入",
    bp_report: "BP汇报",
    output: "输出",
  };

  return labels[kind];
}

function kindTone(kind: ProtocolNodeKind) {
  const tones = {
    input: "bg-slate-100 text-slate-700",
    tool: "bg-cyan-100 text-cyan-700",
    skill: "bg-blue-100 text-blue-700",
    rag: "bg-indigo-100 text-indigo-700",
    agent: "bg-emerald-100 text-emerald-700",
    dispatch: "bg-teal-100 text-teal-700",
    aggregate: "bg-purple-100 text-purple-700",
    condition: "bg-amber-100 text-amber-700",
    human: "bg-rose-100 text-rose-700",
    bp_question: "bg-fuchsia-100 text-fuchsia-700",
    writeback: "bg-orange-100 text-orange-700",
    bp_report: "bg-violet-100 text-violet-700",
    output: "bg-violet-100 text-violet-700",
  };

  return tones[kind];
}

function blockMenuDescription(kind: ProtocolNodeKind) {
  const descriptions = {
    input: "自然语言入口",
    tool: "系统内置工具",
    skill: "生产资料仓 Skill",
    rag: "知识库检索",
    agent: "部门内员工",
    dispatch: "拆分并分派",
    aggregate: "合并多路结果",
    condition: "按条件分支",
    human: "人工卡点",
    bp_question: "回问用户",
    writeback: "写入业务对象",
    bp_report: "返回执行结果",
    output: "输出回执",
  };

  return descriptions[kind];
}

function paletteTone(kind: ProtocolNodeKind) {
  const tones = {
    input: "border-slate-200 bg-white text-slate-700",
    tool: "border-cyan-200 bg-cyan-50 text-cyan-700",
    skill: "border-blue-200 bg-blue-50 text-blue-700",
    rag: "border-indigo-200 bg-indigo-50 text-indigo-700",
    agent: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dispatch: "border-teal-200 bg-teal-50 text-teal-700",
    aggregate: "border-purple-200 bg-purple-50 text-purple-700",
    condition: "border-amber-200 bg-amber-50 text-amber-700",
    human: "border-rose-200 bg-rose-50 text-rose-700",
    bp_question: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    writeback: "border-orange-200 bg-orange-50 text-orange-700",
    bp_report: "border-violet-200 bg-violet-50 text-violet-700",
    output: "border-violet-200 bg-violet-50 text-violet-700",
  };

  return tones[kind];
}

function formatWorkflowCount(count: number) {
  return `共 ${count} 条工作协议`;
}

function flattenPaletteGroups(groups: AiDormPaletteGroup[]) {
  return groups.flatMap((group) =>
    group.nodes.map((node) => ({
      ...node,
      kind: node.kind as ProtocolNodeKind,
      groupLabel: group.label,
    })),
  );
}

function makeId(prefix: string, value: number) {
  return `${prefix}-${value.toString(36)}`;
}

function getDepartmentDefinition(id: TopDepartmentId) {
  return (
    DEPARTMENT_DEFINITIONS.find((definition) => definition.id === id) ??
    DEPARTMENT_DEFINITIONS[0]
  );
}

function getDepartmentScope(department: CanvasDepartmentDraft) {
  const definition = getDepartmentDefinition(department.departmentId);
  return (
    definition.scopes.find((scope) => scope.id === department.scopeId) ??
    definition.scopes[0]
  );
}

function getDocumentSecondaryOptions(
  department: CanvasDepartmentDraft,
  documentScopes: AiDormDocumentScopeCatalog,
) {
  if (department.departmentId !== "documents") {
    return [];
  }

  if (department.scopeId === DOC_MY_SPACE_SCOPE_ID) {
    return documentScopes.mySpaceFolders;
  }

  if (department.scopeId === DOC_COLLAB_SCOPE_ID) {
    return documentScopes.collaborationSpaces;
  }

  return [];
}

function getDocumentSecondaryScope(
  department: CanvasDepartmentDraft,
  documentScopes: AiDormDocumentScopeCatalog,
) {
  return getDocumentSecondaryOptions(department, documentScopes).find(
    (option) => option.id === department.secondaryScopeId,
  );
}

function resolveDepartmentDetail(
  department: CanvasDepartmentDraft,
  documentScopes: AiDormDocumentScopeCatalog,
) {
  const definition = getDepartmentDefinition(department.departmentId);
  const scope = getDepartmentScope(department);

  if (department.departmentId !== "documents") {
    return {
      description: scope.description || definition.note,
      visibleAgents: scope.id === ALL_SCOPE_ID ? [] : scope.visibleAgents,
    };
  }

  if (scope.id === ALL_SCOPE_ID) {
    return {
      description: "默认覆盖文档档案室下的全部文件与合作空间。",
      visibleAgents: [],
    };
  }

  if (scope.id === DOC_MY_SPACE_SCOPE_ID) {
    const folder = getDocumentSecondaryScope(department, documentScopes);

    return {
      description: folder?.description ?? "请从我的文档空间中选择一个顶层文件夹作为二级范围。",
      visibleAgents: folder?.visibleAgents ?? [],
    };
  }

  const collaborationSpace = getDocumentSecondaryScope(department, documentScopes);

  return {
    description:
      collaborationSpace?.description ??
      "请从合作空间中选择一个协作空间作为二级范围。",
    visibleAgents: collaborationSpace?.visibleAgents ?? [],
  };
}

function createInitialDepartments(): CanvasDepartmentDraft[] {
  return [];
}

function createInitialNodes(): CanvasNodeDraft[] {
  return [];
}

function createInitialEdges(): CanvasEdgeDraft[] {
  return [];
}

const AGENT_NAME_TO_PROTOCOL_ID: Record<string, string> = {
  工单龙虾: "work-order-longxia",
  文档龙虾: "document-longxia",
  图纸龙虾: "drawing-longxia",
  预警龙虾: "alert-longxia",
  报表龙虾: "report-longxia",
};

const NODE_KIND_TO_PROTOCOL_KIND: Record<ProtocolNodeKind, GatewayProtocolNodeKind> = {
  input: "bp_ask_entry",
  tool: "tool_call",
  skill: "skill_call",
  rag: "rag_search",
  agent: "agent_task",
  dispatch: "task_dispatch",
  aggregate: "result_aggregate",
  condition: "condition",
  human: "human_confirm",
  bp_question: "bp_ask_followup",
  writeback: "write_object",
  bp_report: "bp_ask_report",
  output: "bp_ask_report",
};

const DEPARTMENT_ID_TO_PROTOCOL_ID: Record<TopDepartmentId, string> = {
  overview: "overview",
  engineering: "engineering_team",
  work_orders: "work_orders",
  documents: "documents",
  ai_dorm: "ai_dorm",
};

function getProtocolScopeId(department: CanvasDepartmentDraft) {
  if (department.departmentId === "overview") {
    const scopeMap: Record<string, string> = {
      [ALL_SCOPE_ID]: "overview:map",
      "overview-map": "overview:map",
      "overview-engineering": "overview:team_status",
      "overview-alerts": "overview:alerts",
      "overview-settings": "overview:settings",
    };

    return scopeMap[department.scopeId] ?? "overview:map";
  }

  if (department.departmentId === "engineering") {
    return "engineering_team:all";
  }

  if (department.departmentId === "work_orders") {
    const scopeMap: Record<string, string> = {
      [ALL_SCOPE_ID]: "work_orders:all",
      "work-orders-board": "work_orders:list",
      "work-orders-detail": "work_orders:list",
      "work-orders-missing": "work_orders:list",
    };

    return scopeMap[department.scopeId] ?? "work_orders:list";
  }

  if (department.departmentId === "documents") {
    if (department.scopeId === DOC_MY_SPACE_SCOPE_ID) {
      return department.secondaryScopeId
        ? `documents:my_space:${department.secondaryScopeId}`
        : "documents:my_space";
    }

    if (department.scopeId === DOC_COLLAB_SCOPE_ID) {
      return department.secondaryScopeId
        ? `documents:collaboration:${department.secondaryScopeId}`
        : "documents:collaboration";
    }

    return "documents:all";
  }

  const aiDormScopeMap: Record<string, string> = {
    [ALL_SCOPE_ID]: "ai_dorm:work_protocol_gateway",
    "ai-dorm-protocols": "ai_dorm:work_protocol_gateway",
    "ai-dorm-skills": "ai_dorm:production_assets",
    "ai-dorm-agents": "ai_dorm:agents",
    "ai-dorm-tasks": "ai_dorm:work_protocol_gateway",
  };

  return aiDormScopeMap[department.scopeId] ?? "ai_dorm:work_protocol_gateway";
}

function getWritableObjectKindForNode(
  node: CanvasNodeDraft,
  department?: CanvasDepartmentDraft,
): ProtocolReferenceKind | undefined {
  if (node.kind !== "writeback") {
    return undefined;
  }

  if (department?.departmentId === "work_orders") {
    return "work_order";
  }

  if (department?.departmentId === "documents") {
    return "document";
  }

  return "execution_result";
}

function buildProtocolDraftFromCanvas(params: {
  selectedWorkflow: AiDormWorkflowCard;
  departments: CanvasDepartmentDraft[];
  nodes: CanvasNodeDraft[];
  edges: CanvasEdgeDraft[];
  documentScopes: AiDormDocumentScopeCatalog;
}): GatewayWorkProtocolDraft {
  const { selectedWorkflow, departments, nodes, edges, documentScopes } = params;
  const departmentsById = new Map(
    departments.map((department) => [department.id, department]),
  );
  const now = new Date().toISOString();

  return {
    id: `ui-${selectedWorkflow.id}`,
    name: selectedWorkflow.name,
    description: selectedWorkflow.description,
    departments: departments.map((department) => {
      const definition = getDepartmentDefinition(department.departmentId);
      const scope = getDepartmentScope(department);
      const secondaryScope = getDocumentSecondaryScope(department, documentScopes);
      const protocolScopeId = getProtocolScopeId(department);
      const visibleAgentIds = (department.agents ?? [])
        .map((agent) => AGENT_NAME_TO_PROTOCOL_ID[agent.name])
        .filter((agentId): agentId is string => Boolean(agentId));

      return {
        id: department.id,
        departmentId: DEPARTMENT_ID_TO_PROTOCOL_ID[department.departmentId],
        departmentLabel: definition.label,
        primaryScopeId: protocolScopeId,
        primaryScopeLabel:
          secondaryScope?.label ??
          (scope.id === ALL_SCOPE_ID ? definition.label : scope.label),
        secondaryScopeId: secondaryScope?.id,
        secondaryScopeLabel: secondaryScope?.label,
        resourceRefs: [
          {
            kind: "department_scope",
            id: protocolScopeId,
            label: secondaryScope?.label ?? scope.label,
          },
        ],
        visibleAgentIds,
        position: { x: department.x, y: department.y },
        size: { width: department.width, height: department.height },
        collapsed: Boolean(department.collapsed),
      };
    }),
    nodes: nodes.map((node) => {
      const department = departmentsById.get(node.departmentId);
      const protocolKind = NODE_KIND_TO_PROTOCOL_KIND[node.kind];
      const agentId =
        node.kind === "agent" ? AGENT_NAME_TO_PROTOCOL_ID[node.title] : undefined;
      const writableObjectKind = getWritableObjectKindForNode(node, department);

      return {
        id: node.id,
        kind: protocolKind,
        title: node.title,
        userIntent: node.userIntent,
        departmentDraftId: department ? department.id : undefined,
        agentId,
        writableObjectKind,
        position: { x: node.x, y: node.y },
        compiledSpecStatus: "empty",
      };
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.fromNodeId,
      targetNodeId: edge.toNodeId,
      transferIntent: edge.transferIntent,
      compiledSpecStatus: "empty",
    })),
    triggerDrafts: [
      {
        id: "manual-trigger",
        label: "手动触发",
        description: "从 BP问问 判断需要执行该工作协议时触发。",
        matchMode: "manual",
        enabled: true,
      },
    ],
    compileStatus: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

function mapGatewayIssue(issue: GatewayProtocolIssue): CompileIssue {
  return {
    id: issue.id,
    severity: issue.severity,
    targetKind: issue.target.kind === "protocol" ? "canvas" : issue.target.kind,
    targetId: issue.target.id,
    code: issue.code,
    message: issue.message,
    suggestion: issue.suggestion ?? "请检查该节点、连线或部门范围配置。",
  };
}

function mapAuditEventTargetKind(
  event: WorkProtocolGroomingAuditEvent,
): CompileIssue["targetKind"] {
  return event.target.kind === "protocol" ? "canvas" : event.target.kind;
}

function mapAuditEventToIssue(
  event: WorkProtocolGroomingAuditEvent,
): CompileIssue | null {
  if (event.severity !== "error" && event.severity !== "warning") {
    return null;
  }

  return {
    id: `audit-${event.id}`,
    severity: event.severity,
    targetKind: mapAuditEventTargetKind(event),
    targetId: event.target.id,
    code: event.code,
    message: event.message,
    suggestion:
      event.suggestion ??
      (event.path ? `检查参数路径：${event.path}` : "请检查协议梳理审计里的对应阶段。"),
  };
}

function compileIssueKey(issue: CompileIssue) {
  return [
    issue.severity,
    issue.targetKind,
    issue.targetId ?? "root",
    issue.code,
    issue.message,
  ].join(":");
}

function dedupeCompileIssues(issues: CompileIssue[]) {
  return Array.from(
    new Map(issues.map((issue) => [compileIssueKey(issue), issue])).values(),
  );
}

function collectAuditIssues(audit?: WorkProtocolGroomingAudit | null) {
  if (!audit) {
    return [];
  }

  return audit.sections
    .flatMap((section) => section.events)
    .map(mapAuditEventToIssue)
    .filter((issue): issue is CompileIssue => Boolean(issue));
}

function auditTargetKey(kind: "department" | "node" | "edge", id: string) {
  return `${kind}:${id}`;
}

function getLocalAuditEvents(
  eventsByTarget: Record<string, WorkProtocolGroomingAuditEvent[]>,
  kind: "department" | "node" | "edge",
  id: string,
) {
  return eventsByTarget[auditTargetKey(kind, id)] ?? [];
}

function mapGatewayCompileStatus(
  status: "compiled" | "compiled_with_warnings" | "invalid",
): CompileStatus {
  if (status === "compiled") {
    return "valid";
  }

  if (status === "compiled_with_warnings") {
    return "valid_with_warnings";
  }

  return "invalid";
}

function mapGatewayGroomStatus(result: GatewayGroomingResult): CompileStatus {
  if (result.status === "invalid" || result.protocolSummary.errors > 0) {
    return "invalid";
  }

  if (
    result.status === "groomed_with_issues" ||
    result.protocolSummary.warnings > 0
  ) {
    return "valid_with_warnings";
  }

  return "valid";
}

function collectGroomingIssues(result: GatewayGroomingResult): CompileIssue[] {
  const issueMap = new Map<string, GatewayProtocolIssue>();
  const addIssue = (issue: GatewayProtocolIssue) => {
    issueMap.set(issue.id, issue);
  };

  for (const issue of result.protocolSummary.issues) {
    addIssue(issue);
  }

  for (const annotation of Object.values(result.departmentAnnotations)) {
    for (const issue of annotation.issues) {
      addIssue(issue);
    }
  }

  for (const annotation of Object.values(result.nodeAnnotations)) {
    for (const issue of annotation.issues) {
      addIssue(issue);
    }
  }

  for (const annotation of Object.values(result.edgeAnnotations)) {
    for (const issue of annotation.issues) {
      addIssue(issue);
    }
  }

  for (const issue of result.compileResult.validation.issues) {
    addIssue(issue);
  }

  return dedupeCompileIssues([
    ...collectAuditIssues(result.audit),
    ...Array.from(issueMap.values()).map(mapGatewayIssue),
  ]);
}

async function saveGatewayDraftRecord(params: {
  draft: GatewayWorkProtocolDraft;
  kind: GatewayDraftRecordSummary["kind"];
  sourceRecordId?: string;
  groomingResult?: GatewayGroomingResult;
  catalogHash?: string;
}) {
  const response = await fetch("/api/ai-dorm/work-protocol-gateway/drafts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  const payload = (await response.json().catch(() => null)) as
    | GatewayDraftsApiResponse
    | null;

  if (!response.ok || !payload?.record) {
    throw new Error(payload?.message ?? "Work protocol draft save failed.");
  }

  return payload.record;
}

function normalizeDraftForTrace(draft?: GatewayWorkProtocolDraft) {
  if (!draft) {
    return null;
  }

  return {
    id: draft.id,
    name: draft.name,
    description: draft.description,
    departments: draft.departments,
    nodes: draft.nodes.map((node) => ({
      ...node,
      compiledSpecStatus: undefined,
      compiledSpec: undefined,
    })),
    edges: draft.edges.map((edge) => ({
      ...edge,
      compiledSpecStatus: undefined,
      compiledSpec: undefined,
    })),
    triggerDrafts: draft.triggerDrafts,
  };
}

function draftMatchesForTrace(
  currentDraft: GatewayWorkProtocolDraft,
  savedDraft?: GatewayWorkProtocolDraft,
) {
  if (!savedDraft) {
    return false;
  }

  return (
    JSON.stringify(normalizeDraftForTrace(currentDraft)) ===
    JSON.stringify(normalizeDraftForTrace(savedDraft))
  );
}

function pickLatestDraftRecord(
  records: GatewayDraftRecordSummary[],
  kind: GatewayDraftRecordSummary["kind"],
) {
  return records.find((record) => record.kind === kind);
}

function pickRegisteredProtocol(
  protocols: RegisteredProtocolSummary[] | undefined,
  draftId: string,
) {
  return protocols?.find((protocol) => protocol.draftId === draftId) ?? null;
}

function compileStatusFromStoredTrace(params: {
  groomedRecord?: GatewayDraftRecordSummary;
  stale: boolean;
}): CompileStatus {
  const summary = params.groomedRecord?.grooming?.summary;

  if (params.stale) {
    return "dirty_after_compile";
  }

  if (!summary) {
    return "draft";
  }

  if (summary.errors > 0) {
    return "invalid";
  }

  if (summary.warnings > 0) {
    return "valid_with_warnings";
  }

  return "valid";
}

type PendingParameterPatchApply = ParameterPatchCandidatePreview & {
  operationId: string;
  auditRecord?: WorkProtocolParameterPatchAuditSummary;
};

type RegisteredVersionDiffItem = {
  id: string;
  targetLabel: string;
  parameterLabel: string;
  before: string;
  after: string;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const GATEWAY_NODE_KIND_LABELS: Record<GatewayProtocolNodeKind, string> = {
  bp_ask_entry: "入口",
  tool_call: "Tool",
  skill_call: "Skill",
  rag_search: "RAG",
  agent_task: "AI员工",
  task_dispatch: "分派",
  result_aggregate: "汇总",
  condition: "条件",
  human_confirm: "人工确认",
  bp_ask_followup: "追问",
  write_object: "写入",
  bp_ask_report: "汇报",
};

function executionStatusLabel(status: WorkProtocolExecutionPlanSummary["status"]) {
  const labels: Record<WorkProtocolExecutionPlanSummary["status"], string> = {
    queued: "已排队",
    running: "运行中",
    waiting_confirmation: "等确认",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
  };

  return labels[status] ?? status;
}

function nodeRunStatusLabel(
  status: WorkProtocolExecutionPlanSummary["nodePlan"][number]["status"],
) {
  const labels: Record<
    WorkProtocolExecutionPlanSummary["nodePlan"][number]["status"],
    string
  > = {
    queued: "待跑",
    running: "运行中",
    waiting_confirmation: "等确认",
    completed: "完成",
    skipped: "跳过",
    failed: "失败",
  };

  return labels[status] ?? status;
}

function formatExecutionTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function riskTone(riskLevel: string) {
  if (riskLevel === "critical" || riskLevel === "high") {
    return "bg-rose-50 text-rose-700";
  }

  if (riskLevel === "medium") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-slate-100 text-slate-600";
}

function edgePath(from: CanvasNodeDraft, to: CanvasNodeDraft) {
  const startX = from.x + NODE_WIDTH;
  const startY = from.y + NODE_HEIGHT / 2;
  const endX = to.x;
  const endY = to.y + NODE_HEIGHT / 2;
  const distance = Math.max(68, Math.abs(endX - startX) * 0.36);

  return `M ${startX} ${startY} C ${startX + distance} ${startY}, ${
    endX - distance
  } ${endY}, ${endX} ${endY}`;
}

function clampDepartmentAgentPosition(
  department: CanvasDepartmentDraft,
  position: { x: number; y: number },
) {
  const maxX = Math.max(
    DEPARTMENT_AGENT_PADDING,
    department.width - DEPARTMENT_AGENT_WIDTH - DEPARTMENT_AGENT_PADDING,
  );
  const minX = Math.min(DEPARTMENT_AGENT_MIN_X, maxX);
  const maxY = Math.max(
    DEPARTMENT_AGENT_PADDING,
    department.height - DEPARTMENT_AGENT_HEIGHT - DEPARTMENT_AGENT_PADDING,
  );

  return {
    x: clamp(position.x, minX, maxX),
    y: clamp(position.y, DEPARTMENT_AGENT_PADDING, maxY),
  };
}

function getDepartmentRenderFrame(department: CanvasDepartmentDraft) {
  const agents = department.agents ?? [];

  if (!department.collapsed) {
    return {
      left: department.x,
      top: department.y,
      width: department.width,
      height: department.height,
      agentOffsetX: 0,
      agentOffsetY: 0,
    };
  }

  if (agents.length === 0) {
    const width = 260;
    const height = 92;

    return {
      left: department.x + Math.max(0, department.width - width),
      top: department.y,
      width,
      height,
      agentOffsetX: 0,
      agentOffsetY: 0,
    };
  }

  const minX =
    Math.min(...agents.map((agent) => agent.x)) - DEPARTMENT_COLLAPSED_PADDING;
  const minY =
    Math.min(...agents.map((agent) => agent.y)) - DEPARTMENT_COLLAPSED_TOP_PADDING;
  const maxX =
    Math.max(...agents.map((agent) => agent.x + DEPARTMENT_AGENT_WIDTH)) +
    DEPARTMENT_COLLAPSED_PADDING;
  const maxY =
    Math.max(...agents.map((agent) => agent.y + DEPARTMENT_AGENT_HEIGHT)) +
    DEPARTMENT_COLLAPSED_PADDING;

  return {
    left: department.x + minX,
    top: department.y + minY,
    width: Math.max(260, maxX - minX),
    height: Math.max(120, maxY - minY),
    agentOffsetX: -minX,
    agentOffsetY: -minY,
  };
}

function getNextDepartmentAgentPosition(
  department: CanvasDepartmentDraft,
  index: number,
) {
  const column = index % 2;
  const row = Math.floor(index / 2);

  return clampDepartmentAgentPosition(department, {
    x: DEPARTMENT_AGENT_MIN_X + column * (DEPARTMENT_AGENT_WIDTH + 28),
    y: 72 + row * (DEPARTMENT_AGENT_HEIGHT + 18),
  });
}

function getDepartmentAgentProtocolNodes(
  departments: CanvasDepartmentDraft[],
): CanvasNodeDraft[] {
  return departments.flatMap((department) =>
    (department.agents ?? []).map((agent) => ({
      id: agent.id,
      title: agent.name,
      kind: "agent" as const,
      departmentId: department.id,
      userIntent: agent.userIntent,
      x: department.x + agent.x,
      y: department.y + agent.y,
    })),
  );
}

function hasBlockingIssue(issues: CompileIssue[], kind: CompileIssue["targetKind"], id: string) {
  return issues.some(
    (issue) => issue.targetKind === kind && issue.targetId === id && issue.severity === "error",
  );
}

function hasWarningIssue(issues: CompileIssue[], kind: CompileIssue["targetKind"], id: string) {
  return issues.some(
    (issue) =>
      issue.targetKind === kind && issue.targetId === id && issue.severity === "warning",
  );
}

function statusLabel(status: CompileStatus) {
  const labels = {
    draft: "草稿",
    compiling: "梳理中",
    valid: "可试运行",
    valid_with_warnings: "有警告",
    invalid: "未通过",
    dirty_after_compile: "已变更",
  };

  return labels[status];
}

function runMockCompile(params: {
  nodes: CanvasNodeDraft[];
  edges: CanvasEdgeDraft[];
  departments: CanvasDepartmentDraft[];
}) {
  const issues: CompileIssue[] = [];
  let issueIndex = 1;

  const pushIssue = (issue: Omit<CompileIssue, "id">) => {
    issues.push({ ...issue, id: `issue-${issueIndex++}` });
  };

  for (const node of params.nodes) {
    const department = params.departments.find((item) => item.id === node.departmentId);
    const departmentDefinition = department
      ? getDepartmentDefinition(department.departmentId)
      : null;
    const intent = node.userIntent.trim();
    const text = `${node.title} ${intent}`;

    if (!intent) {
      pushIssue({
        severity: "warning",
        targetKind: "node",
        targetId: node.id,
        code: "MISSING_REQUIRED_PARAM",
        message: `${node.title} 还没有写“您想让它干什么”。`,
        suggestion: "给这个方块补一句自然语言任务，例如“读取工单并整理风险点”。",
      });
    }

    if (node.kind === "writeback") {
      pushIssue({
        severity: "warning",
        targetKind: "node",
        targetId: node.id,
        code: "REQUIRES_HUMAN_GATE",
        message: `${node.title} 是写入动作，建议前置人工确认。`,
        suggestion: "在写入对象前接一个人工确认节点，确认目标对象、写入字段和回滚方式。",
      });
    }

    if (/胡言乱语|月亮|火星|预算里/.test(text)) {
      pushIssue({
        severity: "error",
        targetKind: "node",
        targetId: node.id,
        code: "UNREADABLE_INTENT",
        message: `${node.title} 的任务描述无法被梳理成工作协议。`,
        suggestion: "换成明确动作、对象和结果，例如“检查文件夹里缺哪些归档材料”。",
      });
    }

    if (/合同复核\s*Skill|合同复核/.test(text)) {
      pushIssue({
        severity: "error",
        targetKind: "node",
        targetId: node.id,
        code: "SKILL_NOT_FOUND",
        message: `${node.title} 提到的“合同复核 Skill”不在 AI生产资料仓中。`,
        suggestion: "从 AI生产资料仓选择现有 Skill，或先创建“合同复核 Skill”。",
      });
    }

    if (
      node.kind === "agent" &&
      /工单龙虾/.test(text) &&
      departmentDefinition?.id === "documents"
    ) {
      pushIssue({
        severity: "error",
        targetKind: "node",
        targetId: node.id,
        code: "AGENT_NOT_VISIBLE_IN_DEPARTMENT",
        message: "工单龙虾当前不可用于文档部门。",
        suggestion: "切换为文档龙虾，或调整该龙虾的可见工作部门。",
      });
    }

    if (/改成|写回|更新|通知|发送|删除/.test(intent)) {
      pushIssue({
        severity: "warning",
        targetKind: "node",
        targetId: node.id,
        code: "REQUIRES_HUMAN_GATE",
        message: `${node.title} 涉及写回或外部动作。`,
        suggestion: "建议在该节点后加入人工确认，避免直接执行高风险动作。",
      });
    }
  }

  for (const edge of params.edges) {
    const from = params.nodes.find((node) => node.id === edge.fromNodeId);
    const transferIntent = edge.transferIntent.trim();

    if (!transferIntent) {
      pushIssue({
        severity: "warning",
        targetKind: "edge",
        targetId: edge.id,
        code: "MISSING_REQUIRED_PARAM",
        message: "这条连线还没有写要传什么。",
        suggestion: "补一句“把摘要、风险点、下一步建议传给下一个节点”。",
      });
    }

    if (
      /验收金额|结算金额/.test(transferIntent) &&
      !/金额|结算|验收/.test(from?.userIntent ?? "")
    ) {
      pushIssue({
        severity: "error",
        targetKind: "edge",
        targetId: edge.id,
        code: "UPSTREAM_FIELD_NOT_AVAILABLE",
        message: "连线要求传递金额字段，但上游节点不会产出该字段。",
        suggestion: "改传上游已产出的字段，或在上游增加金额读取节点。",
      });
    }
  }

  const hasErrors = issues.some((issue) => issue.severity === "error");
  const hasWarnings = issues.some((issue) => issue.severity === "warning");
  const status: CompileStatus = hasErrors
    ? "invalid"
    : hasWarnings
      ? "valid_with_warnings"
      : "valid";

  return { status, issues };
}

function CanvasNode({
  node,
  error,
  warning,
  dragging,
  connecting,
  parameterCodeBlock,
  auditEvents,
  codeStale,
  parameterPatchPreviewBusy,
  onStartDrag,
  onConnectorClick,
  onDelete,
  onChangeIntent,
  onPreviewCandidate,
}: {
  node: CanvasNodeDraft;
  error: boolean;
  warning: boolean;
  dragging: boolean;
  connecting: boolean;
  parameterCodeBlock?: ProtocolParameterCodeBlock;
  auditEvents?: WorkProtocolGroomingAuditEvent[];
  codeStale: boolean;
  parameterPatchPreviewBusy: boolean;
  onStartDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  onConnectorClick: () => void;
  onDelete: () => void;
  onChangeIntent: (value: string) => void;
  onPreviewCandidate: (preview: ParameterPatchCandidatePreview) => void;
}) {
  const tone = error
    ? "border-rose-300 bg-rose-50/95 shadow-[0_18px_45px_-32px_rgba(244,63,94,0.8)]"
    : warning
      ? "border-amber-300 bg-amber-50/95 shadow-[0_18px_45px_-32px_rgba(245,158,11,0.75)]"
      : "border-slate-200/90 bg-white/95 shadow-[0_16px_38px_-30px_rgba(15,23,42,0.42)]";

  return (
    <article
      data-canvas-object="true"
      className={`absolute z-20 rounded-[1.2rem] border p-3 backdrop-blur ${tone} ${
        dragging ? "cursor-grabbing ring-2 ring-blue-200" : ""
      }`}
      style={{
        left: node.x,
        top: node.y,
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
      }}
    >
      <button
        type="button"
        aria-label="连接方块"
        onClick={(event) => {
          event.stopPropagation();
          onConnectorClick();
        }}
        className={`absolute top-1/2 left-[-6px] h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white shadow-sm transition ${
          connecting ? "bg-indigo-600 ring-4 ring-indigo-100" : "bg-blue-500 hover:bg-indigo-600"
        }`}
      />
      <button
        type="button"
        aria-label="连接方块"
        onClick={(event) => {
          event.stopPropagation();
          onConnectorClick();
        }}
        className={`absolute top-1/2 right-[-6px] h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white shadow-sm transition ${
          connecting ? "bg-indigo-600 ring-4 ring-indigo-100" : "bg-blue-500 hover:bg-indigo-600"
        }`}
      />
      <div
        className="flex cursor-grab touch-none items-start justify-between gap-3 active:cursor-grabbing"
        onPointerDown={onStartDrag}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${kindTone(
                node.kind,
              )}`}
            >
              {kindLabel(node.kind)}
            </span>
            <div className="truncate text-[0.9rem] font-black tracking-tight text-slate-950">
              {node.title}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-400">
            拖动
          </span>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="h-7 w-7 rounded-full bg-slate-100 text-[12px] font-black text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            aria-label={`删除${node.title}`}
            title="删除方块"
          >
            ×
          </button>
        </div>
      </div>

      <label className="mt-3 block">
        <span className="text-[10px] font-black text-slate-400">您想让它干什么</span>
        <textarea
          value={node.userIntent}
          onChange={(event) => onChangeIntent(event.target.value)}
          rows={3}
          className="mt-1 w-full resize-none rounded-[0.9rem] border border-slate-200 bg-white/90 px-3 py-2 text-[11px] leading-5 text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <TargetProtocolDetails
        block={parameterCodeBlock}
        auditEvents={auditEvents}
        stale={codeStale}
        previewBusy={parameterPatchPreviewBusy}
        onPreviewCandidate={onPreviewCandidate}
      />
    </article>
  );
}

function DepartmentBlock({
  department,
  documentScopes,
  error,
  warning,
  dragging,
  activeAgentId,
  connectingFromId,
  issues,
  auditEventsByTarget,
  parameterCodeBlocksByTargetId,
  codeStale,
  parameterPatchPreviewBusy,
  onStartDrag,
  onStartAgentDrag,
  onAgentConnectorClick,
  onChange,
  onAddAgent,
  onRemoveAgent,
  onDelete,
  onChangeAgentIntent,
  onPreviewCandidate,
}: {
  department: CanvasDepartmentDraft;
  documentScopes: AiDormDocumentScopeCatalog;
  error: boolean;
  warning: boolean;
  dragging: boolean;
  activeAgentId?: string;
  connectingFromId: string | null;
  issues: CompileIssue[];
  auditEventsByTarget: Record<string, WorkProtocolGroomingAuditEvent[]>;
  parameterCodeBlocksByTargetId: Map<string, ProtocolParameterCodeBlock>;
  codeStale: boolean;
  parameterPatchPreviewBusy: boolean;
  onStartDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  onStartAgentDrag: (
    agent: CanvasDepartmentAgentDraft,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  onAgentConnectorClick: (agentId: string) => void;
  onChange: (department: CanvasDepartmentDraft) => void;
  onAddAgent: (agentName: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onDelete: () => void;
  onChangeAgentIntent: (agentId: string, value: string) => void;
  onPreviewCandidate: (preview: ParameterPatchCandidatePreview) => void;
}) {
  const definition = getDepartmentDefinition(department.departmentId);
  const scope = getDepartmentScope(department);
  const documentSecondaryOptions = getDocumentSecondaryOptions(department, documentScopes);
  const documentSecondaryScope = getDocumentSecondaryScope(department, documentScopes);
  const detail = resolveDepartmentDetail(department, documentScopes);
  const visibleAgents = detail.visibleAgents;
  const placedAgents = department.agents ?? [];
  const renderFrame = getDepartmentRenderFrame(department);
  const departmentAuditEvents = getLocalAuditEvents(
    auditEventsByTarget,
    "department",
    department.id,
  );
  const showDocumentSecondary =
    department.departmentId === "documents" &&
    (department.scopeId === DOC_MY_SPACE_SCOPE_ID || department.scopeId === DOC_COLLAB_SCOPE_ID);

  return (
    <section
      data-canvas-object="true"
      className={`absolute z-0 overflow-visible rounded-[1.6rem] border-2 border-dashed p-4 ${
        error
          ? "border-rose-300 bg-rose-50/45"
          : warning
            ? "border-amber-300 bg-amber-50/40"
          : "border-blue-200 bg-blue-50/35"
      } ${dragging ? "ring-2 ring-blue-200" : ""}`}
      style={{
        left: renderFrame.left,
        top: renderFrame.top,
        width: renderFrame.width,
        height: renderFrame.height,
      }}
    >
      <div className="absolute top-4 right-4 z-40 flex items-center gap-2">
        {department.collapsed ? (
          <button
            type="button"
            onPointerDown={onStartDrag}
            className="cursor-grab touch-none rounded-full border border-blue-100 bg-white/95 px-3 py-1.5 text-[10px] font-black text-blue-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 active:cursor-grabbing"
          >
            拖动部门
          </button>
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChange({
              ...department,
              collapsed: !department.collapsed,
            });
          }}
          className="rounded-full border border-blue-100 bg-white/95 px-3 py-1.5 text-[10px] font-black text-blue-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
        >
          {department.collapsed ? "展开部门" : "收缩部门"}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className="h-7 w-7 rounded-full border border-slate-200 bg-white/95 text-[12px] font-black text-slate-400 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
          aria-label="删除部门"
          title="删除部门"
        >
          ×
        </button>
      </div>

      {department.collapsed ? (
        <div className="pointer-events-none absolute top-4 left-5 z-30 max-w-[calc(100%-13rem)]">
          <div className="truncate text-[12px] font-black tracking-tight text-slate-500/75">
            {definition.label}
          </div>
          {scope.id !== ALL_SCOPE_ID ? (
            <div className="mt-1 truncate text-[10px] font-bold text-slate-400/75">
              {scope.label}
            </div>
          ) : null}
          {documentSecondaryScope ? (
            <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400/65">
              {documentSecondaryScope.label}
            </div>
          ) : null}
        </div>
      ) : null}

      {!department.collapsed ? (
        <div className="flex max-w-[25rem] flex-col gap-2 rounded-[1.15rem] border border-white/80 bg-white/85 p-3 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-[10px] font-black text-blue-700">
            部门沙箱
          </span>
          <button
            type="button"
            onPointerDown={onStartDrag}
            className="cursor-grab touch-none rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[10px] font-black text-blue-600 active:cursor-grabbing"
          >
            拖动部门
          </button>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500">
            顶栏部门
          </span>
        </div>
        <label className="block">
          <span className="text-[10px] font-black text-slate-400">大部门</span>
          <select
            value={department.departmentId}
            onChange={(event) => {
              const nextDepartmentId = event.target.value as TopDepartmentId;
              onChange({
                ...department,
                departmentId: nextDepartmentId,
                scopeId: ALL_SCOPE_ID,
                secondaryScopeId: undefined,
                agents: [],
              });
            }}
            className="mt-1 w-full rounded-[0.8rem] border border-slate-200 bg-white px-3 py-2 text-sm font-black tracking-tight text-slate-950 outline-none focus:border-blue-300"
          >
            {DEPARTMENT_DEFINITIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-black text-slate-400">具体范围</span>
          <select
            value={scope.id}
            onChange={(event) =>
              onChange({
                ...department,
                scopeId: event.target.value,
                secondaryScopeId: undefined,
                agents: [],
              })
            }
            disabled={definition.scopes.length <= 1}
            className="mt-1 w-full rounded-[0.8rem] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 disabled:bg-slate-50 disabled:text-slate-400"
          >
            {definition.scopes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[10px] leading-4 text-slate-400">{scope.description}</span>
        </label>
        {showDocumentSecondary ? (
          <label className="block">
            <span className="text-[10px] font-black text-slate-400">二级范围</span>
            <select
              value={department.secondaryScopeId ?? ""}
              onChange={(event) =>
                onChange({
                  ...department,
                  secondaryScopeId: event.target.value || undefined,
                  agents: [],
                })
              }
              className="mt-1 w-full rounded-[0.8rem] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300"
            >
              <option value="">
                {department.scopeId === DOC_MY_SPACE_SCOPE_ID ? "选择文件夹" : "选择合作空间"}
              </option>
              {documentSecondaryOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="rounded-[0.8rem] border border-slate-200 bg-slate-50/70 px-3 py-2 text-[10px] leading-4 text-slate-500">
          {detail.description}
        </div>
        <TargetProtocolDetails
          auditEvents={departmentAuditEvents}
          stale={codeStale}
          compact
        />
        <div className="rounded-[0.8rem] border border-slate-200 bg-white px-3 py-2">
          <div className="text-[10px] font-black text-slate-400">可见AI员工</div>
          {visibleAgents.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {visibleAgents.map((agent) => {
                const selected = placedAgents.some((item) => item.name === agent);

                return (
                  <button
                    key={agent}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddAgent(agent);
                    }}
                    disabled={selected}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                      selected
                        ? "cursor-default bg-slate-100 text-slate-400"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                    title={selected ? "已放入当前部门" : "点击放入当前部门"}
                  >
                    {agent}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-1 text-[10px] leading-4 text-slate-400">
              选择到具体范围后显示该范围内可见的 AI员工。
            </div>
          )}
        </div>
      </div>
      ) : placedAgents.length === 0 ? (
        <div className="absolute top-4 left-4 max-w-36 text-[10px] font-semibold leading-4 text-slate-400">
          部门已收缩，暂无 AI员工。
        </div>
      ) : null}

      {placedAgents.map((agent) => {
        const agentError = hasBlockingIssue(issues, "node", agent.id);
        const agentWarning = hasWarningIssue(issues, "node", agent.id);
        const agentAuditEvents = getLocalAuditEvents(
          auditEventsByTarget,
          "node",
          agent.id,
        );
        const connecting = connectingFromId === agent.id;
        const tone = agentError
          ? "border-rose-300 bg-rose-50/95 shadow-[0_18px_45px_-32px_rgba(244,63,94,0.8)]"
          : agentWarning
            ? "border-amber-300 bg-amber-50/95 shadow-[0_18px_45px_-32px_rgba(245,158,11,0.75)]"
            : "border-emerald-100 bg-white/95 shadow-[0_16px_38px_-30px_rgba(15,23,42,0.42)]";

        return (
          <article
            key={agent.id}
            data-canvas-object="true"
            className={`absolute z-20 rounded-[1.2rem] border p-3 backdrop-blur ${tone} ${
              activeAgentId === agent.id ? "cursor-grabbing ring-2 ring-emerald-100" : ""
            }`}
            style={{
              left: agent.x + renderFrame.agentOffsetX,
              top: agent.y + renderFrame.agentOffsetY,
              width: DEPARTMENT_AGENT_WIDTH,
              minHeight: DEPARTMENT_AGENT_HEIGHT,
            }}
          >
            <button
              type="button"
              aria-label="连接AI员工"
              onClick={(event) => {
                event.stopPropagation();
                onAgentConnectorClick(agent.id);
              }}
              className={`absolute top-1/2 left-[-6px] h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white shadow-sm transition ${
                connecting
                  ? "bg-indigo-600 ring-4 ring-indigo-100"
                  : "bg-blue-500 hover:bg-indigo-600"
              }`}
            />
            <button
              type="button"
              aria-label="连接AI员工"
              onClick={(event) => {
                event.stopPropagation();
                onAgentConnectorClick(agent.id);
              }}
              className={`absolute top-1/2 right-[-6px] h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white shadow-sm transition ${
                connecting
                  ? "bg-indigo-600 ring-4 ring-indigo-100"
                  : "bg-blue-500 hover:bg-indigo-600"
              }`}
            />

            <div
              className="flex cursor-grab touch-none items-start justify-between gap-3 active:cursor-grabbing"
              onPointerDown={(event) => onStartAgentDrag(agent, event)}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                    AI员工
                  </span>
                  <div className="truncate text-[0.9rem] font-black tracking-tight text-slate-950">
                    {agent.name}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-400">
                  拖动
                </span>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveAgent(agent.id);
                  }}
                  className="h-6 w-6 rounded-full bg-slate-100 text-[11px] font-black text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`移除 ${agent.name}`}
                >
                  ×
                </button>
              </div>
            </div>

            <label className="mt-3 block">
              <span className="text-[10px] font-black text-slate-400">
                您想让它干什么
              </span>
              <textarea
                value={agent.userIntent}
                onChange={(event) => onChangeAgentIntent(agent.id, event.target.value)}
                rows={3}
                className="mt-1 w-full resize-none rounded-[0.9rem] border border-slate-200 bg-white/90 px-3 py-2 text-[11px] leading-5 text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <TargetProtocolDetails
              block={parameterCodeBlocksByTargetId.get(agent.id)}
              auditEvents={agentAuditEvents}
              stale={codeStale}
              compact
              previewBusy={parameterPatchPreviewBusy}
              onPreviewCandidate={onPreviewCandidate}
            />
          </article>
        );
      })}
    </section>
  );
}

function EdgeIntentCard({
  edge,
  from,
  to,
  error,
  warning,
  open,
  parameterCodeBlock,
  auditEvents,
  codeStale,
  parameterPatchPreviewBusy,
  onToggle,
  onChange,
  onPreviewCandidate,
}: {
  edge: CanvasEdgeDraft;
  from: CanvasNodeDraft;
  to: CanvasNodeDraft;
  error: boolean;
  warning: boolean;
  open: boolean;
  parameterCodeBlock?: ProtocolParameterCodeBlock;
  auditEvents?: WorkProtocolGroomingAuditEvent[];
  codeStale: boolean;
  parameterPatchPreviewBusy: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  onPreviewCandidate: (preview: ParameterPatchCandidatePreview) => void;
}) {
  const x = (from.x + to.x) / 2 + NODE_WIDTH / 2 - (open ? 92 : 8);
  const y = (from.y + to.y) / 2 + NODE_HEIGHT / 2 - (open ? 42 : 8);

  if (!open) {
    return (
      <button
        type="button"
        data-canvas-object="true"
        aria-label="编辑连线传输规则"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className={`absolute z-30 h-4 w-4 rotate-45 rounded-[0.22rem] border bg-white shadow-sm transition hover:scale-110 ${
          error ? "border-rose-300" : warning ? "border-amber-300" : "border-indigo-200"
        }`}
        style={{ left: x, top: y }}
      />
    );
  }

  return (
    <div
      data-canvas-object="true"
      className={`absolute z-30 w-44 rounded-[1rem] border bg-white/95 p-2 shadow-[0_18px_42px_-30px_rgba(15,23,42,0.65)] backdrop-blur ${
        error ? "border-rose-300" : warning ? "border-amber-300" : "border-slate-200"
      }`}
      style={{ left: x, top: y }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-black text-slate-500">传输规则</span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          className="h-5 w-5 rotate-45 rounded-[0.25rem] border border-slate-200 bg-slate-50 text-[0px] shadow-sm"
        >
          收起
        </button>
      </div>
      <label className="mt-2 block">
        <textarea
          value={edge.transferIntent}
          onChange={(event) => onChange(event.target.value)}
          rows={2}
          className="mt-1 w-full resize-none rounded-[0.75rem] border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-[10px] leading-4 text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        />
      </label>
      <TargetProtocolDetails
        block={parameterCodeBlock}
        auditEvents={auditEvents}
        stale={codeStale}
        compact
        previewBusy={parameterPatchPreviewBusy}
        onPreviewCandidate={onPreviewCandidate}
      />
    </div>
  );
}

function shortTraceId(value?: string) {
  if (!value) {
    return "未生成";
  }

  if (value.length <= 22) {
    return value;
  }

  return `${value.slice(0, 13)}...${value.slice(-6)}`;
}

function getActiveRegisteredVersion(protocol?: RegisteredProtocolSummary | null) {
  if (!protocol?.versions?.length) {
    return undefined;
  }

  return protocol.versions.find(
    (version) => version.versionId === protocol.activeVersionId,
  );
}

function isRegisteredProtocolBehindTrace(
  trace?: WorkProtocolTrace | null,
  protocol?: RegisteredProtocolSummary | null,
) {
  if (!trace?.groomedRecord?.id || !protocol || trace.stale || !trace.canRegister) {
    return false;
  }

  const activeVersion = getActiveRegisteredVersion(protocol);
  return activeVersion?.draftRecordId !== trace.groomedRecord.id;
}

function sameRegisteredDiffValue(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function formatRegisteredDiffValue(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "未设置";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? "空数组" : `${value.length} 项`;
  }

  if (isPlainRecord(value)) {
    const mode = value.mode;

    if (typeof mode === "string") {
      return mode;
    }

    const json = JSON.stringify(value);
    return json.length > 48 ? `${json.slice(0, 45)}...` : json;
  }

  return String(value);
}

function getCompiledSpecRecord(value: unknown) {
  if (!isPlainRecord(value)) {
    return {};
  }

  return isPlainRecord(value.compiledSpec) ? value.compiledSpec : {};
}

function getNestedDiffValue(value: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!isPlainRecord(current)) {
      return undefined;
    }

    return current[key];
  }, value);
}

function pushRegisteredDiff(params: {
  diffs: RegisteredVersionDiffItem[];
  id: string;
  targetLabel: string;
  parameterLabel: string;
  before: unknown;
  after: unknown;
}) {
  if (sameRegisteredDiffValue(params.before, params.after)) {
    return;
  }

  params.diffs.push({
    id: params.id,
    targetLabel: params.targetLabel,
    parameterLabel: params.parameterLabel,
    before: formatRegisteredDiffValue(params.before),
    after: formatRegisteredDiffValue(params.after),
  });
}

function buildRegisteredVersionDiff(
  trace?: WorkProtocolTrace | null,
  protocol?: RegisteredProtocolSummary | null,
) {
  const currentDraft = trace?.groomedRecord?.draft;
  const activeDraft = getActiveRegisteredVersion(protocol)?.draftSnapshot;
  const diffs: RegisteredVersionDiffItem[] = [];

  if (!currentDraft || !activeDraft) {
    return diffs;
  }

  pushRegisteredDiff({
    diffs,
    id: "protocol:name",
    targetLabel: "协议整体",
    parameterLabel: "名称",
    before: activeDraft.name,
    after: currentDraft.name,
  });
  pushRegisteredDiff({
    diffs,
    id: "protocol:description",
    targetLabel: "协议整体",
    parameterLabel: "说明",
    before: activeDraft.description,
    after: currentDraft.description,
  });

  const previousNodes = new Map(activeDraft.nodes.map((node) => [node.id, node]));
  const currentNodes = new Map(currentDraft.nodes.map((node) => [node.id, node]));

  for (const node of currentDraft.nodes) {
    const previousNode = previousNodes.get(node.id);

    if (!previousNode) {
      diffs.push({
        id: `node:${node.id}:added`,
        targetLabel: node.title,
        parameterLabel: "方块",
        before: "未注册",
        after: "新增",
      });
      continue;
    }

    const beforeSpec = getCompiledSpecRecord(previousNode);
    const afterSpec = getCompiledSpecRecord(node);
    const nodeFields = [
      ["执行对象", "callableId"],
      ["AI员工", "agentId"],
      ["写入对象", "writableObjectKind"],
      ["部门范围", "departmentScopeId"],
      ["风险等级", "riskLevel"],
      ["确认策略", "approvalPolicy"],
      ["失败策略", "failurePolicy.mode"],
      ["超时", "timeoutMs"],
    ] as const;

    for (const [label, path] of nodeFields) {
      pushRegisteredDiff({
        diffs,
        id: `node:${node.id}:${path}`,
        targetLabel: node.title,
        parameterLabel: label,
        before: getNestedDiffValue(beforeSpec, path),
        after: getNestedDiffValue(afterSpec, path),
      });
    }
  }

  for (const node of activeDraft.nodes) {
    if (!currentNodes.has(node.id)) {
      diffs.push({
        id: `node:${node.id}:removed`,
        targetLabel: node.title,
        parameterLabel: "方块",
        before: "已注册",
        after: "已移除",
      });
    }
  }

  const previousEdges = new Map(activeDraft.edges.map((edge) => [edge.id, edge]));
  const currentEdges = new Map(currentDraft.edges.map((edge) => [edge.id, edge]));

  for (const edge of currentDraft.edges) {
    const previousEdge = previousEdges.get(edge.id);

    if (!previousEdge) {
      diffs.push({
        id: `edge:${edge.id}:added`,
        targetLabel: edge.id,
        parameterLabel: "连线",
        before: "未注册",
        after: "新增",
      });
      continue;
    }

    const beforeSpec = getCompiledSpecRecord(previousEdge);
    const afterSpec = getCompiledSpecRecord(edge);
    const edgeFields = [
      ["传输模式", "transferMode"],
      ["通讯提示词", "prompt"],
      ["必需字段", "requiredFields"],
      ["字段映射", "fieldMappings"],
    ] as const;

    for (const [label, path] of edgeFields) {
      pushRegisteredDiff({
        diffs,
        id: `edge:${edge.id}:${path}`,
        targetLabel: edge.id,
        parameterLabel: label,
        before: getNestedDiffValue(beforeSpec, path),
        after: getNestedDiffValue(afterSpec, path),
      });
    }
  }

  for (const edge of activeDraft.edges) {
    if (!currentEdges.has(edge.id)) {
      diffs.push({
        id: `edge:${edge.id}:removed`,
        targetLabel: edge.id,
        parameterLabel: "连线",
        before: "已注册",
        after: "已移除",
      });
    }
  }

  return diffs;
}

function WorkProtocolTracePanel({
  trace,
  registeredProtocol,
}: {
  trace?: WorkProtocolTrace | null;
  registeredProtocol?: RegisteredProtocolSummary | null;
}) {
  const activeVersion = getActiveRegisteredVersion(registeredProtocol);
  const sourceReady = Boolean(trace?.sourceRecord);
  const groomedReady = Boolean(trace?.groomedRecord);
  const registeredReady = Boolean(registeredProtocol);
  const canRegister = Boolean(trace?.canRegister && groomedReady && !trace.stale);
  const registrationNeedsUpdate = isRegisteredProtocolBehindTrace(
    trace,
    registeredProtocol,
  );
  const registeredVersionDiffs = buildRegisteredVersionDiff(
    trace,
    registeredProtocol,
  );
  const registeredVersionDiffPreview = registeredVersionDiffs.slice(0, 5);
  const statusText = trace?.stale
    ? "已过期"
    : canRegister
      ? "可注册"
      : registeredProtocol?.enabled
        ? "已启用"
        : "待梳理";
  const statusTone = trace?.stale
    ? "bg-amber-50 text-amber-700"
    : canRegister || registeredProtocol?.enabled
      ? "bg-emerald-50 text-emerald-700"
      : "bg-slate-100 text-slate-600";

  return (
    <details
      className="mt-3 overflow-hidden rounded-[1.1rem] border border-slate-200 bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            链路检查
          </div>
          <div className="mt-0.5 text-[11px] font-semibold text-slate-600">
            source / groomed / registered
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${statusTone}`}>
          {statusText}
        </span>
      </summary>

      <div className="space-y-2 border-t border-slate-100 bg-slate-50/70 px-2.5 py-2.5">
        <div className="grid gap-1.5">
          <div className="rounded-[0.8rem] bg-white px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black text-slate-800">
                Source 草稿
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  sourceReady ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {sourceReady ? "已保存" : "未生成"}
              </span>
            </div>
            <div className="mt-1 truncate font-mono text-[10px] text-slate-500">
              {shortTraceId(trace?.sourceRecord?.id)}
            </div>
          </div>

          <div className="rounded-[0.8rem] bg-white px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black text-slate-800">
                Groomed 草稿
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  canRegister
                    ? "bg-emerald-50 text-emerald-700"
                    : groomedReady
                      ? "bg-amber-50 text-amber-700"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {canRegister ? "可注册" : groomedReady ? "需处理" : "未生成"}
              </span>
            </div>
            <div className="mt-1 truncate font-mono text-[10px] text-slate-500">
              {shortTraceId(trace?.groomedRecord?.id)}
            </div>
          </div>

          <div className="rounded-[0.8rem] bg-white px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black text-slate-800">
                注册版本
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  registrationNeedsUpdate
                    ? "bg-amber-50 text-amber-700"
                    : registeredProtocol?.enabled
                      ? "bg-emerald-50 text-emerald-700"
                      : registeredReady
                        ? "bg-slate-100 text-slate-600"
                        : "bg-slate-100 text-slate-500"
                }`}
              >
                {registeredProtocol?.enabled
                  ? "已启用"
                  : registeredReady
                    ? "已注册"
                    : "未注册"}
              </span>
            </div>
            <div className="mt-1 truncate font-mono text-[10px] text-slate-500">
              {shortTraceId(activeVersion?.versionId ?? registeredProtocol?.activeVersionId)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-semibold text-slate-500">
          <div className="rounded-[0.7rem] bg-white px-2 py-1.5">
            参数块 <span className="font-black text-slate-900">{trace?.parameterCodeBlocks ?? 0}</span>
          </div>
          <div className="rounded-[0.7rem] bg-white px-2 py-1.5">
            阻塞 <span className="font-black text-slate-900">{trace?.blockingIssues ?? 0}</span>
          </div>
          <div className="rounded-[0.7rem] bg-white px-2 py-1.5">
            警告 <span className="font-black text-slate-900">{trace?.warnings ?? 0}</span>
          </div>
          <div className="rounded-[0.7rem] bg-white px-2 py-1.5">
            目录 <span className="font-mono text-slate-700">{shortTraceId(trace?.catalogHash)}</span>
          </div>
        </div>

        {trace?.stale ? (
          <div className="rounded-[0.85rem] bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
            画布已经变更，当前 groomed 草稿只作为历史参考。注册前需要重新协议梳理。
          </div>
        ) : null}

        {registrationNeedsUpdate ? (
          <div className="rounded-[0.85rem] bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
            当前 groomed 协议已更新，但 BP问问实际运行的注册版本仍指向旧记录。请点击“更新注册”后再试运行。
            {registeredVersionDiffPreview.length > 0 ? (
              <div className="mt-2 rounded-[0.8rem] bg-white p-2">
                <div className="flex items-center justify-between gap-2 text-[10px] font-black text-amber-800">
                  <span>注册差异</span>
                  <span>{registeredVersionDiffs.length} 项</span>
                </div>
                <div className="mt-1.5 space-y-1">
                  {registeredVersionDiffPreview.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[0.65rem] bg-amber-50/80 px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="truncate font-black text-slate-900">
                          {item.targetLabel}
                        </span>
                        <span className="shrink-0 font-semibold text-amber-700">
                          {item.parameterLabel}
                        </span>
                      </div>
                      <div className="mt-0.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 font-mono text-[9px] leading-4">
                        <span className="truncate text-slate-500">
                          {item.before}
                        </span>
                        <span className="text-amber-500">→</span>
                        <span className="truncate text-slate-900">
                          {item.after}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {registeredVersionDiffs.length > registeredVersionDiffPreview.length ? (
                  <div className="mt-1.5 text-[10px] font-semibold text-amber-700">
                    还有 {registeredVersionDiffs.length - registeredVersionDiffPreview.length} 项差异未展开。
                  </div>
                ) : null}
              </div>
            ) : !activeVersion?.draftSnapshot ? (
              <div className="mt-2 rounded-[0.8rem] bg-white px-2 py-1.5 text-[10px] font-semibold text-amber-700">
                注册版本缺少 draftSnapshot，只能确认版本记录不同。
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function auditStatusLabel(status: WorkProtocolGroomingAuditStatus) {
  if (status === "blocked") {
    return "阻塞";
  }

  if (status === "warning") {
    return "需确认";
  }

  return "通过";
}

function auditStatusTone(status: WorkProtocolGroomingAuditStatus) {
  if (status === "blocked") {
    return "bg-rose-50 text-rose-700";
  }

  if (status === "warning") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-emerald-50 text-emerald-700";
}

function auditSeverityTone(severity: WorkProtocolGroomingAuditSeverity) {
  if (severity === "error") {
    return "border-rose-100 bg-rose-50 text-rose-800";
  }

  if (severity === "warning") {
    return "border-amber-100 bg-amber-50 text-amber-800";
  }

  if (severity === "success") {
    return "border-emerald-100 bg-emerald-50 text-emerald-800";
  }

  return "border-slate-100 bg-white text-slate-600";
}

function auditTargetLabel(event: WorkProtocolGroomingAuditEvent) {
  if (event.target.label) {
    return event.target.label;
  }

  if (event.target.kind === "protocol") {
    return "协议整体";
  }

  return `${event.target.kind}:${event.target.id ?? "未定位"}`;
}

function WorkProtocolAuditPanel({
  audit,
}: {
  audit?: WorkProtocolGroomingAudit | null;
}) {
  if (!audit) {
    return null;
  }

  const targetCount = Object.keys(audit.eventsByTarget).length;

  return (
    <details
      open={audit.status !== "pass"}
      className="mt-3 overflow-hidden rounded-[1.1rem] border border-slate-200 bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            协议审计
          </div>
          <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-600">
            {audit.summary.sections} 阶段 · {targetCount} 目标 · {audit.summary.appliedChanges} 改写
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${auditStatusTone(
            audit.status,
          )}`}
        >
          {auditStatusLabel(audit.status)}
        </span>
      </summary>

      <div className="max-h-48 space-y-2 overflow-y-auto border-t border-slate-100 bg-slate-50/70 px-2.5 py-2.5 pr-1">
        {audit.sections.map((section) => (
          <details
            key={section.id}
            open={section.status !== "pass"}
            className="overflow-hidden rounded-[0.9rem] border border-slate-200 bg-white"
          >
            <summary className="flex cursor-pointer list-none items-start justify-between gap-2 px-2.5 py-2">
              <div className="min-w-0">
                <div className="truncate text-[11px] font-black text-slate-900">
                  {section.title}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-slate-500">
                  {section.message}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${auditStatusTone(
                  section.status,
                )}`}
              >
                {section.counts.errors} / {section.counts.warnings}
              </span>
            </summary>
            <div className="space-y-1.5 border-t border-slate-100 px-2.5 py-2">
              {section.events.slice(0, 5).map((event) => (
                <div
                  key={event.id}
                  className={`rounded-[0.75rem] border px-2.5 py-2 text-[10px] leading-4 ${auditSeverityTone(
                    event.severity,
                  )}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-black">{event.title}</div>
                    <div className="shrink-0 font-semibold opacity-70">
                      {auditTargetLabel(event)}
                    </div>
                  </div>
                  <div className="mt-1 text-current/80">{event.message}</div>
                  {event.path ? (
                    <div className="mt-1 font-mono text-[9px] text-current/60">
                      {event.path}
                    </div>
                  ) : null}
                </div>
              ))}
              {section.events.length > 5 ? (
                <div className="px-2 text-[10px] font-semibold text-slate-400">
                  还有 {section.events.length - 5} 条审计事件
                </div>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </details>
  );
}

function IssuePanel({
  status,
  issues,
  groomingSummary,
  audit,
  pendingParameterPatchApply,
  parameterPatchApplyStatus,
  parameterPatchAudits,
  trace,
  registeredProtocol,
  protocolCodeBlock,
  adapterRegistry,
  parameterCodeBlocks,
  executionPlans,
  executionStatus,
  onApplyPendingParameterPatch,
  onCancelPendingParameterPatch,
  onRefreshExecutions,
}: {
  status: CompileStatus;
  issues: CompileIssue[];
  groomingSummary?: GatewayGroomingProtocolSummary | null;
  audit?: WorkProtocolGroomingAudit | null;
  pendingParameterPatchApply?: PendingParameterPatchApply | null;
  parameterPatchApplyStatus: "idle" | "applying";
  parameterPatchAudits: WorkProtocolParameterPatchAuditSummary[];
  trace?: WorkProtocolTrace | null;
  registeredProtocol?: RegisteredProtocolSummary | null;
  protocolCodeBlock?: ProtocolParameterCodeBlock;
  adapterRegistry?: WorkProtocolExecutorAdapterRegistrySummary | null;
  parameterCodeBlocks: ProtocolParameterCodeBlock[];
  executionPlans: WorkProtocolExecutionPlanSummary[];
  executionStatus: ExecutionActionStatus;
  onApplyPendingParameterPatch: () => void;
  onCancelPendingParameterPatch: () => void;
  onRefreshExecutions: () => void;
}) {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const codeStale = status === "dirty_after_compile";
  const latestPlans = executionPlans.slice(0, 3);

  return (
    <aside
      data-fixed-control="true"
      className="absolute right-5 bottom-24 z-40 max-h-[68vh] w-[23rem] overflow-y-auto overscroll-contain rounded-[1.4rem] border border-slate-200 bg-white/95 p-3.5 shadow-[0_30px_80px_-45px_rgba(15,23,42,0.55)] backdrop-blur"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
            协议问题
          </div>
          <div className="mt-1 text-lg font-black text-slate-950">
            {statusLabel(status)}
          </div>
        </div>
        <div className="flex gap-2 text-xs font-semibold">
          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">
            错误 {errors}
          </span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
            警告 {warnings}
          </span>
        </div>
      </div>

      <ParameterCodeDetails block={protocolCodeBlock} stale={codeStale} compact />

      <WorkProtocolTracePanel
        trace={trace}
        registeredProtocol={registeredProtocol}
      />

      <WorkProtocolAdapterRegistryPanel
        adapterRegistry={adapterRegistry}
        parameterCodeBlocks={parameterCodeBlocks}
        executionPlans={executionPlans}
      />

      <WorkProtocolAuditPanel audit={audit} />

      <PendingParameterPatchApplyPanel
        pending={pendingParameterPatchApply}
        applying={parameterPatchApplyStatus === "applying"}
        onApply={onApplyPendingParameterPatch}
        onCancel={onCancelPendingParameterPatch}
      />

      <WorkProtocolParameterPatchAuditPanel records={parameterPatchAudits} />

      <div className="mt-2.5 rounded-[1.1rem] border border-slate-200 bg-slate-50/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              执行计划
            </div>
            <div className="mt-0.5 text-xs font-semibold text-slate-600">
              plan-only dry-run
            </div>
          </div>
          <button
            type="button"
            onClick={onRefreshExecutions}
            disabled={executionStatus === "loading" || executionStatus === "creating"}
            className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            {executionStatus === "loading" ? "读取中" : "刷新"}
          </button>
        </div>

        <div className="mt-2 max-h-36 space-y-2 overflow-auto pr-1">
          {latestPlans.length === 0 ? (
            <div className="rounded-[0.9rem] border border-dashed border-slate-200 bg-white px-3 py-3 text-xs leading-5 text-slate-500">
              暂无协议执行计划。BP问问命中已启用协议，或点击“试运行”后会出现在这里。
            </div>
          ) : (
            latestPlans.map((plan) => (
              <details
                key={plan.id}
                className="overflow-hidden rounded-[0.95rem] border border-slate-200 bg-white"
              >
                <summary className="cursor-pointer list-none px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black text-slate-950">
                        {plan.protocolName}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">
                        {formatExecutionTime(plan.startedAt)} · {plan.nodePlan.length} 节点 · {plan.edgePlan.length} 连线
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">
                      {executionStatusLabel(plan.status)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      置信 {plan.matchedConfidence}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      确认点 {plan.confirmationNodeIds.length}
                    </span>
                  </div>
                </summary>

                <div className="border-t border-slate-100 px-3 py-2">
                  <div className="text-[11px] leading-5 text-slate-500">
                    {plan.matchedReason}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {plan.nodePlan.slice(0, 5).map((node) => (
                      <div
                        key={`${plan.id}-${node.nodeId}`}
                        className="flex items-center justify-between gap-2 rounded-[0.75rem] bg-slate-50 px-2.5 py-2 text-[11px]"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-black text-slate-800">
                            {node.sequence}. {node.title}
                          </div>
                          <div className="mt-0.5 text-slate-500">
                            {GATEWAY_NODE_KIND_LABELS[node.kind] ?? node.kind} · {nodeRunStatusLabel(node.status)}
                          </div>
                          {node.adapterLabel ? (
                            <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">
                              {node.adapterLabel}
                            </div>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskTone(
                            node.riskLevel,
                          )}`}
                        >
                          {node.riskLevel}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Link
                    href={`/ai-dorm/workflows/executions/${plan.id}`}
                    className="mt-3 inline-flex rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-800"
                  >
                    打开详情
                  </Link>
                </div>
              </details>
            ))
          )}
        </div>
      </div>

      <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
        {groomingSummary ? (
          <div
            className={`rounded-[1rem] border px-3 py-3 text-xs leading-5 ${
              groomingSummary.status === "error"
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : groomingSummary.status === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            <div className="font-black">{groomingSummary.message}</div>
            {groomingSummary.suggestions.length > 0 ? (
              <div className="mt-1 text-current/75">
                {groomingSummary.suggestions.slice(0, 2).join(" / ")}
              </div>
            ) : null}
          </div>
        ) : null}

        {issues.length === 0 ? (
          <div className="rounded-[1rem] bg-emerald-50 px-3 py-3 text-xs leading-5 text-emerald-700">
            暂无阻塞问题。点击“协议梳理”后，这里会显示方块和连线的校验结果。
          </div>
        ) : (
          issues.map((issue) => (
            <div
              key={issue.id}
              className={`rounded-[1rem] border px-3 py-2 text-xs leading-5 ${
                issue.severity === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : issue.severity === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              <div className="font-black">{issue.message}</div>
              <div className="mt-1 text-current/75">{issue.suggestion}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-current/50">
                {issue.code}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

export function AiDormWorkflows({ studio }: AiDormWorkflowsProps) {
  const selectedWorkflow = studio.selectedWorkflow;
  const documentScopes = studio.documentScopes ?? FALLBACK_DOCUMENT_SCOPE_CATALOG;
  const paletteNodes = useMemo(() => WORK_PROTOCOL_BLOCKS, []);
  const initialNodes = useMemo(() => createInitialNodes(), []);
  const initialDepartments = useMemo(() => createInitialDepartments(), []);
  const initialEdges = useMemo(() => createInitialEdges(), []);

  const [departments, setDepartments] = useState(initialDepartments);
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [issues, setIssues] = useState<CompileIssue[]>([]);
  const [parameterCodeBlocks, setParameterCodeBlocks] = useState<
    ProtocolParameterCodeBlock[]
  >([]);
  const [compileStatus, setCompileStatus] = useState<CompileStatus>("draft");
  const [groomingSummary, setGroomingSummary] =
    useState<GatewayGroomingProtocolSummary | null>(null);
  const [groomingAudit, setGroomingAudit] =
    useState<WorkProtocolGroomingAudit | null>(null);
  const [groomedDraftRecordId, setGroomedDraftRecordId] = useState<string | null>(
    null,
  );
  const [draftTrace, setDraftTrace] = useState<WorkProtocolTrace | null>(null);
  const [registeredProtocol, setRegisteredProtocol] =
    useState<RegisteredProtocolSummary | null>(null);
  const [registryActionStatus, setRegistryActionStatus] =
    useState<RegistryActionStatus>("idle");
  const [executionPlans, setExecutionPlans] = useState<
    WorkProtocolExecutionPlanSummary[]
  >([]);
  const [parameterPatchAudits, setParameterPatchAudits] = useState<
    WorkProtocolParameterPatchAuditSummary[]
  >([]);
  const [adapterRegistry, setAdapterRegistry] =
    useState<WorkProtocolExecutorAdapterRegistrySummary | null>(null);
  const [parameterPatchPreviewStatus, setParameterPatchPreviewStatus] =
    useState<"idle" | "running">("idle");
  const [pendingParameterPatchApply, setPendingParameterPatchApply] =
    useState<PendingParameterPatchApply | null>(null);
  const [parameterPatchApplyStatus, setParameterPatchApplyStatus] =
    useState<"idle" | "applying">("idle");
  const [executionActionStatus, setExecutionActionStatus] =
    useState<ExecutionActionStatus>("idle");
  const [nextNodeNumber, setNextNodeNumber] = useState(initialNodes.length + 1);
  const [nextDepartmentNumber, setNextDepartmentNumber] = useState(
    initialDepartments.length + 1,
  );
  const [nextEdgeNumber, setNextEdgeNumber] = useState(initialEdges.length + 1);
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [openEdgeId, setOpenEdgeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.86);
  const [pan, setPan] = useState<CanvasPan>({ x: 42, y: 36 });
  const [activeDrag, setActiveDrag] = useState<{
    kind: "node" | "department" | "departmentAgent" | "canvas";
    id?: string;
  } | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const protocolNodes = useMemo(
    () => [...nodes, ...getDepartmentAgentProtocolNodes(departments)],
    [departments, nodes],
  );
  const nodeMap = useMemo(
    () => new Map(protocolNodes.map((node) => [node.id, node])),
    [protocolNodes],
  );
  const parameterCodeBlocksByTargetId = useMemo(
    () =>
      new Map(
        parameterCodeBlocks.map((block) => [block.targetId, block] as const),
      ),
    [parameterCodeBlocks],
  );
  const protocolCodeBlock = parameterCodeBlocks.find(
    (block) => block.target === "protocol",
  );
  const auditEventsByTarget = groomingAudit?.eventsByTarget ?? {};
  const codeStale = compileStatus === "dirty_after_compile";
  const registryBusy = registryActionStatus !== "idle";
  const registrationNeedsUpdate = isRegisteredProtocolBehindTrace(
    draftTrace,
    registeredProtocol,
  );
  const adapterDiagnosticIssues = useMemo(
    () =>
      buildAdapterRegistryCompileIssues({
        adapterRegistry,
        parameterCodeBlocks,
      }),
    [adapterRegistry, parameterCodeBlocks],
  );
  const visibleIssues = useMemo(
    () => dedupeCompileIssues([...issues, ...adapterDiagnosticIssues]),
    [adapterDiagnosticIssues, issues],
  );
  const displayCompileStatus =
    adapterDiagnosticIssues.length > 0 && compileStatus === "valid"
      ? "valid_with_warnings"
      : compileStatus;

  const fetchExecutionPlans = async (silent = false) => {
    if (!silent) {
      setExecutionActionStatus("loading");
    }

    try {
      const response = await fetch(
        "/api/ai-dorm/work-protocol-gateway/executions",
      );
      const payload = (await response.json().catch(() => null)) as
        | GatewayExecutionsApiResponse
        | null;

      if (response.ok && payload?.executions) {
        setExecutionPlans(payload.executions);
      }
    } catch {
      // Execution plan polling is diagnostic. Ignore transient restart/network gaps.
    } finally {
      if (!silent) {
        setExecutionActionStatus("idle");
      }
    }
  };

  const fetchProtocolTrace = async () => {
    const currentDraft = buildProtocolDraftFromCanvas({
      selectedWorkflow,
      departments,
      nodes: protocolNodes,
      edges,
      documentScopes,
    });

    try {
      const [
        draftsResponse,
        registryResponse,
        patchAuditResponse,
        capabilitiesResponse,
      ] = await Promise.all([
        fetch(
          `/api/ai-dorm/work-protocol-gateway/drafts?draftId=${encodeURIComponent(
            currentDraft.id,
          )}`,
        ),
        fetch("/api/ai-dorm/work-protocol-gateway/registry"),
        fetch(
          `/api/ai-dorm/work-protocol-gateway/parameter-patch?draftId=${encodeURIComponent(
            currentDraft.id,
          )}&limit=8`,
        ),
        fetch("/api/ai-dorm/work-protocol-gateway/capabilities"),
      ]);
      const draftsPayload = (await draftsResponse.json().catch(() => null)) as
        | GatewayDraftsApiResponse
        | null;
      const registryPayload = (await registryResponse.json().catch(() => null)) as
        | GatewayRegistryApiResponse
        | null;
      const patchAuditPayload = (await patchAuditResponse.json().catch(() => null)) as
        | GatewayParameterPatchAuditsApiResponse
        | null;
      const capabilitiesPayload = (await capabilitiesResponse.json().catch(() => null)) as
        | GatewayCapabilitiesApiResponse
        | null;

      const records = draftsResponse.ok ? draftsPayload?.records ?? [] : [];
      if (capabilitiesResponse.ok && capabilitiesPayload?.adapterRegistry) {
        setAdapterRegistry(capabilitiesPayload.adapterRegistry);
      }
      setParameterPatchAudits(
        patchAuditResponse.ok ? patchAuditPayload?.records ?? [] : [],
      );
      const sourceRecord = pickLatestDraftRecord(records, "source");
      const groomedRecord = pickLatestDraftRecord(records, "groomed");
      const registered = registryResponse.ok
        ? pickRegisteredProtocol(registryPayload?.protocols, currentDraft.id)
        : null;
      const stale = Boolean(
        groomedRecord &&
          sourceRecord &&
          !draftMatchesForTrace(currentDraft, sourceRecord.draft),
      );
      const canRegister = Boolean(
        groomedRecord?.grooming?.summary.canRegister && !stale,
      );

      setRegisteredProtocol(registered);
      setGroomedDraftRecordId(canRegister ? groomedRecord?.id ?? null : null);
      setDraftTrace(
        sourceRecord || groomedRecord
          ? {
              sourceRecord,
              groomedRecord,
              catalogHash:
                groomedRecord?.grooming?.catalogHash ??
                getActiveRegisteredVersion(registered)?.capabilityCatalogHash,
              canRegister,
              blockingIssues: groomedRecord?.grooming?.summary.errors ?? 0,
              warnings: groomedRecord?.grooming?.summary.warnings ?? 0,
              parameterCodeBlocks:
                groomedRecord?.grooming?.parameterCodeBlocks.length ?? 0,
              stale,
            }
          : null,
      );

      if (groomedRecord?.grooming?.parameterCodeBlocks.length) {
        setParameterCodeBlocks(groomedRecord.grooming.parameterCodeBlocks);
      }

      setCompileStatus(
        compileStatusFromStoredTrace({
          groomedRecord,
          stale,
        }),
      );
    } catch {
      setParameterPatchAudits([]);
      // Trace hydration is diagnostic only. Core editing and grooming stay usable.
    }
  };

  const previewParameterPatchCandidate = async (
    preview: ParameterPatchCandidatePreview,
  ) => {
    if (parameterPatchPreviewStatus === "running") {
      return;
    }

    const groomedDraft = draftTrace?.groomedRecord?.draft;

    if (!groomedDraft || draftTrace?.stale) {
      setIssues((current) => [
        {
          id: `parameter-patch-needs-groomed-draft-${Date.now()}`,
          severity: "warning",
          targetKind: "canvas",
          code: "PARAMETER_PATCH_NEEDS_GROOMED_DRAFT",
          message: "需要先完成协议梳理，才能预览参数 Patch。",
          suggestion: "请先点击“协议梳理”，生成 fresh 参数代码后再点击候选参数。",
        },
        ...current,
      ]);
      return;
    }

    setParameterPatchPreviewStatus("running");

    try {
      const operationId = `candidate-preview-${Date.now()}`;
      const response = await fetch(
        "/api/ai-dorm/work-protocol-gateway/parameter-patch",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            draft: groomedDraft,
            mode: "dry_run",
            validationMode: "register",
            allowMockCapabilities: true,
            persistAudit: true,
            operations: [
              {
                operationId,
                target: preview.payload.target,
                path: preview.payload.path,
                value: preview.payload.value,
                reason: `Preview candidate ${preview.slot.label}: ${preview.option.value}`,
              },
            ],
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | GatewayParameterPatchApiResponse
        | null;

      if (!response.ok || !payload?.result) {
        throw new Error(payload?.message ?? "Parameter patch preview failed.");
      }

      if (payload.auditRecord) {
        setParameterPatchAudits((current) => [
          payload.auditRecord as WorkProtocolParameterPatchAuditSummary,
          ...current.filter((record) => record.id !== payload.auditRecord?.id),
        ].slice(0, 8));
      }

      if (payload.result.status === "validated") {
        setPendingParameterPatchApply({
          ...preview,
          operationId,
          auditRecord: payload.auditRecord,
        });
      }

      if (payload.result.status === "no_effect") {
        setPendingParameterPatchApply(null);
      }

      if (payload.result.status === "rejected") {
        setPendingParameterPatchApply(null);
        const rejected = payload.result.rejectedChanges?.[0];
        setIssues((current) => [
          {
            id: `parameter-patch-preview-rejected-${Date.now()}`,
            severity: "warning",
            targetKind: preview.block.target === "edge" ? "edge" : "node",
            targetId: preview.block.targetId,
            code: rejected?.code ?? "PARAMETER_PATCH_PREVIEW_REJECTED",
            message: rejected?.message ?? "候选参数 dry-run 被拒绝。",
            suggestion:
              "右侧“参数 Patch”面板已经记录本次预览。请检查候选值、能力契约和 runtime preflight。",
          },
          ...current,
        ]);
      }
    } catch (error) {
      setIssues((current) => [
        {
          id: `parameter-patch-preview-failed-${Date.now()}`,
          severity: "warning",
          targetKind: "canvas",
          code: "PARAMETER_PATCH_PREVIEW_FAILED",
          message: "候选参数 dry-run 请求失败。",
          suggestion:
            error instanceof Error
              ? error.message
              : "请确认工作协议网关 parameter-patch API 正常运行。",
        },
        ...current,
      ]);
    } finally {
      setParameterPatchPreviewStatus("idle");
    }
  };

  const applyPendingParameterPatch = async () => {
    if (!pendingParameterPatchApply || parameterPatchApplyStatus === "applying") {
      return;
    }

    const groomedRecord = draftTrace?.groomedRecord;
    const groomedDraft = groomedRecord?.draft;

    if (!groomedRecord?.id || !groomedDraft || draftTrace?.stale) {
      setIssues((current) => [
        {
          id: `parameter-patch-apply-needs-groomed-draft-${Date.now()}`,
          severity: "warning",
          targetKind: "canvas",
          code: "PARAMETER_PATCH_APPLY_NEEDS_GROOMED_DRAFT",
          message: "需要 fresh 的 groomed 协议版本，才能应用参数 Patch。",
          suggestion: "请先重新点击“协议梳理”，确认右侧链路检查不是过期状态。",
        },
        ...current,
      ]);
      return;
    }

    setParameterPatchApplyStatus("applying");

    try {
      const operationId = `${pendingParameterPatchApply.operationId}-apply`;
      const response = await fetch(
        "/api/ai-dorm/work-protocol-gateway/parameter-patch",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            draft: groomedDraft,
            mode: "apply",
            validationMode: "register",
            allowMockCapabilities: true,
            persistAudit: true,
            commitDraft: true,
            baseGroomedRecordId: groomedRecord.id,
            sourceRecordId:
              draftTrace?.sourceRecord?.id ?? groomedRecord.sourceRecordId,
            operations: [
              {
                operationId,
                target: pendingParameterPatchApply.payload.target,
                path: pendingParameterPatchApply.payload.path,
                value: pendingParameterPatchApply.payload.value,
                reason: `Apply candidate ${pendingParameterPatchApply.slot.label}: ${pendingParameterPatchApply.option.value}`,
              },
            ],
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | GatewayParameterPatchApiResponse
        | null;

      if (!response.ok || !payload?.result) {
        throw new Error(payload?.message ?? "Parameter patch apply failed.");
      }

      if (payload.auditRecord) {
        setParameterPatchAudits((current) => [
          payload.auditRecord as WorkProtocolParameterPatchAuditSummary,
          ...current.filter((record) => record.id !== payload.auditRecord?.id),
        ].slice(0, 8));
      }

      if (payload.result.status !== "applied" || !payload.committedDraftRecord) {
        const rejected = payload.result.rejectedChanges?.[0];
        throw new Error(
          rejected?.message ??
            "Parameter patch did not produce a committed groomed draft record.",
        );
      }

      const committedRecord = payload.committedDraftRecord;
      const summary = committedRecord.grooming?.summary;
      const nextParameterBlocks =
        committedRecord.grooming?.parameterCodeBlocks ??
        payload.result.parameterCodeBlocks ??
        [];

      setGroomedDraftRecordId(committedRecord.id);
      setParameterCodeBlocks(nextParameterBlocks);
      setDraftTrace((current) => ({
        sourceRecord: current?.sourceRecord ?? draftTrace?.sourceRecord,
        groomedRecord: committedRecord,
        catalogHash:
          committedRecord.grooming?.catalogHash ??
          payload.auditRecord?.catalogHash ??
          current?.catalogHash,
        canRegister: Boolean(summary?.canRegister),
        blockingIssues: summary?.errors ?? 0,
        warnings: summary?.warnings ?? 0,
        parameterCodeBlocks: nextParameterBlocks.length,
        stale: false,
      }));
      setCompileStatus(
        compileStatusFromStoredTrace({
          groomedRecord: committedRecord,
          stale: false,
        }),
      );
      setPendingParameterPatchApply(null);
      setIssues((current) => [
        {
          id: `parameter-patch-applied-${Date.now()}`,
          severity: "info",
          targetKind:
            pendingParameterPatchApply.block.target === "edge" ? "edge" : "node",
          targetId: pendingParameterPatchApply.block.targetId,
          code: "PARAMETER_PATCH_APPLIED",
          message: "参数 Patch 已应用，并保存为新的 groomed 协议版本。",
          suggestion: "如需让 BP问问走这个新版本，请继续点击“注册协议”更新注册版本。",
        },
        ...current,
      ]);
    } catch (error) {
      setIssues((current) => [
        {
          id: `parameter-patch-apply-failed-${Date.now()}`,
          severity: "warning",
          targetKind: "canvas",
          code: "PARAMETER_PATCH_APPLY_FAILED",
          message: "参数 Patch 应用失败。",
          suggestion:
            error instanceof Error
              ? error.message
              : "请检查参数 Patch API、base groomed record 和协议校验结果。",
        },
        ...current,
      ]);
    } finally {
      setParameterPatchApplyStatus("idle");
    }
  };

  useEffect(() => {
    void fetchExecutionPlans();
    void fetchProtocolTrace();

    const timer = window.setInterval(() => {
      void fetchExecutionPlans(true);
    }, 15000);

    return () => window.clearInterval(timer);
  }, []);

  const markDirty = () => {
    setGroomingSummary(null);
    setGroomingAudit(null);
    setGroomedDraftRecordId(null);
    setPendingParameterPatchApply(null);
    setDraftTrace((current) =>
      current ? { ...current, stale: true, canRegister: false } : current,
    );
    setCompileStatus((current) =>
      current === "valid" || current === "valid_with_warnings" || current === "invalid"
        ? "dirty_after_compile"
        : current,
    );
  };

  const zoomPercent = Math.round(zoom * 100);

  const setZoomAroundPoint = (
    nextZoomValue: number,
    anchor: { x: number; y: number },
  ) => {
    const nextZoom = clamp(nextZoomValue, MIN_ZOOM, MAX_ZOOM);
    setPan((currentPan) => {
      const canvasX = (anchor.x - currentPan.x) / zoom;
      const canvasY = (anchor.y - currentPan.y) / zoom;

      return {
        x: anchor.x - canvasX * nextZoom,
        y: anchor.y - canvasY * nextZoom,
      };
    });
    setZoom(nextZoom);
  };

  const zoomBy = (delta: number) => {
    setZoom((currentZoom) => clamp(currentZoom + delta, MIN_ZOOM, MAX_ZOOM));
  };

  const resetView = () => {
    setZoom(0.86);
    setPan({ x: 42, y: 36 });
  };

  const startNodeDrag = (node: CanvasNodeDraft, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: "node",
      id: node.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.x,
      startY: node.y,
    };
    setActiveDrag({ kind: "node", id: node.id });
  };

  const startDepartmentDrag = (
    department: CanvasDepartmentDraft,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: "department",
      id: department.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: department.x,
      startY: department.y,
    };
    setActiveDrag({ kind: "department", id: department.id });
  };

  const startDepartmentAgentDrag = (
    department: CanvasDepartmentDraft,
    agent: CanvasDepartmentAgentDraft,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: "departmentAgent",
      departmentId: department.id,
      agentId: agent.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: agent.x,
      startY: agent.y,
    };
    setActiveDrag({ kind: "departmentAgent", id: agent.id });
  };

  const startCanvasPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("[data-canvas-object='true']") || target.closest("[data-fixed-control='true']")) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: "canvas",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPan: pan,
    };
    setActiveDrag({ kind: "canvas" });
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;

    if (drag.kind === "canvas") {
      setPan({
        x: drag.startPan.x + deltaX,
        y: drag.startPan.y + deltaY,
      });
      return;
    }

    if (drag.kind === "node") {
      setNodes((current) =>
        current.map((node) =>
          node.id === drag.id
            ? {
                ...node,
                x: drag.startX + deltaX / zoom,
                y: drag.startY + deltaY / zoom,
              }
            : node,
        ),
      );
      return;
    }

    if (drag.kind === "departmentAgent") {
      setDepartments((current) =>
        current.map((department) => {
          if (department.id !== drag.departmentId) {
            return department;
          }

          const nextPosition = clampDepartmentAgentPosition(department, {
            x: drag.startX + deltaX / zoom,
            y: drag.startY + deltaY / zoom,
          });

          return {
            ...department,
            agents: (department.agents ?? []).map((agent) =>
              agent.id === drag.agentId ? { ...agent, ...nextPosition } : agent,
            ),
          };
        }),
      );
      return;
    }

    setDepartments((current) =>
      current.map((department) =>
        department.id === drag.id
          ? {
              ...department,
              x: drag.startX + deltaX / zoom,
              y: drag.startY + deltaY / zoom,
            }
          : department,
      ),
    );
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (drag.kind !== "canvas") {
      markDirty();
    }

    dragRef.current = null;
    setActiveDrag(null);
  };

  const handleWheelZoom = (event: WheelEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-fixed-control='true']")) {
      return;
    }

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const direction = event.deltaY > 0 ? -0.06 : 0.06;
    setZoomAroundPoint(zoom + direction, anchor);
  };

  const addNode = (paletteNode: PaletteNode) => {
    const nodeId = makeId("node", nextNodeNumber);
    const column = (nextNodeNumber - 1) % 4;
    const row = Math.floor((nextNodeNumber - 1) / 4) % 2;
    const departmentId = departments[0]?.id ?? "dept-primary";
    const visibleX = Math.max(48, (-pan.x + 380) / zoom);
    const visibleY = Math.max(72, (-pan.y + 240) / zoom);

    setNodes((current) => [
      ...current,
      {
        id: nodeId,
        title: paletteNode.label,
        kind: paletteNode.kind,
        departmentId,
        userIntent: paletteNode.description,
        x: visibleX + column * 36,
        y: visibleY + row * 36,
      },
    ]);
    setNextNodeNumber((value) => value + 1);
    markDirty();
  };

  const addDepartment = () => {
    const departmentId = makeId("dept", nextDepartmentNumber);
    setDepartments((current) => [
      ...current,
      {
        id: departmentId,
        departmentId:
          DEPARTMENT_DEFINITIONS[(nextDepartmentNumber - 1) % DEPARTMENT_DEFINITIONS.length]
            .id,
        scopeId: ALL_SCOPE_ID,
        x: Math.max(36, (-pan.x + 220) / zoom + nextDepartmentNumber * 24),
        y: Math.max(80, (-pan.y + 180) / zoom + nextDepartmentNumber * 24),
        width: DEPARTMENT_DEFAULT_WIDTH,
        height: DEPARTMENT_DEFAULT_HEIGHT,
      },
    ]);
    setNextDepartmentNumber((value) => value + 1);
    markDirty();
  };

  const updateNodeIntent = (nodeId: string, value: string) => {
    setNodes((current) =>
      current.map((node) => (node.id === nodeId ? { ...node, userIntent: value } : node)),
    );
    markDirty();
  };

  const deleteNode = (nodeId: string) => {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) =>
      current.filter((edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId),
    );
    setConnectingFromId((current) => (current === nodeId ? null : current));
    setOpenEdgeId((current) => {
      if (!current) {
        return current;
      }

      const edge = edges.find((item) => item.id === current);
      return edge && (edge.fromNodeId === nodeId || edge.toNodeId === nodeId)
        ? null
        : current;
    });
    setActiveDrag((current) =>
      current?.kind === "node" && current.id === nodeId ? null : current,
    );
    markDirty();
  };

  const updateDepartment = (nextDepartment: CanvasDepartmentDraft) => {
    const previousDepartment = departments.find(
      (department) => department.id === nextDepartment.id,
    );
    const nextAgentIds = new Set((nextDepartment.agents ?? []).map((agent) => agent.id));
    const removedAgentIds =
      previousDepartment?.agents
        ?.map((agent) => agent.id)
        .filter((agentId) => !nextAgentIds.has(agentId)) ?? [];

    if (removedAgentIds.length > 0) {
      const removedAgentIdSet = new Set(removedAgentIds);
      setEdges((current) =>
        current.filter(
          (edge) =>
            !removedAgentIdSet.has(edge.fromNodeId) &&
            !removedAgentIdSet.has(edge.toNodeId),
        ),
      );
      setConnectingFromId((current) =>
        current && removedAgentIdSet.has(current) ? null : current,
      );
    }

    setDepartments((current) =>
      current.map((department) =>
        department.id === nextDepartment.id ? nextDepartment : department,
      ),
    );
    markDirty();
  };

  const addDepartmentAgent = (departmentId: string, agentName: string) => {
    setDepartments((current) =>
      current.map((department) => {
        if (department.id !== departmentId) {
          return department;
        }

        const agents = department.agents ?? [];
        if (agents.some((agent) => agent.name === agentName)) {
          return department;
        }

        const position = getNextDepartmentAgentPosition(department, agents.length);

        return {
          ...department,
          agents: [
            ...agents,
            {
              id: `${department.id}-agent-${agentName}`,
              name: agentName,
              userIntent: `请${agentName}根据当前部门范围处理任务，并输出结构化结果。`,
              ...position,
            },
          ],
        };
      }),
    );
    markDirty();
  };

  const removeDepartmentAgent = (departmentId: string, agentId: string) => {
    setDepartments((current) =>
      current.map((department) =>
        department.id === departmentId
          ? {
              ...department,
              agents: (department.agents ?? []).filter((agent) => agent.id !== agentId),
            }
          : department,
      ),
    );
    setEdges((current) =>
      current.filter((edge) => edge.fromNodeId !== agentId && edge.toNodeId !== agentId),
    );
    setConnectingFromId((current) => (current === agentId ? null : current));
    markDirty();
  };

  const deleteDepartment = (departmentId: string) => {
    const department = departments.find((item) => item.id === departmentId);
    const agentIds = new Set((department?.agents ?? []).map((agent) => agent.id));

    setDepartments((current) => current.filter((item) => item.id !== departmentId));
    if (agentIds.size > 0) {
      setEdges((current) =>
        current.filter(
          (edge) => !agentIds.has(edge.fromNodeId) && !agentIds.has(edge.toNodeId),
        ),
      );
      setConnectingFromId((current) =>
        current && agentIds.has(current) ? null : current,
      );
      setOpenEdgeId((current) => {
        if (!current) {
          return current;
        }

        const edge = edges.find((item) => item.id === current);
        return edge && (agentIds.has(edge.fromNodeId) || agentIds.has(edge.toNodeId))
          ? null
          : current;
      });
    }
    setActiveDrag((current) =>
      current?.kind === "department" && current.id === departmentId ? null : current,
    );
    markDirty();
  };

  const updateDepartmentAgentIntent = (
    departmentId: string,
    agentId: string,
    value: string,
  ) => {
    setDepartments((current) =>
      current.map((department) =>
        department.id === departmentId
          ? {
              ...department,
              agents: (department.agents ?? []).map((agent) =>
                agent.id === agentId ? { ...agent, userIntent: value } : agent,
              ),
            }
          : department,
      ),
    );
    markDirty();
  };

  const updateEdgeIntent = (edgeId: string, value: string) => {
    setEdges((current) =>
      current.map((edge) => (edge.id === edgeId ? { ...edge, transferIntent: value } : edge)),
    );
    markDirty();
  };

  const connectNodeByHandle = (nodeId: string) => {
    if (!connectingFromId) {
      setConnectingFromId(nodeId);
      return;
    }

    if (connectingFromId === nodeId) {
      setConnectingFromId(null);
      return;
    }

    const exists = edges.some(
      (edge) => edge.fromNodeId === connectingFromId && edge.toNodeId === nodeId,
    );

    if (exists) {
      setConnectingFromId(null);
      return;
    }

    const edgeId = makeId("edge", nextEdgeNumber);
    setEdges((current) => [
      ...current,
      {
        id: edgeId,
        fromNodeId: connectingFromId,
        toNodeId: nodeId,
        transferIntent: "把上一个节点的结果传给下一个节点。",
      },
    ]);
    setNextEdgeNumber((value) => value + 1);
    setConnectingFromId(null);
    setOpenEdgeId(edgeId);
    markDirty();
  };

  const compileProtocol = async () => {
    setCompileStatus("compiling");
    setGroomingSummary(null);
    setGroomingAudit(null);
    setGroomedDraftRecordId(null);

    try {
      const draft = buildProtocolDraftFromCanvas({
        selectedWorkflow,
        departments,
        nodes: protocolNodes,
        edges,
        documentScopes,
      });
      const response = await fetch("/api/ai-dorm/work-protocol-gateway/groom", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draft,
          mode: "register",
          allowMockCapabilities: true,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | GatewayGroomApiResponse
        | null;

      if (!response.ok || !payload?.result) {
        throw new Error(payload?.message ?? "Protocol grooming request failed.");
      }

      const nextIssues = collectGroomingIssues(payload.result);
      let nextGroomedDraftRecordId: string | null = null;
      let nextSourceRecord: GatewayDraftRecordSummary | undefined;
      let nextGroomedRecord: GatewayDraftRecordSummary | undefined;

      try {
        const sourceRecord = await saveGatewayDraftRecord({
          draft,
          kind: "source",
        });
        nextSourceRecord = sourceRecord;
        const groomedRecord = await saveGatewayDraftRecord({
          draft: payload.result.groomedDraft,
          kind: "groomed",
          sourceRecordId: sourceRecord.id,
          groomingResult: payload.result,
          catalogHash: payload.catalogHash,
        });
        nextGroomedRecord = groomedRecord;
        nextGroomedDraftRecordId = groomedRecord.id;
      } catch (saveError) {
        nextIssues.push({
          id: `draft-save-failed-${Date.now()}`,
          severity: "error",
          targetKind: "canvas",
          code: "DRAFT_SAVE_FAILED",
          message: "协议梳理完成，但草稿记录保存失败，暂时不能注册。",
          suggestion:
            saveError instanceof Error
              ? saveError.message
              : "请重新点击协议梳理，确认草稿仓库 API 正常。",
        });
      }

      setIssues(nextIssues);
      setParameterCodeBlocks(payload.result.parameterCodeBlocks);
      setGroomingSummary(payload.result.protocolSummary);
      setGroomingAudit(payload.result.audit ?? null);
      setGroomedDraftRecordId(nextGroomedDraftRecordId);
      setDraftTrace({
        sourceRecord: nextSourceRecord,
        groomedRecord: nextGroomedRecord,
        catalogHash: payload.catalogHash,
        canRegister: Boolean(
          nextGroomedDraftRecordId && payload.result.protocolSummary.canRegister,
        ),
        blockingIssues: payload.result.protocolSummary.errors,
        warnings: payload.result.protocolSummary.warnings,
        parameterCodeBlocks: payload.result.parameterCodeBlocks.length,
        stale: false,
      });
      setCompileStatus(
        nextGroomedDraftRecordId ? mapGatewayGroomStatus(payload.result) : "invalid",
      );
    } catch (error) {
      setParameterCodeBlocks([]);
      setGroomingSummary(null);
      setGroomingAudit(null);
      setGroomedDraftRecordId(null);
      setDraftTrace(null);
      setIssues([
        {
          id: "compile-request-failed",
          severity: "error",
          targetKind: "canvas",
          code: "COMPILE_REQUEST_FAILED",
          message: "协议梳理请求失败，暂时没有拿到后端编译结果。",
          suggestion:
            error instanceof Error
              ? error.message
              : "请确认前端服务和工作协议网关 API 正常运行。",
        },
      ]);
      setCompileStatus("invalid");
    }
  };

  const registerProtocol = async () => {
    if (registryBusy) {
      return;
    }

    if (
      !groomedDraftRecordId ||
      !groomingSummary?.canRegister ||
      compileStatus === "draft" ||
      compileStatus === "invalid" ||
      compileStatus === "dirty_after_compile"
    ) {
      setIssues((current) => [
        {
          id: `register-needs-groomed-draft-${Date.now()}`,
          severity: "error",
          targetKind: "canvas",
          code: "REGISTER_NEEDS_GROOMED_DRAFT",
          message: "注册前必须先完成可通过的协议梳理。",
          suggestion:
            compileStatus === "dirty_after_compile"
              ? "画布已经变更，请重新点击协议梳理。"
              : "请先点击协议梳理，修正红色问题后再注册协议。",
        },
        ...current,
      ]);
      return;
    }

    setRegistryActionStatus("registering");

    try {
      const response = await fetch("/api/ai-dorm/work-protocol-gateway/registry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draftRecordId: groomedDraftRecordId,
          enabled: true,
          priority: 1,
          allowMockCapabilities: true,
          runtimeMode: "plan_only",
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | GatewayRegistryApiResponse
        | null;

      if (!response.ok || !payload?.registered || !payload.result) {
        const nextIssues = payload?.result?.validation.issues.map(mapGatewayIssue) ?? [
          {
            id: "protocol-register-failed",
            severity: "error" as const,
            targetKind: "canvas" as const,
            code: "PROTOCOL_REGISTER_FAILED",
            message: "协议注册失败，注册表没有写入新版本。",
            suggestion: payload?.message ?? "请先完成协议梳理并修正阻塞问题。",
          },
        ];

        setIssues(nextIssues);
        setCompileStatus("invalid");
        throw new Error(payload?.message ?? "Protocol registry request failed.");
      }

      setIssues(payload.result.validation.issues.map(mapGatewayIssue));
      setParameterCodeBlocks(payload.result.parameterCodeBlocks);
      setCompileStatus(mapGatewayCompileStatus(payload.result.status));
      setRegisteredProtocol(payload.registered);
    } catch {
      // The issue panel above carries the user-facing failure reason.
    } finally {
      setRegistryActionStatus("idle");
    }
  };

  const toggleRegisteredProtocol = async () => {
    if (!registeredProtocol || registryBusy) {
      return;
    }

    setRegistryActionStatus("toggling");

    try {
      const response = await fetch("/api/ai-dorm/work-protocol-gateway/registry", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          protocolId: registeredProtocol.id,
          enabled: !registeredProtocol.enabled,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | GatewayRegistryApiResponse
        | null;

      if (!response.ok || !payload?.registered) {
        throw new Error(payload?.message ?? "Protocol toggle request failed.");
      }

      setRegisteredProtocol(payload.registered);
    } catch (error) {
      setIssues((current) => [
        ...current,
        {
          id: `protocol-toggle-failed-${Date.now()}`,
          severity: "error",
          targetKind: "canvas",
          code: "PROTOCOL_TOGGLE_FAILED",
          message: "协议启用状态切换失败。",
          suggestion:
            error instanceof Error
              ? error.message
              : "请确认工作协议网关注册表 API 正常运行。",
        },
      ]);
    } finally {
      setRegistryActionStatus("idle");
    }
  };

  const createPlanOnlyExecution = async () => {
    if (!registeredProtocol?.enabled || executionActionStatus === "creating") {
      return;
    }

    if (registrationNeedsUpdate) {
      setIssues((current) => [
        {
          id: `protocol-run-needs-register-update-${Date.now()}`,
          severity: "warning",
          targetKind: "canvas",
          code: "PROTOCOL_RUN_NEEDS_REGISTER_UPDATE",
          message: "当前 groomed 协议比注册版本更新，试运行已暂停。",
          suggestion: "请先点击“更新注册”，让 BP问问实际运行的 active version 指向最新 groomed 记录。",
        },
        ...current,
      ]);
      return;
    }

    setExecutionActionStatus("creating");

    try {
      const response = await fetch(
        "/api/ai-dorm/work-protocol-gateway/executions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            match: {
              protocolId: registeredProtocol.id,
              draftId: registeredProtocol.draftId,
              protocolName: registeredProtocol.name,
              activeVersionId: registeredProtocol.activeVersionId,
              confidence: 99,
              reason: "工作协议网关手动试运行",
              matchedTriggerRuleIds: ["manual-run"],
              entryNodeIds: [],
              reportNodeIds: [],
              enabled: registeredProtocol.enabled,
              runtimeMode: "plan_only",
            },
            prompt: `手动试运行工作协议：${registeredProtocol.name}`,
            minConfidence: 1,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | GatewayExecutionsApiResponse
        | null;

      if (!response.ok || !payload?.execution) {
        throw new Error(payload?.message ?? "Protocol execution plan request failed.");
      }

      setExecutionPlans((current) => [
        payload.execution as WorkProtocolExecutionPlanSummary,
        ...current.filter((plan) => plan.id !== payload.execution?.id),
      ]);
    } catch (error) {
      setIssues((current) => [
        ...current,
        {
          id: `protocol-execution-plan-failed-${Date.now()}`,
          severity: "error",
          targetKind: "canvas",
          code: "PROTOCOL_EXECUTION_PLAN_FAILED",
          message: "协议试运行计划生成失败。",
          suggestion:
            error instanceof Error
              ? error.message
              : "请确认协议已经注册并处于启用状态。",
        },
      ]);
    } finally {
      setExecutionActionStatus("idle");
    }
  };

  const createBlankGateway = () => {
    setDepartments([]);
    setNodes([]);
    setEdges([]);
    setIssues([]);
    setParameterCodeBlocks([]);
    setGroomingSummary(null);
    setGroomingAudit(null);
    setGroomedDraftRecordId(null);
    setDraftTrace(null);
    setRegisteredProtocol(null);
    setRegistryActionStatus("idle");
    setCompileStatus("draft");
    setConnectingFromId(null);
    setOpenEdgeId(null);
    setActiveDrag(null);
    dragRef.current = null;
    setNextNodeNumber(1);
    setNextDepartmentNumber(1);
    setNextEdgeNumber(1);
    resetView();
  };

  const showCompiledEdgeText =
    compileStatus === "valid" || compileStatus === "valid_with_warnings";

  return (
    <section className="relative -mx-2 flex h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-[0_30px_90px_-45px_rgba(15,23,42,0.45)] sm:-mx-4">
      <div className="relative z-40 shrink-0 overflow-visible border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur md:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                Work Protocol Gateway
              </div>
              <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-slate-950">
                工作协议网关
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <details className="relative z-50">
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-white">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      当前工作协议
                    </div>
                    <div className="truncate font-semibold text-slate-900">
                      {selectedWorkflow.name}
                    </div>
                  </div>
                  <span className="text-slate-400">⌄</span>
                </summary>

                <div className="absolute top-[calc(100%+0.6rem)] left-0 z-50 w-80 rounded-[1.4rem] border border-slate-200 bg-white p-2 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]">
                  {studio.workflows.map((workflow) => {
                    const active = workflow.id === selectedWorkflow.id;

                    return (
                      <Link
                        key={workflow.id}
                        href={`/ai-dorm/workflows?workflow=${workflow.id}`}
                        className={
                          active
                            ? "block rounded-[1rem] bg-blue-50 px-4 py-3 text-blue-700"
                            : "block rounded-[1rem] px-4 py-3 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                        }
                      >
                        <div className="text-sm font-semibold">{workflow.name}</div>
                        <div className="mt-1 text-xs text-current/75">
                          {workflow.stepCount} 个节点
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </details>

              <button
                type="button"
                onClick={createBlankGateway}
                className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100"
              >
                + 新建网关
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
              {formatWorkflowCount(studio.workflows.length)}
            </span>
            <span
              className={
                compileStatus === "invalid"
                  ? "rounded-full bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-700"
                  : compileStatus === "valid_with_warnings"
                    ? "rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700"
                    : compileStatus === "valid"
                      ? "rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700"
                      : "rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500"
              }
            >
              {statusLabel(displayCompileStatus)}
            </span>
            <Link
              href="/ai-dorm/tasks"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              查看任务
            </Link>
          </div>
        </div>
      </div>

      <div
        className={`relative z-0 min-h-0 flex-1 overflow-hidden bg-[#f7f9fe] ${
          activeDrag?.kind === "canvas" ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={startCanvasPan}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onWheel={handleWheelZoom}
      >
        <div
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.24) 1.2px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.12),transparent_62%)]" />

        <div className="relative h-full overflow-hidden">
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            <div className="pointer-events-none absolute top-0 left-0 z-10 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm backdrop-blur">
              自由画布
            </div>

            {departments.map((department) => (
              <DepartmentBlock
                key={department.id}
                department={department}
                documentScopes={documentScopes}
                error={hasBlockingIssue(visibleIssues, "department", department.id)}
                warning={hasWarningIssue(visibleIssues, "department", department.id)}
                dragging={
                  activeDrag?.kind === "department" && activeDrag.id === department.id
                }
                activeAgentId={
                  activeDrag?.kind === "departmentAgent" ? activeDrag.id : undefined
                }
                connectingFromId={connectingFromId}
                issues={visibleIssues}
                auditEventsByTarget={auditEventsByTarget}
                parameterCodeBlocksByTargetId={parameterCodeBlocksByTargetId}
                codeStale={codeStale}
                parameterPatchPreviewBusy={parameterPatchPreviewStatus === "running"}
                onStartDrag={(event) => startDepartmentDrag(department, event)}
                onStartAgentDrag={(agent, event) =>
                  startDepartmentAgentDrag(department, agent, event)
                }
                onAgentConnectorClick={connectNodeByHandle}
                onChange={updateDepartment}
                onAddAgent={(agentName) => addDepartmentAgent(department.id, agentName)}
                onRemoveAgent={(agentId) => removeDepartmentAgent(department.id, agentId)}
                onDelete={() => deleteDepartment(department.id)}
                onChangeAgentIntent={(agentId, value) =>
                  updateDepartmentAgentIntent(department.id, agentId, value)
                }
                onPreviewCandidate={previewParameterPatchCandidate}
              />
            ))}

            <svg
              className="pointer-events-none absolute inset-0 z-10"
              viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
              fill="none"
            >
              {edges.map((edge) => {
                const from = nodeMap.get(edge.fromNodeId);
                const to = nodeMap.get(edge.toNodeId);
                if (!from || !to) {
                  return null;
                }

                const error = hasBlockingIssue(visibleIssues, "edge", edge.id);
                const warning = hasWarningIssue(visibleIssues, "edge", edge.id);
                const pathId = `path-${edge.id}`;

                return (
                  <g key={edge.id}>
                    <path
                      id={pathId}
                      d={edgePath(from, to)}
                      stroke={error ? "#f43f5e" : warning ? "#f59e0b" : "#4f46e5"}
                      strokeWidth="4"
                      strokeLinecap="round"
                      className="drop-shadow-[0_0_16px_rgba(79,70,229,0.24)]"
                    />
                    <text
                      dy="-7"
                      className="fill-slate-500 text-[10px] font-black tracking-[0.02em]"
                    >
                      <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
                        {(showCompiledEdgeText
                          ? edge.transferIntent
                          : DEFAULT_EDGE_DISPLAY_TEXT
                        ).slice(0, 28)}
                      </textPath>
                    </text>
                  </g>
                );
              })}
            </svg>

            {edges.map((edge) => {
              const from = nodeMap.get(edge.fromNodeId);
              const to = nodeMap.get(edge.toNodeId);
              if (!from || !to) {
                return null;
              }

              return (
                <EdgeIntentCard
                  key={edge.id}
                  edge={edge}
                  from={from}
                  to={to}
                  error={hasBlockingIssue(visibleIssues, "edge", edge.id)}
                  warning={hasWarningIssue(visibleIssues, "edge", edge.id)}
                  open={openEdgeId === edge.id}
                  parameterCodeBlock={parameterCodeBlocksByTargetId.get(edge.id)}
                  auditEvents={getLocalAuditEvents(auditEventsByTarget, "edge", edge.id)}
                  codeStale={codeStale}
                  parameterPatchPreviewBusy={parameterPatchPreviewStatus === "running"}
                  onToggle={() =>
                    setOpenEdgeId((current) => (current === edge.id ? null : edge.id))
                  }
                  onChange={(value) => updateEdgeIntent(edge.id, value)}
                  onPreviewCandidate={previewParameterPatchCandidate}
                />
              );
            })}

            {nodes.map((node) => (
              <CanvasNode
                key={node.id}
                node={node}
                error={hasBlockingIssue(visibleIssues, "node", node.id)}
                warning={hasWarningIssue(visibleIssues, "node", node.id)}
                connecting={connectingFromId === node.id}
                dragging={activeDrag?.kind === "node" && activeDrag.id === node.id}
                parameterCodeBlock={parameterCodeBlocksByTargetId.get(node.id)}
                auditEvents={getLocalAuditEvents(auditEventsByTarget, "node", node.id)}
                codeStale={codeStale}
                parameterPatchPreviewBusy={parameterPatchPreviewStatus === "running"}
                onStartDrag={(event) => startNodeDrag(node, event)}
                onConnectorClick={() => connectNodeByHandle(node.id)}
                onDelete={() => deleteNode(node.id)}
                onChangeIntent={(value) => updateNodeIntent(node.id, value)}
                onPreviewCandidate={previewParameterPatchCandidate}
              />
            ))}
          </div>
        </div>

        <IssuePanel
          status={displayCompileStatus}
          issues={visibleIssues}
          groomingSummary={groomingSummary}
          audit={groomingAudit}
          pendingParameterPatchApply={pendingParameterPatchApply}
          parameterPatchApplyStatus={parameterPatchApplyStatus}
          parameterPatchAudits={parameterPatchAudits}
          trace={draftTrace}
          registeredProtocol={registeredProtocol}
          protocolCodeBlock={protocolCodeBlock}
          adapterRegistry={adapterRegistry}
          parameterCodeBlocks={parameterCodeBlocks}
          executionPlans={executionPlans}
          executionStatus={executionActionStatus}
          onApplyPendingParameterPatch={() => void applyPendingParameterPatch()}
          onCancelPendingParameterPatch={() => setPendingParameterPatchApply(null)}
          onRefreshExecutions={() => void fetchExecutionPlans()}
        />

        <div
          data-fixed-control="true"
          className="pointer-events-none absolute inset-x-0 bottom-5 z-50 flex justify-center px-4"
        >
          <div className="pointer-events-auto flex max-w-[calc(100vw-3rem)] flex-wrap items-center justify-center gap-3 rounded-[1.45rem] border border-slate-200/90 bg-white/95 px-3 py-3 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-2 text-sm text-slate-600">
              <button
                type="button"
                onClick={() => zoomBy(-0.08)}
                className="h-7 w-7 rounded-full bg-white text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-100"
              >
                -
              </button>
              <span className="min-w-14 text-center text-xs font-black">
                {zoomPercent}%
              </span>
              <button
                type="button"
                onClick={() => zoomBy(0.08)}
                className="h-7 w-7 rounded-full bg-white text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-100"
              >
                +
              </button>
              <button
                type="button"
                onClick={resetView}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-slate-100"
              >
                重置
              </button>
            </div>

            <div className="hidden h-7 w-px bg-slate-200 sm:block" />

            <button
              type="button"
              onClick={addDepartment}
              className="rounded-[1rem] bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              + 添加部门
            </button>

            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[1rem] bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100">
                <span className="text-lg leading-none">+</span>
                添加方块
              </summary>
              <div className="absolute bottom-[calc(100%+0.75rem)] left-1/2 z-40 max-h-[56vh] w-72 -translate-x-1/2 overflow-y-auto rounded-[1.15rem] border border-slate-200 bg-white p-1.5 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]">
                {paletteNodes.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => addNode(node)}
                    className="flex w-full items-center justify-between gap-2 rounded-[0.9rem] px-3 py-2 text-left transition hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-black text-slate-900">
                        {node.label}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">
                        {node.groupLabel} · {blockMenuDescription(node.kind)}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${kindTone(
                        node.kind,
                      )}`}
                    >
                      {kindLabel(node.kind)}
                    </span>
                  </button>
                ))}
              </div>
            </details>

            {connectingFromId ? (
              <button
                type="button"
                onClick={() => setConnectingFromId(null)}
                className="rounded-[1rem] border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                正在连线，点目标方块 · 取消
              </button>
            ) : null}

            <button
              type="button"
              onClick={compileProtocol}
              disabled={compileStatus === "compiling"}
              className="rounded-[1rem] bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {compileStatus === "compiling" ? "梳理中" : "协议梳理"}
            </button>

            <button
              type="button"
              onClick={registerProtocol}
              disabled={registryBusy || compileStatus === "compiling"}
              className={`rounded-[1rem] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-300 ${
                registrationNeedsUpdate
                  ? "bg-amber-500 hover:bg-amber-600"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {registryActionStatus === "registering"
                ? "注册中"
                : registeredProtocol
                  ? "更新注册"
                  : "注册协议"}
            </button>

            {registeredProtocol ? (
              <button
                type="button"
                onClick={toggleRegisteredProtocol}
                disabled={registryBusy}
                className={`rounded-[1rem] px-4 py-2.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white ${
                  registeredProtocol.enabled
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {registryActionStatus === "toggling"
                  ? "切换中"
                  : registeredProtocol.enabled
                    ? "已启用"
                    : "已关闭"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={createPlanOnlyExecution}
              disabled={
                compileStatus === "invalid" ||
                compileStatus === "dirty_after_compile" ||
                registrationNeedsUpdate ||
                !registeredProtocol?.enabled ||
                executionActionStatus === "creating"
              }
              className="rounded-[1rem] bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {executionActionStatus === "creating" ? "生成计划中" : "试运行"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
