export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonSchema = JsonObject;

export type ProtocolNodeKind =
  | "bp_ask_entry"
  | "tool_call"
  | "skill_call"
  | "rag_search"
  | "agent_task"
  | "task_dispatch"
  | "result_aggregate"
  | "condition"
  | "human_confirm"
  | "bp_ask_followup"
  | "write_object"
  | "bp_ask_report";

export type ProtocolExecutorKind =
  | "bp_ask"
  | "system"
  | "tool"
  | "skill"
  | "rag"
  | "agent"
  | "control"
  | "human"
  | "write";

export type ProtocolRiskLevel = "none" | "low" | "medium" | "high" | "critical";
export type ProtocolApprovalPolicy = "none" | "recommended" | "required";
export type ProtocolCompileStatus = "draft" | "compiled" | "stale" | "invalid";
export type CompiledSpecStatus = "empty" | "fresh" | "stale" | "invalid";
export type ProtocolRuntimeMode = "plan_only" | "live";
export type WorkProtocolDraftRecordKind = "source" | "groomed";
export type CapabilityImplementationStatus =
  | "available"
  | "mock"
  | "planned"
  | "disabled";

export type CapabilityContractKind =
  | "department"
  | "department_scope"
  | "bp_ask"
  | "tool"
  | "skill"
  | "rag"
  | "agent"
  | "control"
  | "human_gate"
  | "write_object"
  | "report";

export type CapabilityContractRiskLevel = "low" | "medium" | "high";

export type CapabilityContractSource = {
  catalogSection:
    | "departments"
    | "departmentScopes"
    | "nodeKinds"
    | "agents"
    | "callables"
    | "writableObjects";
  catalogId: string;
};

export type CapabilityContract = {
  contractVersion: "capability-contract.v1";
  id: string;
  kind: CapabilityContractKind;
  label: string;
  description?: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  scopes: string[];
  permissions: string[];
  riskLevel: CapabilityContractRiskLevel;
  status: CapabilityImplementationStatus;
  implementationNote?: string;
  approvalPolicy?: ProtocolApprovalPolicy;
  mutatesData?: boolean;
  requiresConfirmationDefault?: boolean;
  parameterHints?: {
    requiredInputs: string[];
    optionalInputs: string[];
    outputs: string[];
  };
  source: CapabilityContractSource;
};

export type CanvasPosition = {
  x: number;
  y: number;
};

export type CanvasSize = {
  width: number;
  height: number;
};

export type ProtocolReferenceKind =
  | "department"
  | "department_scope"
  | "agent"
  | "tool"
  | "skill"
  | "skill_folder"
  | "rag_index"
  | "memory_folder"
  | "work_order"
  | "document"
  | "spreadsheet"
  | "execution_result"
  | "memory_fact";

export type ProtocolReference = {
  kind: ProtocolReferenceKind;
  id: string;
  label?: string;
};

export type ProtocolTriggerRule = {
  id: string;
  label: string;
  description?: string;
  matchMode: "semantic" | "keyword" | "manual" | "event";
  keywords?: string[];
  intentHints?: string[];
  minConfidence?: number;
  enabled: boolean;
};

export type CanvasDepartmentDraft = {
  id: string;
  departmentId: string;
  departmentLabel: string;
  primaryScopeId: string;
  primaryScopeLabel: string;
  secondaryScopeId?: string;
  secondaryScopeLabel?: string;
  tertiaryScopeId?: string;
  tertiaryScopeLabel?: string;
  resourceRefs: ProtocolReference[];
  visibleAgentIds: string[];
  position: CanvasPosition;
  size: CanvasSize;
  collapsed: boolean;
};

export type CanvasNodeDraft = {
  id: string;
  kind: ProtocolNodeKind;
  title: string;
  userIntent: string;
  departmentDraftId?: string;
  agentId?: string;
  callableId?: string;
  writableObjectKind?: string;
  position: CanvasPosition;
  compiledSpecStatus: CompiledSpecStatus;
  compiledSpec?: CompiledNodeSpec;
};

export type CanvasEdgeDraft = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  transferIntent: string;
  compiledSpecStatus: CompiledSpecStatus;
  compiledSpec?: CompiledEdgeSpec;
};

export type WorkProtocolDraft = {
  id: string;
  name: string;
  description?: string;
  departments: CanvasDepartmentDraft[];
  nodes: CanvasNodeDraft[];
  edges: CanvasEdgeDraft[];
  triggerDrafts: ProtocolTriggerRule[];
  compileStatus: ProtocolCompileStatus;
  latestCompiledVersionId?: string;
  createdAt: string;
  updatedAt: string;
};

