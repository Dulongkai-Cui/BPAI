import {
  buildCapabilityContracts,
  summarizeCapabilityContracts,
} from "@/lib/work-protocol/catalog";
import {
  compileWorkProtocolDraftV0,
  type WorkProtocolCompileOptions,
  type WorkProtocolCompileResult,
  type WorkProtocolParameterCodeBlock,
} from "@/lib/work-protocol/compiler";
import {
  buildWorkProtocolGroomingInputPack,
  type WorkProtocolGroomingInputPack,
} from "@/lib/work-protocol/grooming-contract";
import {
  buildWorkProtocolGroomingAudit,
  type WorkProtocolGroomingAudit,
} from "@/lib/work-protocol/grooming-audit";
import type {
  CapabilityCatalog,
  CapabilityContract,
  CanvasDepartmentDraft,
  CanvasEdgeDraft,
  CanvasNodeDraft,
  CompiledEdgeSpec,
  CompiledNodeSpec,
  ProtocolIssue,
  WorkProtocolDraft,
} from "@/lib/work-protocol/types";

export type WorkProtocolGroomingStatus =
  | "groomed"
  | "groomed_with_issues"
  | "invalid";

export type WorkProtocolGroomingAnnotationStatus = "ok" | "warning" | "error";

export type WorkProtocolGroomingTargetAnnotation = {
  targetId: string;
  label: string;
  status: WorkProtocolGroomingAnnotationStatus;
  issues: ProtocolIssue[];
  parameterCodeBlock?: WorkProtocolParameterCodeBlock;
};

export type WorkProtocolGroomingProtocolSummary = {
  status: WorkProtocolGroomingAnnotationStatus;
  groomingStatus: WorkProtocolGroomingStatus;
  errors: number;
  warnings: number;
  info: number;
  canRegister: boolean;
  message: string;
  suggestions: string[];
  issues: ProtocolIssue[];
  parameterCodeBlock?: WorkProtocolParameterCodeBlock;
};

