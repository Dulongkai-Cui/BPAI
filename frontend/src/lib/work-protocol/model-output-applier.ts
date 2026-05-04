import {
  buildWorkProtocolGroomingInputPack,
  validateWorkProtocolModelGroomingOutput,
  type WorkProtocolGroomingInputPack,
  type WorkProtocolModelEdgeUpdate,
  type WorkProtocolModelGroomingOutput,
  type WorkProtocolModelNodeUpdate,
  type WorkProtocolModelOutputValidationResult,
} from "@/lib/work-protocol/grooming-contract";
import type {
  CapabilityCatalog,
  CanvasEdgeDraft,
  CanvasNodeDraft,
  CompiledEdgeSpec,
  CompiledFieldMapping,
  JsonSchema,
  WorkProtocolDraft,
} from "@/lib/work-protocol/types";

export type WorkProtocolModelOutputApplicationStatus =
  | "applied"
  | "applied_with_warnings"
  | "rejected";

export type WorkProtocolModelOutputAppliedChange = {
  target: "node" | "edge";
  targetId: string;
  path: string;
  before?: unknown;
  after?: unknown;
};

export type WorkProtocolModelOutputIgnoredChange = {
  target: "node" | "edge";
  targetId: string;
  path: string;
  reason:
    | "validation_failed"
    | "unsupported_patch"
    | "not_applicable_for_node_kind"
    | "no_effect";
  message: string;
};

export type WorkProtocolModelOutputApplicationResult = {
  schemaVersion: "work-protocol-model-output-application.v1";
  status: WorkProtocolModelOutputApplicationStatus;
  validation: WorkProtocolModelOutputValidationResult;
  inputPack: WorkProtocolGroomingInputPack;
  appliedDraft: WorkProtocolDraft;
  appliedChanges: WorkProtocolModelOutputAppliedChange[];
  ignoredChanges: WorkProtocolModelOutputIgnoredChange[];
};

