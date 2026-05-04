import type {
  AgentCapability,
  CallableCapability,
  CapabilityCatalog,
  CapabilityImplementationStatus,
  CanvasDepartmentDraft,
  CanvasEdgeDraft,
  CanvasNodeDraft,
  DepartmentCapability,
  DepartmentScopeCapability,
  NodeKindCapability,
  ProtocolIssue,
  ProtocolIssueCode,
  ProtocolIssueSeverity,
  ProtocolIssueTarget,
  WritableObjectCapability,
  WorkProtocolDraft,
} from "@/lib/work-protocol/types";

export type WorkProtocolValidationMode = "draft" | "register" | "runtime";

export type WorkProtocolValidationOptions = {
  mode?: WorkProtocolValidationMode;
  allowMockCapabilities?: boolean;
  allowPlannedCapabilities?: boolean;
  allowDisabledCapabilities?: boolean;
};

export type WorkProtocolValidationSummary = {
  errors: number;
  warnings: number;
  info: number;
  nodes: number;
  edges: number;
  departments: number;
  canRegister: boolean;
};

export type WorkProtocolValidationResult = {
  valid: boolean;
  canRegister: boolean;
  issues: ProtocolIssue[];
  summary: WorkProtocolValidationSummary;
};

type CatalogIndexes = {
  departmentsById: Map<string, DepartmentCapability>;
  scopesById: Map<string, DepartmentScopeCapability & { departmentId: string }>;
  nodeKindsByKind: Map<string, NodeKindCapability>;
  agentsById: Map<string, AgentCapability>;
  callablesById: Map<string, CallableCapability>;
  writableObjectsByKind: Map<string, WritableObjectCapability>;
};

function trim(value: string | undefined) {
  return value?.trim() ?? "";
}

function issue(params: {
  code: ProtocolIssueCode;
  target: ProtocolIssueTarget;
  message: string;
  severity?: ProtocolIssueSeverity;
  suggestion?: string;
}): ProtocolIssue {
  return {
    id: [
      "protocol-issue",
      params.target.kind,
      params.target.id ?? "root",
      params.code,
    ].join(":"),
    severity: params.severity ?? "error",
    code: params.code,
    target: params.target,
    message: params.message,
    suggestion: params.suggestion,
  };
}

function registerBlockingSeverity(
  options: Required<WorkProtocolValidationOptions>,
): ProtocolIssueSeverity {
  return options.mode === "draft" ? "warning" : "error";
}

function normalizeOptions(
  options: WorkProtocolValidationOptions | undefined,
): Required<WorkProtocolValidationOptions> {
  const mode = options?.mode ?? "draft";

  return {
    mode,
    allowMockCapabilities: options?.allowMockCapabilities ?? mode !== "register",
    allowPlannedCapabilities: options?.allowPlannedCapabilities ?? false,
    allowDisabledCapabilities: options?.allowDisabledCapabilities ?? false,
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
    departmentsById: new Map(
      catalog.departments.map((department) => [
        department.departmentId,
        department,
      ]),
    ),
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
  };
}

function checkUniqueIds<T>(
  items: T[],
  getId: (item: T) => string,
  targetKind: ProtocolIssueTarget["kind"],
  label: string,
) {
  const seen = new Set<string>();
  const issues: ProtocolIssue[] = [];

  for (const item of items) {
    const id = getId(item);

    if (!id) {
      issues.push(
        issue({
          code: "missing_required_text",
          target: { kind: targetKind },
          message: `${label}缺少 id。`,
          suggestion: "请重新生成或保存该对象。",
        }),
      );
      continue;
    }

    if (seen.has(id)) {
      issues.push(
        issue({
          code: "duplicate_id",
          target: { kind: targetKind, id },
          message: `${label} id 重复：${id}。`,
          suggestion: "请删除重复对象，或给其中一个对象重新生成 id。",
        }),
      );
    }

    seen.add(id);
  }

  return issues;
}

