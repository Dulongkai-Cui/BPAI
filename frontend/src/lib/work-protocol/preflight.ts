import { buildCapabilityContracts } from "@/lib/work-protocol/catalog";
import type {
  CapabilityCatalog,
  CapabilityContract,
  CapabilityImplementationStatus,
  CallableCapability,
  DepartmentScopeCapability,
  ProtocolApprovalPolicy,
  ProtocolIssue,
  ProtocolIssueCode,
  ProtocolIssueSeverity,
  ProtocolNodeKind,
  ProtocolReferenceKind,
  ProtocolRiskLevel,
  ProtocolRuntimeMode,
  WritableObjectCapability,
} from "@/lib/work-protocol/types";

export type WorkProtocolPreflightNode = {
  nodeId: string;
  title: string;
  kind: ProtocolNodeKind;
  executorKind: string;
  callableId?: string;
  agentId?: string;
  departmentScopeId?: string;
  writableObjectKind?: ProtocolReferenceKind | string;
  approvalPolicy: ProtocolApprovalPolicy;
  riskLevel: ProtocolRiskLevel;
  adapterId?: string;
  adapterAvailable?: boolean;
  requiredPermissions?: string[];
  mutatesData?: boolean;
  externalCallPlanned?: boolean;
};

export type WorkProtocolRuntimePreflightOptions = {
  runtimeMode?: ProtocolRuntimeMode;
  allowMockCapabilities?: boolean;
  allowPlannedCapabilities?: boolean;
  allowDisabledCapabilities?: boolean;
  requireWriteConfirmation?: boolean;
};

type RequiredPreflightOptions = Required<WorkProtocolRuntimePreflightOptions>;

type CatalogIndexes = {
  scopesById: Map<string, DepartmentScopeCapability & { departmentId: string }>;
  nodeKindsByKind: Map<string, CapabilityCatalog["nodeKinds"][number]>;
  agentsById: Map<string, CapabilityCatalog["agents"][number]>;
  callablesById: Map<string, CallableCapability>;
  writableObjectsByKind: Map<string, WritableObjectCapability>;
  contractsById: Map<string, CapabilityContract>;
};

function normalizeOptions(
  options: WorkProtocolRuntimePreflightOptions | undefined,
): RequiredPreflightOptions {
  const runtimeMode = options?.runtimeMode ?? "plan_only";

  return {
    runtimeMode,
    allowMockCapabilities:
      options?.allowMockCapabilities ?? runtimeMode === "plan_only",
    allowPlannedCapabilities: options?.allowPlannedCapabilities ?? false,
    allowDisabledCapabilities: options?.allowDisabledCapabilities ?? false,
    requireWriteConfirmation: options?.requireWriteConfirmation ?? true,
  };
}

function buildCatalogIndexes(catalog: CapabilityCatalog): CatalogIndexes {
  const scopesById = new Map<
    string,
    DepartmentScopeCapability & { departmentId: string }
  >();

  for (const department of catalog.departments) {
    for (const scope of department.scopeOptions) {
      scopesById.set(scope.scopeId, {
        ...scope,
        departmentId: department.departmentId,
      });
    }
  }

  return {
    scopesById,
    nodeKindsByKind: new Map(
      catalog.nodeKinds.map((nodeKind) => [nodeKind.kind, nodeKind]),
    ),
    agentsById: new Map(catalog.agents.map((agent) => [agent.agentId, agent])),
    callablesById: new Map(
      catalog.callables.map((callable) => [callable.capabilityId, callable]),
    ),
    writableObjectsByKind: new Map(
      catalog.writableObjects.map((writableObject) => [
        writableObject.objectKind,
        writableObject,
      ]),
    ),
    contractsById: new Map(
      buildCapabilityContracts(catalog).map((contract) => [
        contract.id,
        contract,
      ]),
    ),
  };
}

