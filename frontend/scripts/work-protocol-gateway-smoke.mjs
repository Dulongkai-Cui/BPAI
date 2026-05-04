import assert from "node:assert/strict";
import process from "node:process";

const baseUrls = process.env.BPAI_BASE_URL
  ? [process.env.BPAI_BASE_URL]
  : ["http://localhost:3001", "http://localhost:3000"];
let activeBaseUrl = "";

function buildRunId() {
  return new Date()
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replaceAll(".", "")
    .replace("T", "-")
    .replace("Z", "");
}

async function requestJson(path, init = {}, cookie = "") {
  const candidates = activeBaseUrl ? [activeBaseUrl] : baseUrls;
  let lastNetworkError = null;

  for (const baseUrl of candidates) {
    let response;

    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      lastNetworkError = error;
      continue;
    }

    activeBaseUrl = baseUrl;

    const text = await response.text();
    const json = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(
        `Request failed ${response.status} ${path}: ${json?.message ?? text}`,
      );
    }

    return { json, response };
  }

  throw lastNetworkError ?? new Error(`Unable to connect to ${path}`);
}

function buildWorkProtocolDraft(runId) {
  const now = new Date().toISOString();
  const keyword = `协议烟测${runId}`;

  return {
    id: `draft-work-protocol-smoke-${runId}`,
    name: `协议烟测 ${runId}`,
    description: "工作协议网关烟测协议：BP问问入口 -> 工单读取 Tool -> BP问问汇报出口。",
    departments: [
      {
        id: "dept-work-orders-list",
        departmentId: "work_orders",
        departmentLabel: "工单",
        primaryScopeId: "work_orders:list",
        primaryScopeLabel: "工单列表",
        resourceRefs: [
          {
            kind: "department_scope",
            id: "work_orders:list",
            label: "工单 / 工单列表",
          },
        ],
        visibleAgentIds: ["work-order-longxia", "report-longxia"],
        position: { x: 720, y: 160 },
        size: { width: 520, height: 420 },
        collapsed: false,
      },
    ],
    nodes: [
      {
        id: "node-bp-entry",
        kind: "bp_ask_entry",
        title: "BP问问入口",
        userIntent: "接收用户自然语言和任务上下文。",
        position: { x: 120, y: 220 },
        compiledSpecStatus: "empty",
      },
      {
        id: "node-read-work-order",
        kind: "tool_call",
        title: "读取工单",
        userIntent: "根据上游传来的工单编号读取工单详情。",
        departmentDraftId: "dept-work-orders-list",
        callableId: "tool.work_order.read",
        position: { x: 420, y: 220 },
        compiledSpecStatus: "empty",
      },
      {
        id: "node-bp-report",
        kind: "bp_ask_report",
        title: "BP问问汇报出口",
        userIntent: "把执行结果整理成用户能读懂的自然语言回复。",
        position: { x: 740, y: 220 },
        compiledSpecStatus: "empty",
      },
    ],
    edges: [
      {
        id: "edge-entry-to-tool",
        sourceNodeId: "node-bp-entry",
        targetNodeId: "node-read-work-order",
        transferIntent: "请把用户问题中的工单编号传给读取工单节点。",
        compiledSpecStatus: "empty",
      },
      {
        id: "edge-tool-to-report",
        sourceNodeId: "node-read-work-order",
        targetNodeId: "node-bp-report",
        transferIntent: "请把工单读取结果整理给 BP问问汇报出口。",
        compiledSpecStatus: "empty",
      },
    ],
    triggerDrafts: [
      {
        id: "trigger-work-protocol-smoke",
        label: "工作协议烟测触发词",
        matchMode: "keyword",
        keywords: [keyword, "工单", "状态"],
        minConfidence: 20,
        enabled: true,
      },
    ],
    compileStatus: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

function buildFieldFlowFailureDraft(runId) {
  const draft = buildWorkProtocolDraft(`${runId}-field-flow-fail`);
  const keyword = `field-flow-fail-${runId}`;
  const edge = draft.edges.find((item) => item.id === "edge-entry-to-tool");

  draft.id = `draft-work-protocol-field-flow-fail-${runId}`;
  draft.name = `Field flow failure ${runId}`;
  draft.description =
    "A smoke protocol that must fail in runtime field flow because a required mapped field is missing.";
  draft.triggerDrafts = [
    {
      id: "trigger-work-protocol-field-flow-fail",
      label: "Field flow failure trigger",
      matchMode: "keyword",
      keywords: [keyword],
      minConfidence: 20,
      enabled: true,
    },
  ];

  assert(edge, "field-flow failure draft should include entry -> tool edge");

  edge.compiledSpec = {
    edgeId: edge.id,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    transferMode: "field_mapping",
    prompt: "Pass a required workOrderNo field to the tool node.",
    fieldMappings: [
      {
        fromPath: "$.missing.workOrderNo",
        toPath: "$.workOrderNo",
        required: true,
      },
    ],
    requiredFields: ["workOrderNo"],
    outputPacketSchema: {
      type: "object",
      properties: {
        workOrderNo: { type: "string" },
      },
      required: ["workOrderNo"],
    },
  };

  return { draft, keyword };
}

function buildAdapterPermissionFailureDraft(runId) {
  const draft = buildWorkProtocolDraft(`${runId}-adapter-permission-fail`);
  const keyword = `adapter-permission-fail-${runId}`;
  const department = draft.departments[0];
  const skillNode = draft.nodes.find((item) => item.id === "node-read-work-order");

  assert(department, "adapter permission draft should include a department");
  assert(skillNode, "adapter permission draft should include the middle node");

  draft.id = `draft-work-protocol-adapter-permission-fail-${runId}`;
  draft.name = `Adapter permission failure ${runId}`;
  draft.description =
    "A smoke protocol that must fail runtime preflight because a Skill adapter is placed in a department scope with no Skill folders.";
  draft.triggerDrafts = [
    {
      id: "trigger-work-protocol-adapter-permission-fail",
      label: "Adapter permission failure trigger",
      matchMode: "keyword",
      keywords: [keyword],
      minConfidence: 20,
      enabled: true,
    },
  ];

  department.id = "dept-overview-map";
  department.departmentId = "overview";
  department.departmentLabel = "总览";
  department.primaryScopeId = "overview:map";
  department.primaryScopeLabel = "全城实时地图";
  department.resourceRefs = [
    {
      kind: "department_scope",
      id: "overview:map",
      label: "总览 / 全城实时地图",
    },
  ];
  department.visibleAgentIds = ["alert-longxia", "report-longxia"];

  skillNode.kind = "skill_call";
  skillNode.title = "Skill 权限硬拦截";
  skillNode.userIntent =
    "尝试在没有开放 Skill 文件夹的部门范围里运行一个 Skill。";
  skillNode.departmentDraftId = department.id;
  skillNode.callableId = "skill.skill-work-order-summary";

  return { draft, keyword };
}

function buildContractPreflightFailureDraft(runId) {
  const now = new Date().toISOString();
  const keyword = `contract-preflight-fail-${runId}`;

  return {
    keyword,
    draft: {
      id: `draft-work-protocol-contract-preflight-fail-${runId}`,
      name: `Contract preflight failure ${runId}`,
      description:
        "A smoke protocol that must fail runtime preflight because stale parameter code lowers write_object risk and approval.",
      departments: [
        {
          id: "dept-work-orders-list",
          departmentId: "work_orders",
          departmentLabel: "宸ュ崟",
          primaryScopeId: "work_orders:list",
          primaryScopeLabel: "宸ュ崟鍒楄〃",
          resourceRefs: [
            {
              kind: "department_scope",
              id: "work_orders:list",
              label: "宸ュ崟 / 宸ュ崟鍒楄〃",
            },
          ],
          visibleAgentIds: ["work-order-longxia", "report-longxia"],
          position: { x: 720, y: 160 },
          size: { width: 520, height: 420 },
          collapsed: false,
        },
      ],
      nodes: [
        {
          id: "node-bp-entry",
          kind: "bp_ask_entry",
          title: "BP闂棶鍏ュ彛",
          userIntent: "Receive the user request before writing a work-order draft.",
          position: { x: 120, y: 220 },
          compiledSpecStatus: "empty",
        },
        {
          id: "node-write-work-order",
          kind: "write_object",
          title: "Write work order",
          userIntent: "Prepare a work-order writeback draft.",
          departmentDraftId: "dept-work-orders-list",
          writableObjectKind: "work_order",
          position: { x: 420, y: 220 },
          compiledSpecStatus: "empty",
          compiledSpec: {
            nodeId: "node-write-work-order",
            kind: "write_object",
            title: "Write work order",
            executorKind: "write",
            intentSummary:
              "Stale compiledSpec incorrectly marks a write operation as low risk.",
            departmentScopeId: "work_orders:list",
            writableObjectKind: "work_order",
            inputBindings: [
              {
                name: "payload",
                source: "constant",
                value: {
                  workOrderNo: "WO-SMOKE-CONTRACT",
                  changes: [{ field: "status", value: "draft" }],
                },
                required: true,
              },
            ],
            outputFields: [
              {
                name: "writeResult",
                jsonPath: "$.writeResult",
                schema: { type: "object" },
              },
            ],
            riskLevel: "low",
            approvalPolicy: "none",
            permissionRefs: [
              {
                kind: "department_scope",
                id: "work_orders:list",
                label: "宸ュ崟 / 宸ュ崟鍒楄〃",
              },
              {
                kind: "work_order",
                id: "work_order",
                label: "Work order",
              },
            ],
            timeoutMs: 60_000,
            retryPolicy: {
              maxAttempts: 1,
              retryOn: ["timeout"],
            },
            failurePolicy: {
              mode: "return_to_bp_ask",
            },
          },
        },
        {
          id: "node-bp-report",
          kind: "bp_ask_report",
          title: "BP闂棶姹囨姤鍑哄彛",
          userIntent: "Report writeback result to the user.",
          position: { x: 740, y: 220 },
          compiledSpecStatus: "empty",
        },
      ],
      edges: [
        {
          id: "edge-entry-to-write",
          sourceNodeId: "node-bp-entry",
          targetNodeId: "node-write-work-order",
          transferIntent: "Pass user intent to the write node.",
          compiledSpecStatus: "empty",
        },
        {
          id: "edge-write-to-report",
          sourceNodeId: "node-write-work-order",
          targetNodeId: "node-bp-report",
          transferIntent: "Report the write draft result back to BP Ask.",
          compiledSpecStatus: "empty",
        },
      ],
      triggerDrafts: [
        {
          id: "trigger-contract-preflight-fail",
          label: "Contract preflight failure trigger",
          matchMode: "keyword",
          keywords: [keyword],
          minConfidence: 20,
          enabled: true,
        },
      ],
      compileStatus: "draft",
      createdAt: now,
      updatedAt: now,
    },
  };
}

function buildNodeCompiledSpecDraft(runId) {
  const draft = buildWorkProtocolDraft(`${runId}-node-compiled-spec`);
  const keyword = `node-compiled-spec-${runId}`;
  const node = draft.nodes.find((item) => item.id === "node-read-work-order");

  draft.id = `draft-work-protocol-node-compiled-spec-${runId}`;
  draft.name = `Node compiledSpec ${runId}`;
  draft.description =
    "A smoke protocol that relies on node compiledSpec for callable binding.";
  draft.triggerDrafts = [
    {
      id: "trigger-work-protocol-node-compiled-spec",
      label: "Node compiledSpec trigger",
      matchMode: "keyword",
      keywords: [keyword],
      minConfidence: 20,
      enabled: true,
    },
  ];

  assert(node, "node compiledSpec draft should include read work order node");

  delete node.callableId;
  node.compiledSpec = {
    nodeId: node.id,
    kind: "tool_call",
    title: node.title,
    executorKind: "tool",
    intentSummary: "Read a work order using callable binding from node compiledSpec.",
    callableId: "tool.work_order.read",
    departmentScopeId: "work_orders:list",
    inputBindings: [
      {
        name: "instruction",
        source: "constant",
        value: "Read the work order referenced by upstream context.",
        required: true,
      },
    ],
    outputFields: [
      {
        name: "toolResult",
        jsonPath: "$.toolResult",
        schema: { type: "object" },
        description: "Plan-only tool result.",
      },
    ],
    riskLevel: "low",
    approvalPolicy: "none",
    permissionRefs: [
      {
        kind: "department_scope",
        id: "work_orders:list",
        label: "工单 / 工单列表",
      },
      {
        kind: "tool",
        id: "tool.work_order.read",
        label: "work_order.read",
      },
    ],
    timeoutMs: 45_000,
    retryPolicy: {
      maxAttempts: 1,
      retryOn: ["timeout"],
    },
    failurePolicy: {
      mode: "return_to_bp_ask",
    },
  };

  return { draft, keyword };
}

function buildInvalidAnnotationDraft(runId) {
  const draft = buildWorkProtocolDraft(`${runId}-annotations-invalid`);
  const toolNode = draft.nodes.find((item) => item.id === "node-read-work-order");
  const edge = draft.edges.find((item) => item.id === "edge-tool-to-report");

  draft.id = `draft-work-protocol-annotations-invalid-${runId}`;
  draft.name = "";
  draft.description =
    "A smoke protocol that should fail grooming validation and return UI annotations.";

  assert(toolNode, "invalid annotation draft should include tool node");
  assert(edge, "invalid annotation draft should include tool -> report edge");

  toolNode.callableId = "tool.missing-for-annotation-smoke";
  edge.targetNodeId = "node-missing-report";
  edge.transferIntent = "";

  return draft;
}

async function login() {
  const loginResult = await requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "dulongkai.cui@akane.waseda.jp",
      password: "bpai-local-001",
    }),
  });
  const sessionCookie = loginResult.response.headers.get("set-cookie");

  assert(sessionCookie, "登录后未返回会话 cookie");

  return sessionCookie.split(";")[0];
}