export type DepartmentScopeCapability = {
  scopeId: string;
  label: string;
  resourceKind: ProtocolReferenceKind;
  resourceRefs: ProtocolReference[];
  visibleAgentIds: string[];
  readableObjectTypes: ProtocolReferenceKind[];
  writableObjectTypes: ProtocolReferenceKind[];
  allowedToolIds: string[];
  allowedSkillFolderIds: string[];
  allowedMemoryFolderIds: string[];
};

export type DepartmentCapability = {
  departmentId: string;
  label: string;
  description?: string;
  implementationStatus: CapabilityImplementationStatus;
  implementationNote?: string;
  scopeOptions: DepartmentScopeCapability[];
  defaultApprovalPolicy: ProtocolApprovalPolicy;
};

export type AgentCapability = {
  agentId: string;
  displayName: string;
  description?: string;
  implementationStatus: CapabilityImplementationStatus;
  implementationNote?: string;
  visibleDepartmentScopeIds: string[];
  taskKinds: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  allowedSkillFolderIds: string[];
  allowedMemoryFolderIds: string[];
  canWrite: boolean;
  canAskFollowup: boolean;
  handoffProtocol: {
    inputPacketVersion: string;
    outputPacketVersion: string;
  };
};

export type NodeKindCapability = {
  kind: ProtocolNodeKind;
  displayName: string;
  description?: string;
  implementationStatus: CapabilityImplementationStatus;
  implementationNote?: string;
  executorKind: ProtocolExecutorKind;
  requiredInputs: string[];
  optionalInputs: string[];
  outputs: string[];
  permissionRequirements: string[];
  approvalPolicy: ProtocolApprovalPolicy;
  failureModes: string[];
};

export type CallableCapability = {
  capabilityId: string;
  kind: "tool" | "skill" | "rag";
  displayName: string;
  description?: string;
  implementationStatus: CapabilityImplementationStatus;
  implementationNote?: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  requiredContext: string[];
  riskLevel: ProtocolRiskLevel;
  mutatesData: boolean;
  requiresConfirmationDefault: boolean;
  allowedDepartmentScopeIds?: string[];
  requiredSkillFolderId?: string;
};

export type WritableObjectActionCapability = {
  actionName: string;
  inputSchema: JsonSchema;
  rollbackSupported: boolean;
  confirmationRequired: boolean;
  allowedDepartmentScopeIds: string[];
};

export type WritableObjectCapability = {
  objectKind: ProtocolReferenceKind;
  displayName: string;
  implementationStatus: CapabilityImplementationStatus;
  implementationNote?: string;
  actions: WritableObjectActionCapability[];
};

export type CapabilityCatalog = {
  catalogVersion: string;
  generatedAt: string;
  catalogHash?: string;
  departments: DepartmentCapability[];
  agents: AgentCapability[];
  nodeKinds: NodeKindCapability[];
  callables: CallableCapability[];
  writableObjects: WritableObjectCapability[];
};

export type CompiledInputBinding = {
  name: string;
  source:
    | "user_input"
    | "context_packet"
    | "node_output"
    | "constant"
    | "department_scope"
    | "runtime";
  sourceNodeId?: string;
  path?: string;
  value?: JsonValue;
  required: boolean;
  description?: string;
};

export type CompiledOutputField = {
  name: string;
  jsonPath: string;
  schema: JsonSchema;
  description?: string;
};

export type CompiledRetryPolicy = {
  maxAttempts: number;
  retryOn: string[];
};

export type CompiledFailurePolicy = {
  mode: "fail_protocol" | "skip_node" | "route_to_node" | "return_to_bp_ask";
  targetNodeId?: string;
};

export type CompiledNodeSpec = {
  nodeId: string;
  kind: ProtocolNodeKind;
  title: string;
  executorKind: ProtocolExecutorKind;
  intentSummary: string;
  callableId?: string;
  agentId?: string;
  departmentScopeId?: string;
  writableObjectKind?: ProtocolReferenceKind;
  inputBindings: CompiledInputBinding[];
  outputFields: CompiledOutputField[];
  riskLevel: ProtocolRiskLevel;
  approvalPolicy: ProtocolApprovalPolicy;
  permissionRefs: ProtocolReference[];
  timeoutMs?: number;
  retryPolicy?: CompiledRetryPolicy;
  failurePolicy: CompiledFailurePolicy;
};

