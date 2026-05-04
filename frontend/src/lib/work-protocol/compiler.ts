import type {
  AgentCapability,
  CallableCapability,
  CapabilityCatalog,
  CanvasDepartmentDraft,
  CanvasEdgeDraft,
  CanvasNodeDraft,
  CompiledEdgeSpec,
  CompiledInputBinding,
  CompiledNodeSpec,
  CompiledProtocolDefinition,
  ProtocolApprovalPolicy,
  ProtocolExecutorKind,
  ProtocolReference,
  ProtocolReferenceKind,
  ProtocolRiskLevel,
  WritableObjectCapability,
  WorkProtocolDraft,
} from "@/lib/work-protocol/types";
import {
  validateWorkProtocolDraft,
  type WorkProtocolValidationMode,
  type WorkProtocolValidationResult,
} from "@/lib/work-protocol/validator";

export type WorkProtocolCompileStatus =
  | "compiled"
  | "compiled_with_warnings"
  | "invalid";

export type WorkProtocolParameterCodeBlock = {
  id: string;
  target: "protocol" | "node" | "edge";
  targetId: string;
  label: string;
  status: "fresh" | "invalid";
  language: "json";
  code: Record<string, unknown>;
};

export type WorkProtocolCompileOptions = {
  mode?: WorkProtocolValidationMode;
  allowMockCapabilities?: boolean;
  allowPlannedCapabilities?: boolean;
  allowDisabledCapabilities?: boolean;
};

export type WorkProtocolCompileResult = {
  status: WorkProtocolCompileStatus;
  draft: WorkProtocolDraft;
  compiled: CompiledProtocolDefinition | null;
  validation: WorkProtocolValidationResult;
  parameterCodeBlocks: WorkProtocolParameterCodeBlock[];
};

const DEFAULT_EDGE_PROMPT = "请编辑传输内容，默认是通讯提示词";

type CatalogIndexes = {
  departmentsById: Map<string, CapabilityCatalog["departments"][number]>;
  agentsById: Map<string, AgentCapability>;
  callablesById: Map<string, CallableCapability>;
  writableObjectsByKind: Map<string, WritableObjectCapability>;
  nodeKindsByKind: Map<string, CapabilityCatalog["nodeKinds"][number]>;
};

function trim(value: string | undefined) {
  return value?.trim() ?? "";
}

