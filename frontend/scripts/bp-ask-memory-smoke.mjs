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
      body: JSON.stringify({}),
    },
    cookieHeader,
  );

  const threadId = created.json?.thread?.id;
  assert(threadId, "未创建出对话线程");

  const prompt = "请帮我整理仓储运营区最近一周的缺项重点。";

  const preview = await requestJson(
    "/api/bp-ask/dispatch",
    {
      method: "POST",
      body: JSON.stringify({
        threadId,
        prompt,
      }),
    },
    cookieHeader,
  );

  assert(preview.json?.decision?.primaryIntent, "dispatch 未返回 primaryIntent");
  assert(preview.json?.decision?.targetDomain, "dispatch 未返回 targetDomain");
  assert(preview.json?.decision?.executionMode, "dispatch 未返回 executionMode");
  assert(
    Array.isArray(preview.json?.decision?.toolHints),
    "dispatch 未返回 toolHints",
  );
  assert(
    Array.isArray(preview.json?.decision?.memoryScopes),
    "dispatch 未返回 memoryScopes",
  );
  assert(preview.json?.insight?.summary, "dispatch 未返回 insight summary");

  const appended = await requestJson(
    `/api/bp-ask/threads/${threadId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        prompt,
      }),
    },
    cookieHeader,
  );

  assert(
    appended.json?.thread?.messages?.length === 2,
    "线程消息数量不符合预期",
  );
  assert(appended.json?.thread?.rollingSummary, "未生成滚动摘要");

  const detail = await requestJson(
    `/api/bp-ask/threads/${threadId}`,
    {
      method: "GET",
    },
    cookieHeader,
  );

  assert(detail.json?.thread?.id === threadId, "线程详情读取失败");
  assert(detail.json?.thread?.messages?.length === 2, "详情消息数量不正确");

  const pool = new pg.Pool({
    connectionString: databaseUrl,
  });

  try {
    const threadRows = await pool.query(
      "select id, title from conversation_threads where id = $1",
      [threadId],
    );
    assert(threadRows.rowCount === 1, "数据库中未找到对话线程");

    const messageRows = await pool.query(
      "select count(*)::int as count from conversation_messages where thread_id = $1",
      [threadId],
    );
    assert(messageRows.rows[0]?.count === 2, "数据库消息数量不正确");

    const summaryRows = await pool.query(
      "select count(*)::int as count from conversation_summaries where thread_id = $1 and kind = 'rolling'",
      [threadId],
    );
    assert(summaryRows.rows[0]?.count >= 1, "数据库中未生成滚动摘要");

    const memoryRows = await pool.query(
      "select count(*)::int as count from memory_facts where thread_id = $1",
      [threadId],
    );
    assert(memoryRows.rows[0]?.count >= 3, "数据库中未写入记忆事实");

    const taskRows = await pool.query(
      "select metadata from execution_tasks where thread_id = $1 order by created_at desc limit 1",
      [threadId],
    );
    assert(taskRows.rowCount >= 1, "数据库中未写入 execution task");

    const latestMetadata = taskRows.rows[0]?.metadata ?? {};
    assert(latestMetadata.priority, "execution task metadata 未写入 priority");
    assert(
      Array.isArray(latestMetadata.toolHints),
      "execution task metadata 未写入 toolHints",
    );
    assert(
      Array.isArray(latestMetadata.memoryScopes),
      "execution task metadata 未写入 memoryScopes",
    );

    const resultRows = await pool.query(
      "select count(*)::int as count from execution_results where task_id in (select id from execution_tasks where thread_id = $1)",
      [threadId],
    );
    assert(resultRows.rows[0]?.count >= 1, "数据库中未写入 execution result");

    console.log(
      JSON.stringify(
        {
          ok: true,
          threadId,
          title: threadRows.rows[0]?.title ?? "",
          messageCount: messageRows.rows[0]?.count ?? 0,
          summaryCount: summaryRows.rows[0]?.count ?? 0,
          memoryFactCount: memoryRows.rows[0]?.count ?? 0,
          executionTaskCount: taskRows.rowCount ?? 0,
          executionResultCount: resultRows.rows[0]?.count ?? 0,
          dispatchPrimaryIntent: preview.json?.decision?.primaryIntent ?? null,
          dispatchTargetDomain: preview.json?.decision?.targetDomain ?? null,
          dispatchExecutionMode: preview.json?.decision?.executionMode ?? null,
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
