import { buildCapabilityContracts } from "@/lib/work-protocol/catalog";
import type {
  CapabilityCatalog,
  CapabilityContract,
  CanvasDepartmentDraft,
  CanvasEdgeDraft,
  CanvasNodeDraft,
  CompiledEdgeSpec,
  CompiledNodeSpec,
  JsonSchema,
  ProtocolIssueSeverity,
  ProtocolNodeKind,
  WorkProtocolDraft,
} from "@/lib/work-protocol/types";

export type WorkProtocolGroomingInputPackDepartment = {
  id: string;
  departmentId: string;
  departmentLabel: string;
  primaryScopeId: string;
  primaryScopeLabel: string;
  secondaryScopeId?: string;
  secondaryScopeLabel?: string;
  tertiaryScopeId?: string;
  tertiaryScopeLabel?: string;
  visibleAgentIds: string[];
  candidateContractIds: string[];
};

export type WorkProtocolGroomingInputPackNode = {
  id: string;
  kind: ProtocolNodeKind;
  title: string;
  userIntent: string;
  departmentDraftId?: string;
  departmentScopeId?: string;
  callableId?: string;
  agentId?: string;
  writableObjectKind?: string;
  compiledSpec?: CompiledNodeSpec;
  candidateContractIds: string[];
};

export type WorkProtocolGroomingInputPackEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  transferIntent: string;
  compiledSpec?: CompiledEdgeSpec;
};

export type WorkProtocolGroomingInputPack = {
  schemaVersion: "work-protocol-grooming-input.v1";
  generatedAt: string;
  catalogHash?: string;
  draft: Pick<
    WorkProtocolDraft,
    "id" | "name" | "description" | "triggerDrafts" | "compileStatus"
  >;
  departments: WorkProtocolGroomingInputPackDepartment[];
  nodes: WorkProtocolGroomingInputPackNode[];
  edges: WorkProtocolGroomingInputPackEdge[];
  capabilityContracts: CapabilityContract[];
  includedContractIds: string[];
  knownContractIds: string[];
  constraints: {
    outputSchemaVersion: "work-protocol-model-grooming-output.v1";
    deterministicFallback: true;
    requireKnownContractIds: true;
    requireExistingNodeAndEdgeIds: true;
    maxIssues: number;
  };
  outputContract: WorkProtocolModelGroomingOutputContract;
};

export type WorkProtocolModelGroomingIssue = {
  target: {
    kind: "protocol" | "department" | "node" | "edge";
    id?: string;
  };
  severity: ProtocolIssueSeverity;
  code?: string;
  message: string;
  suggestion?: string;
};

export type WorkProtocolModelNodeUpdate = {
  nodeId: string;
  contractId?: string;
  departmentScopeId?: string;
  callableId?: string;
  agentId?: string;
  writableObjectKind?: string;
  intentSummary?: string;
  compiledSpec?: Partial<CompiledNodeSpec>;
  issues?: WorkProtocolModelGroomingIssue[];
};

export type WorkProtocolModelEdgeUpdate = {
  edgeId: string;
  transferMode?:
    | "communication_prompt"
    | "structured_packet"
    | "field_mapping"
    | "control_signal";
  prompt?: string;
  compiledSpec?: Partial<CompiledEdgeSpec>;
  issues?: WorkProtocolModelGroomingIssue[];
};

export type WorkProtocolModelGroomingOutput = {
  schemaVersion: "work-protocol-model-grooming-output.v1";
  status: "groomed" | "needs_user_input" | "invalid";
  protocolSummary?: {
    message?: string;
    canRegister?: boolean;
    suggestions?: string[];
  };
  nodeUpdates?: WorkProtocolModelNodeUpdate[];
  edgeUpdates?: WorkProtocolModelEdgeUpdate[];
  issues?: WorkProtocolModelGroomingIssue[];
};

export type WorkProtocolModelGroomingOutputContract = {
  schemaVersion: "work-protocol-model-grooming-output.v1";
  jsonSchema: JsonSchema;
};

