import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AppStore,
  AuthenticatedUser,
  StoredSession,
  StoredUser,
  StoredWorkspace,
  UserRoleKey,
} from "@/lib/auth/types";

export const AUTH_COOKIE_NAME = "bpai_session";

const STORE_DIR = path.join(process.cwd(), ".bpai");
const STORE_PATH = path.join(STORE_DIR, "app-store.json");
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const SESSION_SECRET =
  process.env.BPAI_SESSION_SECRET ?? "bpai-local-session-secret";

type SessionTokenPayload = {
  sessionId: string;
  userId: string;
  expiresAt: string;
};

type SeedUserDefinition = {
  id: string;
  name: string;
  email: string;
  password: string;
  roleKey: UserRoleKey;
  roleLabel: string;
  teamLabel: string;
  workspaceId: string;
  workspaceLabel: string;
};

type BootstrapAccountSummary = {
  name: string;
  email: string;
  password: string;
  roleLabel: string;
  teamLabel: string;
  workspaceLabel: string;
};

declare global {
  var __bpaiStoreMutationQueue: Promise<void> | undefined;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(`${normalized}${"=".repeat(padLength)}`, "base64").toString(
    "utf8",
  );
}

function createPasswordHash(password: string, salt: string) {
  return pbkdf2Sync(
    password,
    salt,
    PASSWORD_ITERATIONS,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST,
  ).toString("hex");
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function getPrimarySeedUserDefinition(): SeedUserDefinition {
  const email =
    process.env.BPAI_FIRST_USER_EMAIL ?? "dulongkai.cui@akane.waseda.jp";

  return {
    id: "user-first-local",
    name: process.env.BPAI_FIRST_USER_NAME ?? "Dulongkai Cui",
    email: normalizeEmail(email),
    password: process.env.BPAI_FIRST_USER_PASSWORD ?? "bpai-local-001",
    roleKey: "dispatcher",
    roleLabel: "调度者 / 项目负责人",
    teamLabel: process.env.BPAI_FIRST_USER_TEAM ?? "产品孵化器",
    workspaceId: "workspace-personal-first",
    workspaceLabel: "我的主工作区",
  };
}

function getSeedUserDefinitions(): SeedUserDefinition[] {
  return [
    getPrimarySeedUserDefinition(),
    {
      id: "user-design-local",
      name: "李工",
      email: "li.gong@bpai.local",
      password: "bpai-local-002",
      roleKey: "document_editor",
      roleLabel: "文档编辑者 / 联审负责人",
      teamLabel: "设计院联审组",
      workspaceId: "workspace-personal-design",
      workspaceLabel: "李工的工作区",
    },
    {
      id: "user-engineering-local",
      name: "周宇",
      email: "zhou.yu@bpai.local",
      password: "bpai-local-003",
      roleKey: "comment_reviewer",
      roleLabel: "工程协作者 / 评论者",
      teamLabel: "工程执行组",
      workspaceId: "workspace-personal-engineering",
      workspaceLabel: "周宇的工作区",
    },
    {
      id: "user-admin-local",
      name: "林敏",
      email: "lin.min@bpai.local",
      password: "bpai-local-004",
      roleKey: "system_admin",
      roleLabel: "系统管理员 / 权限治理",
      teamLabel: "系统治理组",
      workspaceId: "workspace-personal-admin",
      workspaceLabel: "林敏的工作区",
    },
  ];
}

function toBootstrapAccountSummary(
  seedUser: SeedUserDefinition,
): BootstrapAccountSummary {
  return {
    name: seedUser.name,
    email: seedUser.email,
    password: seedUser.password,
    roleLabel: seedUser.roleLabel,
    teamLabel: seedUser.teamLabel,
    workspaceLabel: seedUser.workspaceLabel,
  };
}

export function getBootstrapAccountSummary() {
  return toBootstrapAccountSummary(getSeedUserDefinitions()[0]);
}

export function getBootstrapAccountSummaries() {
  return getSeedUserDefinitions().map(toBootstrapAccountSummary);
}

function createSeedUser(
  seedUser: SeedUserDefinition,
  timestamp: string,
): StoredUser {
  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = createPasswordHash(seedUser.password, passwordSalt);

  return {
    id: seedUser.id,
    name: seedUser.name,
    email: seedUser.email,
    roleKey: seedUser.roleKey,
    roleLabel: seedUser.roleLabel,
    teamLabel: seedUser.teamLabel,
    passwordHash,
    passwordSalt,
    primaryWorkspaceId: seedUser.workspaceId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createSeedWorkspace(
  seedUser: SeedUserDefinition,
  timestamp: string,
): StoredWorkspace {
  return {
    id: seedUser.workspaceId,
    name: seedUser.workspaceLabel,
    kind: "personal",
    ownerUserId: seedUser.id,
    visibility: "private",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function ensureSeedUsersPresent(store: AppStore) {
  const seedUsers = getSeedUserDefinitions();
  let nextStore = store;
  let changed = false;

  for (const seedUser of seedUsers) {
    const existingUser = nextStore.users.find(
      (user) =>
        user.id === seedUser.id ||
        normalizeEmail(user.email) === normalizeEmail(seedUser.email),
    );

    if (!existingUser) {
      const createdAt = nowIso();
      nextStore = {
        ...nextStore,
        users: [...nextStore.users, createSeedUser(seedUser, createdAt)],
      };
      changed = true;
    }

    const existingWorkspace = nextStore.workspaces.find(
      (workspace) => workspace.id === seedUser.workspaceId,
    );

    if (!existingWorkspace) {
      const createdAt = nowIso();
      nextStore = {
        ...nextStore,
        workspaces: [
          ...nextStore.workspaces,
          createSeedWorkspace(seedUser, createdAt),
        ],
      };
      changed = true;
    }
  }

  return changed ? nextStore : store;
}

function createSeedStore(): AppStore {
  const timestamp = nowIso();
  const seedUsers = getSeedUserDefinitions();

  return {
    version: 1,
    users: seedUsers.map((seedUser) => createSeedUser(seedUser, timestamp)),
    workspaces: seedUsers.map((seedUser) =>
      createSeedWorkspace(seedUser, timestamp),
    ),
    sessions: [],
    documents: [],
    sheets: [],
    slides: [],
    browserStates: [],
    workspaceBrowserStates: [],
    collaborationSpaces: [],
    collaborationSpaceMembers: [],
    dissolvedCollaborationSpaceIds: [],
  };
}

function normalizeStore(store: Partial<AppStore>) {
  return {
    version: 1 as const,
    users: Array.isArray(store.users) ? store.users : [],
    workspaces: Array.isArray(store.workspaces) ? store.workspaces : [],
    sessions: Array.isArray(store.sessions) ? store.sessions : [],
    documents: Array.isArray(store.documents) ? store.documents : [],
    sheets: Array.isArray(store.sheets) ? store.sheets : [],
    slides: Array.isArray(store.slides) ? store.slides : [],
    browserStates: Array.isArray(store.browserStates) ? store.browserStates : [],
    workspaceBrowserStates: Array.isArray(store.workspaceBrowserStates)
      ? store.workspaceBrowserStates
      : [],
    collaborationSpaces: Array.isArray(store.collaborationSpaces)
      ? store.collaborationSpaces
      : [],
    collaborationSpaceMembers: Array.isArray(store.collaborationSpaceMembers)
      ? store.collaborationSpaceMembers
      : [],
    dissolvedCollaborationSpaceIds: Array.isArray(store.dissolvedCollaborationSpaceIds)
      ? store.dissolvedCollaborationSpaceIds
      : [],
  };
}

async function writeStore(store: AppStore) {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function withStoreMutationLock<T>(operation: () => Promise<T>) {
  const previous = globalThis.__bpaiStoreMutationQueue ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  globalThis.__bpaiStoreMutationQueue = previous
    .catch(() => undefined)
    .then(() => current);

  await previous.catch(() => undefined);

  try {
    return await operation();
  } finally {
    release();
  }
}

async function readOrCreateStore() {
  try {
    const source = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(source) as AppStore;

    if (
      parsed.version === 1 &&
      Array.isArray(parsed.users) &&
      Array.isArray(parsed.workspaces) &&
      Array.isArray(parsed.sessions)
    ) {
      const normalized = ensureSeedUsersPresent(normalizeStore(parsed));

      if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
        await writeStore(normalized);
      }

      return normalized;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
      throw error;
    }
  }

  const seedStore = createSeedStore();
  await writeStore(seedStore);
  return seedStore;
}

export async function readAppStore() {
  return readOrCreateStore();
}

export async function saveAppStore(store: AppStore) {
  await withStoreMutationLock(async () => {
    await writeStore(store);
  });
}

export async function mutateAppStore<T>(
  mutator: (store: AppStore) => Promise<{ store: AppStore; result: T }> | { store: AppStore; result: T },
) {
  return withStoreMutationLock(async () => {
    const store = cleanupExpiredSessions(await readOrCreateStore());
    const outcome = await mutator(store);
    await writeStore(outcome.store);
    return outcome.result;
  });
}

function cleanupExpiredSessions(store: AppStore) {
  const currentTime = Date.now();
  const nextSessions = store.sessions.filter(
    (session) => Date.parse(session.expiresAt) > currentTime,
  );

  if (nextSessions.length === store.sessions.length) {
    return store;
  }

  return {
    ...store,
    sessions: nextSessions,
  };
}

function getWorkspaceForUser(store: AppStore, user: StoredUser) {
  return (
    store.workspaces.find(
      (workspace) => workspace.id === user.primaryWorkspaceId,
    ) ?? null
  );
}

function toAuthenticatedUser(
  user: StoredUser,
  workspace: StoredWorkspace | null,
): AuthenticatedUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleKey: user.roleKey,
    roleLabel: user.roleLabel,
    teamLabel: user.teamLabel,
    workspaceId: workspace?.id ?? user.primaryWorkspaceId,
    workspaceLabel: workspace?.name ?? "我的主工作区",
  };
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function serializeSessionToken(payload: SessionTokenPayload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function parseSessionToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(encodedPayload)) as SessionTokenPayload;
  } catch {
    return null;
  }
}

async function resolveSession(
  token: string | undefined,
): Promise<{
  user: StoredUser;
  workspace: StoredWorkspace | null;
}> {
  const payload = parseSessionToken(token);

  if (!payload) {
    throw new Error("INVALID_SESSION");
  }

  const cleanedStore = cleanupExpiredSessions(await readOrCreateStore());
  const session = cleanedStore.sessions.find(
    (current) =>
      current.id === payload.sessionId && current.userId === payload.userId,
  );

  if (!session || Date.parse(session.expiresAt) <= Date.now()) {
    throw new Error("INVALID_SESSION");
  }

  const user = cleanedStore.users.find((current) => current.id === session.userId);

  if (!user) {
    throw new Error("INVALID_SESSION");
  }

  return {
    user,
    workspace: getWorkspaceForUser(cleanedStore, user),
  };
}

export function buildAuthCookie(expiresAt: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  };
}

export async function authenticateUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const cleanedStore = cleanupExpiredSessions(await readOrCreateStore());
  const user = cleanedStore.users.find(
    (current) => normalizeEmail(current.email) === normalizedEmail,
  );

  if (!user) {
    return null;
  }

  const expectedPasswordHash = createPasswordHash(password, user.passwordSalt);

  if (!secureEqual(expectedPasswordHash, user.passwordHash)) {
    return null;
  }

  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const session: StoredSession = {
    id: randomBytes(24).toString("hex"),
    userId: user.id,
    createdAt,
    expiresAt,
    lastSeenAt: createdAt,
  };

  return mutateAppStore((store) => {
    const sessionUser = store.users.find((current) => current.id === user.id) ?? user;
    const nextStore: AppStore = {
      ...store,
      sessions: [...store.sessions, session],
    };

    return {
      store: nextStore,
      result: {
        token: serializeSessionToken({
          sessionId: session.id,
          userId: session.userId,
          expiresAt: session.expiresAt,
        }),
        expiresAt: session.expiresAt,
        user: toAuthenticatedUser(
          sessionUser,
          getWorkspaceForUser(nextStore, sessionUser),
        ),
      },
    };
  });
}

export async function deleteSession(token: string | undefined) {
  const payload = parseSessionToken(token);

  if (!payload) {
    return;
  }

  await mutateAppStore((store) => ({
    store: {
      ...store,
      sessions: store.sessions.filter(
        (session) => session.id !== payload.sessionId,
      ),
    },
    result: undefined,
  }));
}

export async function getCurrentUserFromToken(token: string | undefined) {
  try {
    const { user, workspace } = await resolveSession(token);
    return toAuthenticatedUser(user, workspace);
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  return getCurrentUserFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
