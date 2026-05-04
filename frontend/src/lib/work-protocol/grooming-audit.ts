import type {
  WorkProtocolGroomingInputPack,
  WorkProtocolModelOutputValidationIssue,
  WorkProtocolModelOutputValidationResult,
} from "@/lib/work-protocol/grooming-contract";
import type {
  WorkProtocolModelOutputApplicationResult,
  WorkProtocolModelOutputAppliedChange,
  WorkProtocolModelOutputIgnoredChange,
} from "@/lib/work-protocol/model-output-applier";
import type {
  ProtocolIssue,
  ProtocolIssueTarget,
} from "@/lib/work-protocol/types";

export type WorkProtocolGroomingAuditSeverity =
  | "success"
  | "info"
  | "warning"
  | "error";

export type WorkProtocolGroomingAuditStatus =
  | "pass"
  | "warning"
  | "blocked";

export type WorkProtocolGroomingAuditSource =
  | "input_pack"
  | "deterministic_groom"
  | "model_output_validation"
  | "model_output_application";

export type WorkProtocolGroomingAuditTarget = ProtocolIssueTarget & {
  label?: string;
};

export type WorkProtocolGroomingAuditEvent = {
  id: string;
  source: WorkProtocolGroomingAuditSource;
  severity: WorkProtocolGroomingAuditSeverity;
  target: WorkProtocolGroomingAuditTarget;
  code: string;
  title: string;
  message: string;
  suggestion?: string;
  path?: string;
  metadata?: Record<string, unknown>;
};

export type WorkProtocolGroomingAuditSection = {
  id: string;
  title: string;
  status: WorkProtocolGroomingAuditStatus;
  message: string;
  counts: {
    success: number;
    info: number;
    warnings: number;
    errors: number;
  };
  events: WorkProtocolGroomingAuditEvent[];
};

export type WorkProtocolGroomingAudit = {
  schemaVersion: "work-protocol-grooming-audit.v1";
  generatedAt: string;
  status: WorkProtocolGroomingAuditStatus;
  summary: {
    success: number;
    info: number;
    warnings: number;
    errors: number;
    sections: number;
    modelOutputValid?: boolean;
    applicationStatus?: WorkProtocolModelOutputApplicationResult["status"];
    appliedChanges: number;
    ignoredChanges: number;
    canRegister?: boolean;
  };
  sections: WorkProtocolGroomingAuditSection[];
  eventsByTarget: Record<string, WorkProtocolGroomingAuditEvent[]>;
};

type DeterministicGroomingAuditInput = {
  status: string;
  summary: {
    errors: number;
    warnings: number;
    info: number;
    nodes: number;
    edges: number;
    departments: number;
    parameterCodeBlocks: number;
    canRegister: boolean;
  };
  protocolSummary: {
    message: string;
    issues: ProtocolIssue[];
    suggestions: string[];
  };
  departmentAnnotations: Record<
    string,
    {
      targetId: string;
      label: string;
      issues: ProtocolIssue[];
    }
  >;
  nodeAnnotations: Record<
    string,
    {
      targetId: string;
      label: string;
      issues: ProtocolIssue[];
    }
  >;
  edgeAnnotations: Record<
    string,
    {
      targetId: string;
      label: string;
      issues: ProtocolIssue[];
    }
  >;
  modelInputPack?: WorkProtocolGroomingInputPack;
};

export type BuildWorkProtocolGroomingAuditParams = {
  inputPack?: WorkProtocolGroomingInputPack;
  deterministic?: DeterministicGroomingAuditInput;
  validation?: WorkProtocolModelOutputValidationResult;
  application?: WorkProtocolModelOutputApplicationResult;
  modelOutput?: unknown;
};

function severityFromProtocolIssue(
  issue: ProtocolIssue,
): WorkProtocolGroomingAuditSeverity {
  if (issue.severity === "error") {
    return "error";
  }

  if (issue.severity === "warning") {
    return "warning";
  }

  return "info";
}

function statusFromEvents(
  events: WorkProtocolGroomingAuditEvent[],
): WorkProtocolGroomingAuditStatus {
  if (events.some((event) => event.severity === "error")) {
    return "blocked";
  }

  if (events.some((event) => event.severity === "warning")) {
    return "warning";
  }

  return "pass";
}

function countEvents(events: WorkProtocolGroomingAuditEvent[]) {
  return {
    success: events.filter((event) => event.severity === "success").length,
    info: events.filter((event) => event.severity === "info").length,
    warnings: events.filter((event) => event.severity === "warning").length,
    errors: events.filter((event) => event.severity === "error").length,
  };
}

