import type {
  CapabilityCatalog,
  CanvasDepartmentDraft,
  CompiledEdgeSpec,
  CompiledNodeSpec,
  CompiledProtocolDefinition,
  ProtocolReference,
  WorkProtocolDraft,
} from "./types";

const EXAMPLE_TIME = "2026-05-03T00:00:00.000Z";

const WORK_ORDER_SCOPE_REF = {
  kind: "department_scope",
  id: "work_orders:list",
  label: "工单 / 工单列表",
} satisfies ProtocolReference;

const WORK_ORDER_AGENT_REF = {
  kind: "agent",
  id: "work-order-longxia",
  label: "工单龙虾",
} satisfies ProtocolReference;

const WORK_ORDER_DEPARTMENT: CanvasDepartmentDraft = {
  id: "dept-work-orders-list",
  departmentId: "work_orders",
  departmentLabel: "工单",
  primaryScopeId: "work_orders:list",
  primaryScopeLabel: "工单列表",
  resourceRefs: [WORK_ORDER_SCOPE_REF],
  visibleAgentIds: ["work-order-longxia", "report-longxia"],
  position: { x: 720, y: 160 },
  size: { width: 520, height: 420 },
  collapsed: false,
};

export const EXAMPLE_CAPABILITY_CATALOG = {
  catalogVersion: "work-protocol-catalog.v0",
  generatedAt: EXAMPLE_TIME,
  catalogHash: "example-catalog-hash-v0",
  departments: [
    {
      departmentId: "work_orders",
      label: "工单",
      description: "工单列表、筛选、详情读取和低风险汇报。",
      implementationStatus: "available",
      defaultApprovalPolicy: "recommended",
      scopeOptions: [
        {
          scopeId: "work_orders:list",
          label: "工单列表",
          resourceKind: "work_order",
          resourceRefs: [WORK_ORDER_SCOPE_REF],
          visibleAgentIds: ["work-order-longxia", "report-longxia"],
          readableObjectTypes: ["work_order", "execution_result"],
          writableObjectTypes: ["execution_result"],
          allowedToolIds: ["tool.work_order.search", "tool.work_order.read"],
          allowedSkillFolderIds: ["skill-folder-work-orders"],
          allowedMemoryFolderIds: ["memory-work-order-longxia"],
        },
      ],
    },
    {
      departmentId: "documents",
      label: "文档档案室",
      description: "文档、表格、文件夹和合作空间。",
      implementationStatus: "mock",
      implementationNote: "文档基础 Tool 可用，协议级部门沙箱仍是占位。",
      defaultApprovalPolicy: "recommended",
      scopeOptions: [
        {
          scopeId: "documents:all",
          label: "全部文件",
          resourceKind: "document",
          resourceRefs: [
            {
              kind: "department_scope",
              id: "documents:all",
              label: "文档档案室 / 全部文件",
            },
          ],
          visibleAgentIds: ["document-longxia"],
          readableObjectTypes: ["document", "spreadsheet"],
          writableObjectTypes: ["document", "spreadsheet", "execution_result"],
          allowedToolIds: ["tool.document.search", "tool.document.read"],
          allowedSkillFolderIds: ["skill-folder-documents"],
          allowedMemoryFolderIds: ["memory-document-longxia"],
        },
      ],
    },
  ],
  agents: [
    {
      agentId: "work-order-longxia",
      displayName: "工单龙虾",
      description: "处理工单范围内的任务拆解、风险判断和结构化回报。",
      implementationStatus: "mock",
      implementationNote: "已有 adapter 和 dry-run 方向，尚未接入协议 runtime。",
      visibleDepartmentScopeIds: ["work_orders:list"],
      taskKinds: ["work_order_triage", "risk_review", "status_summary"],
      inputSchema: {
        type: "object",
        required: ["task", "departmentScopeId"],
        properties: {
          task: { type: "string" },
          departmentScopeId: { type: "string" },
          context: { type: "object" },
        },
      },
      outputSchema: {
        type: "object",
        required: ["summary", "risks", "nextStep"],
        properties: {
          summary: { type: "string" },
          risks: { type: "array", items: { type: "string" } },
          nextStep: { type: "string" },
        },
      },
      allowedSkillFolderIds: ["skill-folder-work-orders"],
      allowedMemoryFolderIds: ["memory-work-order-longxia"],
      canWrite: false,
      canAskFollowup: true,
      handoffProtocol: {
        inputPacketVersion: "longxia-input.v0",
        outputPacketVersion: "longxia-output.v0",
      },
    },
    {
      agentId: "report-longxia",
      displayName: "报表龙虾",
      implementationStatus: "planned",
      implementationNote: "当前仅作为部门可见 AI 员工占位。",
      visibleDepartmentScopeIds: ["work_orders:list"],
      taskKinds: ["report_summary", "status_grouping"],
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      allowedSkillFolderIds: ["skill-folder-work-orders"],
      allowedMemoryFolderIds: ["memory-report-longxia"],
      canWrite: false,
      canAskFollowup: false,
      handoffProtocol: {
        inputPacketVersion: "longxia-input.v0",
        outputPacketVersion: "longxia-output.v0",
      },
    },
    {
      agentId: "document-longxia",
      displayName: "文档龙虾",
      implementationStatus: "planned",
      implementationNote: "当前仅作为部门可见 AI 员工占位。",
      visibleDepartmentScopeIds: ["documents:all"],
      taskKinds: ["document_summary", "archive_check"],
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      allowedSkillFolderIds: ["skill-folder-documents"],
      allowedMemoryFolderIds: ["memory-document-longxia"],
      canWrite: false,
      canAskFollowup: true,
      handoffProtocol: {
        inputPacketVersion: "longxia-input.v0",
        outputPacketVersion: "longxia-output.v0",
      },
    },
  ],
  nodeKinds: [
    {
      kind: "bp_ask_entry",
      displayName: "BP问问入口",
      implementationStatus: "available",
      executorKind: "bp_ask",
      requiredInputs: ["userPrompt"],
      optionalInputs: ["threadContext"],
      outputs: ["taskIntent", "targetRefs", "missingInputs"],
      permissionRequirements: [],
      approvalPolicy: "none",
      failureModes: ["task_not_understood", "missing_required_input"],
    },
    {
      kind: "tool_call",
      displayName: "Tool调用",
      implementationStatus: "available",
      executorKind: "tool",
      requiredInputs: ["callableId", "input"],
      optionalInputs: ["departmentScopeId"],
      outputs: ["toolResult"],
      permissionRequirements: ["tool_allowed_in_scope"],
      approvalPolicy: "recommended",
      failureModes: ["tool_not_found", "tool_input_invalid", "tool_failed"],
    },
    {
      kind: "skill_call",
      displayName: "Skill调用",
      implementationStatus: "mock",
      implementationNote: "Skill 目录可展示，真实 Skill runtime 后续接入。",
      executorKind: "skill",
      requiredInputs: ["skillId", "input"],
      optionalInputs: ["skillFolderId"],
      outputs: ["skillResult"],
      permissionRequirements: ["skill_visible_in_scope"],
      approvalPolicy: "recommended",
      failureModes: ["skill_not_found", "skill_failed"],
    },
    {
      kind: "rag_search",
      displayName: "RAG检索",
      implementationStatus: "planned",
      implementationNote: "RAG 工厂当前是原型占位，不能注册为生产执行节点。",
      executorKind: "rag",
      requiredInputs: ["query", "indexId"],
      optionalInputs: ["topK", "filters"],
      outputs: ["matches", "contextBundle"],
      permissionRequirements: ["rag_index_visible"],
      approvalPolicy: "none",
      failureModes: ["rag_index_not_found", "no_matches"],
    },
    {
      kind: "agent_task",
      displayName: "AI员工任务",
      implementationStatus: "mock",
      implementationNote: "Longxia handoff 尚未进入通用协议 runtime。",
      executorKind: "agent",
      requiredInputs: ["agentId", "task"],
      optionalInputs: ["departmentScopeId", "context"],
      outputs: ["agentResult", "requiredFollowup"],
      permissionRequirements: ["agent_visible_in_scope"],
      approvalPolicy: "recommended",
      failureModes: ["agent_not_found", "agent_timeout", "agent_failed"],
    },
    {
      kind: "task_dispatch",
      displayName: "任务分派",
      implementationStatus: "mock",
      executorKind: "control",
      requiredInputs: ["task"],
      optionalInputs: ["splitRules"],
      outputs: ["subtasks"],
      permissionRequirements: [],
      approvalPolicy: "none",
      failureModes: ["dispatch_failed"],
    },
    {
      kind: "result_aggregate",
      displayName: "结果汇总",
      implementationStatus: "mock",
      executorKind: "control",
      requiredInputs: ["results"],
      optionalInputs: ["format"],
      outputs: ["summary", "risks", "nextStep"],
      permissionRequirements: [],
      approvalPolicy: "none",
      failureModes: ["aggregate_failed"],
    },
    {
      kind: "condition",
      displayName: "条件判断",
      implementationStatus: "mock",
      executorKind: "control",
      requiredInputs: ["condition"],
      optionalInputs: ["branches"],
      outputs: ["selectedBranch"],
      permissionRequirements: [],
      approvalPolicy: "none",
      failureModes: ["condition_invalid"],
    },
    {
      kind: "human_confirm",
      displayName: "人工确认",
      implementationStatus: "mock",
      executorKind: "human",
      requiredInputs: ["confirmationSubject"],
      optionalInputs: ["diff", "riskSummary"],
      outputs: ["approved", "comment"],
      permissionRequirements: [],
      approvalPolicy: "required",
      failureModes: ["rejected", "timeout"],
    },
    {
      kind: "bp_ask_followup",
      displayName: "BP问问追问",
      implementationStatus: "mock",
      executorKind: "bp_ask",
      requiredInputs: ["question"],
      optionalInputs: ["choices"],
      outputs: ["userAnswer"],
      permissionRequirements: [],
      approvalPolicy: "none",
      failureModes: ["user_cancelled"],
    },
    {
      kind: "write_object",
      displayName: "写入对象",
      implementationStatus: "mock",
      implementationNote: "写入对象在协议里先生成草稿，真实写入后续接人工确认。",
      executorKind: "write",
      requiredInputs: ["objectKind", "action", "payload"],
      optionalInputs: ["rollbackRef"],
      outputs: ["writeResult"],
      permissionRequirements: ["write_allowed_in_scope", "confirmation_required"],
      approvalPolicy: "required",
      failureModes: ["write_denied", "write_failed"],
    },
    {
      kind: "bp_ask_report",
      displayName: "BP问问汇报出口",
      implementationStatus: "available",
      executorKind: "bp_ask",
      requiredInputs: ["summary"],
      optionalInputs: ["risks", "nextStep", "artifacts"],
      outputs: ["replyText"],
      permissionRequirements: [],
      approvalPolicy: "none",
      failureModes: ["report_generation_failed"],
    },
  ],
  callables: [
    {
      capabilityId: "tool.work_order.search",
      kind: "tool",
      displayName: "搜索工单",
      implementationStatus: "available",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          status: { type: "string" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          candidates: { type: "array", items: { type: "object" } },
        },
      },
      requiredContext: ["authenticatedUser"],
      riskLevel: "low",
      mutatesData: false,
      requiresConfirmationDefault: false,
      allowedDepartmentScopeIds: ["work_orders:list"],
    },
    {
      capabilityId: "tool.work_order.read",
      kind: "tool",
      displayName: "读取工单",
      implementationStatus: "available",
      inputSchema: {
        type: "object",
        required: ["workOrderNo"],
        properties: {
          workOrderNo: { type: "string" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          workOrder: { type: "object" },
          summary: { type: "string" },
        },
      },
      requiredContext: ["authenticatedUser"],
      riskLevel: "low",
      mutatesData: false,
      requiresConfirmationDefault: false,
      allowedDepartmentScopeIds: ["work_orders:list"],
    },
    {
      capabilityId: "skill.work_order.summary",
      kind: "skill",
      displayName: "工单摘要 Skill",
      implementationStatus: "mock",
      implementationNote: "当前作为协议梳理样例能力，后续接真实 Skill runner。",
      inputSchema: {
        type: "object",
        required: ["workOrder"],
        properties: {
          workOrder: { type: "object" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          risks: { type: "array", items: { type: "string" } },
          nextStep: { type: "string" },
        },
      },
      requiredContext: ["workOrder"],
      riskLevel: "low",
      mutatesData: false,
      requiresConfirmationDefault: false,
      allowedDepartmentScopeIds: ["work_orders:list"],
    },
    {
      capabilityId: "rag.project-default",
      kind: "rag",
      displayName: "项目资料默认知识库",
      implementationStatus: "planned",
      implementationNote: "RAG 工厂尚未接真实索引与检索执行。",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          matches: { type: "array", items: { type: "object" } },
        },
      },
      requiredContext: ["query"],
      riskLevel: "low",
      mutatesData: false,
      requiresConfirmationDefault: false,
      allowedDepartmentScopeIds: ["documents:all"],
    },
  ],
  writableObjects: [
    {
      objectKind: "work_order",
      displayName: "工单",
      implementationStatus: "mock",
      implementationNote: "协议级写入先走草稿和人工确认，真实提交后续接入。",
      actions: [
        {
          actionName: "updateStatus",
          inputSchema: {
            type: "object",
            required: ["workOrderNo", "status"],
            properties: {
              workOrderNo: { type: "string" },
              status: { type: "string" },
            },
          },
          rollbackSupported: true,
          confirmationRequired: true,
          allowedDepartmentScopeIds: ["work_orders:list"],
        },
      ],
    },
    {
      objectKind: "execution_result",
      displayName: "执行结果",
      implementationStatus: "mock",
      implementationNote: "协议执行结果表后续建立后接真实写入。",
      actions: [
        {
          actionName: "create",
          inputSchema: {
            type: "object",
            required: ["protocolId", "summary"],
            properties: {
              protocolId: { type: "string" },
              summary: { type: "string" },
            },
          },
          rollbackSupported: false,
          confirmationRequired: false,
          allowedDepartmentScopeIds: ["work_orders:list", "documents:all"],
        },
      ],
    },
  ],
} satisfies CapabilityCatalog;

