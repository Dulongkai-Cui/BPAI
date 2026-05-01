import process from "node:process";

import pg from "pg";

const baseUrl = process.env.BPAI_BASE_URL ?? "http://localhost:3001";
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://bpai:bpai@localhost:5433/bpai_dev";
const seed = Date.now().toString(36);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, init = {}, cookie = "") {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
}

async function requestJson(path, init = {}, cookie = "") {
  const response = await request(
    path,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    },
    cookie,
  );
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `Request failed ${response.status} ${path}: ${json?.message ?? text}`,
    );
  }

  return {
    json,
    response,
  };
}

async function runTool(cookieHeader, toolName, input) {
  const { json } = await requestJson(
    "/api/ai-tools/run",
    {
      method: "POST",
      body: JSON.stringify({ toolName, input }),
    },
    cookieHeader,
  );
  const toolRun = json?.toolRun;

  assert(toolRun, `${toolName}: missing toolRun`);
  assert(
    toolRun.status === "completed",
    `${toolName}: expected completed, got ${toolRun.status}: ${toolRun.summaryText}`,
  );

  return toolRun;
}

async function createThread(cookieHeader, title) {
  const created = await requestJson(
    "/api/bp-ask/threads",
    {
      method: "POST",
      body: JSON.stringify({ title }),
    },
    cookieHeader,
  );
  const threadId = created.json?.thread?.id;

  assert(threadId, "未创建出对话线程");
  return threadId;
}