export type WorkProtocolGroomingResult = {
  schemaVersion: "work-protocol-grooming.v0";
  strategy: "deterministic_catalog";
  status: WorkProtocolGroomingStatus;
  groomedDraft: WorkProtocolDraft;
  compileResult: WorkProtocolCompileResult;
  modelInputPack: WorkProtocolGroomingInputPack;
  audit: WorkProtocolGroomingAudit;
  parameterCodeBlocks: WorkProtocolParameterCodeBlock[];
  protocolSummary: WorkProtocolGroomingProtocolSummary;
  departmentAnnotations: Record<string, WorkProtocolGroomingTargetAnnotation>;
  nodeAnnotations: Record<string, WorkProtocolGroomingTargetAnnotation>;
  edgeAnnotations: Record<string, WorkProtocolGroomingTargetAnnotation>;
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

function annotationStatusFromIssues(
  issues: ProtocolIssue[],
): WorkProtocolGroomingAnnotationStatus {
  if (issues.some((issue) => issue.severity === "error")) {
    return "error";
  }

  if (issues.some((issue) => issue.severity === "warning")) {
    return "warning";
  }

  return "ok";
}

function getGroomingStatus(
  compileResult: WorkProtocolCompileResult,
): WorkProtocolGroomingStatus {
  if (!compileResult.compiled || !compileResult.validation.valid) {
    return "invalid";
  }

  if (
    compileResult.validation.summary.errors > 0 ||
    compileResult.validation.summary.warnings > 0
  ) {
    return "groomed_with_issues";
  }

  return "groomed";
}

function parameterBlockByTarget(
  parameterCodeBlocks: WorkProtocolParameterCodeBlock[],
) {
  const map = new Map<string, WorkProtocolParameterCodeBlock>();

  for (const block of parameterCodeBlocks) {
    map.set(`${block.target}:${block.targetId}`, block);
  }

  return map;
}

function issuesByTarget(issues: ProtocolIssue[]) {
  const map = new Map<string, ProtocolIssue[]>();

  for (const issue of issues) {
    const key = `${issue.target.kind}:${issue.target.id ?? "root"}`;
    map.set(key, [...(map.get(key) ?? []), issue]);
  }

  return map;
}

function uniqueSuggestions(issues: ProtocolIssue[]) {
  return Array.from(
    new Set(
      issues
        .map((issue) => issue.suggestion?.trim())
        .filter((suggestion): suggestion is string => Boolean(suggestion)),
    ),
  );
}

function buildProtocolMessage(params: {
  status: WorkProtocolGroomingStatus;
  errors: number;
  warnings: number;
}) {
  if (params.errors > 0) {
    return `协议梳理发现 ${params.errors} 个阻塞问题，需要修正后才能注册。`;
  }

  if (params.warnings > 0) {
    return `协议梳理完成，但还有 ${params.warnings} 个警告，建议确认后再注册。`;
  }

  if (params.status === "groomed") {
    return "协议梳理完成，可以保存梳理稿或注册为工作协议。";
  }

  return "协议梳理完成，请检查返回的参数代码和问题列表。";
}

function buildProtocolSummary(params: {
  compileResult: WorkProtocolCompileResult;
  status: WorkProtocolGroomingStatus;
  parameterCodeBlocks: WorkProtocolParameterCodeBlock[];
}): WorkProtocolGroomingProtocolSummary {
  const protocolIssues = params.compileResult.validation.issues.filter(
    (issue) => issue.target.kind === "protocol",
  );
  const summary = params.compileResult.validation.summary;
  const parameterCodeBlock = params.parameterCodeBlocks.find(
    (block) => block.target === "protocol",
  );

  return {
    status: annotationStatusFromIssues(params.compileResult.validation.issues),
    groomingStatus: params.status,
    errors: summary.errors,
    warnings: summary.warnings,
    info: summary.info,
    canRegister: params.compileResult.validation.canRegister,
    message: buildProtocolMessage({
      status: params.status,
      errors: summary.errors,
      warnings: summary.warnings,
    }),
    suggestions: uniqueSuggestions(params.compileResult.validation.issues),
    issues: protocolIssues,
    parameterCodeBlock,
  };
}

function departmentLabel(department: CanvasDepartmentDraft) {
  const scope = [
    department.primaryScopeLabel,
    department.secondaryScopeLabel,
    department.tertiaryScopeLabel,
  ]
    .filter(Boolean)
    .join(" / ");

  return scope
    ? `${department.departmentLabel} / ${scope}`
    : department.departmentLabel;
}

function nodeLabel(node: CanvasNodeDraft) {
  return node.title || node.kind;
}

function edgeLabel(edge: CanvasEdgeDraft) {
  return `${edge.sourceNodeId} -> ${edge.targetNodeId}`;
}

function buildTargetAnnotation(params: {
  targetId: string;
  label: string;
  issues: ProtocolIssue[];
  parameterCodeBlock?: WorkProtocolParameterCodeBlock;
}): WorkProtocolGroomingTargetAnnotation {
  return {
    targetId: params.targetId,
    label: params.label,
    status: annotationStatusFromIssues(params.issues),
    issues: params.issues,
    parameterCodeBlock: params.parameterCodeBlock,
  };
}

function buildAnnotations(params: {
  draft: WorkProtocolDraft;
  compileResult: WorkProtocolCompileResult;
  parameterCodeBlocks: WorkProtocolParameterCodeBlock[];
}) {
  const issueMap = issuesByTarget(params.compileResult.validation.issues);
  const parameterMap = parameterBlockByTarget(params.parameterCodeBlocks);
  const departmentAnnotations = Object.fromEntries(
    params.draft.departments.map((department) => [
      department.id,
      buildTargetAnnotation({
        targetId: department.id,
        label: departmentLabel(department),
        issues: issueMap.get(`department:${department.id}`) ?? [],
      }),
    ]),
  );
  const nodeAnnotations = Object.fromEntries(
    params.draft.nodes.map((node) => [
      node.id,
      buildTargetAnnotation({
        targetId: node.id,
        label: nodeLabel(node),
        issues: issueMap.get(`node:${node.id}`) ?? [],
        parameterCodeBlock: parameterMap.get(`node:${node.id}`),
      }),
    ]),
  );
  const edgeAnnotations = Object.fromEntries(
    params.draft.edges.map((edge) => [
      edge.id,
      buildTargetAnnotation({
        targetId: edge.id,
        label: edgeLabel(edge),
        issues: issueMap.get(`edge:${edge.id}`) ?? [],
        parameterCodeBlock: parameterMap.get(`edge:${edge.id}`),
      }),
    ]),
  );

  return {
    departmentAnnotations,
    nodeAnnotations,
    edgeAnnotations,
  };
}

function summarizeContract(contract: CapabilityContract | undefined) {
  if (!contract) {
    return null;
  }

  return {
    id: contract.id,
    kind: contract.kind,
    label: contract.label,
    status: contract.status,
    riskLevel: contract.riskLevel,
    scopes: contract.scopes,
    permissions: contract.permissions,
    inputSchema: contract.inputSchema,
    outputSchema: contract.outputSchema,
    parameterHints: contract.parameterHints,
    approvalPolicy: contract.approvalPolicy,
    mutatesData: contract.mutatesData,
    requiresConfirmationDefault: contract.requiresConfirmationDefault,
  };
}

function nodeExecutionContractId(node: CanvasNodeDraft, compiled?: CompiledNodeSpec) {
  const callableId = compiled?.callableId ?? node.callableId;
  const agentId = compiled?.agentId ?? node.agentId;
  const writableObjectKind =
    compiled?.writableObjectKind ?? node.writableObjectKind;

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

function departmentScopeContractId(
  node: CanvasNodeDraft,
  draft: WorkProtocolDraft,
  compiled?: CompiledNodeSpec,
) {
  if (compiled?.departmentScopeId) {
    return `department_scope.${compiled.departmentScopeId}`;
  }

  const department = node.departmentDraftId
    ? draft.departments.find((item) => item.id === node.departmentDraftId)
    : undefined;

  return department ? `department_scope.${department.primaryScopeId}` : undefined;
}

function enrichNodeParameterBlock(params: {
  block: WorkProtocolParameterCodeBlock;
  node: CanvasNodeDraft;
  draft: WorkProtocolDraft;
  compiled?: CompiledNodeSpec;
  contractsById: Map<string, CapabilityContract>;
}) {
  const nodeKindContract = params.contractsById.get(
    `node_kind.${params.node.kind}`,
  );
  const executionContractId = nodeExecutionContractId(
    params.node,
    params.compiled,
  );
  const executionContract = executionContractId
    ? params.contractsById.get(executionContractId)
    : undefined;
  const departmentScopeId = departmentScopeContractId(
    params.node,
    params.draft,
    params.compiled,
  );
  const departmentScopeContract = departmentScopeId
    ? params.contractsById.get(departmentScopeId)
    : undefined;

  return {
    ...params.block,
    code: {
      ...params.block.code,
      capabilityContracts: {
        nodeKind: summarizeContract(nodeKindContract),
        execution: summarizeContract(executionContract),
        departmentScope: summarizeContract(departmentScopeContract),
      },
      contractParameterOptions: {
        requiredInputs:
          executionContract?.parameterHints?.requiredInputs ??
          nodeKindContract?.parameterHints?.requiredInputs ??
          [],
        optionalInputs:
          executionContract?.parameterHints?.optionalInputs ??
          nodeKindContract?.parameterHints?.optionalInputs ??
          [],
        outputs:
          executionContract?.parameterHints?.outputs ??
          nodeKindContract?.parameterHints?.outputs ??
          [],
        inputSchema:
          executionContract?.inputSchema ?? nodeKindContract?.inputSchema ?? {},
        outputSchema:
          executionContract?.outputSchema ?? nodeKindContract?.outputSchema ?? {},
        scopes: executionContract?.scopes ?? departmentScopeContract?.scopes ?? [],
        permissions: [
          ...(nodeKindContract?.permissions ?? []),
          ...(departmentScopeContract?.permissions ?? []),
          ...(executionContract?.permissions ?? []),
        ],
        status:
          executionContract?.status ??
          nodeKindContract?.status ??
          departmentScopeContract?.status,
      },
    },
  } satisfies WorkProtocolParameterCodeBlock;
}

function enrichEdgeParameterBlock(params: {
  block: WorkProtocolParameterCodeBlock;
  edge: CanvasEdgeDraft;
  compiled?: CompiledEdgeSpec;
  compiledNodesById: Map<string, CompiledNodeSpec>;
  nodeBlocksById: Map<string, WorkProtocolParameterCodeBlock>;
}) {
  const sourceNode = params.compiledNodesById.get(params.edge.sourceNodeId);
  const targetNode = params.compiledNodesById.get(params.edge.targetNodeId);
  const sourceBlock = params.nodeBlocksById.get(params.edge.sourceNodeId);
  const targetBlock = params.nodeBlocksById.get(params.edge.targetNodeId);

  return {
    ...params.block,
    code: {
      ...params.block.code,
      contractFlow: {
        source: {
          nodeId: params.edge.sourceNodeId,
          outputs: sourceNode?.outputFields ?? [],
          contracts: sourceBlock?.code.capabilityContracts ?? null,
        },
        target: {
          nodeId: params.edge.targetNodeId,
          requiredInputs:
            targetBlock?.code.contractParameterOptions &&
            typeof targetBlock.code.contractParameterOptions === "object"
              ? (targetBlock.code.contractParameterOptions as Record<string, unknown>)
                  .requiredInputs
              : [],
          inputBindings: targetNode?.inputBindings ?? [],
          contracts: targetBlock?.code.capabilityContracts ?? null,
        },
        transfer: {
          mode: params.compiled?.transferMode ?? "communication_prompt",
          requiredFields: params.compiled?.requiredFields ?? [],
          fieldMappings: params.compiled?.fieldMappings ?? [],
          outputPacketSchema: params.compiled?.outputPacketSchema,
        },
      },
    },
  } satisfies WorkProtocolParameterCodeBlock;
}

function enrichProtocolParameterBlock(params: {
  block: WorkProtocolParameterCodeBlock;
  catalog: CapabilityCatalog;
  contracts: CapabilityContract[];
}) {
  return {
    ...params.block,
    code: {
      ...params.block.code,
      capabilityContracts: {
        contractVersion: "capability-contract.v1",
        catalogHash: params.catalog.catalogHash,
        counts: summarizeCapabilityContracts(params.contracts),
      },
    },
  } satisfies WorkProtocolParameterCodeBlock;
}

function enrichParameterCodeBlocksWithContracts(params: {
  draft: WorkProtocolDraft;
  catalog: CapabilityCatalog;
  compileResult: WorkProtocolCompileResult;
}) {
  const contracts = buildCapabilityContracts(params.catalog);
  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
  const compiledNodesById = new Map(
    (params.compileResult.compiled?.nodes ?? []).map((node) => [
      node.nodeId,
      node,
    ]),
  );
  const compiledEdgesById = new Map(
    (params.compileResult.compiled?.edges ?? []).map((edge) => [
      edge.edgeId,
      edge,
    ]),
  );
  const baseBlocks = params.compileResult.parameterCodeBlocks;
  const nodeBlocksById = new Map<string, WorkProtocolParameterCodeBlock>();

  const protocolAndNodeBlocks = baseBlocks.map((block) => {
    if (block.target === "protocol") {
      return enrichProtocolParameterBlock({
        block,
        catalog: params.catalog,
        contracts,
      });
    }

    if (block.target !== "node") {
      return block;
    }

    const node = params.draft.nodes.find((item) => item.id === block.targetId);

    if (!node) {
      return block;
    }

    const enriched = enrichNodeParameterBlock({
      block,
      node,
      draft: params.draft,
      compiled: compiledNodesById.get(node.id),
      contractsById,
    });
    nodeBlocksById.set(node.id, enriched);

    return enriched;
  });

  return protocolAndNodeBlocks.map((block) => {
    if (block.target !== "edge") {
      return block;
    }

    const edge = params.draft.edges.find((item) => item.id === block.targetId);

    if (!edge) {
      return block;
    }

    return enrichEdgeParameterBlock({
      block,
      edge,
      compiled: compiledEdgesById.get(edge.id),
      compiledNodesById,
      nodeBlocksById,
    });
  });
}

export function groomWorkProtocolDraftV0(
  draft: WorkProtocolDraft,
  catalog: CapabilityCatalog,
  options?: WorkProtocolCompileOptions,
): WorkProtocolGroomingResult {
  const compileResult = compileWorkProtocolDraftV0(draft, catalog, {
    mode: options?.mode ?? "draft",
    allowMockCapabilities: options?.allowMockCapabilities,
    allowPlannedCapabilities: options?.allowPlannedCapabilities,
    allowDisabledCapabilities: options?.allowDisabledCapabilities,
  });
  const validationSummary = compileResult.validation.summary;
  const status = getGroomingStatus(compileResult);
  const parameterCodeBlocks = enrichParameterCodeBlocksWithContracts({
    draft: compileResult.draft,
    catalog,
    compileResult,
  });
  const modelInputPack = buildWorkProtocolGroomingInputPack({
    draft: compileResult.draft,
    catalog,
  });
  const annotations = buildAnnotations({
    draft: compileResult.draft,
    compileResult,
    parameterCodeBlocks,
  });
  const protocolSummary = buildProtocolSummary({
    compileResult,
    status,
    parameterCodeBlocks,
  });
  const resultWithoutAudit = {
    schemaVersion: "work-protocol-grooming.v0",
    strategy: "deterministic_catalog",
    status,
    groomedDraft: compileResult.draft,
    compileResult,
    modelInputPack,
    parameterCodeBlocks,
    protocolSummary,
    departmentAnnotations: annotations.departmentAnnotations,
    nodeAnnotations: annotations.nodeAnnotations,
    edgeAnnotations: annotations.edgeAnnotations,
    summary: {
      errors: validationSummary.errors,
      warnings: validationSummary.warnings,
      info: validationSummary.info,
      nodes: validationSummary.nodes,
      edges: validationSummary.edges,
      departments: validationSummary.departments,
      compiledNodes: compileResult.compiled?.nodes.length ?? 0,
      compiledEdges: compileResult.compiled?.edges.length ?? 0,
      parameterCodeBlocks: parameterCodeBlocks.length,
      canRegister: compileResult.validation.canRegister,
    },
  } satisfies Omit<WorkProtocolGroomingResult, "audit">;

  return {
    ...resultWithoutAudit,
    audit: buildWorkProtocolGroomingAudit({
      deterministic: resultWithoutAudit,
    }),
  };
}
