import {
  compileWorkProtocolDraftV0,
  type WorkProtocolParameterCodeBlock,
} from "@/lib/work-protocol/compiler";
import { preflightWorkProtocolNode } from "@/lib/work-protocol/preflight";
import type {
  CapabilityCatalog,
  CanvasEdgeDraft,
  CanvasNodeDraft,
  CompiledEdgeSpec,
  CompiledFailurePolicy,
  CompiledFieldMapping,
  CompiledInputBinding,
  CompiledOutputField,
  CompiledRetryPolicy,
  JsonSchema,
  JsonValue,
  ProtocolApprovalPolicy,
  ProtocolIssue,
  ProtocolRiskLevel,
  ProtocolTriggerRule,
  WorkProtocolDraft,
} from "@/lib/work-protocol/types";
import type { WorkProtocolValidationMode } from "@/lib/work-protocol/validator";

export type WorkProtocolParameterPatchMode = "dry_run" | "apply";

export type WorkProtocolParameterPatchTarget =
  | { kind: "protocol"; draftId?: string }
  | { kind: "node"; nodeId: string }
  | { kind: "edge"; edgeId: string };

export type WorkProtocolParameterPatchOperation = {
  operationId?: string;
  target: WorkProtocolParameterPatchTarget;
  path: string;
  value: JsonValue;
  reason?: string;
};

export type WorkProtocolParameterPatchIssueCode =
  | "missing_operation"
  | "unknown_target"
  | "path_not_allowed"
  | "compiled_spec_missing"
  | "invalid_value"
  | "no_effect"
  | "compile_validation_failed"
  | "runtime_preflight_failed";

export type WorkProtocolParameterPatchIssue = {
  operationId?: string;
  target: WorkProtocolParameterPatchTarget;
  path: string;
  code: WorkProtocolParameterPatchIssueCode;
  message: string;
  detail?: JsonValue;
};

export type WorkProtocolParameterPatchAppliedChange = {
  operationId?: string;
  target: WorkProtocolParameterPatchTarget;
  path: string;
  before?: JsonValue;
  after: JsonValue;
  reason?: string;
};

export type WorkProtocolParameterPatchResult = {
  schemaVersion: "work-protocol-parameter-patch.v1";
  status: "validated" | "applied" | "rejected" | "no_effect";
  mode: WorkProtocolParameterPatchMode;
  draft: WorkProtocolDraft;
  beforeDraft: WorkProtocolDraft;
  candidateDraft: WorkProtocolDraft;
  appliedChanges: WorkProtocolParameterPatchAppliedChange[];
  rejectedChanges: WorkProtocolParameterPatchIssue[];
  validation: ReturnType<typeof compileWorkProtocolDraftV0>["validation"];
  preflightIssues: ProtocolIssue[];
  parameterCodeBlocks: WorkProtocolParameterCodeBlock[];
  catalogHash?: string;
};

export type WorkProtocolParameterPatchOptions = {
  mode?: WorkProtocolParameterPatchMode;
  validationMode?: WorkProtocolValidationMode;
  allowMockCapabilities?: boolean;
  allowPlannedCapabilities?: boolean;
  allowDisabledCapabilities?: boolean;
};

