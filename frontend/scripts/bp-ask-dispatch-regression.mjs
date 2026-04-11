import process from "node:process";
import assert from "node:assert/strict";

import pg from "pg";

const baseUrl = process.env.BPAI_BASE_URL ?? "http://localhost:3001";
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://bpai:bpai@localhost:5433/bpai_dev";

const cases = [
  {
    id: "small_talk_hello",
    prompt: "你好",
    expected: {
      primaryIntent: "chat_general",
      targetDomain: "bp_ask",
      executionMode: "answer_directly",
    },
  },
  {
    id: "meta_chat_identity",
    prompt: "你是谁",
    expected: {
      primaryIntent: "help_meta",
      targetDomain: "bp_ask",
      executionMode: "answer_directly",
    },
  },
  {
    id: "ordinary_chat",
    prompt: "为什么要先做计划再执行？",
    expected: {
      primaryIntent: "chat_general",
      targetDomain: "bp_ask",
      executionMode: "answer_directly",
    },
  },
  {
    id: "help_meta",
    prompt: "你能做什么？",
    expected: {
      primaryIntent: "help_meta",
      targetDomain: "bp_ask",
      executionMode: "answer_directly",
    },
  },
  {
    id: "status_query",
    prompt: "查一下 WO-20240101 现在是什么状态",
    expected: {
      primaryIntent: "status_query",
      targetDomain: "work_order",
      executionMode: "retrieve_then_answer",
    },
  },
  {
    id: "query_collaboration_pending_comments",
    prompt: "查看桥梁送审联动区还有哪些待确认意见",
    expected: {
      primaryIntent: "status_query",
      targetDomain: "collaboration_space",
      executionMode: "retrieve_then_answer",
    },
  },
  {
    id: "query_collaboration_recent_pending_comments",
    prompt: "查看桥梁送审联动区最近一周还有哪些待确认意见",
    expected: {
      primaryIntent: "status_query",
      targetDomain: "collaboration_space",
      executionMode: "retrieve_then_answer",
    },
  },
  {
    id: "query_collaboration_single_domain_not_cross",
    prompt: "查看桥梁送审联动区当前有哪些待确认意见，同时看看最近一周新增了哪些",
    expected: {
      primaryIntent: "status_query",
      targetDomain: "collaboration_space",
      executionMode: "retrieve_then_answer",
    },
  },
  {
    id: "query_form_missing_items",
    prompt: "查看 材料缺项表 还有哪些未补齐项",
    expected: {
      primaryIntent: "status_query",
      targetDomain: "system_form",
      executionMode: "retrieve_then_answer",
    },
  },
  {
    id: "lookup_document",
    prompt: "找到 望城北区工程周报.docx 在哪",
    expected: {
      primaryIntent: "lookup_entity",
      targetDomain: "document_space",
      executionMode: "retrieve_then_answer",
    },
  },
  {
    id: "query_document_status",
    prompt: "看下 现场记录.docx 最近更新情况",
    expected: {
      primaryIntent: "status_query",
      targetDomain: "document_space",
      executionMode: "retrieve_then_answer",
    },
  },
  {
    id: "lookup_form",
    prompt: "找到 材料缺项表 在哪一个系统表单里",
    expected: {
      primaryIntent: "lookup_entity",
      targetDomain: "system_form",
      executionMode: "retrieve_then_answer",
    },
  },
  {
    id: "lookup_work_order",
    prompt: "找到 WO-20240101 这个工单",
    expected: {
      primaryIntent: "lookup_entity",
      targetDomain: "work_order",
      executionMode: "retrieve_then_answer",
    },
  },
  {
    id: "lookup_engineering_team",
    prompt: "找到 李工 所在的工程队",
    expected: {
      primaryIntent: "lookup_entity",
      targetDomain: "engineering_team",
      executionMode: "retrieve_then_answer",
    },
  },
  {
    id: "summarize",
    prompt: "帮我总结 仓储运营区 最近一周 的缺项重点",
    expected: {
      primaryIntent: "summarize",
      targetDomain: "collaboration_space",
      executionMode: "retrieve_and_summarize",
    },
  },
  {
    id: "readonly_document_summary",
    prompt: "先不要改，帮我总结 现场记录.docx 的要点",
    expected: {
      primaryIntent: "summarize",
      targetDomain: "document_space",
      executionMode: "retrieve_and_summarize",
    },
  },
  {
    id: "compare",
    prompt: "比较 WO-20240101 和 WO-20240102 的差异",
    expected: {
      primaryIntent: "compare",
      targetDomain: "work_order",
      executionMode: "retrieve_and_summarize",
    },
  },
  {
    id: "analyze",
    prompt: "分析 长沙市 地图上的预警点 风险",
    expected: {
      primaryIntent: "analyze",
      targetDomain: "map_dashboard",
      executionMode: "retrieve_and_summarize",
    },
  },
  {
    id: "create_object",
    prompt: "在 核心机房 新建一个 材料缺项表",
    expected: {
      primaryIntent: "create_object",
      targetDomain: "system_form",
      executionMode: "create_and_route",
    },
  },
  {
    id: "update_object",
    prompt: "修改 现场记录.docx 的标题",
    expected: {
      primaryIntent: "update_object",
      targetDomain: "document_space",
      executionMode: "draft_only",
    },
  },
  {
    id: "delete_object",
    prompt: "删除 现场记录.docx",
    expected: {
      primaryIntent: "delete_object",
      targetDomain: "document_space",
      executionMode: "write_restricted",
    },
  },
  {
    id: "assign",
    prompt: "把 WO-20240101 分配给 李工",
    expected: {
      primaryIntent: "assign",
      targetDomain: "work_order",
      executionMode: "write_restricted",
    },
  },
  {
    id: "permission_change",
    prompt: "把 李工 加入 桥梁送审联动区 并改成 owner 权限",
    expected: {
      primaryIntent: "permission_change",
      targetDomain: "permission_system",
      executionMode: "write_restricted",
    },
  },
  {
    id: "memory_query",
    prompt: "你还记得我上次说过什么吗",
    expected: {
      primaryIntent: "chat_general",
      targetDomain: "bp_ask",
      executionMode: "answer_directly",
    },
  },
  {
    id: "memory_write",
    prompt: "记住 以后回复都先给结论再给细节",
    expected: {
      primaryIntent: "memory_write",
      targetDomain: "bp_ask",
      executionMode: "write_safe",
    },
  },
  {
    id: "workflow_execute",
    prompt: "把 WO-20240101 联动执行",
    expected: {
      primaryIntent: "workflow_execute",
      targetDomain: "work_order",
      executionMode: "start_workflow",
    },
  },
  {
    id: "readonly_status_query_not_workflow_or_write",
    prompt: "只读查看 WO-20240101 最近更新，不要改",
    expected: {
      primaryIntent: "status_query",
      targetDomain: "work_order",
      executionMode: "retrieve_then_answer",
    },
  },
  {
    id: "agent_delegate",
    prompt: "把 WO-20240101 交给龙虾处理",
    expected: {
      primaryIntent: "agent_delegate",
      targetDomain: "work_order",
      executionMode: "delegate_to_longxia",
    },
  },
  {
    id: "needs_followup",
    prompt: "帮我分配一下",
    expected: {
      primaryIntent: "clarification",
      targetDomain: "bp_ask",
      executionMode: "ask_followup",
    },
    expectsFollowup: true,
  },
  {
    id: "needs_followup_handle_this",
    prompt: "帮我处理一下这个",
    expected: {
      primaryIntent: "clarification",
      targetDomain: "bp_ask",
      executionMode: "ask_followup",
    },
    expectsFollowup: true,
  },
  {
    id: "needs_followup_arrange_this",
    prompt: "你帮我安排一下",
    expected: {
      primaryIntent: "clarification",
      targetDomain: "bp_ask",
      executionMode: "ask_followup",
    },
    expectsFollowup: true,
  },
];