function statusIssue(params: {
  implementationStatus: CapabilityImplementationStatus;
  target: ProtocolIssueTarget;
  capabilityLabel: string;
  note?: string;
  options: Required<WorkProtocolValidationOptions>;
}): ProtocolIssue | null {
  const { implementationStatus, target, capabilityLabel, note, options } = params;

  if (implementationStatus === "available") {
    return null;
  }

  if (implementationStatus === "disabled" && !options.allowDisabledCapabilities) {
    return issue({
      code: "capability_not_available",
      target,
      message: `${capabilityLabel} 当前已停用，不能用于协议。`,
      suggestion: note || "请换用可用能力，或先恢复该能力。",
    });
  }

  if (implementationStatus === "planned" && !options.allowPlannedCapabilities) {
    return issue({
      code: "capability_not_available",
      target,
      severity: options.mode === "draft" ? "warning" : "error",
      message:
        options.mode === "draft"
          ? `${capabilityLabel} 目前只是规划能力，后续注册上线前会被拦截。`
          : `${capabilityLabel} 目前只是规划能力，不能注册为可执行协议。`,
      suggestion: note || "请先实现该能力，或替换成 available/mock 能力做测试协议。",
    });
  }

  if (implementationStatus === "mock" && !options.allowMockCapabilities) {
    return issue({
      code: "capability_not_available",
      target,
      message: `${capabilityLabel} 目前只是 mock 能力，不能注册为正式启用协议。`,
      suggestion: note || "请先接入真实执行器，或把协议注册为测试/dry-run 协议。",
    });
  }

  if (implementationStatus === "mock") {
    return issue({
      code: "capability_not_available",
      target,
      severity: "warning",
      message: `${capabilityLabel} 目前是 mock 能力，只适合 dry-run 或测试协议。`,
      suggestion: note || "正式启用前需要接入真实执行器。",
    });
  }

  return null;
}

function validateDepartments(params: {
  draft: WorkProtocolDraft;
  indexes: CatalogIndexes;
  options: Required<WorkProtocolValidationOptions>;
}) {
  const { draft, indexes, options } = params;
  const issues: ProtocolIssue[] = [];

  issues.push(
    ...checkUniqueIds(
      draft.departments,
      (department) => department.id,
      "department",
      "部门草稿",
    ),
  );

  for (const departmentDraft of draft.departments) {
    const department = indexes.departmentsById.get(departmentDraft.departmentId);

    if (!department) {
      issues.push(
        issue({
          code: "unknown_department_scope",
          target: { kind: "department", id: departmentDraft.id },
          message: `找不到大部门：${departmentDraft.departmentLabel || departmentDraft.departmentId}。`,
          suggestion: "请从现有大部门里重新选择，或先把这个部门注册到能力目录。",
        }),
      );
      continue;
    }

    const departmentIssue = statusIssue({
      implementationStatus: department.implementationStatus,
      target: { kind: "department", id: departmentDraft.id },
      capabilityLabel: `部门 ${department.label}`,
      note: department.implementationNote,
      options,
    });

    if (departmentIssue) {
      issues.push(departmentIssue);
    }

    const scope = department.scopeOptions.find(
      (item) => item.scopeId === departmentDraft.primaryScopeId,
    );

    if (!scope) {
      issues.push(
        issue({
          code: "unknown_department_scope",
          target: { kind: "department", id: departmentDraft.id },
          message: `部门 ${department.label} 下找不到具体范围：${departmentDraft.primaryScopeLabel || departmentDraft.primaryScopeId}。`,
          suggestion: "请重新选择该部门下已有的具体范围。",
        }),
      );
      continue;
    }

    for (const agentId of departmentDraft.visibleAgentIds) {
      if (!indexes.agentsById.has(agentId)) {
        issues.push(
          issue({
            code: "unknown_agent",
            target: { kind: "department", id: departmentDraft.id },
            message: `部门里引用了不存在的 AI员工：${agentId}。`,
            suggestion: "请删除该 AI员工，或先在 AI员工目录中注册它。",
          }),
        );
        continue;
      }

      if (!scope.visibleAgentIds.includes(agentId)) {
        issues.push(
          issue({
            code: "permission_denied",
            target: { kind: "department", id: departmentDraft.id },
            message: `AI员工 ${agentId} 不在范围 ${scope.label} 的可见列表里。`,
            suggestion: "请换一个具体范围，或在 AI员工配置里开放该范围。",
          }),
        );
      }
    }
  }

  return issues;
}

function getDepartmentScopeForNode(
  node: CanvasNodeDraft,
  departmentsByDraftId: Map<string, CanvasDepartmentDraft>,
  indexes: CatalogIndexes,
) {
  const compiledScopeId = getStableCompiledNodeSpec(node)?.departmentScopeId;

  if (compiledScopeId) {
    return indexes.scopesById.get(compiledScopeId) ?? null;
  }

  if (!node.departmentDraftId) {
    return null;
  }

  const departmentDraft = departmentsByDraftId.get(node.departmentDraftId);

  if (!departmentDraft) {
    return null;
  }

  return indexes.scopesById.get(departmentDraft.primaryScopeId) ?? null;
}

function getStableCompiledNodeSpec(node: CanvasNodeDraft) {
  return node.compiledSpec?.nodeId === node.id && node.compiledSpec.kind === node.kind
    ? node.compiledSpec
    : null;
}

function effectiveCallableId(node: CanvasNodeDraft) {
  return trim(getStableCompiledNodeSpec(node)?.callableId) || trim(node.callableId);
}

