import type {
  ProtocolCompileStatus,
  ProtocolExecutionStatus,
  ProtocolNodeRunStatus,
} from "@/lib/work-protocol/types";

export type WorkProtocolTransitionKind =
  | "compile"
  | "execution"
  | "node";

export type WorkProtocolTransitionCheck<TStatus extends string> = {
  kind: WorkProtocolTransitionKind;
  from: TStatus;
  to: TStatus;
  allowed: boolean;
  reason?: string;
};

const compileStatusTransitions = {
  draft: ["compiled", "invalid", "stale"],
  compiled: ["compiled", "stale", "invalid"],
  stale: ["compiled", "invalid"],
  invalid: ["draft", "compiled", "invalid"],
} satisfies Record<ProtocolCompileStatus, readonly ProtocolCompileStatus[]>;

const executionStatusTransitions = {
  queued: ["running", "waiting_confirmation", "completed", "failed", "cancelled"],
  running: ["waiting_confirmation", "completed", "failed", "cancelled"],
  waiting_confirmation: ["running", "completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
} satisfies Record<ProtocolExecutionStatus, readonly ProtocolExecutionStatus[]>;

const nodeRunStatusTransitions = {
  queued: ["running", "waiting_confirmation", "completed", "skipped", "failed"],
  running: ["waiting_confirmation", "completed", "skipped", "failed"],
  waiting_confirmation: ["running", "completed", "skipped", "failed"],
  completed: [],
  skipped: [],
  failed: [],
} satisfies Record<ProtocolNodeRunStatus, readonly ProtocolNodeRunStatus[]>;

export const PROTOCOL_EXECUTION_TERMINAL_STATUSES = [
  "completed",
  "failed",
  "cancelled",
] satisfies readonly ProtocolExecutionStatus[];

export const PROTOCOL_NODE_TERMINAL_STATUSES = [
  "completed",
  "skipped",
  "failed",
] satisfies readonly ProtocolNodeRunStatus[];

const protocolExecutionTerminalStatusSet = new Set<ProtocolExecutionStatus>(
  PROTOCOL_EXECUTION_TERMINAL_STATUSES,
);
const protocolNodeTerminalStatusSet = new Set<ProtocolNodeRunStatus>(
  PROTOCOL_NODE_TERMINAL_STATUSES,
);

function transitionCheck<TStatus extends string>(params: {
  kind: WorkProtocolTransitionKind;
  from: TStatus;
  to: TStatus;
  allowedTargets: readonly TStatus[];
}): WorkProtocolTransitionCheck<TStatus> {
  const allowed =
    params.from === params.to || params.allowedTargets.includes(params.to);

  return {
    kind: params.kind,
    from: params.from,
    to: params.to,
    allowed,
    reason: allowed
      ? undefined
      : `${params.kind} status cannot transition from ${params.from} to ${params.to}.`,
  };
}

function assertTransition<TStatus extends string>(
  check: WorkProtocolTransitionCheck<TStatus>,
) {
  if (!check.allowed) {
    throw new Error(
      `INVALID_WORK_PROTOCOL_${check.kind.toUpperCase()}_STATUS_TRANSITION:${check.from}->${check.to}`,
    );
  }
}

export function checkProtocolCompileStatusTransition(
  from: ProtocolCompileStatus,
  to: ProtocolCompileStatus,
) {
  return transitionCheck({
    kind: "compile",
    from,
    to,
    allowedTargets: compileStatusTransitions[from],
  });
}

export function assertProtocolCompileStatusTransition(
  from: ProtocolCompileStatus,
  to: ProtocolCompileStatus,
) {
  assertTransition(checkProtocolCompileStatusTransition(from, to));
}

export function checkProtocolExecutionStatusTransition(
  from: ProtocolExecutionStatus,
  to: ProtocolExecutionStatus,
) {
  return transitionCheck({
    kind: "execution",
    from,
    to,
    allowedTargets: executionStatusTransitions[from],
  });
}

export function assertProtocolExecutionStatusTransition(
  from: ProtocolExecutionStatus,
  to: ProtocolExecutionStatus,
) {
  assertTransition(checkProtocolExecutionStatusTransition(from, to));
}

export function checkProtocolNodeRunStatusTransition(
  from: ProtocolNodeRunStatus,
  to: ProtocolNodeRunStatus,
) {
  return transitionCheck({
    kind: "node",
    from,
    to,
    allowedTargets: nodeRunStatusTransitions[from],
  });
}

export function assertProtocolNodeRunStatusTransition(
  from: ProtocolNodeRunStatus,
  to: ProtocolNodeRunStatus,
) {
  assertTransition(checkProtocolNodeRunStatusTransition(from, to));
}

export function isProtocolExecutionTerminalStatus(
  status: ProtocolExecutionStatus,
) {
  return protocolExecutionTerminalStatusSet.has(status);
}

export function isProtocolNodeTerminalStatus(status: ProtocolNodeRunStatus) {
  return protocolNodeTerminalStatusSet.has(status);
}