const workOrderReadEntrySpec = {
  nodeId: "node-bp-entry",
  kind: "bp_ask_entry",
  title: "BP问问入口",
  executorKind: "bp_ask",
  intentSummary: "接收用户自然语言任务，并抽取工单编号或缺参问题。",
  inputBindings: [
    {
      name: "userPrompt",
      source: "user_input",
      path: "$.prompt",
      required: true,
    },
  ],
  outputFields: [
    {
      name: "workOrderNo",
      jsonPath: "$.targetRefs.workOrderNo",
      schema: { type: "string" },
    },
  ],
  riskLevel: "none",
  approvalPolicy: "none",
  permissionRefs: [],
  failurePolicy: { mode: "return_to_bp_ask" },
} satisfies CompiledNodeSpec;

const workOrderReadToolSpec = {
  nodeId: "node-read-work-order",
  kind: "tool_call",
  title: "读取工单",
  executorKind: "tool",
  intentSummary: "用工单编号读取工单详情。",
  callableId: "tool.work_order.read",
  departmentScopeId: "work_orders:list",
  inputBindings: [
    {
      name: "workOrderNo",
      source: "node_output",
      sourceNodeId: "node-bp-entry",
      path: "$.targetRefs.workOrderNo",
      required: true,
    },
  ],
  outputFields: [
    {
      name: "workOrder",
      jsonPath: "$.toolResult.workOrder",
      schema: { type: "object" },
    },
    {
      name: "summary",
      jsonPath: "$.toolResult.summary",
      schema: { type: "string" },
    },
  ],
  riskLevel: "low",
  approvalPolicy: "none",
  permissionRefs: [WORK_ORDER_SCOPE_REF],
  timeoutMs: 10000,
  retryPolicy: {
    maxAttempts: 1,
    retryOn: ["network_error"],
  },
  failurePolicy: { mode: "return_to_bp_ask" },
} satisfies CompiledNodeSpec;

