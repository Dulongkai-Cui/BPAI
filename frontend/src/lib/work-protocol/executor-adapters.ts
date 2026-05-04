import type {
  CapabilityImplementationStatus,
  CompiledNodeSpec,
  JsonValue,
  ProtocolApprovalPolicy,
  ProtocolExecutorKind,
  ProtocolIssue,
  ProtocolIssueCode,
  ProtocolNodeKind,
  ProtocolReference,
} from "@/lib/work-protocol/types";
import type {
  WorkProtocolExecutionNodePlan,
  WorkProtocolExecutionPlanRecord,
} from "@/lib/work-protocol/runtime";
import type { WorkProtocolNodeInput } from "@/lib/work-protocol/field-flow";

export type WorkProtocolNodeAdapterStatus = "completed" | "failed";

export type WorkProtocolNodeAdapterResult = {
  status: WorkProtocolNodeAdapterStatus;
  summary: string;
  output: Record<string, JsonValue>;
  artifacts?: ProtocolReference[];
  issues?: ProtocolIssue[];
};

export type WorkProtocolNodeAdapterContext = {
  record: WorkProtocolExecutionPlanRecord;
  node: WorkProtocolExecutionNodePlan;
  nodeInput: WorkProtocolNodeInput;
  now: string;
};

export type WorkProtocolExecutorAdapterRuntimeMode = "plan_only";

export type WorkProtocolExecutorAdapterDescriptor = {
  adapterId: string;
  label: string;
  description: string;
  nodeKinds: ProtocolNodeKind[];
  executorKind: ProtocolExecutorKind;
  runtimeModes: WorkProtocolExecutorAdapterRuntimeMode[];
  implementationStatus: CapabilityImplementationStatus;
  requiredInputs: string[];
  optionalInputs: string[];
  outputFields: string[];
  requiredPermissions: string[];
  mutatesData: boolean;
  plansExternalCall: boolean;
  defaultApprovalPolicy: ProtocolApprovalPolicy;
};

export type WorkProtocolNodeAdapterPlan = {
  adapterId: string;
  label: string;
  executorKind: ProtocolExecutorKind;
  runtimeMode: WorkProtocolExecutorAdapterRuntimeMode;
  implementationStatus: CapabilityImplementationStatus;
  available: boolean;
  requiredInputs: string[];
  optionalInputs: string[];
  outputFields: string[];
  requiredPermissions: string[];
  permissionRefs: ProtocolReference[];
  mutatesData: boolean;
  plansExternalCall: boolean;
  requiresConfirmation: boolean;
  planSummary: string;
};

export type WorkProtocolExecutorAdapterPermissionSummary = {
  permission: string;
  guardKind:
    | "department_scope"
    | "human_confirmation"
    | "runtime_state"
    | "none"
    | "unknown";
  enforcedBy: "runtime-preflight" | "state-machine" | "adapter" | "none";
  issueCodes: ProtocolIssueCode[];
  adapterIds: string[];
  note: string;
};

export type WorkProtocolExecutorAdapterRegistrySummary = {
  registryVersion: "work-protocol-adapter-registry.v1";
  runtimeModes: WorkProtocolExecutorAdapterRuntimeMode[];
  adapters: WorkProtocolExecutorAdapterDescriptor[];
  permissions: WorkProtocolExecutorAdapterPermissionSummary[];
  nodeKindAdapters: Array<{
    nodeKind: ProtocolNodeKind;
    executorKind: ProtocolExecutorKind;
    adapterId: string;
    adapterLabel: string;
    runtimeModes: WorkProtocolExecutorAdapterRuntimeMode[];
    requiredPermissions: string[];
  }>;
  counts: {
    totalAdapters: number;
    byStatus: Record<string, number>;
    byExecutorKind: Record<string, number>;
    externalCallAdapters: number;
    mutatingAdapters: number;
    guardedPermissionCount: number;
    unknownPermissionCount: number;
  };
  knownGaps: string[];
};

type WorkProtocolExecutorAdapterPermissionGuardDefinition = Omit<
  WorkProtocolExecutorAdapterPermissionSummary,
  "permission" | "adapterIds"