export type WorkProtocolModelOutputValidationIssueCode =
  | "invalid_root"
  | "missing_required_field"
  | "invalid_schema_version"
  | "invalid_status"
  | "invalid_field_type"
  | "unknown_node_id"
  | "unknown_edge_id"
  | "unknown_department_id"
  | "unknown_contract_id"
  | "contract_not_allowed_for_node"
  | "compiled_spec_mismatch"
  | "invalid_issue_target";

export type WorkProtocolModelOutputValidationIssue = {
  path: string;
  code: WorkProtocolModelOutputValidationIssueCode;
  message: string;
};

export type WorkProtocolModelOutputValidationResult = {
  valid: boolean;
  issues: WorkProtocolModelOutputValidationIssue[];
  normalizedOutput?: WorkProtocolModelGroomingOutput;
};

const OUTPUT_SCHEMA = {
  type: "object",
  required: ["schemaVersion", "status"],
  additionalProperties: false,
  properties: {
    schemaVersion: {
      type: "string",
      const: "work-protocol-model-grooming-output.v1",
    },
    status: {
      type: "string",
      enum: ["groomed", "needs_user_input", "invalid"],
    },
    protocolSummary: {
      type: "object",
      additionalProperties: false,
      properties: {
        message: { type: "string" },
        canRegister: { type: "boolean" },
        suggestions: { type: "array", items: { type: "string" } },
      },
    },
    nodeUpdates: {
      type: "array",
      items: {
        type: "object",
        required: ["nodeId"],
        additionalProperties: false,
        properties: {
          nodeId: { type: "string" },
          contractId: { type: "string" },
          departmentScopeId: { type: "string" },
          callableId: { type: "string" },
          agentId: { type: "string" },
          writableObjectKind: { type: "string" },
          intentSummary: { type: "string" },
          compiledSpec: { type: "object" },
          issues: { type: "array" },
        },
      },
    },
    edgeUpdates: {
      type: "array",
      items: {
        type: "object",
        required: ["edgeId"],
        additionalProperties: false,
        properties: {
          edgeId: { type: "string" },
          transferMode: {
            type: "string",
            enum: [
              "communication_prompt",
              "structured_packet",
              "field_mapping",
              "control_signal",
            ],
          },
          prompt: { type: "string" },
          compiledSpec: { type: "object" },
          issues: { type: "array" },
        },
      },
    },
    issues: { type: "array" },
  },
} satisfies JsonSchema;

export const MODEL_GROOMING_OUTPUT_CONTRACT = {
  schemaVersion: "work-protocol-model-grooming-output.v1",
  jsonSchema: OUTPUT_SCHEMA,
} satisfies WorkProtocolModelGroomingOutputContract;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function contractAllowedInScope(
  contract: CapabilityContract,
  scopeId: string | undefined,
) {
  return contract.scopes.length === 0 || !scopeId || contract.scopes.includes(scopeId);
}

function getDepartmentScopeId(
  node: CanvasNodeDraft,
  departmentsById: Map<string, CanvasDepartmentDraft>,
) {
  if (node.compiledSpec?.departmentScopeId) {
    return node.compiledSpec.departmentScopeId;
  }

  if (!node.departmentDraftId) {
    return undefined;
  }

  return departmentsById.get(node.departmentDraftId)?.primaryScopeId;
}

function selectedContractId(node: CanvasNodeDraft) {
  const callableId = node.compiledSpec?.callableId ?? node.callableId;
  const agentId = node.compiledSpec?.agentId ?? node.agentId;
  const writableObjectKind =
    node.compiledSpec?.writableObjectKind ?? node.writableObjectKind;

  if (callableId) {
    return callableId;
  }

  if (agentId) {
    return `agent.${agentId}`;
  }

  if (writableObjectKind) {
    return `write_object.${writableObjectKind}`;
  }

  return undefined;
}