export type CompiledFieldMapping = {
  fromPath: string;
  toPath: string;
  required: boolean;
};

export type CompiledEdgeSpec = {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  transferMode: "communication_prompt" | "structured_packet" | "field_mapping" | "control_signal";
  prompt?: string;
  fieldMappings: CompiledFieldMapping[];
  requiredFields: string[];
  outputPacketSchema?: JsonSchema;
};

export type CompiledProtocolDefinition = {
  id: string;
  draftId: string;
  versionId: string;
  versionNumber: number;
  name: string;
  description?: string;
  status: "compiled" | "deprecated";
  triggerRules: ProtocolTriggerRule[];
  nodes: CompiledNodeSpec[];
  edges: CompiledEdgeSpec[];
  entryNodeIds: string[];
  reportNodeIds: string[];
  requiredInputs: string[];
  outputSchema: JsonSchema;
  permissionSummary: ProtocolReference[];
  capabilityCatalogHash?: string;
  createdAt: string;
};

export type ProtocolIssueSeverity = "error" | "warning" | "info";

export type ProtocolIssueCode =
  | "missing_required_text"
  | "duplicate_id"
  | "unknown_department_scope"
  | "unknown_node_kind"
  | "unknown_agent"
  | "unknown_callable"
  | "unknown_writable_object"
  | "capability_not_available"
  | "permission_denied"
  | "approval_required"
  | "field_flow_mismatch"
  | "unreachable_node"
  | "missing_edge_endpoint"
  | "cycle_detected"
  | "model_output_invalid"
  | "invalid_state_transition"
  | "runtime_deadlock"
  | "executor_not_available"
  | "executor_failed"
  | "protocol_not_enabled"
  | "protocol_version_unavailable"
  | "runtime_mode_mismatch"
  | "capability_catalog_stale";

export type ProtocolIssueTarget = {
  kind: "protocol" | "department" | "node" | "edge";
  id?: string;
};

export type ProtocolIssue = {
  id: string;
  severity: ProtocolIssueSeverity;
  code: ProtocolIssueCode;
  target: ProtocolIssueTarget;
  message: string;
  suggestion?: string;
};

export type ProtocolContextPacket = {
  packetId: string;
  protocolExecutionId?: string;
  originatingThreadId?: string;
  userPrompt?: string;
  currentNodeId?: string;
  values: Record<string, JsonValue>;
  artifacts: ProtocolReference[];
  trace: ProtocolTraceEntry[];
};

export type ProtocolTraceEntry = {
  at: string;
  nodeId?: string;
  edgeId?: string;
  event:
    | "protocol_matched"
    | "node_started"
    | "node_completed"
    | "node_failed"
    | "edge_transferred"
    | "confirmation_requested"
    | "protocol_completed"
    | "protocol_failed";
  summary: string;
};

export type ProtocolExecutionStatus =
  | "queued"
  | "running"
  | "waiting_confirmation"
  | "completed"
  | "failed"
  | "cancelled";

export type ProtocolNodeRunStatus =
  | "queued"
  | "running"
  | "waiting_confirmation"
  | "completed"
  | "skipped"
  | "failed";

export type ProtocolExecution = {
  id: string;
  protocolId: string;
  versionId: string;
  threadId?: string;
  status: ProtocolExecutionStatus;
  inputPacket: ProtocolContextPacket;
  outputPacket?: ProtocolContextPacket;
  issues: ProtocolIssue[];
  startedAt: string;
  completedAt?: string;
};

export type ProtocolNodeRun = {
  id: string;
  executionId: string;
  nodeId: string;
  status: ProtocolNodeRunStatus;
  inputPacket?: ProtocolContextPacket;
  outputPacket?: ProtocolContextPacket;
  issues: ProtocolIssue[];
  startedAt?: string;
  completedAt?: string;
};

export type RegisteredProtocolVersion = {
  versionId: string;
  versionNumber: number;
  compiledDefinition: CompiledProtocolDefinition;
  draftSnapshot?: WorkProtocolDraft;
  draftRecordId?: string;
  draftKind?: WorkProtocolDraftRecordKind;
  capabilityCatalogHash?: string;
  registeredAt: string;
  registeredBy: string;
};

export type RegisteredProtocol = {
  id: string;
  draftId: string;
  name: string;
  enabled: boolean;
  runtimeMode: ProtocolRuntimeMode;
  activeVersionId: string;
  priority: number;
  triggerRules: ProtocolTriggerRule[];
  versions: RegisteredProtocolVersion[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