>;

type WorkProtocolExecutorAdapter = {
  descriptor: WorkProtocolExecutorAdapterDescriptor;
  runPlanOnly: (
    context: WorkProtocolNodeAdapterContext,
  ) => WorkProtocolNodeAdapterResult;
};

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function countBy<T>(values: T[], key: (value: T) => string) {
  return values.reduce<Record<string, number>>((counts, value) => {
    const group = key(value);
    counts[group] = (counts[group] ?? 0) + 1;
    return counts;
  }, {});
}

function adapterIssue(params: {
  node: WorkProtocolExecutionNodePlan;
  code: ProtocolIssueCode;
  message: string;
  suggestion: string;
}) {
  return {
    id: ["protocol-issue", "node", params.node.nodeId, params.code].join(":"),
    severity: "error",
    code: params.code,
    target: { kind: "node", id: params.node.nodeId },
    message: params.message,
    suggestion: params.suggestion,
  } satisfies ProtocolIssue;
}

function baseOutput(params: WorkProtocolNodeAdapterContext) {
  return {
    mode: params.record.mode,
    protocolExecutionId: params.record.id,
    nodeId: params.node.nodeId,
    nodeTitle: params.node.title,
    executorKind: params.node.executorKind,
    adapterId: params.node.adapterId ?? "missing",
    nodeInput: params.nodeInput as unknown as JsonValue,
    externalCallExecuted: false,
    generatedAt: params.now,
  } satisfies Record<string, JsonValue>;
}

function complete(params: {
  context: WorkProtocolNodeAdapterContext;
  summary: string;
  output: Record<string, JsonValue>;
  artifacts?: ProtocolReference[];
}): WorkProtocolNodeAdapterResult {
  return {
    status: "completed",
    summary: params.summary,
    output: {
      ...baseOutput(params.context),
      ...params.output,
    },
    artifacts: params.artifacts ?? [],
  };
}

function fail(params: {
  context: WorkProtocolNodeAdapterContext;
  message: string;
  suggestion: string;
}): WorkProtocolNodeAdapterResult {
  const issue = adapterIssue({
    node: params.context.node,
    code: "executor_not_available",
    message: params.message,
    suggestion: params.suggestion,
  });

  return {
    status: "failed",
    summary: params.message,
    output: {
      ...baseOutput(params.context),
      error: params.message,
    },
    issues: [issue],
  };
}

function descriptor(params: WorkProtocolExecutorAdapterDescriptor) {
  return params;
}