function candidateContractsForNode(params: {
  node: CanvasNodeDraft;
  departmentScopeId?: string;
  contracts: CapabilityContract[];
}) {
  const ids = new Set<string>();
  const addIfKnownAndAllowed = (contractId: string | undefined) => {
    if (!contractId) {
      return;
    }

    const contract = params.contracts.find((item) => item.id === contractId);

    if (contract && contractAllowedInScope(contract, params.departmentScopeId)) {
      ids.add(contract.id);
    }
  };

  addIfKnownAndAllowed(`node_kind.${params.node.kind}`);
  addIfKnownAndAllowed(selectedContractId(params.node));

  if (params.departmentScopeId) {
    addIfKnownAndAllowed(`department_scope.${params.departmentScopeId}`);
  }

  const matchingExecutionKinds = {
    tool_call: "tool",
    skill_call: "skill",
    rag_search: "rag",
    agent_task: "agent",
    write_object: "write_object",
  } as const;
  const executionKind =
    matchingExecutionKinds[
      params.node.kind as keyof typeof matchingExecutionKinds
    ];

  if (executionKind) {
    for (const contract of params.contracts) {
      if (
        contract.kind === executionKind &&
        contractAllowedInScope(contract, params.departmentScopeId)
      ) {
        ids.add(contract.id);
      }
    }
  }

  return [...ids].sort((left, right) => left.localeCompare(right));
}

function candidateContractsForDepartment(params: {
  department: CanvasDepartmentDraft;
  contractsById: Map<string, CapabilityContract>;
}) {
  return uniqueStrings([
    params.contractsById.get(`department.${params.department.departmentId}`)?.id,
    params.contractsById.get(
      `department_scope.${params.department.primaryScopeId}`,
    )?.id,
  ]);
}

