import {
  DesktopFileBrowser,
  type BrowserCopyTarget,
  type BrowserFile,
  type BrowserFolder,
} from "@/components/docs/desktop-file-browser";
import { requireCurrentUser } from "@/lib/auth/server";
import {
  getBrowserStateForUser,
  getSharedBrowserStateForWorkspace,
  type BrowserInnerFolderState,
} from "@/lib/content/browser-state";
import { buildCadViewerHref, isCadFileName } from "@/lib/content/cad";
import { formatAssetUpdatedAt, listAssetsForUser } from "@/lib/content/server";
import {
  documentFolders,
  documentItems,
  sheetItems,
} from "@/lib/docs/mock-data";
import type { CollaborationSpace } from "@/lib/workspace/mock-data";
import {
  getSpacesForUser,
  getWorkspaceDetailSeed,
} from "@/lib/workspace/server";

const documentFolderTones: BrowserFolder["tone"][] = [
  "blue",
  "amber",
  "emerald",
];

function resolveFileKindFromName(
  fileName: string,
  fallbackKind: BrowserFile["kind"],
): BrowserFile["kind"] {
  const normalizedName = fileName.toLowerCase();

  if (
    normalizedName.endsWith(".xls") ||
    normalizedName.endsWith(".xlsx") ||
    normalizedName.endsWith(".csv")
  ) {
    return "sheet";
  }

  if (
    normalizedName.endsWith(".ppt") ||
    normalizedName.endsWith(".pptx") ||
    normalizedName.endsWith(".pps") ||
    normalizedName.endsWith(".ppsx") ||
    normalizedName.endsWith(".odp")
  ) {
    return "slide";
  }

  return fallbackKind;
}

function resolveDocumentFolderId(docId: string) {
  if (docId.startsWith("doc-weekly")) {
    return "weekly-reports";
  }

  if (docId.startsWith("doc-submission")) {
    return "submission-packs";
  }

  if (docId.startsWith("doc-acceptance")) {
    return "acceptance-files";
  }

  return "all";
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
    innerFolders: [] as BrowserInnerFolderState[],
  };
}

function mergeWorkspaceTargetFolders(
  baseFolders: BrowserFolder[],
  savedFolders: Array<{
    id: string;
    name: string;
    description: string;
    tone: BrowserFolder["tone"];
    icon?: BrowserFolder["icon"];
  }>,
  deletedFolderIds: string[],
) {
  const hiddenFolderIds = new Set(deletedFolderIds);
  const baseFolderIds = new Set(baseFolders.map((folder) => folder.id));
  const folderOverrides = new Map(savedFolders.map((folder) => [folder.id, folder]));
  const extraCustomFolders = savedFolders
    .filter((folder) => !baseFolderIds.has(folder.id))
    .map((folder) => ({
      ...folder,
      count: 0,
      isLocal: true,
    }));

  return [
    ...extraCustomFolders,
    ...baseFolders.map((folder) => {
      const override = folderOverrides.get(folder.id);
      return override ? { ...folder, ...override } : folder;
    }),
  ].filter((folder) => !hiddenFolderIds.has(folder.id));
}

function mergeWorkspaceTargetInnerFolders(
  baseFolders: BrowserInnerFolderState[],
  savedFolders: BrowserInnerFolderState[],
  deletedFolderIds: string[],
) {
  const folderMap = new Map(baseFolders.map((folder) => [folder.id, folder]));

  for (const folder of savedFolders) {
    folderMap.set(folder.id, folder);
  }

  const hiddenFolderIds = new Set(deletedFolderIds);

  return [...folderMap.values()].filter(
    (folder) => !hiddenFolderIds.has(folder.parentFolderId),
  );
}

const spreadsheetFolder: BrowserFolder = {
  id: "sheet-workbooks",
  name: "表格归档",
  description: "台账、清单与跟踪表都统一放在这里。",
  count: 0,
  tone: "violet",
  icon: "briefcase",
};