const RISK_LEVELS = new Set<ProtocolRiskLevel>([
  "none",
  "low",
  "medium",
  "high",
  "critical",
]);
const APPROVAL_POLICIES = new Set<ProtocolApprovalPolicy>([
  "none",
  "recommended",
  "required",
]);
const INPUT_BINDING_SOURCES = new Set<CompiledInputBinding["source"]>([
  "user_input",
  "context_packet",
  "node_output",
  "constant",
  "department_scope",
  "runtime",
]);
const FAILURE_MODES = new Set<CompiledFailurePolicy["mode"]>([
  "fail_protocol",
  "skip_node",
  "route_to_node",
  "return_to_bp_ask",
]);
const TRANSFER_MODES = new Set<CompiledEdgeSpec["transferMode"]>([
  "communication_prompt",
  "structured_packet",
  "field_mapping",
  "control_signal",
]);
const TRIGGER_MATCH_MODES = new Set<ProtocolTriggerRule["matchMode"]>([
  "semantic",
  "keyword",
  "manual",
  "event",
]);

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isJsonSchema(value: unknown): value is JsonSchema {
  return isRecord(value);
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function reject(params: {
  operation: WorkProtocolParameterPatchOperation;
  code: WorkProtocolParameterPatchIssueCode;
  message: string;
  detail?: JsonValue;
}): WorkProtocolParameterPatchIssue {
  return {
    operationId: params.operation.operationId,
    target: params.operation.target,
    path: params.operation.path,
    code: params.code,
    message: params.message,
    detail: params.detail,
  };
}

function validateInputBindings(value: unknown): CompiledInputBinding[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const bindings: CompiledInputBinding[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return null;
    }

    if (
      typeof item.name !== "string" ||
      item.name.trim().length === 0 ||
      typeof item.source !== "string" ||
      !INPUT_BINDING_SOURCES.has(item.source as CompiledInputBinding["source"]) ||
      typeof item.required !== "boolean"
    ) {
      return null;
    }

    bindings.push({
      name: item.name,
      source: item.source as CompiledInputBinding["source"],
      sourceNodeId:
        typeof item.sourceNodeId === "string" ? item.sourceNodeId : undefined,
      path: typeof item.path === "string" ? item.path : undefined,
      value: Object.hasOwn(item, "value") ? (item.value as JsonValue) : undefined,
      required: item.required,
      description:
        typeof item.description === "string" ? item.description : undefined,
    });
  }

  return bindings;
}

function validateOutputFields(value: unknown): CompiledOutputField[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const fields: CompiledOutputField[] = [];

  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.name !== "string" ||
      item.name.trim().length === 0 ||
      typeof item.jsonPath !== "string" ||
      !isJsonSchema(item.schema)
    ) {
      return null;
    }

    fields.push({
      name: item.name,
      jsonPath: item.jsonPath,
      schema: item.schema,
      description:
        typeof item.description === "string" ? item.description : undefined,
    });
  }

  return fields;
}

function validateFailurePolicy(value: unknown): CompiledFailurePolicy | null {
  if (!isRecord(value) || typeof value.mode !== "string") {
    return null;
  }

  if (!FAILURE_MODES.has(value.mode as CompiledFailurePolicy["mode"])) {
    return null;
  }

  if (
    value.mode === "route_to_node" &&
    (typeof value.targetNodeId !== "string" ||
      value.targetNodeId.trim().length === 0)
  ) {
    return null;
  }

  return {
    mode: value.mode as CompiledFailurePolicy["mode"],
    targetNodeId:
      typeof value.targetNodeId === "string" ? value.targetNodeId : undefined,
  };
}

function validateRetryPolicy(value: unknown): CompiledRetryPolicy | null {
  if (!isRecord(value) || typeof value.maxAttempts !== "number") {
    return null;
  }

  if (!Number.isInteger(value.maxAttempts) || value.maxAttempts < 0) {
    return null;
  }

  if (!isStringArray(value.retryOn)) {
    return null;
  }

  return {
    maxAttempts: value.maxAttempts,
    retryOn: value.retryOn,
  };
}

function validateFieldMappings(value: unknown): CompiledFieldMapping[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const mappings: CompiledFieldMapping[] = [];

  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.fromPath !== "string" ||
      item.fromPath.trim().length === 0 ||
      typeof item.toPath !== "string" ||
      item.toPath.trim().length === 0 ||
      typeof item.required !== "boolean"
    ) {
      return null;
    }

    mappings.push({
      fromPath: item.fromPath,
      toPath: item.toPath,
      required: item.required,
    });
  }

  return mappings;
}