function effectiveAgentId(node: CanvasNodeDraft) {
  return trim(getStableCompiledNodeSpec(node)?.agentId) || trim(node.agentId);
}

function effectiveWritableObjectKind(node: CanvasNodeDraft) {
  return (
    trim(getStableCompiledNodeSpec(node)?.writableObjectKind) ||
    trim(node.writableObjectKind)
  );
}

function validateCallableNode(params: {
  node: CanvasNodeDraft;
  scope: (DepartmentScopeCapability & { departmentId: string }) | null;
  indexes: CatalogIndexes;
  options: Required<WorkProtocolValidationOptions>;
}) {
  const { node, scope, indexes, options } = params;
  const issues: ProtocolIssue[] = [];
  const callableId = effectiveCallableId(node);

  if (!callableId) {
    issues.push(
      issue({
        code: "missing_required_text",
        target: { kind: "node", id: node.id },
        message: `${node.title || node.kind} 节点缺少 callableId。`,
        suggestion: "协议梳理后应把自然语言要求绑定到一个 Tool、Skill 或 RAG 能力。",
      }),
    );
    return issues;
  }

  const callable = indexes.callablesById.get(callableId);

  if (!callable) {
    issues.push(
      issue({
        code: "unknown_callable",
        target: { kind: "node", id: node.id },
        message: `找不到可调用能力：${callableId}。`,
        suggestion: "请从 AI生产资料仓或 Tool Registry 中选择已有能力。",
      }),
    );
    return issues;
  }

  if (
    (node.kind === "tool_call" && callable.kind !== "tool") ||
    (node.kind === "skill_call" && callable.kind !== "skill") ||
    (node.kind === "rag_search" && callable.kind !== "rag")
  ) {
    issues.push(
      issue({
        code: "field_flow_mismatch",
        target: { kind: "node", id: node.id },
        message: `${node.title || node.kind} 节点类型和能力类型不匹配：节点是 ${node.kind}，能力是 ${callable.kind}。`,
        suggestion: "请换成同类型能力，或换用正确的节点类型。",
      }),
    );
  }

  const callableIssue = statusIssue({
    implementationStatus: callable.implementationStatus,
    target: { kind: "node", id: node.id },
    capabilityLabel: `能力 ${callable.displayName}`,
    note: callable.implementationNote,
    options,
  });

  if (callableIssue) {
    issues.push(callableIssue);
  }

  if (
    !scope &&
    callable.allowedDepartmentScopeIds &&
    callable.allowedDepartmentScopeIds.length > 0
  ) {
    issues.push(
      issue({
        code: "unknown_department_scope",
        target: { kind: "node", id: node.id },
        message: `Capability ${callable.displayName} requires a department scope, but this node has no verifiable departmentScopeId.`,
        suggestion:
          "Put the node into a department block or let protocol grooming generate departmentScopeId.",
      }),
    );
  }

  if (
    scope &&
    callable.allowedDepartmentScopeIds &&
    callable.allowedDepartmentScopeIds.length > 0 &&
    !callable.allowedDepartmentScopeIds.includes(scope.scopeId)
  ) {
    issues.push(
      issue({
        code: "permission_denied",
        target: { kind: "node", id: node.id },
        message: `能力 ${callable.displayName} 不允许在范围 ${scope.label} 内执行。`,
        suggestion: "请换一个部门范围，或选择该范围允许的能力。",
      }),
    );
  }

  return issues;
}

function validateAgentNode(params: {
  node: CanvasNodeDraft;
  scope: (DepartmentScopeCapability & { departmentId: string }) | null;
  indexes: CatalogIndexes;
  options: Required<WorkProtocolValidationOptions>;
}) {
  const { node, scope, indexes, options } = params;
  const issues: ProtocolIssue[] = [];
  const agentId = effectiveAgentId(node);

  if (!agentId) {
    issues.push(
      issue({
        code: "missing_required_text",
        target: { kind: "node", id: node.id },
        message: `${node.title || node.kind} 节点缺少 agentId。`,
        suggestion: "AI员工任务必须绑定到一个部门范围内可见的 AI员工。",
      }),
    );
    return issues;
  }

  const agent = indexes.agentsById.get(agentId);

  if (!agent) {
    issues.push(
      issue({
        code: "unknown_agent",
        target: { kind: "node", id: node.id },
        message: `找不到 AI员工：${agentId}。`,
        suggestion: "请从部门可见 AI员工中重新选择。",
      }),
    );
    return issues;
  }

  const agentIssue = statusIssue({
    implementationStatus: agent.implementationStatus,
    target: { kind: "node", id: node.id },
    capabilityLabel: `AI员工 ${agent.displayName}`,
    note: agent.implementationNote,
    options,
  });

  if (agentIssue) {
    issues.push(agentIssue);
  }

  if (!scope) {
    issues.push(
      issue({
        code: "unknown_department_scope",
        target: { kind: "node", id: node.id },
        message: `AI员工 ${agent.displayName} 没有关联部门范围。`,
        suggestion: "请先把该 AI员工放进某个部门方块里。",
      }),
    );
    return issues;
  }

  if (!scope.visibleAgentIds.includes(agentId)) {
    issues.push(
      issue({
        code: "permission_denied",
        target: { kind: "node", id: node.id },
        message: `AI员工 ${agent.displayName} 不在范围 ${scope.label} 的可见列表里。`,
        suggestion: "请换一个 AI员工，或在部门范围里开放它。",
      }),
    );
  }

  if (!agent.visibleDepartmentScopeIds.includes(scope.scopeId)) {
    issues.push(
      issue({
        code: "permission_denied",
        target: { kind: "node", id: node.id },
        message: `AI员工 ${agent.displayName} 的能力目录未声明可访问 ${scope.label}。`,
        suggestion: "请先在 AI员工配置里开放该范围。",
      }),
    );
  }

  return issues;
}