const workOrderReportSpec = {
  nodeId: "node-bp-report",
  kind: "bp_ask_report",
  title: "BP问问汇报出口",
  executorKind: "bp_ask",
  intentSummary: "把协议执行结果整理成自然语言回复给用户。",
  inputBindings: [
    {
      name: "summary",
      source: "node_output",
      sourceNodeId: "node-read-work-order",
      path: "$.toolResult.summary",
      required: true,
    },
  ],
  outputFields: [
    {
      name: "replyText",
      jsonPath: "$.replyText",
      schema: { type: "string" },
    },
  ],
  riskLevel: "none",
  approvalPolicy: "none",
  permissionRefs: [],
  failurePolicy: { mode: "fail_protocol" },
} satisfies CompiledNodeSpec;

const entryToToolEdge = {
  edgeId: "edge-entry-to-tool",
  sourceNodeId: "node-bp-entry",
  targetNodeId: "node-read-work-order",
  transferMode: "structured_packet",
  prompt: "请把用户问题中的工单编号传给读取工单节点。",
  fieldMappings: [
    {
      fromPath: "$.targetRefs.workOrderNo",
      toPath: "$.workOrderNo",
      required: true,
    },
  ],
  requiredFields: ["workOrderNo"],
} satisfies CompiledEdgeSpec;