function validateTriggerDrafts(value: unknown): ProtocolTriggerRule[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const triggers: ProtocolTriggerRule[] = [];

  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      item.id.trim().length === 0 ||
      typeof item.label !== "string" ||
      typeof item.matchMode !== "string" ||
      !TRIGGER_MATCH_MODES.has(item.matchMode as ProtocolTriggerRule["matchMode"]) ||
      typeof item.enabled !== "boolean"
    ) {
      return null;
    }

    if (item.keywords !== undefined && !isStringArray(item.keywords)) {
      return null;
    }

    if (item.intentHints !== undefined && !isStringArray(item.intentHints)) {
      return null;
    }

    if (
      item.minConfidence !== undefined &&
      (typeof item.minConfidence !== "number" ||
        item.minConfidence < 0 ||
        item.minConfidence > 100)
    ) {
      return null;
    }

    triggers.push({
      id: item.id,
      label: item.label,
      description:
        typeof item.description === "string" ? item.description : undefined,
      matchMode: item.matchMode as ProtocolTriggerRule["matchMode"],
      keywords: item.keywords,
      intentHints: item.intentHints,
      minConfidence: item.minConfidence,
      enabled: item.enabled,
    });
  }

  return triggers;
}

function normalizeNodePatchValue(
  path: string,
  value: JsonValue,
): { ok: true; value: JsonValue } | { ok: false; message: string } {
  if (path === "compiledSpec.departmentScopeId") {
    return typeof value === "string"
      ? { ok: true, value }
      : { ok: false, message: "departmentScopeId must be a string." };
  }

  if (path === "compiledSpec.inputBindings") {
    const bindings = validateInputBindings(value);
    return bindings
      ? { ok: true, value: bindings as unknown as JsonValue }
      : { ok: false, message: "inputBindings must be valid binding objects." };
  }

  if (path === "compiledSpec.outputFields") {
    const fields = validateOutputFields(value);
    return fields
      ? { ok: true, value: fields as unknown as JsonValue }
      : { ok: false, message: "outputFields must be valid output field objects." };
  }

  if (path === "compiledSpec.riskLevel") {
    return typeof value === "string" && RISK_LEVELS.has(value as ProtocolRiskLevel)
      ? { ok: true, value }
      : { ok: false, message: "riskLevel must be a known risk level." };
  }

  if (path === "compiledSpec.approvalPolicy") {
    return typeof value === "string" &&
      APPROVAL_POLICIES.has(value as ProtocolApprovalPolicy)
      ? { ok: true, value }
      : { ok: false, message: "approvalPolicy must be none, recommended, or required." };
  }

  if (path === "compiledSpec.failurePolicy") {
    const policy = validateFailurePolicy(value);
    return policy
      ? { ok: true, value: policy as unknown as JsonValue }
      : { ok: false, message: "failurePolicy is not valid." };
  }

  if (path === "compiledSpec.timeoutMs") {
    return typeof value === "number" && Number.isInteger(value) && value >= 0
      ? { ok: true, value }
      : { ok: false, message: "timeoutMs must be a non-negative integer." };
  }

  if (path === "compiledSpec.retryPolicy") {
    const policy = validateRetryPolicy(value);
    return policy
      ? { ok: true, value: policy as unknown as JsonValue }
      : { ok: false, message: "retryPolicy is not valid." };
  }

  return { ok: false, message: "This node parameter path is not patchable." };
}

function normalizeEdgePatchValue(
  path: string,
  value: JsonValue,
): { ok: true; value: JsonValue } | { ok: false; message: string } {
  if (path === "compiledSpec.transferMode") {
    return typeof value === "string" &&
      TRANSFER_MODES.has(value as CompiledEdgeSpec["transferMode"])
      ? { ok: true, value }
      : { ok: false, message: "transferMode must be a known transfer mode." };
  }

  if (path === "compiledSpec.prompt") {
    return typeof value === "string"
      ? { ok: true, value }
      : { ok: false, message: "prompt must be a string." };
  }

  if (path === "compiledSpec.requiredFields") {
    return isStringArray(value)
      ? { ok: true, value }
      : { ok: false, message: "requiredFields must be an array of strings." };
  }

  if (path === "compiledSpec.fieldMappings") {
    const mappings = validateFieldMappings(value);
    return mappings
      ? { ok: true, value: mappings as unknown as JsonValue }
      : { ok: false, message: "fieldMappings must be valid mapping objects." };
  }

  if (path === "compiledSpec.outputPacketSchema") {
    return isJsonSchema(value)
      ? { ok: true, value }
      : { ok: false, message: "outputPacketSchema must be a JSON schema object." };
  }

  return { ok: false, message: "This edge parameter path is not patchable." };
}