function assertCapabilityContracts(payload) {
  assert.equal(
    payload.contractVersion,
    "capability-contract.v1",
    "capabilities endpoint should expose CapabilityContract v1",
  );
  assert(Array.isArray(payload.contracts), "capabilities should be an array");
  assert(payload.contracts.length > 0, "capabilities should not be empty");

  const contracts = payload.contracts;
  const requiredFields = [
    "contractVersion",
    "id",
    "kind",
    "label",
    "inputSchema",
    "outputSchema",
    "scopes",
    "permissions",
    "riskLevel",
    "status",
    "source",
  ];

  for (const contract of contracts) {
    for (const field of requiredFields) {
      assert(
        Object.hasOwn(contract, field),
        `capability contract ${contract.id ?? "<missing-id>"} missing ${field}`,
      );
    }

    assert.equal(contract.contractVersion, "capability-contract.v1");
    assert(Array.isArray(contract.scopes), `${contract.id} scopes should be array`);
    assert(
      Array.isArray(contract.permissions),
      `${contract.id} permissions should be array`,
    );
    assert(
      contract.inputSchema && typeof contract.inputSchema === "object",
      `${contract.id} inputSchema should be object`,
    );
    assert(
      contract.outputSchema && typeof contract.outputSchema === "object",
      `${contract.id} outputSchema should be object`,
    );
    assert(
      ["low", "medium", "high"].includes(contract.riskLevel),
      `${contract.id} riskLevel should be normalized`,
    );
    assert(
      ["available", "mock", "planned", "disabled"].includes(contract.status),
      `${contract.id} status should be known`,
    );
  }

  assert(
    contracts.some((contract) => contract.kind === "tool"),
    "capabilities should include tool contracts",
  );
  assert(
    contracts.some((contract) => contract.kind === "skill"),
    "capabilities should include skill contracts",
  );
  assert(
    contracts.some((contract) => contract.kind === "rag"),
    "capabilities should include rag contracts",
  );
  assert(
    contracts.some((contract) => contract.kind === "agent"),
    "capabilities should include agent contracts",
  );
  assert(
    contracts.some((contract) => contract.kind === "write_object"),
    "capabilities should include write_object contracts",
  );
  assert(
    contracts.some(
      (contract) => contract.status === "mock" || contract.status === "planned",
    ),
    "capabilities should preserve mock/planned statuses",
  );

  const workOrderRead = contracts.find(
    (contract) => contract.id === "tool.work_order.read",
  );
  assert(workOrderRead, "work_order.read tool contract should exist");
  assert(
    workOrderRead.scopes.includes("work_orders:list"),
    "work_order.read should expose work_orders:list scope",
  );

  const adapterRegistry = payload.adapterRegistry;
  assert.equal(
    adapterRegistry?.registryVersion,
    "work-protocol-adapter-registry.v1",
    "capabilities should expose the executor adapter registry summary",
  );
  assert(
    Array.isArray(adapterRegistry.adapters),
    "adapter registry should expose adapters",
  );
  assert(
    adapterRegistry.adapters.some(
      (adapter) => adapter.adapterId === "plan-only.tool",
    ),
    "adapter registry should include the plan-only Tool adapter",
  );
  assert(
    adapterRegistry.adapters.some(
      (adapter) => adapter.adapterId === "plan-only.bp-ask-report",
    ),
    "adapter registry should include the BP Ask report adapter",
  );
  assert(
    adapterRegistry.permissions.some(
      (permission) =>
        permission.permission === "tool:execute" &&
        permission.guardKind === "department_scope" &&
        permission.enforcedBy === "runtime-preflight",
    ),
    "adapter registry should expose the Tool permission guard",
  );
  assert.equal(
    adapterRegistry.counts.unknownPermissionCount,
    0,
    "adapter registry should not contain unregistered permission strings",
  );
}

