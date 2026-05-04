import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DispatchDecision } from "@/lib/bp-ask/intents";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { buildWorkProtocolCapabilityCatalog } from "@/lib/work-protocol/catalog";
import {
  buildPlanOnlyWorkProtocolNodeAdapterPlan,
  runPlanOnlyWorkProtocolNodeAdapter,
  type WorkProtocolNodeAdapterPlan,
  type WorkProtocolNodeAdapterResult,
} from "@/lib/work-protocol/executor-adapters";
import {
  buildWorkProtocolNodeInput,
  type WorkProtocolNodeInput,
} from "@/lib/work-protocol/field-flow";
import type { WorkProtocolGatewayMatch } from "@/lib/work-protocol/matcher";
import { preflightWorkProtocolNode } from "@/lib/work-protocol/preflight";
import { getRegisteredWorkProtocols } from "@/lib/work-protocol/registry";
import {
  assertProtocolExecutionStatusTransition,
  assertProtocolNodeRunStatusTransition,
  isProtocolExecutionTerminalStatus,
} from "@/lib/work-protocol/state-machine";
import type {
  CompiledEdgeSpec,
  CompiledNodeSpec,
  CompiledProtocolDefinition,
  CapabilityCatalog,
  JsonValue,
  ProtocolExecutionStatus,
  ProtocolExecution,
  ProtocolIssue,
  ProtocolNodeRunStatus,
  ProtocolReference,
  RegisteredProtocol,
  RegisteredProtocolVersion,
} from "@/lib/work-protocol/types";

export type WorkProtocolRuntimeMode = "plan_only";

export type WorkProtocolExecutionNodePlan = {
  sequence: number;
  nodeId: string;
  title: string;
  kind: CompiledNodeSpec["kind"];
  executorKind: CompiledNodeSpec["executorKind"];
  status: ProtocolNodeRunStatus;
  dependsOn: string[];
  outgoingEdgeIds: string[];
  callableId?: string;
  agentId?: string;
  departmentScopeId?: string;
  writableObjectKind?: string;
  approvalPolicy: CompiledNodeSpec["approvalPolicy"];
  riskLevel: CompiledNodeSpec["riskLevel"];
  timeoutMs?: number;
  adapterId?: string;
  adapterLabel?: string;
  adapterPlan?: WorkProtocolNodeAdapterPlan;
  adapterAvailable: boolean;
  requiredInputNames: string[];
  optionalInputNames: string[];
  plannedOutputNames: string[];
  requiredPermissions: string[];
  mutatesData: boolean;
  externalCallPlanned: boolean;
};

export type WorkProtocolExecutionEdgePlan = {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  transferMode: CompiledEdgeSpec["transferMode"];
  prompt?: string;
  fieldMappings: CompiledEdgeSpec["fieldMappings"];
  requiredFields: string[];
};

export type WorkProtocolExecutionPlanRecord = ProtocolExecution & {
  mode: WorkProtocolRuntimeMode;
  protocolName: string;
  draftId: string;
  versionNumber: number;
  capabilityCatalogHash?: string;
  matchedConfidence: number;
  matchedReason: string;
  matchedTriggerRuleIds: string[];
  nodePlan: WorkProtocolExecutionNodePlan[];
  edgePlan: WorkProtocolExecutionEdgePlan[];
  permissionSummary: ProtocolReference[];
  confirmationNodeIds: string[];
  createdByUserId: string;
  sourceMessageId?: string;
  executionTaskId?: string;
  dispatchDecision?: Pick<
    DispatchDecision,
    "primaryIntent" | "targetDomain" | "executionMode" | "confidence"
  >;
};

export type WorkProtocolExecutionAdvanceAction = "advance" | "confirm_waiting";

type ExecutionStore = {
  executions?: WorkProtocolExecutionPlanRecord[];
};

const EXECUTION_ROOT = path.join(
  process.cwd(),
  ".bpai",
  "work-protocol-gateway",
);
const EXECUTION_PATH = path.join(EXECUTION_ROOT, "protocol-executions.json");
const MAX_STORED_EXECUTIONS = 100;
const DEFAULT_PLAN_CONFIDENCE_THRESHOLD = 72;

function buildId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

async function ensureExecutionDir() {
  await mkdir(EXECUTION_ROOT, { recursive: true });
}

async function readExecutionStore(): Promise<ExecutionStore> {
  await ensureExecutionDir();

  const raw = await readFile(EXECUTION_PATH, "utf8").catch(() => "");

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as ExecutionStore;
  } catch {
    return {};
  }
}