function normalizeProtocolPatchValue(
  path: string,
  value: JsonValue,
): { ok: true; value: JsonValue } | { ok: false; message: string } {
  if (path === "name" || path === "description") {
    return typeof value === "string"
      ? { ok: true, value }
      : { ok: false, message: `${path} must be a string.` };
  }

  if (path === "triggerDrafts") {
    const triggers = validateTriggerDrafts(value);
    return triggers
      ? { ok: true, value: triggers as unknown as JsonValue }
      : { ok: false, message: "triggerDrafts must be valid trigger rules." };
  }

  return { ok: false, message: "This protocol parameter path is not patchable." };
}

function applyProtocolPatch(params: {
  draft: WorkProtocolDraft;
  operation: WorkProtocolParameterPatchOperation;
  changes: WorkProtocolParameterPatchAppliedChange[];
  rejected: WorkProtocolParameterPatchIssue[];
}) {
  if (
    params.operation.target.kind === "protocol" &&
    params.operation.target.draftId &&
    params.operation.target.draftId !== params.draft.id
  ) {
    params.rejected.push(
      reject({
        operation: params.operation,
        code: "unknown_target",
        message: "The target protocol draft does not match this transaction draft.",
      }),
    );
    return;
  }

  const normalized = normalizeProtocolPatchValue(
    params.operation.path,
    params.operation.value,
  );

  if (!normalized.ok) {
    params.rejected.push(
      reject({
        operation: params.operation,
        code: "path_not_allowed",
        message: normalized.message,
      }),
    );
    return;
  }

  const path = params.operation.path;
  const before =
    path === "name"
      ? params.draft.name
      : path === "description"
        ? (params.draft.description ?? "")
        : params.draft.triggerDrafts;

  if (sameJson(before, normalized.value)) {
    params.rejected.push(
      reject({
        operation: params.operation,
        code: "no_effect",
        message: "The protocol parameter already has this value.",
      }),
    );
    return;
  }

  if (path === "name") {
    params.draft.name = normalized.value as string;
  } else if (path === "description") {
    params.draft.description = normalized.value as string;
  } else {
    params.draft.triggerDrafts = normalized.value as unknown as ProtocolTriggerRule[];
  }

  params.changes.push({
    operationId: params.operation.operationId,
    target: params.operation.target,
    path,
    before: before as JsonValue,
    after: normalized.value,
    reason: params.operation.reason,
  });
}

function setNodeCompiledSpecValue(
  node: CanvasNodeDraft,
  path: string,
  value: JsonValue,
) {
  if (!node.compiledSpec) {
    return;
  }

  const key = path.replace("compiledSpec.", "") as keyof CanvasNodeDraft["compiledSpec"];
  (node.compiledSpec as Record<string, unknown>)[key] = value;
  node.compiledSpecStatus = "fresh";
}