function nodeIssue(params: {
  node: WorkProtocolPreflightNode;
  code: ProtocolIssueCode;
  message: string;
  severity?: ProtocolIssueSeverity;
  suggestion?: string;
  detail?: string;
}): ProtocolIssue {
  return {
    id: [
      "protocol-issue",
      "node",
      params.node.nodeId,
      params.code,
      params.detail,
    ]
      .filter(Boolean)
      .join(":"),
    severity: params.severity ?? "error",
    code: params.code,
    target: { kind: "node", id: params.node.nodeId },
    message: params.message,
    suggestion: params.suggestion,
  };
}

function statusAllowed(
  status: CapabilityImplementationStatus,
  options: RequiredPreflightOptions,
) {
  if (status === "available") {
    return true;
  }

  if (status === "mock") {
    return options.allowMockCapabilities;
  }

  if (status === "planned") {
    return options.allowPlannedCapabilities;
  }

  return options.allowDisabledCapabilities;
}

function statusIssue(params: {
  node: WorkProtocolPreflightNode;
  implementationStatus: CapabilityImplementationStatus;
  capabilityLabel: string;
  options: RequiredPreflightOptions;
  note?: string;
}) {
  if (statusAllowed(params.implementationStatus, params.options)) {
    return null;
  }

  return nodeIssue({
    node: params.node,
    code: "capability_not_available",
    detail: params.capabilityLabel,
    message: `${params.capabilityLabel} 当前状态是 ${params.implementationStatus}，runtime 不允许执行。`,
    suggestion:
      params.note ??
      "请换成 available 能力，或等待该能力完成后重新协议梳理和注册。",
  });
}

function callableKindForNode(kind: ProtocolNodeKind) {
  if (kind === "tool_call") {
    return "tool" as const;
  }

  if (kind === "skill_call") {
    return "skill" as const;
  }

  if (kind === "rag_search") {
    return "rag" as const;
  }

  return null;
}

function riskRank(riskLevel: ProtocolRiskLevel | CapabilityContract["riskLevel"]) {
  if (riskLevel === "critical" || riskLevel === "high") {
    return 3;
  }

  if (riskLevel === "medium") {
    return 2;
  }

  if (riskLevel === "low") {
    return 1;
  }

  return 0;
}

function executionContractId(node: WorkProtocolPreflightNode) {
  if (
    (node.kind === "tool_call" ||
      node.kind === "skill_call" ||
      node.kind === "rag_search") &&
    node.callableId
  ) {
    return node.callableId;
  }

  if (node.kind === "agent_task" && node.agentId) {
    return `agent.${node.agentId}`;
  }

  if (node.kind === "write_object" && node.writableObjectKind) {
    return `write_object.${node.writableObjectKind}`;
  }

  return undefined;
}