async function appendPrompt(cookieHeader, threadId, prompt, expectedModes) {
  const expected = Array.isArray(expectedModes) ? expectedModes : [expectedModes];
  const appended = await requestJson(
    `/api/bp-ask/threads/${threadId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ prompt }),
    },
    cookieHeader,
  );
  const latestMessage = appended.json?.thread?.messages?.at(-1);

  assert(latestMessage?.executionResultId, "消息未暴露 executionResultId");
  assert(
    expected.includes(latestMessage?.executionPreview?.mode),
    `没有进入预期执行结果模式：${expected.join("/")}，实际为 ${latestMessage?.executionPreview?.mode ?? "none"}`,
  );

  return latestMessage;
}

async function getLatestAssistantMetadata(pool, threadId) {
  const rows = await pool.query(
    `select metadata
       from conversation_messages
      where thread_id = $1 and role = 'assistant'
      order by sequence desc
      limit 1`,
    [threadId],
  );

  return rows.rows[0]?.metadata;
}

async function getExecutionPayload(pool, executionResultId) {
  const rows = await pool.query(
    `select task.metadata, result.structured_payload
       from execution_results result
       join execution_tasks task on task.id = result.task_id
      where result.id = $1
      limit 1`,
    [executionResultId],
  );

  assert(rows.rowCount === 1, "没有找到 execution result");
  return {
    metadata: rows.rows[0].metadata,
    payload: rows.rows[0].structured_payload,
  };
}

function buildSeededMessageId(prefix) {
  return `${prefix}-${seed}-${Math.random().toString(16).slice(2, 10)}`;
}

async function seedDocumentSearchFollowup({
  pool,
  threadId,
  queryTitle,
  searchToolRun,
}) {
  const prompt = "我找到了多份相似文档，请回复序号、文档 ID，或再补一句更具体的标题/文件名。";
  const candidates = (searchToolRun.structuredPayload?.candidates ?? [])
    .map((candidate) => ({
      key: "documentId",
      value: candidate.documentId ?? candidate.assetId,
      title: candidate.title,
      subtitle: [candidate.originalFileName, candidate.kind].filter(Boolean).join(" / "),
    }))
    .filter((candidate) => candidate.value && candidate.title)
    .slice(0, 5);

  assert(candidates.length >= 2, "真实 document.search 没有产生多个候选");

  const now = new Date();
  const userContent = `请先搜索「${queryTitle}」文档，等我选择目标文档后，再把它写一下。`;
  const assistantContent = [
    `Dulongkai Cui，${prompt}`,
    ...candidates.map(
      (candidate, index) =>
        `${index + 1}. ${candidate.value}「${candidate.title}」${candidate.subtitle ? ` / ${candidate.subtitle}` : ""}`,
    ),
  ].join("\n");
  const metadata = {
    executionRoute: "capability_steps",
    executionPreview: {
      mode: "simulation",
      title: "需要补充信息",
      summary: "BP问问已匹配 搜索文档，但还缺少必要信息。",
      nextStep: prompt,
      safety: "不会编造对象或参数；补齐信息前不会调用工具。",
      simulatedActions: [
        "读取 capability descriptor",
        "匹配能力 document.search",
        "发现缺少 选择候选文档",
        "等待用户补充信息",
      ],
      changedObjects: [],
      writebackCandidates: candidates.map((candidate, index) => ({
        objectType: "document",
        objectRef: candidate.value,
        operation: `candidate_${index + 1}`,
        proposedValue: `${candidate.title}${candidate.subtitle ? ` / ${candidate.subtitle}` : ""}`,
        requiresConfirmation: false,
        status: "candidate",
      })),
    },
    missingInformationFollowup: {
      capability: {
        name: "document.search",
      },
      missingInformation: ["选择候选文档"],
      prompt,
      candidates,
    },
    modelCapabilityStepPlan: {
      mode: "task",
      taskTitle: "搜索文档并准备写入",
      steps: [
        {
          stepId: "step-1",
          toolName: "document.search",
          args: {
            query: queryTitle,
          },
          purpose: "搜索目标文档",
          requiresPreviousResult: false,
        },
      ],
      missingInformation: ["选择候选文档"],
      followupQuestion: prompt,
      delegateTarget: "",
      delegateReason: "",
      confidence: 95,
      reason: "用户要求先搜索指定文档，选择后写入，当前可先执行搜索步骤。",
    },
    capabilityStepRuns: [
      {
        stepId: "step-1",
        toolName: "document.search",
        purpose: "搜索目标文档",
        status: searchToolRun.status,
        summaryText: searchToolRun.summaryText,
        toolRunCallIds: [searchToolRun.callId],
        changedObjects: searchToolRun.structuredPayload?.changedObjects ?? [],
      },
    ],
    toolRuns: [searchToolRun],
  };

  await pool.query(
    `insert into conversation_messages
      (id, thread_id, role, sequence, content, token_estimate, metadata, created_at, updated_at)
     values
      ($1, $2, 'user', 1, $3, $4, null, $5, $5),
      ($6, $2, 'assistant', 2, $7, $8, $9, $5, $5)`,
    [
      buildSeededMessageId("message-user"),
      threadId,
      userContent,
      Math.ceil(userContent.length / 4),
      now,
      buildSeededMessageId("message-assistant"),
      assistantContent,
      Math.ceil(assistantContent.length / 4),
      metadata,
    ],
  );

  return candidates;
}

function readFollowupCandidates(metadata) {
  const followup = metadata?.missingInformationFollowup;

  assert(followup, "没有记录 missingInformationFollowup");
  assert(
    followup.capability?.name === "document.search",
    `候选追问没有绑定 document.search，实际为 ${followup.capability?.name ?? "none"}`,
  );
  assert(
    Array.isArray(followup.candidates) && followup.candidates.length >= 2,
    "文档搜索没有产生多个候选",
  );

  return followup.candidates;
}

function assertContentFollowup(metadata, selectedDocumentId) {
  assert(metadata?.missingInformationFollowup, "缺内容追问没有记录 missingInformationFollowup");
  assert(
    metadata.missingInformationFollowup.capability?.name === "document.write_content",
    "缺内容追问没有绑定 document.write_content",
  );
  assert(
    metadata.missingInformationFollowup.missingInformation?.some((item) =>
      String(item).toLowerCase().includes("content") || String(item).includes("内容"),
    ),
    "缺内容追问没有指向 content",
  );
  assert(
    metadata.modelCapabilityStepPlan?.steps?.some(
      (step) =>
        step.args?.documentId === selectedDocumentId ||
        step.args?.assetId === selectedDocumentId,
    ),
    "选择候选后 modelCapabilityStepPlan 没有保留目标文档 ID",
  );
  if (metadata.stepSlotFillContinuation) {
    assert(
      metadata.stepSlotFillContinuation.filledKey === "documentId" ||
        metadata.stepSlotFillContinuation.filledKey === "assetId",
      "选择候选后的 stepSlotFillContinuation filledKey 不是 documentId/assetId",
    );
  }
}

function assertFinalDocumentWrite({
  message,
  metadata,
  payload,
  selectedDocumentId,
}) {
  assert(
    message.executionPreview?.mode === "capability_steps_result",
    `最终没有进入 capability_steps_result，实际为 ${message.executionPreview?.mode ?? "none"}`,
  );
  assert(
    message.executionPreview?.toolRuns?.some(
      (toolRun) => toolRun.toolName === "document.write_content",
    ),
    "最终没有调用 document.write_content",
  );
  assert(
    message.executionPreview?.changedObjects?.some((item) =>
      item.includes(`document/${selectedDocumentId}/content`),
    ),
    "最终没有记录目标文档 content changedObject",
  );
  assert(
    metadata?.stepSlotFillContinuation?.filledKey === "content",
    "补内容后没有记录 content stepSlotFillContinuation",
  );
  assert(
    metadata?.modelCapabilityStepPlan?.steps?.some(
      (step) =>
        step.toolName === "document.write_content" &&
        (step.args?.documentId === selectedDocumentId ||
          step.args?.assetId === selectedDocumentId) &&
        typeof step.args?.content === "string" &&
        step.args.content.length > 0,
    ),
    "最终 modelCapabilityStepPlan 没有保留 documentId + content",
  );
  assert(
    payload?.terminalState === "completed",
    `最终 terminalState 不是 completed，实际为 ${payload?.terminalState ?? "none"}`,
  );
  assert(
    payload?.modelCapabilityStepPlanner?.used === true,
    "最终 payload 没有标记 modelCapabilityStepPlanner.used=true",
  );
}

async function main() {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
  });

  try {
    const login = await requestJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "dulongkai.cui@akane.waseda.jp",
        password: "bpai-local-001",
      }),
    });
    const sessionCookie = login.response.headers.get("set-cookie");

    assert(sessionCookie, "登录后未返回会话 cookie");
    const cookieHeader = sessionCookie.split(";")[0];

    const queryTitle = `BPAI BPAsk 文档主链 ${seed}`;
    const firstTitle = `${queryTitle} A`;
    const secondTitle = `${queryTitle} B`;
    const finalContent = `BPAsk document continuation content ${seed}`;

    const firstDocumentRun = await runTool(cookieHeader, "document.create", {
      kind: "document",
      title: firstTitle,
      sampleAssetId: "doc-weekly-001",
    });
    const secondDocumentRun = await runTool(cookieHeader, "document.create", {
      kind: "document",
      title: secondTitle,
      sampleAssetId: "doc-weekly-001",
    });
    const createdDocumentIds = [
      firstDocumentRun.structuredPayload?.document?.id,
      secondDocumentRun.structuredPayload?.document?.id,
    ].filter(Boolean);

    assert(createdDocumentIds.length === 2, "没有创建出两份测试文档");

    const searchDocumentRun = await runTool(cookieHeader, "document.search", {
      kind: "document",
      query: queryTitle,
      limit: 5,
    });
    const threadId = await createThread(cookieHeader, "bp ask document chain smoke");
    await seedDocumentSearchFollowup({
      pool,
      threadId,
      queryTitle,
      searchToolRun: searchDocumentRun,
    });

    const searchMetadata = await getLatestAssistantMetadata(pool, threadId);
    const candidates = readFollowupCandidates(searchMetadata);
    const selectedCandidateIndex = candidates.findIndex((candidate) =>
      createdDocumentIds.includes(candidate.value),
    );

    assert(selectedCandidateIndex >= 0, "搜索候选没有包含新建测试文档");
    const selectedCandidate = candidates[selectedCandidateIndex];
    const selectedDocumentId = selectedCandidate.value;

    await appendPrompt(
      cookieHeader,
      threadId,
      `第${selectedCandidateIndex + 1}份`,
      "simulation",
    );
    const contentFollowupMetadata = await getLatestAssistantMetadata(pool, threadId);

    assertContentFollowup(contentFollowupMetadata, selectedDocumentId);

    const finalMessage = await appendPrompt(
      cookieHeader,
      threadId,
      `写入内容是：${finalContent}`,
      "capability_steps_result",
    );
    const finalMetadata = await getLatestAssistantMetadata(pool, threadId);
    const { payload } = await getExecutionPayload(pool, finalMessage.executionResultId);

    assertFinalDocumentWrite({
      message: finalMessage,
      metadata: finalMetadata,
      payload,
      selectedDocumentId,
    });

    const contentResponse = await request(`/api/assets/document/${selectedDocumentId}/content`);
    const persistedContent = await contentResponse.text();

    assert(contentResponse.ok, "document content route failed");
    assert(persistedContent === finalContent, "BP问问文档写入内容没有真实持久化");

    console.log(
      JSON.stringify(
        {
          ok: true,
          threadId,
          selectedDocumentId,
          createdDocumentIds,
          tested: [
            "bp-ask document.search ambiguous followup",
            "bp-ask document candidate continuation",
            "bp-ask document.write_content content followup",
            "bp-ask document.write_content persistence",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