function applyNodePatch(params: {
  node: CanvasNodeDraft | undefined;
  operation: WorkProtocolParameterPatchOperation;
  changes: WorkProtocolParameterPatchAppliedChange[];
  rejected: WorkProtocolParameterPatchIssue[];
}) {
  if (!params.node) {
    params.rejected.push(
      reject({
        operation: params.operation,
        code: "unknown_target",
        message: "The target node does not exist.",
      }),
    );
    return;
  }

  if (!params.node.compiledSpec) {
    params.rejected.push(
      reject({
        operation: params.operation,
        code: "compiled_spec_missing",
        message: "The target node has no compiledSpec. Run protocol grooming first.",
      }),
    );
    return;
  }

  const normalized = normalizeNodePatchValue(
    params.operation.path,
    params.operation.value,
  );

  if (!normalized.ok) {
    params.rejected.push(
      reject({
        operation: params.operation,
        code: params.operation.path.startsWith("compiledSpec.")
          ? "invalid_value"
          : "path_not_allowed",
        message: normalized.message,
      }),
    );
    return;
  }

  const key = params.operation.path.replace(
    "compiledSpec.",
    "",
  ) as keyof CanvasNodeDraft["compiledSpec"];
  const before = (params.node.compiledSpec as Record<string, unknown>)[key];

  if (sameJson(before, normalized.value)) {
    params.rejected.push(
      reject({
        operation: params.operation,
        code: "no_effect",
        message: "The node parameter already has this value.",
      }),
    );
    return;
  }

  setNodeCompiledSpecValue(params.node, params.operation.path, normalized.value);
  params.changes.push({
    operationId: params.operation.operationId,
    target: params.operation.target,
    path: params.operation.path,
    before: before as JsonValue,
    after: normalized.value,
    reason: params.operation.reason,
  });
}

function setEdgeCompiledSpecValue(
  edge: CanvasEdgeDraft,
  path: string,
  value: JsonValue,
) {
  if (!edge.compiledSpec) {
    return;
  }

  const key = path.replace("compiledSpec.", "") as keyof CanvasEdgeDraft["compiledSpec"];
  (edge.compiledSpec as Record<string, unknown>)[key] = value;
  edge.compiledSpecStatus = "fresh";
}

function applyEdgePatch(params: {
  edge: CanvasEdgeDraft | undefined;
  operation: WorkProtocolParameterPatchOperation;
  changes: WorkProtocolParameterPatchAppliedChange[];
  rejected: WorkProtocolParameterPatchIssue[];
}) {
  if (!params.edge) {
    params.rejected.push(
      reject({
        operation: params.operation,
        code: "unknown_target",
        message: "The target edge does not exist.",
      }),
    );
    return;
  }

  if (!params.edge.compiledSpec) {
    params.rejected.push(
      reject({
        operation: params.operation,
        code: "compiled_spec_missing",
        message: "The target edge has no compiledSpec. Run protocol grooming first.",
      }),
    );
    return;
  }

  const normalized = normalizeEdgePatchValue(
    params.operation.path,
    params.operation.value,
  );

  if (!normalized.ok) {
    params.rejected.push(
      reject({
        operation: params.operation,
        code: params.operation.path.startsWith("compiledSpec.")
          ? "invalid_value"
          : "path_not_allowed",
        message: normalized.message,
      }),
    );
    return;
  }

  const key = params.operation.path.replace(
    "compiledSpec.",
    "",
  ) as keyof CanvasEdgeDraft["compiledSpec"];
  const before = (params.edge.compiledSpec as Record<string, unknown>)[key];

  if (sameJson(before, normalized.value)) {
    params.rejected.push(
      reject({
        operation: params.operation,
        code: "no_effect",
        message: "The edge parameter already has this value.",
      }),
    );
    return;
  }

  setEdgeCompiledSpecValue(params.edge, params.operation.path, normalized.value);
  params.changes.push({
    operationId: params.operation.operationId,
    target: params.operation.target,
    path: params.operation.path,
    before: before as JsonValue,
    after: normalized.value,
    reason: params.operation.reason,
  });
}