function targetKey(target: WorkProtocolGroomingAuditTarget) {
  return `${target.kind}:${target.id ?? "root"}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getArrayItem(value: unknown, index: number) {
  return Array.isArray(value) ? value[index] : undefined;
}

function targetFromValidationPath(
  issue: WorkProtocolModelOutputValidationIssue,
  modelOutput: unknown,
): WorkProtocolGroomingAuditTarget {
  if (!isRecord(modelOutput)) {
    return { kind: "protocol" };
  }

  const nodeMatch = issue.path.match(/^nodeUpdates\[(\d+)\]/);

  if (nodeMatch) {
    const update = getArrayItem(modelOutput.nodeUpdates, Number(nodeMatch[1]));

    if (isRecord(update) && typeof update.nodeId === "string") {
      return { kind: "node", id: update.nodeId };
    }

    return { kind: "node" };
  }

  const edgeMatch = issue.path.match(/^edgeUpdates\[(\d+)\]/);

  if (edgeMatch) {
    const update = getArrayItem(modelOutput.edgeUpdates, Number(edgeMatch[1]));

    if (isRecord(update) && typeof update.edgeId === "string") {
      return { kind: "edge", id: update.edgeId };
    }

    return { kind: "edge" };
  }

  return { kind: "protocol" };
}

function issueToAuditEvent(issue: ProtocolIssue): WorkProtocolGroomingAuditEvent {
  return {
    id: `deterministic:${issue.id}`,
    source: "deterministic_groom",
    severity: severityFromProtocolIssue(issue),
    target: issue.target,
    code: issue.code,
    title: issue.code,
    message: issue.message,
    suggestion: issue.suggestion,
  };
}

function validationIssueToAuditEvent(params: {
  issue: WorkProtocolModelOutputValidationIssue;
  index: number;
  modelOutput: unknown;
}): WorkProtocolGroomingAuditEvent {
  return {
    id: `model-output-validation:${params.index}:${params.issue.code}`,
    source: "model_output_validation",
    severity: "error",
    target: targetFromValidationPath(params.issue, params.modelOutput),
    code: params.issue.code,
    title: params.issue.code,
    message: params.issue.message,
    path: params.issue.path,
  };
}

function appliedChangeToAuditEvent(
  change: WorkProtocolModelOutputAppliedChange,
  index: number,
): WorkProtocolGroomingAuditEvent {
  return {
    id: `model-output-application:applied:${index}`,
    source: "model_output_application",
    severity: "success",
    target: {
      kind: change.target,
      id: change.targetId,
    },
    code: "model_output_change_applied",
    title: "Model output change applied",
    message: `Applied ${change.path}.`,
    path: change.path,
    metadata: {
      before: change.before,
      after: change.after,
    },
  };
}

function ignoredChangeSeverity(
  change: WorkProtocolModelOutputIgnoredChange,
): WorkProtocolGroomingAuditSeverity {
  if (change.reason === "validation_failed") {
    return "error";
  }

  if (change.reason === "no_effect") {
    return "info";
  }

  return "warning";
}

function ignoredChangeToAuditEvent(
  change: WorkProtocolModelOutputIgnoredChange,
  index: number,
): WorkProtocolGroomingAuditEvent {
  return {
    id: `model-output-application:ignored:${index}`,
    source: "model_output_application",
    severity: ignoredChangeSeverity(change),
    target: {
      kind: change.target === "edge" ? "edge" : "node",
      id: change.targetId,
    },
    code: change.reason,
    title: "Model output change ignored",
    message: change.message,
    path: change.path,
  };
}

function buildInputPackSection(
  inputPack: WorkProtocolGroomingInputPack | undefined,
): WorkProtocolGroomingAuditSection | null {
  if (!inputPack) {
    return null;
  }

  const event: WorkProtocolGroomingAuditEvent = {
    id: "input-pack:generated",
    source: "input_pack",
    severity: "success",
    target: { kind: "protocol" },
    code: "input_pack_generated",
    title: "Grooming input pack generated",
    message: `Input pack includes ${inputPack.nodes.length} nodes, ${inputPack.edges.length} edges, ${inputPack.departments.length} departments, and ${inputPack.capabilityContracts.length} relevant contracts.`,
    metadata: {
      catalogHash: inputPack.catalogHash,
      includedContractIds: inputPack.includedContractIds,
    },
  };

  return {
    id: "input_pack",
    title: "Model input pack",
    status: "pass",
    message: "Model-visible protocol context is ready.",
    counts: countEvents([event]),
    events: [event],
  };
}

function buildDeterministicSection(
  deterministic: DeterministicGroomingAuditInput | undefined,
): WorkProtocolGroomingAuditSection | null {
  if (!deterministic) {
    return null;
  }

  const events = [
    ...deterministic.protocolSummary.issues.map(issueToAuditEvent),
    ...Object.values(deterministic.departmentAnnotations).flatMap((annotation) =>
      annotation.issues.map(issueToAuditEvent),
    ),
    ...Object.values(deterministic.nodeAnnotations).flatMap((annotation) =>
      annotation.issues.map(issueToAuditEvent),
    ),
    ...Object.values(deterministic.edgeAnnotations).flatMap((annotation) =>
      annotation.issues.map(issueToAuditEvent),
    ),
  ];
  const uniqueEvents = Array.from(
    new Map(events.map((event) => [event.id, event])).values(),
  );

  if (uniqueEvents.length === 0) {
    uniqueEvents.push({
      id: "deterministic-groom:clean",
      source: "deterministic_groom",
      severity: "success",
      target: { kind: "protocol" },
      code: "deterministic_groom_clean",
      title: "Deterministic grooming passed",
      message: deterministic.protocolSummary.message,
      metadata: {
        status: deterministic.status,
        canRegister: deterministic.summary.canRegister,
        parameterCodeBlocks: deterministic.summary.parameterCodeBlocks,
      },
    });
  }

  return {
    id: "deterministic_groom",
    title: "Deterministic grooming",
    status: statusFromEvents(uniqueEvents),
    message: deterministic.protocolSummary.message,
    counts: countEvents(uniqueEvents),
    events: uniqueEvents,
  };
}

function buildValidationSection(params: {
  validation?: WorkProtocolModelOutputValidationResult;
  modelOutput?: unknown;
}): WorkProtocolGroomingAuditSection | null {
  if (!params.validation) {
    return null;
  }

  const events = params.validation.issues.map((issue, index) =>
    validationIssueToAuditEvent({
      issue,
      index,
      modelOutput: params.modelOutput,
    }),
  );

  if (events.length === 0) {
    events.push({
      id: "model-output-validation:valid",
      source: "model_output_validation",
      severity: "success",
      target: { kind: "protocol" },
      code: "model_output_valid",
      title: "Model output is valid",
      message: "Model output matches the grooming output contract and references known targets.",
    });
  }

  return {
    id: "model_output_validation",
    title: "Model output validation",
    status: statusFromEvents(events),
    message: params.validation.valid
      ? "Model output can continue to patch application."
      : "Model output was rejected by the contract validator.",
    counts: countEvents(events),
    events,
  };
}

function buildApplicationSection(
  application: WorkProtocolModelOutputApplicationResult | undefined,
): WorkProtocolGroomingAuditSection | null {
  if (!application) {
    return null;
  }

  const events = [
    ...application.appliedChanges.map(appliedChangeToAuditEvent),
    ...application.ignoredChanges.map(ignoredChangeToAuditEvent),
  ];

  if (events.length === 0) {
    events.push({
      id: "model-output-application:no-change",
      source: "model_output_application",
      severity: application.status === "rejected" ? "error" : "info",
      target: { kind: "protocol" },
      code: "model_output_no_change",
      title: "No model patch applied",
      message:
        application.status === "rejected"
          ? "Model output was rejected before patch application."
          : "Model output did not request any supported patch.",
    });
  }

  return {
    id: "model_output_application",
    title: "Model output application",
    status: statusFromEvents(events),
    message:
      application.status === "rejected"
        ? "No draft changes were applied."
        : `${application.appliedChanges.length} changes applied, ${application.ignoredChanges.length} changes ignored.`,
    counts: countEvents(events),
    events,
  };
}

function indexEventsByTarget(sections: WorkProtocolGroomingAuditSection[]) {
  const indexed: Record<string, WorkProtocolGroomingAuditEvent[]> = {};

  for (const event of sections.flatMap((section) => section.events)) {
    const key = targetKey(event.target);
    indexed[key] = [...(indexed[key] ?? []), event];
  }

  return indexed;
}

export function buildWorkProtocolGroomingAudit(
  params: BuildWorkProtocolGroomingAuditParams,
): WorkProtocolGroomingAudit {
  const inputPack = params.inputPack ?? params.deterministic?.modelInputPack;
  const sections = [
    buildInputPackSection(inputPack),
    buildDeterministicSection(params.deterministic),
    buildValidationSection({
      validation: params.validation,
      modelOutput: params.modelOutput,
    }),
    buildApplicationSection(params.application),
  ].filter(
    (section): section is WorkProtocolGroomingAuditSection => Boolean(section),
  );
  const allEvents = sections.flatMap((section) => section.events);
  const counts = countEvents(allEvents);

  return {
    schemaVersion: "work-protocol-grooming-audit.v1",
    generatedAt: new Date().toISOString(),
    status: statusFromEvents(allEvents),
    summary: {
      ...counts,
      sections: sections.length,
      modelOutputValid: params.validation?.valid,
      applicationStatus: params.application?.status,
      appliedChanges: params.application?.appliedChanges.length ?? 0,
      ignoredChanges: params.application?.ignoredChanges.length ?? 0,
      canRegister: params.deterministic?.summary.canRegister,
    },
    sections,
    eventsByTarget: indexEventsByTarget(sections),
  };
}
