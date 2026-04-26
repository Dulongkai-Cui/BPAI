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
    `没有进入预期执行结果模式：${expectedMode}，实际为 ${latestMessage?.executionPreview?.mode ?? "none"}`,
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

async function assertPlannerMetadata(pool, executionResultId) {
  const rows = await pool.query(
    `select task.metadata, result.structured_payload
       from execution_results result
       join execution_tasks task on task.id = result.task_id
      where result.id = $1
      limit 1`,
    [executionResultId],
  );
  const metadata = rows.rows[0]?.metadata;
  const payload = rows.rows[0]?.structured_payload;

  assert(metadata, "没有找到 execution task metadata");
  assert(
    typeof metadata.modelToolPlannerAttempted === "boolean",
    "execution task metadata 缺少 modelToolPlannerAttempted",
  );
  assert(
    typeof metadata.modelToolPlanUsed === "boolean",
    "execution task metadata 缺少 modelToolPlanUsed",
  );
  assert(
    payload?.modelToolPlanner &&
      typeof payload.modelToolPlanner.attempted === "boolean" &&
      typeof payload.modelToolPlanner.used === "boolean",
    "execution result payload 缺少 modelToolPlanner 状态",
  );
}

async function main() {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
  });
  const seeded = await pool.query(
    "select id, title, source_summary, project_name, site_name, site_address, current_responsible_team, latest_progress_summary, next_action, material_completeness, missing_item_count, blocking_item_count, warning_status, priority, stage, status, archived_at, metadata from work_orders where work_order_no = $1 limit 1",
    ["WO-20260401-001"],
  );

  assert(
    seeded.rowCount === 1,
    "缺少 demo 工单 WO-20260401-001，请先运行 npm run db:seed:work-orders",
  );

  const originalWorkOrder = seeded.rows[0];
  const naturalSeeded = await pool.query(
    "select id, stage, warning_status, status, latest_progress_summary, next_action, metadata from work_orders where work_order_no = $1 limit 1",
    ["WO-20260401-005"],
  );
  const originalNaturalWorkOrder = naturalSeeded.rows[0];
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

    const titleOnlyThreadId = await createThread(
      cookieHeader,
      "work order title-only mutation smoke",
    );
    threadIds.push(titleOnlyThreadId);
    const titleOnlyMessage = await appendPrompt(
      cookieHeader,
      titleOnlyThreadId,
      "把 WO-20260401-001 的标题改成测试强执行工单",
    );
    const titleOnlyDraft = findDraftByOperation(
      titleOnlyMessage.executionPreview,
      "draft_title",
    );

    assert(titleOnlyDraft.status === "applied", "单字段标题修改应直接 applied");
    const afterTitleOnly = await pool.query(
      "select title from work_orders where id = $1",
      [originalWorkOrder.id],
    );
    assert(
      afterTitleOnly.rows[0]?.title === "测试强执行工单",
      "单字段标题修改没有真实写入 work_orders",
    );
    assert(
      titleOnlyMessage.executionPreview?.changedObjects?.some((item) =>
        item.includes("work_orders.title"),
      ),
      "单字段标题修改没有记录 title changedObjects",
    );
    await assertPlannerMetadata(pool, titleOnlyMessage.executionResultId);

    const stepPlannerThreadId = await createThread(
      cookieHeader,
      "work order step planner smoke",
    );
    threadIds.push(stepPlannerThreadId);
    const stepPlannerMessage = await appendPrompt(
      cookieHeader,
      stepPlannerThreadId,
      "把 WO-20260401-001 整理一下，该补的补，该推进的推进，最后告诉我改了什么",
    );
    const stepPlannerPreview = stepPlannerMessage.executionPreview;

    for (const operation of [
      "draft_progress_summary",
      "draft_status",
      "draft_next_action",
      "draft_risk_followup",
    ]) {
      assert(
        findDraftByOperation(stepPlannerPreview, operation).status === "applied",
        `${operation} 应由多步骤 planner 直接 applied`,
      );
    }
    assert(
      stepPlannerMessage.text?.includes("多步骤工单计划") ||
        stepPlannerMessage.content?.includes("多步骤工单计划"),
      "多步骤 planner 没有返回执行报告",
    );
    const afterStepPlanner = await pool.query(
      "select status, latest_progress_summary, next_action, metadata from work_orders where id = $1",
      [originalWorkOrder.id],
    );
    assert(
      afterStepPlanner.rows[0]?.status === "in_progress",
      "多步骤 planner 没有推进工单状态",
    );
    assert(
      afterStepPlanner.rows[0]?.latest_progress_summary?.includes("BP问问已根据目标完成工单整理"),
      "多步骤 planner 没有写入进展摘要",
    );
    assert(
      afterStepPlanner.rows[0]?.next_action?.includes("按 BP问问整理结果继续推进"),
      "多步骤 planner 没有写入下一步动作",
    );
    assert(
      stepPlannerPreview?.writebackDrafts?.some((draft) => draft.operation === "draft_progress_summary") &&
        stepPlannerPreview?.changedObjects?.some((item) =>
          item.includes("work_orders.latest_progress_summary"),
        ),
      "多步骤 planner 没有记录进展 changedObjects",
    );
    await assertPlannerMetadata(pool, stepPlannerMessage.executionResultId);

    const naturalPlannerThreadId = await createThread(
      cookieHeader,
      "work order natural planner smoke",
    );
    threadIds.push(naturalPlannerThreadId);
    const naturalPlannerMessage = await appendPrompt(
      cookieHeader,
      naturalPlannerThreadId,
      "把雨花区电缆铺设工单推进到施工解除预警",
    );
    const naturalPlannerPreview = naturalPlannerMessage.executionPreview;
    const naturalStageDraft = findDraftByOperation(
      naturalPlannerPreview,
      "draft_stage",
    );
    const naturalWarningDraft = findDraftByOperation(
      naturalPlannerPreview,
      "draft_warning_status",
    );

    assert(naturalStageDraft.proposedValue === "field_construction", "自然语言阶段没有解析到施工");
    assert(naturalWarningDraft.proposedValue === "resolved", "自然语言预警没有解析到解除");
    assert(
      [naturalStageDraft, naturalWarningDraft].every((draft) => draft.status === "applied"),
      "自然语言定位工单后阶段/预警应直接 applied",
    );
    const afterNaturalPlanner = await pool.query(
      "select work_order_no, stage, warning_status from work_orders where work_order_no = $1",
      ["WO-20260401-005"],
    );
    assert(afterNaturalPlanner.rows[0]?.stage === "field_construction", "自然语言没有真实推进到施工");
    assert(afterNaturalPlanner.rows[0]?.warning_status === "resolved", "自然语言没有真实解除预警");
    assert(
      naturalPlannerPreview?.changedObjects?.some((item) =>
        item.includes("WO-20260401-005/work_orders.stage"),
      ),
      "自然语言执行没有记录目标工单 stage changedObjects",
    );
    await assertPlannerMetadata(pool, naturalPlannerMessage.executionResultId);

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
    await assertPlannerMetadata(pool, updateMessage.executionResultId);

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
    await assertPlannerMetadata(pool, archiveMessage.executionResultId);

    const broadUpdateThreadId = await createThread(
      cookieHeader,
      "work order broad update smoke",
    );
    threadIds.push(broadUpdateThreadId);
    const broadUpdateMessage = await appendPrompt(
      cookieHeader,
      broadUpdateThreadId,
      "把 WO-20260401-001 的标题改成测试强执行工单，项目名改成东区扩容项目，站点名改成东区核心机房，责任团队改成强执行测试组，最新进展改成已完成多字段更新，材料完整度改成88，缺项数改成1，阻塞缺项改成0，预警状态改成严重预警",
    );
    const broadUpdatePreview = broadUpdateMessage.executionPreview;

    for (const operation of [
      "draft_title",
      "draft_project_name",
      "draft_site_name",
      "draft_responsible_team",
      "draft_progress_summary",
      "draft_material_completeness",
      "draft_missing_item_count",
      "draft_blocking_item_count",
      "draft_warning_status",
    ]) {
      assert(
        findDraftByOperation(broadUpdatePreview, operation).status === "applied",
        `${operation} 应直接 applied`,
      );
    }

    const afterBroadUpdate = await pool.query(
      "select title, project_name, site_name, current_responsible_team, latest_progress_summary, material_completeness, missing_item_count, blocking_item_count, warning_status from work_orders where id = $1",
      [originalWorkOrder.id],
    );
    const broadRow = afterBroadUpdate.rows[0];

    assert(broadRow?.title === "测试强执行工单", "标题没有真实修改");
    assert(broadRow?.project_name === "东区扩容项目", "项目名没有真实修改");
    assert(broadRow?.site_name === "东区核心机房", "站点名没有真实修改");
    assert(broadRow?.current_responsible_team === "强执行测试组", "责任团队没有真实修改");
    assert(
      broadRow?.latest_progress_summary === "已完成多字段更新",
      "最新进展没有真实修改",
    );
    assert(broadRow?.material_completeness === 88, "材料完整度没有真实修改");
    assert(broadRow?.missing_item_count === 1, "缺项数没有真实修改");
    assert(broadRow?.blocking_item_count === 0, "阻塞缺项没有真实修改");
    assert(broadRow?.warning_status === "critical", "预警状态没有真实修改");
    assert(
      broadUpdatePreview?.changedObjects?.some((item) =>
        item.includes("work_orders.current_responsible_team"),
      ),
      "多字段更新后没有记录责任团队 changedObjects",
    );
    await assertPlannerMetadata(pool, broadUpdateMessage.executionResultId);

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
    await assertPlannerMetadata(pool, createMessage.executionResultId);

    console.log(
      JSON.stringify(
        {
          ok: true,
          updateThreadId,
          titleOnlyThreadId,
          stepPlannerThreadId,
          naturalPlannerThreadId,
          archiveThreadId,
          createThreadId,
          titleOnlyExecutionResultId: titleOnlyMessage.executionResultId,
          stepPlannerExecutionResultId: stepPlannerMessage.executionResultId,
          naturalPlannerExecutionResultId: naturalPlannerMessage.executionResultId,
          broadUpdateExecutionResultId: broadUpdateMessage.executionResultId,
          updateExecutionResultId: updateMessage.executionResultId,
          archiveExecutionResultId: archiveMessage.executionResultId,
          createExecutionResultId: createMessage.executionResultId,
          updatedFields: afterUpdateApply.rows[0],
          stepPlannerFields: afterStepPlanner.rows[0],
          naturalPlannerFields: afterNaturalPlanner.rows[0],
          archivedAt: afterArchiveApply.rows[0].archived_at,
          broadUpdatedFields: broadRow,
          createdWorkOrderNo: createdNo,
          updateChangedObjects: latestUpdatePreview.changedObjects,
          stepPlannerChangedObjects: stepPlannerPreview.changedObjects,
          naturalPlannerChangedObjects: naturalPlannerPreview.changedObjects,
          archiveChangedObjects: archivePreview.changedObjects,
          broadUpdateChangedObjects: broadUpdatePreview.changedObjects,
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
      "update work_orders set title = $1, source_summary = $2, project_name = $3, site_name = $4, site_address = $5, current_responsible_team = $6, latest_progress_summary = $7, next_action = $8, material_completeness = $9, missing_item_count = $10, blocking_item_count = $11, warning_status = $12, priority = $13, stage = $14, status = $15, archived_at = $16, metadata = $17, updated_at = now() where id = $18",
      [
        originalWorkOrder.title,
        originalWorkOrder.source_summary,
        originalWorkOrder.project_name,
        originalWorkOrder.site_name,
        originalWorkOrder.site_address,
        originalWorkOrder.current_responsible_team,
        originalWorkOrder.latest_progress_summary,
        originalWorkOrder.next_action,
        originalWorkOrder.material_completeness,
        originalWorkOrder.missing_item_count,
        originalWorkOrder.blocking_item_count,
        originalWorkOrder.warning_status,
        originalWorkOrder.priority,
        originalWorkOrder.stage,
        originalWorkOrder.status,
        originalWorkOrder.archived_at,
        originalWorkOrder.metadata,
        originalWorkOrder.id,
      ],
    );
    await pool.query(
      "update work_orders set stage = $1, warning_status = $2, status = $3, latest_progress_summary = $4, next_action = $5, metadata = $6, updated_at = now() where id = $7",
      [
        originalNaturalWorkOrder.stage,
        originalNaturalWorkOrder.warning_status,
        originalNaturalWorkOrder.status,
        originalNaturalWorkOrder.latest_progress_summary,
        originalNaturalWorkOrder.next_action,
        originalNaturalWorkOrder.metadata,
        originalNaturalWorkOrder.id,
      ],
    );
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
