import "server-only";

import { createHash } from "node:crypto";

import {
  getAiDormAgents,
  getAiDormSkills,
  getAiDormWorkflowStudioData,
} from "@/lib/ai-dorm/server";
import {
  getAiProductionSkillFolders,
  getAiProductionSkillPackages,
} from "@/lib/ai-dorm/production-assets";
import {
  getAiToolRegistrySnapshot,
  type AiCapabilityDescriptor,
  type AiCapabilityRiskLevel,
} from "@/lib/ai-tools/gateway";
import type { AuthenticatedUser } from "@/lib/auth/types";
import type {
  AgentCapability,
  CallableCapability,
  CapabilityCatalog,
  CapabilityContract,
  CapabilityContractKind,
  CapabilityContractRiskLevel,
  CapabilityImplementationStatus,
  DepartmentCapability,
  DepartmentScopeCapability,
  JsonSchema,
  NodeKindCapability,
  ProtocolApprovalPolicy,
  ProtocolReference,
  ProtocolReferenceKind,
  ProtocolRiskLevel,
  WritableObjectCapability,
} from "@/lib/work-protocol/types";

const CATALOG_VERSION = "work-protocol-catalog.v1";

const AGENT_NAME_TO_ID: Record<string, string> = {
  工单龙虾: "work-order-longxia",
  文档龙虾: "document-longxia",
  图纸龙虾: "drawing-longxia",
  预警龙虾: "alert-longxia",
  报表龙虾: "report-longxia",
};

function asJsonSchema(value: Record<string, unknown>): JsonSchema {
  return value as JsonSchema;
}