export default async function DocumentsPage() {
  const user = await requireCurrentUser();
  const personalWorkspaceId = user.workspaceId;
  const [
    uploadedDocumentAssets,
    uploadedSheetAssets,
    uploadedSlideAssets,
    browserState,
    userSpaces,
  ] = await Promise.all([
    listAssetsForUser(user, "document", { workspaceId: personalWorkspaceId }),
    listAssetsForUser(user, "sheet", { workspaceId: personalWorkspaceId }),
    listAssetsForUser(user, "slide", { workspaceId: personalWorkspaceId }),
    getBrowserStateForUser(user, "document", {
      workspaceId: personalWorkspaceId,
    }),
    getSpacesForUser(user.email),
  ]);

  const workspaceCopyTargets = await Promise.all(
    userSpaces.createdSpaces.map(async (space) => {
      const sharedBrowserState = await getSharedBrowserStateForWorkspace(
        space.id,
        "document",
      );
      const seed =
        getWorkspaceDetailSeed(space.id) ?? buildDefaultWorkspaceDetailSeed(space);

      return {
        id: `workspace-${space.id}`,
        label: space.name,
        description: "上传到你创建的合作空间",
        workspaceId: space.id,
        shareMode: "workspace" as const,
        folders: mergeWorkspaceTargetFolders(
          seed.folders,
          sharedBrowserState.customFolders,
          sharedBrowserState.deletedFolderIds,
        ),
        customFolders: sharedBrowserState.customFolders,
        deletedFolderIds: sharedBrowserState.deletedFolderIds,
        innerFolders: mergeWorkspaceTargetInnerFolders(
          seed.innerFolders,
          sharedBrowserState.innerFolders,
          sharedBrowserState.deletedFolderIds,
        ),
        fileStates: sharedBrowserState.fileStates,
        boardMessages: sharedBrowserState.boardMessages,
      } satisfies BrowserCopyTarget;
    }),
  );

  const fileStateMap = new Map(
    browserState.fileStates.map((fileState) => [fileState.fileId, fileState]),
  );
  const uploadedAssets = [
    ...uploadedDocumentAssets,
    ...uploadedSheetAssets,
    ...uploadedSlideAssets,
  ].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const visibleDocumentItems = documentItems.filter((item) => {
    const fileState = fileStateMap.get(item.id);
    return !fileState?.isTrashed && !fileState?.isDeleted;
  });
  const visibleSheetItems = sheetItems.filter((item) => {
    const fileState = fileStateMap.get(item.id);
    return !fileState?.isTrashed && !fileState?.isDeleted;
  });

  const browserFolders: BrowserFolder[] = [
    ...documentFolders.map((folder, index) => ({
      ...folder,
      tone: documentFolderTones[index % documentFolderTones.length],
    })),
    spreadsheetFolder,
  ];

  if (uploadedAssets.length > 0) {
    browserFolders.unshift({
      id: "recent-uploads",
      name: "最近上传",
      description: "你真实上传到个人工作区的文件。",
      count: uploadedAssets.length,
      tone: "violet",
      icon: "briefcase",
    });
  }

  const browserFiles: BrowserFile[] = [
    ...uploadedAssets.map((asset) => ({
      id: asset.id,
      title: asset.title,
      subtitle: "真实上传 / 个人工作区",
      owner: user.name,
      updatedAt: formatAssetUpdatedAt(asset.updatedAt),
      folderId: "recent-uploads",
      tag: "上传",
      href: isCadFileName(asset.storedFileName)
        ? buildCadViewerHref({
            kind: asset.kind,
            assetId: asset.id,
            fileName: asset.originalFileName,
          })
        : `/docs/documents/${asset.id}`,
      kind: resolveFileKindFromName(asset.storedFileName, asset.kind),
      source: "asset" as const,
      storageKind: asset.kind,
      sampleFileName: asset.storedFileName,
    })),
    ...visibleDocumentItems.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      owner: item.owner,
      updatedAt: item.updatedAt,
      folderId: resolveDocumentFolderId(item.id),
      tag: item.tag,
      href: `/docs/documents/${item.id}`,
      kind: "document" as const,
      source: "sample" as const,
      storageKind: "document" as const,
    })),
    ...visibleSheetItems.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: `${item.category} / ${item.owner} / ${item.updatedAt}`,
      owner: item.owner,
      updatedAt: item.updatedAt,
      folderId: "sheet-workbooks",
      tag: item.category,
      href: `/docs/documents/${item.id}`,
      kind: "sheet" as const,
      source: "sample" as const,
      storageKind: "sheet" as const,
    })),
  ];

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.2),transparent_26%),linear-gradient(180deg,#f1f6ff_0%,#f8fbff_42%,#eef3fb_100%)] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1180px]">
        <DesktopFileBrowser
          title="我的文档空间"
          description="管理个人文档、表格与演示文件，需要协作请进入合作空间。"
          sectionEyebrow="文档空间"
          layoutVariant="personal"
          workspaceId={personalWorkspaceId}
          allFolderName="全部文件"
          allFolderDescription="浏览当前工作区中的全部文档、表格和演示文件。"
          folderSectionTitle="文件夹区域"
          contentSectionDescription="选择文件夹后，在这里查看对应内容。"
          newItemLabel="新建文档"
          uploadLabel="上传文件"
          uploadAccept=".txt,.md,.doc,.docx,.pdf,.csv,.xls,.xlsx,.ppt,.pptx,.pps,.ppsx,.odp,.dwg,.dxf"
          uploadKind="auto"
          browserStateKind="document"
          newItemHref="/docs/documents/new"
          newFolderLabel="新建文件夹"
          emptyTitle="这个文件夹还是空的"
          emptyDescription="先新建文档或上传文件。"
          folders={browserFolders}
          files={browserFiles}
          initialActiveFolderId={browserState.activeFolderId}
          initialActiveInnerFolderId={browserState.activeInnerFolderId}
          initialFolderViewMode={browserState.folderViewMode}
          initialDeletedFolderIds={browserState.deletedFolderIds}
          initialCustomFolders={browserState.customFolders.map((folder) => ({
            ...folder,
            count: 0,
            isLocal: true,
          }))}
          initialInnerFolders={browserState.innerFolders}
          initialFileStates={browserState.fileStates}
          copyTargets={workspaceCopyTargets}
        />
      </div>
    </div>
  );
}
