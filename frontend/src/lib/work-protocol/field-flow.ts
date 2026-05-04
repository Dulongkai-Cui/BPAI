import type {
  JsonValue,
  ProtocolIssue,
  ProtocolTraceEntry,
} from "@/lib/work-protocol/types";
import type {
  WorkProtocolExecutionEdgePlan,
  WorkProtocolExecutionNodePlan,
  WorkProtocolExecutionPlanRecord,
} from "@/lib/work-protocol/runtime";

export type WorkProtocolNodeInput = {
  protocolExecutionId: string;
  nodeId: string;
  nodeTitle: string;
  userPrompt?: string;
  departmentScopeId?: string;
  callableId?: string;
  agentId?: string;
  writableObjectKind?: string;
  dispatchDecision?: JsonValue;
  inboundEdges: Array<{
    edgeId: string;
    sourceNodeId: string;
    targetNodeId: string;
    transferMode: WorkProtocolExecutionEdgePlan["transferMode"];
    prompt?: string;
    requiredFields: string[];
    fieldMappings: WorkProtocolExecutionEdgePlan["fieldMappings"];
  }>;
  prompts: string[];
  upstreamOutputs: Record<string, JsonValue>;
  fields: Record<string, JsonValue>;
  values: Record<string, JsonValue>;
};

function isJsonRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function issue(params: {
  node: WorkProtocolExecutionNodePlan;
  edge: WorkProtocolExecutionEdgePlan;
  missingPath: string;
}) {
  return {
    id: [
      "protocol-issue",
      "edge",
      params.edge.edgeId,
      params.node.nodeId,
      "field_flow_mismatch",
      params.missingPath,
    ].join(":"),
    severity: "error",
    code: "field_flow_mismatch",
    target: { kind: "edge", id: params.edge.edgeId },
    message: `Edge ${params.edge.edgeId} cannot provide required field ${params.missingPath}.`,
    suggestion:
      "Check the upstream adapter output, edge fieldMappings, requiredFields, or run protocol grooming again.",
  } satisfies ProtocolIssue;
}

function parseJsonPath(pathValue: string | undefined) {
  if (!pathValue || pathValue === "$") {
    return [];
  }

  const normalized = pathValue.startsWith("$.")
    ? pathValue.slice(2)
    : pathValue;

  return normalized
    .split(".")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getJsonPath(value: JsonValue | undefined, pathValue: string | undefined) {
  let current = value;

  for (const segment of parseJsonPath(pathValue)) {
    if (!isJsonRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function setJsonPath(
  target: Record<string, JsonValue>,
  pathValue: string | undefined,
  value: JsonValue,
) {
  const segments = parseJsonPath(pathValue);

  if (segments.length === 0) {
    return;
  }

  let current: Record<string, JsonValue> = target;

  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];

    if (!isJsonRecord(next)) {
      current[segment] = {};
    }

    current = current[segment] as Record<string, JsonValue>;
  }

  current[segments[segments.length - 1]] = value;
}

function requiredFieldPresent(params: {
  fields: Record<string, JsonValue>;
  sourceOutput: JsonValue | undefined;
  field: string;
}) {
  return (
    getJsonPath(params.fields, `$.${params.field}`) !== undefined ||
    getJsonPath(params.sourceOutput, `$.${params.field}`) !== undefined
  );
}

function getNodeOutputs(record: WorkProtocolExecutionPlanRecord) {
  return isJsonRecord(record.inputPacket.values.nodeOutputs)
    ? record.inputPacket.values.nodeOutputs
    : {};
}

export function buildWorkProtocolNodeInput(params: {
  record: WorkProtocolExecutionPlanRecord;
  node: WorkProtocolExecutionNodePlan;
  now: string;
}) {
  const { record, node, now } = params;
  const nodeOutputs = getNodeOutputs(record);
  const inboundEdges = record.edgePlan.filter(
    (edge) => edge.targetNodeId === node.nodeId,
  );
  const issues: ProtocolIssue[] = [];
  const traceEntries: ProtocolTraceEntry[] = [];
  const upstreamOutputs: Record<string, JsonValue> = {};
  const fields: Record<string, JsonValue> = {};
  const prompts: string[] = [];

  for (const edge of inboundEdges) {
    const sourceOutput = nodeOutputs[edge.sourceNodeId];

    if (sourceOutput !== undefined) {
      upstreamOutputs[edge.sourceNodeId] = sourceOutput;
    }

    if (edge.prompt) {
      prompts.push(edge.prompt);
    }

    for (const mapping of edge.fieldMappings) {
      const value = getJsonPath(sourceOutput, mapping.fromPath);

      if (value === undefined) {
        if (mapping.required) {
          issues.push(
            issue({
              node,
              edge,
              missingPath: mapping.fromPath,
            }),
          );
        }

        continue;
      }

      setJsonPath(fields, mapping.toPath, value);
    }

    for (const requiredField of edge.requiredFields) {
      if (
        !requiredFieldPresent({
          fields,
          sourceOutput,
          field: requiredField,
        })
      ) {
        issues.push(
          issue({
            node,
            edge,
            missingPath: requiredField,
          }),
        );
      }
    }

    traceEntries.push({
      at: now,
      edgeId: edge.edgeId,
      event: "edge_transferred",
      summary: `Transferred ${edge.transferMode} from ${edge.sourceNodeId} to ${edge.targetNodeId}.`,
    });
  }

  const nodeInput: WorkProtocolNodeInput = {
    protocolExecutionId: record.id,
    nodeId: node.nodeId,
    nodeTitle: node.title,
    ...(record.inputPacket.userPrompt
      ? { userPrompt: record.inputPacket.userPrompt }
      : {}),
    ...(node.departmentScopeId ? { departmentScopeId: node.departmentScopeId } : {}),
    ...(node.callableId ? { callableId: node.callableId } : {}),
    ...(node.agentId ? { agentId: node.agentId } : {}),
    ...(node.writableObjectKind
      ? { writableObjectKind: node.writableObjectKind }
      : {}),
    ...(record.inputPacket.values.dispatchDecision
      ? { dispatchDecision: record.inputPacket.values.dispatchDecision }
      : {}),
    inboundEdges: inboundEdges.map((edge) => ({
      edgeId: edge.edgeId,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      transferMode: edge.transferMode,
      ...(edge.prompt ? { prompt: edge.prompt } : {}),
      requiredFields: edge.requiredFields,
      fieldMappings: edge.fieldMappings,
    })),
    prompts,
    upstreamOutputs,
    fields,
    values: {
      prompt: record.inputPacket.userPrompt ?? "",
      fields,
      upstreamOutputs,
      prompts,
    },
  };

  return {
    nodeInput,
    issues,
    traceEntries,
  };
}