const toolToReportEdge = {
  edgeId: "edge-tool-to-report",
  sourceNodeId: "node-read-work-order",
  targetNodeId: "node-bp-report",
  transferMode: "communication_prompt",
  prompt: "请把工单读取结果整理给 BP问问汇报出口。",
  fieldMappings: [
    {
      fromPath: "$.toolResult.summary",
      toPath: "$.summary",
      required: true,
    },
  ],
  requiredFields: ["summary"],
} satisfies CompiledEdgeSpec;

export const WORK_ORDER_READ_DRAFT = {
  id: "draft-work-order-read",
  name: "工单读取汇报协议",
  description: "最小闭环：BP问问入口读取工单，再由 BP问问汇报出口回复。",
  departments: [WORK_ORDER_DEPARTMENT],
  nodes: [
    {
      id: "node-bp-entry",
      kind: "bp_ask_entry",
      title: "BP问问入口",
      userIntent: "作为工作协议的前台入口，接收用户自然语言和任务上下文。",
      position: { x: 120, y: 220 },
      compiledSpecStatus: "fresh",
      compiledSpec: workOrderReadEntrySpec,
    },
    {
      id: "node-read-work-order",
      kind: "tool_call",
      title: "读取工单",
      userIntent: "根据上游传来的工单编号读取工单详情。",
      departmentDraftId: "dept-work-orders-list",
      callableId: "tool.work_order.read",
      position: { x: 420, y: 220 },
      compiledSpecStatus: "fresh",
      compiledSpec: workOrderReadToolSpec,
    },
    {
      id: "node-bp-report",
      kind: "bp_ask_report",
      title: "BP问问汇报出口",
      userIntent: "把执行结果整理成用户能读懂的自然语言回复。",
      position: { x: 740, y: 220 },
      compiledSpecStatus: "fresh",
      compiledSpec: workOrderReportSpec,
    },
  ],
  edges: [
    {
      id: "edge-entry-to-tool",
      sourceNodeId: "node-bp-entry",
      targetNodeId: "node-read-work-order",
      transferIntent: "请编辑传输内容，默认是通讯提示词",
      compiledSpecStatus: "fresh",
      compiledSpec: entryToToolEdge,
    },
    {
      id: "edge-tool-to-report",
      sourceNodeId: "node-read-work-order",
      targetNodeId: "node-bp-report",
      transferIntent: "请编辑传输内容，默认是通讯提示词",
      compiledSpecStatus: "fresh",
      compiledSpec: toolToReportEdge,
    },
  ],
  triggerDrafts: [
    {
      id: "trigger-work-order-status",
      label: "用户询问工单状态",
      matchMode: "semantic",
      intentHints: ["查看工单", "工单状态", "某个工单怎么样"],
      minConfidence: 0.76,
      enabled: true,
    },
  ],
  compileStatus: "compiled",
  latestCompiledVersionId: "version-work-order-read-v1",
  createdAt: EXAMPLE_TIME,
  updatedAt: EXAMPLE_TIME,
} satisfies WorkProtocolDraft;

