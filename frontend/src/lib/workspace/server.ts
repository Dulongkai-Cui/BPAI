import "server-only";

import { randomBytes } from "node:crypto";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { mutateAppStore, readAppStore } from "@/lib/auth/server";
import type {
  AppStore,
  StoredCollaborationSpace,
  StoredCollaborationSpaceMembers,
} from "@/lib/auth/types";
import {
  assignedSystemForms,
  collaborationSpaces,
  collaborationUpdates,
  normalizeWorkspaceEmail,
  workspaceDetailSeeds,
  workspaceMemberProfiles,
  type AssignedSystemForm,
  type CollaborationSpace,
  type CollaborationUpdate,
  type WorkspaceDetailSeed,
  type WorkspaceMemberProfile,
} from "@/lib/workspace/mock-data";

export type WorkspaceContactOption = {
  id: string;
  email: string;
  name: string;
  roleLabel: string;
  teamLabel: string;
};

function nowIso() {
  return new Date().toISOString();
}

function buildCollaborationMemberStateId(workspaceId: string) {
  return `collaboration-members-${workspaceId}`;
}

function buildCollaborationSpaceId(name: string) {
  const safeSeed = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);

  return `space-${safeSeed || "custom"}-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
}

function formatWorkspaceUpdatedAt(iso: string) {
  const diffMs = Date.now() - Date.parse(iso);

  if (diffMs < 1000 * 60) {
    return "刚刚";
  }

  if (diffMs < 1000 * 60 * 60) {
    return `${Math.max(1, Math.floor(diffMs / (1000 * 60)))} 分钟前`;
  }

  if (diffMs < 1000 * 60 * 60 * 24) {
    return `今天 ${new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso))}`;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function mapStoredSpaceToCollaborationSpace(
  space: StoredCollaborationSpace,
  memberState: StoredCollaborationSpaceMembers | null,
): CollaborationSpace {
  return {
    id: space.id,
    name: space.name,
    summary: space.summary,
    ownerEmail: space.ownerEmail,
    memberEmails: memberState?.memberEmails ?? space.memberEmails,
    documentCount: space.documentCount,
    systemFormCount: space.systemFormCount,
    updatedAt: formatWorkspaceUpdatedAt(space.updatedAt),
    tone: space.tone,
  };
}

function mergeSpaceWithMemberState(
  space: CollaborationSpace,
  memberState: StoredCollaborationSpaceMembers | null,
): CollaborationSpace {
  if (!memberState) {
    return space;
  }

  return {
    ...space,
    memberEmails: memberState.memberEmails,
  };
}

function uniqueEmails(emails: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const email of emails) {
    const normalized = normalizeWorkspaceEmail(email);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push(normalized);
  }

  return next;
}

function canManageSpaceMembers(user: AuthenticatedUser, space: CollaborationSpace) {
  return (
    normalizeWorkspaceEmail(user.email) === normalizeWorkspaceEmail(space.ownerEmail) ||
    user.roleKey === "system_admin"
  );
}

function isSpaceOwner(user: AuthenticatedUser, space: CollaborationSpace) {
  return normalizeWorkspaceEmail(user.email) === normalizeWorkspaceEmail(space.ownerEmail);
}

export async function getCollaborationSpaces() {
  const store = await readAppStore();
  const dissolvedSpaceIds = new Set(store.dissolvedCollaborationSpaceIds);
  const memberStateMap = new Map(
    store.collaborationSpaceMembers.map((state) => [state.workspaceId, state]),
  );
  const storedSpaces = [...store.collaborationSpaces]
    .filter((space) => !dissolvedSpaceIds.has(space.id))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .map((space) =>
      mapStoredSpaceToCollaborationSpace(space, memberStateMap.get(space.id) ?? null),
    );
  const seededSpaces = collaborationSpaces
    .filter((space) => !dissolvedSpaceIds.has(space.id))
    .map((space) => mergeSpaceWithMemberState(space, memberStateMap.get(space.id) ?? null));

  return [...storedSpaces, ...seededSpaces];
}

export async function getCollaborationSpaceById(workspaceId: string) {
  const spaces = await getCollaborationSpaces();
  return spaces.find((space) => space.id === workspaceId) ?? null;
}

export async function getSpacesForUser(email: string) {
  const normalizedEmail = normalizeWorkspaceEmail(email);
  const spaces = await getCollaborationSpaces();

  return {
    createdSpaces: spaces.filter(
      (space) => normalizeWorkspaceEmail(space.ownerEmail) === normalizedEmail,
    ),
    joinedSpaces: spaces.filter(
      (space) =>
        normalizeWorkspaceEmail(space.ownerEmail) !== normalizedEmail &&
        space.memberEmails.some(
          (memberEmail) => normalizeWorkspaceEmail(memberEmail) === normalizedEmail,
        ),
    ),
  };
}

export function getAssignedFormsForUser(email: string): AssignedSystemForm[] {
  const normalizedEmail = normalizeWorkspaceEmail(email);

  return assignedSystemForms.filter(
    (form) => normalizeWorkspaceEmail(form.assigneeEmail) === normalizedEmail,
  );
}

export function getUpdatesForSpaceIds(spaceIds: string[]): CollaborationUpdate[] {
  const spaceIdSet = new Set(spaceIds);
  return collaborationUpdates.filter((item) => spaceIdSet.has(item.spaceId));
}

export function getWorkspaceDetailSeed(spaceId: string): WorkspaceDetailSeed | null {
  return workspaceDetailSeeds[spaceId] ?? null;
}

export async function getWorkspaceMemberProfiles(spaceId: string) {
  const [space, store] = await Promise.all([
    getCollaborationSpaceById(spaceId),
    readAppStore(),
  ]);

  if (!space) {
    return [] as WorkspaceMemberProfile[];
  }

  const seedProfiles = workspaceMemberProfiles[spaceId] ?? [];
  const profileMap = new Map(
    seedProfiles.map((profile) => [normalizeWorkspaceEmail(profile.email), profile]),
  );
  const userMap = new Map(
    store.users.map((user) => [normalizeWorkspaceEmail(user.email), user]),
  );

  return space.memberEmails.map((memberEmail) => {
    const normalized = normalizeWorkspaceEmail(memberEmail);
    const profile = profileMap.get(normalized);

    if (profile) {
      return profile;
    }

    const user = userMap.get(normalized);

    return {
      email: memberEmail,
      role: user?.roleLabel ?? "空间成员",
      team: user?.teamLabel ?? "协作成员",
    } satisfies WorkspaceMemberProfile;
  });
}

export async function getWorkspaceContactOptions(workspaceId: string) {
  const [space, store] = await Promise.all([
    getCollaborationSpaceById(workspaceId),
    readAppStore(),
  ]);

  if (!space) {
    return [] as WorkspaceContactOption[];
  }

  const memberSet = new Set(space.memberEmails.map((email) => normalizeWorkspaceEmail(email)));

  return store.users
    .filter((user) => !memberSet.has(normalizeWorkspaceEmail(user.email)))
    .map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      roleLabel: user.roleLabel,
      teamLabel: user.teamLabel,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}

export async function getWorkspaceCreationContactOptions(currentUserEmail: string) {
  const store = await readAppStore();
  const normalizedCurrentUserEmail = normalizeWorkspaceEmail(currentUserEmail);

  return store.users
    .filter((user) => normalizeWorkspaceEmail(user.email) !== normalizedCurrentUserEmail)
    .map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      roleLabel: user.roleLabel,
      teamLabel: user.teamLabel,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}

function buildNextMemberState(
  workspaceId: string,
  memberEmails: string[],
  existingState: StoredCollaborationSpaceMembers | null,
) {
  const timestamp = nowIso();

  return {
    id: buildCollaborationMemberStateId(workspaceId),
    workspaceId,
    memberEmails,
    createdAt: existingState?.createdAt ?? timestamp,
    updatedAt: timestamp,
  } satisfies StoredCollaborationSpaceMembers;
}

async function updateWorkspaceMemberEmails(params: {
  workspaceId: string;
  memberEmails: string[];
}) {
  const { workspaceId } = params;
  const nextMemberEmails = uniqueEmails(params.memberEmails);

  return mutateAppStore((store) => {
    const existingState =
      store.collaborationSpaceMembers.find((item) => item.workspaceId === workspaceId) ?? null;
    const nextState = buildNextMemberState(workspaceId, nextMemberEmails, existingState);
    const existingIndex = store.collaborationSpaceMembers.findIndex(
      (item) => item.workspaceId === workspaceId,
    );

    const nextMemberStates =
      existingIndex >= 0
        ? store.collaborationSpaceMembers.map((item, index) =>
            index === existingIndex ? nextState : item,
          )
        : [...store.collaborationSpaceMembers, nextState];

    return {
      store: {
        ...store,
        collaborationSpaceMembers: nextMemberStates,
      } as AppStore,
      result: nextState,
    };
  });
}

export async function inviteMembersToWorkspace(params: {
  actor: AuthenticatedUser;
  workspaceId: string;
  memberEmails: string[];
}) {
  const { actor, workspaceId } = params;
  const space = await getCollaborationSpaceById(workspaceId);

  if (!space) {
    return null;
  }

  if (!canManageSpaceMembers(actor, space)) {
    throw new Error("FORBIDDEN");
  }

  const nextMemberEmails = uniqueEmails([...space.memberEmails, ...params.memberEmails]);
  await updateWorkspaceMemberEmails({
    workspaceId,
    memberEmails: nextMemberEmails,
  });

  return getCollaborationSpaceById(workspaceId);
}

export async function removeMemberFromWorkspace(params: {
  actor: AuthenticatedUser;
  workspaceId: string;
  memberEmail: string;
}) {
  const { actor, workspaceId, memberEmail } = params;
  const space = await getCollaborationSpaceById(workspaceId);

  if (!space) {
    return null;
  }

  if (!canManageSpaceMembers(actor, space)) {
    throw new Error("FORBIDDEN");
  }

  const normalizedTarget = normalizeWorkspaceEmail(memberEmail);
  const normalizedOwner = normalizeWorkspaceEmail(space.ownerEmail);

  if (normalizedTarget === normalizedOwner) {
    throw new Error("CANNOT_REMOVE_OWNER");
  }

  const nextMemberEmails = space.memberEmails.filter(
    (email) => normalizeWorkspaceEmail(email) !== normalizedTarget,
  );

  await updateWorkspaceMemberEmails({
    workspaceId,
    memberEmails: nextMemberEmails,
  });

  return getCollaborationSpaceById(workspaceId);
}

export async function createCollaborationSpace(params: {
  actor: AuthenticatedUser;
  name: string;
  summary: string;
  tone: CollaborationSpace["tone"];
  memberEmails: string[];
}) {
  const trimmedName = params.name.trim();
  const trimmedSummary = params.summary.trim();

  if (!trimmedName) {
    throw new Error("INVALID_NAME");
  }

  const timestamp = nowIso();
  const nextSpace: StoredCollaborationSpace = {
    id: buildCollaborationSpaceId(trimmedName),
    name: trimmedName,
    summary: trimmedSummary || "新建合作空间，成员可在这里整理共享资料和系统文档。",
    ownerEmail: normalizeWorkspaceEmail(params.actor.email),
    memberEmails: uniqueEmails([params.actor.email, ...params.memberEmails]),
    documentCount: 0,
    systemFormCount: 0,
    tone: params.tone,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return mutateAppStore((store) => ({
    store: {
      ...store,
      collaborationSpaces: [nextSpace, ...store.collaborationSpaces],
    } as AppStore,
    result: mapStoredSpaceToCollaborationSpace(nextSpace, null),
  }));
}

export async function dissolveCollaborationSpace(params: {
  actor: AuthenticatedUser;
  workspaceId: string;
}) {
  const { actor, workspaceId } = params;
  const space = await getCollaborationSpaceById(workspaceId);

  if (!space) {
    return null;
  }

  if (!isSpaceOwner(actor, space)) {
    throw new Error("FORBIDDEN");
  }

  const timestamp = nowIso();

  return mutateAppStore((store) => {
    const dissolvedIds = new Set(store.dissolvedCollaborationSpaceIds);
    dissolvedIds.add(workspaceId);

    const migrateAssets = <T extends { workspaceId: string; trashedAt?: string | null; updatedAt: string }>(
      assets: T[],
    ) =>
      assets.map((asset) =>
        asset.workspaceId === workspaceId
          ? {
              ...asset,
              workspaceId: actor.workspaceId,
              trashedAt: asset.trashedAt ?? timestamp,
              updatedAt: timestamp,
            }
          : asset,
      );

    return {
      store: {
        ...store,
        documents: migrateAssets(store.documents),
        sheets: migrateAssets(store.sheets),
        slides: migrateAssets(store.slides),
        collaborationSpaces: store.collaborationSpaces.filter(
          (item) => item.id !== workspaceId,
        ),
        collaborationSpaceMembers: store.collaborationSpaceMembers.filter(
          (item) => item.workspaceId !== workspaceId,
        ),
        workspaceBrowserStates: store.workspaceBrowserStates.filter(
          (item) => item.workspaceId !== workspaceId,
        ),
        dissolvedCollaborationSpaceIds: [...dissolvedIds],
      } as AppStore,
      result: {
        workspaceId,
      },
    };
  });
}