function validateWriteNode(params: {
  node: CanvasNodeDraft;
  draft: WorkProtocolDraft;
  scope: (DepartmentScopeCapability & { departmentId: string }) | null;
  indexes: CatalogIndexes;
  options: Required<WorkProtocolValidationOptions>;
}) {
  const { node, scope, indexes, options } = params;
  const issues: ProtocolIssue[] = [];
  const objectKind = effectiveWritableObjectKind(node);

  if (!objectKind) {
    issues.push(
      issue({
        code: "missing_required_text",
        target: { kind: "node", id: node.id },
        message: `${node.title || node.kind} 节点缺少写入对象。`,
        suggestion: "请指定要写入的业务对象，例如工单、文档或执行结果。",
      }),
    );
    return issues;
  }

  const writableObject = indexes.writableObjectsByKind.get(objectKind);

  if (!writableObject) {
    issues.push(
      issue({
        code: "unknown_writable_object",
        target: { kind: "node", id: node.id },
        message: `找不到写入对象：${objectKind}。`,
        suggestion: "请从能力目录里的写入对象中选择。",
      }),
    );
    return issues;
  }

  const writableIssue = statusIssue({
    implementationStatus: writableObject.implementationStatus,
    target: { kind: "node", id: node.id },
    capabilityLabel: `写入对象 ${writableObject.displayName}`,
    note: writableObject.implementationNote,
    options,
  });

  if (writableIssue) {
    issues.push(writableIssue);
  }

  if (
    scope &&
    !writableObject.actions.some((action) =>
      action.allowedDepartmentScopeIds.includes(scope.scopeId),
    )
  ) {
    issues.push(
      issue({
        code: "permission_denied",
        target: { kind: "node", id: node.id },
        message: `写入对象 ${writableObject.displayName} 不允许在范围 ${scope.label} 内写入。`,
        suggestion: "请换一个部门范围，或换成该范围允许写入的对象。",
      }),
    );
  }

  if (
    writableObject.actions.some((action) => action.confirmationRequired) &&
    !hasHumanConfirmUpstream(node.id, params.draft)
  ) {
    issues.push(
      issue({
        code: "approval_required",
        target: { kind: "node", id: node.id },
        severity: "warning",
        message: `写入对象 ${writableObject.displayName} 需要人工确认节点保护。`,
        suggestion: "请在写入节点前加入人工确认，或让协议梳理自动补上。",
      }),
    );
  }

  return issues;
}

