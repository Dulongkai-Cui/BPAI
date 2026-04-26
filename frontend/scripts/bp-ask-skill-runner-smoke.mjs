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
    "select id from work_orders where work_order_no = $1 limit 1",
    ["WO-20260401-001"],
  );
  assert(
    seeded.rowCount === 1,
    "缺少 demo 工单 WO-20260401-001，请先运行 npm run db:seed:work-orders",
  );

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
      body: JSON.stringify({ title: "skill runner smoke" }),
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
          prompt: "查一下 WO-20260401-001 当前状态，并总结下一步",
        }),
      },
      cookieHeader,
    );

    const latestMessage = appended.json?.thread?.messages?.at(-1);
    assert(latestMessage?.text?.includes("工单摘要 Skill"), "回复没有进入 Skill 口径");
    assert(
      latestMessage?.executionPreview?.mode === "skill_result",
      "executionPreview 不是 skill_result",
    );

    const taskRows = await pool.query(
      "select id, status, metadata from execution_tasks where thread_id = $1 order by created_at desc limit 1",
      [threadId],
    );
    assert(taskRows.rowCount === 1, "数据库中未找到 execution task");
    assert(taskRows.rows[0].status === "completed", "execution task 未完成");
    assert(
      taskRows.rows[0].metadata?.executionRoute === "skill",
      "execution task 没有记录 skill 路由",
    );
    assert(
      taskRows.rows[0].metadata?.skillId === "skill-work-order-summary",
      "execution task 没有记录工单摘要 Skill",
    );

    const resultRows = await pool.query(
      "select status, summary_text, structured_payload from execution_results where task_id = $1 limit 1",
      [taskRows.rows[0].id],
    );
    assert(resultRows.rowCount === 1, "数据库中未找到 execution result");
    assert(resultRows.rows[0].status === "ready", "execution result 状态不正确");

    const payload = resultRows.rows[0].structured_payload ?? {};
    const skillRun = payload.skillRuns?.[0] ?? null;
    const toolRun = payload.toolRuns?.[0] ?? null;

    assert(skillRun?.status === "completed", "skillRun 未完成");
    assert(skillRun?.skillId === "skill-work-order-summary", "skillRun id 不正确");
    assert(toolRun?.toolName === "work_order.read", "Skill 未调用 work_order.read");
    assert(toolRun?.status === "completed", "work_order.read 未完成");
    assert(skillRun?.output?.summary, "Skill 未输出 summary");
    assert(Array.isArray(skillRun?.output?.risks), "Skill 未输出 risks");
    assert(skillRun?.output?.nextStep, "Skill 未输出 nextStep");

    console.log(
      JSON.stringify(
        {
          ok: true,
          threadId,
          previewMode: latestMessage.executionPreview.mode,
          executionRoute: taskRows.rows[0].metadata.executionRoute,
          skillId: skillRun.skillId,
          toolName: toolRun.toolName,
          resultSummary: resultRows.rows[0].summary_text,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.query("delete from conversation_threads where id = $1", [threadId]);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
