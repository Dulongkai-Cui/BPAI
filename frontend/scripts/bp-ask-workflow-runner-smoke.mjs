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
      body: JSON.stringify({ title: "workflow runner smoke" }),
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
          prompt: "让 WO-20260401-001 进入工单受理流程，跑一遍最小流程",
        }),
      },
      cookieHeader,
    );

    const latestMessage = appended.json?.thread?.messages?.at(-1);
    assert(latestMessage?.text?.includes("工单受理流程"), "回复没有进入工作流口径");
    assert(
      latestMessage?.executionPreview?.mode === "workflow_result",
      "executionPreview 不是 workflow_result",
    );

    const taskRows = await pool.query(
      "select id, status, executor_kind, metadata from execution_tasks where thread_id = $1 order by created_at desc limit 1",
      [threadId],
    );
    assert(taskRows.rowCount === 1, "数据库中未找到 execution task");
    assert(taskRows.rows[0].status === "completed", "execution task 未完成");
    assert(taskRows.rows[0].executor_kind === "system", "workflow task executorKind 不正确");
    assert(
      taskRows.rows[0].metadata?.executionRoute === "workflow",
      "execution task 没有记录 workflow 路由",
    );
    assert(
      taskRows.rows[0].metadata?.workflowId === "workflow-work-order-intake",
      "execution task 没有记录工单受理流程",
    );

    const resultRows = await pool.query(
      "select status, summary_text, structured_payload from execution_results where task_id = $1 limit 1",
      [taskRows.rows[0].id],
    );
    assert(resultRows.rowCount === 1, "数据库中未找到 execution result");
    assert(resultRows.rows[0].status === "ready", "execution result 状态不正确");

    const payload = resultRows.rows[0].structured_payload ?? {};
    const workflowRun = payload.workflowRuns?.[0] ?? null;
    const skillRun = payload.skillRuns?.[0] ?? null;
    const toolRun = payload.toolRuns?.[0] ?? null;

    assert(
      workflowRun?.status === "waiting_confirmation",
      "workflowRun 未进入待确认状态",
    );
    assert(workflowRun?.workflowId === "workflow-work-order-intake", "workflowRun id 不正确");
    assert(Array.isArray(workflowRun?.nodeRuns), "workflowRun 未记录节点");
    assert(
      workflowRun.nodeRuns.map((node) => node.nodeId).join(">") ===
        "wo-input>wo-skill>wo-agent>wo-human>wo-output",
      "workflowRun 节点顺序不正确",
    );
    assert(
      workflowRun.nodeRuns.find((node) => node.nodeId === "wo-human")?.status ===
        "waiting_confirmation",
      "人工确认节点不是等待确认状态",
    );
    const agentRun = payload.agentRuns?.[0] ?? workflowRun.agentRuns?.[0] ?? null;
    assert(agentRun?.agentId === "work-order-longxia", "Workflow 未进入工单龙虾承接");
    assert(agentRun?.mode === "dry_run", "工单龙虾不是 dry-run 模式");
    assert(agentRun?.status === "completed", "工单龙虾 dry-run 未完成");
    assert(skillRun?.skillId === "skill-work-order-summary", "Workflow 未调用工单摘要 Skill");
    assert(skillRun?.status === "completed", "工单摘要 Skill 未完成");
    assert(toolRun?.toolName === "work_order.read", "Workflow 未调用 work_order.read");
    assert(toolRun?.status === "completed", "work_order.read 未完成");
    assert(workflowRun?.output?.nextStep, "Workflow 未输出 nextStep");
    assert(
      workflowRun?.output?.confirmationRequests?.length > 0,
      "Workflow 未输出确认请求",
    );
    assert(
      latestMessage?.executionPreview?.confirmationRequests?.length > 0,
      "executionPreview 未展示确认请求",
    );
    assert(
      latestMessage?.executionPreview?.confirmationEvaluation?.state ===
        "waiting_confirmation",
      "executionPreview 未输出待确认评估",
    );
    assert(
      latestMessage?.executionPreview?.writebackCandidates?.length > 0,
      "executionPreview 未展示候选写回",
    );
    assert(latestMessage?.executionResultId, "消息未暴露 executionResultId");

    const firstConfirmation =
      latestMessage.executionPreview.confirmationRequests[0] ?? null;
    assert(firstConfirmation?.requestId, "缺少首个确认请求");

    const confirmed = await requestJson(
      `/api/bp-ask/threads/${threadId}/confirmations`,
      {
        method: "POST",
        body: JSON.stringify({
          executionResultId: latestMessage.executionResultId,
          requestId: firstConfirmation.requestId,
          action: "approve",
        }),
      },
      cookieHeader,
    );

    const updatedLatestMessage = confirmed.json?.thread?.messages?.at(-1);
    const updatedConfirmation =
      updatedLatestMessage?.executionPreview?.confirmationRequests?.find(
        (request) => request.requestId === firstConfirmation.requestId,
      );
    assert(
      updatedConfirmation?.status === "approved",
      "确认请求没有更新为 approved",
    );
    assert(
      updatedLatestMessage?.executionPreview?.confirmationEvaluation?.counts
        ?.approved === 1,
      "确认评估没有统计 approved",
    );

    let latestConfirmedMessage = updatedLatestMessage;
    for (const request of latestMessage.executionPreview.confirmationRequests.slice(1)) {
      const response = await requestJson(
        `/api/bp-ask/threads/${threadId}/confirmations`,
        {
          method: "POST",
          body: JSON.stringify({
            executionResultId: latestMessage.executionResultId,
            requestId: request.requestId,
            action: "approve",
          }),
        },
        cookieHeader,
      );
      latestConfirmedMessage = response.json?.thread?.messages?.at(-1);
    }

    const finalEvaluation =
      latestConfirmedMessage?.executionPreview?.confirmationEvaluation;
    assert(
      finalEvaluation?.state === "ready_to_continue",
      "全部同意后确认评估没有进入 ready_to_continue",
    );
    assert(
      finalEvaluation?.counts?.approved ===
        latestMessage.executionPreview.confirmationRequests.length,
      "全部同意后 approved 统计不正确",
    );

    const continued = await requestJson(
      `/api/bp-ask/threads/${threadId}/continuations`,
      {
        method: "POST",
        body: JSON.stringify({
          executionResultId: latestMessage.executionResultId,
        }),
      },
      cookieHeader,
    );
    const continuedLatestMessage = continued.json?.thread?.messages?.at(-1);
    const postConfirmationRun =
      continuedLatestMessage?.executionPreview?.postConfirmationRun ?? null;
    assert(
      postConfirmationRun?.status === "completed",
      "确认后续跑 dry-run 未完成",
    );
    assert(
      postConfirmationRun?.safeguards?.includes("未调用 OpenClaw sidecar"),
      "确认后续跑 dry-run 缺少 OpenClaw 安全边界",
    );
    assert(
      continuedLatestMessage?.executionPreview?.writebackDrafts?.length === 2,
      "确认后续跑没有展示 2 个写回草案",
    );
    assert(
      continuedLatestMessage.executionPreview.writebackDrafts.every(
        (draft) => draft.status === "draft",
      ),
      "写回草案状态不是 draft",
    );
    assert(
      continuedLatestMessage.executionPreview.confirmationEvaluation?.state ===
        "draft_created",
      "续跑并落库草案后确认评估展示态不正确",
    );
    assert(
      continuedLatestMessage.executionPreview.title === "真实执行：已生成写回草案",
      "续跑并落库草案后标题仍停留在人工确认",
    );
    assert(
      !continuedLatestMessage.executionPreview.summary.includes("等待 5 个确认请求"),
      "续跑并落库草案后执行摘要仍提示等待确认",
    );
    assert(
      !continuedLatestMessage.insight?.summary?.includes("等待 5 个确认请求"),
      "续跑并落库草案后 insight 摘要仍提示等待确认",
    );
    assert(
      !continuedLatestMessage.insight?.findings?.some((finding) =>
        finding.includes("当前停在人工确认节点"),
      ),
      "续跑并落库草案后 insight 重点仍提示停在人工确认节点",
    );
    assert(
      !continuedLatestMessage.executionPreview.confirmationEvaluation.summary.includes(
        "已完成续跑 dry-run。 已完成续跑 dry-run",
      ),
      "确认评估摘要重复展示续跑 dry-run",
    );
    assert(
      continuedLatestMessage.executionPreview.simulatedActions?.includes(
        "人工确认：completed",
      ),
      "续跑后展示态仍未标记人工确认为 completed",
    );
    assert(
      continuedLatestMessage.executionPreview.simulatedActions?.includes(
        "写回草案：draft_created",
      ),
      "续跑后未展示写回草案 draft_created 状态",
    );

    const draftRows = await pool.query(
      "select id, object_type, object_ref, operation, status from execution_writeback_drafts where result_id = $1 order by operation",
      [latestMessage.executionResultId],
    );
    assert(draftRows.rowCount === 2, "数据库中未落库 2 个写回草案");
    assert(
      draftRows.rows.every((row) => row.status === "draft"),
      "数据库写回草案状态不是 draft",
    );

    const firstDraft =
      continuedLatestMessage.executionPreview.writebackDrafts.find(
        (draft) => draft.operation === "draft_next_action",
      ) ?? continuedLatestMessage.executionPreview.writebackDrafts[0];
    const secondDraft =
      continuedLatestMessage.executionPreview.writebackDrafts.find(
        (draft) => draft.draftId !== firstDraft.draftId,
      ) ?? null;
    assert(firstDraft?.draftId, "缺少第一个写回草案");
    assert(secondDraft?.draftId, "缺少第二个写回草案");

    const approvedDraft = await requestJson(
      `/api/bp-ask/threads/${threadId}/writeback-drafts`,
      {
        method: "POST",
        body: JSON.stringify({
          executionResultId: latestMessage.executionResultId,
          draftId: firstDraft.draftId,
          action: "approve",
        }),
      },
      cookieHeader,
    );
    const approvedLatestMessage = approvedDraft.json?.thread?.messages?.at(-1);
    const readyDraft =
      approvedLatestMessage?.executionPreview?.writebackDrafts?.find(
        (draft) => draft.draftId === firstDraft.draftId,
      );
    assert(readyDraft?.status === "ready", "批准后草案未进入 ready 状态");

    const secondApprovedDraft = await requestJson(
      `/api/bp-ask/threads/${threadId}/writeback-drafts`,
      {
        method: "POST",
        body: JSON.stringify({
          executionResultId: latestMessage.executionResultId,
          draftId: secondDraft.draftId,
          action: "approve",
        }),
      },
      cookieHeader,
    );
    const reviewedLatestMessage = secondApprovedDraft.json?.thread?.messages?.at(-1);
    const reviewedDrafts =
      reviewedLatestMessage?.executionPreview?.writebackDrafts ?? [];
    assert(
      reviewedLatestMessage?.executionPreview?.simulatedActions?.includes(
        "写回草案审阅：ready_for_writeback",
      ),
      "草案审阅后未展示 ready_for_writeback 状态",
    );
    assert(
      reviewedDrafts.find((draft) => draft.draftId === firstDraft.draftId)
        ?.status === "ready",
      "最终审阅结果中第一个草案不是 ready",
    );
    assert(
      reviewedDrafts.find((draft) => draft.draftId === secondDraft.draftId)
        ?.status === "ready",
      "最终审阅结果中第二个草案不是 ready",
    );

    const reviewedDraftRows = await pool.query(
      "select id, status from execution_writeback_drafts where result_id = $1 order by operation",
      [latestMessage.executionResultId],
    );
    assert(
      reviewedDraftRows.rows.some(
        (row) => row.id === firstDraft.draftId && row.status === "ready",
      ),
      "数据库中批准草案未进入 ready",
    );
    assert(
      reviewedDraftRows.rows.some(
        (row) => row.id === secondDraft.draftId && row.status === "ready",
      ),
      "数据库中第二个批准草案未进入 ready",
    );

    const firstAppliedDraft = await requestJson(
      `/api/bp-ask/threads/${threadId}/writeback-drafts`,
      {
        method: "POST",
        body: JSON.stringify({
          executionResultId: latestMessage.executionResultId,
          draftId: firstDraft.draftId,
          action: "apply",
        }),
      },
      cookieHeader,
    );
    const firstAppliedLatestMessage = firstAppliedDraft.json?.thread?.messages?.at(-1);
    const firstAppliedWritebackDraft =
      firstAppliedLatestMessage?.executionPreview?.writebackDrafts?.find(
        (draft) => draft.draftId === firstDraft.draftId,
      );
    assert(
      firstAppliedWritebackDraft?.status === "applied",
      "第一次正式写回后草案未进入 applied 状态",
    );
    assert(
      firstAppliedLatestMessage?.executionPreview?.simulatedActions?.includes(
        "正式业务写回：applied",
      ),
      "第一次正式写回后未展示 applied 状态",
    );
    assert(
      firstAppliedLatestMessage?.executionPreview?.changedObjects?.length === 1,
      "第一次正式写回后 changedObjects 未保持 1 个字段路径",
    );

    const secondAppliedDraft = await requestJson(
      `/api/bp-ask/threads/${threadId}/writeback-drafts`,
      {
        method: "POST",
        body: JSON.stringify({
          executionResultId: latestMessage.executionResultId,
          draftId: secondDraft.draftId,
          action: "apply",
        }),
      },
      cookieHeader,
    );
    const appliedLatestMessage = secondAppliedDraft.json?.thread?.messages?.at(-1);
    const appliedDrafts =
      appliedLatestMessage?.executionPreview?.writebackDrafts ?? [];
    assert(
      appliedDrafts.every((draft) => draft.status === "applied"),
      "两次正式写回后仍有草案未进入 applied 状态",
    );
    assert(
      appliedLatestMessage?.executionPreview?.changedObjects?.length === 2,
      "两次正式写回后 changedObjects 未累计为 2 个字段路径",
    );
    assert(
      appliedLatestMessage?.executionPreview?.nextStep?.includes(
        "已正式写回 2 个草案",
      ),
      "两次正式写回后下一步文案未显示累计草案数量",
    );
    assert(
      !appliedLatestMessage?.executionPreview?.postConfirmationRun?.safeguards?.includes(
        "候选写回仍保持 not_applied",
      ),
      "正式写回后 dry-run 安全文案仍显示候选写回 not_applied",
    );

    const appliedDraftRows = await pool.query(
      "select id, status from execution_writeback_drafts where result_id = $1 order by operation",
      [latestMessage.executionResultId],
    );
    assert(
      appliedDraftRows.rows.every((row) => row.status === "applied"),
      "数据库中正式写回草案未全部进入 applied",
    );

    const workOrderAfterApply = await pool.query(
      "select next_action, metadata from work_orders where id = $1",
      [originalWorkOrder.id],
    );
    assert(
      workOrderAfterApply.rows[0]?.next_action === firstDraft.proposedValue,
      "正式写回没有更新 work_orders.next_action",
    );
    assert(
      Array.isArray(workOrderAfterApply.rows[0]?.metadata?.bpAskRiskFollowups),
      "正式写回没有把风险跟进草案写入工单 metadata",
    );

    const openClawRun = await requestJson(
      `/api/bp-ask/threads/${threadId}/openclaw`,
      {
        method: "POST",
        body: JSON.stringify({
          executionResultId: latestMessage.executionResultId,
        }),
      },
      cookieHeader,
    );
    const openClawLatestMessage = openClawRun.json?.thread?.messages?.at(-1);
    const openClawRuns = openClawLatestMessage?.executionPreview?.openClawRuns ?? [];
    assert(openClawRuns.length === 1, "OpenClaw 执行结果未写入 executionPreview");
    assert(
      openClawRuns[0]?.status === "completed",
      `OpenClaw sidecar 未连通：${openClawRuns[0]?.errorCode ?? openClawRuns[0]?.summaryText ?? "unknown"}`,
    );
    assert(
      openClawLatestMessage?.executionPreview?.simulatedActions?.some((action) =>
        action.startsWith("OpenClaw sidecar："),
      ),
      "OpenClaw 执行后未展示 sidecar 状态",
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          threadId,
          previewMode: latestMessage.executionPreview.mode,
          executionRoute: taskRows.rows[0].metadata.executionRoute,
          workflowId: workflowRun.workflowId,
          workflowStatus: workflowRun.status,
          nodes: workflowRun.nodeRuns.map((node) => node.nodeTitle),
          confirmationCount: workflowRun.output.confirmationRequests.length,
          writebackCandidateCount: workflowRun.output.writebackCandidates.length,
          confirmedRequestId: firstConfirmation.requestId,
          confirmedStatus: updatedConfirmation.status,
          finalConfirmationState: finalEvaluation.state,
          finalDisplayState:
            continuedLatestMessage.executionPreview.confirmationEvaluation.state,
          postConfirmationRunStatus: postConfirmationRun.status,
          writebackDraftCount: draftRows.rowCount,
          writebackDraftStatuses: draftRows.rows.map((row) => row.status),
          reviewedWritebackDraftStatuses: reviewedDraftRows.rows.map(
            (row) => row.status,
          ),
          appliedWritebackDraftStatuses: appliedDraftRows.rows.map(
            (row) => row.status,
          ),
          changedObjects: appliedLatestMessage.executionPreview.changedObjects,
          openClawRunStatuses: openClawRuns.map((run) => run.status),
          openClawErrorCodes: openClawRuns.map((run) => run.errorCode ?? null),
          openClawSubmitModes: openClawRuns.map((run) =>
            run.submitEnabled ? "submitted" : "probe_only",
          ),
          agentId: agentRun.agentId,
          agentMode: agentRun.mode,
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