function applyOperation(params: {
  draft: WorkProtocolDraft;
  operation: WorkProtocolParameterPatchOperation;
  changes: WorkProtocolParameterPatchAppliedChange[];
  rejected: WorkProtocolParameterPatchIssue[];
}) {
  const target = params.operation.target;

  if (target.kind === "protocol") {
    applyProtocolPatch(params);
    return;
  }

  if (target.kind === "node") {
    applyNodePatch({
      node: params.draft.nodes.find((node) => node.id === target.nodeId),
      operation: params.operation,
      changes: params.changes,
      rejected: params.rejected,
    });
    return;
  }

  applyEdgePatch({
    edge: params.draft.edges.find((edge) => edge.id === target.edgeId),
    operation: params.operation,
    changes: params.changes,
    rejected: params.rejected,
  });
}

function issueDetail(issue: ProtocolIssue): JsonValue {
  return {
    issueId: issue.id,
    code: issue.code,
    target: issue.target as unknown as JsonValue,
    ...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
  };
}

function buildCompileFailureIssues(params: {
  operation: WorkProtocolParameterPatchOperation;
  issues: ProtocolIssue[];
}) {
  return params.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) =>
      reject({
        operation: params.operation,
        code: "compile_validation_failed",
        message: issue.message,
        detail: issueDetail(issue),
      }),
    );
}

function buildPreflightFailureIssues(params: {
  operation: WorkProtocolParameterPatchOperation;
  issues: ProtocolIssue[];
}) {
  return params.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) =>
      reject({
        operation: params.operation,
        code: "runtime_preflight_failed",
        message: issue.message,
        detail: issueDetail(issue),
      }),
    );
}

function getLastOperation(
  operations: WorkProtocolParameterPatchOperation[],
): WorkProtocolParameterPatchOperation {
  return (
    operations.at(-1) ?? {
      target: { kind: "protocol" },
      path: "operations",
      value: null,
    }
  );
}

function normalizeTarget(value: unknown): WorkProtocolParameterPatchTarget | null {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return null;
  }

  if (value.kind === "protocol") {
    return {
      kind: "protocol",
      draftId: typeof value.draftId === "string" ? value.draftId : undefined,
    };
  }

  if (
    value.kind === "node" &&
    typeof value.nodeId === "string" &&
    value.nodeId.trim().length > 0
  ) {
    return { kind: "node", nodeId: value.nodeId };
  }

  if (
    value.kind === "edge" &&
    typeof value.edgeId === "string" &&
    value.edgeId.trim().length > 0
  ) {
    return { kind: "edge", edgeId: value.edgeId };
  }

  return null;
}

function normalizeOperation(
  value: unknown,
  index: number,
):
  | { ok: true; value: WorkProtocolParameterPatchOperation }
  | { ok: false; issue: WorkProtocolParameterPatchIssue } {
  if (!isRecord(value)) {
    return {
      ok: false,
      issue: {
        target: { kind: "protocol" },
        path: `operations[${index}]`,
        code: "missing_operation",
        message: "Parameter patch operation must be an object.",
      },
    };
  }

  const target = normalizeTarget(value.target);
  const path = typeof value.path === "string" ? value.path : "";

  if (!target || path.trim().length === 0 || !Object.hasOwn(value, "value")) {
    return {
      ok: false,
      issue: {
        operationId:
          typeof value.operationId === "string" ? value.operationId : undefined,
        target: target ?? { kind: "protocol" },
        path: path || `operations[${index}]`,
        code: "missing_operation",
        message: "Parameter patch operation requires target, path, and value.",
      },
    };
  }

  return {
    ok: true,
    value: {
      operationId:
        typeof value.operationId === "string" ? value.operationId : undefined,
      target,
      path,
      value: value.value as JsonValue,
      reason: typeof value.reason === "string" ? value.reason : undefined,
    },
  };
}