function trim(value: string | undefined) {
  return value?.trim() ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneDraft(draft: WorkProtocolDraft): WorkProtocolDraft {
  return {
    ...draft,
    departments: draft.departments.map((department) => ({ ...department })),
    nodes: draft.nodes.map((node) => ({
      ...node,
      compiledSpec: node.compiledSpec ? { ...node.compiledSpec } : undefined,
    })),
    edges: draft.edges.map((edge) => ({
      ...edge,
      compiledSpec: edge.compiledSpec ? { ...edge.compiledSpec } : undefined,
    })),
    triggerDrafts: draft.triggerDrafts.map((trigger) => ({
      ...trigger,
      keywords: trigger.keywords ? [...trigger.keywords] : undefined,
      intentHints: trigger.intentHints ? [...trigger.intentHints] : undefined,
    })),
  };
}

function addAppliedChange(
  changes: WorkProtocolModelOutputAppliedChange[],
  change: WorkProtocolModelOutputAppliedChange,
) {
  if (change.before === change.after) {
    return;
  }

  changes.push(change);
}

function addIgnoredChange(
  ignoredChanges: WorkProtocolModelOutputIgnoredChange[],
  change: WorkProtocolModelOutputIgnoredChange,
) {
  ignoredChanges.push(change);
}

function getNodeDepartmentScopeId(
  node: CanvasNodeDraft,
  draft: WorkProtocolDraft,
) {
  if (node.compiledSpec?.departmentScopeId) {
    return node.compiledSpec.departmentScopeId;
  }

  if (!node.departmentDraftId) {
    return undefined;
  }

  return draft.departments.find((department) => department.id === node.departmentDraftId)
    ?.primaryScopeId;
}

function markNodeStale(node: CanvasNodeDraft) {
  return {
    ...node,
    compiledSpec: undefined,
    compiledSpecStatus: "stale" as const,
  };
}

function applyCallablePatch(params: {
  node: CanvasNodeDraft;
  update: WorkProtocolModelNodeUpdate;
  changes: WorkProtocolModelOutputAppliedChange[];
  ignoredChanges: WorkProtocolModelOutputIgnoredChange[];
}) {
  const callableId = trim(params.update.callableId);

  if (!callableId) {
    return params.node;
  }

  if (
    params.node.kind !== "tool_call" &&
    params.node.kind !== "skill_call" &&
    params.node.kind !== "rag_search"
  ) {
    addIgnoredChange(params.ignoredChanges, {
      target: "node",
      targetId: params.node.id,
      path: "callableId",
      reason: "not_applicable_for_node_kind",
      message: "callableId can only be applied to tool_call, skill_call, or rag_search nodes.",
    });
    return params.node;
  }

  addAppliedChange(params.changes, {
    target: "node",
    targetId: params.node.id,
    path: "callableId",
    before: params.node.callableId,
    after: callableId,
  });

  return markNodeStale({
    ...params.node,
    callableId,
  });
}

function applyAgentPatch(params: {
  node: CanvasNodeDraft;
  update: WorkProtocolModelNodeUpdate;
  changes: WorkProtocolModelOutputAppliedChange[];
  ignoredChanges: WorkProtocolModelOutputIgnoredChange[];
}) {
  const agentId = trim(params.update.agentId);

  if (!agentId) {
    return params.node;
  }

  if (params.node.kind !== "agent_task") {
    addIgnoredChange(params.ignoredChanges, {
      target: "node",
      targetId: params.node.id,
      path: "agentId",
      reason: "not_applicable_for_node_kind",
      message: "agentId can only be applied to agent_task nodes.",
    });
    return params.node;
  }

  addAppliedChange(params.changes, {
    target: "node",
    targetId: params.node.id,
    path: "agentId",
    before: params.node.agentId,
    after: agentId,
  });

  return markNodeStale({
    ...params.node,
    agentId,
  });
}

function applyWritableObjectPatch(params: {
  node: CanvasNodeDraft;
  update: WorkProtocolModelNodeUpdate;
  changes: WorkProtocolModelOutputAppliedChange[];
  ignoredChanges: WorkProtocolModelOutputIgnoredChange[];
}) {
  const writableObjectKind = trim(params.update.writableObjectKind);

  if (!writableObjectKind) {
    return params.node;
  }

  if (params.node.kind !== "write_object") {
    addIgnoredChange(params.ignoredChanges, {
      target: "node",
      targetId: params.node.id,
      path: "writableObjectKind",
      reason: "not_applicable_for_node_kind",
      message: "writableObjectKind can only be applied to write_object nodes.",
    });
    return params.node;
  }

  addAppliedChange(params.changes, {
    target: "node",
    targetId: params.node.id,
    path: "writableObjectKind",
    before: params.node.writableObjectKind,
    after: writableObjectKind,
  });

  return markNodeStale({
    ...params.node,
    writableObjectKind,
  });
}

function applyDepartmentScopePatch(params: {
  draft: WorkProtocolDraft;
  node: CanvasNodeDraft;
  update: WorkProtocolModelNodeUpdate;
  ignoredChanges: WorkProtocolModelOutputIgnoredChange[];
}) {
  const departmentScopeId = trim(params.update.departmentScopeId);

  if (!departmentScopeId) {
    return;
  }

  const currentScopeId = getNodeDepartmentScopeId(params.node, params.draft);

  if (departmentScopeId === currentScopeId) {
    addIgnoredChange(params.ignoredChanges, {
      target: "node",
      targetId: params.node.id,
      path: "departmentScopeId",
      reason: "no_effect",
      message: "departmentScopeId already matches the node department sandbox.",
    });
    return;
  }

  addIgnoredChange(params.ignoredChanges, {
    target: "node",
    targetId: params.node.id,
    path: "departmentScopeId",
    reason: "unsupported_patch",
    message:
      "departmentScopeId cannot be applied directly; move the node into another department draft first.",
  });
}

function applyNodeUpdate(params: {
  draft: WorkProtocolDraft;
  node: CanvasNodeDraft;
  update: WorkProtocolModelNodeUpdate;
  changes: WorkProtocolModelOutputAppliedChange[];
  ignoredChanges: WorkProtocolModelOutputIgnoredChange[];
}) {
  let node = params.node;

  applyDepartmentScopePatch({
    draft: params.draft,
    node,
    update: params.update,
    ignoredChanges: params.ignoredChanges,
  });

  node = applyCallablePatch({
    node,
    update: params.update,
    changes: params.changes,
    ignoredChanges: params.ignoredChanges,
  });
  node = applyAgentPatch({
    node,
    update: params.update,
    changes: params.changes,
    ignoredChanges: params.ignoredChanges,
  });
  node = applyWritableObjectPatch({
    node,
    update: params.update,
    changes: params.changes,
    ignoredChanges: params.ignoredChanges,
  });

  if (trim(params.update.intentSummary)) {
    addIgnoredChange(params.ignoredChanges, {
      target: "node",
      targetId: params.node.id,
      path: "intentSummary",
      reason: "unsupported_patch",
      message:
        "intentSummary is kept as model guidance for now; the raw node prompt is not overwritten.",
    });
  }

  if (params.update.compiledSpec) {
    addIgnoredChange(params.ignoredChanges, {
      target: "node",
      targetId: params.node.id,
      path: "compiledSpec",
      reason: "unsupported_patch",
      message:
        "model supplied node compiledSpec is not written directly; deterministic compile will regenerate it.",
    });
  }

  return node;
}

function asFieldMappings(value: unknown, fallback: CompiledFieldMapping[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .filter(isRecord)
    .map((item) => ({
      fromPath: typeof item.fromPath === "string" ? item.fromPath : "",
      toPath: typeof item.toPath === "string" ? item.toPath : "",
      required: item.required === true,
    }))
    .filter((item) => item.fromPath && item.toPath);
}

function asStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function asJsonSchema(value: unknown, fallback: JsonSchema | undefined) {
  return isRecord(value) ? (value as JsonSchema) : fallback;
}

function getCompiledEdgePatch(update: WorkProtocolModelEdgeUpdate) {
  return isRecord(update.compiledSpec) ? update.compiledSpec : {};
}

function buildAppliedEdgeSpec(
  edge: CanvasEdgeDraft,
  update: WorkProtocolModelEdgeUpdate,
): CompiledEdgeSpec {
  const compiledPatch = getCompiledEdgePatch(update);
  const currentSpec = edge.compiledSpec;
  const transferMode =
    update.transferMode ??
    (typeof compiledPatch.transferMode === "string"
      ? compiledPatch.transferMode
      : undefined) ??
    currentSpec?.transferMode ??
    "communication_prompt";
  const prompt =
    trim(update.prompt) ||
    (typeof compiledPatch.prompt === "string" ? trim(compiledPatch.prompt) : "") ||
    currentSpec?.prompt ||
    trim(edge.transferIntent) ||
    "请编辑传输内容，默认是通讯提示词";

  return {
    edgeId: edge.id,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    transferMode,
    prompt,
    fieldMappings: asFieldMappings(
      compiledPatch.fieldMappings,
      currentSpec?.fieldMappings ?? [],
    ),
    requiredFields: asStringArray(
      compiledPatch.requiredFields,
      currentSpec?.requiredFields ?? [],
    ),
    outputPacketSchema: asJsonSchema(
      compiledPatch.outputPacketSchema,
      currentSpec?.outputPacketSchema,
    ),
  };
}

function applyEdgeUpdate(params: {
  edge: CanvasEdgeDraft;
  update: WorkProtocolModelEdgeUpdate;
  changes: WorkProtocolModelOutputAppliedChange[];
}) {
  const compiledSpec = buildAppliedEdgeSpec(params.edge, params.update);

  addAppliedChange(params.changes, {
    target: "edge",
    targetId: params.edge.id,
    path: "compiledSpec.transferMode",
    before: params.edge.compiledSpec?.transferMode,
    after: compiledSpec.transferMode,
  });
  addAppliedChange(params.changes, {
    target: "edge",
    targetId: params.edge.id,
    path: "compiledSpec.prompt",
    before: params.edge.compiledSpec?.prompt,
    after: compiledSpec.prompt,
  });

  return {
    ...params.edge,
    compiledSpec,
    compiledSpecStatus: "stale" as const,
  };
}

function deriveStatus(params: {
  validation: WorkProtocolModelOutputValidationResult;
  appliedChanges: WorkProtocolModelOutputAppliedChange[];
  ignoredChanges: WorkProtocolModelOutputIgnoredChange[];
}): WorkProtocolModelOutputApplicationStatus {
  if (!params.validation.valid) {
    return "rejected";
  }

  if (params.ignoredChanges.length > 0) {
    return "applied_with_warnings";
  }

  return "applied";
}

export function applyWorkProtocolModelGroomingOutput(params: {
  draft: WorkProtocolDraft;
  catalog: CapabilityCatalog;
  modelOutput: unknown;
  inputPack?: WorkProtocolGroomingInputPack;
}): WorkProtocolModelOutputApplicationResult {
  const inputPack =
    params.inputPack ??
    buildWorkProtocolGroomingInputPack({
      draft: params.draft,
      catalog: params.catalog,
    });
  const validation = validateWorkProtocolModelGroomingOutput(
    params.modelOutput,
    inputPack,
  );
  const appliedChanges: WorkProtocolModelOutputAppliedChange[] = [];
  const ignoredChanges: WorkProtocolModelOutputIgnoredChange[] = [];

  if (!validation.valid || !validation.normalizedOutput) {
    return {
      schemaVersion: "work-protocol-model-output-application.v1",
      status: "rejected",
      validation,
      inputPack,
      appliedDraft: params.draft,
      appliedChanges,
      ignoredChanges: [
        {
          target: "node",
          targetId: params.draft.id,
          path: "$",
          reason: "validation_failed",
          message: "model output was rejected before patch application.",
        },
      ],
    };
  }

  const modelOutput = validation.normalizedOutput as WorkProtocolModelGroomingOutput;
  const draft = cloneDraft(params.draft);
  const nodeUpdatesById = new Map(
    (modelOutput.nodeUpdates ?? []).map((update) => [update.nodeId, update]),
  );
  const edgeUpdatesById = new Map(
    (modelOutput.edgeUpdates ?? []).map((update) => [update.edgeId, update]),
  );
  const nodes = draft.nodes.map((node) => {
    const update = nodeUpdatesById.get(node.id);

    if (!update) {
      return node;
    }

    return applyNodeUpdate({
      draft,
      node,
      update,
      changes: appliedChanges,
      ignoredChanges,
    });
  });
  const edges = draft.edges.map((edge) => {
    const update = edgeUpdatesById.get(edge.id);

    if (!update) {
      return edge;
    }

    return applyEdgeUpdate({
      edge,
      update,
      changes: appliedChanges,
    });
  });
  const appliedDraft = {
    ...draft,
    nodes,
    edges,
    compileStatus: appliedChanges.length > 0 ? ("stale" as const) : draft.compileStatus,
    updatedAt: appliedChanges.length > 0 ? new Date().toISOString() : draft.updatedAt,
  };

  return {
    schemaVersion: "work-protocol-model-output-application.v1",
    status: deriveStatus({
      validation,
      appliedChanges,
      ignoredChanges,
    }),
    validation,
    inputPack,
    appliedDraft,
    appliedChanges,
    ignoredChanges,
  };
}