function invariant(condition, message) {
  assert.equal(Boolean(condition), true, message);
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

  return { json, response };
}

function pickDecision(decision) {
  return {
    primaryIntent: decision?.primaryIntent ?? null,
    targetDomain: decision?.targetDomain ?? null,
    executionMode: decision?.executionMode ?? null,
  };
}

function assertDecisionShape(result, id) {
  invariant(result?.executionPreview, `${id}: missing executionPreview`);
  invariant(result.executionPreview?.mode === "simulation", `${id}: executionPreview must be simulation`);
  invariant(typeof result.executionPreview?.summary === "string", `${id}: executionPreview summary missing`);
  invariant(typeof result.assistantText === "string", `${id}: missing assistantText`);
  invariant(result?.insight && typeof result.insight.summary === "string", `${id}: missing insight`);
  invariant(Array.isArray(result?.decision?.toolHints), `${id}: toolHints must be array`);
  invariant(Array.isArray(result?.decision?.memoryScopes), `${id}: memoryScopes must be array`);
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
  invariant(sessionCookie, "login: missing session cookie");
  const cookieHeader = sessionCookie.split(";")[0];

  const created = await requestJson(
    "/api/bp-ask/threads",
    {
      method: "POST",
      body: JSON.stringify({ title: "dispatch regression" }),
    },
    cookieHeader,
  );

  const threadId = created.json?.thread?.id;
  invariant(threadId, "thread: missing thread id");

  const pool = new pg.Pool({
    connectionString: databaseUrl,
  });

  try {
    const results = [];

    for (const testCase of cases) {
      const preview = await requestJson(
        "/api/bp-ask/dispatch",
        {
          method: "POST",
          body: JSON.stringify({
            threadId,
            prompt: testCase.prompt,
          }),
        },
        cookieHeader,
      );

      assertDecisionShape(preview.json, testCase.id);
      assert.deepEqual(
        pickDecision(preview.json.decision),
        testCase.expected,
        `${testCase.id}: unexpected dispatch decision`,
      );

      if (testCase.expectsFollowup) {
        invariant(
          typeof preview.json.decision.followupQuestion === "string" &&
            preview.json.decision.followupQuestion.trim(),
          `${testCase.id}: expected followupQuestion`,
        );
      }

      results.push({
        id: testCase.id,
        prompt: testCase.prompt,
        ...pickDecision(preview.json.decision),
        confidence: preview.json.decision.confidence ?? null,
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          caseCount: results.length,
          results,
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
  console.error("bp-ask-dispatch-regression: FAIL");
  console.error(error);
  process.exit(1);
});