const planOnlyAdapters: WorkProtocolExecutorAdapter[] = [
  {
    descriptor: descriptor({
      adapterId: "plan-only.bp-ask-entry",
      label: "BP Ask entry adapter",
      description: "Receives the user prompt and creates the first context packet.",
      nodeKinds: ["bp_ask_entry"],
      executorKind: "bp_ask",
      runtimeModes: ["plan_only"],
      implementationStatus: "available",
      requiredInputs: ["userPrompt"],
      optionalInputs: ["dispatchDecision", "matchedProtocol"],
      outputFields: ["taskIntent", "targetDomain", "userPrompt", "missingInputs"],
      requiredPermissions: [],
      mutatesData: false,
      plansExternalCall: false,
      defaultApprovalPolicy: "none",
    }),
    runPlanOnly: (context) =>
      complete({
        context,
        summary: `BP Ask entry received: ${context.record.inputPacket.userPrompt ?? ""}`,
        output: {
          taskIntent: context.record.dispatchDecision?.primaryIntent ?? "unknown",
          targetDomain: context.record.dispatchDecision?.targetDomain ?? "unknown",
          userPrompt: context.record.inputPacket.userPrompt ?? "",
          missingInputs: [],
          targetRefs: [],
        },
      }),
  },
  {
    descriptor: descriptor({
      adapterId: "plan-only.tool",
      label: "Tool adapter",
      description: "Plans a system tool call without touching the target system.",
      nodeKinds: ["tool_call"],
      executorKind: "tool",
      runtimeModes: ["plan_only"],
      implementationStatus: "mock",
      requiredInputs: ["instruction"],
      optionalInputs: ["contextPacket", "departmentScopeId"],
      outputFields: ["toolResult", "changedObjects"],
      requiredPermissions: ["tool:execute"],
      mutatesData: false,
      plansExternalCall: true,
      defaultApprovalPolicy: "none",
    }),
    runPlanOnly: (context) =>
      complete({
        context,
        summary: `Plan-only Tool adapter prepared ${context.node.callableId ?? "unknown tool"} for ${context.node.title}.`,
        output: {
          toolResult: {
            mode: "plan_only",
            callableId: context.node.callableId ?? null,
            departmentScopeId: context.node.departmentScopeId ?? null,
            summary: `${context.node.title} would call ${context.node.callableId ?? "a tool"} in live runtime.`,
            changedObjects: [],
          },
        },
      }),
  },
  {
    descriptor: descriptor({
      adapterId: "plan-only.skill",
      label: "Skill adapter",
      description: "Plans a local Skill invocation and records the Skill boundary.",
      nodeKinds: ["skill_call"],
      executorKind: "skill",
      runtimeModes: ["plan_only"],
      implementationStatus: "planned",
      requiredInputs: ["instruction"],
      optionalInputs: ["skillFolder", "contextPacket"],
      outputFields: ["skillResult", "artifacts"],
      requiredPermissions: ["skill:run"],
      mutatesData: false,
      plansExternalCall: true,
      defaultApprovalPolicy: "recommended",
    }),
    runPlanOnly: (context) =>
      complete({
        context,
        summary: `Plan-only Skill adapter prepared ${context.node.callableId ?? "unknown skill"} for ${context.node.title}.`,
        output: {
          skillResult: {
            mode: "plan_only",
            skillId: context.node.callableId ?? null,
            departmentScopeId: context.node.departmentScopeId ?? null,
            summary: `${context.node.title} would run ${context.node.callableId ?? "a Skill"} in live runtime.`,
            artifacts: [],
          },
        },
      }),
  },
  {
    descriptor: descriptor({
      adapterId: "plan-only.rag",
      label: "RAG adapter",
      description: "Plans retrieval from a knowledge index and exposes a context bundle.",
      nodeKinds: ["rag_search"],
      executorKind: "rag",
      runtimeModes: ["plan_only"],
      implementationStatus: "planned",
      requiredInputs: ["query"],
      optionalInputs: ["filters", "departmentScopeId"],
      outputFields: ["matches", "contextBundle"],
      requiredPermissions: ["rag:read"],
      mutatesData: false,
      plansExternalCall: true,
      defaultApprovalPolicy: "none",
    }),
    runPlanOnly: (context) =>
      complete({
        context,
        summary: `Plan-only RAG adapter prepared ${context.node.callableId ?? "unknown index"} for ${context.node.title}.`,
        output: {
          matches: [],
          contextBundle: {
            mode: "plan_only",
            ragId: context.node.callableId ?? null,
            departmentScopeId: context.node.departmentScopeId ?? null,
            summary: `${context.node.title} would retrieve context in live runtime.`,
          },
        },
      }),
  },
  {
    descriptor: descriptor({
      adapterId: "plan-only.agent",
      label: "AI employee adapter",
      description: "Plans a handoff to one AI employee inside its department scope.",
      nodeKinds: ["agent_task"],
      executorKind: "agent",
      runtimeModes: ["plan_only"],
      implementationStatus: "planned",
      requiredInputs: ["taskBrief"],
      optionalInputs: ["contextPacket", "visibleDepartmentScope"],
      outputFields: ["agentResult", "requiredFollowup"],
      requiredPermissions: ["agent:delegate"],
      mutatesData: false,
      plansExternalCall: true,
      defaultApprovalPolicy: "recommended",
    }),
    runPlanOnly: (context) =>
      complete({
        context,
        summary: `Plan-only AI employee adapter prepared ${context.node.agentId ?? "unknown agent"} for ${context.node.title}.`,
        output: {
          agentResult: {
            mode: "dry_run",
            agentId: context.node.agentId ?? null,
            departmentScopeId: context.node.departmentScopeId ?? null,
            summary: `${context.node.title} would hand off to ${context.node.agentId ?? "an AI employee"} in live runtime.`,
            risks: [],
            nextStep: "Connect the real AI employee executor before live execution.",
          },
          requiredFollowup: null,
        },
      }),
  },
  {
    descriptor: descriptor({
      adapterId: "plan-only.dispatch",
      label: "Task dispatch adapter",
      description: "Plans a task split into downstream children.",
      nodeKinds: ["task_dispatch"],
      executorKind: "control",
      runtimeModes: ["plan_only"],
      implementationStatus: "mock",
      requiredInputs: ["taskBrief"],
      optionalInputs: ["constraints"],
      outputFields: ["childTasks", "dispatchMode"],
      requiredPermissions: [],
      mutatesData: false,
      plansExternalCall: false,
      defaultApprovalPolicy: "none",
    }),
    runPlanOnly: (context) =>
      complete({
        context,
        summary: `Plan-only dispatch adapter split ${context.node.title} into zero executable child tasks.`,
        output: {
          childTasks: [],
          dispatchMode: "plan_only",
        },
      }),
  },
  {
    descriptor: descriptor({
      adapterId: "plan-only.aggregate",
      label: "Result aggregate adapter",
      description: "Aggregates upstream node outputs into a compact summary.",
      nodeKinds: ["result_aggregate"],
      executorKind: "control",
      runtimeModes: ["plan_only"],
      implementationStatus: "mock",
      requiredInputs: ["upstreamOutputs"],
      optionalInputs: ["summaryStyle"],
      outputFields: ["summary", "risks", "nextStep"],
      requiredPermissions: [],
      mutatesData: false,
      plansExternalCall: false,
      defaultApprovalPolicy: "none",
    }),
    runPlanOnly: (context) =>
      complete({
        context,
        summary: `Plan-only aggregate adapter summarized upstream outputs for ${context.node.title}.`,
        output: {
          summary: `${context.node.title} aggregated available node outputs in plan-only mode.`,
          risks: [],
          nextStep: "Continue to downstream nodes.",
        },
      }),
  },
  {
    descriptor: descriptor({
      adapterId: "plan-only.condition",
      label: "Condition adapter",
      description: "Plans branch selection and defaults to a safe branch.",
      nodeKinds: ["condition"],
      executorKind: "control",
      runtimeModes: ["plan_only"],
      implementationStatus: "mock",
      requiredInputs: ["conditionContext"],
      optionalInputs: ["defaultBranch"],
      outputFields: ["selectedBranch", "reason"],
      requiredPermissions: [],
      mutatesData: false,
      plansExternalCall: false,
      defaultApprovalPolicy: "none",
    }),
    runPlanOnly: (context) =>
      complete({
        context,
        summary: `Plan-only condition adapter selected default branch for ${context.node.title}.`,
        output: {
          selectedBranch: "default",
          reason: "Plan-only runtime does not evaluate live condition data yet.",
        },
      }),
  },
  {
    descriptor: descriptor({
      adapterId: "plan-only.human-confirm",
      label: "Human confirmation adapter",
      description: "Pauses or confirms a guarded node in plan-only mode.",
      nodeKinds: ["human_confirm"],
      executorKind: "human",
      runtimeModes: ["plan_only"],
      implementationStatus: "available",
      requiredInputs: ["confirmationPrompt"],
      optionalInputs: ["riskSummary"],
      outputFields: ["confirmation"],
      requiredPermissions: ["human:confirm"],
      mutatesData: false,
      plansExternalCall: false,
      defaultApprovalPolicy: "required",
    }),
    runPlanOnly: (context) =>
      complete({
        context,
        summary: `Human confirmation accepted for ${context.node.title}.`,
        output: {
          confirmation: {
            status: "approved",
            mode: "plan_only",
            confirmedAt: context.now,
          },
        },
      }),
  },
  {
    descriptor: descriptor({
      adapterId: "plan-only.bp-ask-followup",
      label: "BP Ask follow-up adapter",
      description: "Plans a follow-up question when the protocol lacks inputs.",
      nodeKinds: ["bp_ask_followup"],
      executorKind: "bp_ask",
      runtimeModes: ["plan_only"],
      implementationStatus: "mock",
      requiredInputs: ["missingInputs"],
      optionalInputs: ["contextPacket"],
      outputFields: ["followupQuestion", "missingInputs"],
      requiredPermissions: [],
      mutatesData: false,
      plansExternalCall: false,
      defaultApprovalPolicy: "none",
    }),
    runPlanOnly: (context) =>
      complete({
        context,
        summary: `Plan-only follow-up adapter prepared a BP Ask follow-up for ${context.node.title}.`,
        output: {
          followupQuestion: "Please provide the missing information for this protocol node.",
          missingInputs: [],
        },
      }),
  },
  {
    descriptor: descriptor({
      adapterId: "plan-only.write",
      label: "Write object adapter",
      description: "Plans a writeback draft without mutating the business object.",
      nodeKinds: ["write_object"],
      executorKind: "write",
      runtimeModes: ["plan_only"],
      implementationStatus: "mock",
      requiredInputs: ["payload"],
      optionalInputs: ["rollbackPlan"],
      outputFields: ["writeDraft"],
      requiredPermissions: ["object:write"],
      mutatesData: true,
      plansExternalCall: true,
      defaultApprovalPolicy: "required",
    }),
    runPlanOnly: (context) =>
      complete({
        context,
        summary: `Plan-only write adapter prepared ${context.node.writableObjectKind ?? "unknown object"} write for ${context.node.title}.`,
        output: {
          writeDraft: {
            mode: "plan_only",
            writableObjectKind: context.node.writableObjectKind ?? null,
            departmentScopeId: context.node.departmentScopeId ?? null,
            mutatesData: false,
            summary: `${context.node.title} would prepare a writeback draft in live runtime.`,
          },
        },
      }),
  },
  {
    descriptor: descriptor({
      adapterId: "plan-only.bp-ask-report",
      label: "BP Ask report adapter",
      description: "Turns protocol outputs into the final BP Ask reply.",
      nodeKinds: ["bp_ask_report"],
      executorKind: "bp_ask",
      runtimeModes: ["plan_only"],
      implementationStatus: "available",
      requiredInputs: ["upstreamOutputs"],
      optionalInputs: ["userPrompt", "riskSummary"],
      outputFields: ["replyText", "protocolExecutionId"],
      requiredPermissions: [],
      mutatesData: false,
      plansExternalCall: false,
      defaultApprovalPolicy: "none",
    }),
    runPlanOnly: (context) =>
      complete({
        context,
        summary: `BP Ask report exit prepared plan-only results for ${context.record.protocolName}.`,
        output: {
          replyText: `${context.record.protocolName} plan-only execution completed. No live external executor was called.`,
          protocolExecutionId: context.record.id,
        },
      }),
  },
];