function validateCompiledNodeSpec(params: {
  node: CanvasNodeDraft;
  nodeKind: NodeKindCapability;
  indexes: CatalogIndexes;
  nodeIds: Set<string>;
  options: Required<WorkProtocolValidationOptions>;
}) {
  const { node, nodeKind, indexes, nodeIds, options } = params;
  const spec = node.compiledSpec;
  const issues: ProtocolIssue[] = [];

  if (!spec) {
    return issues;
  }

  const details: string[] = [];
  const validFailurePolicyModes = new Set([
    "fail_protocol",
    "skip_node",
    "route_to_node",
    "return_to_bp_ask",
  ]);

  if (spec.nodeId !== node.id) {
    details.push(`compiledSpec.nodeId must match node id ${node.id}`);
  }

  if (spec.kind !== node.kind) {
    details.push(`compiledSpec.kind must match node kind ${node.kind}`);
  }

  if (spec.executorKind !== nodeKind.executorKind) {
    details.push(
      `compiledSpec.executorKind must be ${nodeKind.executorKind} for ${node.kind}`,
    );
  }

  if (spec.departmentScopeId && !indexes.scopesById.has(spec.departmentScopeId)) {
    details.push(`unknown departmentScopeId ${spec.departmentScopeId}`);
  }

  if (spec.callableId && !indexes.callablesById.has(spec.callableId)) {
    details.push(`unknown callableId ${spec.callableId}`);
  }

  if (spec.agentId && !indexes.agentsById.has(spec.agentId)) {
    details.push(`unknown agentId ${spec.agentId}`);
  }

  if (
    spec.writableObjectKind &&
    !indexes.writableObjectsByKind.has(spec.writableObjectKind)
  ) {
    details.push(`unknown writableObjectKind ${spec.writableObjectKind}`);
  }

  if (!Array.isArray(spec.inputBindings)) {
    details.push("compiledSpec.inputBindings must be an array");
  } else if (spec.inputBindings.some((binding) => !trim(binding.name))) {
    details.push("compiledSpec.inputBindings cannot contain empty names");
  }

  if (!Array.isArray(spec.outputFields)) {
    details.push("compiledSpec.outputFields must be an array");
  } else if (
    spec.outputFields.some((field) => !trim(field.name) || !trim(field.jsonPath))
  ) {
    details.push("compiledSpec.outputFields require name and jsonPath");
  }

  if (!validFailurePolicyModes.has(spec.failurePolicy.mode)) {
    details.push(`invalid failurePolicy.mode ${String(spec.failurePolicy.mode)}`);
  }

  if (
    spec.failurePolicy.mode === "route_to_node" &&
    (!spec.failurePolicy.targetNodeId || !nodeIds.has(spec.failurePolicy.targetNodeId))
  ) {
    details.push("route_to_node failurePolicy requires an existing targetNodeId");
  }

  if (details.length > 0) {
    issues.push(
      issue({
        code: "field_flow_mismatch",
        target: { kind: "node", id: node.id },
        severity: registerBlockingSeverity(options),
        message: `Node ${node.id} has invalid parameter code: ${details.join("; ")}.`,
        suggestion:
          "Run protocol grooming again or edit the node parameter code before registration.",
      }),
    );
  }

  return issues;
}

function hasHumanConfirmUpstream(
  nodeId: string,
  draft: WorkProtocolDraft,
) {
  const nodesById = new Map(draft.nodes.map((node) => [node.id, node]));
  const incomingByTarget = new Map<string, CanvasEdgeDraft[]>();
  const visited = new Set<string>();
  const stack = [nodeId];

  for (const edge of draft.edges) {
    incomingByTarget.set(edge.targetNodeId, [
      ...(incomingByTarget.get(edge.targetNodeId) ?? []),
      edge,
    ]);
  }

  while (stack.length > 0) {
    const currentNodeId = stack.pop();

    if (!currentNodeId || visited.has(currentNodeId)) {
      continue;
    }

    visited.add(currentNodeId);

    for (const edge of incomingByTarget.get(currentNodeId) ?? []) {
      const upstreamNode = nodesById.get(edge.sourceNodeId);

      if (!upstreamNode) {
        continue;
      }

      if (upstreamNode.kind === "human_confirm") {
        return true;
      }

      stack.push(upstreamNode.id);
    }
  }

  return false;
}

function incomingEdgesForNode(draft: WorkProtocolDraft, nodeId: string) {
  return draft.edges.filter((edge) => edge.targetNodeId === nodeId);
}

function outgoingEdgesForNode(draft: WorkProtocolDraft, nodeId: string) {
  return draft.edges.filter((edge) => edge.sourceNodeId === nodeId);
}

