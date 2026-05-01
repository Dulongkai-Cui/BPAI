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
  const expectedModes = Array.isArray(expectedMode) ? expectedMode : [expectedMode];
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
    expectedModes.includes(latestMessage?.executionPreview?.mode),
    `没有进入预期执行结果模式：${expectedModes.join("/")}，实际为 ${latestMessage?.executionPreview?.mode ?? "none"}`,
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

function assertChangedObject(preview, fieldName, message) {
  assert(
    preview?.changedObjects?.some((item) => item.includes(`work_orders.${fieldName}`)),
    message,
  );
}

async function assertPlannerMetadata(pool, executionResultId, options = {}) {
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
  if (options.requireStepPlanner !== false) {
    assert(
      typeof metadata.modelCapabilityStepPlannerAttempted === "boolean",
      "execution task metadata 缺少 modelCapabilityStepPlannerAttempted",
    );
  }
  assert(
    payload?.modelToolPlanner &&
      typeof payload.modelToolPlanner.attempted === "boolean" &&
      typeof payload.modelToolPlanner.used === "boolean",
    "execution result payload 缺少 modelToolPlanner 状态",
  );
  if (options.requireStepPlanner !== false) {
    assert(
      payload?.modelCapabilityStepPlanner &&
        typeof payload.modelCapabilityStepPlanner.attempted === "boolean" &&
        typeof payload.modelCapabilityStepPlanner.used === "boolean",
      "execution result payload 缺少 modelCapabilityStepPlanner 状态",
    );
  }

  return { metadata, payload };
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

async function assertSlotFillContinuationMetadata(pool, threadId, expectedWorkOrderNo) {
  const metadata = await getLatestAssistantMetadata(pool, threadId);

  assert(metadata?.slotFillContinuation, "没有记录 slotFillContinuation");
  assert(
    metadata.slotFillContinuation.filledKey === "workOrderNo",
    "slotFillContinuation 没有记录 filledKey=workOrderNo",
  );
  assert(
    metadata.slotFillContinuation.filledValue === expectedWorkOrderNo,
    "slotFillContinuation 没有记录补充的工单号",
  );
  assert(
    metadata.modelCapabilityPlan?.args?.workOrderNo === expectedWorkOrderNo,
    "合并后的 modelCapabilityPlan 没有带上工单号",
  );
  assert(
    !metadata.missingInformationFollowup,
    "成功补槽后不应继续保留 missingInformationFollowup",
  );
}

async function assertLatestAssistantNeedsWorkOrderNo(pool, threadId) {
  const metadata = await getLatestAssistantMetadata(pool, threadId);

  assert(metadata?.missingInformationFollowup, "缺参追问没有记录 missingInformationFollowup");
  assert(metadata?.modelCapabilityPlan, "缺参追问没有记录 modelCapabilityPlan");
  assert(
    metadata.missingInformationFollowup.missingInformation?.some((item) =>
      String(item).includes("workOrderNo") ||
      String(item).includes("工单") ||
      String(item).includes("查看") ||
      String(item).includes("修改"),
    ),
    "缺参追问没有指向工单号",
  );
}

async function assertLatestAssistantNeedsStepWorkOrderNo(pool, threadId) {
  const metadata = await getLatestAssistantMetadata(pool, threadId);

  assert(metadata?.missingInformationFollowup, "multi-step 缺参追问没有记录 missingInformationFollowup");
  assert(metadata?.modelCapabilityStepPlan, "multi-step 缺参追问没有记录 modelCapabilityStepPlan");
  assert(
    metadata.missingInformationFollowup.missingInformation?.some((item) =>
      String(item).includes("workOrderNo") || String(item).includes("工单"),
    ),
    "multi-step 缺参追问没有指向工单号",
  );
}

async function assertAmbiguousSearchFollowup(pool, threadId) {
  const metadata = await getLatestAssistantMetadata(pool, threadId);

  assert(metadata?.missingInformationFollowup, "search 歧义追问没有记录 missingInformationFollowup");
  if (Array.isArray(metadata.missingInformationFollowup.candidates)) {
    assert(
      metadata.missingInformationFollowup.candidates.length >= 2,
      "search 歧义追问没有记录多个候选",
    );
  }
}

async function assertStepSlotFillContinuationMetadata(pool, threadId, expectedWorkOrderNo) {
  const metadata = await getLatestAssistantMetadata(pool, threadId);

  assert(metadata?.stepSlotFillContinuation, "没有记录 stepSlotFillContinuation");
  assert(
    metadata.stepSlotFillContinuation.filledKey === "workOrderNo",
    "stepSlotFillContinuation 没有记录 filledKey=workOrderNo",
  );
  assert(
    metadata.stepSlotFillContinuation.filledValue === expectedWorkOrderNo,
    "stepSlotFillContinuation 没有记录补充的工单号",
  );
  assert(
    metadata.modelCapabilityStepPlan?.steps?.some((step) => step.args?.workOrderNo === expectedWorkOrderNo),
    "合并后的 modelCapabilityStepPlan 没有带上工单号",
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

    const slotFillThreadId = await createThread(
      cookieHeader,
      "work order slot fill smoke",
    );
    threadIds.push(slotFillThreadId);
    const slotFillFollowup = await appendPrompt(
      cookieHeader,
      slotFillThreadId,
      "把这个工单的优先级改成高",
      ["simulation", "writeback_result", "capability_steps_result"],
    );

    assert(
      slotFillFollowup.executionPreview?.nextStep?.includes("工单") ||
        slotFillFollowup.text?.includes("工单") ||
        slotFillFollowup.content?.includes("工单"),
      "缺工单号时没有进入 capability followup",
    );
    await assertLatestAssistantNeedsWorkOrderNo(pool, slotFillThreadId);

    const slotFillMessage = await appendPrompt(
      cookieHeader,
      slotFillThreadId,
      "WO-20260401-001",
      ["writeback_result", "capability_steps_result", "simulation"],
    );
    const slotFillDraft = findDraftByOperation(
      slotFillMessage.executionPreview,
      "draft_priority",
    );

    assert(slotFillDraft.proposedValue === "high", "补槽后优先级草案值不是 high");
    assert(slotFillDraft.status === "applied", "补槽后优先级草案应直接 applied");
    const afterSlotFill = await pool.query(
      "select priority from work_orders where id = $1",
      [originalWorkOrder.id],
    );
    assert(afterSlotFill.rows[0]?.priority === "high", "补槽后没有真实修改 priority");
    await assertSlotFillContinuationMetadata(pool, slotFillThreadId, "WO-20260401-001");
    await assertPlannerMetadata(pool, slotFillMessage.executionResultId, {
      requireStepPlanner: false,
    });

    const titleOnlyThreadId = await createThread(
      cookieHeader,
      "work order title-only mutation smoke",
    );
    threadIds.push(titleOnlyThreadId);
    const titleOnlyMessage = await appendPrompt(
      cookieHeader,
      titleOnlyThreadId,
      "把 WO-20260401-001 的标题改成测试强执行工单",
      ["writeback_result", "capability_steps_result"],
    );
    const titleOnlyPreview = titleOnlyMessage.executionPreview;

    if (titleOnlyPreview.mode === "writeback_result") {
      const titleOnlyDraft = findDraftByOperation(
        titleOnlyPreview,
        "draft_title",
      );

      assert(titleOnlyDraft.status === "applied", "单字段标题修改应直接 applied");
    }
    const afterTitleOnly = await pool.query(
      "select title from work_orders where id = $1",
      [originalWorkOrder.id],
    );
    assert(
      afterTitleOnly.rows[0]?.title === "测试强执行工单",
      "单字段标题修改没有真实写入 work_orders",
    );
    assertChangedObject(
      titleOnlyPreview,
      "title",
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
      ["writeback_result", "tool_result", "capability_steps_result", "simulation"],
    );
    const stepPlannerPreview = stepPlannerMessage.executionPreview;

    if (stepPlannerPreview.mode === "writeback_result") {
      assert(
        stepPlannerPreview?.writebackDrafts?.some((draft) => draft.status === "applied"),
        "多步骤 planner 没有生成 applied 草案",
      );
    }
    if (stepPlannerPreview.mode === "writeback_result") {
      assert(
        stepPlannerMessage.text?.includes("多步骤工单计划") ||
          stepPlannerMessage.content?.includes("多步骤工单计划"),
        "多步骤 planner 没有返回执行报告",
      );
    }
    const afterStepPlanner = await pool.query(
      "select status, latest_progress_summary, next_action, metadata from work_orders where id = $1",
      [originalWorkOrder.id],
    );
    assert(
      afterStepPlanner.rows[0]?.status === "in_progress",
      "多步骤 planner 没有推进工单状态",
    );
    assert(
      afterStepPlanner.rows[0]?.latest_progress_summary,
      "多步骤 planner 没有写入进展摘要",
    );
    assert(
      stepPlannerPreview?.changedObjects?.some((item) => item.includes("work_orders.next_action"))
        ? afterStepPlanner.rows[0]?.next_action
        : true,
      "多步骤 planner 没有写入下一步动作",
    );
    if (stepPlannerPreview.mode === "writeback_result") {
      assert(
        stepPlannerPreview?.writebackDrafts?.some((draft) => draft.status === "applied"),
        "多步骤 planner 没有记录 applied 草案",
      );
    }
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
      ["writeback_result", "simulation"],
    );
    const naturalPlannerPreview = naturalPlannerMessage.executionPreview;

    if (naturalPlannerPreview.mode === "writeback_result") {
      const naturalStageDraft =
        naturalPlannerPreview?.writebackDrafts?.find((item) => item.operation === "draft_stage") ?? null;
      const naturalWarningDraft =
        naturalPlannerPreview?.writebackDrafts?.find((item) => item.operation === "draft_warning_status") ?? null;

      if (naturalStageDraft) {
        assert(naturalStageDraft.proposedValue === "field_construction", "自然语言阶段没有解析到施工");
      }
      if (naturalWarningDraft) {
        assert(naturalWarningDraft.proposedValue === "resolved", "自然语言预警没有解析到解除");
      }
      assert(
        [naturalStageDraft, naturalWarningDraft].filter(Boolean).every((draft) => draft.status === "applied"),
        "自然语言定位工单后阶段/预警应直接 applied",
      );
      const naturalChangedWarning = naturalPlannerPreview.changedObjects.find((item) =>
        item.includes("/work_orders.warning_status"),
      );
      const naturalChangedStage = naturalPlannerPreview.changedObjects.find((item) =>
        item.includes("/work_orders.stage"),
      );
      const afterNaturalPlanner = await pool.query(
        "select work_order_no, stage, warning_status from work_orders where work_order_no = $1",
        [(naturalChangedWarning ?? naturalChangedStage)?.split("/")[1] ?? "WO-20260401-005"],
      );
      if (naturalStageDraft && naturalChangedStage) {
        assert(afterNaturalPlanner.rows[0]?.stage === "field_construction", "自然语言没有真实推进到施工");
      }
      if (naturalWarningDraft && naturalChangedWarning) {
        assert(afterNaturalPlanner.rows[0]?.warning_status === "resolved", "自然语言没有真实解除预警");
      }
      if (naturalStageDraft) {
        assert(
          naturalPlannerPreview?.changedObjects?.length > 0,
          "自然语言执行没有记录 changedObjects",
        );
      }
    } else {
      assert(
        naturalPlannerPreview.title === "需要补充信息" || naturalPlannerPreview.nextStep?.includes("工单"),
        "自然语言定位不唯一时应追问工单",
      );
    }
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
      latestUpdatePreview?.changedObjects?.length > 0,
      "正式写回后没有记录 changedObjects",
    );
    await assertPlannerMetadata(pool, updateMessage.executionResultId);

    const stepSlotFillThreadId = await createThread(
      cookieHeader,
      "multi-step slot fill smoke",
    );
    threadIds.push(stepSlotFillThreadId);
    const stepSlotFillFollowup = await appendPrompt(
      cookieHeader,
      stepSlotFillThreadId,
      "查一下这个工单，然后把下一步改成联系施工队",
      ["simulation", "capability_steps_result", "writeback_result"],
    );
    let stepSlotFillMessage = stepSlotFillFollowup;
    if (stepSlotFillFollowup.executionPreview?.mode === "simulation") {
      assert(
        stepSlotFillFollowup.executionPreview?.nextStep?.includes("工单") ||
          stepSlotFillFollowup.text?.includes("工单"),
        "multi-step 缺工单号时没有追问工单",
      );
      await assertLatestAssistantNeedsStepWorkOrderNo(pool, stepSlotFillThreadId);

      stepSlotFillMessage = await appendPrompt(
        cookieHeader,
        stepSlotFillThreadId,
        "WO-20260401-001",
        ["capability_steps_result", "writeback_result", "tool_result"],
      );
      const stepSlotFillMetadata = await assertPlannerMetadata(
        pool,
        stepSlotFillMessage.executionResultId,
        { requireStepPlanner: false },
      );
      const latestStepSlotFillMetadata = await getLatestAssistantMetadata(
        pool,
        stepSlotFillThreadId,
      );
      if (latestStepSlotFillMetadata?.stepSlotFillContinuation) {
        assert(
          latestStepSlotFillMetadata.stepSlotFillContinuation.filledValue === "WO-20260401-001",
          "stepSlotFillContinuation 没有记录补充的工单号",
        );
        assert(
          latestStepSlotFillMetadata?.modelCapabilityStepPlan?.steps?.some(
            (step) => step.args?.workOrderNo === "WO-20260401-001",
          ),
          "合并后的 modelCapabilityStepPlan 没有带上工单号",
        );
      }
      if (stepSlotFillMetadata.payload?.stepSlotFillContinuation) {
        assert(
          stepSlotFillMetadata.payload.stepSlotFillContinuation,
          "multi-step 补槽后 payload 没有 stepSlotFillContinuation",
        );
      }
      assert(
        ["capability_steps_result", "writeback_result", "tool_result"].includes(
          stepSlotFillMessage.executionPreview?.mode,
        ),
        "multi-step 补槽后没有进入可接受的执行结果模式",
      );
      assert(
        stepSlotFillMessage.executionPreview?.toolRuns?.some((toolRun) =>
          ["work_order.read", "work_order.search"].includes(toolRun.toolName),
        ),
        "multi-step 补槽后没有执行读取/搜索工单工具",
      );
      if (
        Array.isArray(stepSlotFillMetadata.payload?.capabilityStepRuns) &&
        stepSlotFillMessage.executionPreview?.mode === "capability_steps_result"
      ) {
        assert(
          stepSlotFillMetadata.payload.capabilityStepRuns.length >= 1,
          "multi-step 补槽后没有继续执行 capability step",
        );
      }
    } else {
      assert(
        stepSlotFillFollowup.executionPreview?.mode === "capability_steps_result",
        "multi-step 有足够信息时没有直接执行 capability_steps_result",
      );
      assert(
        stepSlotFillFollowup.executionPreview?.toolRuns?.some((toolRun) =>
          ["work_order.read", "work_order.search", "work_order.writeback_draft.create"].includes(toolRun.toolName),
        ),
        "multi-step 直接执行时没有进入读取/搜索/写回链路",
      );
    }

    const multiStepThreadId = await createThread(
      cookieHeader,
      "multi-step capability planner smoke",
    );
    threadIds.push(multiStepThreadId);
    const multiStepMessage = await appendPrompt(
      cookieHeader,
      multiStepThreadId,
      "查一下 WO-20260401-001，然后把下一步改成联系施工队，状态推进到处理中",
      ["capability_steps_result", "writeback_result"],
    );
    const multiStepPreview = multiStepMessage.executionPreview;
    const afterMultiStep = await pool.query(
      "select next_action, status from work_orders where id = $1",
      [originalWorkOrder.id],
    );
    const multiStepMetadata = await assertPlannerMetadata(
      pool,
      multiStepMessage.executionResultId,
    );

    if (multiStepPreview.mode === "capability_steps_result") {
      assert(
        multiStepMetadata.payload?.modelCapabilityStepPlanner?.used === true,
        "multi-step capability planner 没有标记 used=true",
      );
      assert(
        multiStepPreview?.toolRuns?.some((toolRun) => toolRun.toolName === "work_order.read"),
        "multi-step 没有执行 work_order.read",
      );
      assert(
        multiStepPreview?.toolRuns?.some((toolRun) =>
          ["work_order.writeback.apply", "work_order.writeback_draft.create"].includes(toolRun.toolName),
        ),
        "multi-step 没有执行写回工具",
      );
      assert(
        multiStepPreview?.toolRuns?.some((toolRun) => toolRun.toolName === "work_order.read"),
        "multi-step 没有先读取工单再补参",
      );
      assert(
        multiStepMetadata.payload?.capabilityStepRuns?.length >= 2,
        "multi-step 没有记录多个 capabilityStepRuns",
      );
    } else {
      assert(
        afterMultiStep.rows[0]?.next_action === "联系施工队" ||
          afterMultiStep.rows[0]?.status === "in_progress",
        "multi-step fallback 没有产生任何真实工单变化",
      );
    }

    const searchStepThreadId = await createThread(
      cookieHeader,
      "search multi-step capability smoke",
    );
    threadIds.push(searchStepThreadId);
    const searchStepMessage = await appendPrompt(
      cookieHeader,
      searchStepThreadId,
      "找一下测试强执行工单，然后查一下它，再把它的下一步改成联系施工队",
      ["capability_steps_result", "writeback_result", "simulation"],
    );
    const searchStepPreview = searchStepMessage.executionPreview;
    const searchStepMetadata = await assertPlannerMetadata(
      pool,
      searchStepMessage.executionResultId,
    );

    if (searchStepPreview.mode === "capability_steps_result") {
      assert(
        searchStepPreview?.toolRuns?.some((toolRun) => toolRun.toolName === "work_order.search"),
        "search multi-step 没有执行 work_order.search",
      );
      assert(
        searchStepMetadata.payload?.capabilityStepRuns?.some(
          (stepRun) => stepRun.toolName === "work_order.search",
        ),
        "search multi-step 没有记录 search stepRun",
      );
    } else {
      assert(
        searchStepPreview?.nextStep?.includes("工单") || searchStepMessage.text?.includes("工单"),
        "search multi-step 未执行时没有合理追问",
      );
    }

    const ambiguousSearchThreadId = await createThread(
      cookieHeader,
      "ambiguous search continuation smoke",
    );
    threadIds.push(ambiguousSearchThreadId);
    const ambiguousSearchFollowup = await appendPrompt(
      cookieHeader,
      ambiguousSearchThreadId,
      "找一下工单，然后把它推进一下",
      ["simulation", "capability_steps_result", "writeback_result", "tool_result"],
    );
    if (ambiguousSearchFollowup.executionPreview?.mode === "simulation") {
      const latestAmbiguousMetadata = await getLatestAssistantMetadata(
        pool,
        ambiguousSearchThreadId,
      );
      if (latestAmbiguousMetadata?.missingInformationFollowup) {
        await assertAmbiguousSearchFollowup(pool, ambiguousSearchThreadId);
      }
      const ambiguousSearchMessage = await appendPrompt(
        cookieHeader,
        ambiguousSearchThreadId,
        "第1张",
        ["capability_steps_result", "writeback_result", "tool_result"],
      );
      const ambiguousSearchMetadata = await assertPlannerMetadata(
        pool,
        ambiguousSearchMessage.executionResultId,
        { requireStepPlanner: false },
      );
      assert(
        ambiguousSearchMetadata.payload?.stepSlotFillContinuation,
        "search 候选选择后没有记录 stepSlotFillContinuation",
      );
    } else {
      assert(
        ["capability_steps_result", "writeback_result", "tool_result"].includes(
          ambiguousSearchFollowup.executionPreview?.mode,
        ),
        "search 歧义场景没有进入可接受的执行模式",
      );
    }

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
      ["tool_result", "simulation"],
    );
    const createPreview = createMessage.executionPreview;

    if (createPreview?.mode === "tool_result") {
      assert(
        createPreview?.title?.includes("已创建工单"),
        "新建工单没有展示创建成功标题",
      );
      assert(
        createPreview?.changedObjects?.some((item) => item.endsWith("/created")),
        "新建工单没有记录 created changedObjects",
      );
    } else {
      assert(
        createPreview?.title === "需要补充信息" || createPreview?.nextStep?.includes("标题"),
        "新建工单缺参时没有追问标题",
      );
    }

    const createdNo = createPreview.changedObjects
      ?.find((item) => item.endsWith("/created"))
      ?.split("/")[1];

    if (createPreview.mode === "tool_result") {
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
    }
    await assertPlannerMetadata(pool, createMessage.executionResultId);

    console.log(
      JSON.stringify(
        {
          ok: true,
          updateThreadId,
          slotFillThreadId,
          titleOnlyThreadId,
          stepPlannerThreadId,
          naturalPlannerThreadId,
          stepSlotFillThreadId,
          multiStepThreadId,
          searchStepThreadId,
          ambiguousSearchThreadId,
          archiveThreadId,
          createThreadId,
          slotFillExecutionResultId: slotFillMessage.executionResultId,
          titleOnlyExecutionResultId: titleOnlyMessage.executionResultId,
          stepPlannerExecutionResultId: stepPlannerMessage.executionResultId,
          naturalPlannerExecutionResultId: naturalPlannerMessage.executionResultId,
          stepSlotFillExecutionResultId: stepSlotFillMessage.executionResultId,
          multiStepExecutionResultId: multiStepMessage.executionResultId,
          searchStepExecutionResultId: searchStepMessage.executionResultId,
          ambiguousSearchExecutionResultId: ambiguousSearchFollowup.executionResultId,
          broadUpdateExecutionResultId: broadUpdateMessage.executionResultId,
          updateExecutionResultId: updateMessage.executionResultId,
          archiveExecutionResultId: archiveMessage.executionResultId,
          createExecutionResultId: createMessage.executionResultId,
          updatedFields: afterUpdateApply.rows[0],
          multiStepFields: afterMultiStep.rows[0],
          stepPlannerFields: afterStepPlanner.rows[0],
          naturalPlannerFields: naturalPlannerPreview.mode === "writeback_result" ? "executed" : "followup",
          archivedAt: afterArchiveApply.rows[0].archived_at,
          broadUpdatedFields: broadRow,
          createdWorkOrderNo: createdNo,
          slotFillChangedObjects: slotFillMessage.executionPreview.changedObjects,
          stepSlotFillMode: stepSlotFillMessage.executionPreview.mode,
          multiStepChangedObjects: multiStepPreview.changedObjects,
          searchStepMode: searchStepPreview.mode,
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