function buildCatalogIndexes(catalog: CapabilityCatalog): CatalogIndexes {
  return {
    departmentsById: new Map(
      catalog.departments.map((department) => [
        department.departmentId,
        department,
      ]),
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
    nodeKindsByKind: new Map(
      catalog.nodeKinds.map((nodeKind) => [nodeKind.kind, nodeKind]),
    ),
  };
}

function getDepartmentScopeId(
  node: CanvasNodeDraft,
  departmentsByDraftId: Map<string, CanvasDepartmentDraft>,
) {
  if (!node.departmentDraftId) {
    return undefined;
  }

  return departmentsByDraftId.get(node.departmentDraftId)?.primaryScopeId;
}

function callableKindForNode(node: CanvasNodeDraft) {
  if (node.kind === "tool_call") {
    return "tool" as const;
  }

  if (node.kind === "skill_call") {
    return "skill" as const;
  }

  if (node.kind === "rag_search") {
    return "rag" as const;
  }

  return null;
}

function callableAllowedInScope(
  callable: CallableCapability,
  departmentScopeId: string | undefined,
) {
  if (!departmentScopeId) {
    return true;
  }

  if (
    !callable.allowedDepartmentScopeIds ||
    callable.allowedDepartmentScopeIds.length === 0
  ) {
    return true;
  }

  return callable.allowedDepartmentScopeIds.includes(departmentScopeId);
}

function selectCallable(
  node: CanvasNodeDraft,
  catalog: CapabilityCatalog,
  departmentScopeId: string | undefined,
) {
  const expectedKind = callableKindForNode(node);

  if (!expectedKind) {
    return undefined;
  }

  const requested = trim(node.callableId);

  if (requested) {
    return catalog.callables.find((callable) => callable.capabilityId === requested);
  }

  return catalog.callables.find(
    (callable) =>
      callable.kind === expectedKind &&
      callableAllowedInScope(callable, departmentScopeId),
  );
}

function selectAgent(
  node: CanvasNodeDraft,
  catalog: CapabilityCatalog,
  departmentScopeId: string | undefined,
  departmentDraft?: CanvasDepartmentDraft,
) {
  const requested = trim(node.agentId);

  if (requested) {
    return catalog.agents.find((agent) => agent.agentId === requested);
  }

  const visibleAgentIds = departmentDraft?.visibleAgentIds ?? [];

  if (visibleAgentIds.length > 0) {
    const visibleAgent = catalog.agents.find(
      (agent) =>
        visibleAgentIds.includes(agent.agentId) &&
        (!departmentScopeId ||
          agent.visibleDepartmentScopeIds.includes(departmentScopeId)),
    );

    if (visibleAgent) {
      return visibleAgent;
    }
  }

  return catalog.agents.find(
    (agent) =>
      !departmentScopeId ||
      agent.visibleDepartmentScopeIds.includes(departmentScopeId),
  );
}

function writableAllowedInScope(
  writableObject: WritableObjectCapability,
  departmentScopeId: string | undefined,
) {
  if (!departmentScopeId) {
    return true;
  }

  return writableObject.actions.some((action) =>
    action.allowedDepartmentScopeIds.includes(departmentScopeId),
  );
}

function selectWritableObject(
  node: CanvasNodeDraft,
  catalog: CapabilityCatalog,
  departmentScopeId: string | undefined,
) {
  const requested = trim(node.writableObjectKind);

  if (requested) {
    return catalog.writableObjects.find(
      (writableObject) => writableObject.objectKind === requested,
    );
  }

  return catalog.writableObjects.find((writableObject) =>
    writableAllowedInScope(writableObject, departmentScopeId),
  );
}

function normalizeDraftForCompile(
  draft: WorkProtocolDraft,
  catalog: CapabilityCatalog,
) {
  const departmentsByDraftId = new Map(
    draft.departments.map((department) => [department.id, department]),
  );
  const now = new Date().toISOString();

  const nodes = draft.nodes.map((node) => {
    const departmentScopeId = getDepartmentScopeId(node, departmentsByDraftId);
    const departmentDraft = node.departmentDraftId
      ? departmentsByDraftId.get(node.departmentDraftId)
      : undefined;

    if (
      node.kind === "tool_call" ||
      node.kind === "skill_call" ||
      node.kind === "rag_search"
    ) {
      const callable = selectCallable(node, catalog, departmentScopeId);

      return {
        ...node,
        callableId: trim(node.callableId) || callable?.capabilityId,
        compiledSpecStatus: "empty" as const,
      };
    }

    if (node.kind === "agent_task") {
      const agent = selectAgent(node, catalog, departmentScopeId, departmentDraft);

      return {
        ...node,
        agentId: trim(node.agentId) || agent?.agentId,
        compiledSpecStatus: "empty" as const,
      };
    }

    if (node.kind === "write_object") {
      const writableObject = selectWritableObject(node, catalog, departmentScopeId);

      return {
        ...node,
        writableObjectKind:
          trim(node.writableObjectKind) || writableObject?.objectKind,
        compiledSpecStatus: "empty" as const,
      };
    }

    return {
      ...node,
      compiledSpecStatus: "empty" as const,
    };
  });

  return {
    ...draft,
    nodes,
    edges: draft.edges.map((edge) => ({
      ...edge,
      compiledSpecStatus: "empty" as const,
    })),
    compileStatus: "draft" as const,
    updatedAt: now,
  };
}

function inferExecutorKind(node: CanvasNodeDraft): ProtocolExecutorKind {
  if (node.kind === "bp_ask_entry" || node.kind === "bp_ask_report") {
    return "bp_ask";
  }

  if (node.kind === "tool_call") {
    return "tool";
  }

  if (node.kind === "skill_call") {
    return "skill";
  }

  if (node.kind === "rag_search") {
    return "rag";
  }

  if (node.kind === "agent_task") {
    return "agent";
  }

  if (node.kind === "human_confirm") {
    return "human";
  }

  if (node.kind === "write_object") {
    return "write";
  }

  return "control";
}

function getIncomingEdges(draft: WorkProtocolDraft, nodeId: string) {
  return draft.edges.filter((edge) => edge.targetNodeId === nodeId);
}

function getInputBindings(params: {
  draft: WorkProtocolDraft;
  node: CanvasNodeDraft;
  departmentScopeId?: string;
}) {
  const { draft, node, departmentScopeId } = params;
  const bindings: CompiledInputBinding[] = [];

  if (node.kind === "bp_ask_entry") {
    bindings.push({
      name: "userPrompt",
      source: "user_input",
      required: true,
      description: "Raw user prompt entering BP问问.",
    });
    bindings.push({
      name: "threadContext",
      source: "context_packet",
      path: "$",
      required: false,
      description: "Conversation and task context.",
    });
    return bindings;
  }

  for (const edge of getIncomingEdges(draft, node.id)) {
    bindings.push({
      name: `from_${edge.sourceNodeId}`,
      source: "node_output",
      sourceNodeId: edge.sourceNodeId,
      path: "$",
      required: false,
      description: trim(edge.transferIntent) || DEFAULT_EDGE_PROMPT,
    });
  }

  bindings.push({
    name: "instruction",
    source: "constant",
    value: trim(node.userIntent) || node.title || node.kind,
    required: true,
  });

  if (departmentScopeId) {
    bindings.push({
      name: "departmentScopeId",
      source: "department_scope",
      value: departmentScopeId,
      required: false,
    });
  }

  if (
    node.kind === "tool_call" ||
    node.kind === "skill_call" ||
    node.kind === "rag_search" ||
    node.kind === "agent_task" ||
    node.kind === "write_object"
  ) {
    bindings.push({
      name: "contextPacket",
      source: "context_packet",
      path: "$",
      required: false,
    });
  }

  return bindings;
}

function getRiskLevel(params: {
  node: CanvasNodeDraft;
  callable?: CallableCapability;
  writableObject?: WritableObjectCapability;
}): ProtocolRiskLevel {
  const { node, callable, writableObject } = params;

  if (callable) {
    return callable.riskLevel;
  }

  if (writableObject) {
    return writableObject.actions.some((action) => action.confirmationRequired)
      ? "high"
      : "medium";
  }

  if (node.kind === "human_confirm") {
    return "medium";
  }

  if (node.kind === "bp_ask_entry" || node.kind === "bp_ask_report") {
    return "none";
  }

  return "low";
}

function getApprovalPolicy(params: {
  nodeKindApprovalPolicy: ProtocolApprovalPolicy;
  callable?: CallableCapability;
  writableObject?: WritableObjectCapability;
}) {
  const { nodeKindApprovalPolicy, callable, writableObject } = params;

  if (writableObject?.actions.some((action) => action.confirmationRequired)) {
    return "required" as const;
  }

  if (callable?.requiresConfirmationDefault) {
    return "required" as const;
  }

  return nodeKindApprovalPolicy;
}

function callableRef(callable: CallableCapability): ProtocolReference {
  const kind: ProtocolReferenceKind =
    callable.kind === "tool"
      ? "tool"
      : callable.kind === "skill"
        ? "skill"
        : "rag_index";

  return {
    kind,
    id: callable.capabilityId,
    label: callable.displayName,
  };
}

function buildPermissionRefs(params: {
  department?: CanvasDepartmentDraft;
  callable?: CallableCapability;
  agent?: AgentCapability;
  writableObject?: WritableObjectCapability;
}) {
  const refs: ProtocolReference[] = [];

  if (params.department) {
    refs.push({
      kind: "department_scope",
      id: params.department.primaryScopeId,
      label: params.department.primaryScopeLabel,
    });
  }

  if (params.callable) {
    refs.push(callableRef(params.callable));
  }

  if (params.agent) {
    refs.push({
      kind: "agent",
      id: params.agent.agentId,
      label: params.agent.displayName,
    });
  }

  if (params.writableObject) {
    refs.push({
      kind: params.writableObject.objectKind,
      id: params.writableObject.objectKind,
      label: params.writableObject.displayName,
    });
  }

  return refs;
}

function firstWritableAction(writableObject: WritableObjectCapability | undefined) {
  return writableObject?.actions[0]?.actionName;
}

function getStableCompiledNodeSpec(node: CanvasNodeDraft) {
  return node.compiledSpec?.nodeId === node.id && node.compiledSpec.kind === node.kind
    ? node.compiledSpec
    : null;
}

function compileNode(params: {
  draft: WorkProtocolDraft;
  node: CanvasNodeDraft;
  indexes: CatalogIndexes;
  departmentsByDraftId: Map<string, CanvasDepartmentDraft>;
}): CompiledNodeSpec {
  const { draft, node, indexes, departmentsByDraftId } = params;
  const compiledSpec = getStableCompiledNodeSpec(node);
  const nodeKind = indexes.nodeKindsByKind.get(node.kind);
  const department = node.departmentDraftId
    ? departmentsByDraftId.get(node.departmentDraftId)
    : undefined;
  const departmentScopeId =
    compiledSpec?.departmentScopeId ?? department?.primaryScopeId;
  const callableId = compiledSpec?.callableId ?? node.callableId;
  const agentId = compiledSpec?.agentId ?? node.agentId;
  const writableObjectKind =
    compiledSpec?.writableObjectKind ?? node.writableObjectKind;
  const callable = callableId
    ? indexes.callablesById.get(callableId)
    : undefined;
  const agent = agentId ? indexes.agentsById.get(agentId) : undefined;
  const writableObject = writableObjectKind
    ? indexes.writableObjectsByKind.get(writableObjectKind)
    : undefined;
  const fallbackApprovalPolicy = getApprovalPolicy({
    nodeKindApprovalPolicy: nodeKind?.approvalPolicy ?? "none",
    callable,
    writableObject,
  });
  const fallbackOutputFields = (nodeKind?.outputs ?? ["result"]).map((output) => ({
    name: output,
    jsonPath: `$.${output}`,
    schema: { type: "object" },
    description: `${node.title} output: ${output}`,
  }));

  return {
    nodeId: node.id,
    kind: node.kind,
    title: node.title,
    executorKind:
      compiledSpec?.executorKind ?? nodeKind?.executorKind ?? inferExecutorKind(node),
    intentSummary:
      compiledSpec?.intentSummary ?? (trim(node.userIntent) || node.title || node.kind),
    callableId: callable?.capabilityId,
    agentId: agent?.agentId,
    departmentScopeId,
    writableObjectKind: writableObject?.objectKind,
    inputBindings:
      compiledSpec?.inputBindings ?? getInputBindings({ draft, node, departmentScopeId }),
    outputFields: compiledSpec?.outputFields ?? fallbackOutputFields,
    riskLevel:
      compiledSpec?.riskLevel ?? getRiskLevel({ node, callable, writableObject }),
    approvalPolicy: compiledSpec?.approvalPolicy ?? fallbackApprovalPolicy,
    permissionRefs: compiledSpec?.permissionRefs ?? buildPermissionRefs({
      department,
      callable,
      agent,
      writableObject,
    }),
    timeoutMs: compiledSpec?.timeoutMs ?? (node.kind === "agent_task" ? 120_000 : 60_000),
    retryPolicy:
      compiledSpec?.retryPolicy ?? (node.kind === "human_confirm"
        ? undefined
        : {
            maxAttempts: node.kind === "bp_ask_entry" ? 1 : 2,
            retryOn: ["timeout", "transient_failure"],
          }),
    failurePolicy: compiledSpec?.failurePolicy ?? {
      mode: node.kind === "bp_ask_report" ? "fail_protocol" : "return_to_bp_ask",
    },
  };
}

function compileEdge(edge: CanvasEdgeDraft): CompiledEdgeSpec {
  const compiledSpec =
    edge.compiledSpec?.edgeId === edge.id &&
    edge.compiledSpec.sourceNodeId === edge.sourceNodeId &&
    edge.compiledSpec.targetNodeId === edge.targetNodeId
      ? edge.compiledSpec
      : null;
  const defaultPrompt = trim(edge.transferIntent) || DEFAULT_EDGE_PROMPT;

  return {
    edgeId: edge.id,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    transferMode: compiledSpec?.transferMode ?? "communication_prompt",
    prompt: compiledSpec?.prompt ?? defaultPrompt,
    fieldMappings: compiledSpec?.fieldMappings ?? [],
    requiredFields: compiledSpec?.requiredFields ?? [],
    outputPacketSchema: compiledSpec?.outputPacketSchema ?? {
      type: "object",
      properties: {
        prompt: { type: "string" },
        payload: { type: "object" },
      },
    },
  };
}

function uniqueRefs(refs: ProtocolReference[]) {
  const seen = new Set<string>();
  const result: ProtocolReference[] = [];

  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(ref);
  }

  return result;
}