function validateContractConsistency(params: {
  node: WorkProtocolPreflightNode;
  indexes: CatalogIndexes;
  options: RequiredPreflightOptions;
}) {
  const { node, indexes, options } = params;
  const issues: ProtocolIssue[] = [];
  const nodeKindContract = indexes.contractsById.get(`node_kind.${node.kind}`);
  const executionId = executionContractId(node);
  const executionContract = executionId
    ? indexes.contractsById.get(executionId)
    : undefined;
  const scopeContract = node.departmentScopeId
    ? indexes.contractsById.get(`department_scope.${node.departmentScopeId}`)
    : undefined;

  if (!nodeKindContract) {
    issues.push(
      nodeIssue({
        node,
        code: "capability_catalog_stale",
        detail: `node_kind.${node.kind}`,
        message: `${node.title || node.kind} 缺少节点类型能力契约，runtime 不能确认参数代码是否仍然有效。`,
        suggestion: "请重新协议梳理并确认能力目录没有被旧版本覆盖。",
      }),
    );
  }

  if (executionId && !executionContract) {
    issues.push(
      nodeIssue({
        node,
        code: "capability_catalog_stale",
        detail: executionId,
        message: `${node.title || node.kind} 缺少执行能力契约 ${executionId}，runtime 不能确认执行边界。`,
        suggestion: "请重新协议梳理，或确认该 Tool / Skill / RAG / AI员工 / 写入对象仍在能力目录里。",
      }),
    );
  }

  if (
    node.departmentScopeId &&
    !scopeContract &&
    indexes.scopesById.has(node.departmentScopeId)
  ) {
    issues.push(
      nodeIssue({
        node,
        code: "capability_catalog_stale",
        detail: `department_scope.${node.departmentScopeId}`,
        message: `${node.title || node.kind} 缺少部门范围能力契约 ${node.departmentScopeId}。`,
        suggestion: "请重新协议梳理，让部门范围参数和能力契约重新对齐。",
      }),
    );
  }

  if (
    executionContract &&
    node.departmentScopeId &&
    executionContract.scopes.length > 0 &&
    !executionContract.scopes.includes(node.departmentScopeId)
  ) {
    issues.push(
      nodeIssue({
        node,
        code: "permission_denied",
        detail: `${executionContract.id}:${node.departmentScopeId}`,
        message: `${executionContract.label} 的能力契约不允许在范围 ${node.departmentScopeId} 内执行。`,
        suggestion: "请切换到该能力允许的部门范围，或重新选择该范围内可用的能力。",
      }),
    );
  }

  if (
    executionContract &&
    riskRank(node.riskLevel) < riskRank(executionContract.riskLevel)
  ) {
    issues.push(
      nodeIssue({
        node,
        code: "field_flow_mismatch",
        detail: `${executionContract.id}:risk`,
        message: `${node.title || node.kind} 的参数代码风险等级是 ${node.riskLevel}，低于能力契约要求的 ${executionContract.riskLevel}。`,
        suggestion: "请重新协议梳理，避免旧参数代码把高风险能力降级执行。",
      }),
    );
  }

  if (
    nodeKindContract?.approvalPolicy === "required" &&
    node.approvalPolicy !== "required"
  ) {
    issues.push(
      nodeIssue({
        node,
        code: "approval_required",
        detail: `${nodeKindContract.id}:approval`,
        message: `${nodeKindContract.label} 的节点类型契约要求人工确认，但参数代码没有声明 required approval。`,
        suggestion: "请重新协议梳理，或在该节点前补充人工确认。",
      }),
    );
  }

  if (
    options.requireWriteConfirmation &&
    executionContract?.requiresConfirmationDefault &&
    node.approvalPolicy !== "required"
  ) {
    issues.push(
      nodeIssue({
        node,
        code: "approval_required",
        detail: `${executionContract.id}:approval`,
        message: `${executionContract.label} 的能力契约要求默认人工确认，但参数代码没有声明 required approval。`,
        suggestion: "请重新协议梳理，或在该节点前补充人工确认。",
      }),
    );
  }

  return issues;
}