const adaptersById = new Map(
  planOnlyAdapters.map((adapter) => [adapter.descriptor.adapterId, adapter]),
);

export function listWorkProtocolExecutorAdapterDescriptors() {
  return planOnlyAdapters.map((adapter) => adapter.descriptor);
}

export function getWorkProtocolExecutorAdapterDescriptor(adapterId: string) {
  return adaptersById.get(adapterId)?.descriptor ?? null;
}

const ADAPTER_PERMISSION_GUARDS: Record<
  string,
  WorkProtocolExecutorAdapterPermissionGuardDefinition
> = {
  "tool:execute": {
    guardKind: "department_scope",
    enforcedBy: "runtime-preflight",
    issueCodes: ["unknown_department_scope", "permission_denied"],
    note: "Tool calls must be allowed by the current department scope.",
  },
  "skill:run": {
    guardKind: "department_scope",
    enforcedBy: "runtime-preflight",
    issueCodes: ["unknown_department_scope", "permission_denied"],
    note: "Skill calls must be backed by a Skill folder visible in the current scope.",
  },
  "rag:read": {
    guardKind: "department_scope",
    enforcedBy: "runtime-preflight",
    issueCodes: ["unknown_department_scope", "permission_denied"],
    note: "RAG retrieval must run inside a readable resource scope.",
  },
  "agent:delegate": {
    guardKind: "department_scope",
    enforcedBy: "runtime-preflight",
    issueCodes: ["unknown_department_scope", "permission_denied"],
    note: "AI employee delegation must target an agent visible in the current scope.",
  },
  "object:write": {
    guardKind: "department_scope",
    enforcedBy: "runtime-preflight",
    issueCodes: ["unknown_department_scope", "permission_denied", "approval_required"],
    note: "Writeback nodes must target writable object types in the current scope.",
  },
  "human:confirm": {
    guardKind: "human_confirmation",
    enforcedBy: "state-machine",
    issueCodes: ["invalid_state_transition"],
    note: "Human confirmation is enforced by node run state transitions.",
  },
};