function buildIncludedContracts(params: {
  contracts: CapabilityContract[];
  departments: WorkProtocolGroomingInputPackDepartment[];
  nodes: WorkProtocolGroomingInputPackNode[];
}) {
  const includedIds = new Set<string>();

  for (const department of params.departments) {
    for (const contractId of department.candidateContractIds) {
      includedIds.add(contractId);
    }
  }

  for (const node of params.nodes) {
    for (const contractId of node.candidateContractIds) {
      includedIds.add(contractId);
    }
  }

  return params.contracts
    .filter((contract) => includedIds.has(contract.id))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function buildWorkProtocolGroomingInputPack(params: {
  draft: WorkProtocolDraft;
  catalog: CapabilityCatalog;
  generatedAt?: string;
}): WorkProtocolGroomingInputPack {
  const contracts = buildCapabilityContracts(params.catalog);
  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
  const departmentsById = new Map(
    params.draft.departments.map((department) => [department.id, department]),
  );
  const departments = params.draft.departments.map((department) => ({
    id: department.id,
    departmentId: department.departmentId,
    departmentLabel: department.departmentLabel,
    primaryScopeId: department.primaryScopeId,
    primaryScopeLabel: department.primaryScopeLabel,
    secondaryScopeId: department.secondaryScopeId,
    secondaryScopeLabel: department.secondaryScopeLabel,
    tertiaryScopeId: department.tertiaryScopeId,
    tertiaryScopeLabel: department.tertiaryScopeLabel,
    visibleAgentIds: department.visibleAgentIds,
    candidateContractIds: candidateContractsForDepartment({
      department,
      contractsById,
    }),
  }));
  const nodes = params.draft.nodes.map((node) => {
    const departmentScopeId = getDepartmentScopeId(node, departmentsById);

    return {
      id: node.id,
      kind: node.kind,
      title: node.title,
      userIntent: node.userIntent,
      departmentDraftId: node.departmentDraftId,
      departmentScopeId,
      callableId: node.compiledSpec?.callableId ?? node.callableId,
      agentId: node.compiledSpec?.agentId ?? node.agentId,
      writableObjectKind:
        node.compiledSpec?.writableObjectKind ?? node.writableObjectKind,
      compiledSpec: node.compiledSpec,
      candidateContractIds: candidateContractsForNode({
        node,
        departmentScopeId,
        contracts,
      }),
    };
  });
  const edges = params.draft.edges.map((edge) => ({
    id: edge.id,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    transferIntent: edge.transferIntent,
    compiledSpec: edge.compiledSpec,
  }));
  const includedContracts = buildIncludedContracts({
    contracts,
    departments,
    nodes,
  });

  return {
    schemaVersion: "work-protocol-grooming-input.v1",
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    catalogHash: params.catalog.catalogHash,
    draft: {
      id: params.draft.id,
      name: params.draft.name,
      description: params.draft.description,
      triggerDrafts: params.draft.triggerDrafts,
      compileStatus: params.draft.compileStatus,
    },
    departments,
    nodes,
    edges,
    capabilityContracts: includedContracts,
    includedContractIds: includedContracts.map((contract) => contract.id),
    knownContractIds: contracts.map((contract) => contract.id).sort(),
    constraints: {
      outputSchemaVersion: "work-protocol-model-grooming-output.v1",
      deterministicFallback: true,
      requireKnownContractIds: true,
      requireExistingNodeAndEdgeIds: true,
      maxIssues: 100,
    },
    outputContract: MODEL_GROOMING_OUTPUT_CONTRACT,
  };
}

function pushIssue(
  issues: WorkProtocolModelOutputValidationIssue[],
  issue: WorkProtocolModelOutputValidationIssue,
) {
  issues.push(issue);
}

function validateIssueTargets(params: {
  value: unknown;
  path: string;
  pack: WorkProtocolGroomingInputPack;
  issues: WorkProtocolModelOutputValidationIssue[];
}) {
  if (params.value === undefined) {
    return;
  }

  if (!Array.isArray(params.value)) {
    pushIssue(params.issues, {
      path: params.path,
      code: "invalid_field_type",
      message: "issues must be an array.",
    });
    return;
  }

  const nodeIds = new Set(params.pack.nodes.map((node) => node.id));
  const edgeIds = new Set(params.pack.edges.map((edge) => edge.id));
  const departmentIds = new Set(params.pack.departments.map((department) => department.id));

  params.value.forEach((item, index) => {
    const itemPath = `${params.path}[${index}]`;

    if (!isRecord(item)) {
      pushIssue(params.issues, {
        path: itemPath,
        code: "invalid_field_type",
        message: "issue item must be an object.",
      });
      return;
    }

    if (!isRecord(item.target)) {
      pushIssue(params.issues, {
        path: `${itemPath}.target`,
        code: "missing_required_field",
        message: "issue target is required.",
      });
      return;
    }

    const targetKind = item.target.kind;
    const targetId = item.target.id;

    if (
      targetKind !== "protocol" &&
      targetKind !== "department" &&
      targetKind !== "node" &&
      targetKind !== "edge"
    ) {
      pushIssue(params.issues, {
        path: `${itemPath}.target.kind`,
        code: "invalid_issue_target",
        message: "issue target kind must be protocol, department, node, or edge.",
      });
      return;
    }

    if (targetKind === "protocol") {
      return;
    }

    if (!isString(targetId)) {
      pushIssue(params.issues, {
        path: `${itemPath}.target.id`,
        code: "missing_required_field",
        message: "non-protocol issue target must include id.",
      });
      return;
    }

    const exists =
      (targetKind === "node" && nodeIds.has(targetId)) ||
      (targetKind === "edge" && edgeIds.has(targetId)) ||
      (targetKind === "department" && departmentIds.has(targetId));

    if (!exists) {
      pushIssue(params.issues, {
        path: `${itemPath}.target.id`,
        code: "invalid_issue_target",
        message: `issue target ${targetId} does not exist in the input pack.`,
      });
    }
  });
}

function validateContractSelection(params: {
  contractId: string | undefined;
  path: string;
  node: WorkProtocolGroomingInputPackNode;
  pack: WorkProtocolGroomingInputPack;
  issues: WorkProtocolModelOutputValidationIssue[];
}) {
  if (!params.contractId) {
    return;
  }

  if (!params.pack.knownContractIds.includes(params.contractId)) {
    pushIssue(params.issues, {
      path: params.path,
      code: "unknown_contract_id",
      message: `contract ${params.contractId} does not exist in the capability catalog.`,
    });
    return;
  }

  if (!params.node.candidateContractIds.includes(params.contractId)) {
    pushIssue(params.issues, {
      path: params.path,
      code: "contract_not_allowed_for_node",
      message: `contract ${params.contractId} is not allowed for node ${params.node.id}.`,
    });
  }
}

function validateNodeUpdates(params: {
  value: unknown;
  pack: WorkProtocolGroomingInputPack;
  issues: WorkProtocolModelOutputValidationIssue[];
}) {
  if (params.value === undefined) {
    return;
  }

  if (!Array.isArray(params.value)) {
    pushIssue(params.issues, {
      path: "nodeUpdates",
      code: "invalid_field_type",
      message: "nodeUpdates must be an array.",
    });
    return;
  }

  const nodesById = new Map(params.pack.nodes.map((node) => [node.id, node]));

  params.value.forEach((item, index) => {
    const path = `nodeUpdates[${index}]`;

    if (!isRecord(item)) {
      pushIssue(params.issues, {
        path,
        code: "invalid_field_type",
        message: "node update item must be an object.",
      });
      return;
    }

    if (!isString(item.nodeId)) {
      pushIssue(params.issues, {
        path: `${path}.nodeId`,
        code: "missing_required_field",
        message: "node update must include nodeId.",
      });
      return;
    }

    const node = nodesById.get(item.nodeId);

    if (!node) {
      pushIssue(params.issues, {
        path: `${path}.nodeId`,
        code: "unknown_node_id",
        message: `node ${item.nodeId} does not exist in the input pack.`,
      });
      return;
    }

    validateContractSelection({
      contractId: typeof item.contractId === "string" ? item.contractId : undefined,
      path: `${path}.contractId`,
      node,
      pack: params.pack,
      issues: params.issues,
    });

    validateContractSelection({
      contractId: typeof item.callableId === "string" ? item.callableId : undefined,
      path: `${path}.callableId`,
      node,
      pack: params.pack,
      issues: params.issues,
    });

    validateContractSelection({
      contractId:
        typeof item.agentId === "string" ? `agent.${item.agentId}` : undefined,
      path: `${path}.agentId`,
      node,
      pack: params.pack,
      issues: params.issues,
    });

    validateContractSelection({
      contractId:
        typeof item.writableObjectKind === "string"
          ? `write_object.${item.writableObjectKind}`
          : undefined,
      path: `${path}.writableObjectKind`,
      node,
      pack: params.pack,
      issues: params.issues,
    });

    validateContractSelection({
      contractId:
        typeof item.departmentScopeId === "string"
          ? `department_scope.${item.departmentScopeId}`
          : undefined,
      path: `${path}.departmentScopeId`,
      node,
      pack: params.pack,
      issues: params.issues,
    });

    if (item.compiledSpec !== undefined) {
      if (!isRecord(item.compiledSpec)) {
        pushIssue(params.issues, {
          path: `${path}.compiledSpec`,
          code: "invalid_field_type",
          message: "compiledSpec must be an object.",
        });
      } else {
        if (
          isString(item.compiledSpec.nodeId) &&
          item.compiledSpec.nodeId !== node.id
        ) {
          pushIssue(params.issues, {
            path: `${path}.compiledSpec.nodeId`,
            code: "compiled_spec_mismatch",
            message: "compiledSpec.nodeId must match nodeUpdate.nodeId.",
          });
        }

        if (isString(item.compiledSpec.kind) && item.compiledSpec.kind !== node.kind) {
          pushIssue(params.issues, {
            path: `${path}.compiledSpec.kind`,
            code: "compiled_spec_mismatch",
            message: "compiledSpec.kind must match the source node kind.",
          });
        }
      }
    }

    validateIssueTargets({
      value: item.issues,
      path: `${path}.issues`,
      pack: params.pack,
      issues: params.issues,
    });
  });
}

function validateEdgeUpdates(params: {
  value: unknown;
  pack: WorkProtocolGroomingInputPack;
  issues: WorkProtocolModelOutputValidationIssue[];
}) {
  if (params.value === undefined) {
    return;
  }

  if (!Array.isArray(params.value)) {
    pushIssue(params.issues, {
      path: "edgeUpdates",
      code: "invalid_field_type",
      message: "edgeUpdates must be an array.",
    });
    return;
  }

  const edgesById = new Map(params.pack.edges.map((edge) => [edge.id, edge]));
  const transferModes = new Set([
    "communication_prompt",
    "structured_packet",
    "field_mapping",
    "control_signal",
  ]);

  params.value.forEach((item, index) => {
    const path = `edgeUpdates[${index}]`;

    if (!isRecord(item)) {
      pushIssue(params.issues, {
        path,
        code: "invalid_field_type",
        message: "edge update item must be an object.",
      });
      return;
    }

    if (!isString(item.edgeId)) {
      pushIssue(params.issues, {
        path: `${path}.edgeId`,
        code: "missing_required_field",
        message: "edge update must include edgeId.",
      });
      return;
    }

    const edge = edgesById.get(item.edgeId);

    if (!edge) {
      pushIssue(params.issues, {
        path: `${path}.edgeId`,
        code: "unknown_edge_id",
        message: `edge ${item.edgeId} does not exist in the input pack.`,
      });
      return;
    }

    if (
      item.transferMode !== undefined &&
      (!isString(item.transferMode) || !transferModes.has(item.transferMode))
    ) {
      pushIssue(params.issues, {
        path: `${path}.transferMode`,
        code: "invalid_field_type",
        message: "transferMode must be a known transfer mode.",
      });
    }

    if (item.compiledSpec !== undefined) {
      if (!isRecord(item.compiledSpec)) {
        pushIssue(params.issues, {
          path: `${path}.compiledSpec`,
          code: "invalid_field_type",
          message: "compiledSpec must be an object.",
        });
      } else {
        const compiledSpecChecks = [
          ["edgeId", edge.id],
          ["sourceNodeId", edge.sourceNodeId],
          ["targetNodeId", edge.targetNodeId],
        ] as const;

        for (const [field, expected] of compiledSpecChecks) {
          if (
            isString(item.compiledSpec[field]) &&
            item.compiledSpec[field] !== expected
          ) {
            pushIssue(params.issues, {
              path: `${path}.compiledSpec.${field}`,
              code: "compiled_spec_mismatch",
              message: `compiledSpec.${field} must match the source edge.`,
            });
          }
        }
      }
    }

    validateIssueTargets({
      value: item.issues,
      path: `${path}.issues`,
      pack: params.pack,
      issues: params.issues,
    });
  });
}

export function validateWorkProtocolModelGroomingOutput(
  output: unknown,
  inputPack: WorkProtocolGroomingInputPack,
): WorkProtocolModelOutputValidationResult {
  const issues: WorkProtocolModelOutputValidationIssue[] = [];

  if (!isRecord(output)) {
    return {
      valid: false,
      issues: [
        {
          path: "$",
          code: "invalid_root",
          message: "model output must be a JSON object.",
        },
      ],
    };
  }

  if (output.schemaVersion !== "work-protocol-model-grooming-output.v1") {
    pushIssue(issues, {
      path: "schemaVersion",
      code: "invalid_schema_version",
      message: "model output schemaVersion must be work-protocol-model-grooming-output.v1.",
    });
  }

  if (
    output.status !== "groomed" &&
    output.status !== "needs_user_input" &&
    output.status !== "invalid"
  ) {
    pushIssue(issues, {
      path: "status",
      code: "invalid_status",
      message: "model output status must be groomed, needs_user_input, or invalid.",
    });
  }

  validateNodeUpdates({
    value: output.nodeUpdates,
    pack: inputPack,
    issues,
  });
  validateEdgeUpdates({
    value: output.edgeUpdates,
    pack: inputPack,
    issues,
  });
  validateIssueTargets({
    value: output.issues,
    path: "issues",
    pack: inputPack,
    issues,
  });

  return {
    valid: issues.length === 0,
    issues,
    normalizedOutput: issues.length === 0 ? (output as WorkProtocolModelGroomingOutput) : undefined,
  };
}