function assertPatchRejectedChange(result, operationId, code, message) {
  assert.equal(
    result?.status,
    "rejected",
    message ?? `Parameter patch ${operationId} should be rejected`,
  );
  assert.equal(
    result?.appliedChanges?.length ?? 0,
    0,
    "Rejected parameter patch transaction should not expose applied changes",
  );
  assert(
    result?.rejectedChanges?.some(
      (change) =>
        (!operationId || change.operationId === operationId) &&
        change.code === code,
    ),
    `Rejected parameter patch should include ${code}`,
  );
}

async function advanceExecution(cookieHeader, executionId, action = "advance") {
  const { json } = await requestJson(
    "/api/ai-dorm/work-protocol-gateway/executions",
    {
      method: "PATCH",
      body: JSON.stringify({ executionId, action }),
    },
    cookieHeader,
  );

  return json.execution;
}

async function main() {
  const cookieHeader = await login();
  const runId = buildRunId();
  const prompt = `请用 协议烟测${runId} 查一下工单状态，跑一下协议。`;
  const draft = buildWorkProtocolDraft(runId);
  let registeredProtocolId = "";
  let nodeCompiledSpecProtocolId = "";
  let fieldFlowFailureProtocolId = "";
  let contractPreflightFailureProtocolId = "";
  let adapterPermissionFailureProtocolId = "";

  try {
    const capabilities = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/capabilities",
      {},
      cookieHeader,
    );

    assertCapabilityContracts(capabilities.json);

    const validation = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/validate",
      {
        method: "POST",
        body: JSON.stringify({
          draft,
          mode: "register",
          allowMockCapabilities: true,
        }),
      },
      cookieHeader,
    );

    assert.equal(
      validation.json.result.summary.errors,
      0,
      "烟测协议注册校验不应有 error",
    );

    const grooming = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/groom",
      {
        method: "POST",
        body: JSON.stringify({
          draft,
          mode: "register",
          allowMockCapabilities: true,
        }),
      },
      cookieHeader,
    );
    const groomedToolNode = grooming.json.result.groomedDraft.nodes.find(
      (node) => node.id === "node-read-work-order",
    );
    const groomedEntryEdge = grooming.json.result.groomedDraft.edges.find(
      (edge) => edge.id === "edge-entry-to-tool",
    );

    assert.equal(
      grooming.json.result.status,
      "groomed",
      "Grooming should produce a clean deterministic draft",
    );
    assert.equal(
      grooming.json.result.summary.parameterCodeBlocks,
      draft.nodes.length + draft.edges.length + 1,
      "Grooming should expose protocol, node and edge parameter code blocks",
    );
    assert.equal(
      groomedToolNode?.compiledSpecStatus,
      "fresh",
      "Grooming should attach a fresh compiledSpec to the tool node",
    );
    assert.equal(
      groomedToolNode?.compiledSpec?.callableId,
      "tool.work_order.read",
      "Grooming should preserve the selected tool callable",
    );
    assert.equal(
      groomedEntryEdge?.compiledSpecStatus,
      "fresh",
      "Grooming should attach a fresh compiledSpec to the entry edge",
    );
    assert.equal(
      groomedEntryEdge?.compiledSpec?.transferMode,
      "communication_prompt",
      "Grooming should default an unstructured edge to a communication prompt",
    );
    assert.equal(
      grooming.json.result.protocolSummary.status,
      "ok",
      "Clean grooming should expose an ok protocol summary",
    );
    assert.equal(
      grooming.json.result.nodeAnnotations?.["node-read-work-order"]?.status,
      "ok",
      "Clean grooming should expose ok node annotations",
    );
    assert.equal(
      grooming.json.result.edgeAnnotations?.["edge-entry-to-tool"]
        ?.parameterCodeBlock?.target,
      "edge",
      "Edge annotations should expose their parameter code block",
    );
    const toolNodeParameterBlock =
      grooming.json.result.nodeAnnotations?.["node-read-work-order"]
        ?.parameterCodeBlock;
    const edgeParameterBlock =
      grooming.json.result.edgeAnnotations?.["edge-entry-to-tool"]
        ?.parameterCodeBlock;
    const protocolParameterBlock =
      grooming.json.result.protocolSummary?.parameterCodeBlock;

    assert.equal(
      toolNodeParameterBlock?.code?.capabilityContracts?.execution?.id,
      "tool.work_order.read",
      "Tool node parameter block should include its execution capability contract",
    );
    assert.equal(
      toolNodeParameterBlock?.code?.capabilityContracts?.nodeKind?.id,
      "node_kind.tool_call",
      "Tool node parameter block should include its node kind contract",
    );
    assert(
      toolNodeParameterBlock?.code?.contractParameterOptions?.scopes?.includes(
        "work_orders:list",
      ),
      "Tool node parameter block should expose allowed scope options from contracts",
    );
    assert.equal(
      edgeParameterBlock?.code?.contractFlow?.target?.contracts?.execution?.id,
      "tool.work_order.read",
      "Edge parameter block should expose target capability contract flow",
    );
    assert.equal(
      protocolParameterBlock?.code?.capabilityContracts?.contractVersion,
      "capability-contract.v1",
      "Protocol parameter block should include capability contract summary",
    );
    const modelInputPack = grooming.json.result.modelInputPack;
    const modelInputToolNode = modelInputPack?.nodes?.find(
      (node) => node.id === "node-read-work-order",
    );

    assert.equal(
      modelInputPack?.schemaVersion,
      "work-protocol-grooming-input.v1",
      "Grooming should expose the model input contract pack",
    );
    assert.equal(
      grooming.json.result.audit?.schemaVersion,
      "work-protocol-grooming-audit.v1",
      "Grooming should expose a normalized audit payload",
    );
    assert.equal(
      grooming.json.result.audit?.status,
      "pass",
      "Clean deterministic grooming should produce a passing audit",
    );
    assert(
      grooming.json.result.audit?.eventsByTarget?.["protocol:root"]?.some(
        (event) => event.source === "input_pack",
      ),
      "Grooming audit should index protocol input-pack events by target",
    );
    assert.equal(
      modelInputPack?.outputContract?.schemaVersion,
      "work-protocol-model-grooming-output.v1",
      "Grooming input pack should include the expected model output contract",
    );
    assert(
      modelInputPack?.capabilityContracts?.some(
        (contract) => contract.id === "tool.work_order.read",
      ),
      "Model input pack should include relevant capability contracts",
    );
    assert(
      modelInputToolNode?.candidateContractIds?.includes("tool.work_order.read"),
      "Model input pack should expose candidate contracts for the tool node",
    );

    const parameterPatchDryRun = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/parameter-patch",
      {
        method: "POST",
        body: JSON.stringify({
          draft: grooming.json.result.groomedDraft,
          mode: "dry_run",
          validationMode: "register",
          allowMockCapabilities: true,
          persistAudit: true,
          operations: [
            {
              operationId: "smoke-edge-transfer-mode",
              target: { kind: "edge", edgeId: "edge-entry-to-tool" },
              path: "compiledSpec.transferMode",
              value: "structured_packet",
              reason: "Smoke-test a parameter patch dry-run.",
            },
          ],
        }),
      },
      cookieHeader,
    );

    assert.equal(
      parameterPatchDryRun.json.result?.schemaVersion,
      "work-protocol-parameter-patch.v1",
      "Parameter patch endpoint should expose the v1 transaction contract",
    );
    assert.equal(
      parameterPatchDryRun.json.result?.status,
      "validated",
      "Dry-run parameter patch should validate without mutating the source draft",
    );
    assert.equal(
      parameterPatchDryRun.json.result?.candidateDraft?.edges?.find(
        (edge) => edge.id === "edge-entry-to-tool",
      )?.compiledSpec?.transferMode,
      "structured_packet",
      "Dry-run parameter patch should expose the candidate compiledSpec",
    );
    assert.equal(
      parameterPatchDryRun.json.result?.draft?.edges?.find(
        (edge) => edge.id === "edge-entry-to-tool",
      )?.compiledSpec?.transferMode,
      "communication_prompt",
      "Dry-run parameter patch should keep the returned draft unchanged",
    );
    assert.equal(
      parameterPatchDryRun.json.auditRecord?.schemaVersion,
      "work-protocol-parameter-patch-audit.v1",
      "Persisted parameter patch should return an audit record",
    );
    assert.equal(
      parameterPatchDryRun.json.auditRecord?.status,
      "validated",
      "Parameter patch audit should capture the transaction status",
    );
    assert.equal(
      parameterPatchDryRun.json.auditRecord?.operationCount,
      1,
      "Parameter patch audit should capture operation counts",
    );

    const parameterPatchAudits = await requestJson(
      `/api/ai-dorm/work-protocol-gateway/parameter-patch?draftId=${encodeURIComponent(
        grooming.json.result.groomedDraft.id,
      )}&limit=5`,
      {},
      cookieHeader,
    );
    assert(
      parameterPatchAudits.json.records?.some(
        (record) => record.id === parameterPatchDryRun.json.auditRecord?.id,
      ),
      "Parameter patch audit GET should return the persisted transaction",
    );

    const parameterPatchRejected = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/parameter-patch",
      {
        method: "POST",
        body: JSON.stringify({
          draft: grooming.json.result.groomedDraft,
          mode: "apply",
          validationMode: "register",
          allowMockCapabilities: true,
          operations: [
            {
              operationId: "smoke-unsafe-edge-endpoint",
              target: { kind: "edge", edgeId: "edge-entry-to-tool" },
              path: "compiledSpec.sourceNodeId",
              value: "node-other",
              reason: "Smoke-test the parameter patch whitelist.",
            },
          ],
        }),
      },
      cookieHeader,
    );

    assert.equal(
      parameterPatchRejected.json.result?.status,
      "rejected",
      "Parameter patch should reject non-whitelisted compiledSpec paths",
    );
    assert(
      parameterPatchRejected.json.result?.rejectedChanges?.some(
        (change) =>
          change.operationId === "smoke-unsafe-edge-endpoint" &&
          (change.code === "path_not_allowed" || change.code === "invalid_value"),
      ),
      "Rejected parameter patch should explain the blocked path",
    );

    const parameterPatchNoEffect = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/parameter-patch",
      {
        method: "POST",
        body: JSON.stringify({
          draft: grooming.json.result.groomedDraft,
          mode: "dry_run",
          validationMode: "register",
          allowMockCapabilities: true,
          operations: [
            {
              operationId: "smoke-no-effect-transfer-mode",
              target: { kind: "edge", edgeId: "edge-entry-to-tool" },
              path: "compiledSpec.transferMode",
              value: "communication_prompt",
            },
          ],
        }),
      },
      cookieHeader,
    );

    assert.equal(
      parameterPatchNoEffect.json.result?.status,
      "no_effect",
      "Parameter patch should explicitly report no-effect transactions",
    );
    assert(
      parameterPatchNoEffect.json.result?.rejectedChanges?.some(
        (change) =>
          change.operationId === "smoke-no-effect-transfer-mode" &&
          change.code === "no_effect",
      ),
      "No-effect parameter patch should explain the unchanged value",
    );

    const parameterPatchEmptyOperations = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/parameter-patch",
      {
        method: "POST",
        body: JSON.stringify({
          draft: grooming.json.result.groomedDraft,
          mode: "dry_run",
          validationMode: "register",
          allowMockCapabilities: true,
          operations: [],
        }),
      },
      cookieHeader,
    );

    assertPatchRejectedChange(
      parameterPatchEmptyOperations.json.result,
      undefined,
      "missing_operation",
      "Empty parameter patch operations should be rejected",
    );

    const parameterPatchMalformedOperation = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/parameter-patch",
      {
        method: "POST",
        body: JSON.stringify({
          draft: grooming.json.result.groomedDraft,
          mode: "dry_run",
          validationMode: "register",
          allowMockCapabilities: true,
          operations: [
            {
              operationId: "smoke-missing-target",
              path: "compiledSpec.transferMode",
              value: "structured_packet",
            },
          ],
        }),
      },
      cookieHeader,
    );

    assertPatchRejectedChange(
      parameterPatchMalformedOperation.json.result,
      "smoke-missing-target",
      "missing_operation",
      "Malformed parameter patch operation should be rejected",
    );

    const parameterPatchUnknownNode = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/parameter-patch",
      {
        method: "POST",
        body: JSON.stringify({
          draft: grooming.json.result.groomedDraft,
          mode: "dry_run",
          validationMode: "register",
          allowMockCapabilities: true,
          operations: [
            {
              operationId: "smoke-unknown-node",
              target: { kind: "node", nodeId: "node-missing-for-patch" },
              path: "compiledSpec.riskLevel",
              value: "low",
            },
          ],
        }),
      },
      cookieHeader,
    );

    assertPatchRejectedChange(
      parameterPatchUnknownNode.json.result,
      "smoke-unknown-node",
      "unknown_target",
      "Unknown parameter patch node target should be rejected",
    );

    const parameterPatchMissingCompiledSpec = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/parameter-patch",
      {
        method: "POST",
        body: JSON.stringify({
          draft,
          mode: "dry_run",
          validationMode: "register",
          allowMockCapabilities: true,
          operations: [
            {
              operationId: "smoke-missing-compiled-spec",
              target: { kind: "node", nodeId: "node-read-work-order" },
              path: "compiledSpec.riskLevel",
              value: "medium",
            },
          ],
        }),
      },
      cookieHeader,
    );

    assertPatchRejectedChange(
      parameterPatchMissingCompiledSpec.json.result,
      "smoke-missing-compiled-spec",
      "compiled_spec_missing",
      "Parameter patch should require grooming before node compiledSpec edits",
    );

    const parameterPatchInvalidValue = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/parameter-patch",
      {
        method: "POST",
        body: JSON.stringify({
          draft: grooming.json.result.groomedDraft,
          mode: "dry_run",
          validationMode: "register",
          allowMockCapabilities: true,
          operations: [
            {
              operationId: "smoke-invalid-transfer-mode",
              target: { kind: "edge", edgeId: "edge-entry-to-tool" },
              path: "compiledSpec.transferMode",
              value: "free_text_magic",
            },
          ],
        }),
      },
      cookieHeader,
    );

    assertPatchRejectedChange(
      parameterPatchInvalidValue.json.result,
      "smoke-invalid-transfer-mode",
      "invalid_value",
      "Invalid parameter patch value should be rejected",
    );

    const parameterPatchCompileRejected = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/parameter-patch",
      {
        method: "POST",
        body: JSON.stringify({
          draft: grooming.json.result.groomedDraft,
          mode: "apply",
          validationMode: "register",
          allowMockCapabilities: true,
          operations: [
            {
              operationId: "smoke-empty-protocol-name",
              target: {
                kind: "protocol",
                draftId: grooming.json.result.groomedDraft.id,
              },
              path: "name",
              value: "",
            },
          ],
        }),
      },
      cookieHeader,
    );

    assertPatchRejectedChange(
      parameterPatchCompileRejected.json.result,
      "smoke-empty-protocol-name",
      "compile_validation_failed",
      "Parameter patch should reject changes that break compile validation",
    );
    assert.equal(
      parameterPatchCompileRejected.json.result?.draft?.name,
      grooming.json.result.groomedDraft.name,
      "Compile-rejected parameter patch should return the original draft",
    );

    const patchPreflightFailure = buildContractPreflightFailureDraft(
      `${runId}-patch-preflight`,
    );
    const parameterPatchPreflightRejected = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/parameter-patch",
      {
        method: "POST",
        body: JSON.stringify({
          draft: patchPreflightFailure.draft,
          mode: "apply",
          validationMode: "register",
          allowMockCapabilities: true,
          operations: [
            {
              operationId: "smoke-preflight-reject",
              target: { kind: "node", nodeId: "node-write-work-order" },
              path: "compiledSpec.timeoutMs",
              value: 61_000,
            },
          ],
        }),
      },
      cookieHeader,
    );

    assertPatchRejectedChange(
      parameterPatchPreflightRejected.json.result,
      "smoke-preflight-reject",
      "runtime_preflight_failed",
      "Parameter patch should reject changes when runtime preflight blocks the candidate",
    );
    assert(
      parameterPatchPreflightRejected.json.result?.preflightIssues?.some(
        (issue) =>
          issue.code === "field_flow_mismatch" ||
          issue.code === "approval_required",
      ),
      "Runtime-preflight-rejected patch should expose preflight issues",
    );

    const validModelOutputContract = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/grooming-contract",
      {
        method: "POST",
        body: JSON.stringify({
          draft,
          applyModelOutput: true,
          modelOutput: {
            schemaVersion: "work-protocol-model-grooming-output.v1",
            status: "groomed",
            nodeUpdates: [
              {
                nodeId: "node-read-work-order",
                contractId: "tool.work_order.read",
                callableId: "tool.work_order.read",
              },
            ],
            edgeUpdates: [
              {
                edgeId: "edge-entry-to-tool",
                transferMode: "structured_packet",
                prompt: "Use a structured packet for the work-order lookup.",
              },
            ],
            issues: [],
          },
        }),
      },
      cookieHeader,
    );

    assert.equal(
      validModelOutputContract.json.validation?.valid,
      true,
      "Grooming contract endpoint should accept a valid model output",
    );
    assert.equal(
      validModelOutputContract.json.inputPack?.schemaVersion,
      "work-protocol-grooming-input.v1",
      "Grooming contract endpoint should return the model input pack",
    );
    assert.equal(
      validModelOutputContract.json.application?.status,
      "applied",
      "Valid model output should be applied through the deterministic patch layer",
    );
    assert.equal(
      validModelOutputContract.json.audit?.schemaVersion,
      "work-protocol-grooming-audit.v1",
      "Grooming contract endpoint should return a normalized audit payload",
    );
    assert.equal(
      validModelOutputContract.json.audit?.summary?.appliedChanges,
      validModelOutputContract.json.application?.appliedChanges?.length,
      "Audit summary should count applied model output changes",
    );
    assert(
      validModelOutputContract.json.application?.appliedChanges?.some(
        (change) =>
          change.target === "edge" &&
          change.targetId === "edge-entry-to-tool" &&
          change.path === "compiledSpec.transferMode",
      ),
      "Application result should record the edge transferMode patch",
    );
    assert(
      validModelOutputContract.json.audit?.eventsByTarget?.[
        "edge:edge-entry-to-tool"
      ]?.some((event) => event.code === "model_output_change_applied"),
      "Audit should index model application events by edge target",
    );
    const appliedEntryEdge =
      validModelOutputContract.json.application?.appliedDraft?.edges?.find(
        (edge) => edge.id === "edge-entry-to-tool",
      );

    assert.equal(
      appliedEntryEdge?.transferIntent,
      draft.edges.find((edge) => edge.id === "edge-entry-to-tool")
        ?.transferIntent,
      "Model output application should preserve the raw edge transfer text",
    );
    assert.equal(
      appliedEntryEdge?.compiledSpec?.transferMode,
      "structured_packet",
      "Model output application should write only the sanitized edge compiledSpec",
    );

    const appliedModelGrooming = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/groom",
      {
        method: "POST",
        body: JSON.stringify({
          draft: validModelOutputContract.json.application.appliedDraft,
          mode: "register",
          allowMockCapabilities: true,
        }),
      },
      cookieHeader,
    );
    const appliedModelGroomedEdge =
      appliedModelGrooming.json.result.groomedDraft.edges.find(
        (edge) => edge.id === "edge-entry-to-tool",
      );

    assert.equal(
      appliedModelGroomedEdge?.compiledSpec?.transferMode,
      "structured_packet",
      "Grooming should preserve sanitized edge parameters after model output application",
    );

    const invalidModelOutputContract = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/grooming-contract",
      {
        method: "POST",
        body: JSON.stringify({
          draft,
          applyModelOutput: true,
          modelOutput: {
            schemaVersion: "work-protocol-model-grooming-output.v1",
            status: "groomed",
            nodeUpdates: [
              {
                nodeId: "node-read-work-order",
                contractId: "tool.missing-for-model-output",
              },
            ],
            edgeUpdates: [
              {
                edgeId: "edge-missing-for-model-output",
              },
            ],
            issues: [],
          },
        }),
      },
      cookieHeader,
    );

    assert.equal(
      invalidModelOutputContract.json.validation?.valid,
      false,
      "Grooming contract endpoint should reject invalid model output IDs",
    );
    assert(
      invalidModelOutputContract.json.validation?.issues?.some(
        (issue) => issue.code === "unknown_contract_id",
      ),
      "Invalid model output should report unknown_contract_id",
    );
    assert(
      invalidModelOutputContract.json.validation?.issues?.some(
        (issue) => issue.code === "unknown_edge_id",
      ),
      "Invalid model output should report unknown_edge_id",
    );
    assert.equal(
      invalidModelOutputContract.json.application?.status,
      "rejected",
      "Invalid model output should not be applied to a draft",
    );
    assert.equal(
      invalidModelOutputContract.json.audit?.status,
      "blocked",
      "Invalid model output audit should be blocked",
    );
    assert(
      invalidModelOutputContract.json.audit?.eventsByTarget?.[
        "node:node-read-work-order"
      ]?.some((event) => event.code === "unknown_contract_id"),
      "Audit should map model validation failures back to their target node",
    );

    const invalidAnnotationDraft = buildInvalidAnnotationDraft(runId);
    const invalidGrooming = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/groom",
      {
        method: "POST",
        body: JSON.stringify({
          draft: invalidAnnotationDraft,
          mode: "register",
          allowMockCapabilities: true,
        }),
      },
      cookieHeader,
    );

    assert.equal(
      invalidGrooming.json.result.status,
      "invalid",
      "Invalid draft grooming should be marked invalid",
    );
    assert.equal(
      invalidGrooming.json.result.protocolSummary.status,
      "error",
      "Invalid draft should expose a protocol-level error summary",
    );
    assert(
      invalidGrooming.json.result.protocolSummary.issues?.some(
        (issue) => issue.code === "missing_required_text",
      ),
      "Protocol summary should include protocol-targeted issues",
    );
    assert.equal(
      invalidGrooming.json.result.nodeAnnotations?.["node-read-work-order"]
        ?.status,
      "error",
      "Unknown callable should mark the tool node annotation as error",
    );
    assert(
      invalidGrooming.json.result.nodeAnnotations?.[
        "node-read-work-order"
      ]?.issues?.some((issue) => issue.code === "unknown_callable"),
      "Tool node annotation should include the unknown_callable issue",
    );
    assert.equal(
      invalidGrooming.json.result.edgeAnnotations?.["edge-tool-to-report"]
        ?.status,
      "error",
      "Missing target endpoint should mark the edge annotation as error",
    );
    assert(
      invalidGrooming.json.result.edgeAnnotations?.[
        "edge-tool-to-report"
      ]?.issues?.some((issue) => issue.code === "missing_edge_endpoint"),
      "Edge annotation should include the missing_edge_endpoint issue",
    );

    const sourceDraftRecordResult = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/drafts",
      {
        method: "POST",
        body: JSON.stringify({
          draft,
          kind: "source",
        }),
      },
      cookieHeader,
    );
    const sourceDraftRecord = sourceDraftRecordResult.json.record;
    const groomedDraftRecordResult = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/drafts",
      {
        method: "POST",
        body: JSON.stringify({
          draft: grooming.json.result.groomedDraft,
          kind: "groomed",
          sourceRecordId: sourceDraftRecord.id,
          groomingResult: grooming.json.result,
          catalogHash: grooming.json.catalogHash,
        }),
      },
      cookieHeader,
    );
    const groomedDraftRecord = groomedDraftRecordResult.json.record;

    assert.equal(
      sourceDraftRecord.kind,
      "source",
      "Draft store should save the original canvas draft separately",
    );
    assert.equal(
      groomedDraftRecord.kind,
      "groomed",
      "Draft store should save the groomed draft separately",
    );
    assert.equal(
      groomedDraftRecord.sourceRecordId,
      sourceDraftRecord.id,
      "Groomed draft record should point back to the source draft record",
    );
    assert.equal(
      groomedDraftRecord.grooming?.status,
      "groomed",
      "Groomed draft record should preserve grooming metadata",
    );
    assert.equal(
      groomedDraftRecord.grooming?.parameterCodeBlocks?.length,
      draft.nodes.length + draft.edges.length + 1,
      "Groomed draft record should persist parameter code blocks",
    );

    const draftRecordsList = await requestJson(
      `/api/ai-dorm/work-protocol-gateway/drafts?draftId=${encodeURIComponent(
        draft.id,
      )}`,
      {},
      cookieHeader,
    );

    assert(
      draftRecordsList.json.records?.some(
        (record) => record.id === sourceDraftRecord.id,
      ),
      "Draft store list should include the source record",
    );
    assert(
      draftRecordsList.json.records?.some(
        (record) => record.id === groomedDraftRecord.id,
      ),
      "Draft store list should include the groomed record",
    );

    const parameterPatchCommit = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/parameter-patch",
      {
        method: "POST",
        body: JSON.stringify({
          draft: grooming.json.result.groomedDraft,
          mode: "apply",
          validationMode: "register",
          allowMockCapabilities: true,
          persistAudit: true,
          commitDraft: true,
          baseGroomedRecordId: groomedDraftRecord.id,
          sourceRecordId: sourceDraftRecord.id,
          operations: [
            {
              operationId: "smoke-commit-edge-transfer-mode",
              target: { kind: "edge", edgeId: "edge-entry-to-tool" },
              path: "compiledSpec.transferMode",
              value: "structured_packet",
              reason: "Smoke-test a committed parameter patch.",
            },
          ],
        }),
      },
      cookieHeader,
    );
    const committedDraftRecord =
      parameterPatchCommit.json.committedDraftRecord;

    assert.equal(
      parameterPatchCommit.json.result?.status,
      "applied",
      "Committed parameter patch should apply successfully",
    );
    assert.equal(
      committedDraftRecord?.kind,
      "groomed",
      "Committed parameter patch should save a new groomed draft record",
    );
    assert.equal(
      committedDraftRecord?.sourceRecordId,
      sourceDraftRecord.id,
      "Committed groomed draft record should preserve the source record link",
    );
    assert.equal(
      committedDraftRecord?.draft?.edges?.find(
        (edge) => edge.id === "edge-entry-to-tool",
      )?.compiledSpec?.transferMode,
      "structured_packet",
      "Committed groomed draft should persist the patched parameter",
    );
    assert.equal(
      committedDraftRecord?.grooming?.parameterCodeBlocks?.length,
      draft.nodes.length + draft.edges.length + 1,
      "Committed groomed draft should persist refreshed parameter code blocks",
    );
    assert.equal(
      parameterPatchCommit.json.auditRecord?.commitStatus,
      "committed",
      "Parameter patch audit should record committed transactions",
    );
    assert.equal(
      parameterPatchCommit.json.auditRecord?.baseDraftRecordId,
      groomedDraftRecord.id,
      "Parameter patch audit should record the base groomed record",
    );
    assert.equal(
      parameterPatchCommit.json.auditRecord?.committedDraftRecordId,
      committedDraftRecord?.id,
      "Parameter patch audit should point at the committed groomed record",
    );

    const committedDraftRecordsList = await requestJson(
      `/api/ai-dorm/work-protocol-gateway/drafts?draftId=${encodeURIComponent(
        draft.id,
      )}`,
      {},
      cookieHeader,
    );

    assert(
      committedDraftRecordsList.json.records?.some(
        (record) => record.id === committedDraftRecord?.id,
      ),
      "Draft store list should include the committed parameter patch record",
    );

    const committedPatchAudits = await requestJson(
      `/api/ai-dorm/work-protocol-gateway/parameter-patch?draftId=${encodeURIComponent(
        draft.id,
      )}&limit=10`,
      {},
      cookieHeader,
    );

    assert(
      committedPatchAudits.json.records?.some(
        (record) =>
          record.committedDraftRecordId === committedDraftRecord?.id &&
          record.commitStatus === "committed",
      ),
      "Parameter patch audit list should include the committed transaction",
    );

    const registration = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/registry",
      {
        method: "POST",
        body: JSON.stringify({
          draftRecordId: groomedDraftRecord.id,
          enabled: true,
          priority: 1,
          allowMockCapabilities: true,
          runtimeMode: "plan_only",
        }),
      },
      cookieHeader,
    );

    const registered = registration.json.registered;
    registeredProtocolId = registered.id;

    assert.equal(registered.enabled, true, "注册协议应为启用状态");
    assert.equal(registered.runtimeMode, "plan_only", "注册协议只能是 plan_only");
    assert(registered.activeVersionId, "注册协议应有 activeVersionId");
    assert.equal(
      registered.versions.at(-1)?.draftSnapshot?.id,
      draft.id,
      "注册版本应保留 draftSnapshot",
    );
    assert(
      registered.versions.at(-1)?.capabilityCatalogHash,
      "注册版本应记录 capabilityCatalogHash",
    );

    assert.equal(
      registered.versions.at(-1)?.draftRecordId,
      groomedDraftRecord.id,
      "Registration should preserve the groomed draft record boundary",
    );
    assert.equal(
      registered.versions.at(-1)?.draftKind,
      "groomed",
      "Registration should record that it came from a groomed draft",
    );

    const matchResult = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/match",
      {
        method: "POST",
        body: JSON.stringify({
          prompt,
          minConfidence: 20,
          limit: 1,
        }),
      },
      cookieHeader,
    );
    const match = matchResult.json.matches?.[0];

    assert(match, "应匹配到刚注册的工作协议");
    assert.equal(match.protocolId, registered.id, "匹配结果应指向刚注册的协议");
    assert.equal(match.runtimeMode, "plan_only", "匹配结果应带 runtimeMode");
    assert.equal(
      match.activeVersionId,
      registered.activeVersionId,
      "匹配结果应指向当前 active version",
    );

    const executionResult = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/executions",
      {
        method: "POST",
        body: JSON.stringify({
          match,
          prompt,
          minConfidence: 20,
          threadId: `smoke-thread-${runId}`,
        }),
      },
      cookieHeader,
    );
    const execution = executionResult.json.execution;

    assert.equal(execution.status, "queued", "新执行计划应从 queued 开始");
    assert.equal(execution.mode, "plan_only", "执行计划应为 plan_only");
    assert(execution.capabilityCatalogHash, "执行计划应记录 capabilityCatalogHash");
    assert.equal(execution.nodePlan.length, 3, "最小闭环应有三个节点");

    const executionToolNode = execution.nodePlan.find(
      (node) => node.nodeId === "node-read-work-order",
    );

    assert.equal(
      executionToolNode?.adapterId,
      "plan-only.tool",
      "Tool node plan should resolve the plan-only Tool adapter",
    );
    assert.equal(
      executionToolNode?.adapterAvailable,
      true,
      "Tool node plan should mark its adapter as available",
    );
    assert(
      executionToolNode?.requiredInputNames?.includes("instruction"),
      "Tool adapter plan should expose required input names",
    );
    assert(
      executionToolNode?.plannedOutputNames?.includes("toolResult"),
      "Tool adapter plan should expose planned output names",
    );

    let advanced = execution;
    for (let index = 0; index < 4 && advanced.status !== "completed"; index += 1) {
      advanced = await advanceExecution(cookieHeader, execution.id);
    }

    assert.equal(advanced.status, "completed", "执行计划应能推进到 completed");
    assert(advanced.outputPacket, "完成后应生成 outputPacket");
    assert.equal(
      advanced.nodePlan.every((node) => node.status === "completed"),
      true,
      "所有节点都应完成",
    );
    assert.equal(
      advanced.inputPacket?.values?.nodeOutputs?.["node-read-work-order"]
        ?.toolResult?.mode,
      "plan_only",
      "Tool 节点应写入 plan-only adapter 输出",
    );
    assert.equal(
      advanced.inputPacket?.values?.nodeInputs?.["node-read-work-order"]
        ?.inboundEdges?.[0]?.sourceNodeId,
      "node-bp-entry",
      "Tool node should receive the entry edge input packet",
    );
    assert.equal(
      advanced.inputPacket?.values?.nodeOutputs?.["node-read-work-order"]
        ?.adapterId,
      "plan-only.tool",
      "Adapter output should record the adapter id",
    );
    assert.equal(
      advanced.inputPacket?.values?.nodeInputs?.["node-bp-report"]
        ?.upstreamOutputs?.["node-read-work-order"]?.toolResult?.mode,
      "plan_only",
      "BP Ask report node should receive upstream Tool output",
    );
    assert.equal(
      advanced.inputPacket?.values?.nodeOutputs?.["node-bp-report"]?.replyText
        ?.includes("plan-only"),
      true,
      "BP问问汇报出口应写入 adapter 汇报文本",
    );

    const terminalAgain = await advanceExecution(cookieHeader, execution.id);
    assert.equal(
      terminalAgain.status,
      "completed",
      "终态 execution 重复推进应保持 completed",
    );

    const nodeCompiledSpec = buildNodeCompiledSpecDraft(runId);
    const nodeCompiledSpecCompile = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/compile",
      {
        method: "POST",
        body: JSON.stringify({
          draft: nodeCompiledSpec.draft,
          mode: "register",
          allowMockCapabilities: true,
        }),
      },
      cookieHeader,
    );
    const compiledSpecNode =
      nodeCompiledSpecCompile.json.result.compiled?.nodes?.find(
        (node) => node.nodeId === "node-read-work-order",
      );

    assert.equal(
      compiledSpecNode?.callableId,
      "tool.work_order.read",
      "Compiler should preserve callable binding from node compiledSpec",
    );
    assert.equal(
      compiledSpecNode?.inputBindings?.[0]?.name,
      "instruction",
      "Compiler should preserve node compiledSpec inputBindings",
    );
    assert.equal(
      compiledSpecNode?.timeoutMs,
      45_000,
      "Compiler should preserve node compiledSpec timeoutMs",
    );

    const nodeCompiledSpecRegistration = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/registry",
      {
        method: "POST",
        body: JSON.stringify({
          draft: nodeCompiledSpec.draft,
          enabled: true,
          priority: 1,
          allowMockCapabilities: true,
          runtimeMode: "plan_only",
        }),
      },
      cookieHeader,
    );

    nodeCompiledSpecProtocolId =
      nodeCompiledSpecRegistration.json.registered.id;

    const fieldFlowFailure = buildFieldFlowFailureDraft(runId);
    const fieldFlowCompile = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/compile",
      {
        method: "POST",
        body: JSON.stringify({
          draft: fieldFlowFailure.draft,
          mode: "register",
          allowMockCapabilities: true,
        }),
      },
      cookieHeader,
    );
    const compiledFailureEdge =
      fieldFlowCompile.json.result.compiled?.edges?.find(
        (edge) => edge.edgeId === "edge-entry-to-tool",
      );

    assert.equal(
      compiledFailureEdge?.fieldMappings?.[0]?.fromPath,
      "$.missing.workOrderNo",
      "Compiler should preserve groomed edge fieldMappings",
    );

    const fieldFlowRegistration = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/registry",
      {
        method: "POST",
        body: JSON.stringify({
          draft: fieldFlowFailure.draft,
          enabled: true,
          priority: 1,
          allowMockCapabilities: true,
          runtimeMode: "plan_only",
        }),
      },
      cookieHeader,
    );

    fieldFlowFailureProtocolId = fieldFlowRegistration.json.registered.id;

    const fieldFlowMatchResult = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/match",
      {
        method: "POST",
        body: JSON.stringify({
          prompt: `please run ${fieldFlowFailure.keyword}`,
          minConfidence: 20,
          limit: 1,
        }),
      },
      cookieHeader,
    );
    const fieldFlowMatch = fieldFlowMatchResult.json.matches?.[0];

    assert(fieldFlowMatch, "field-flow failure protocol should be matched");
    assert.equal(
      fieldFlowMatch.protocolId,
      fieldFlowFailureProtocolId,
      "field-flow failure match should point to the failure protocol",
    );

    const fieldFlowExecutionResult = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/executions",
      {
        method: "POST",
        body: JSON.stringify({
          match: fieldFlowMatch,
          prompt: `please run ${fieldFlowFailure.keyword}`,
          minConfidence: 20,
          threadId: `smoke-thread-field-flow-fail-${runId}`,
        }),
      },
      cookieHeader,
    );

    let fieldFlowFailed = fieldFlowExecutionResult.json.execution;
    for (
      let index = 0;
      index < 4 && fieldFlowFailed.status !== "failed";
      index += 1
    ) {
      fieldFlowFailed = await advanceExecution(cookieHeader, fieldFlowFailed.id);
    }

    assert.equal(
      fieldFlowFailed.status,
      "failed",
      "missing required field mapping should fail the execution",
    );
    assert(
      fieldFlowFailed.issues?.some(
        (issue) => issue.code === "field_flow_mismatch",
      ),
      "field-flow failure execution should record field_flow_mismatch",
    );
    assert.equal(
      fieldFlowFailed.nodePlan?.find(
        (node) => node.nodeId === "node-read-work-order",
      )?.status,
      "failed",
      "target node should fail when required field flow is missing",
    );

    const contractPreflightFailure = buildContractPreflightFailureDraft(runId);
    const contractPreflightRegistration = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/registry",
      {
        method: "POST",
        body: JSON.stringify({
          draft: contractPreflightFailure.draft,
          enabled: true,
          priority: 1,
          allowMockCapabilities: true,
          runtimeMode: "plan_only",
        }),
      },
      cookieHeader,
    );

    contractPreflightFailureProtocolId =
      contractPreflightRegistration.json.registered.id;

    const contractPreflightMatchResult = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/match",
      {
        method: "POST",
        body: JSON.stringify({
          prompt: `please run ${contractPreflightFailure.keyword}`,
          minConfidence: 20,
          limit: 1,
        }),
      },
      cookieHeader,
    );
    const contractPreflightMatch =
      contractPreflightMatchResult.json.matches?.[0];

    assert(
      contractPreflightMatch,
      "contract preflight failure protocol should be matched",
    );
    assert.equal(
      contractPreflightMatch.protocolId,
      contractPreflightFailureProtocolId,
      "contract preflight match should point to the failure protocol",
    );

    const contractPreflightExecutionResult = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/executions",
      {
        method: "POST",
        body: JSON.stringify({
          match: contractPreflightMatch,
          prompt: `please run ${contractPreflightFailure.keyword}`,
          minConfidence: 20,
          threadId: `smoke-thread-contract-preflight-fail-${runId}`,
        }),
      },
      cookieHeader,
    );

    let contractPreflightFailed =
      contractPreflightExecutionResult.json.execution;
    for (
      let index = 0;
      index < 4 && contractPreflightFailed.status !== "failed";
      index += 1
    ) {
      contractPreflightFailed = await advanceExecution(
        cookieHeader,
        contractPreflightFailed.id,
      );
    }

    assert.equal(
      contractPreflightFailed.status,
      "failed",
      "stale low-risk write_object parameter code should fail runtime preflight",
    );
    assert(
      contractPreflightFailed.issues?.some(
        (issue) =>
          issue.code === "field_flow_mismatch" ||
          issue.code === "approval_required",
      ),
      "contract preflight failure should record contract consistency issues",
    );
    assert.equal(
      contractPreflightFailed.nodePlan?.find(
        (node) => node.nodeId === "node-write-work-order",
      )?.status,
      "failed",
      "write node should fail when contract risk or approval is downgraded",
    );

    const adapterPermissionFailure = buildAdapterPermissionFailureDraft(runId);
    const adapterPermissionRegistration = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/registry",
      {
        method: "POST",
        body: JSON.stringify({
          draft: adapterPermissionFailure.draft,
          enabled: true,
          priority: 1,
          allowMockCapabilities: true,
          runtimeMode: "plan_only",
        }),
      },
      cookieHeader,
    );

    adapterPermissionFailureProtocolId =
      adapterPermissionRegistration.json.registered.id;

    const adapterPermissionMatchResult = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/match",
      {
        method: "POST",
        body: JSON.stringify({
          prompt: `please run ${adapterPermissionFailure.keyword}`,
          minConfidence: 20,
          limit: 1,
        }),
      },
      cookieHeader,
    );
    const adapterPermissionMatch =
      adapterPermissionMatchResult.json.matches?.[0];

    assert(
      adapterPermissionMatch,
      "adapter permission failure protocol should be matched",
    );
    assert.equal(
      adapterPermissionMatch.protocolId,
      adapterPermissionFailureProtocolId,
      "adapter permission failure match should point to the failure protocol",
    );

    const adapterPermissionExecutionResult = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/executions",
      {
        method: "POST",
        body: JSON.stringify({
          match: adapterPermissionMatch,
          prompt: `please run ${adapterPermissionFailure.keyword}`,
          minConfidence: 20,
          threadId: `smoke-thread-adapter-permission-fail-${runId}`,
        }),
      },
      cookieHeader,
    );

    let adapterPermissionFailed =
      adapterPermissionExecutionResult.json.execution;
    for (
      let index = 0;
      index < 4 && adapterPermissionFailed.status !== "failed";
      index += 1
    ) {
      adapterPermissionFailed = await advanceExecution(
        cookieHeader,
        adapterPermissionFailed.id,
      );
    }

    assert.equal(
      adapterPermissionFailed.status,
      "failed",
      "Skill adapter should fail when its department scope has no Skill folder access",
    );
    assert(
      adapterPermissionFailed.issues?.some(
        (issue) =>
          issue.code === "permission_denied" &&
          String(issue.id).includes("adapter-skill"),
      ),
      "adapter permission failure should record adapter Skill permission_denied",
    );
    assert.equal(
      adapterPermissionFailed.nodePlan?.find(
        (node) => node.nodeId === "node-read-work-order",
      )?.status,
      "failed",
      "Skill node should fail when adapter permission guard denies the scope",
    );

    await requestJson(
      "/api/ai-dorm/work-protocol-gateway/registry",
      {
        method: "PATCH",
        body: JSON.stringify({
          protocolId: contractPreflightFailureProtocolId,
          enabled: false,
        }),
      },
      cookieHeader,
    );

    await requestJson(
      "/api/ai-dorm/work-protocol-gateway/registry",
      {
        method: "PATCH",
        body: JSON.stringify({
          protocolId: fieldFlowFailureProtocolId,
          enabled: false,
        }),
      },
      cookieHeader,
    );

    const guardedExecutionResult = await requestJson(
      "/api/ai-dorm/work-protocol-gateway/executions",
      {
        method: "POST",
        body: JSON.stringify({
          match,
          prompt,
          minConfidence: 20,
          threadId: `smoke-thread-disabled-${runId}`,
        }),
      },
      cookieHeader,
    );
    const guardedExecution = guardedExecutionResult.json.execution;

    await requestJson(
      "/api/ai-dorm/work-protocol-gateway/registry",
      {
        method: "PATCH",
        body: JSON.stringify({
          protocolId: registered.id,
          enabled: false,
        }),
      },
      cookieHeader,
    );

    const failed = await advanceExecution(cookieHeader, guardedExecution.id);
    assert.equal(
      failed.status,
      "failed",
      "协议停用后继续推进执行计划应失败",
    );
    assert(
      failed.issues?.some((issue) => issue.code === "protocol_not_enabled"),
      "失败执行计划应记录 protocol_not_enabled issue",
    );
  } finally {
    if (registeredProtocolId) {
      await requestJson(
        "/api/ai-dorm/work-protocol-gateway/registry",
        {
          method: "PATCH",
          body: JSON.stringify({
            protocolId: registeredProtocolId,
            enabled: false,
          }),
        },
        cookieHeader,
      ).catch(() => null);
    }

    if (nodeCompiledSpecProtocolId) {
      await requestJson(
        "/api/ai-dorm/work-protocol-gateway/registry",
        {
          method: "PATCH",
          body: JSON.stringify({
            protocolId: nodeCompiledSpecProtocolId,
            enabled: false,
          }),
        },
        cookieHeader,
      ).catch(() => null);
    }

    if (fieldFlowFailureProtocolId) {
      await requestJson(
        "/api/ai-dorm/work-protocol-gateway/registry",
        {
          method: "PATCH",
          body: JSON.stringify({
            protocolId: fieldFlowFailureProtocolId,
            enabled: false,
          }),
        },
        cookieHeader,
      ).catch(() => null);
    }

    if (contractPreflightFailureProtocolId) {
      await requestJson(
        "/api/ai-dorm/work-protocol-gateway/registry",
        {
          method: "PATCH",
          body: JSON.stringify({
            protocolId: contractPreflightFailureProtocolId,
            enabled: false,
          }),
        },
        cookieHeader,
      ).catch(() => null);
    }

    if (adapterPermissionFailureProtocolId) {
      await requestJson(
        "/api/ai-dorm/work-protocol-gateway/registry",
        {
          method: "PATCH",
          body: JSON.stringify({
            protocolId: adapterPermissionFailureProtocolId,
            enabled: false,
          }),
        },
        cookieHeader,
      ).catch(() => null);
    }
  }

  console.log("work protocol gateway smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