async function writeExecutionStore(store: ExecutionStore) {
  await ensureExecutionDir();

  const tempPath = `${EXECUTION_PATH}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await rename(tempPath, EXECUTION_PATH);
}

function activeVersion(protocol: RegisteredProtocol) {
  return (
    protocol.versions.find(
      (version) => version.versionId === protocol.activeVersionId,
    ) ?? protocol.versions.at(-1)
  );
}

function findMatchedProtocol(params: {
  protocols: RegisteredProtocol[];
  match: WorkProtocolGatewayMatch;
}) {
  const protocol = params.protocols.find(
    (item) => item.id === params.match.protocolId && item.enabled,
  );

  if (!protocol) {
    return null;
  }

  if ((protocol.runtimeMode ?? "plan_only") !== "plan_only") {
    return null;
  }

  if (protocol.activeVersionId !== params.match.activeVersionId) {
    return null;
  }

  const version = protocol.versions.find(
    (item) => item.versionId === params.match.activeVersionId,
  );

  if (!version) {
    return null;
  }

  return { protocol, version };
}

function getNodeOrder(compiled: CompiledProtocolDefinition) {
  const nodesById = new Map(compiled.nodes.map((node) => [node.nodeId, node]));
  const incomingCount = new Map(
    compiled.nodes.map((node) => [node.nodeId, 0]),
  );
  const outgoing = new Map<string, string[]>();

  for (const edge of compiled.edges) {
    if (!nodesById.has(edge.sourceNodeId) || !nodesById.has(edge.targetNodeId)) {
      continue;
    }

    incomingCount.set(
      edge.targetNodeId,
      (incomingCount.get(edge.targetNodeId) ?? 0) + 1,
    );
    outgoing.set(edge.sourceNodeId, [
      ...(outgoing.get(edge.sourceNodeId) ?? []),
      edge.targetNodeId,
    ]);
  }

  const queue = compiled.nodes
    .filter((node) => (incomingCount.get(node.nodeId) ?? 0) === 0)
    .map((node) => node.nodeId);
  const ordered: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();

    if (!nodeId) {
      continue;
    }

    ordered.push(nodeId);

    for (const targetNodeId of outgoing.get(nodeId) ?? []) {
      const nextIncomingCount = (incomingCount.get(targetNodeId) ?? 0) - 1;
      incomingCount.set(targetNodeId, nextIncomingCount);

      if (nextIncomingCount === 0) {
        queue.push(targetNodeId);
      }
    }
  }

  const orderedSet = new Set(ordered);

  return [
    ...ordered,
    ...compiled.nodes
      .map((node) => node.nodeId)
      .filter((nodeId) => !orderedSet.has(nodeId)),
  ];
}

function buildNodePlan(
  compiled: CompiledProtocolDefinition,
): WorkProtocolExecutionNodePlan[] {
  const incomingByNode = new Map<string, string[]>();
  const outgoingEdgesByNode = new Map<string, string[]>();

  for (const edge of compiled.edges) {
    incomingByNode.set(edge.targetNodeId, [
      ...(incomingByNode.get(edge.targetNodeId) ?? []),
      edge.sourceNodeId,
    ]);
    outgoingEdgesByNode.set(edge.sourceNodeId, [
      ...(outgoingEdgesByNode.get(edge.sourceNodeId) ?? []),
      edge.edgeId,
    ]);
  }

  const order = getNodeOrder(compiled);
  const nodesById = new Map(compiled.nodes.map((node) => [node.nodeId, node]));

  return order.flatMap((nodeId, index) => {
    const node = nodesById.get(nodeId);

    if (!node) {
      return [];
    }

    const adapterPlan = buildPlanOnlyWorkProtocolNodeAdapterPlan(node);

    return [
      {
        sequence: index + 1,
        nodeId: node.nodeId,
        title: node.title,
        kind: node.kind,
        executorKind: node.executorKind,
        status: "queued",
        dependsOn: incomingByNode.get(node.nodeId) ?? [],
        outgoingEdgeIds: outgoingEdgesByNode.get(node.nodeId) ?? [],
        callableId: node.callableId,
        agentId: node.agentId,
        departmentScopeId: node.departmentScopeId,
        writableObjectKind: node.writableObjectKind,
        approvalPolicy: node.approvalPolicy,
        riskLevel: node.riskLevel,
        timeoutMs: node.timeoutMs,
        adapterId: adapterPlan.adapterId,
        adapterLabel: adapterPlan.label,
        adapterPlan,
        adapterAvailable: adapterPlan.available,
        requiredInputNames: adapterPlan.requiredInputs,
        optionalInputNames: adapterPlan.optionalInputs,
        plannedOutputNames: adapterPlan.outputFields,
        requiredPermissions: adapterPlan.requiredPermissions,
        mutatesData: adapterPlan.mutatesData,
        externalCallPlanned: adapterPlan.plansExternalCall,
      },
    ];
  });
}

function buildEdgePlan(
  compiled: CompiledProtocolDefinition,
): WorkProtocolExecutionEdgePlan[] {
  return compiled.edges.map((edge) => ({
    edgeId: edge.edgeId,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    transferMode: edge.transferMode,
    prompt: edge.prompt,
    fieldMappings: edge.fieldMappings,
    requiredFields: edge.requiredFields,
  }));
}

function compactDecision(decision: DispatchDecision | undefined) {
  if (!decision) {
    return undefined;
  }

  return {
    primaryIntent: decision.primaryIntent,
    targetDomain: decision.targetDomain,
    executionMode: decision.executionMode,
    confidence: decision.confidence,
  };
}

function protocolVersionLabel(version: RegisteredProtocolVersion) {
  return `v${version.versionNumber}`;
}

function buildExecutionPlanRecord(params: {
  match: WorkProtocolGatewayMatch;
  protocol: RegisteredProtocol;
  version: RegisteredProtocolVersion;
  userId: string;
  threadId?: string;
  sourceMessageId?: string;
  executionTaskId?: string;
  userPrompt: string;
  dispatchDecision?: DispatchDecision;
}) {
  const now = new Date().toISOString();
  const compiled = params.version.compiledDefinition;
  const executionId = buildId("protocol-exec");
  const nodePlan = buildNodePlan(compiled);
  const confirmationNodeIds = nodePlan
    .filter(
      (node) =>
        node.approvalPolicy === "required" ||
        node.riskLevel === "high" ||
        node.riskLevel === "critical",
    )
    .map((node) => node.nodeId);

  return {
    id: executionId,
    protocolId: params.protocol.id,
    versionId: params.version.versionId,
    threadId: params.threadId,
    status: "queued",
    inputPacket: {
      packetId: buildId("protocol-packet"),
      protocolExecutionId: executionId,
      originatingThreadId: params.threadId,
      userPrompt: params.userPrompt,
      values: {
        prompt: params.userPrompt,
        match: params.match as unknown as JsonValue,
        dispatchDecision: compactDecision(params.dispatchDecision) as JsonValue,
      },
      artifacts: [],
      trace: [
        {
          at: now,
          event: "protocol_matched",
          summary: `Matched ${params.protocol.name} ${protocolVersionLabel(
            params.version,
          )} in plan-only runtime.`,
        },
      ],
    },
    issues: [],
    startedAt: now,
    mode: "plan_only",
    protocolName: params.protocol.name,
    draftId: params.protocol.draftId,
    versionNumber: params.version.versionNumber,
    capabilityCatalogHash:
      params.version.capabilityCatalogHash ?? compiled.capabilityCatalogHash,
    matchedConfidence: params.match.confidence,
    matchedReason: params.match.reason,
    matchedTriggerRuleIds: params.match.matchedTriggerRuleIds,
    nodePlan,
    edgePlan: buildEdgePlan(compiled),
    permissionSummary: compiled.permissionSummary,
    confirmationNodeIds,
    createdByUserId: params.userId,
    sourceMessageId: params.sourceMessageId,
    executionTaskId: params.executionTaskId,
    dispatchDecision: compactDecision(params.dispatchDecision),
  } satisfies WorkProtocolExecutionPlanRecord;
}

export async function listWorkProtocolExecutionPlans() {
  const store = await readExecutionStore();

  return [...(store.executions ?? [])].sort((left, right) =>
    right.startedAt.localeCompare(left.startedAt),
  );
}

export async function createWorkProtocolExecutionPlan(params: {
  match?: WorkProtocolGatewayMatch | null;
  userId: string;
  threadId?: string;
  sourceMessageId?: string;
  executionTaskId?: string;
  userPrompt: string;
  dispatchDecision?: DispatchDecision;
  minConfidence?: number;
}) {
  const minConfidence =
    params.minConfidence ?? DEFAULT_PLAN_CONFIDENCE_THRESHOLD;

  if (!params.match || params.match.confidence < minConfidence) {
    return null;
  }

  if (params.match.runtimeMode !== "plan_only") {
    return null;
  }

  const protocols = await getRegisteredWorkProtocols();
  const matched = findMatchedProtocol({
    protocols,
    match: params.match,
  });

  if (!matched) {
    return null;
  }

  const record = buildExecutionPlanRecord({
    match: params.match,
    protocol: matched.protocol,
    version: matched.version,
    userId: params.userId,
    threadId: params.threadId,
    sourceMessageId: params.sourceMessageId,
    executionTaskId: params.executionTaskId,
    userPrompt: params.userPrompt,
    dispatchDecision: params.dispatchDecision,
  });
  const store = await readExecutionStore();
  const executions = [record, ...(store.executions ?? [])]
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, MAX_STORED_EXECUTIONS);

  await writeExecutionStore({ executions });

  return record;
}

function nextExecutionStatus(
  record: WorkProtocolExecutionPlanRecord,
  status: ProtocolExecutionStatus,
) {
  assertProtocolExecutionStatusTransition(record.status, status);
  return status;
}

function nextNodeStatus(
  node: WorkProtocolExecutionNodePlan,
  status: ProtocolNodeRunStatus,
) {
  assertProtocolNodeRunStatusTransition(node.status, status);
  return status;
}

function nodeRequiresDryRunConfirmation(node: WorkProtocolExecutionNodePlan) {
  return (
    node.approvalPolicy === "required" ||
    node.riskLevel === "high" ||
    node.riskLevel === "critical"
  );
}

function dependenciesCompleted(
  node: WorkProtocolExecutionNodePlan,
  nodesById: Map<string, WorkProtocolExecutionNodePlan>,
) {
  return node.dependsOn.every((dependencyId) => {
    const dependency = nodesById.get(dependencyId);
    return (
      !dependency ||
      dependency.status === "completed" ||
      dependency.status === "skipped"
    );
  });
}

function allNodesFinished(nodes: WorkProtocolExecutionNodePlan[]) {
  return nodes.every(
    (node) => node.status === "completed" || node.status === "skipped",
  );
}

function hasWaitingNode(nodes: WorkProtocolExecutionNodePlan[]) {
  return nodes.some((node) => node.status === "waiting_confirmation");
}

function runtimeIssue(params: {
  record: WorkProtocolExecutionPlanRecord;
  code: ProtocolIssue["code"];
  message: string;
  suggestion: string;
}) {
  return {
    id: [
      "protocol-issue",
      "protocol",
      params.record.id,
      params.code,
    ].join(":"),
    severity: "error",
    code: params.code,
    target: { kind: "protocol", id: params.record.id },
    message: params.message,
    suggestion: params.suggestion,
  } satisfies ProtocolIssue;
}

function appendRuntimeIssue(
  record: WorkProtocolExecutionPlanRecord,
  issue: ProtocolIssue,
) {
  if (record.issues.some((item) => item.id === issue.id)) {
    return record.issues;
  }

  return [...record.issues, issue];
}

function appendRuntimeIssues(
  record: WorkProtocolExecutionPlanRecord,
  issues: ProtocolIssue[],
) {
  return issues.reduce(
    (nextIssues, issue) =>
      nextIssues.some((item) => item.id === issue.id)
        ? nextIssues
        : [...nextIssues, issue],
    record.issues,
  );
}

function failGuardedExecution(params: {
  record: WorkProtocolExecutionPlanRecord;
  issue: ProtocolIssue;
  summary: string;
  now: string;
}) {
  const { record, issue, summary, now } = params;

  return {
    ...record,
    status: nextExecutionStatus(record, "failed"),
    completedAt: now,
    issues: appendRuntimeIssue(record, issue),
    inputPacket: {
      ...record.inputPacket,
      trace: [
        ...record.inputPacket.trace,
        {
          at: now,
          event: "protocol_failed" as const,
          summary,
        },
      ],
    },
  };
}

type RegisteredExecutionVersionGuard =
  | {
      ok: true;
      protocol: RegisteredProtocol;
      version: RegisteredProtocolVersion;
    }
  | {
      ok: false;
      issue: ProtocolIssue;
    };

function findRegisteredExecutionVersion(params: {
  record: WorkProtocolExecutionPlanRecord;
  protocols: RegisteredProtocol[];
}): RegisteredExecutionVersionGuard {
  const protocol = params.protocols.find(
    (item) => item.id === params.record.protocolId,
  );

  if (!protocol) {
    return {
      ok: false,
      issue: runtimeIssue({
        record: params.record,
        code: "protocol_version_unavailable",
        message: "找不到该执行计划对应的已注册协议。",
        suggestion: "请确认协议没有被删除；必要时重新注册协议并重新创建执行计划。",
      }),
    };
  }

  if (!protocol.enabled) {
    return {
      ok: false,
      issue: runtimeIssue({
        record: params.record,
        code: "protocol_not_enabled",
        message: `协议 ${protocol.name} 当前已停用，不能继续推进执行计划。`,
        suggestion: "请重新启用该协议，或重新创建一个新的执行计划。",
      }),
    };
  }

  if ((protocol.runtimeMode ?? "plan_only") !== params.record.mode) {
    return {
      ok: false,
      issue: runtimeIssue({
        record: params.record,
        code: "runtime_mode_mismatch",
        message: `协议 ${protocol.name} 的运行模式已变化，当前执行计划无法继续。`,
        suggestion: "请重新创建执行计划，确保协议运行模式和 runtime 一致。",
      }),
    };
  }

  if (protocol.activeVersionId !== params.record.versionId) {
    return {
      ok: false,
      issue: runtimeIssue({
        record: params.record,
        code: "protocol_version_unavailable",
        message: `协议 ${protocol.name} 的 active version 已变化，当前执行计划引用的是旧版本。`,
        suggestion: "请基于当前 active version 重新创建执行计划，避免继续推进过期协议。",
      }),
    };
  }

  const version = protocol.versions.find(
    (item) => item.versionId === params.record.versionId,
  );

  if (!version || version.compiledDefinition.status !== "compiled") {
    return {
      ok: false,
      issue: runtimeIssue({
        record: params.record,
        code: "protocol_version_unavailable",
        message: "该执行计划引用的协议版本不可用。",
        suggestion: "请重新注册协议版本，或基于当前 active version 重新创建执行计划。",
      }),
    };
  }

  const registeredCatalogHash =
    version.capabilityCatalogHash ?? version.compiledDefinition.capabilityCatalogHash;

  if (
    params.record.capabilityCatalogHash &&
    registeredCatalogHash &&
    params.record.capabilityCatalogHash !== registeredCatalogHash
  ) {
    return {
      ok: false,
      issue: runtimeIssue({
        record: params.record,
        code: "capability_catalog_stale",
        message: "该执行计划记录的能力目录版本和注册协议版本不一致。",
        suggestion: "请重新协议梳理并重新创建执行计划，避免使用过期能力目录。",
      }),
    };
  }

  return { ok: true, protocol, version };
}

function buildCompletedOutputPacket(record: WorkProtocolExecutionPlanRecord) {
  return {
    packetId: buildId("protocol-output"),
    protocolExecutionId: record.id,
    originatingThreadId: record.threadId,
    values: {
      protocolId: record.protocolId,
      protocolName: record.protocolName,
      mode: record.mode,
      completedNodeIds: record.nodePlan
        .filter((node) => node.status === "completed")
        .map((node) => node.nodeId),
      skippedNodeIds: record.nodePlan
        .filter((node) => node.status === "skipped")
        .map((node) => node.nodeId),
      summary: `Plan-only dry-run completed for ${record.protocolName}.`,
    },
    artifacts: [],
    trace: record.inputPacket.trace,
  } satisfies WorkProtocolExecutionPlanRecord["outputPacket"];
}

function isJsonRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergeNodeOutputValues(params: {
  record: WorkProtocolExecutionPlanRecord;
  node: WorkProtocolExecutionNodePlan;
  adapterResult: WorkProtocolNodeAdapterResult;
}) {
  const existingNodeOutputs = isJsonRecord(params.record.inputPacket.values.nodeOutputs)
    ? params.record.inputPacket.values.nodeOutputs
    : {};

  return {
    ...params.record.inputPacket.values,
    lastNodeId: params.node.nodeId,
    lastNodeOutput: params.adapterResult.output,
    nodeOutputs: {
      ...existingNodeOutputs,
      [params.node.nodeId]: params.adapterResult.output,
    },
  } satisfies Record<string, JsonValue>;
}

function mergeNodeInputValues(params: {
  record: WorkProtocolExecutionPlanRecord;
  nodeInput: WorkProtocolNodeInput;
}) {
  const existingNodeInputs = isJsonRecord(params.record.inputPacket.values.nodeInputs)
    ? params.record.inputPacket.values.nodeInputs
    : {};
  const nodeInputValue = params.nodeInput as unknown as JsonValue;

  return {
    ...params.record.inputPacket.values,
    lastNodeInput: nodeInputValue,
    nodeInputs: {
      ...existingNodeInputs,
      [params.nodeInput.nodeId]: nodeInputValue,
    },
  } satisfies Record<string, JsonValue>;
}

function getStoredNodeInput(
  record: WorkProtocolExecutionPlanRecord,
  node: WorkProtocolExecutionNodePlan,
) {
  const existingNodeInputs = isJsonRecord(record.inputPacket.values.nodeInputs)
    ? record.inputPacket.values.nodeInputs
    : {};
  const storedNodeInput = existingNodeInputs[node.nodeId];

  return isJsonRecord(storedNodeInput)
    ? (storedNodeInput as unknown as WorkProtocolNodeInput)
    : null;
}

function prepareNodeInput(params: {
  record: WorkProtocolExecutionPlanRecord;
  node: WorkProtocolExecutionNodePlan;
  now: string;
  useStored?: boolean;
}):
  | {
      ok: true;
      record: WorkProtocolExecutionPlanRecord;
      nodeInput: WorkProtocolNodeInput;
    }
  | {
      ok: false;
      record: WorkProtocolExecutionPlanRecord;
      nodeInput: WorkProtocolNodeInput;
      issues: ProtocolIssue[];
    } {
  const storedNodeInput = params.useStored
    ? getStoredNodeInput(params.record, params.node)
    : null;

  if (storedNodeInput) {
    return {
      ok: true,
      record: params.record,
      nodeInput: storedNodeInput,
    };
  }

  const flow = buildWorkProtocolNodeInput({
    record: params.record,
    node: params.node,
    now: params.now,
  });
  const recordWithInput = {
    ...params.record,
    inputPacket: {
      ...params.record.inputPacket,
      currentNodeId: params.node.nodeId,
      values: mergeNodeInputValues({
        record: params.record,
        nodeInput: flow.nodeInput,
      }),
      trace: [...params.record.inputPacket.trace, ...flow.traceEntries],
    },
  };

  if (flow.issues.length > 0) {
    return {
      ok: false,
      record: recordWithInput,
      nodeInput: flow.nodeInput,
      issues: flow.issues,
    };
  }

  return {
    ok: true,
    record: recordWithInput,
    nodeInput: flow.nodeInput,
  };
}

function withCompletionIfDone(
  record: WorkProtocolExecutionPlanRecord,
  now: string,
) {
  if (!allNodesFinished(record.nodePlan)) {
    return {
      ...record,
      status: nextExecutionStatus(record, "running"),
    };
  }

  const completedRecord = {
    ...record,
    status: nextExecutionStatus(record, "completed"),
    completedAt: now,
    inputPacket: {
      ...record.inputPacket,
      trace: [
        ...record.inputPacket.trace,
        {
          at: now,
          event: "protocol_completed" as const,
          summary: `Plan-only dry-run completed ${record.nodePlan.length} nodes.`,
        },
      ],
    },
  };

  return {
    ...completedRecord,
    outputPacket: buildCompletedOutputPacket(completedRecord),
  };
}

function failDeadlockedExecution(
  record: WorkProtocolExecutionPlanRecord,
  now: string,
) {
  return {
    ...record,
    status: nextExecutionStatus(record, "failed"),
    completedAt: now,
    issues: appendRuntimeIssue(
      record,
      runtimeIssue({
        record,
        code: "runtime_deadlock",
        message: "协议执行计划里没有可继续推进的节点。",
        suggestion:
          "请检查节点依赖、入口连通性和确认节点状态；必要时重新协议梳理后再注册。",
      }),
    ),
    inputPacket: {
      ...record.inputPacket,
      trace: [
        ...record.inputPacket.trace,
        {
          at: now,
          event: "protocol_failed" as const,
          summary:
            "Plan-only dry-run stopped because no queued or waiting node can advance.",
        },
      ],
    },
  };
}

function failPreflightExecution(params: {
  record: WorkProtocolExecutionPlanRecord;
  node: WorkProtocolExecutionNodePlan;
  issues: ProtocolIssue[];
  now: string;
}) {
  const { record, node, issues, now } = params;

  return {
    ...record,
    status: nextExecutionStatus(record, "failed"),
    completedAt: now,
    issues: appendRuntimeIssues(record, issues),
    nodePlan: record.nodePlan.map((item) =>
      item.nodeId === node.nodeId
        ? { ...item, status: nextNodeStatus(item, "failed") }
        : item,
    ),
    inputPacket: {
      ...record.inputPacket,
      currentNodeId: node.nodeId,
      trace: [
        ...record.inputPacket.trace,
        {
          at: now,
          nodeId: node.nodeId,
          event: "node_failed" as const,
          summary: `Runtime preflight blocked ${node.title}: ${issues
            .map((issue) => issue.code)
            .join(", ")}.`,
        },
        {
          at: now,
          event: "protocol_failed" as const,
          summary: `Plan-only dry-run stopped before ${node.title} because runtime preflight failed.`,
        },
      ],
    },
  };
}

function failFieldFlowExecution(params: {
  record: WorkProtocolExecutionPlanRecord;
  node: WorkProtocolExecutionNodePlan;
  issues: ProtocolIssue[];
  now: string;
}) {
  const { record, node, issues, now } = params;

  return {
    ...record,
    status: nextExecutionStatus(record, "failed"),
    completedAt: now,
    issues: appendRuntimeIssues(record, issues),
    nodePlan: record.nodePlan.map((item) =>
      item.nodeId === node.nodeId
        ? { ...item, status: nextNodeStatus(item, "failed") }
        : item,
    ),
    inputPacket: {
      ...record.inputPacket,
      currentNodeId: node.nodeId,
      trace: [
        ...record.inputPacket.trace,
        {
          at: now,
          nodeId: node.nodeId,
          event: "node_failed" as const,
          summary: `Field flow blocked ${node.title}: ${issues
            .map((issue) => issue.code)
            .join(", ")}.`,
        },
        {
          at: now,
          event: "protocol_failed" as const,
          summary: `Plan-only dry-run stopped before ${node.title} because edge field flow failed.`,
        },
      ],
    },
  };
}

function failAdapterExecution(params: {
  record: WorkProtocolExecutionPlanRecord;
  node: WorkProtocolExecutionNodePlan;
  adapterResult: WorkProtocolNodeAdapterResult;
  now: string;
}) {
  const { record, node, adapterResult, now } = params;

  return {
    ...record,
    status: nextExecutionStatus(record, "failed"),
    completedAt: now,
    issues: appendRuntimeIssues(record, adapterResult.issues ?? []),
    nodePlan: record.nodePlan.map((item) =>
      item.nodeId === node.nodeId
        ? { ...item, status: nextNodeStatus(item, "failed") }
        : item,
    ),
    inputPacket: {
      ...record.inputPacket,
      currentNodeId: node.nodeId,
      values: mergeNodeOutputValues({ record, node, adapterResult }),
      artifacts: [...record.inputPacket.artifacts, ...(adapterResult.artifacts ?? [])],
      trace: [
        ...record.inputPacket.trace,
        {
          at: now,
          nodeId: node.nodeId,
          event: "node_failed" as const,
          summary: adapterResult.summary,
        },
        {
          at: now,
          event: "protocol_failed" as const,
          summary: `Plan-only dry-run stopped because ${node.title} adapter failed.`,
        },
      ],
    },
  };
}

function completeNodeWithAdapterResult(params: {
  record: WorkProtocolExecutionPlanRecord;
  node: WorkProtocolExecutionNodePlan;
  adapterResult: WorkProtocolNodeAdapterResult;
  now: string;
  includeStartTrace?: boolean;
}) {
  const { record, node, adapterResult, now } = params;

  if (adapterResult.status === "failed") {
    return failAdapterExecution({ record, node, adapterResult, now });
  }

  const trace = [
    ...record.inputPacket.trace,
    ...(params.includeStartTrace
      ? [
          {
            at: now,
            nodeId: node.nodeId,
            event: "node_started" as const,
            summary: `Plan-only dry-run started ${node.title}.`,
          },
        ]
      : []),
    {
      at: now,
      nodeId: node.nodeId,
      event: "node_completed" as const,
      summary: adapterResult.summary,
    },
  ];
  const advanced = {
    ...record,
    status: nextExecutionStatus(record, "running"),
    issues: appendRuntimeIssues(record, adapterResult.issues ?? []),
    nodePlan: record.nodePlan.map((item) =>
      item.nodeId === node.nodeId
        ? { ...item, status: nextNodeStatus(item, "completed") }
        : item,
    ),
    inputPacket: {
      ...record.inputPacket,
      currentNodeId: node.nodeId,
      values: mergeNodeOutputValues({ record, node, adapterResult }),
      artifacts: [...record.inputPacket.artifacts, ...(adapterResult.artifacts ?? [])],
      trace,
    },
  };

  return withCompletionIfDone(advanced, now);
}

function getNodePreflightIssues(params: {
  node: WorkProtocolExecutionNodePlan;
  catalog: CapabilityCatalog;
  record: WorkProtocolExecutionPlanRecord;
}) {
  return preflightWorkProtocolNode({
    node: params.node,
    catalog: params.catalog,
    options: {
      runtimeMode: params.record.mode,
      allowMockCapabilities: params.record.mode === "plan_only",
      allowPlannedCapabilities: false,
      allowDisabledCapabilities: false,
      requireWriteConfirmation: true,
    },
  });
}

function advanceOneStep(
  record: WorkProtocolExecutionPlanRecord,
  catalog: CapabilityCatalog,
) {
  const now = new Date().toISOString();

  if (isProtocolExecutionTerminalStatus(record.status)) {
    return record;
  }

  const nodesById = new Map(record.nodePlan.map((node) => [node.nodeId, node]));
  const waitingNode = record.nodePlan.find(
    (node) =>
      node.status === "waiting_confirmation" &&
      dependenciesCompleted(node, nodesById),
  );

  if (waitingNode) {
    return {
      ...record,
      status: nextExecutionStatus(record, "waiting_confirmation"),
    };
  }

  const nextNode = record.nodePlan.find(
    (node) =>
      node.status === "queued" &&
      dependenciesCompleted(node, nodesById),
  );

  if (!nextNode) {
    if (allNodesFinished(record.nodePlan)) {
      return withCompletionIfDone(record, now);
    }

    if (hasWaitingNode(record.nodePlan)) {
      return {
        ...record,
        status: nextExecutionStatus(record, "waiting_confirmation"),
      };
    }

    return failDeadlockedExecution(record, now);
  }

  if (nodeRequiresDryRunConfirmation(nextNode)) {
    const preflightIssues = getNodePreflightIssues({
      node: nextNode,
      catalog,
      record,
    });

    if (preflightIssues.length > 0) {
      return failPreflightExecution({
        record,
        node: nextNode,
        issues: preflightIssues,
        now,
      });
    }

    const preparedInput = prepareNodeInput({
      record,
      node: nextNode,
      now,
    });

    if (!preparedInput.ok) {
      return failFieldFlowExecution({
        record: preparedInput.record,
        node: nextNode,
        issues: preparedInput.issues,
        now,
      });
    }

    return {
      ...preparedInput.record,
      status: nextExecutionStatus(preparedInput.record, "waiting_confirmation"),
      nodePlan: preparedInput.record.nodePlan.map((node) =>
        node.nodeId === nextNode.nodeId
          ? {
              ...node,
              status: nextNodeStatus(node, "waiting_confirmation"),
            }
          : node,
      ),
      inputPacket: {
        ...preparedInput.record.inputPacket,
        currentNodeId: nextNode.nodeId,
        trace: [
          ...preparedInput.record.inputPacket.trace,
          {
            at: now,
            nodeId: nextNode.nodeId,
            event: "confirmation_requested" as const,
            summary: `Plan-only dry-run paused before ${nextNode.title}.`,
          },
        ],
      },
    };
  }

  const preflightIssues = getNodePreflightIssues({
    node: nextNode,
    catalog,
    record,
  });

  if (preflightIssues.length > 0) {
    return failPreflightExecution({
      record,
      node: nextNode,
      issues: preflightIssues,
      now,
    });
  }

  const preparedInput = prepareNodeInput({
    record,
    node: nextNode,
    now,
  });

  if (!preparedInput.ok) {
    return failFieldFlowExecution({
      record: preparedInput.record,
      node: nextNode,
      issues: preparedInput.issues,
      now,
    });
  }

  const adapterResult = runPlanOnlyWorkProtocolNodeAdapter({
    record: preparedInput.record,
    node: nextNode,
    now,
    nodeInput: preparedInput.nodeInput,
  });

  return completeNodeWithAdapterResult({
    record: preparedInput.record,
    node: nextNode,
    adapterResult,
    now,
    includeStartTrace: true,
  });
}

function confirmWaitingStep(
  record: WorkProtocolExecutionPlanRecord,
  catalog: CapabilityCatalog,
) {
  const now = new Date().toISOString();

  if (isProtocolExecutionTerminalStatus(record.status)) {
    return record;
  }

  const nodesById = new Map(record.nodePlan.map((node) => [node.nodeId, node]));
  const waitingNode = record.nodePlan.find(
    (node) =>
      node.status === "waiting_confirmation" &&
      dependenciesCompleted(node, nodesById),
  );

  if (!waitingNode) {
    return record;
  }

  const preflightIssues = getNodePreflightIssues({
    node: waitingNode,
    catalog,
    record,
  });

  if (preflightIssues.length > 0) {
    return failPreflightExecution({
      record,
      node: waitingNode,
      issues: preflightIssues,
      now,
    });
  }

  const preparedInput = prepareNodeInput({
    record,
    node: waitingNode,
    now,
    useStored: true,
  });

  if (!preparedInput.ok) {
    return failFieldFlowExecution({
      record: preparedInput.record,
      node: waitingNode,
      issues: preparedInput.issues,
      now,
    });
  }

  const adapterResult = runPlanOnlyWorkProtocolNodeAdapter({
    record: preparedInput.record,
    node: waitingNode,
    now,
    nodeInput: preparedInput.nodeInput,
  });

  return completeNodeWithAdapterResult({
    record: preparedInput.record,
    node: waitingNode,
    adapterResult,
    now,
  });
}

export async function advanceWorkProtocolExecutionPlan(params: {
  executionId: string;
  user: AuthenticatedUser;
  action: WorkProtocolExecutionAdvanceAction;
}) {
  const store = await readExecutionStore();
  const executions = store.executions ?? [];
  const target = executions.find(
    (execution) =>
      execution.id === params.executionId &&
      execution.createdByUserId === params.user.id,
  );

  if (!target) {
    throw new Error("PROTOCOL_EXECUTION_NOT_FOUND");
  }

  if (isProtocolExecutionTerminalStatus(target.status)) {
    return target;
  }

  const registeredProtocols = await getRegisteredWorkProtocols();
  const guarded = findRegisteredExecutionVersion({
    record: target,
    protocols: registeredProtocols,
  });

  if (!guarded.ok) {
    const now = new Date().toISOString();
    const failed = failGuardedExecution({
      record: target,
      issue: guarded.issue,
      summary: `Plan-only dry-run stopped before ${params.action}: ${guarded.issue.message}`,
      now,
    });
    const nextExecutions = executions.map((execution) =>
      execution.id === target.id ? failed : execution,
    );

    await writeExecutionStore({ executions: nextExecutions });

    return failed;
  }

  const catalog = await buildWorkProtocolCapabilityCatalog(params.user);
  const executionCatalogHash =
    target.capabilityCatalogHash ?? guarded.version.capabilityCatalogHash;

  if (
    executionCatalogHash &&
    catalog.catalogHash &&
    executionCatalogHash !== catalog.catalogHash
  ) {
    const now = new Date().toISOString();
    const issue = runtimeIssue({
      record: target,
      code: "capability_catalog_stale",
      message: "当前能力目录已经和创建执行计划时的能力目录不一致。",
      suggestion:
        "请重新协议梳理并重新创建执行计划，避免使用过期的部门、工具、Skill、RAG 或 AI员工权限。",
    });
    const failed = failGuardedExecution({
      record: target,
      issue,
      summary: `Plan-only dry-run stopped before ${params.action}: ${issue.message}`,
      now,
    });
    const nextExecutions = executions.map((execution) =>
      execution.id === target.id ? failed : execution,
    );

    await writeExecutionStore({ executions: nextExecutions });

    return failed;
  }

  let updated: WorkProtocolExecutionPlanRecord;

  try {
    updated =
      params.action === "confirm_waiting"
        ? confirmWaitingStep(target, catalog)
        : advanceOneStep(target, catalog);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("INVALID_WORK_PROTOCOL_")
    ) {
      const now = new Date().toISOString();
      updated = failGuardedExecution({
        record: target,
        issue: runtimeIssue({
          record: target,
          code: "invalid_state_transition",
          message: "执行计划遇到了非法状态流转。",
          suggestion:
            "请刷新执行详情；如果仍然出现，请重新创建执行计划或重新注册协议。",
        }),
        summary: `Plan-only dry-run failed because of invalid state transition: ${error.message}`,
        now,
      });
    } else {
      throw error;
    }
  }

  const nextExecutions = executions.map((execution) =>
    execution.id === target.id ? updated : execution,
  );

  await writeExecutionStore({ executions: nextExecutions });

  return updated;
}