function validateCallableNode(params: {
  node: WorkProtocolPreflightNode;
  scope: (DepartmentScopeCapability & { departmentId: string }) | null;
  indexes: CatalogIndexes;
  options: RequiredPreflightOptions;
}) {
  const { node, scope, indexes, options } = params;
  const issues: ProtocolIssue[] = [];
  const expectedKind = callableKindForNode(node.kind);

  if (!node.callableId) {
    return [
      nodeIssue({
        node,
        code: "missing_required_text",
        message: `${node.title || node.kind} 节点缺少 callableId，不能进入 runtime。`,
        suggestion: "请重新协议梳理，把该节点绑定到明确的 Tool、Skill 或 RAG 能力。",
      }),
    ];
  }

  const callable = indexes.callablesById.get(node.callableId);

  if (!callable) {
    return [
      nodeIssue({
        node,
        code: "unknown_callable",
        message: `runtime 找不到可调用能力：${node.callableId}。`,
        suggestion: "请重新打开 AI生产资料仓或 Tool Registry，确认该能力仍然存在。",
      }),
    ];
  }

  if (expectedKind && callable.kind !== expectedKind) {
    issues.push(
      nodeIssue({
        node,
        code: "field_flow_mismatch",
        detail: callable.capabilityId,
        message: `${node.title || node.kind} 节点类型和能力类型不匹配：节点是 ${node.kind}，能力是 ${callable.kind}。`,
        suggestion: "请换成同类型能力，或重新协议梳理。",
      }),
    );
  }

  const capabilityIssue = statusIssue({
    node,
    implementationStatus: callable.implementationStatus,
    capabilityLabel: `能力 ${callable.displayName}`,
    note: callable.implementationNote,
    options,
  });

  if (capabilityIssue) {
    issues.push(capabilityIssue);
  }

  if (
    callable.allowedDepartmentScopeIds &&
    callable.allowedDepartmentScopeIds.length > 0
  ) {
    if (!scope) {
      issues.push(
        nodeIssue({
          node,
          code: "unknown_department_scope",
          detail: callable.capabilityId,
          message: `能力 ${callable.displayName} 要求部门范围，但节点没有可复核的 departmentScopeId。`,
          suggestion: "请把节点放进部门方块，或重新协议梳理生成部门范围参数。",
        }),
      );
    } else if (!callable.allowedDepartmentScopeIds.includes(scope.scopeId)) {
      issues.push(
        nodeIssue({
          node,
          code: "permission_denied",
          detail: callable.capabilityId,
          message: `能力 ${callable.displayName} 不允许在范围 ${scope.label} 内执行。`,
          suggestion: "请换一个部门范围，或选择该范围允许的能力。",
        }),
      );
    }
  }

  return issues;
}

function validateAgentNode(params: {
  node: WorkProtocolPreflightNode;
  scope: (DepartmentScopeCapability & { departmentId: string }) | null;
  indexes: CatalogIndexes;
  options: RequiredPreflightOptions;
}) {
  const { node, scope, indexes, options } = params;
  const issues: ProtocolIssue[] = [];

  if (!node.agentId) {
    return [
      nodeIssue({
        node,
        code: "missing_required_text",
        message: `${node.title || node.kind} 节点缺少 agentId，不能下发给 AI员工。`,
        suggestion: "请从部门可见 AI员工中重新选择。",
      }),
    ];
  }

  const agent = indexes.agentsById.get(node.agentId);

  if (!agent) {
    return [
      nodeIssue({
        node,
        code: "unknown_agent",
        message: `runtime 找不到 AI员工：${node.agentId}。`,
        suggestion: "请确认该 AI员工没有被删除，或重新协议梳理。",
      }),
    ];
  }

  const agentIssue = statusIssue({
    node,
    implementationStatus: agent.implementationStatus,
    capabilityLabel: `AI员工 ${agent.displayName}`,
    note: agent.implementationNote,
    options,
  });

  if (agentIssue) {
    issues.push(agentIssue);
  }

  if (!scope) {
    issues.push(
      nodeIssue({
        node,
        code: "unknown_department_scope",
        detail: agent.agentId,
        message: `AI员工 ${agent.displayName} 没有关联部门范围。`,
        suggestion: "请把该 AI员工节点放进部门方块，或重新协议梳理。",
      }),
    );
    return issues;
  }

  if (!scope.visibleAgentIds.includes(agent.agentId)) {
    issues.push(
      nodeIssue({
        node,
        code: "permission_denied",
        detail: `${agent.agentId}:scope`,
        message: `AI员工 ${agent.displayName} 不在范围 ${scope.label} 的可见列表里。`,
        suggestion: "请换一个 AI员工，或在部门范围里开放它。",
      }),
    );
  }

  if (!agent.visibleDepartmentScopeIds.includes(scope.scopeId)) {
    issues.push(
      nodeIssue({
        node,
        code: "permission_denied",
        detail: `${agent.agentId}:agent`,
        message: `AI员工 ${agent.displayName} 的能力目录未声明可访问 ${scope.label}。`,
        suggestion: "请先在 AI员工配置里开放该范围。",
      }),
    );
  }

  return issues;
}