export const WORK_ORDER_READ_COMPILED = {
  id: "protocol-work-order-read",
  draftId: "draft-work-order-read",
  versionId: "version-work-order-read-v1",
  versionNumber: 1,
  name: "工单读取汇报协议",
  description: "BP问问入口 -> 读取工单 Tool -> BP问问汇报出口。",
  status: "compiled",
  triggerRules: WORK_ORDER_READ_DRAFT.triggerDrafts,
  nodes: [workOrderReadEntrySpec, workOrderReadToolSpec, workOrderReportSpec],
  edges: [entryToToolEdge, toolToReportEdge],
  entryNodeIds: ["node-bp-entry"],
  reportNodeIds: ["node-bp-report"],
  requiredInputs: ["userPrompt"],
  outputSchema: {
    type: "object",
    required: ["replyText"],
    properties: {
      replyText: { type: "string" },
    },
  },
  permissionSummary: [WORK_ORDER_SCOPE_REF],
  capabilityCatalogHash: EXAMPLE_CAPABILITY_CATALOG.catalogHash,
  createdAt: EXAMPLE_TIME,
} satisfies CompiledProtocolDefinition;

const agentEntrySpec = {
  nodeId: "node-agent-entry",
  kind: "bp_ask_entry",
  title: "BP问问入口",
  executorKind: "bp_ask",
  intentSummary: "接收用户任务，并形成可交给工单龙虾的上下文包。",
  inputBindings: [
    {
      name: "userPrompt",
      source: "user_input",
      path: "$.prompt",
      required: true,
    },
  ],
  outputFields: [
    {
      name: "task",
      jsonPath: "$.taskIntent",
      schema: { type: "string" },
    },
  ],
  riskLevel: "none",
  approvalPolicy: "none",
  permissionRefs: [],
  failurePolicy: { mode: "return_to_bp_ask" },
} satisfies CompiledNodeSpec;