function validateNodes(params: {
  draft: WorkProtocolDraft;
  indexes: CatalogIndexes;
  options: Required<WorkProtocolValidationOptions>;
}) {
  const { draft, indexes, options } = params;
  const issues: ProtocolIssue[] = [];
  const departmentsByDraftId = new Map(
    draft.departments.map((department) => [department.id, department]),
  );
  const nodeIds = new Set(draft.nodes.map((node) => node.id));

  issues.push(
    ...checkUniqueIds(draft.nodes, (node) => node.id, "node", "节点"),
  );

  for (const node of draft.nodes) {
    if (!trim(node.title)) {
      issues.push(
        issue({
          code: "missing_required_text",
          target: { kind: "node", id: node.id },
          message: "节点缺少标题。",
          suggestion: "请给节点补一个清晰标题。",
        }),
      );
    }

    if (!trim(node.userIntent)) {
      issues.push(
        issue({
          code: "missing_required_text",
          target: { kind: "node", id: node.id },
          message: `${node.title || node.kind} 缺少“您想让它干什么”的说明。`,
          suggestion: "请先用自然语言写清楚这个节点要做什么。",
        }),
      );
    }

    const nodeKind = indexes.nodeKindsByKind.get(node.kind);

    if (!nodeKind) {
      issues.push(
        issue({
          code: "unknown_node_kind",
          target: { kind: "node", id: node.id },
          message: `找不到节点类型：${node.kind}。`,
          suggestion: "请使用当前版本支持的方块类型。",
        }),
      );
      continue;
    }

    const nodeKindIssue = statusIssue({
      implementationStatus: nodeKind.implementationStatus,
      target: { kind: "node", id: node.id },
      capabilityLabel: `节点类型 ${nodeKind.displayName}`,
      note: nodeKind.implementationNote,
      options,
    });

    if (nodeKindIssue) {
      issues.push(nodeKindIssue);
    }

    issues.push(
      ...validateCompiledNodeSpec({
        node,
        nodeKind,
        indexes,
        nodeIds,
        options,
      }),
    );

    if (node.departmentDraftId && !departmentsByDraftId.has(node.departmentDraftId)) {
      issues.push(
        issue({
          code: "unknown_department_scope",
          target: { kind: "node", id: node.id },
          message: `${node.title || node.kind} 关联了不存在的部门方块：${node.departmentDraftId}。`,
          suggestion: "请把节点重新放入有效部门，或清除这个部门引用。",
        }),
      );
    }

    const scope = getDepartmentScopeForNode(node, departmentsByDraftId, indexes);
    const incomingEdges = incomingEdgesForNode(draft, node.id);
    const outgoingEdges = outgoingEdgesForNode(draft, node.id);

    if (node.kind === "bp_ask_entry" && incomingEdges.length > 0) {
      issues.push(
        issue({
          code: "field_flow_mismatch",
          target: { kind: "node", id: node.id },
          message: `${node.title || node.kind} 是协议入口，不能接收上游连线。`,
          suggestion: "请删除指向 BP问问入口的连线，入口只负责接收用户任务。",
        }),
      );
    }

    if (node.kind === "bp_ask_report" && outgoingEdges.length > 0) {
      issues.push(
        issue({
          code: "field_flow_mismatch",
          target: { kind: "node", id: node.id },
          message: `${node.title || node.kind} 是 BP问问汇报出口，不能继续向下游连线。`,
          suggestion: "请把汇报出口放在链路末端，或换成结果汇总节点继续处理。",
        }),
      );
    }

    if (node.kind === "condition" && outgoingEdges.length < 2) {
      issues.push(
        issue({
          code: "field_flow_mismatch",
          target: { kind: "node", id: node.id },
          severity: registerBlockingSeverity(options),
          message: `${node.title || node.kind} 至少需要两条下游分支。`,
          suggestion: "请给条件判断补齐通过 / 不通过等分支连线，或先删除这个节点。",
        }),
      );
    }

    if (
      (node.kind === "tool_call" ||
        node.kind === "skill_call" ||
        node.kind === "rag_search") &&
      !scope &&
      node.departmentDraftId
    ) {
      issues.push(
        issue({
          code: "unknown_department_scope",
          target: { kind: "node", id: node.id },
          message: `${node.title || node.kind} 找不到有效部门范围。`,
          suggestion: "请重新选择部门和具体范围。",
        }),
      );
    }

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
      issues.push(...validateWriteNode({ node, draft, scope, indexes, options }));
    }
  }

  return issues;
}

