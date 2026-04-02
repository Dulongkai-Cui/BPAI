import "server-only";

import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/types";
import { getDb } from "@/lib/db/client";
import {
  dispatchExecutions,
  engineeringMembers,
  engineeringSquadMembers,
  engineeringSquads,
  engineeringMemberStatusEnum,
  engineeringSquadMemberRoleEnum,
  engineeringSquadStatusEnum,
} from "@/lib/db/schema";

type EngineeringMemberStatus =
  (typeof engineeringMemberStatusEnum.enumValues)[number];
type EngineeringSquadStatus =
  (typeof engineeringSquadStatusEnum.enumValues)[number];
type EngineeringSquadMemberRole =
  (typeof engineeringSquadMemberRoleEnum.enumValues)[number];
type DbExecutor = ReturnType<typeof getDb>;
type DbTransaction = Parameters<Parameters<DbExecutor["transaction"]>[0]>[0];

type SeedMember = {
  id: string;
  name: string;
  roleLabel: string;
  baseLabel: string;
};

type SeedSquad = {
  id: string;
  code: string;
  name: string;
  baseLabel: string;
  summary: string;
  leaderMemberId: string;
  memberIds: string[];
};

export type EngineeringMemberOption = {
  id: string;
  name: string;
  roleLabel: string;
  status: EngineeringMemberStatus;
  baseLabel: string;
  linkedUserId: string | null;
  currentSquadId: string | null;
  currentSquadName: string | null;
  currentSquadCode: string | null;
  note: string;
};

export type EngineeringSquadOption = {
  id: string;
  code: string;
  name: string;
  status: EngineeringSquadStatus;
  leaderMemberId: string | null;
  leaderMemberName: string | null;
  baseLabel: string;
  summary: string;
  note: string;
  activeWorkOrderCount: number;
  memberCount: number;
  members: Array<{
    id: string;
    name: string;
    roleLabel: string;
    status: EngineeringMemberStatus;
    memberRole: EngineeringSquadMemberRole;
    sortOrder: number;
  }>;
};

export type CreateEngineeringSquadInput = {
  name: string;
  code?: string;
  leaderMemberId?: string | null;
  memberIds?: string[];
  baseLabel?: string;
  summary?: string;
  note?: string;
  createdByUserId?: string | null;
};

export type UpdateEngineeringSquadInput = {
  id: string;
  name?: string;
  code?: string;
  leaderMemberId?: string | null;
  memberIds?: string[];
  baseLabel?: string;
  summary?: string;
  note?: string;
  status?: EngineeringSquadStatus;
};

const MEMBER_SEEDS: SeedMember[] = [
  { id: "eng-member-zhu-san", name: "朱三", roleLabel: "施工人员", baseLabel: "长沙执行线" },
  { id: "eng-member-xu-fanjiu", name: "徐凡久", roleLabel: "施工人员", baseLabel: "长沙执行线" },
  { id: "eng-member-shen-jun", name: "沈军", roleLabel: "施工人员", baseLabel: "长沙执行线" },
  { id: "eng-member-yi-changsheng", name: "易长生", roleLabel: "施工人员", baseLabel: "长沙执行线" },
  { id: "eng-member-yang-zelin", name: "杨泽林", roleLabel: "施工人员", baseLabel: "长沙执行线" },
  { id: "eng-member-du-jinxing", name: "杜金星", roleLabel: "施工人员", baseLabel: "长沙执行线" },
  { id: "eng-member-shi-caijun", name: "石彩军", roleLabel: "施工人员", baseLabel: "长沙执行线" },
  { id: "eng-member-tang-luntao", name: "唐伦涛", roleLabel: "施工人员", baseLabel: "长沙执行线" },
  { id: "eng-member-shen-anhe", name: "沈安和", roleLabel: "施工人员", baseLabel: "长沙执行线" },
  { id: "eng-member-gao-deng", name: "高登", roleLabel: "施工人员", baseLabel: "长沙执行线" },
  { id: "eng-member-liu-xiaozhao", name: "刘晓照", roleLabel: "施工人员", baseLabel: "长沙执行线" },
  { id: "eng-member-zhang-yongjiang", name: "张永江", roleLabel: "施工人员", baseLabel: "长沙执行线" },
  { id: "eng-member-long-tianwen", name: "龙田文", roleLabel: "施工人员", baseLabel: "长沙执行线" },
  { id: "eng-member-li-hong", name: "李红", roleLabel: "施工人员", baseLabel: "长沙执行线" },
  { id: "eng-member-xu-haiping", name: "徐海平", roleLabel: "施工人员", baseLabel: "长沙执行线" },
];