function validateWriteNode(params: {
  node: WorkProtocolPreflightNode;
  scope: (DepartmentScopeCapability & { departmentId: string }) | null;
  indexes: CatalogIndexes;
  options: RequiredPreflightOptions;
}) {
  const { node, scope, indexes, options } = params;
  const issues: ProtocolIssue[] = [];
  const writableObjectKind = node.writableObjectKind;

  if (!writableObjectKind) {
    return [
      nodeIssue({
        node,
        code: "missing_required_text",
        message: `${node.title || node.kind} 节点缺少写入对象，不能进入 runtime。`,
        suggestion: "请指定要写入的业务对象，例如工单、文档或执行结果。",
      }),
    ];
  }

  const writableObject = indexes.writableObjectsByKind.get(
    writableObjectKind as ProtocolReferenceKind,
  );

  if (!writableObject) {
    return [
      nodeIssue({
        node,
        code: "unknown_writable_object",
        message: `runtime 找不到写入对象：${writableObjectKind}。`,
        suggestion: "请从能力目录里的写入对象中重新选择。",
      }),
    ];
  }

  const writableIssue = statusIssue({
    node,
    implementationStatus: writableObject.implementationStatus,
    capabilityLabel: `写入对象 ${writableObject.displayName}`,
    note: writableObject.implementationNote,
    options,
  });

  if (writableIssue) {
    issues.push(writableIssue);
  }

  if (!scope) {
    issues.push(
      nodeIssue({
        node,
        code: "unknown_department_scope",
        detail: String(writableObjectKind),
        message: `写入对象 ${writableObject.displayName} 要求部门范围，但节点没有可复核的 departmentScopeId。`,
        suggestion: "请把写入节点放进部门方块，或重新协议梳理生成部门范围参数。",
      }),
    );
    return issues;
  }

  const allowedActions = writableObject.actions.filter((action) =>
    action.allowedDepartmentScopeIds.includes(scope.scopeId),
  );

  if (allowedActions.length === 0) {
    issues.push(
      nodeIssue({
        node,
        code: "permission_denied",
        detail: String(writableObjectKind),
        message: `写入对象 ${writableObject.displayName} 不允许在范围 ${scope.label} 内写入。`,
        suggestion: "请换一个部门范围，或换成该范围允许写入的对象。",
      }),
    );
  }

  if (
    options.requireWriteConfirmation &&
    allowedActions.some((action) => action.confirmationRequired) &&
    node.approvalPolicy !== "required"
  ) {
    issues.push(
      nodeIssue({
        node,
        code: "approval_required",
        detail: String(writableObjectKind),
        message: `写入对象 ${writableObject.displayName} 需要人工确认保护。`,
        suggestion: "请在写入节点前加入人工确认，或让协议梳理自动补上。",
      }),
    );
  }

  return issues;
}

const DEPARTMENT_SCOPED_ADAPTER_PERMISSIONS = new Set([
  "tool:execute",
  "skill:run",
  "rag:read",
  "agent:delegate",
  "object:write",
]);

