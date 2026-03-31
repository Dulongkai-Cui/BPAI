import { notFound } from "next/navigation";
import {
  DesktopFileBrowser,
  type BrowserBoardMessage,
  type BrowserContactOption,
  type BrowserFile,
  type BrowserFolder,
  type BrowserMemberChip,
} from "@/components/docs/desktop-file-browser";
import { DissolveCollaborationSpaceButton } from "@/components/workspace/dissolve-collaboration-space-button";
import {
  getBootstrapAccountSummaries,
  requireCurrentUser,
} from "@/lib/auth/server";
import {
  getSharedBrowserStateForWorkspace,
  type BrowserFileState,
  type BrowserInnerFolderState,
} from "@/lib/content/browser-state";
import {
  formatAssetUpdatedAt,
  listAssetsForUser,
} from "@/lib/content/server";
import {
  type CollaborationSpace,
  normalizeWorkspaceEmail,
} from "@/lib/workspace/mock-data";
import type { WorkspaceBoardMessage } from "@/lib/workspace/mock-data";
import {
  getCollaborationSpaceById,
  getSpacesForUser,
  getWorkspaceContactOptions,
  getWorkspaceDetailSeed,
  getWorkspaceMemberProfiles,
} from "@/lib/workspace/server";

type WorkspaceDetailPageProps = {
  params: Promise<{ workspaceId: string }>;
};

function initials(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "?";
}

function mergeInnerFolders(
  baseFolders: BrowserInnerFolderState[],
  savedFolders: BrowserInnerFolderState[],
) {
  const folderMap = new Map(baseFolders.map((folder) => [folder.id, folder]));
  for (const folder of savedFolders) {
    folderMap.set(folder.id, folder);
  }
  return [...folderMap.values()];
}

function mergeFileStates(baseStates: BrowserFileState[], savedStates: BrowserFileState[]) {
  const stateMap = new Map(baseStates.map((state) => [state.fileId, state]));
  for (const state of savedStates) {
    stateMap.set(state.fileId, state);
  }
  return [...stateMap.values()];
}