const SQUAD_SEEDS: SeedSquad[] = [
  {
    id: "eng-squad-01",
    code: "ENG-SQ-01",
    name: "工程一队",
    baseLabel: "雨花 / 天心执行线",
    summary: "默认编队，可承接光缆接入、FTTH 和摸底任务。",
    leaderMemberId: "eng-member-zhu-san",
    memberIds: [
      "eng-member-zhu-san",
      "eng-member-xu-fanjiu",
      "eng-member-shen-jun",
      "eng-member-yi-changsheng",
      "eng-member-yang-zelin",
    ],
  },
  {
    id: "eng-squad-02",
    code: "ENG-SQ-02",
    name: "工程二队",
    baseLabel: "天心 / 雨花执行线",
    summary: "默认编队，可承接光缆接入与现场摸底任务。",
    leaderMemberId: "eng-member-du-jinxing",
    memberIds: [
      "eng-member-du-jinxing",
      "eng-member-shi-caijun",
      "eng-member-tang-luntao",
      "eng-member-shen-anhe",
      "eng-member-gao-deng",
    ],
  },
  {
    id: "eng-squad-03",
    code: "ENG-SQ-03",
    name: "工程三队",
    baseLabel: "长沙摸底执行线",
    summary: "默认编队，可承接摸底与补录类现场任务。",
    leaderMemberId: "eng-member-liu-xiaozhao",
    memberIds: [
      "eng-member-liu-xiaozhao",
      "eng-member-zhang-yongjiang",
      "eng-member-long-tianwen",
      "eng-member-li-hong",
      "eng-member-xu-haiping",
    ],
  },
];

function now() {
  return new Date();
}