function validateEdges(
  draft: WorkProtocolDraft,
  options: Required<WorkProtocolValidationOptions>,
) {
  const issues: ProtocolIssue[] = [];
  const nodesById = new Map(draft.nodes.map((node) => [node.id, node]));
  const nodeIds = new Set(nodesById.keys());

  issues.push(
    ...checkUniqueIds(draft.edges, (edge) => edge.id, "edge", "连线"),
  );

  for (const edge of draft.edges) {
    if (!nodeIds.has(edge.sourceNodeId)) {
      issues.push(
        issue({
          code: "missing_edge_endpoint",
          target: { kind: "edge", id: edge.id },
          message: `连线 ${edge.id} 的起点节点不存在：${edge.sourceNodeId}。`,
          suggestion: "请重新连接，或删除这条连线。",
        }),
      );
    }

    if (!nodeIds.has(edge.targetNodeId)) {
      issues.push(
        issue({
          code: "missing_edge_endpoint",
          target: { kind: "edge", id: edge.id },
          message: `连线 ${edge.id} 的终点节点不存在：${edge.targetNodeId}。`,
          suggestion: "请重新连接，或删除这条连线。",
        }),
      );
    }

    if (edge.sourceNodeId === edge.targetNodeId) {
      issues.push(
        issue({
          code: "cycle_detected",
          target: { kind: "edge", id: edge.id },
          message: `连线 ${edge.id} 指向了自身。`,
          suggestion: "请把它连接到另一个节点。",
        }),
      );
    }

    const sourceNode = nodesById.get(edge.sourceNodeId);
    const targetNode = nodesById.get(edge.targetNodeId);

    if (sourceNode?.kind === "bp_ask_report") {
      issues.push(
        issue({
          code: "field_flow_mismatch",
          target: { kind: "edge", id: edge.id },
          message: `连线 ${edge.id} 从 BP问问汇报出口继续向下游传输。`,
          suggestion: "请把 BP问问汇报出口作为链路终点，或改用结果汇总节点继续传递。",
        }),
      );
    }

    if (targetNode?.kind === "bp_ask_entry") {
      issues.push(
        issue({
          code: "field_flow_mismatch",
          target: { kind: "edge", id: edge.id },
          message: `连线 ${edge.id} 指向了 BP问问入口。`,
          suggestion: "请删除这条连线；BP问问入口只能作为协议起点。",
        }),
      );
    }

    if (!trim(edge.transferIntent)) {
      issues.push(
        issue({
          code: "missing_required_text",
          target: { kind: "edge", id: edge.id },
          severity: "warning",
          message: `连线 ${edge.id} 没有传输说明。`,
          suggestion: "请说明要把什么内容传给下一个节点；默认可以是通讯提示词。",
        }),
      );
    }

    issues.push(...validateCompiledEdgeSpec(edge, options));
  }

  issues.push(...findGraphIssues(draft, options));

  return issues;
}

function validateCompiledEdgeSpec(
  edge: CanvasEdgeDraft,
  options: Required<WorkProtocolValidationOptions>,
) {
  const spec = edge.compiledSpec;
  const issues: ProtocolIssue[] = [];

  if (!spec) {
    return issues;
  }

  const details: string[] = [];
  const validTransferModes = new Set([
    "communication_prompt",
    "structured_packet",
    "field_mapping",
    "control_signal",
  ]);

  if (spec.edgeId !== edge.id) {
    details.push(`compiledSpec.edgeId must match edge id ${edge.id}`);
  }

  if (
    spec.sourceNodeId !== edge.sourceNodeId ||
    spec.targetNodeId !== edge.targetNodeId
  ) {
    details.push("compiledSpec endpoints must match the canvas edge endpoints");
  }

  if (!validTransferModes.has(spec.transferMode)) {
    details.push(`invalid transferMode ${String(spec.transferMode)}`);
  }

  for (const mapping of spec.fieldMappings ?? []) {
    if (!trim(mapping.fromPath) || !trim(mapping.toPath)) {
      details.push("fieldMappings require non-empty fromPath and toPath");
      break;
    }
  }

  for (const requiredField of spec.requiredFields ?? []) {
    if (!trim(requiredField)) {
      details.push("requiredFields cannot contain empty values");
      break;
    }
  }

  if (details.length > 0) {
    issues.push(
      issue({
        code: "field_flow_mismatch",
        target: { kind: "edge", id: edge.id },
        severity: registerBlockingSeverity(options),
        message: `Edge ${edge.id} has invalid parameter code: ${details.join("; ")}.`,
        suggestion:
          "Run protocol grooming again or edit the edge parameter code before registration.",
      }),
    );
  }

  return issues;
}

function findFirstCycle(draft: WorkProtocolDraft) {
  const nodeIds = new Set(draft.nodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  for (const edge of draft.edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      continue;
    }

    outgoing.set(edge.sourceNodeId, [
      ...(outgoing.get(edge.sourceNodeId) ?? []),
      edge.targetNodeId,
    ]);
  }

  function visit(nodeId: string): string[] | null {
    if (visiting.has(nodeId)) {
      const startIndex = stack.indexOf(nodeId);
      return [...stack.slice(Math.max(0, startIndex)), nodeId];
    }

    if (visited.has(nodeId)) {
      return null;
    }

    visiting.add(nodeId);
    stack.push(nodeId);

    for (const nextNodeId of outgoing.get(nodeId) ?? []) {
      const cycle = visit(nextNodeId);

      if (cycle) {
        return cycle;
      }
    }

    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);

    return null;
  }

  for (const node of draft.nodes) {
    const cycle = visit(node.id);

    if (cycle) {
      return cycle;
    }
  }

  return null;
}