function appendReturnTo(href: string, returnToHref: string) {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}returnTo=${encodeURIComponent(returnToHref)}`;
}

function getWorkspaceHref(workspaceId: string) {
  return `/docs/workspace/${encodeURIComponent(workspaceId)}`;
}

function normalizeSeedBoardMessages(
  messages: WorkspaceBoardMessage[],
  fallbackFolderId: string,
  fallbackInnerFolderId: string | null,
): BrowserBoardMessage[] {
  return messages.map((message) => ({
    id: message.id,
    folderId: message.folderId ?? fallbackFolderId,
    innerFolderId:
      message.innerFolderId !== undefined
        ? message.innerFolderId
        : fallbackInnerFolderId,
    authorName: message.authorName,
    authorRole: message.authorRole,
    message: message.message,
    postedAt: message.postedAt,
  }));
}

function mergeBoardMessages(
  baseMessages: BrowserBoardMessage[],
  savedMessages: BrowserBoardMessage[],
) {
  if (savedMessages.length === 0) {
    return baseMessages;
  }

  const savedIds = new Set(savedMessages.map((message) => message.id));
  const missingBaseMessages = baseMessages.filter((message) => !savedIds.has(message.id));
  return [...savedMessages, ...missingBaseMessages];
}

function buildDefaultWorkspaceDetailSeed(space: CollaborationSpace) {
  return {
    folders: [
      {
        id: "workspace-square",
        name: "文档广场",
        description: "共享说明、通知与公开可协作资料。",
        count: 0,
        tone: space.tone,
        icon: "folder" as const,
      },
      {
        id: "workspace-system",
        name: "系统文档",
        description: "需要受控编辑和后续回写的业务文档。",
        count: 0,
        tone: "amber" as const,
        icon: "briefcase" as const,
      },
      {
        id: "workspace-board",
        name: "留言资料",
        description: "会议纪要、沟通补件和按文件夹沉淀的留言。",
        count: 0,
        tone: "emerald" as const,
        icon: "bookmark" as const,
      },
    ],
    sampleFiles: [],
    innerFolders: [],
    fileStates: [],
    activeFolderId: "workspace-square",
    activeInnerFolderId: null,
    boardMessages: [],
  };
}

export default async function WorkspaceDetailPage({
  params,
}: WorkspaceDetailPageProps) {
  const currentUser = await requireCurrentUser();
  const { workspaceId } = await params;
  const space = await getCollaborationSpaceById(workspaceId);

  if (!space) {
    notFound();
  }

  const seed = getWorkspaceDetailSeed(workspaceId) ?? buildDefaultWorkspaceDetailSeed(space);

  const normalizedUserEmail = normalizeWorkspaceEmail(currentUser.email);
  const isWorkspaceOwner =
    normalizeWorkspaceEmail(space.ownerEmail) === normalizedUserEmail;
  const canAccess = space.memberEmails.some(
    (memberEmail) => normalizeWorkspaceEmail(memberEmail) === normalizedUserEmail,
  );
  const canManageContent = isWorkspaceOwner || currentUser.roleKey === "system_admin";

  if (!canAccess) {
    notFound();
  }

  const returnToHref = getWorkspaceHref(space.id);
  const accounts = getBootstrapAccountSummaries();
  const accountMap = new Map(
    accounts.map((account) => [normalizeWorkspaceEmail(account.email), account]),
  );
  const [memberProfiles, contactOptions] = await Promise.all([
    getWorkspaceMemberProfiles(space.id),
    getWorkspaceContactOptions(space.id),
  ]);
  const { createdSpaces } = await getSpacesForUser(currentUser.email);

  const [uploadedDocuments, uploadedSheets, uploadedSlides, sharedBrowserState] =
    await Promise.all([
      listAssetsForUser(currentUser, "document", { workspaceId: space.id }),
      listAssetsForUser(currentUser, "sheet", { workspaceId: space.id }),
      listAssetsForUser(currentUser, "slide", { workspaceId: space.id }),
      getSharedBrowserStateForWorkspace(space.id, "document"),
    ]);

  const uploadedAssets = [...uploadedDocuments, ...uploadedSheets, ...uploadedSlides].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );

  const browserFolders: BrowserFolder[] = uploadedAssets.length
    ? [
        {
          id: "workspace-recent-uploads",
          name: "空间上传",
          description: "刚上传、尚未归档的空间资料。",
          count: 0,
          tone: "slate",
          icon: "archive",
        },
        ...seed.folders,
      ]
    : seed.folders;

  const browserFiles: BrowserFile[] = [
    ...uploadedAssets.map((asset) => ({
      id: asset.id,
      title: asset.title,
      subtitle: "空间上传 / 当前合作空间",
      owner: accountMap.get(normalizeWorkspaceEmail(currentUser.email))?.name ?? currentUser.name,
      updatedAt: formatAssetUpdatedAt(asset.updatedAt),
      folderId: "workspace-recent-uploads",
      tag: "上传",
      href: appendReturnTo(`/docs/documents/${asset.id}`, returnToHref),
      kind: asset.kind,
      source: "asset" as const,
      storageKind: asset.kind,
    })),
    ...seed.sampleFiles.map((file) => ({
      ...file,
      href: appendReturnTo(file.href, returnToHref),
    })),
  ];

  const mergedInnerFolders = mergeInnerFolders(seed.innerFolders, sharedBrowserState.innerFolders);
  const mergedFileStates = mergeFileStates(seed.fileStates, sharedBrowserState.fileStates);
  const mergedBoardMessages = mergeBoardMessages(
    normalizeSeedBoardMessages(
      seed.boardMessages,
      seed.activeFolderId,
      seed.activeInnerFolderId,
    ),
    sharedBrowserState.boardMessages,
  );
  const memberChips: BrowserMemberChip[] = memberProfiles.map((member) => {
    const account = accountMap.get(normalizeWorkspaceEmail(member.email));
    const displayName = account?.name ?? member.email;

    return {
      id: member.email,
      email: member.email,
      name: displayName,
      avatarLabel: initials(displayName),
    };
  });
  const browserContacts: BrowserContactOption[] = contactOptions.map((contact) => ({
    id: contact.id,
    email: contact.email,
    name: contact.name,
    avatarLabel: initials(contact.name),
    roleLabel: contact.roleLabel,
    teamLabel: contact.teamLabel,
  }));
  const canManageMembers = isWorkspaceOwner || currentUser.roleKey === "system_admin";
  const copyTargets = [
    {
      id: `personal-${currentUser.workspaceId}`,
      label: currentUser.workspaceLabel,
      description: "复制到你的个人文档空间",
      workspaceId: currentUser.workspaceId,
      shareMode: "personal" as const,
    },
    ...createdSpaces
      .filter((item) => item.id !== space.id)
      .map((item) => ({
        id: `workspace-${item.id}`,
        label: item.name,
        description: "复制到你创建的合作空间",
        workspaceId: item.id,
        shareMode: "workspace" as const,
      })),
  ];

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.2),transparent_26%),radial-gradient(circle_at_top_right,rgba(254,240,138,0.12),transparent_24%),linear-gradient(180deg,#f1f6ff_0%,#f8fbff_42%,#eef3fb_100%)] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1180px]">
        {isWorkspaceOwner ? (
          <div className="mb-4 flex justify-end">
            <DissolveCollaborationSpaceButton
              spaceId={space.id}
              spaceName={space.name}
              redirectHref="/docs/workspace"
            />
          </div>
        ) : null}
        <DesktopFileBrowser
          title={`${space.name} 资料区`}
          description="这里统一整理合作空间里的共享资料、系统文档和按文件夹沉淀的留言。"
          sectionEyebrow="合作空间"
          layoutDensity="compact"
          workspaceId={space.id}
          backHref="/docs/workspace"
          returnToHref={returnToHref}
          allFolderName="全部资料"
          allFolderDescription="浏览当前合作空间里的全部共享资料和系统文件。"
          contentSectionDescription="选择文件夹后，在这里继续整理对应资料。"
          newItemLabel="新建文档"
          uploadLabel="上传资料"
          uploadAccept=".txt,.md,.doc,.docx,.pdf,.csv,.xls,.xlsx,.ppt,.pptx,.pps,.ppsx,.odp"
          uploadKind="auto"
          browserStateKind="document"
          newItemHref="/docs/documents/new"
          hideNewItemButton
          newFolderLabel="新建文件夹"
          emptyTitle="这个目录还是空的"
          emptyDescription="先新建一个文件夹，或者把资料拖进当前目录。"
          allowTrashActions={canManageContent}
          allowRootFolderDeletion={isWorkspaceOwner}
          sharedWorkspaceState
          contentAccessMode={canManageContent ? "manage" : "copy-only"}
          copyTargets={canManageContent ? [] : copyTargets}
          memberChips={memberChips}
          contactOptions={browserContacts}
          allowMemberManagement={canManageMembers}
          currentUserIdentity={{
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
            roleLabel: currentUser.roleLabel,
          }}
          folders={browserFolders}
          files={browserFiles}
          initialActiveFolderId={seed.activeFolderId}
          initialActiveInnerFolderId={seed.activeInnerFolderId}
          initialFolderViewMode="small"
          initialDeletedFolderIds={sharedBrowserState.deletedFolderIds}
          initialCustomFolders={sharedBrowserState.customFolders.map((folder) => ({
            ...folder,
            count: 0,
            isLocal: true,
          }))}
          initialInnerFolders={mergedInnerFolders}
          initialFileStates={mergedFileStates}
          initialBoardMessages={mergedBoardMessages}
        />
      </div>
    </div>
  );
}