function buildCompiledDefinition(params: {
  draft: WorkProtocolDraft;
  catalog: CapabilityCatalog;
  indexes: CatalogIndexes;
}) {
  const { draft, catalog, indexes } = params;
  const departmentsByDraftId = new Map(
    draft.departments.map((department) => [department.id, department]),
  );
  const nodes = draft.nodes.map((node) =>
    compileNode({
      draft,
      node,
      indexes,
      departmentsByDraftId,
    }),
  );
  const edges = draft.edges.map(compileEdge);
  const now = new Date().toISOString();

  return {
    id: `work-protocol:${draft.id}`,
    draftId: draft.id,
    versionId: `compiled:${draft.id}:${Date.now()}`,
    versionNumber: 1,
    name: draft.name,
    description: draft.description,
    status: "compiled",
    triggerRules: draft.triggerDrafts,
    nodes,
    edges,
    entryNodeIds: nodes
      .filter((node) => node.kind === "bp_ask_entry")
      .map((node) => node.nodeId),
    reportNodeIds: nodes
      .filter((node) => node.kind === "bp_ask_report")
      .map((node) => node.nodeId),
    requiredInputs: nodes.some((node) => node.kind === "bp_ask_entry")
      ? ["userPrompt"]
      : [],
    outputSchema: {
      type: "object",
      properties: {
        replyText: { type: "string" },
        artifacts: { type: "array", items: { type: "object" } },
      },
    },
    permissionSummary: uniqueRefs(nodes.flatMap((node) => node.permissionRefs)),
    capabilityCatalogHash: catalog.catalogHash,
    createdAt: now,
  } satisfies CompiledProtocolDefinition;
}