const agentTaskSpec: CompiledNodeSpec = {
  nodeId: "node-work-order-longxia",
  kind: "agent_task",
  title: "工单龙虾承接",
  executorKind: "agent",
  intentSummary: "请工单龙虾根据当前部门范围处理任务，并输出结构化结果。",
  agentId: "work-order-longxia",
  departmentScopeId: "work_orders:list",
  inputBindings: [
    {
      name: "task",
      source: "node_output",
      sourceNodeId: "node-agent-entry",
      path: "$.taskIntent",
      required: true,
    },
    {
      name: "departmentScopeId",
      source: "department_scope",
      value: "work_orders:list",
      required: true,
    },
  ],
  outputFields: [
    {
      name: "summary",
      jsonPath: "$.agentResult.summary",
      schema: { type: "string" },
    },
    {
      name: "risks",
      jsonPath: "$.agentResult.risks",
      schema: { type: "array", items: { type: "string" } },
    },
    {
      name: "nextStep",
      jsonPath: "$.agentResult.nextStep",
      schema: { type: "string" },
    },
  ],
  riskLevel: "medium",
  approvalPolicy: "recommended",
  permissionRefs: [WORK_ORDER_SCOPE_REF, WORK_ORDER_AGENT_REF],
  timeoutMs: 60000,
  failurePolicy: { mode: "return_to_bp_ask" },
};

const agentReportSpec = {
  nodeId: "node-agent-report",
  kind: "bp_ask_report",
  title: "BP问问汇报出口",
  executorKind: "bp_ask",
  intentSummary: "把工单龙虾的结构化结果转写给用户。",
  inputBindings: [
    {
      name: "summary",
      source: "node_output",
      sourceNodeId: "node-work-order-longxia",
      path: "$.agentResult.summary",
      required: true,
    },
    {
      name: "nextStep",
      source: "node_output",
      sourceNodeId: "node-work-order-longxia",
      path: "$.agentResult.nextStep",
      required: false,
    },
  ],
  outputFields: [
    {
      name: "replyText",
      jsonPath: "$.replyText",
      schema: { type: "string" },
    },
  ],
  riskLevel: "none",
  approvalPolicy: "none",
  permissionRefs: [],
  failurePolicy: { mode: "fail_protocol" },
} satisfies CompiledNodeSpec;

const entryToAgentEdge = {
  edgeId: "edge-entry-to-agent",
  sourceNodeId: "node-agent-entry",
  targetNodeId: "node-work-order-longxia",
  transferMode: "communication_prompt",
  prompt: "请把用户任务、上下文和当前工单部门范围传给工单龙虾。",
  fieldMappings: [
    {
      fromPath: "$.taskIntent",
      toPath: "$.task",
      required: true,
    },
  ],
  requiredFields: ["task"],
} satisfies CompiledEdgeSpec;

const agentToReportEdge = {
  edgeId: "edge-agent-to-report",
  sourceNodeId: "node-work-order-longxia",
  targetNodeId: "node-agent-report",
  transferMode: "structured_packet",
  prompt: "请把工单龙虾输出的摘要、风险和下一步传给 BP问问。",
  fieldMappings: [
    {
      fromPath: "$.agentResult.summary",
      toPath: "$.summary",
      required: true,
    },
    {
      fromPath: "$.agentResult.nextStep",
      toPath: "$.nextStep",
      required: false,
    },
  ],
  requiredFields: ["summary"],
} satisfies CompiledEdgeSpec;

