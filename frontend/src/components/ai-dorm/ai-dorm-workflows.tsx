"use client";

import type { PointerEvent as ReactPointerEvent, WheelEvent } from "react";
import { useMemo, useRef, useState } from "react";

import Link from "next/link";

import type {
  AiDormDocumentScopeCatalog,
  AiDormPaletteGroup,
  AiDormWorkflowCard,
  AiDormWorkflowStudioData,
} from "@/lib/ai-dorm/server";

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
  onStartDrag,
  onConnectorClick,
  onDelete,
  onChangeIntent,
}: {
  node: CanvasNodeDraft;
  error: boolean;
  warning: boolean;
  dragging: boolean;
  connecting: boolean;
  onStartDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  onConnectorClick: () => void;
  onDelete: () => void;
  onChangeIntent: (value: string) => void;
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
    </article>
  );
}

function DepartmentBlock({
  department,
  documentScopes,
  error,
  dragging,
  activeAgentId,
  connectingFromId,
  issues,
  onStartDrag,
  onStartAgentDrag,
  onAgentConnectorClick,
  onChange,
  onAddAgent,
  onRemoveAgent,
  onDelete,
  onChangeAgentIntent,
}: {
  department: CanvasDepartmentDraft;
  documentScopes: AiDormDocumentScopeCatalog;
  error: boolean;
  dragging: boolean;
  activeAgentId?: string;
  connectingFromId: string | null;
  issues: CompileIssue[];
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
}) {
  const definition = getDepartmentDefinition(department.departmentId);
  const scope = getDepartmentScope(department);
  const documentSecondaryOptions = getDocumentSecondaryOptions(department, documentScopes);
  const documentSecondaryScope = getDocumentSecondaryScope(department, documentScopes);
  const detail = resolveDepartmentDetail(department, documentScopes);
  const visibleAgents = detail.visibleAgents;
  const placedAgents = department.agents ?? [];
  const renderFrame = getDepartmentRenderFrame(department);
  const showDocumentSecondary =
    department.departmentId === "documents" &&
    (department.scopeId === DOC_MY_SPACE_SCOPE_ID || department.scopeId === DOC_COLLAB_SCOPE_ID);

  return (
    <section
      data-canvas-object="true"
      className={`absolute z-0 overflow-visible rounded-[1.6rem] border-2 border-dashed p-4 ${
        error
          ? "border-rose-300 bg-rose-50/45"
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
  onToggle,
  onChange,
}: {
  edge: CanvasEdgeDraft;
  from: CanvasNodeDraft;
  to: CanvasNodeDraft;
  error: boolean;
  warning: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
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
    </div>
  );
}

function IssuePanel({
  status,
  issues,
}: {
  status: CompileStatus;
  issues: CompileIssue[];
}) {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;

  return (
    <aside
      data-fixed-control="true"
      className="absolute right-5 bottom-24 z-40 w-[22rem] rounded-[1.4rem] border border-slate-200 bg-white/95 p-4 shadow-[0_30px_80px_-45px_rgba(15,23,42,0.55)] backdrop-blur"
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

      <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
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
  const [compileStatus, setCompileStatus] = useState<CompileStatus>("draft");
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

  const markDirty = () => {
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

  const compileProtocol = () => {
    setCompileStatus("compiling");
    const result = runMockCompile({ nodes: protocolNodes, edges, departments });
    setIssues(result.issues);
    setCompileStatus(result.status);
  };

  const createBlankGateway = () => {
    setDepartments([]);
    setNodes([]);
    setEdges([]);
    setIssues([]);
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
              {statusLabel(compileStatus)}
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
                error={hasBlockingIssue(issues, "department", department.id)}
                dragging={
                  activeDrag?.kind === "department" && activeDrag.id === department.id
                }
                activeAgentId={
                  activeDrag?.kind === "departmentAgent" ? activeDrag.id : undefined
                }
                connectingFromId={connectingFromId}
                issues={issues}
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

                const error = hasBlockingIssue(issues, "edge", edge.id);
                const warning = hasWarningIssue(issues, "edge", edge.id);
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
                  error={hasBlockingIssue(issues, "edge", edge.id)}
                  warning={hasWarningIssue(issues, "edge", edge.id)}
                  open={openEdgeId === edge.id}
                  onToggle={() =>
                    setOpenEdgeId((current) => (current === edge.id ? null : edge.id))
                  }
                  onChange={(value) => updateEdgeIntent(edge.id, value)}
                />
              );
            })}

            {nodes.map((node) => (
              <CanvasNode
                key={node.id}
                node={node}
                error={hasBlockingIssue(issues, "node", node.id)}
                warning={hasWarningIssue(issues, "node", node.id)}
                connecting={connectingFromId === node.id}
                dragging={activeDrag?.kind === "node" && activeDrag.id === node.id}
                onStartDrag={(event) => startNodeDrag(node, event)}
                onConnectorClick={() => connectNodeByHandle(node.id)}
                onDelete={() => deleteNode(node.id)}
                onChangeIntent={(value) => updateNodeIntent(node.id, value)}
              />
            ))}
          </div>
        </div>

        <IssuePanel status={compileStatus} issues={issues} />

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
              className="rounded-[1rem] bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              协议梳理
            </button>

            <button
              type="button"
              disabled={compileStatus === "invalid" || compileStatus === "dirty_after_compile"}
              className="rounded-[1rem] bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              试运行
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