export function applyWorkProtocolParameterPatchTransaction(params: {
  draft: WorkProtocolDraft;
  catalog: CapabilityCatalog;
  operations: unknown[];
  options?: WorkProtocolParameterPatchOptions;
}): WorkProtocolParameterPatchResult {
  const mode = params.options?.mode ?? "dry_run";
  const beforeDraft = cloneJson(params.draft);
  const candidateDraft = cloneJson(params.draft);
  const appliedChanges: WorkProtocolParameterPatchAppliedChange[] = [];
  const rejectedChanges: WorkProtocolParameterPatchIssue[] = [];

  if (!Array.isArray(params.operations) || params.operations.length === 0) {
    const compileResult = compileWorkProtocolDraftV0(beforeDraft, params.catalog, {
      mode: params.options?.validationMode ?? "register",
      allowMockCapabilities: params.options?.allowMockCapabilities,
      allowPlannedCapabilities: params.options?.allowPlannedCapabilities,
      allowDisabledCapabilities: params.options?.allowDisabledCapabilities,
    });

    return {
      schemaVersion: "work-protocol-parameter-patch.v1",
      status: "rejected",
      mode,
      draft: beforeDraft,
      beforeDraft,
      candidateDraft: beforeDraft,
      appliedChanges,
      rejectedChanges: [
        {
          target: { kind: "protocol" },
          path: "operations",
          code: "missing_operation",
          message: "At least one parameter patch operation is required.",
        },
      ],
      validation: compileResult.validation,
      preflightIssues: [],
      parameterCodeBlocks: compileResult.parameterCodeBlocks,
      catalogHash: params.catalog.catalogHash,
    };
  }

  const validOperations: WorkProtocolParameterPatchOperation[] = [];

  for (const [index, rawOperation] of params.operations.entries()) {
    const operation = normalizeOperation(rawOperation, index);

    if (!operation.ok) {
      rejectedChanges.push(operation.issue);
      continue;
    }

    validOperations.push(operation.value);
    applyOperation({
      draft: candidateDraft,
      operation: operation.value,
      changes: appliedChanges,
      rejected: rejectedChanges,
    });
  }

  const compileResult = compileWorkProtocolDraftV0(candidateDraft, params.catalog, {
    mode: params.options?.validationMode ?? "register",
    allowMockCapabilities: params.options?.allowMockCapabilities,
    allowPlannedCapabilities: params.options?.allowPlannedCapabilities,
    allowDisabledCapabilities: params.options?.allowDisabledCapabilities,
  });
  const preflightIssues =
    compileResult.compiled?.nodes.flatMap((node) =>
      preflightWorkProtocolNode({
        node,
        catalog: params.catalog,
        options: {
          runtimeMode: "plan_only",
          allowMockCapabilities: params.options?.allowMockCapabilities,
          allowPlannedCapabilities: params.options?.allowPlannedCapabilities,
          allowDisabledCapabilities: params.options?.allowDisabledCapabilities,
        },
      }),
    ) ?? [];
  const compileFailures = buildCompileFailureIssues({
    operation: getLastOperation(validOperations),
    issues: compileResult.validation.issues,
  });
  const preflightFailures = buildPreflightFailureIssues({
    operation: getLastOperation(validOperations),
    issues: preflightIssues,
  });
  const transactionRejected =
    rejectedChanges.some((issue) => issue.code !== "no_effect") ||
    compileFailures.length > 0 ||
    preflightFailures.length > 0;
  const noEffect =
    appliedChanges.length === 0 &&
    rejectedChanges.length > 0 &&
    rejectedChanges.every((issue) => issue.code === "no_effect");
  const nextRejectedChanges = [
    ...rejectedChanges,
    ...compileFailures,
    ...preflightFailures,
  ];
  const status = transactionRejected
    ? "rejected"
    : noEffect
      ? "no_effect"
      : mode === "apply"
        ? "applied"
        : "validated";

  return {
    schemaVersion: "work-protocol-parameter-patch.v1",
    status,
    mode,
    draft: status === "applied" ? compileResult.draft : beforeDraft,
    beforeDraft,
    candidateDraft: compileResult.draft,
    appliedChanges: transactionRejected || noEffect ? [] : appliedChanges,
    rejectedChanges: nextRejectedChanges,
    validation: compileResult.validation,
    preflightIssues,
    parameterCodeBlocks: compileResult.parameterCodeBlocks,
    catalogHash: params.catalog.catalogHash,
  };
}