function validateAdapterBoundary(params: {
  node: WorkProtocolPreflightNode;
  scope: (DepartmentScopeCapability & { departmentId: string }) | null;
  indexes: CatalogIndexes;
}) {
  const { node, scope, indexes } = params;
  const issues: ProtocolIssue[] = [];
  const requiredPermissions = [...new Set(node.requiredPermissions ?? [])];
  let reportedMissingScope = false;

  const requireScope = (permission: string) => {
    if (scope) {
      return false;
    }

    if (!reportedMissingScope) {
      issues.push(
        nodeIssue({
          node,
          code: "unknown_department_scope",
          detail: `adapter:${permission}`,
          message: `${node.title || node.kind} 计划使用 ${permission} 权限，但没有可校验的部门范围。`,
          suggestion:
            "请把该节点放进部门方块，或重新协议梳理生成 departmentScopeId。",
        }),
      );
      reportedMissingScope = true;
    }

    return true;
  };

  if (node.adapterAvailable === false) {
    issues.push(
      nodeIssue({
        node,
        code: "executor_not_available",
        detail: node.adapterId ?? node.executorKind,
        message: `${node.title || node.kind} 没有可用的执行适配器，runtime 不能继续执行。`,
        suggestion: "请重新协议梳理，或先补齐该节点类型的执行适配器。",
      }),
    );
  }

  if (
    node.externalCallPlanned &&
    requiredPermissions.some((permission) =>
      DEPARTMENT_SCOPED_ADAPTER_PERMISSIONS.has(permission),
    )
  ) {
    requireScope("external-call");
  }

  if (node.mutatesData && node.approvalPolicy !== "required") {
    issues.push(
      nodeIssue({
        node,
        code: "approval_required",
        detail: `adapter:${node.adapterId ?? node.executorKind}:mutates`,
        message: `${node.title || node.kind} 的执行适配器声明会改动业务数据，但节点没有 required approval。`,
        suggestion:
          "请重新协议梳理，或在该节点前补充人工确认再允许写入。",
      }),
    );
  }

  for (const permission of requiredPermissions) {
    if (
      !DEPARTMENT_SCOPED_ADAPTER_PERMISSIONS.has(permission) &&
      permission !== "human:confirm"
    ) {
      issues.push(
        nodeIssue({
          node,
          code: "capability_catalog_stale",
          detail: `adapter-permission:${permission}`,
          message: `${node.title || node.kind} 声明了 runtime 无法识别的适配器权限：${permission}。`,
          suggestion: "请先把该权限登记进能力目录，再重新协议梳理。",
        }),
      );
      continue;
    }

    if (permission === "tool:execute") {
      if (requireScope(permission) || !node.callableId) {
        continue;
      }

      if (!scope?.allowedToolIds.includes(node.callableId)) {
        issues.push(
          nodeIssue({
            node,
            code: "permission_denied",
            detail: `adapter-tool:${node.callableId}`,
            message: `${node.title || node.kind} 想调用 ${node.callableId}，但当前部门范围没有开放这个 Tool。`,
            suggestion: "请切换到允许该 Tool 的部门范围，或重新选择该范围可用的 Tool。",
          }),
        );
      }

      continue;
    }

    if (permission === "skill:run") {
      if (requireScope(permission) || !node.callableId) {
        continue;
      }

      const callable = indexes.callablesById.get(node.callableId);
      const requiredSkillFolderId = callable?.requiredSkillFolderId;

      if (
        requiredSkillFolderId &&
        !scope?.allowedSkillFolderIds.includes(requiredSkillFolderId)
      ) {
        issues.push(
          nodeIssue({
            node,
            code: "permission_denied",
            detail: `adapter-skill-folder:${requiredSkillFolderId}`,
            message: `${node.title || node.kind} 想运行的 Skill 包不在当前部门范围开放的文件夹内。`,
            suggestion:
              "请在 AI 员工或部门范围里开放该 Skill 文件夹，或选择当前范围可见的 Skill。",
          }),
        );
      } else if (!requiredSkillFolderId && scope?.allowedSkillFolderIds.length === 0) {
        issues.push(
          nodeIssue({
            node,
            code: "permission_denied",
            detail: `adapter-skill:${node.callableId}`,
            message: `${node.title || node.kind} 想运行 Skill，但当前部门范围没有开放任何 Skill 文件夹。`,
            suggestion: "请先给该部门范围开放 Skill 文件夹，再重新协议梳理。",
          }),
        );
      }

      continue;
    }

    if (permission === "rag:read") {
      if (requireScope(permission)) {
        continue;
      }

      if (!scope || scope.readableObjectTypes.length === 0) {
        issues.push(
          nodeIssue({
            node,
            code: "permission_denied",
            detail: "adapter-rag:readable-scope",
            message: `${node.title || node.kind} 想检索知识或资料，但当前部门范围没有可读资源类型。`,
            suggestion: "请切换到有可读资源的范围，或先配置 RAG 数据源范围。",
          }),
        );
      }

      continue;
    }

    if (permission === "agent:delegate") {
      if (requireScope(permission) || !node.agentId) {
        continue;
      }

      if (!scope?.visibleAgentIds.includes(node.agentId)) {
        issues.push(
          nodeIssue({
            node,
            code: "permission_denied",
            detail: `adapter-agent:${node.agentId}`,
            message: `${node.title || node.kind} 想下发给 ${node.agentId}，但当前部门范围不可见这名 AI 员工。`,
            suggestion:
              "请把该 AI 员工放进这个部门范围的可见列表，或换用当前范围可见的 AI 员工。",
          }),
        );
      }

      continue;
    }

    if (permission === "object:write") {
      if (requireScope(permission) || !node.writableObjectKind) {
        continue;
      }

      if (
        !scope?.writableObjectTypes.includes(
          node.writableObjectKind as ProtocolReferenceKind,
        )
      ) {
        issues.push(
          nodeIssue({
            node,
            code: "permission_denied",
            detail: `adapter-write:${node.writableObjectKind}`,
            message: `${node.title || node.kind} 想写入 ${node.writableObjectKind}，但当前部门范围没有开放该写入对象。`,
            suggestion: "请切换到可写范围，或把该写入改成仅生成草稿/汇报出口。",
          }),
        );
      }
    }
  }

  return issues;
}

