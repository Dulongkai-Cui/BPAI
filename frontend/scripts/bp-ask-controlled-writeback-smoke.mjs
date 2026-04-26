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

async function main() {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
  });
  const seeded = await pool.query(
    "select id, next_action, metadata from work_orders where work_order_no = $1 limit 1",
    ["WO-20260401-001"],
  );

  assert(
    seeded.rowCount === 1,
    "缺少 demo 工单 WO-20260401-001，请先运行 npm run db:seed:work-orders",
  );

  const originalWorkOrder = seeded.rows[0];
  const proposedNextAction = `M1 受控写回 smoke ${Date.now()}`;
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
  const created = await requestJson(
    "/api/bp-ask/threads",
    {
      method: "POST",
      body: JSON.stringify({ title: "controlled writeback smoke" }),
    },
    cookieHeader,
  );
  const threadId = created.json?.thread?.id;

  assert(threadId, "未创建出对话线程");

  try {
    const appended = await requestJson(
      `/api/bp-ask/threads/${threadId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          prompt: `先生成写回草案，不要直接改：把 WO-20260401-001 的下一步改成：${proposedNextAction}`,
        }),
      },
      cookieHeader,
    );
    const latestMessage = appended.json?.thread?.messages?.at(-1);
    const preview = latestMessage?.executionPreview;

    assert(latestMessage?.executionResultId, "消息未暴露 executionResultId");
    assert(preview?.mode === "writeback_result", "没有进入受控写回结果模式");
    assert(
      preview?.title?.includes("受控写回草案"),
      "回复没有明确展示写回草案",
    );
    assert(
      preview?.writebackCandidates?.length === 1,
      "没有生成 1 个候选写回",
    );
    assert(
      preview.writebackCandidates[0].operation === "draft_next_action",
      "候选写回不是下一步字段",
    );
    assert(
      preview.writebackCandidates[0].proposedValue === proposedNextAction,
      "候选写回值不等于用户要求的下一步",
    );
    assert(preview.writebackDrafts?.length === 1, "没有创建 1 个写回草案");
    assert(
      preview.writebackDrafts[0].status === "draft",
      "新建草案不是 draft 状态",
    );
    assert(
      preview.toolRuns?.some((toolRun) => toolRun.toolName === "work_order.read"),
      "没有先读取工单校验",
    );
    assert(
      preview.toolRuns?.some(
        (toolRun) => toolRun.toolName === "work_order.writeback_draft.create",
      ),
      "没有调用写回草案工具",
    );

    const taskRows = await pool.query(
      "select id, status, executor_kind, metadata from execution_tasks where thread_id = $1 order by created_at desc limit 1",
      [threadId],
    );
    assert(taskRows.rowCount === 1, "数据库中未找到 execution task");
    assert(taskRows.rows[0].status === "completed", "写回 task 未完成");
    assert(
      taskRows.rows[0].executor_kind === "system",
      "写回 task executorKind 应为 system",
    );
    assert(
      taskRows.rows[0].metadata?.executionRoute === "writeback_draft",
      "execution task 没有记录 writeback_draft 路由",
    );

    const draftId = preview.writebackDrafts[0].draftId;
    const draftRows = await pool.query(
      "select id, status, proposed_value from execution_writeback_drafts where result_id = $1",
      [latestMessage.executionResultId],
    );
    assert(draftRows.rowCount === 1, "数据库中未落库写回草案");
    assert(draftRows.rows[0].id === draftId, "数据库草案 id 与前端不一致");
    assert(draftRows.rows[0].status === "draft", "数据库草案不是 draft");
    assert(
      draftRows.rows[0].proposed_value === proposedNextAction,
      "数据库草案值不等于用户要求的下一步",
    );

    const beforeApply = await pool.query(
      "select next_action from work_orders where id = $1",
      [originalWorkOrder.id],
    );
    assert(
      beforeApply.rows[0]?.next_action === originalWorkOrder.next_action,
      "草案阶段不应修改 work_orders.next_action",
    );

    const approvedDraft = await requestJson(
      `/api/bp-ask/threads/${threadId}/writeback-drafts`,
      {
        method: "POST",
        body: JSON.stringify({
          executionResultId: latestMessage.executionResultId,
          draftId,
          action: "approve",
        }),
      },
      cookieHeader,
    );
    const readyDraft =
      approvedDraft.json?.thread?.messages
        ?.at(-1)
        ?.executionPreview?.writebackDrafts?.find(
          (draft) => draft.draftId === draftId,
        );
    assert(readyDraft?.status === "ready", "批准后草案未进入 ready");

    const appliedDraft = await requestJson(
      `/api/bp-ask/threads/${threadId}/writeback-drafts`,
      {
        method: "POST",
        body: JSON.stringify({
          executionResultId: latestMessage.executionResultId,
          draftId,
          action: "apply",
        }),
      },
      cookieHeader,
    );
    const appliedPreview =
      appliedDraft.json?.thread?.messages?.at(-1)?.executionPreview;
    const appliedWritebackDraft = appliedPreview?.writebackDrafts?.find(
      (draft) => draft.draftId === draftId,
    );

    assert(
      appliedWritebackDraft?.status === "applied",
      "正式写回后草案未进入 applied",
    );
    assert(
      appliedPreview?.changedObjects?.some((item) =>
        item.includes("work_orders.next_action"),
      ),
      "正式写回后没有记录 changedObjects",
    );

    const afterApply = await pool.query(
      "select next_action from work_orders where id = $1",
      [originalWorkOrder.id],
    );
    assert(
      afterApply.rows[0]?.next_action === proposedNextAction,
      "正式写回没有更新 work_orders.next_action",
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          threadId,
          executionRoute: taskRows.rows[0].metadata.executionRoute,
          executionResultId: latestMessage.executionResultId,
          draftId,
          proposedNextAction,
          previewMode: preview.mode,
          draftStatus: appliedWritebackDraft.status,
          changedObjects: appliedPreview.changedObjects,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.query("delete from conversation_threads where id = $1", [threadId]);
    await pool.query(
      "update work_orders set next_action = $1, metadata = $2, updated_at = now() where id = $3",
      [
        originalWorkOrder.next_action,
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