export const WORK_ORDER_AGENT_HANDOFF_DRAFT = {
  id: "draft-work-order-agent-handoff",
  name: "工单龙虾承接协议",
  description: "BP问问入口把任务下放给工单部门里的 AI员工，再回到 BP问问汇报出口。",
  departments: [WORK_ORDER_DEPARTMENT],
  nodes: [
    {
      id: "node-agent-entry",
      kind: "bp_ask_entry",
      title: "BP问问入口",
      userIntent: "接收用户任务，并形成可交给工单龙虾的上下文包。",
      position: { x: 120, y: 260 },
      compiledSpecStatus: "fresh",
      compiledSpec: agentEntrySpec,
    },
    {
      id: "node-work-order-longxia",
      kind: "agent_task",
      title: "工单龙虾承接",
      userIntent: "请工单龙虾根据当前部门范围处理任务，并输出结构化结果。",
      departmentDraftId: "dept-work-orders-list",
      agentId: "work-order-longxia",
      position: { x: 780, y: 240 },
      compiledSpecStatus: "fresh",
      compiledSpec: agentTaskSpec,
    },
    {
      id: "node-agent-report",
      kind: "bp_ask_report",
      title: "BP问问汇报出口",
      userIntent: "把工单龙虾的结果整理成用户能读懂的自然语言回复。",
      position: { x: 1120, y: 260 },
      compiledSpecStatus: "fresh",
      compiledSpec: agentReportSpec,
    },
  ],
  edges: [
    {
      id: "edge-entry-to-agent",
      sourceNodeId: "node-agent-entry",
      targetNodeId: "node-work-order-longxia",
      transferIntent: "请编辑传输内容，默认是通讯提示词",
      compiledSpecStatus: "fresh",
      compiledSpec: entryToAgentEdge,
    },
    {
      id: "edge-agent-to-report",
      sourceNodeId: "node-work-order-longxia",
      targetNodeId: "node-agent-report",
      transferIntent: "请编辑传输内容，默认是通讯提示词",
      compiledSpecStatus: "fresh",
      compiledSpec: agentToReportEdge,
    },
  ],
  triggerDrafts: [
    {
      id: "trigger-work-order-agent",
      label: "需要工单龙虾承接",
      matchMode: "semantic",
      intentHints: ["让工单龙虾处理", "联动工单部门", "需要AI员工分析工单"],
      minConfidence: 0.78,
      enabled: true,
    },
  ],
  compileStatus: "compiled",
  latestCompiledVersionId: "version-work-order-agent-handoff-v1",
  createdAt: EXAMPLE_TIME,
  updatedAt: EXAMPLE_TIME,
} satisfies WorkProtocolDraft;

export const WORK_ORDER_AGENT_HANDOFF_COMPILED = {
  id: "protocol-work-order-agent-handoff",
  draftId: "draft-work-order-agent-handoff",
  versionId: "version-work-order-agent-handoff-v1",
  versionNumber: 1,
  name: "工单龙虾承接协议",
  description: "BP问问入口 -> 工单龙虾 -> BP问问汇报出口。",
  status: "compiled",
  triggerRules: WORK_ORDER_AGENT_HANDOFF_DRAFT.triggerDrafts,
  nodes: [agentEntrySpec, agentTaskSpec, agentReportSpec],
  edges: [entryToAgentEdge, agentToReportEdge],
  entryNodeIds: ["node-agent-entry"],
  reportNodeIds: ["node-agent-report"],
  requiredInputs: ["userPrompt"],
  outputSchema: {
    type: "object",
    required: ["replyText"],
    properties: {
      replyText: { type: "string" },
    },
  },
  permissionSummary: [WORK_ORDER_SCOPE_REF, WORK_ORDER_AGENT_REF],
  capabilityCatalogHash: EXAMPLE_CAPABILITY_CATALOG.catalogHash,
  createdAt: EXAMPLE_TIME,
} satisfies CompiledProtocolDefinition;

export const EXAMPLE_WORK_PROTOCOL_DRAFTS = [
  WORK_ORDER_READ_DRAFT,
  WORK_ORDER_AGENT_HANDOFF_DRAFT,
] satisfies WorkProtocolDraft[];

export const EXAMPLE_COMPILED_PROTOCOLS = [
  WORK_ORDER_READ_COMPILED,
  WORK_ORDER_AGENT_HANDOFF_COMPILED,
] satisfies CompiledProtocolDefinition[];