function summarizeAdapterPermission(
  permission: string,
  adapters: WorkProtocolExecutorAdapterDescriptor[],
): WorkProtocolExecutorAdapterPermissionSummary {
  const guard = ADAPTER_PERMISSION_GUARDS[permission];
  const adapterIds = adapters
    .filter((adapter) => adapter.requiredPermissions.includes(permission))
    .map((adapter) => adapter.adapterId);

  if (!guard) {
    return {
      permission,
      guardKind: "unknown",
      enforcedBy: "none",
      issueCodes: ["capability_catalog_stale"],
      adapterIds,
      note: "This permission is declared by an adapter but is not registered in the runtime guard vocabulary.",
    };
  }

  return {
    permission,
    ...guard,
    adapterIds,
  };
}

export function buildWorkProtocolExecutorAdapterRegistrySummary(): WorkProtocolExecutorAdapterRegistrySummary {
  const adapters = listWorkProtocolExecutorAdapterDescriptors();
  const permissions = uniqueStrings(
    adapters.flatMap((adapter) => adapter.requiredPermissions),
  ).map((permission) => summarizeAdapterPermission(permission, adapters));
  const nodeKindAdapters = adapters.flatMap((adapter) =>
    adapter.nodeKinds.map((nodeKind) => ({
      nodeKind,
      executorKind: adapter.executorKind,
      adapterId: adapter.adapterId,
      adapterLabel: adapter.label,
      runtimeModes: adapter.runtimeModes,
      requiredPermissions: adapter.requiredPermissions,
    })),
  );

  return {
    registryVersion: "work-protocol-adapter-registry.v1",
    runtimeModes: uniqueStrings(
      adapters.flatMap((adapter) => adapter.runtimeModes),
    ) as WorkProtocolExecutorAdapterRuntimeMode[],
    adapters,
    permissions,
    nodeKindAdapters,
    counts: {
      totalAdapters: adapters.length,
      byStatus: countBy(adapters, (adapter) => adapter.implementationStatus),
      byExecutorKind: countBy(adapters, (adapter) => adapter.executorKind),
      externalCallAdapters: adapters.filter((adapter) => adapter.plansExternalCall)
        .length,
      mutatingAdapters: adapters.filter((adapter) => adapter.mutatesData).length,
      guardedPermissionCount: permissions.filter(
        (permission) => permission.guardKind !== "unknown",
      ).length,
      unknownPermissionCount: permissions.filter(
        (permission) => permission.guardKind === "unknown",
      ).length,
    },
    knownGaps: [
      "Only plan_only runtime adapters are registered.",
      "Skill, RAG and AI employee adapters are planning shells until their live executors are connected.",
      "Write adapters produce write drafts in plan_only mode and do not mutate business data.",
    ],
  };
}