function nodeParameterBlock(
  node: CanvasNodeDraft,
  compiledNode: CompiledNodeSpec | undefined,
) {
  return {
    id: `parameter-code:node:${node.id}`,
    target: "node",
    targetId: node.id,
    label: `${node.title || node.kind} 参数代码`,
    status: compiledNode ? "fresh" : "invalid",
    language: "json",
    code: {
      kind: node.kind,
      title: node.title,
      userIntent: node.userIntent,
      callableId: compiledNode?.callableId ?? node.callableId,
      agentId: compiledNode?.agentId ?? node.agentId,
      departmentScopeId: compiledNode?.departmentScopeId,
      writableObjectKind:
        compiledNode?.writableObjectKind ?? node.writableObjectKind,
      executorKind: compiledNode?.executorKind,
      approvalPolicy: compiledNode?.approvalPolicy,
      riskLevel: compiledNode?.riskLevel,
      inputBindings: compiledNode?.inputBindings ?? [],
      outputFields: compiledNode?.outputFields ?? [],
      failurePolicy: compiledNode?.failurePolicy,
    },
  } satisfies WorkProtocolParameterCodeBlock;
}

function edgeParameterBlock(
  edge: CanvasEdgeDraft,
  compiledEdge: CompiledEdgeSpec | undefined,
) {
  return {
    id: `parameter-code:edge:${edge.id}`,
    target: "edge",
    targetId: edge.id,
    label: `连线 ${edge.id} 参数代码`,
    status: compiledEdge ? "fresh" : "invalid",
    language: "json",
    code: {
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      transferIntent: edge.transferIntent,
      transferMode: compiledEdge?.transferMode ?? "communication_prompt",
      prompt: compiledEdge?.prompt ?? (trim(edge.transferIntent) || DEFAULT_EDGE_PROMPT),
      fieldMappings: compiledEdge?.fieldMappings ?? [],
      requiredFields: compiledEdge?.requiredFields ?? [],
    },
  } satisfies WorkProtocolParameterCodeBlock;
}