function countExpr() {
  return sql<number>`count(*)::int`;
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeCode(value: string | null | undefined) {
  return normalizeText(value).toUpperCase();
}

function uniqueIds(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

function ensureEngineeringManager(actor: AuthenticatedUser) {
  if (actor.roleKey === "dispatcher" || actor.roleKey === "system_admin") {
    return;
  }

  throw new Error("FORBIDDEN");
}

async function syncSquadMembers(
  tx: DbTransaction,
  squadId: string,
  memberIds: string[],
  leaderMemberId: string | null,
  timestamp: Date,
) {
  const desiredMemberIds = uniqueIds(
    leaderMemberId ? [leaderMemberId, ...memberIds] : memberIds,
  );

  if (desiredMemberIds.length === 0) {
    await tx
      .update(engineeringSquadMembers)
      .set({
        isActive: false,
        leftAt: timestamp,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(engineeringSquadMembers.squadId, squadId),
          eq(engineeringSquadMembers.isActive, true),
        ),
      );

    return;
  }

  await tx
    .update(engineeringSquadMembers)
    .set({
      isActive: false,
      leftAt: timestamp,
      updatedAt: timestamp,
    })
    .where(
      and(
        inArray(engineeringSquadMembers.memberId, desiredMemberIds),
        eq(engineeringSquadMembers.isActive, true),
        ne(engineeringSquadMembers.squadId, squadId),
      ),
    );

  const existingRows = await tx
    .select({
      id: engineeringSquadMembers.id,
      memberId: engineeringSquadMembers.memberId,
      isActive: engineeringSquadMembers.isActive,
    })
    .from(engineeringSquadMembers)
    .where(eq(engineeringSquadMembers.squadId, squadId));

  const existingMap = new Map(existingRows.map((row) => [row.memberId, row]));

  for (const row of existingRows) {
    if (desiredMemberIds.includes(row.memberId)) {
      continue;
    }

    await tx
      .update(engineeringSquadMembers)
      .set({
        isActive: false,
        leftAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(engineeringSquadMembers.id, row.id));
  }

  for (const [sortOrder, memberId] of desiredMemberIds.entries()) {
    const memberRole: EngineeringSquadMemberRole =
      leaderMemberId && memberId === leaderMemberId ? "leader" : "member";
    const existing = existingMap.get(memberId);

    if (existing) {
      await tx
        .update(engineeringSquadMembers)
        .set({
          memberRole,
          sortOrder,
          isActive: true,
          leftAt: null,
          updatedAt: timestamp,
        })
        .where(eq(engineeringSquadMembers.id, existing.id));
      continue;
    }

    await tx.insert(engineeringSquadMembers).values({
      id: crypto.randomUUID(),
      squadId,
      memberId,
      memberRole,
      sortOrder,
      isActive: true,
      joinedAt: timestamp,
      leftAt: null,
      note: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
}

async function getSquadRowsWithMembers(includeArchived = false) {
  const db = getDb();
  const squadQuery = db
    .select()
    .from(engineeringSquads)
    .orderBy(asc(engineeringSquads.code), asc(engineeringSquads.name));
  const squads = includeArchived
    ? await squadQuery
    : await squadQuery.where(isNull(engineeringSquads.archivedAt));

  if (squads.length === 0) {
    return [];
  }

  const squadIds = squads.map((row) => row.id);
  const [memberRows, dispatchCountRows] = await Promise.all([
    db
      .select({
        squadId: engineeringSquadMembers.squadId,
        memberId: engineeringMembers.id,
        memberName: engineeringMembers.name,
        roleLabel: engineeringMembers.roleLabel,
        memberStatus: engineeringMembers.status,
        memberRole: engineeringSquadMembers.memberRole,
        sortOrder: engineeringSquadMembers.sortOrder,
      })
      .from(engineeringSquadMembers)
      .innerJoin(
        engineeringMembers,
        eq(engineeringMembers.id, engineeringSquadMembers.memberId),
      )
      .where(
        and(
          inArray(engineeringSquadMembers.squadId, squadIds),
          eq(engineeringSquadMembers.isActive, true),
        ),
      )
      .orderBy(
        asc(engineeringSquadMembers.squadId),
        asc(engineeringSquadMembers.sortOrder),
        asc(engineeringMembers.name),
      ),
    db
      .select({
        squadId: dispatchExecutions.assignedSquadId,
        count: countExpr(),
      })
      .from(dispatchExecutions)
      .where(
        and(
          inArray(dispatchExecutions.assignedSquadId, squadIds),
          inArray(dispatchExecutions.executionStatus, [
            "pending",
            "assigned",
            "in_progress",
            "paused",
          ]),
        ),
      )
      .groupBy(dispatchExecutions.assignedSquadId),
  ]);

  const memberMap = new Map<string, EngineeringSquadOption["members"]>();
  for (const row of memberRows) {
    const current = memberMap.get(row.squadId) ?? [];
    current.push({
      id: row.memberId,
      name: row.memberName,
      roleLabel: row.roleLabel,
      status: row.memberStatus,
      memberRole: row.memberRole,
      sortOrder: row.sortOrder,
    });
    memberMap.set(row.squadId, current);
  }

  const dispatchCountMap = new Map(
    dispatchCountRows
      .filter((row): row is { squadId: string; count: number } => Boolean(row.squadId))
      .map((row) => [row.squadId, row.count]),
  );

  return squads.map((squad) => {
    const members = memberMap.get(squad.id) ?? [];
    const leader =
      members.find((member) => member.id === squad.leaderMemberId) ??
      members.find((member) => member.memberRole === "leader") ??
      null;

    return {
      id: squad.id,
      code: squad.code,
      name: squad.name,
      status: squad.status,
      leaderMemberId: squad.leaderMemberId,
      leaderMemberName: leader?.name ?? null,
      baseLabel: squad.baseLabel,
      summary: squad.summary,
      note: squad.note,
      activeWorkOrderCount: dispatchCountMap.get(squad.id) ?? 0,
      memberCount: members.length,
      members,
    } satisfies EngineeringSquadOption;
  });
}

export async function ensureEngineeringSeedData() {
  const db = getDb();

  await db.transaction(async (tx) => {
    const existingMemberRows = await tx
      .select({ id: engineeringMembers.id, name: engineeringMembers.name })
      .from(engineeringMembers)
      .where(inArray(engineeringMembers.name, MEMBER_SEEDS.map((seed) => seed.name)));
    const existingMemberNames = new Set(existingMemberRows.map((row) => row.name));
    const missingMembers = MEMBER_SEEDS.filter(
      (seed) => !existingMemberNames.has(seed.name),
    );

    if (missingMembers.length > 0) {
      await tx.insert(engineeringMembers).values(
        missingMembers.map((seed) => ({
          id: seed.id,
          name: seed.name,
          phoneNumber: "",
          roleLabel: seed.roleLabel,
          status: "available" as const,
          linkedUserId: null,
          baseLabel: seed.baseLabel,
          currentLocation: null,
          note: "",
          metadata: { importSource: "engineering-team-seed" },
          createdByUserId: null,
          createdAt: now(),
          updatedAt: now(),
        })),
      );
    }

    const existingSquadRows = await tx
      .select({ id: engineeringSquads.id, code: engineeringSquads.code })
      .from(engineeringSquads)
      .where(inArray(engineeringSquads.code, SQUAD_SEEDS.map((seed) => seed.code)));
    const existingSquadCodes = new Set(existingSquadRows.map((row) => row.code));
    const newSquads = SQUAD_SEEDS.filter((seed) => !existingSquadCodes.has(seed.code));

    for (const squadSeed of newSquads) {
      const timestamp = now();
      await tx.insert(engineeringSquads).values({
        id: squadSeed.id,
        code: squadSeed.code,
        name: squadSeed.name,
        status: "standby",
        leaderMemberId: squadSeed.leaderMemberId,
        managerUserId: null,
        baseLabel: squadSeed.baseLabel,
        summary: squadSeed.summary,
        currentLocation: null,
        note: "",
        metadata: { importSource: "engineering-team-seed" },
        createdByUserId: null,
        archivedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await syncSquadMembers(
        tx,
        squadSeed.id,
        squadSeed.memberIds,
        squadSeed.leaderMemberId,
        timestamp,
      );
    }
  });
}

export async function listEngineeringMembers() {
  await ensureEngineeringSeedData();
  const db = getDb();

  const [memberRows, membershipRows] = await Promise.all([
    db
      .select({
        id: engineeringMembers.id,
        name: engineeringMembers.name,
        roleLabel: engineeringMembers.roleLabel,
        status: engineeringMembers.status,
        baseLabel: engineeringMembers.baseLabel,
        linkedUserId: engineeringMembers.linkedUserId,
        note: engineeringMembers.note,
      })
      .from(engineeringMembers)
      .orderBy(asc(engineeringMembers.name)),
    db
      .select({
        memberId: engineeringSquadMembers.memberId,
        squadId: engineeringSquadMembers.squadId,
        squadName: engineeringSquads.name,
        squadCode: engineeringSquads.code,
      })
      .from(engineeringSquadMembers)
      .innerJoin(
        engineeringSquads,
        eq(engineeringSquads.id, engineeringSquadMembers.squadId),
      )
      .where(
        and(
          eq(engineeringSquadMembers.isActive, true),
          isNull(engineeringSquads.archivedAt),
        ),
      ),
  ]);

  const membershipMap = new Map(membershipRows.map((row) => [row.memberId, row]));

  return memberRows.map((row) => {
    const membership = membershipMap.get(row.id);

    return {
      ...row,
      currentSquadId: membership?.squadId ?? null,
      currentSquadName: membership?.squadName ?? null,
      currentSquadCode: membership?.squadCode ?? null,
    } satisfies EngineeringMemberOption;
  });
}

export async function listEngineeringSquads(options?: { includeArchived?: boolean }) {
  await ensureEngineeringSeedData();
  return getSquadRowsWithMembers(options?.includeArchived ?? false);
}

export async function getEngineeringDispatchOptions() {
  const [members, squads] = await Promise.all([
    listEngineeringMembers(),
    listEngineeringSquads(),
  ]);

  return {
    members,
    squads,
  };
}

async function getSquadById(id: string) {
  const squads = await getSquadRowsWithMembers(true);
  return squads.find((row) => row.id === id) ?? null;
}

async function ensureMembersExist(memberIds: string[]) {
  if (memberIds.length === 0) {
    return [];
  }

  const db = getDb();
  const rows = await db
    .select({
      id: engineeringMembers.id,
      name: engineeringMembers.name,
    })
    .from(engineeringMembers)
    .where(inArray(engineeringMembers.id, memberIds));

  if (rows.length !== memberIds.length) {
    throw new Error("INVALID_MEMBER_IDS");
  }

  return rows;
}

export async function createEngineeringSquad(
  actor: AuthenticatedUser,
  input: CreateEngineeringSquadInput,
) {
  ensureEngineeringManager(actor);
  await ensureEngineeringSeedData();

  const name = normalizeText(input.name);
  const code = normalizeCode(input.code || name.replace(/\s+/g, "-"));
  const summary = normalizeText(input.summary);
  const baseLabel = normalizeText(input.baseLabel);
  const note = normalizeText(input.note);
  const requestedMemberIds = uniqueIds(input.memberIds ?? []);
  const leaderMemberId = normalizeText(input.leaderMemberId) || null;
  const memberIds = uniqueIds(
    leaderMemberId ? [leaderMemberId, ...requestedMemberIds] : requestedMemberIds,
  );

  if (!name) {
    throw new Error("INVALID_SQUAD_NAME");
  }

  if (!code) {
    throw new Error("INVALID_SQUAD_CODE");
  }

  await ensureMembersExist(memberIds);

  const db = getDb();
  const existing = await db
    .select({ id: engineeringSquads.id })
    .from(engineeringSquads)
    .where(
      and(
        isNull(engineeringSquads.archivedAt),
        or(eq(engineeringSquads.name, name), eq(engineeringSquads.code, code)),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    throw new Error("SQUAD_ALREADY_EXISTS");
  }

  const timestamp = now();
  const squadId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(engineeringSquads).values({
      id: squadId,
      code,
      name,
      status: "standby",
      leaderMemberId,
      managerUserId: null,
      baseLabel,
      summary,
      currentLocation: null,
      note,
      metadata: { createdFrom: "engineering-api" },
      createdByUserId: input.createdByUserId ?? actor.id,
      archivedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await syncSquadMembers(tx, squadId, memberIds, leaderMemberId, timestamp);
  });

  return getSquadById(squadId);
}

export async function updateEngineeringSquad(
  actor: AuthenticatedUser,
  input: UpdateEngineeringSquadInput,
) {
  ensureEngineeringManager(actor);
  await ensureEngineeringSeedData();

  const current = await getSquadById(input.id);
  if (!current) {
    return null;
  }

  const name =
    typeof input.name !== "undefined" ? normalizeText(input.name) : current.name;
  const code =
    typeof input.code !== "undefined" ? normalizeCode(input.code) : current.code;
  const summary =
    typeof input.summary !== "undefined"
      ? normalizeText(input.summary)
      : current.summary;
  const baseLabel =
    typeof input.baseLabel !== "undefined"
      ? normalizeText(input.baseLabel)
      : current.baseLabel;
  const note =
    typeof input.note !== "undefined" ? normalizeText(input.note) : current.note;
  const memberIds =
    typeof input.memberIds !== "undefined"
      ? uniqueIds(input.memberIds)
      : current.members.map((member) => member.id);
  const leaderMemberId =
    typeof input.leaderMemberId !== "undefined"
      ? normalizeText(input.leaderMemberId) || null
      : current.leaderMemberId;
  const normalizedMemberIds = uniqueIds(
    leaderMemberId ? [leaderMemberId, ...memberIds] : memberIds,
  );

  if (!name) {
    throw new Error("INVALID_SQUAD_NAME");
  }

  if (!code) {
    throw new Error("INVALID_SQUAD_CODE");
  }

  await ensureMembersExist(normalizedMemberIds);

  const db = getDb();
  const existing = await db
    .select({ id: engineeringSquads.id })
    .from(engineeringSquads)
    .where(
      and(
        isNull(engineeringSquads.archivedAt),
        ne(engineeringSquads.id, input.id),
        or(eq(engineeringSquads.name, name), eq(engineeringSquads.code, code)),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    throw new Error("SQUAD_ALREADY_EXISTS");
  }

  const timestamp = now();

  await db.transaction(async (tx) => {
    await tx
      .update(engineeringSquads)
      .set({
        name,
        code,
        status: input.status ?? current.status,
        leaderMemberId,
        baseLabel,
        summary,
        note,
        updatedAt: timestamp,
      })
      .where(eq(engineeringSquads.id, input.id));

    await syncSquadMembers(
      tx,
      input.id,
      normalizedMemberIds,
      leaderMemberId,
      timestamp,
    );
  });

  return getSquadById(input.id);
}

export async function archiveEngineeringSquad(
  actor: AuthenticatedUser,
  squadId: string,
) {
  ensureEngineeringManager(actor);
  await ensureEngineeringSeedData();

  const current = await getSquadById(squadId);
  if (!current) {
    return false;
  }

  const db = getDb();
  const timestamp = now();

  await db.transaction(async (tx) => {
    await tx
      .update(engineeringSquads)
      .set({
        status: "archived",
        archivedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(engineeringSquads.id, squadId));

    await tx
      .update(engineeringSquadMembers)
      .set({
        isActive: false,
        leftAt: timestamp,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(engineeringSquadMembers.squadId, squadId),
          eq(engineeringSquadMembers.isActive, true),
        ),
      );
  });

  return true;
}
