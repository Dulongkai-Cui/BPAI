import { createHmac, randomBytes } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://bpai:bpai@localhost:5433/bpai_dev";
const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3001";
const SESSION_SECRET =
  process.env.BPAI_SESSION_SECRET ?? "bpai-local-session-secret";
const STORE_PATH =
  process.env.BPAI_STORE_PATH ?? path.join(process.cwd(), ".bpai", "app-store.json");
const seed = Date.now().toString(36);
const pool = new Pool({ connectionString: DATABASE_URL });

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signPayload(encodedPayload) {
  return createHmac("sha256", SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function serializeSessionToken(payload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

async function waitFor(label, predicate, timeoutMs = 5000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }

    await sleep(120);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

async function readRawStore() {
  const raw = await readFile(STORE_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeRawStore(store) {
  const nextJson = `${JSON.stringify(store, null, 2)}\n`;
  const tempPath = `${STORE_PATH}.tmp-smoke-${seed}`;
  await writeFile(tempPath, nextJson, "utf8");
  await rename(tempPath, STORE_PATH);
}

async function waitForRawStoreSpace(spaceId) {
  await waitFor("raw shadow collaboration space", async () => {
    try {
      const store = await readRawStore();
      return store.collaborationSpaces.some((space) => space.id === spaceId);
    } catch {
      return false;
    }
  });
}

async function cleanupRawStore(spaceId) {
  try {
    const store = await readRawStore();
    await writeRawStore({
      ...store,
      workspaces: store.workspaces.filter((workspace) => workspace.id !== spaceId),
      collaborationSpaces: store.collaborationSpaces.filter(
        (space) => space.id !== spaceId,
      ),
      collaborationSpaceMembers: store.collaborationSpaceMembers.filter(
        (state) => state.workspaceId !== spaceId,
      ),
      workspaceBrowserStates: store.workspaceBrowserStates.filter(
        (state) => state.workspaceId !== spaceId,
      ),
      dissolvedCollaborationSpaceIds: store.dissolvedCollaborationSpaceIds.filter(
        (id) => id !== spaceId,
      ),
    });
  } catch (error) {
    console.warn("[work-order-backend-smoke] raw store cleanup skipped", error);
  }
}

async function fetchActor(email) {
  const result = await pool.query(
    `
      select
        u.id,
        u.name,
        u.email,
        u.role_key,
        u.role_label,
        u.team_label,
        w.id as workspace_id,
        w.name as workspace_label
      from users u
      left join workspaces w on w.id = u.primary_workspace_id
      where u.email = $1
      limit 1
    `,
    [email],
  );

  const actor = result.rows[0];
  assert(actor, `Actor not found for ${email}`);
  assert(actor.workspace_id, `Primary workspace missing for ${email}`);
  return actor;
}

async function createSessionCookie(userId) {
  const sessionId = randomBytes(24).toString("hex");
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await pool.query(
    `
      insert into sessions (id, user_id, created_at, expires_at, last_seen_at)
      values ($1, $2, $3, $4, $3)
    `,
    [sessionId, userId, createdAt, expiresAt],
  );

  const token = serializeSessionToken({
    sessionId,
    userId,
    expiresAt,
  });

  return {
    cookie: `bpai_session=${token}`,
    sessionId,
  };
}

async function requestJson(cookie, url, init = {}) {
  const response = await fetch(`${BASE_URL}${url}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      Cookie: cookie,
    },
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return {
    json,
    response,
  };
}

async function main() {
  const owner = await fetchActor("dulongkai.cui@akane.waseda.jp");
  const outsider = await fetchActor("li.gong@bpai.local");
  const ownerSession = await createSessionCookie(owner.id);
  const outsiderSession = await createSessionCookie(outsider.id);
  const workOrderNo = `WO-SMOKE-${seed}`.toUpperCase();
  const duplicateSpaceName = `Smoke Duplicate Space ${seed}`;
  let createdWorkOrderId = null;
  let createdSpaceId = null;

  try {
    const createResult = await requestJson(ownerSession.cookie, "/api/work-orders", {
      method: "POST",
      body: JSON.stringify({
        workOrderNo,
        title: `Smoke Work Order ${seed}`,
        sourceType: "manual",
        priority: "normal",
        sourceSummary: "smoke summary",
        projectName: "smoke project",
        siteName: "smoke site",
        siteAddress: "smoke address",
        currentResponsibleUserId: owner.id,
        currentResponsibleTeam: owner.team_label,
        currentStage: "registration",
        progressPercent: 26,
        createDedicatedSpace: true,
        dedicatedSpaceName: `Smoke Space ${seed}`,
        dedicatedSpaceSummary: "smoke dedicated space",
        dedicatedSpaceTone: "blue",
      }),
    });

    assert(createResult.response.status === 201, "Work-order create route failed");
    assert(createResult.json?.workOrder?.id, "Create route returned no work order");
    assert(
      createResult.json.workOrder.collaborationSpaceId,
      "Create route returned no collaboration space link",
    );

    createdWorkOrderId = createResult.json.workOrder.id;
    createdSpaceId = createResult.json.workOrder.collaborationSpaceId;

    await waitFor("dedicated collaboration space row", async () => {
      const result = await pool.query(
        "select id from collaboration_spaces where id = $1 limit 1",
        [createdSpaceId],
      );
      return result.rows.length === 1;
    });

    await waitForRawStoreSpace(createdSpaceId);

    const detailResult = await requestJson(
      ownerSession.cookie,
      `/api/work-orders/${createdWorkOrderId}`,
      { method: "GET" },
    );

    assert(detailResult.response.status === 200, "Detail GET route failed");
    assert(
      detailResult.json?.detail?.workOrder?.id === createdWorkOrderId,
      "Detail GET returned wrong work order",
    );
    assert(
      detailResult.json?.detail?.sourceIntakes?.length >= 1,
      "Detail GET returned no source intake rows",
    );
    assert(
      detailResult.json?.detail?.collaborationSpace?.id === createdSpaceId,
      "Detail GET returned wrong collaboration space",
    );
    assert(
      detailResult.json?.detail?.missingItems?.totalCount >= 0,
      "Detail GET missing-items summary is invalid",
    );

    const dispatchAssign = await requestJson(
      ownerSession.cookie,
      `/api/work-orders/${createdWorkOrderId}/dispatch-executions`,
      {
        method: "POST",
        body: JSON.stringify({
          assignedTeamLabel: "Smoke Crew Alpha",
          assignedUserId: owner.id,
          crewLeaderName: "朱三",
          crewMembersText: "朱三、徐凡久、沈军",
          plannedStartAt: "2026-04-03",
          plannedEndAt: "2026-04-04",
          coordinationRecord: "优先处理当天最急的两单。",
          nextAction: "按计划进场施工并同步回单。",
        }),
      },
    );

    assert(
      dispatchAssign.response.status === 201,
      "Dispatch assignment route failed",
    );
    assert(
      dispatchAssign.json?.dispatchExecution?.assignedTeamLabel === "Smoke Crew Alpha",
      "Dispatch assignment returned wrong team label",
    );
    assert(
      dispatchAssign.json?.dispatchExecution?.crewMemberCount === 3,
      "Dispatch assignment returned wrong crew member count",
    );

    const detailAfterDispatch = await requestJson(
      ownerSession.cookie,
      `/api/work-orders/${createdWorkOrderId}`,
      { method: "GET" },
    );

    assert(
      detailAfterDispatch.json?.detail?.dispatchExecutions?.length >= 1,
      "Dispatch assignment did not appear in detail route",
    );
    assert(
      detailAfterDispatch.json?.detail?.dispatchExecutions?.[0]?.assignedTeamLabel ===
        "Smoke Crew Alpha",
      "Detail route returned wrong dispatch team",
    );

    const partialUpdate = await requestJson(
      ownerSession.cookie,
      `/api/work-orders/${createdWorkOrderId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          title: `Smoke Work Order ${seed} Updated`,
        }),
      },
    );

    assert(partialUpdate.response.status === 200, "Partial update route failed");
    assert(
      partialUpdate.json?.workOrder?.sourceSummary === "smoke summary",
      "Partial update cleared sourceSummary",
    );
    assert(
      partialUpdate.json?.workOrder?.projectName === "smoke project",
      "Partial update cleared projectName",
    );
    assert(
      partialUpdate.json?.workOrder?.status === "open",
      `Expected registration status=open, got ${partialUpdate.json?.workOrder?.status}`,
    );

    const warningUpdate = await requestJson(
      ownerSession.cookie,
      `/api/work-orders/${createdWorkOrderId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          currentStage: "warning",
        }),
      },
    );

    assert(warningUpdate.response.status === 200, "Warning-stage update route failed");
    assert(
      warningUpdate.json?.workOrder?.status === "blocked",
      `Expected warning status=blocked, got ${warningUpdate.json?.workOrder?.status}`,
    );

    const normalizedUpdate = await requestJson(
      ownerSession.cookie,
      `/api/work-orders/${createdWorkOrderId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          currentStage: "field_construction",
        }),
      },
    );

    assert(
      normalizedUpdate.response.status === 200,
      "Field construction update route failed",
    );
    assert(
      normalizedUpdate.json?.workOrder?.status === "in_progress",
      `Expected field_construction status=in_progress, got ${normalizedUpdate.json?.workOrder?.status}`,
    );

    const forbiddenUpdate = await requestJson(
      outsiderSession.cookie,
      `/api/work-orders/${createdWorkOrderId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          title: "Should fail",
        }),
      },
    );

    assert(
      forbiddenUpdate.response.status === 403,
      `Expected outsider PATCH to 403, got ${forbiddenUpdate.response.status}`,
    );

    const forbiddenDetail = await requestJson(
      outsiderSession.cookie,
      `/api/work-orders/${createdWorkOrderId}`,
      { method: "GET" },
    );

    assert(
      forbiddenDetail.response.status === 403,
      `Expected outsider GET to 403, got ${forbiddenDetail.response.status}`,
    );

    const forbiddenDelete = await requestJson(
      outsiderSession.cookie,
      `/api/work-orders/${createdWorkOrderId}`,
      { method: "DELETE" },
    );

    assert(
      forbiddenDelete.response.status === 403,
      `Expected outsider DELETE to 403, got ${forbiddenDelete.response.status}`,
    );

    const duplicateBefore = await pool.query(
      "select id from collaboration_spaces where name = $1",
      [duplicateSpaceName],
    );

    const duplicateCreate = await requestJson(ownerSession.cookie, "/api/work-orders", {
      method: "POST",
      body: JSON.stringify({
        workOrderNo,
        title: `Duplicate ${seed}`,
        currentResponsibleUserId: owner.id,
        currentResponsibleTeam: owner.team_label,
        createDedicatedSpace: true,
        dedicatedSpaceName: duplicateSpaceName,
        dedicatedSpaceSummary: "should not persist",
        dedicatedSpaceTone: "blue",
      }),
    });

    assert(
      duplicateCreate.response.status === 409,
      `Expected duplicate work-order number to 409, got ${duplicateCreate.response.status}`,
    );

    const duplicateAfter = await pool.query(
      "select id from collaboration_spaces where name = $1",
      [duplicateSpaceName],
    );

    assert(
      duplicateAfter.rows.length === duplicateBefore.rows.length,
      "Duplicate create left an orphan collaboration space behind",
    );

    const deleteResult = await requestJson(
      ownerSession.cookie,
      `/api/work-orders/${createdWorkOrderId}`,
      { method: "DELETE" },
    );

    assert(deleteResult.response.status === 200, "Delete route failed");

    const workOrderRows = await pool.query(
      "select id from work_orders where id = $1",
      [createdWorkOrderId],
    );
    assert(workOrderRows.rows.length === 0, "Deleted work order still exists");

    const intakeRows = await pool.query(
      "select id from source_intakes where work_order_id = $1",
      [createdWorkOrderId],
    );
    assert(intakeRows.rows.length === 0, "Source intakes were not cascade-deleted");

    const missingRows = await pool.query(
      "select id from missing_items where work_order_id = $1",
      [createdWorkOrderId],
    );
    assert(missingRows.rows.length === 0, "Missing items were not cascade-deleted");

    const linkedSpaceRows = await pool.query(
      "select id from collaboration_spaces where id = $1",
      [createdSpaceId],
    );
    assert(
      linkedSpaceRows.rows.length === 1,
      "Deleting a work order unexpectedly removed its collaboration space",
    );

    console.log("work-order-backend-smoke: PASS");
  } finally {
    if (createdWorkOrderId) {
      await pool.query("delete from work_orders where id = $1", [createdWorkOrderId]);
    }

    if (createdSpaceId) {
      await pool.query("delete from workspaces where id = $1", [createdSpaceId]);
      await cleanupRawStore(createdSpaceId);
    }

    await pool.query("delete from sessions where id = $1", [ownerSession.sessionId]);
    await pool.query("delete from sessions where id = $1", [outsiderSession.sessionId]);
  }
}

main()
  .catch((error) => {
    console.error("work-order-backend-smoke: FAIL");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