function protocolParameterBlock(
  draft: WorkProtocolDraft,
  compiled: CompiledProtocolDefinition | null,
) {
  return {
    id: `parameter-code:protocol:${draft.id}`,
    target: "protocol",
    targetId: draft.id,
    label: `${draft.name || "未命名协议"} 注册参数`,
    status: compiled ? "fresh" : "invalid",
    language: "json",
    code: {
      protocolId: compiled?.id ?? draft.id,
      draftId: draft.id,
      name: draft.name,
      triggerRules: draft.triggerDrafts,
      entryNodeIds: compiled?.entryNodeIds ?? [],
      reportNodeIds: compiled?.reportNodeIds ?? [],
      requiredInputs: compiled?.requiredInputs ?? [],
      permissionSummary: compiled?.permissionSummary ?? [],
      capabilityCatalogHash: compiled?.capabilityCatalogHash,
    },
  } satisfies WorkProtocolParameterCodeBlock;
}

function buildParameterCodeBlocks(params: {
  draft: WorkProtocolDraft;
  compiled: CompiledProtocolDefinition | null;
}) {
  const { draft, compiled } = params;
  const compiledNodesById = new Map(
    (compiled?.nodes ?? []).map((node) => [node.nodeId, node]),
  );
  const compiledEdgesById = new Map(
    (compiled?.edges ?? []).map((edge) => [edge.edgeId, edge]),
  );

  return [
    protocolParameterBlock(draft, compiled),
    ...draft.nodes.map((node) =>
      nodeParameterBlock(node, compiledNodesById.get(node.id)),
    ),
    ...draft.edges.map((edge) =>
      edgeParameterBlock(edge, compiledEdgesById.get(edge.id)),
    ),
  ];
}