function scopeRef(id: string, label: string): ProtocolReference {
  return {
    kind: "department_scope",
    id,
    label,
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

function buildCatalogHash(catalog: Omit<CapabilityCatalog, "catalogHash">) {
  const stableCatalog = {
    catalogVersion: catalog.catalogVersion,
    departments: catalog.departments,
    agents: catalog.agents,
    nodeKinds: catalog.nodeKinds,
    callables: catalog.callables,
    writableObjects: catalog.writableObjects,
  };

  return createHash("sha256").update(stableStringify(stableCatalog)).digest("hex");
}

function mapToolRiskLevel(riskLevel: AiCapabilityRiskLevel): ProtocolRiskLevel {
  if (riskLevel === "read" || riskLevel === "analysis") {
    return "low";
  }

  if (riskLevel === "draft_write" || riskLevel === "safe_write") {
    return "medium";
  }

  if (riskLevel === "destructive") {
    return "critical";
  }

  return "high";
}

function normalizeContractRiskLevel(
  riskLevel: ProtocolRiskLevel,
): CapabilityContractRiskLevel {
  if (riskLevel === "critical" || riskLevel === "high") {
    return "high";
  }

  if (riskLevel === "medium") {
    return "medium";
  }

  return "low";
}

function riskLevelFromApprovalPolicy(
  approvalPolicy: ProtocolApprovalPolicy,
): CapabilityContractRiskLevel {
  if (approvalPolicy === "required") {
    return "high";
  }

  if (approvalPolicy === "recommended") {
    return "medium";
  }

  return "low";
}

function nodeKindContractKind(
  nodeKind: NodeKindCapability,
): CapabilityContractKind {
  if (nodeKind.kind === "bp_ask_report") {
    return "report";
  }

  if (nodeKind.kind === "human_confirm") {
    return "human_gate";
  }

  if (nodeKind.kind === "write_object") {
    return "write_object";
  }

  if (nodeKind.executorKind === "bp_ask") {
    return "bp_ask";
  }

  if (
    nodeKind.executorKind === "tool" ||
    nodeKind.executorKind === "skill" ||
    nodeKind.executorKind === "rag" ||
    nodeKind.executorKind === "agent"
  ) {
    return nodeKind.executorKind;
  }

  return "control";
}

function schemaFromFields(params: {
  required: string[];
  optional?: string[];
  outputs?: string[];
}): { inputSchema: JsonSchema; outputSchema: JsonSchema } {
  const propertyNames = [...params.required, ...(params.optional ?? [])];
  const inputProperties = Object.fromEntries(
    propertyNames.map((name) => [name, { type: "string" }]),
  );
  const outputProperties = Object.fromEntries(
    (params.outputs ?? []).map((name) => [name, { type: "string" }]),
  );

  return {
    inputSchema: asJsonSchema({
      type: "object",
      required: params.required,
      properties: inputProperties,
    }),
    outputSchema: asJsonSchema({
      type: "object",
      properties: outputProperties,
    }),
  };
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function mapToolApprovalPolicy(
  descriptor: AiCapabilityDescriptor,
): ProtocolApprovalPolicy {
  if (
    descriptor.riskLevel === "restricted_write" ||
    descriptor.riskLevel === "external_action" ||
    descriptor.riskLevel === "destructive"
  ) {
    return "required";
  }

  if (
    descriptor.riskLevel === "draft_write" ||
    descriptor.riskLevel === "safe_write" ||
    descriptor.requiresConfirmationDefault
  ) {
    return "recommended";
  }

  return "none";
}

function mapToolImplementationStatus(
  descriptor: AiCapabilityDescriptor,
): CapabilityImplementationStatus {
  if (descriptor.executionMode === "plan_only") {
    return "mock";
  }

  return "available";
}

function getToolImplementationNote(descriptor: AiCapabilityDescriptor) {
  if (descriptor.executionMode === "plan_only") {
    return "当前工具只产生计划或草稿，不能作为真实写入执行节点直接注册上线。";
  }

  if (descriptor.riskLevel === "external_action") {
    return "外部动作需要运行时二次确认和失败兜底。";
  }

  return undefined;
}

function getToolAllowedScopeIds(descriptor: AiCapabilityDescriptor) {
  if (descriptor.domain === "work_order") {
    return ["work_orders:all", "work_orders:list"];
  }

  if (descriptor.domain === "document") {
    return ["documents:all", "documents:my_space", "documents:collaboration"];
  }

  if (descriptor.domain === "openclaw") {
    return ["work_orders:list"];
  }

  return undefined;
}

function mapToolCapability(descriptor: AiCapabilityDescriptor): CallableCapability {
  return {
    capabilityId: `tool.${descriptor.name}`,
    kind: "tool",
    displayName: descriptor.displayName,
    description: descriptor.description,
    implementationStatus: mapToolImplementationStatus(descriptor),
    implementationNote: getToolImplementationNote(descriptor),
    inputSchema: asJsonSchema(descriptor.inputSchema),
    outputSchema: asJsonSchema(descriptor.outputSchema),
    requiredContext: descriptor.requiredContext,
    riskLevel: mapToolRiskLevel(descriptor.riskLevel),
    mutatesData: descriptor.target.mutates || descriptor.mutatesDemoData,
    requiresConfirmationDefault:
      descriptor.requiresConfirmationDefault ||
      mapToolApprovalPolicy(descriptor) === "required",
    allowedDepartmentScopeIds: getToolAllowedScopeIds(descriptor),
  };
}

function getAllToolIds() {
  return getAiToolRegistrySnapshot().capabilities.map(
    (capability) => `tool.${capability.name}`,
  );
}

function getToolIdsByDomain(domain: string) {
  return getAiToolRegistrySnapshot()
    .capabilities.filter((capability) => capability.domain === domain)
    .map((capability) => `tool.${capability.name}`);
}

function buildScope(params: {
  scopeId: string;
  label: string;
  resourceKind: ProtocolReferenceKind;
  visibleAgentIds: string[];
  readableObjectTypes: ProtocolReferenceKind[];
  writableObjectTypes?: ProtocolReferenceKind[];
  allowedToolIds?: string[];
  allowedSkillFolderIds?: string[];
  allowedMemoryFolderIds?: string[];
  description?: string;
}): DepartmentScopeCapability {
  return {
    scopeId: params.scopeId,
    label: params.label,
    resourceKind: params.resourceKind,
    resourceRefs: [
      scopeRef(
        params.scopeId,
        params.description ? `${params.label}：${params.description}` : params.label,
      ),
    ],
    visibleAgentIds: params.visibleAgentIds,
    readableObjectTypes: params.readableObjectTypes,
    writableObjectTypes: params.writableObjectTypes ?? [],
    allowedToolIds: params.allowedToolIds ?? [],
    allowedSkillFolderIds: params.allowedSkillFolderIds ?? [],
    allowedMemoryFolderIds: params.allowedMemoryFolderIds ?? [],
  };
}

function mapAgentDisplayNamesToIds(displayNames: string[]) {
  return displayNames
    .map((displayName) => AGENT_NAME_TO_ID[displayName] ?? null)
    .filter((agentId): agentId is string => Boolean(agentId));
}

async function buildDocumentScopes(
  user: AuthenticatedUser,
  skillFolderIds: string[],
): Promise<DepartmentScopeCapability[]> {
  const studio = await getAiDormWorkflowStudioData(user);
  const documentToolIds = getToolIdsByDomain("document");
  const baseScopes: DepartmentScopeCapability[] = [
    buildScope({
      scopeId: "documents:all",
      label: "全部文件",
      resourceKind: "document",
      visibleAgentIds: ["document-longxia", "report-longxia"],
      readableObjectTypes: ["document", "spreadsheet"],
      writableObjectTypes: ["document", "spreadsheet", "execution_result"],
      allowedToolIds: documentToolIds,
      allowedSkillFolderIds: skillFolderIds,
      allowedMemoryFolderIds: ["memory-document-longxia", "memory-report-longxia"],
      description: "文档档案室全部顶层资源。",
    }),
    buildScope({
      scopeId: "documents:my_space",
      label: "我的文档空间",
      resourceKind: "document",
      visibleAgentIds: ["document-longxia", "report-longxia"],
      readableObjectTypes: ["document", "spreadsheet"],
      writableObjectTypes: ["document", "spreadsheet", "execution_result"],
      allowedToolIds: documentToolIds,
      allowedSkillFolderIds: skillFolderIds,
      allowedMemoryFolderIds: ["memory-document-longxia", "memory-report-longxia"],
      description: "个人文档空间的默认范围。",
    }),
    buildScope({
      scopeId: "documents:collaboration",
      label: "合作空间",
      resourceKind: "document",
      visibleAgentIds: ["document-longxia", "alert-longxia", "report-longxia"],
      readableObjectTypes: ["document", "spreadsheet"],
      writableObjectTypes: ["document", "spreadsheet", "execution_result"],
      allowedToolIds: documentToolIds,
      allowedSkillFolderIds: skillFolderIds,
      allowedMemoryFolderIds: [
        "memory-document-longxia",
        "memory-alert-longxia",
        "memory-report-longxia",
      ],
      description: "合作空间默认范围。",
    }),
  ];
  const mySpaceFolderScopes = studio.documentScopes.mySpaceFolders.map((scope) =>
    buildScope({
      scopeId: `documents:my_space:${scope.id}`,
      label: `我的文档空间 / ${scope.label}`,
      resourceKind: "document",
      visibleAgentIds: mapAgentDisplayNamesToIds(scope.visibleAgents),
      readableObjectTypes: ["document", "spreadsheet"],
      writableObjectTypes: ["document", "spreadsheet", "execution_result"],
      allowedToolIds: documentToolIds,
      allowedSkillFolderIds: skillFolderIds,
      allowedMemoryFolderIds: ["memory-document-longxia", "memory-report-longxia"],
      description: scope.description,
    }),
  );
  const collaborationScopes = studio.documentScopes.collaborationSpaces.map((scope) =>
    buildScope({
      scopeId: `documents:collaboration:${scope.id}`,
      label: `合作空间 / ${scope.label}`,
      resourceKind: "document",
      visibleAgentIds: mapAgentDisplayNamesToIds(scope.visibleAgents),
      readableObjectTypes: ["document", "spreadsheet"],
      writableObjectTypes: ["document", "spreadsheet", "execution_result"],
      allowedToolIds: documentToolIds,
      allowedSkillFolderIds: skillFolderIds,
      allowedMemoryFolderIds: [
        "memory-document-longxia",
        "memory-alert-longxia",
        "memory-report-longxia",
      ],
      description: scope.description,
    }),
  );

  return [...baseScopes, ...mySpaceFolderScopes, ...collaborationScopes];
}

async function buildDepartments(
  user: AuthenticatedUser,
  skillFolderIds: string[],
): Promise<DepartmentCapability[]> {
  const workOrderToolIds = getToolIdsByDomain("work_order");
  const openClawToolIds = getToolIdsByDomain("openclaw");
  const documentScopes = await buildDocumentScopes(user, skillFolderIds);
  const departments: DepartmentCapability[] = [
    {
      departmentId: "overview",
      label: "总览",
      description: "地图、工程队状态、预警中心和设置。",
      implementationStatus: "available",
      defaultApprovalPolicy: "recommended",
      scopeOptions: [
        buildScope({
          scopeId: "overview:map",
          label: "全城实时地图",
          resourceKind: "department_scope",
          visibleAgentIds: ["alert-longxia", "report-longxia"],
          readableObjectTypes: ["execution_result"],
          allowedToolIds: [],
          allowedMemoryFolderIds: ["memory-alert-longxia", "memory-report-longxia"],
          description: "地图和实时态势范围。",
        }),
        buildScope({
          scopeId: "overview:team_status",
          label: "工程队状态",
          resourceKind: "department_scope",
          visibleAgentIds: ["report-longxia"],
          readableObjectTypes: ["execution_result"],
          allowedToolIds: [],
          allowedMemoryFolderIds: ["memory-report-longxia"],
          description: "工程队状态看板范围。",
        }),
        buildScope({
          scopeId: "overview:alerts",
          label: "预警中心",
          resourceKind: "department_scope",
          visibleAgentIds: ["alert-longxia", "report-longxia"],
          readableObjectTypes: ["execution_result"],
          writableObjectTypes: ["execution_result"],
          allowedToolIds: [],
          allowedMemoryFolderIds: ["memory-alert-longxia", "memory-report-longxia"],
          description: "预警中心和异常汇总范围。",
        }),
        buildScope({
          scopeId: "overview:settings",
          label: "设置",
          resourceKind: "department_scope",
          visibleAgentIds: ["report-longxia"],
          readableObjectTypes: ["execution_result"],
          allowedToolIds: [],
          description: "当前只作为协议梳理占位。",
        }),
      ],
    },
    {
      departmentId: "engineering_team",
      label: "工程队",
      description: "工程队、施工队、派单和现场执行范围。",
      implementationStatus: "mock",
      implementationNote: "工程队真实工具还未进入 Tool Gateway，当前只作为部门沙箱占位。",
      defaultApprovalPolicy: "recommended",
      scopeOptions: [
        buildScope({
          scopeId: "engineering_team:all",
          label: "全部工程队",
          resourceKind: "department_scope",
          visibleAgentIds: ["work-order-longxia", "drawing-longxia", "report-longxia"],
          readableObjectTypes: ["work_order", "execution_result"],
          writableObjectTypes: ["execution_result"],
          allowedToolIds: openClawToolIds,
          allowedSkillFolderIds: skillFolderIds,
          allowedMemoryFolderIds: [
            "memory-work-order-longxia",
            "memory-drawing-longxia",
            "memory-report-longxia",
          ],
          description: "工程队全局范围。",
        }),
      ],
    },
    {
      departmentId: "work_orders",
      label: "工单",
      description: "工单列表、筛选、详情读取和低风险汇报。",
      implementationStatus: "available",
      defaultApprovalPolicy: "recommended",
      scopeOptions: [
        buildScope({
          scopeId: "work_orders:all",
          label: "全部工单",
          resourceKind: "work_order",
          visibleAgentIds: ["work-order-longxia", "report-longxia"],
          readableObjectTypes: ["work_order", "execution_result"],
          writableObjectTypes: ["work_order", "execution_result"],
          allowedToolIds: workOrderToolIds,
          allowedSkillFolderIds: skillFolderIds,
          allowedMemoryFolderIds: [
            "memory-work-order-longxia",
            "memory-report-longxia",
          ],
          description: "默认覆盖工单全部范围。",
        }),
        buildScope({
          scopeId: "work_orders:list",
          label: "工单列表",
          resourceKind: "work_order",
          visibleAgentIds: ["work-order-longxia", "report-longxia"],
          readableObjectTypes: ["work_order", "execution_result"],
          writableObjectTypes: ["work_order", "execution_result"],
          allowedToolIds: workOrderToolIds,
          allowedSkillFolderIds: skillFolderIds,
          allowedMemoryFolderIds: [
            "memory-work-order-longxia",
            "memory-report-longxia",
          ],
          description: "工单列表、筛选和批量查看。",
        }),
      ],
    },
    {
      departmentId: "documents",
      label: "文档档案室",
      description: "文档、表格、文件夹和合作空间。",
      implementationStatus: "available",
      implementationNote: "文档 Tool 已有基础读写；细粒度表格写入仍需后续补齐。",
      defaultApprovalPolicy: "recommended",
      scopeOptions: documentScopes,
    },
    {
      departmentId: "ai_dorm",
      label: "AI宿舍",
      description: "工作协议网关、AI生产资料仓、AI员工和任务收件箱。",
      implementationStatus: "mock",
      implementationNote: "AI宿舍多数能力仍是管理面和配置面，执行权限后续再接。",
      defaultApprovalPolicy: "recommended",
      scopeOptions: [
        buildScope({
          scopeId: "ai_dorm:work_protocol_gateway",
          label: "工作协议网关",
          resourceKind: "department_scope",
          visibleAgentIds: ["report-longxia"],
          readableObjectTypes: ["execution_result"],
          writableObjectTypes: ["execution_result"],
          allowedSkillFolderIds: skillFolderIds,
          allowedMemoryFolderIds: ["memory-report-longxia"],
          description: "协议草稿、编译结果和注册状态。",
        }),
        buildScope({
          scopeId: "ai_dorm:production_assets",
          label: "AI生产资料仓",
          resourceKind: "department_scope",
          visibleAgentIds: ["report-longxia"],
          readableObjectTypes: ["execution_result"],
          allowedSkillFolderIds: skillFolderIds,
          allowedMemoryFolderIds: ["memory-report-longxia"],
          description: "API Key、Skill、RAG 和记忆生产资料。",
        }),
        buildScope({
          scopeId: "ai_dorm:agents",
          label: "AI员工",
          resourceKind: "department_scope",
          visibleAgentIds: [
            "work-order-longxia",
            "document-longxia",
            "drawing-longxia",
            "alert-longxia",
            "report-longxia",
          ],
          readableObjectTypes: ["execution_result"],
          allowedSkillFolderIds: skillFolderIds,
          allowedMemoryFolderIds: [
            "memory-work-order-longxia",
            "memory-document-longxia",
            "memory-drawing-longxia",
            "memory-alert-longxia",
            "memory-report-longxia",
          ],
          description: "AI员工配置和状态范围。",
        }),
      ],
    },
  ];

  return departments;
}

function getAgentVisibleScopes(agentId: string, departments: DepartmentCapability[]) {
  return departments.flatMap((department) =>
    department.scopeOptions
      .filter((scope) => scope.visibleAgentIds.includes(agentId))
      .map((scope) => scope.scopeId),
  );
}

function getAgentAllowedSkillFolders(
  agentId: string,
  departments: DepartmentCapability[],
) {
  return [
    ...new Set(
      departments.flatMap((department) =>
        department.scopeOptions
          .filter((scope) => scope.visibleAgentIds.includes(agentId))
          .flatMap((scope) => scope.allowedSkillFolderIds),
      ),
    ),
  ];
}

function getAgentAllowedMemoryFolders(
  agentId: string,
  departments: DepartmentCapability[],
) {
  return [
    ...new Set(
      departments.flatMap((department) =>
        department.scopeOptions
          .filter((scope) => scope.visibleAgentIds.includes(agentId))
          .flatMap((scope) => scope.allowedMemoryFolderIds),
      ),
    ),
  ];
}

async function buildAgents(
  userId: string,
  departments: DepartmentCapability[],
): Promise<AgentCapability[]> {
  const agents = await getAiDormAgents(userId);

  return agents.map((agent) => {
    const status =
      agent.id === "work-order-longxia"
        ? "mock"
        : ("planned" satisfies CapabilityImplementationStatus);

    return {
      agentId: agent.id,
      displayName: agent.name,
      description: agent.description,
      implementationStatus: status,
      implementationNote:
        status === "mock"
          ? "已有局部 adapter / dry-run 方向，尚未接入通用协议 runtime。"
          : "当前是部门沙箱里的 AI员工占位，后续接 Longxia 执行协议。",
      visibleDepartmentScopeIds: getAgentVisibleScopes(agent.id, departments),
      taskKinds: agent.capabilityTags,
      inputSchema: {
        type: "object",
        required: ["task"],
        properties: {
          task: { type: "string" },
          departmentScopeId: { type: "string" },
          context: { type: "object" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          risks: { type: "array", items: { type: "string" } },
          nextStep: { type: "string" },
          artifacts: { type: "array" },
        },
      },
      allowedSkillFolderIds: getAgentAllowedSkillFolders(agent.id, departments),
      allowedMemoryFolderIds: getAgentAllowedMemoryFolders(agent.id, departments),
      canWrite: false,
      canAskFollowup: agent.id !== "report-longxia",
      handoffProtocol: {
        inputPacketVersion: "longxia-input.v0",
        outputPacketVersion: "longxia-output.v0",
      },
    } satisfies AgentCapability;
  });
}

function buildNodeKinds(): NodeKindCapability[] {
  return [
    {
      kind: "bp_ask_entry",
      displayName: "BP问问入口",
      implementationStatus: "available",
      executorKind: "bp_ask",
      requiredInputs: ["userPrompt"],
      optionalInputs: ["threadContext"],
      outputs: ["taskIntent", "targetRefs", "missingInputs"],
      permissionRequirements: [],
      approvalPolicy: "none",
      failureModes: ["task_not_understood", "missing_required_input"],
    },
    {
      kind: "tool_call",
      displayName: "Tool调用",
      implementationStatus: "available",
      executorKind: "tool",
      requiredInputs: ["callableId", "input"],
      optionalInputs: ["departmentScopeId"],
      outputs: ["toolResult"],
      permissionRequirements: ["tool_allowed_in_scope"],
      approvalPolicy: "recommended",
      failureModes: ["tool_not_found", "tool_input_invalid", "tool_failed"],
    },
    {
      kind: "skill_call",
      displayName: "Skill调用",
      implementationStatus: "mock",
      implementationNote: "Skill 市场和文件夹已经有管理面，真实 Skill runtime 还未统一接入。",
      executorKind: "skill",
      requiredInputs: ["skillId", "input"],
      optionalInputs: ["skillFolderId"],
      outputs: ["skillResult"],
      permissionRequirements: ["skill_visible_in_scope"],
      approvalPolicy: "recommended",
      failureModes: ["skill_not_found", "skill_failed"],
    },
    {
      kind: "rag_search",
      displayName: "RAG检索",
      implementationStatus: "planned",
      implementationNote: "RAG 工厂当前是原型占位，不能注册为生产执行节点。",
      executorKind: "rag",
      requiredInputs: ["query", "indexId"],
      optionalInputs: ["topK", "filters"],
      outputs: ["matches", "contextBundle"],
      permissionRequirements: ["rag_index_visible"],
      approvalPolicy: "none",
      failureModes: ["rag_index_not_found", "no_matches"],
    },
    {
      kind: "agent_task",
      displayName: "AI员工任务",
      implementationStatus: "mock",
      implementationNote: "Longxia handoff 尚未进入通用协议 runtime。",
      executorKind: "agent",
      requiredInputs: ["agentId", "task"],
      optionalInputs: ["departmentScopeId", "context"],
      outputs: ["agentResult", "requiredFollowup"],
      permissionRequirements: ["agent_visible_in_scope"],
      approvalPolicy: "recommended",
      failureModes: ["agent_not_found", "agent_timeout", "agent_failed"],
    },
    {
      kind: "task_dispatch",
      displayName: "任务分派",
      implementationStatus: "mock",
      executorKind: "control",
      requiredInputs: ["task"],
      optionalInputs: ["splitRules"],
      outputs: ["subtasks"],
      permissionRequirements: [],
      approvalPolicy: "none",
      failureModes: ["dispatch_failed"],
    },
    {
      kind: "result_aggregate",
      displayName: "结果汇总",
      implementationStatus: "mock",
      executorKind: "control",
      requiredInputs: ["results"],
      optionalInputs: ["format"],
      outputs: ["summary", "risks", "nextStep"],
      permissionRequirements: [],
      approvalPolicy: "none",
      failureModes: ["aggregate_failed"],
    },
    {
      kind: "condition",
      displayName: "条件判断",
      implementationStatus: "mock",
      executorKind: "control",
      requiredInputs: ["condition"],
      optionalInputs: ["branches"],
      outputs: ["selectedBranch"],
      permissionRequirements: [],
      approvalPolicy: "none",
      failureModes: ["condition_invalid"],
    },
    {
      kind: "human_confirm",
      displayName: "人工确认",
      implementationStatus: "mock",
      executorKind: "human",
      requiredInputs: ["confirmationSubject"],
      optionalInputs: ["diff", "riskSummary"],
      outputs: ["approved", "comment"],
      permissionRequirements: [],
      approvalPolicy: "required",
      failureModes: ["rejected", "timeout"],
    },
    {
      kind: "bp_ask_followup",
      displayName: "BP问问追问",
      implementationStatus: "mock",
      executorKind: "bp_ask",
      requiredInputs: ["question"],
      optionalInputs: ["choices"],
      outputs: ["userAnswer"],
      permissionRequirements: [],
      approvalPolicy: "none",
      failureModes: ["user_cancelled"],
    },
    {
      kind: "write_object",
      displayName: "写入对象",
      implementationStatus: "mock",
      implementationNote: "协议级写入对象先做草稿和确认，不直接提交真实业务数据。",
      executorKind: "write",
      requiredInputs: ["objectKind", "action", "payload"],
      optionalInputs: ["rollbackRef"],
      outputs: ["writeResult"],
      permissionRequirements: ["write_allowed_in_scope", "confirmation_required"],
      approvalPolicy: "required",
      failureModes: ["write_denied", "write_failed"],
    },
    {
      kind: "bp_ask_report",
      displayName: "BP问问汇报出口",
      implementationStatus: "available",
      executorKind: "bp_ask",
      requiredInputs: ["summary"],
      optionalInputs: ["risks", "nextStep", "artifacts"],
      outputs: ["replyText"],
      permissionRequirements: [],
      approvalPolicy: "none",
      failureModes: ["report_generation_failed"],
    },
  ];
}

async function buildSkillCallables(): Promise<CallableCapability[]> {
  const [skills, packages] = await Promise.all([
    getAiDormSkills(),
    getAiProductionSkillPackages(),
  ]);
  const blueprintCallables = skills.map(
    (skill): CallableCapability => ({
      capabilityId: `skill.${skill.id}`,
      kind: "skill",
      displayName: skill.name,
      description: skill.summary,
      implementationStatus: "mock",
      implementationNote: "当前是内置 Skill 蓝图或草稿，协议可 dry-run，不能当作真实 Skill 执行上线。",
      inputSchema: {
        type: "object",
        description: skill.inputSummary,
      },
      outputSchema: {
        type: "object",
        description: skill.outputSummary,
      },
      requiredContext: [],
      riskLevel: "low",
      mutatesData: false,
      requiresConfirmationDefault: false,
    }),
  );
  const localPackageCallables = packages.map(
    (item): CallableCapability => ({
      capabilityId: `skill.local_package.${item.id}`,
      kind: "skill",
      displayName: item.displayName,
      description: `${item.sourceLabel} / ${item.folderName}`,
      implementationStatus: "mock",
      implementationNote: "本地 Skill 包已经进入生产资料仓，但还未接通统一 Skill runtime。",
      inputSchema: {
        type: "object",
        properties: {
          task: { type: "string" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          result: { type: "object" },
        },
      },
      requiredContext: ["skillPackage"],
      riskLevel: "medium",
      mutatesData: false,
      requiresConfirmationDefault: false,
      requiredSkillFolderId: item.folderId
        ? `skill-folder-local-${item.folderId}`
        : undefined,
    }),
  );

  return [...blueprintCallables, ...localPackageCallables];
}

function buildRagCallables(): CallableCapability[] {
  return [
    {
      capabilityId: "rag.project-default",
      kind: "rag",
      displayName: "项目资料默认知识库",
      description: "面向项目资料、送审资料和历史片段的默认检索占位。",
      implementationStatus: "planned",
      implementationNote: "RAG 工厂尚未接真实索引与检索执行。",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string" },
          topK: { type: "number" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          matches: { type: "array", items: { type: "object" } },
          contextBundle: { type: "string" },
        },
      },
      requiredContext: ["query"],
      riskLevel: "low",
      mutatesData: false,
      requiresConfirmationDefault: false,
      allowedDepartmentScopeIds: ["documents:all", "documents:my_space"],
    },
  ];
}

async function buildCallables(): Promise<CallableCapability[]> {
  const tools = getAiToolRegistrySnapshot().capabilities.map(mapToolCapability);
  const [skills, rags] = await Promise.all([
    buildSkillCallables(),
    Promise.resolve(buildRagCallables()),
  ]);

  return [...tools, ...skills, ...rags];
}

function buildWritableObjects(): WritableObjectCapability[] {
  return [
    {
      objectKind: "work_order",
      displayName: "工单",
      implementationStatus: "mock",
      implementationNote: "现有 Tool 支持写回草稿和应用，协议级 write_object 节点还未接 runtime。",
      actions: [
        {
          actionName: "createWritebackDraft",
          inputSchema: {
            type: "object",
            required: ["workOrderNo", "changes"],
            properties: {
              workOrderNo: { type: "string" },
              changes: { type: "array" },
            },
          },
          rollbackSupported: false,
          confirmationRequired: true,
          allowedDepartmentScopeIds: ["work_orders:all", "work_orders:list"],
        },
        {
          actionName: "applyWritebackDraft",
          inputSchema: {
            type: "object",
            required: ["draftIds"],
            properties: {
              draftIds: { type: "array", items: { type: "string" } },
            },
          },
          rollbackSupported: true,
          confirmationRequired: true,
          allowedDepartmentScopeIds: ["work_orders:all", "work_orders:list"],
        },
      ],
    },
    {
      objectKind: "document",
      displayName: "文档",
      implementationStatus: "mock",
      implementationNote: "文档写入 Tool 已有基础能力；协议级 diff、确认和表格细粒度写入后续补齐。",
      actions: [
        {
          actionName: "writeContent",
          inputSchema: {
            type: "object",
            required: ["documentId", "content"],
            properties: {
              documentId: { type: "string" },
              content: { type: "string" },
            },
          },
          rollbackSupported: false,
          confirmationRequired: true,
          allowedDepartmentScopeIds: ["documents:all", "documents:my_space"],
        },
      ],
    },
    {
      objectKind: "execution_result",
      displayName: "执行结果",
      implementationStatus: "planned",
      implementationNote: "协议执行结果表还未建立，当前只定义写入目标。",
      actions: [
        {
          actionName: "create",
          inputSchema: {
            type: "object",
            required: ["protocolId", "summary"],
            properties: {
              protocolId: { type: "string" },
              summary: { type: "string" },
              artifacts: { type: "array" },
            },
          },
          rollbackSupported: false,
          confirmationRequired: false,
          allowedDepartmentScopeIds: [
            "work_orders:list",
            "documents:all",
            "ai_dorm:work_protocol_gateway",
          ],
        },
      ],
    },
  ];
}

async function getSkillFolderIds() {
  const folders = await getAiProductionSkillFolders();
  return [
    "skill-folder-work-orders",
    "skill-folder-documents",
    "skill-folder-reports",
    ...folders.map((folder) => `skill-folder-local-${folder.id}`),
  ];
}

export async function buildWorkProtocolCapabilityCatalog(
  user: AuthenticatedUser,
): Promise<CapabilityCatalog> {
  const generatedAt = new Date().toISOString();
  const skillFolderIds = await getSkillFolderIds();
  const departments = await buildDepartments(user, skillFolderIds);
  const [agents, callables] = await Promise.all([
    buildAgents(user.id, departments),
    buildCallables(),
  ]);
  const catalogWithoutHash = {
    catalogVersion: CATALOG_VERSION,
    generatedAt,
    departments,
    agents,
    nodeKinds: buildNodeKinds(),
    callables,
    writableObjects: buildWritableObjects(),
  } satisfies Omit<CapabilityCatalog, "catalogHash">;

  return {
    ...catalogWithoutHash,
    catalogHash: buildCatalogHash(catalogWithoutHash),
  };
}

export function buildCapabilityContracts(
  catalog: CapabilityCatalog,
): CapabilityContract[] {
  const departmentContracts = catalog.departments.map(
    (department): CapabilityContract => ({
      contractVersion: "capability-contract.v1",
      id: `department.${department.departmentId}`,
      kind: "department",
      label: department.label,
      description: department.description,
      inputSchema: asJsonSchema({
        type: "object",
        required: ["scopeId"],
        properties: {
          scopeId: {
            type: "string",
            enum: department.scopeOptions.map((scope) => scope.scopeId),
          },
        },
      }),
      outputSchema: asJsonSchema({
        type: "object",
        properties: {
          selectedScopeId: { type: "string" },
          visibleAgentIds: { type: "array", items: { type: "string" } },
          allowedToolIds: { type: "array", items: { type: "string" } },
          allowedSkillFolderIds: { type: "array", items: { type: "string" } },
          allowedMemoryFolderIds: { type: "array", items: { type: "string" } },
        },
      }),
      scopes: department.scopeOptions.map((scope) => scope.scopeId),
      permissions: [
        `approval:${department.defaultApprovalPolicy}`,
        ...uniqueStrings(
          department.scopeOptions.flatMap((scope) => [
            ...scope.allowedToolIds.map((id) => `tool:${id}`),
            ...scope.allowedSkillFolderIds.map((id) => `skill_folder:${id}`),
            ...scope.allowedMemoryFolderIds.map((id) => `memory_folder:${id}`),
          ]),
        ),
      ],
      riskLevel: riskLevelFromApprovalPolicy(department.defaultApprovalPolicy),
      status: department.implementationStatus,
      implementationNote: department.implementationNote,
      approvalPolicy: department.defaultApprovalPolicy,
      parameterHints: {
        requiredInputs: ["scopeId"],
        optionalInputs: [],
        outputs: [
          "selectedScopeId",
          "visibleAgentIds",
          "allowedToolIds",
          "allowedSkillFolderIds",
          "allowedMemoryFolderIds",
        ],
      },
      source: {
        catalogSection: "departments",
        catalogId: department.departmentId,
      },
    }),
  );

  const scopeContracts = catalog.departments.flatMap((department) =>
    department.scopeOptions.map((scope): CapabilityContract => ({
      contractVersion: "capability-contract.v1",
      id: `department_scope.${scope.scopeId}`,
      kind: "department_scope",
      label: `${department.label} / ${scope.label}`,
      inputSchema: asJsonSchema({
        type: "object",
        properties: {
          scopeId: { type: "string", const: scope.scopeId },
        },
      }),
      outputSchema: asJsonSchema({
        type: "object",
        properties: {
          visibleAgentIds: {
            type: "array",
            items: { type: "string" },
          },
          readableObjectTypes: {
            type: "array",
            items: { type: "string" },
          },
          writableObjectTypes: {
            type: "array",
            items: { type: "string" },
          },
        },
      }),
      scopes: [scope.scopeId],
      permissions: uniqueStrings([
        ...scope.visibleAgentIds.map((id) => `agent:${id}`),
        ...scope.allowedToolIds.map((id) => `tool:${id}`),
        ...scope.allowedSkillFolderIds.map((id) => `skill_folder:${id}`),
        ...scope.allowedMemoryFolderIds.map((id) => `memory_folder:${id}`),
        ...scope.readableObjectTypes.map((kind) => `read:${kind}`),
        ...scope.writableObjectTypes.map((kind) => `write:${kind}`),
      ]),
      riskLevel: scope.writableObjectTypes.length > 0 ? "medium" : "low",
      status: department.implementationStatus,
      implementationNote: department.implementationNote,
      parameterHints: {
        requiredInputs: [],
        optionalInputs: ["scopeId"],
        outputs: [
          "visibleAgentIds",
          "readableObjectTypes",
          "writableObjectTypes",
        ],
      },
      source: {
        catalogSection: "departmentScopes",
        catalogId: scope.scopeId,
      },
    })),
  );

  const nodeKindContracts = catalog.nodeKinds.map((nodeKind): CapabilityContract => {
    const schemas = schemaFromFields({
      required: nodeKind.requiredInputs,
      optional: nodeKind.optionalInputs,
      outputs: nodeKind.outputs,
    });

    return {
      contractVersion: "capability-contract.v1",
      id: `node_kind.${nodeKind.kind}`,
      kind: nodeKindContractKind(nodeKind),
      label: nodeKind.displayName,
      description: nodeKind.description,
      inputSchema: schemas.inputSchema,
      outputSchema: schemas.outputSchema,
      scopes: [],
      permissions: nodeKind.permissionRequirements,
      riskLevel: riskLevelFromApprovalPolicy(nodeKind.approvalPolicy),
      status: nodeKind.implementationStatus,
      implementationNote: nodeKind.implementationNote,
      approvalPolicy: nodeKind.approvalPolicy,
      parameterHints: {
        requiredInputs: nodeKind.requiredInputs,
        optionalInputs: nodeKind.optionalInputs,
        outputs: nodeKind.outputs,
      },
      source: {
        catalogSection: "nodeKinds",
        catalogId: nodeKind.kind,
      },
    };
  });

  const agentContracts = catalog.agents.map(
    (agent): CapabilityContract => ({
      contractVersion: "capability-contract.v1",
      id: `agent.${agent.agentId}`,
      kind: "agent",
      label: agent.displayName,
      description: agent.description,
      inputSchema: agent.inputSchema,
      outputSchema: agent.outputSchema,
      scopes: agent.visibleDepartmentScopeIds,
      permissions: uniqueStrings([
        ...agent.allowedSkillFolderIds.map((id) => `skill_folder:${id}`),
        ...agent.allowedMemoryFolderIds.map((id) => `memory_folder:${id}`),
        agent.canWrite ? "write" : undefined,
        agent.canAskFollowup ? "ask_followup" : undefined,
        `handoff_input:${agent.handoffProtocol.inputPacketVersion}`,
        `handoff_output:${agent.handoffProtocol.outputPacketVersion}`,
      ]),
      riskLevel: agent.canWrite ? "medium" : "low",
      status: agent.implementationStatus,
      implementationNote: agent.implementationNote,
      mutatesData: agent.canWrite,
      parameterHints: {
        requiredInputs: ["task"],
        optionalInputs: ["departmentScopeId", "context"],
        outputs: ["summary", "risks", "nextStep", "artifacts"],
      },
      source: {
        catalogSection: "agents",
        catalogId: agent.agentId,
      },
    }),
  );

  const callableContracts = catalog.callables.map(
    (callable): CapabilityContract => ({
      contractVersion: "capability-contract.v1",
      id: callable.capabilityId,
      kind: callable.kind,
      label: callable.displayName,
      description: callable.description,
      inputSchema: callable.inputSchema,
      outputSchema: callable.outputSchema,
      scopes: callable.allowedDepartmentScopeIds ?? [],
      permissions: uniqueStrings([
        ...callable.requiredContext.map((context) => `context:${context}`),
        callable.mutatesData ? "mutates_data" : undefined,
        callable.requiresConfirmationDefault ? "confirmation_default" : undefined,
      ]),
      riskLevel: normalizeContractRiskLevel(callable.riskLevel),
      status: callable.implementationStatus,
      implementationNote: callable.implementationNote,
      mutatesData: callable.mutatesData,
      requiresConfirmationDefault: callable.requiresConfirmationDefault,
      source: {
        catalogSection: "callables",
        catalogId: callable.capabilityId,
      },
    }),
  );

  const writableObjectContracts = catalog.writableObjects.map(
    (writableObject): CapabilityContract => {
      const allowedScopeIds = uniqueStrings(
        writableObject.actions.flatMap((action) => action.allowedDepartmentScopeIds),
      );
      const confirmationRequired = writableObject.actions.some(
        (action) => action.confirmationRequired,
      );

      return {
        contractVersion: "capability-contract.v1",
        id: `write_object.${writableObject.objectKind}`,
        kind: "write_object",
        label: writableObject.displayName,
        inputSchema: asJsonSchema({
          type: "object",
          required: ["action", "payload"],
          properties: {
            objectKind: {
              type: "string",
              const: writableObject.objectKind,
            },
            action: {
              type: "string",
              enum: writableObject.actions.map((action) => action.actionName),
            },
            payload: {
              oneOf: writableObject.actions.map((action) => action.inputSchema),
            },
          },
        }),
        outputSchema: asJsonSchema({
          type: "object",
          properties: {
            writeResult: { type: "object" },
            rollbackRef: { type: "string" },
          },
        }),
        scopes: allowedScopeIds,
        permissions: uniqueStrings([
          ...writableObject.actions.map(
            (action) => `write_action:${action.actionName}`,
          ),
          confirmationRequired ? "confirmation_required" : undefined,
          writableObject.actions.some((action) => action.rollbackSupported)
            ? "rollback_supported"
            : undefined,
        ]),
        riskLevel: confirmationRequired ? "high" : "medium",
        status: writableObject.implementationStatus,
        implementationNote: writableObject.implementationNote,
        mutatesData: true,
        requiresConfirmationDefault: confirmationRequired,
        parameterHints: {
          requiredInputs: ["action", "payload"],
          optionalInputs: ["objectKind", "rollbackRef"],
          outputs: ["writeResult", "rollbackRef"],
        },
        source: {
          catalogSection: "writableObjects",
          catalogId: writableObject.objectKind,
        },
      };
    },
  );

  return [
    ...departmentContracts,
    ...scopeContracts,
    ...nodeKindContracts,
    ...agentContracts,
    ...callableContracts,
    ...writableObjectContracts,
  ];
}

export function summarizeCapabilityContracts(contracts: CapabilityContract[]) {
  const countBy = (key: "kind" | "status" | "riskLevel") =>
    contracts.reduce<Record<string, number>>((counts, contract) => {
      const value = contract[key];
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    }, {});

  return {
    total: contracts.length,
    byKind: countBy("kind"),
    byStatus: countBy("status"),
    byRiskLevel: countBy("riskLevel"),
  };
}

export function summarizeWorkProtocolCapabilityCatalog(catalog: CapabilityCatalog) {
  const countByStatus = <T extends { implementationStatus: string }>(items: T[]) =>
    items.reduce<Record<string, number>>((counts, item) => {
      counts[item.implementationStatus] =
        (counts[item.implementationStatus] ?? 0) + 1;
      return counts;
    }, {});

  return {
    departments: catalog.departments.length,
    departmentScopes: catalog.departments.reduce(
      (count, department) => count + department.scopeOptions.length,
      0,
    ),
    agents: catalog.agents.length,
    nodeKinds: catalog.nodeKinds.length,
    callables: catalog.callables.length,
    writableObjects: catalog.writableObjects.length,
    byStatus: {
      departments: countByStatus(catalog.departments),
      agents: countByStatus(catalog.agents),
      nodeKinds: countByStatus(catalog.nodeKinds),
      callables: countByStatus(catalog.callables),
      writableObjects: countByStatus(catalog.writableObjects),
    },
  };
}