function findGraphIssues(
  draft: WorkProtocolDraft,
  options: Required<WorkProtocolValidationOptions>,
) {
  const issues: ProtocolIssue[] = [];
  const nodeIds = new Set(draft.nodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>();

  for (const edge of draft.edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      continue;
    }

    outgoing.set(edge.sourceNodeId, [
      ...(outgoing.get(edge.sourceNodeId) ?? []),
      edge.targetNodeId,
    ]);
  }

  const entryNodes = draft.nodes.filter((node) => node.kind === "bp_ask_entry");

  if (entryNodes.length === 0 && draft.nodes.length > 0) {
    issues.push(
      issue({
        code: "unreachable_node",
        target: { kind: "protocol", id: draft.id },
        message: "协议里没有 BP问问入口节点。",
        suggestion: "建议至少添加一个 BP问问入口，作为协议触发入口。",
      }),
    );
    return issues;
  }

  const cycle = findFirstCycle(draft);

  if (cycle) {
    issues.push(
      issue({
        code: "cycle_detected",
        target: { kind: "protocol", id: draft.id },
        message: `协议主链路存在环路：${cycle.join(" -> ")}。`,
        suggestion: "请断开环路，让协议从入口单向流向汇报出口。",
      }),
    );
  }

  const reachable = new Set<string>();
  const stack = entryNodes.map((node) => node.id);

  while (stack.length > 0) {
    const nodeId = stack.pop();

    if (!nodeId || reachable.has(nodeId)) {
      continue;
    }

    reachable.add(nodeId);

    for (const nextId of outgoing.get(nodeId) ?? []) {
      stack.push(nextId);
    }
  }

  for (const node of draft.nodes) {
    if (!reachable.has(node.id)) {
      issues.push(
        issue({
          code: "unreachable_node",
          target: { kind: "node", id: node.id },
          severity: registerBlockingSeverity(options),
          message: `${node.title || node.kind} 没有从 BP问问入口连通。`,
          suggestion: "请把它接入主链路，或确认它只是暂存节点。",
        }),
      );
    }
  }

  return issues;
}

function validateProtocolLevel(
  draft: WorkProtocolDraft,
  options: Required<WorkProtocolValidationOptions>,
) {
  const issues: ProtocolIssue[] = [];

  if (!trim(draft.name)) {
    issues.push(
      issue({
        code: "missing_required_text",
        target: { kind: "protocol", id: draft.id },
        message: "协议缺少名称。",
        suggestion: "请先给这个工作协议网关命名。",
      }),
    );
  }

  if (draft.nodes.length === 0) {
    issues.push(
      issue({
        code: "missing_required_text",
        target: { kind: "protocol", id: draft.id },
        message: "协议画布里还没有任何节点。",
        suggestion: "请至少添加 BP问问入口和一个下游执行或汇报节点。",
      }),
    );
  }

  if (
    draft.nodes.length > 0 &&
    !draft.nodes.some((node) => node.kind === "bp_ask_report")
  ) {
    issues.push(
      issue({
        code: "missing_required_text",
        target: { kind: "protocol", id: draft.id },
        severity: registerBlockingSeverity(options),
        message: "协议缺少 BP问问汇报出口。",
        suggestion: "请添加 BP问问汇报出口，让执行结果能回到 BP问问并回复用户。",
      }),
    );
  }

  return issues;
}

function summarize(
  draft: WorkProtocolDraft,
  issues: ProtocolIssue[],
): WorkProtocolValidationSummary {
  const errors = issues.filter((item) => item.severity === "error").length;
  const warnings = issues.filter((item) => item.severity === "warning").length;
  const info = issues.filter((item) => item.severity === "info").length;

  return {
    errors,
    warnings,
    info,
    nodes: draft.nodes.length,
    edges: draft.edges.length,
    departments: draft.departments.length,
    canRegister: errors === 0,
  };
}

export function validateWorkProtocolDraft(
  draft: WorkProtocolDraft,
  catalog: CapabilityCatalog,
  options?: WorkProtocolValidationOptions,
): WorkProtocolValidationResult {
  const normalizedOptions = normalizeOptions(options);
  const indexes = buildCatalogIndexes(catalog);
  const issues = [
    ...validateProtocolLevel(draft, normalizedOptions),
    ...validateDepartments({ draft, indexes, options: normalizedOptions }),
    ...validateNodes({ draft, indexes, options: normalizedOptions }),
    ...validateEdges(draft, normalizedOptions),
  ];
  const summary = summarize(draft, issues);

  return {
    valid: summary.errors === 0,
    canRegister: summary.canRegister,
    issues,
    summary,
  };
}

export function validateWorkProtocolDraftForRegistration(
  draft: WorkProtocolDraft,
  catalog: CapabilityCatalog,
) {
  return validateWorkProtocolDraft(draft, catalog, {
    mode: "register",
    allowMockCapabilities: false,
    allowPlannedCapabilities: false,
    allowDisabledCapabilities: false,
  });
}