export function compileWorkProtocolDraftV0(
  draft: WorkProtocolDraft,
  catalog: CapabilityCatalog,
  options?: WorkProtocolCompileOptions,
): WorkProtocolCompileResult {
  const normalizedDraft = normalizeDraftForCompile(draft, catalog);
  const validation = validateWorkProtocolDraft(normalizedDraft, catalog, {
    mode: options?.mode ?? "draft",
    allowMockCapabilities: options?.allowMockCapabilities,
    allowPlannedCapabilities: options?.allowPlannedCapabilities,
    allowDisabledCapabilities: options?.allowDisabledCapabilities,
  });
  const indexes = buildCatalogIndexes(catalog);
  const compiled = validation.valid
    ? buildCompiledDefinition({ draft: normalizedDraft, catalog, indexes })
    : null;
  const parameterCodeBlocks = buildParameterCodeBlocks({
    draft: normalizedDraft,
    compiled,
  });
  const compileStatus: WorkProtocolCompileStatus = !validation.valid
    ? "invalid"
    : validation.summary.warnings > 0
      ? "compiled_with_warnings"
      : "compiled";

  return {
    status: compileStatus,
    draft: {
      ...normalizedDraft,
      nodes: normalizedDraft.nodes.map((node) => ({
        ...node,
        compiledSpecStatus: compiled ? "fresh" : "invalid",
        compiledSpec: compiled?.nodes.find(
          (compiledNode) => compiledNode.nodeId === node.id,
        ),
      })),
      edges: normalizedDraft.edges.map((edge) => ({
        ...edge,
        compiledSpecStatus: compiled ? "fresh" : "invalid",
        compiledSpec: compiled?.edges.find(
          (compiledEdge) => compiledEdge.edgeId === edge.id,
        ),
      })),
      compileStatus: compiled ? "compiled" : "invalid",
      latestCompiledVersionId: compiled?.versionId,
    },
    compiled,
    validation,
    parameterCodeBlocks,
  };
}