export function resolvePlanOnlyWorkProtocolNodeAdapter(
  node: Pick<CompiledNodeSpec, "kind" | "executorKind">,
) {
  return (
    planOnlyAdapters.find(
      (adapter) =>
        adapter.descriptor.executorKind === node.executorKind &&
        adapter.descriptor.nodeKinds.includes(node.kind),
    ) ?? null
  );
}

function inputNamesByRequired(
  node: Pick<CompiledNodeSpec, "inputBindings">,
  required: boolean,
) {
  return node.inputBindings
    .filter((binding) => binding.required === required)
    .map((binding) => binding.name);
}

function plannedOutputNames(node: Pick<CompiledNodeSpec, "outputFields">) {
  return node.outputFields.map((field) => field.name);
}

function nodeRequiresConfirmation(
  node: Pick<CompiledNodeSpec, "approvalPolicy" | "riskLevel">,
  descriptor: WorkProtocolExecutorAdapterDescriptor,
) {
  return (
    node.approvalPolicy === "required" ||
    descriptor.defaultApprovalPolicy === "required" ||
    node.riskLevel === "high" ||
    node.riskLevel === "critical"
  );
}

export function buildPlanOnlyWorkProtocolNodeAdapterPlan(
  node: CompiledNodeSpec,
): WorkProtocolNodeAdapterPlan {
  const adapter = resolvePlanOnlyWorkProtocolNodeAdapter(node);

  if (!adapter) {
    return {
      adapterId: "missing",
      label: "Missing executor adapter",
      executorKind: node.executorKind,
      runtimeMode: "plan_only",
      implementationStatus: "disabled",
      available: false,
      requiredInputs: uniqueStrings(inputNamesByRequired(node, true)),
      optionalInputs: uniqueStrings(inputNamesByRequired(node, false)),
      outputFields: uniqueStrings(plannedOutputNames(node)),
      requiredPermissions: [],
      permissionRefs: node.permissionRefs,
      mutatesData: false,
      plansExternalCall: false,
      requiresConfirmation: node.approvalPolicy === "required",
      planSummary: `No plan-only adapter is registered for ${node.kind}/${node.executorKind}.`,
    };
  }

  const descriptor = adapter.descriptor;
  const requiredInputs = uniqueStrings([
    ...descriptor.requiredInputs,
    ...inputNamesByRequired(node, true),
  ]);
  const optionalInputs = uniqueStrings([
    ...descriptor.optionalInputs,
    ...inputNamesByRequired(node, false),
  ]);
  const outputFields = uniqueStrings([
    ...descriptor.outputFields,
    ...plannedOutputNames(node),
  ]);

  return {
    adapterId: descriptor.adapterId,
    label: descriptor.label,
    executorKind: descriptor.executorKind,
    runtimeMode: "plan_only",
    implementationStatus: descriptor.implementationStatus,
    available: true,
    requiredInputs,
    optionalInputs,
    outputFields,
    requiredPermissions: descriptor.requiredPermissions,
    permissionRefs: node.permissionRefs,
    mutatesData: descriptor.mutatesData,
    plansExternalCall: descriptor.plansExternalCall,
    requiresConfirmation: nodeRequiresConfirmation(node, descriptor),
    planSummary: `${descriptor.label} will handle ${node.title} in plan-only mode.`,
  };
}

export function runPlanOnlyWorkProtocolNodeAdapter(
  context: WorkProtocolNodeAdapterContext,
): WorkProtocolNodeAdapterResult {
  const { node, record } = context;

  if (record.mode !== "plan_only") {
    return fail({
      context,
      message: `${node.title} cannot run with a plan-only adapter in ${record.mode} mode.`,
      suggestion: "Create a plan-only execution or connect a live runtime adapter first.",
    });
  }

  const adapter = node.adapterId
    ? adaptersById.get(node.adapterId)
    : resolvePlanOnlyWorkProtocolNodeAdapter(node);

  if (!adapter || !adapter.descriptor.nodeKinds.includes(node.kind)) {
    return fail({
      context,
      message: `Node ${node.title} has no registered executor adapter.`,
      suggestion: "Register an adapter for this node kind before it enters runtime.",
    });
  }

  if (!adapter.descriptor.runtimeModes.includes("plan_only")) {
    return fail({
      context,
      message: `Adapter ${adapter.descriptor.adapterId} does not support plan-only mode.`,
      suggestion: "Use a compatible adapter or create a live execution runtime.",
    });
  }

  return adapter.runPlanOnly(context);
}