export function preflightWorkProtocolNode(params: {
  node: WorkProtocolPreflightNode;
  catalog: CapabilityCatalog;
  options?: WorkProtocolRuntimePreflightOptions;
}) {
  const { node, catalog } = params;
  const options = normalizeOptions(params.options);
  const indexes = buildCatalogIndexes(catalog);
  const issues: ProtocolIssue[] = [];
  const nodeKind = indexes.nodeKindsByKind.get(node.kind);
  const scope = node.departmentScopeId
    ? indexes.scopesById.get(node.departmentScopeId) ?? null
    : null;

  if (!nodeKind) {
    issues.push(
      nodeIssue({
        node,
        code: "unknown_node_kind",
        message: `runtime 找不到节点类型：${node.kind}。`,
        suggestion: "请重新协议梳理，确保节点类型来自能力目录。",
      }),
    );
  } else {
    const nodeKindIssue = statusIssue({
      node,
      implementationStatus: nodeKind.implementationStatus,
      capabilityLabel: `节点类型 ${nodeKind.displayName}`,
      note: nodeKind.implementationNote,
      options,
    });

    if (nodeKindIssue) {
      issues.push(nodeKindIssue);
    }

    if (node.executorKind !== nodeKind.executorKind) {
      issues.push(
        nodeIssue({
          node,
          code: "field_flow_mismatch",
          detail: "executorKind",
          message: `${node.title || node.kind} 的 executorKind 是 ${node.executorKind}，但能力目录要求 ${nodeKind.executorKind}。`,
          suggestion: "请重新协议梳理，避免旧参数代码继续进入 runtime。",
        }),
      );
    }
  }

  if (node.departmentScopeId && !scope) {
    issues.push(
      nodeIssue({
        node,
        code: "unknown_department_scope",
        detail: node.departmentScopeId,
        message: `runtime 找不到部门范围：${node.departmentScopeId}。`,
        suggestion: "请重新选择部门范围，或重新协议梳理。",
      }),
    );
  }

  issues.push(...validateAdapterBoundary({ node, scope, indexes }));

  if (
    node.kind === "tool_call" ||
    node.kind === "skill_call" ||
    node.kind === "rag_search"
  ) {
    issues.push(...validateCallableNode({ node, scope, indexes, options }));
  }

  if (node.kind === "agent_task") {
    issues.push(...validateAgentNode({ node, scope, indexes, options }));
  }

  if (node.kind === "write_object") {
    issues.push(...validateWriteNode({ node, scope, indexes, options }));
  }

  issues.push(...validateContractConsistency({ node, indexes, options }));

  return issues;
}
