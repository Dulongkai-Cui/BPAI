import { createHmac, randomBytes } from "node:crypto";
import { Pool } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://bpai:bpai@localhost:5433/bpai_dev";
const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3001";
const SESSION_SECRET =
  process.env.BPAI_SESSION_SECRET ?? "bpai-local-session-secret";
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

  return `bpai_session=${token}`;
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
  return { response, json };
}

async function main() {
  const actor = await fetchActor("dulongkai.cui@akane.waseda.jp");
  const cookie = await createSessionCookie(actor.id);
  let createdSquadId = null;
  let createdWorkOrderId = null;

  try {
    const membersResult = await requestJson(cookie, "/api/engineering/members");
    assert(membersResult.response.status === 200, "Members route failed");
    assert(
      Array.isArray(membersResult.json?.members) &&
        membersResult.json.members.length >= 15,
      "Members route returned too few rows",
    );

    const squadsResult = await requestJson(cookie, "/api/engineering/squads");
    assert(squadsResult.response.status === 200, "Squads route failed");
    assert(
      Array.isArray(squadsResult.json?.squads) &&
        squadsResult.json.squads.length >= 3,
      "Squads route returned too few rows",
    );

    const memberIds = membersResult.json.members.slice(0, 3).map((member) => member.id);
    const leaderMemberId = memberIds[0];

    const createSquadResult = await requestJson(cookie, "/api/engineering/squads", {
      method: "POST",
      body: JSON.stringify({
        name: `Smoke 编队 ${seed}`,
        code: `SMOKE-${seed}`.toUpperCase(),
        leaderMemberId,
        memberIds,
        baseLabel: "烟测执行线",
        summary: "engineering smoke squad",
      }),
    });

    assert(createSquadResult.response.status === 201, "Create squad route failed");
    createdSquadId = createSquadResult.json?.squad?.id ?? null;
    assert(createdSquadId, "Create squad returned no id");

    const patchSquadResult = await requestJson(
      cookie,
      `/api/engineering/squads/${createdSquadId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          summary: "engineering smoke squad updated",
          memberIds: memberIds.slice(0, 2),
          leaderMemberId,
        }),
      },
    );

    assert(patchSquadResult.response.status === 200, "Update squad route failed");
    assert(
      patchSquadResult.json?.squad?.memberCount === 2,
      "Update squad did not sync members",
    );

    const dispatchOptionsResult = await requestJson(
      cookie,
      "/api/engineering/dispatch-options",
    );
    assert(
      dispatchOptionsResult.response.status === 200,
      "Dispatch options route failed",
    );
    assert(
      dispatchOptionsResult.json?.squads?.some((row) => row.id === createdSquadId),
      "Dispatch options did not include created squad",
    );

    const workOrderNo = `WO-ENG-${seed}`.toUpperCase();
    const createWorkOrderResult = await requestJson(cookie, "/api/work-orders", {
      method: "POST",
      body: JSON.stringify({
        workOrderNo,
        title: `Engineering Smoke ${seed}`,
        sourceType: "manual",
        priority: "normal",
        sourceSummary: "engineering smoke summary",
        projectName: "engineering smoke project",
        siteName: "engineering smoke site",
        siteAddress: "engineering smoke address",
        currentResponsibleUserId: actor.id,
        currentResponsibleTeam: actor.team_label,
        currentStage: "dispatch",
        progressPercent: 18,
      }),
    });

    assert(createWorkOrderResult.response.status === 201, "Create work-order failed");
    createdWorkOrderId = createWorkOrderResult.json?.workOrder?.id ?? null;
    assert(createdWorkOrderId, "Create work-order returned no id");

    const dispatchResult = await requestJson(
      cookie,
      `/api/work-orders/${createdWorkOrderId}/dispatch-executions`,
      {
        method: "POST",
        body: JSON.stringify({
          assignedSquadId: createdSquadId,
          assignedUserId: actor.id,
          crewLeaderName: "朱三",
          crewMemberIds: memberIds.slice(0, 2),
          plannedStartAt: "2026-04-03",
          plannedEndAt: "2026-04-04",
          coordinationRecord: "engineering smoke dispatch",
          nextAction: "按编队计划推进",
        }),
      },
    );

    assert(dispatchResult.response.status === 201, "Dispatch by squad route failed");
    assert(
      dispatchResult.json?.dispatchExecution?.assignedSquadId === createdSquadId,
      "Dispatch result returned wrong squad id",
    );

    const detailResult = await requestJson(
      cookie,
      `/api/work-orders/${createdWorkOrderId}`,
      { method: "GET" },
    );

    assert(detailResult.response.status === 200, "Detail route failed after dispatch");
    assert(
      detailResult.json?.detail?.dispatchExecutions?.[0]?.assignedSquadId ===
        createdSquadId,
      "Detail route missing assigned squad id",
    );
    assert(
      detailResult.json?.detail?.dispatchExecutions?.[0]?.assignedSquadName,
      "Detail route missing assigned squad name",
    );

    const archiveSquadResult = await requestJson(
      cookie,
      `/api/engineering/squads/${createdSquadId}`,
      {
        method: "DELETE",
      },
    );

    assert(archiveSquadResult.response.status === 200, "Archive squad route failed");

    await waitFor("archived squad status", async () => {
      const rows = await pool.query(
        "select status, archived_at from engineering_squads where id = $1 limit 1",
        [createdSquadId],
      );
      return (
        rows.rows[0]?.status === "archived" && rows.rows[0]?.archived_at !== null
      );
    });

    console.log("engineering-backend-smoke:ok");
  } finally {
    if (createdWorkOrderId) {
      await requestJson(cookie, `/api/work-orders/${createdWorkOrderId}`, {
        method: "DELETE",
      });
    }

    await pool.end();
  }
}

main().catch((error) => {
  console.error("engineering-backend-smoke:failed");
  console.error(error);
  process.exitCode = 1;
});
