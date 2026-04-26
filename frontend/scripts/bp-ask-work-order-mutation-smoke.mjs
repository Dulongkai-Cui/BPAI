import process from "node:process";

import pg from "pg";

const baseUrl = process.env.BPAI_BASE_URL ?? "http://localhost:3001";
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://bpai:bpai@localhost:5433/bpai_dev";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson(path, init = {}, cookie = "") {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers ?? {}),
    },
  });

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

async function appendPrompt(
  cookieHeader,
  threadId,
  prompt,
  expectedMode = "writeback_result",
) {
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
    latestMessage?.executionPreview?.mode === expectedMode,
    `没有进入预期执行结果模式：${expectedMode}`,
  );

  return latestMessage;
}

function findDraftByOperation(preview, operation) {
  const draft = preview?.writebackDrafts?.find(
    (item) => item.operation === operation,
  );

  assert(draft, `没有生成 ${operation} 写回草案`);
  return draft;
}

async function main() {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
  });
  const seeded = await pool.query(
    "select id, priority, stage, status, archived_at, metadata from work_orders where work_order_no = $1 limit 1",
    ["WO-20260401-001"],
  );

  assert(
    seeded.rowCount === 1,
    "缺少 demo 工单 WO-20260401-001，请先运行 npm run db:seed:work-orders",
  );

  const originalWorkOrder = seeded.rows[0];
  const threadIds = [];
  const createdWorkOrderIds = [];
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

  try {
    const updateThreadId = await createThread(cookieHeader, "work order mutation smoke");
    threadIds.push(updateThreadId);

    const updateMessage = await appendPrompt(
      cookieHeader,
      updateThreadId,
      "把 WO-20260401-001 的优先级改成高，阶段改成回单资料，状态改成等待中",
    );
    const updatePreview = updateMessage.executionPreview;
    const priorityDraft = findDraftByOperation(updatePreview, "draft_priority");
    const stageDraft = findDraftByOperation(updatePreview, "draft_stage");
    const statusDraft = findDraftByOperation(updatePreview, "draft_status");

    assert(priorityDraft.proposedValue === "high", "优先级草案值不是 high");
    assert(stageDraft.proposedValue === "return_sheet", "阶段草案值不是 return_sheet");
    assert(statusDraft.proposedValue === "waiting", "状态草案值不是 waiting");
    assert(
      [priorityDraft, stageDraft, statusDraft].every(
        (draft) => draft.status === "applied",
      ),
      "直接执行后优先级/阶段/状态草案应自动进入 applied",
    );

    const latestUpdatePreview = updatePreview;

    const afterUpdateApply = await pool.query(
      "select priority, stage, status from work_orders where id = $1",
      [originalWorkOrder.id],
    );
    assert(afterUpdateApply.rows[0]?.priority === "high", "正式写回没有修改 priority");
    assert(
      afterUpdateApply.rows[0]?.stage === "return_sheet",
      "正式写回没有修改 stage",
    );
    assert(afterUpdateApply.rows[0]?.status === "waiting", "正式写回没有修改 status");
    assert(
      latestUpdatePreview?.changedObjects?.some((item) =>
        item.includes("work_orders.priority"),
      ),
      "正式写回后没有记录 priority changedObjects",
    );
    assert(
      latestUpdatePreview?.changedObjects?.some((item) =>
        item.includes("work_orders.stage"),
      ),
      "正式写回后没有记录 stage changedObjects",
    );
    assert(
      latestUpdatePreview?.changedObjects?.some((item) =>
        item.includes("work_orders.status"),
      ),
      "正式写回后没有记录 status changedObjects",
    );

    const archiveThreadId = await createThread(
      cookieHeader,
      "work order archive smoke",
    );
    threadIds.push(archiveThreadId);
    const archiveMessage = await appendPrompt(
      cookieHeader,
      archiveThreadId,
      "把 WO-20260401-001 归档",
    );
    const archiveDraft = findDraftByOperation(
      archiveMessage.executionPreview,
      "archive_work_order",
    );

    assert(
      archiveDraft.status === "applied",
      "直接归档后草案应自动进入 applied",
    );
    const archivePreview = archiveMessage.executionPreview;
    const afterArchiveApply = await pool.query(
      "select status, archived_at from work_orders where id = $1",
      [originalWorkOrder.id],
    );

    assert(afterArchiveApply.rows[0]?.status === "archived", "归档没有修改 status");
    assert(afterArchiveApply.rows[0]?.archived_at, "归档没有写入 archived_at");
    assert(
      archivePreview?.changedObjects?.some((item) =>
        item.includes("work_orders.archived_at"),
      ),
      "归档后没有记录 archived_at changedObjects",
    );

    const createThreadId = await createThread(cookieHeader, "work order create smoke");
    threadIds.push(createThreadId);
    const createMessage = await appendPrompt(
      cookieHeader,
      createThreadId,
      "新建一个核心机房巡检工单，优先级高",
      "tool_result",
    );
    const createPreview = createMessage.executionPreview;

    assert(createPreview?.mode === "tool_result", "新建工单没有进入真实工具结果模式");
    assert(
      createPreview?.title?.includes("已创建工单"),
      "新建工单没有展示创建成功标题",
    );
    assert(
      createPreview?.changedObjects?.some((item) => item.endsWith("/created")),
      "新建工单没有记录 created changedObjects",
    );

    const createdNo = createPreview.changedObjects
      .find((item) => item.endsWith("/created"))
      ?.split("/")[1];

    assert(createdNo, "没有从 changedObjects 中拿到新建工单号");

    const createdRows = await pool.query(
      "select id, title, priority from work_orders where work_order_no = $1 limit 1",
      [createdNo],
    );

    assert(createdRows.rowCount === 1, "新建工单没有真实写入 work_orders");
    assert(
      createdRows.rows[0]?.title?.includes("核心机房巡检工单"),
      "新建工单标题不符合预期",
    );
    assert(createdRows.rows[0]?.priority === "high", "新建工单优先级不符合预期");
    createdWorkOrderIds.push(createdRows.rows[0].id);

    console.log(
      JSON.stringify(
        {
          ok: true,
          updateThreadId,
          archiveThreadId,
          createThreadId,
          updateExecutionResultId: updateMessage.executionResultId,
          archiveExecutionResultId: archiveMessage.executionResultId,
          createExecutionResultId: createMessage.executionResultId,
          updatedFields: afterUpdateApply.rows[0],
          archivedAt: afterArchiveApply.rows[0].archived_at,
          createdWorkOrderNo: createdNo,
          updateChangedObjects: latestUpdatePreview.changedObjects,
          archiveChangedObjects: archivePreview.changedObjects,
          createChangedObjects: createPreview.changedObjects,
        },
        null,
        2,
      ),
    );
  } finally {
    for (const threadId of threadIds) {
      await pool.query("delete from conversation_threads where id = $1", [threadId]);
    }
    for (const workOrderId of createdWorkOrderIds) {
      await pool.query("delete from work_orders where id = $1", [workOrderId]);
    }
    await pool.query(
      "update work_orders set priority = $1, stage = $2, status = $3, archived_at = $4, metadata = $5, updated_at = now() where id = $6",
      [
        originalWorkOrder.priority,
        originalWorkOrder.stage,
        originalWorkOrder.status,
        originalWorkOrder.archived_at,
        originalWorkOrder.metadata,
        originalWorkOrder.id,
      ],
    );
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
