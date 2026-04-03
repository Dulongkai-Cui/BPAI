"use client";

import type {
  CSSProperties,
  DragEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type FolderTone = "blue" | "amber" | "emerald" | "slate" | "violet" | "rose";
type FolderIconName = "folder" | "archive" | "bookmark" | "briefcase" | "spark";
type FolderViewMode = "small" | "medium" | "large" | "list";

export type BrowserFolder = {
  id: string;
  name: string;
  count: number;
  description: string;
  tone: FolderTone;
  icon?: FolderIconName;
  isLocal?: boolean;
};

export type BrowserFile = {
  id: string;
  title: string;
  subtitle: string;
  owner: string;
  updatedAt: string;
  folderId: string;
  tag: string;
  href: string;
  kind: "document" | "sheet" | "slide";
  source?: "asset" | "sample";
  storageKind?: "document" | "sheet" | "slide";
  sampleFileName?: string;
};

type BrowserStateKind = BrowserFile["kind"];
type UploadKind = BrowserFile["kind"] | "auto";

export type BrowserMemberChip = {
  id: string;
  email?: string;
  name: string;
  avatarLabel?: string;
};

export type BrowserContactOption = {
  id: string;
  email: string;
  name: string;
  avatarLabel?: string;
  roleLabel?: string;
  teamLabel?: string;
};

export type BrowserBoardMessage = {
  id: string;
  folderId: string;
  innerFolderId: string | null;
  authorUserId?: string;
  authorName: string;
  authorRole?: string;
  message: string;
  postedAt: string;
};

type BrowserCopyTargetInnerFolder = {
  id: string;
  parentFolderId: string;
  parentInnerFolderId: string | null;
  name: string;
  description: string;
  tone: FolderTone;
  icon: FolderIconName;
};

type BrowserCopyTargetFileState = {
  fileId: string;
  folderId: string;
  subfolderId: string | null;
  titleOverride?: string;
  isTrashed?: boolean;
  isDeleted?: boolean;
  trashedAt?: string;
};

export type BrowserCopyTarget = {
  id: string;
  label: string;
  description?: string;
  workspaceId: string;
  shareMode: "personal" | "workspace";
  folders?: BrowserFolder[];
  customFolders?: Array<{
    id: string;
    name: string;
    description: string;
    tone: FolderTone;
    icon?: FolderIconName;
  }>;
  deletedFolderIds?: string[];
  innerFolders?: BrowserCopyTargetInnerFolder[];
  fileStates?: BrowserCopyTargetFileState[];
  boardMessages?: BrowserBoardMessage[];
};

type InnerFolder = {
  id: string;
  parentFolderId: string;
  parentInnerFolderId: string | null;
  name: string;
  description: string;
  tone: FolderTone;
  icon: FolderIconName;
};

type PersistedBrowserFileState = {
  fileId: string;
  folderId: string;
  subfolderId: string | null;
  titleOverride?: string;
  isTrashed?: boolean;
  isDeleted?: boolean;
  trashedAt?: string;
};

type ManagedBrowserFile = BrowserFile & {
  subfolderId: string | null;
  titleOverride?: string;
  isTrashed?: boolean;
  isDeleted?: boolean;
  trashedAt?: string;
};

type DesktopFileBrowserProps = {
  title: string;
  description: string;
  sectionEyebrow: string;
  layoutVariant?: "personal" | "workspace";
  layoutDensity?: "compact" | "comfortable";
  workspaceId?: string;
  backHref?: string;
  returnToHref?: string;
  allFolderName?: string;
  allFolderDescription?: string;
  folderSectionTitle?: string;
  folderSectionDescription?: string;
  contentSectionDescription?: string;
  newItemLabel: string;
  uploadLabel: string;
  uploadAccept: string;
  uploadKind: UploadKind;
  browserStateKind?: BrowserStateKind;
  newItemHref: string;
  hideNewItemButton?: boolean;
  newFolderLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  allowTrashActions?: boolean;
  allowRootFolderDeletion?: boolean;
  sharedWorkspaceState?: boolean;
  memberChips?: BrowserMemberChip[];
  contactOptions?: BrowserContactOption[];
  allowMemberManagement?: boolean;
  currentUserIdentity?: {
    id?: string;
    name: string;
    email?: string;
    roleLabel?: string;
  };
  folders: BrowserFolder[];
  files: BrowserFile[];
  initialActiveFolderId?: string;
  initialActiveInnerFolderId?: string | null;
  initialFolderViewMode?: FolderViewMode;
  initialCustomFolders?: BrowserFolder[];
  initialInnerFolders?: InnerFolder[];
  initialFileStates?: PersistedBrowserFileState[];
  initialDeletedFolderIds?: string[];
  initialBoardMessages?: BrowserBoardMessage[];
  contentAccessMode?: "manage" | "copy-only";
  copyTargets?: BrowserCopyTarget[];
};

type ContextMenu = {
  x: number;
  y: number;
  type: "file" | "folder" | "inner-folder" | "content" | "selection";
  id?: string;
} | null;
type EditTarget = {
  type: "file" | "folder" | "inner-folder";
  id: string;
} | null;
type SelectableItemKind = "file" | "inner-folder";
type ClipboardEntry = {
  kind: SelectableItemKind;
  id: string;
};
type ClipboardItem =
  | {
      mode: "cut" | "copy";
      items: ClipboardEntry[];
    }
  | null;
type DraggedItem =
  | { kind: "file"; id: string }
  | { kind: "inner-folder"; id: string }
  | null;
type SpaceUploadSource =
  | { kind: "file"; id: string }
  | { kind: "folder"; id: string }
  | { kind: "inner-folder"; id: string }
  | null;
type CreateItemKind = BrowserFile["kind"];
type CreateItemTemplateOption = {
  value: CreateItemKind;
  label: string;
  helper: string;
  extension: string;
  sampleFileName?: string;
  disabled?: boolean;
  disabledReason?: string;
};

type SelectionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
} | null;

const EMPTY_MEMBERS: BrowserMemberChip[] = [];
const EMPTY_CONTACTS: BrowserContactOption[] = [];
const EMPTY_TARGETS: BrowserCopyTarget[] = [];
const EMPTY_FOLDERS: BrowserFolder[] = [];
const EMPTY_INNER_FOLDERS: InnerFolder[] = [];
const EMPTY_FILE_STATES: PersistedBrowserFileState[] = [];
const EMPTY_DELETED_FOLDER_IDS: string[] = [];
const EMPTY_BOARD_MESSAGES: BrowserBoardMessage[] = [];
const DEFAULT_FOLDER_NAME = "新建文件夹";
const DEFAULT_NEW_ITEM_NAME: Record<CreateItemKind, string> = {
  document: "未命名文档",
  sheet: "未命名表格",
  slide: "未命名演示",
};
const CREATE_ITEM_TEMPLATE_OPTIONS: CreateItemTemplateOption[] = [
  {
    value: "document",
    label: "文档",
    helper: "新建可直接进入 OnlyOffice 的空白文档",
    extension: "docx",
    sampleFileName: "new.docx",
  },
  {
    value: "sheet",
    label: "表格",
    helper: "创建空白表格并直接进入编辑页",
    extension: "xlsx",
    sampleFileName: "sheet-new.xlsx",
  },
  {
    value: "slide",
    label: "演示稿",
    helper: "创建空白演示稿并直接进入编辑页",
    extension: "pptx",
    sampleFileName: "slide-new.pptx",
  },
];
const NON_DESTINATION_FOLDER_IDS = new Set(["recent-uploads", "workspace-recent-uploads"]);
const toneOptions: FolderTone[] = [
  "blue",
  "amber",
  "emerald",
  "violet",
  "rose",
  "slate",
];
const folderIconOptions: Array<{ value: FolderIconName; label: string }> = [
  { value: "folder", label: "经典文件夹" },
  { value: "archive", label: "归档盒" },
  { value: "bookmark", label: "书签夹" },
  { value: "briefcase", label: "资料包" },
  { value: "spark", label: "灵感夹" },
];
const toneLabels: Record<FolderTone, string> = {
  blue: "蓝色",
  amber: "橙色",
  emerald: "绿色",
  violet: "紫色",
  rose: "粉色",
  slate: "灰色",
};
const titleClamp: CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
};
const descriptionClamp: CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
};

const toneStyles: Record<
  FolderTone,
  { surface: string; border: string; chip: string; tab: string; accent: string }
> = {
  blue: {
    surface: "bg-blue-50/80",
    border: "border-blue-200",
    chip: "bg-blue-100 text-blue-700",
    tab: "bg-blue-100",
    accent: "text-blue-700",
  },
  amber: {
    surface: "bg-amber-50/80",
    border: "border-amber-200",
    chip: "bg-amber-100 text-amber-700",
    tab: "bg-amber-100",
    accent: "text-amber-700",
  },
  emerald: {
    surface: "bg-emerald-50/80",
    border: "border-emerald-200",
    chip: "bg-emerald-100 text-emerald-700",
    tab: "bg-emerald-100",
    accent: "text-emerald-700",
  },
  slate: {
    surface: "bg-slate-50/90",
    border: "border-slate-200",
    chip: "bg-slate-100 text-slate-700",
    tab: "bg-slate-100",
    accent: "text-slate-700",
  },
  violet: {
    surface: "bg-violet-50/80",
    border: "border-violet-200",
    chip: "bg-violet-100 text-violet-700",
    tab: "bg-violet-100",
    accent: "text-violet-700",
  },
  rose: {
    surface: "bg-rose-50/80",
    border: "border-rose-200",
    chip: "bg-rose-100 text-rose-700",
    tab: "bg-rose-100",
    accent: "text-rose-700",
  },
};

function sameMembers(a: BrowserMemberChip[], b: BrowserMemberChip[]) {
  return (
    a.length === b.length &&
    a.every((v, i) => JSON.stringify(v) === JSON.stringify(b[i]))
  );
}
function sameContacts(a: BrowserContactOption[], b: BrowserContactOption[]) {
  return (
    a.length === b.length &&
    a.every((v, i) => JSON.stringify(v) === JSON.stringify(b[i]))
  );
}
function sameArrayByValue<T>(a: T[], b: T[]) {
  return (
    a.length === b.length &&
    a.every((v, i) => JSON.stringify(v) === JSON.stringify(b[i]))
  );
}
function makeId(prefix: string) {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}
function initial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}
function fmt(ts: string) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ts
    : new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
}
function withReturnTo(href: string, returnToHref?: string) {
  if (!returnToHref) return href;
  const s = href.includes("?") ? "&" : "?";
  return `${href}${s}returnTo=${encodeURIComponent(returnToHref)}`;
}
function ensureTitleForKind(name: string, kind: CreateItemKind) {
  const option = CREATE_ITEM_TEMPLATE_OPTIONS.find((item) => item.value === kind);
  const extension = option?.extension ?? "docx";
  const fallback = DEFAULT_NEW_ITEM_NAME[kind];
  const baseName = (name || "")
    .trim()
    .replace(/\.[^.]+$/u, "")
    .trim();

  return `${baseName || fallback}.${extension}`;
}
function hasExternalFiles(e: DragEvent<HTMLElement>) {
  return (
    e.dataTransfer.files.length > 0 ||
    Array.from(e.dataTransfer.items ?? []).some(
      (item) => item.kind === "file",
    ) ||
    Array.from(e.dataTransfer.types ?? []).includes("Files")
  );
}
function applyFileStates(
  files: BrowserFile[],
  states: PersistedBrowserFileState[],
) {
  const map = new Map(states.map((s) => [s.fileId, s]));
  return files.map((f) => {
    const s = map.get(f.id);
    return {
      ...f,
      folderId: s?.folderId ?? f.folderId,
      subfolderId: s?.subfolderId ?? null,
      titleOverride: s?.titleOverride,
      title: s?.titleOverride?.trim() ? s.titleOverride : f.title,
      isTrashed: s?.isTrashed ?? false,
      isDeleted: s?.isDeleted ?? false,
      trashedAt: s?.trashedAt,
    };
  });
}
function readViewState(key: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as {
      activeFolderId?: unknown;
      activeInnerFolderId?: unknown;
      folderViewMode?: unknown;
    };
    if (typeof p.activeFolderId !== "string") return null;
    if (
      !(
        p.activeInnerFolderId === null ||
        typeof p.activeInnerFolderId === "string"
      )
    )
      return null;
    if (
      !["small", "medium", "large", "list"].includes(String(p.folderViewMode))
    )
      return null;
    return {
      activeFolderId: p.activeFolderId,
      activeInnerFolderId: p.activeInnerFolderId as string | null,
      folderViewMode: p.folderViewMode as FolderViewMode,
    };
  } catch {
    return null;
  }
}
function selectableKey(kind: SelectableItemKind, id: string) {
  return `${kind}:${id}`;
}
function parseSelectableKey(value: string): ClipboardEntry | null {
  const [kind, ...rest] = value.split(":");
  const id = rest.join(":");
  if (!id || (kind !== "file" && kind !== "inner-folder")) {
    return null;
  }
  return {
    kind,
    id,
  };
}
function intersectsRect(a: Exclude<SelectionRect, null>, b: Exclude<SelectionRect, null>) {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

function IconFolder({
  icon = "folder",
  className = "h-5 w-5",
}: {
  icon?: FolderIconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {icon === "bookmark" ? (
        <path d="M7 5.25h10v13l-5-3-5 3Z" />
      ) : icon === "briefcase" ? (
        <>
          <rect x="4.5" y="7" width="15" height="11.25" rx="2" />
          <path d="M9 7V5.75A1.75 1.75 0 0 1 10.75 4h2.5A1.75 1.75 0 0 1 15 5.75V7" />
          <path d="M4.5 11.25h15" />
        </>
      ) : icon === "archive" ? (
        <>
          <rect x="4.5" y="6" width="15" height="11.5" rx="2" />
          <path d="M8 6V4.75h8V6" />
        </>
      ) : icon === "spark" ? (
        <>
          <path d="m12 4.75 1.35 3.35 3.4 1.4-3.4 1.35L12 14.25l-1.35-3.4-3.4-1.35 3.4-1.4Z" />
          <path d="m17.5 14.5.6 1.55 1.65.6-1.65.6-.6 1.55-.6-1.55-1.65-.6 1.65-.6Z" />
        </>
      ) : (
        <>
          <path d="M3.75 7.25h6l1.5 2h9v8.5a2 2 0 0 1-2 2H5.75a2 2 0 0 1-2-2Z" />
          <path d="M3.75 7.25a2 2 0 0 1 2-2h3.5l1.5 2h8.5a2 2 0 0 1 2 2" />
        </>
      )}
    </svg>
  );
}
function IconFile({
  kind,
  title,
  sampleFileName,
  compact = false,
}: {
  kind: BrowserFile["kind"];
  title?: string;
  sampleFileName?: string;
  compact?: boolean;
}) {
  const fileName = (sampleFileName || title || "").trim().toLowerCase();
  const visualKind = fileName.endsWith(".pdf")
    ? "pdf"
    : fileName.endsWith(".dwg") || fileName.endsWith(".dxf")
      ? "cad"
      : kind;
  const accent =
    visualKind === "pdf"
      ? "border-rose-100 bg-rose-50 text-rose-600"
      : visualKind === "cad"
        ? "border-slate-200 bg-slate-50 text-slate-700"
      : visualKind === "document"
      ? "text-blue-600 bg-blue-50"
      : visualKind === "sheet"
        ? "text-emerald-600 bg-emerald-50"
        : "text-amber-600 bg-amber-50";
  return (
    <div
      className={`flex items-center justify-center rounded-[20px] border border-white/80 shadow-sm ${compact ? "h-10 w-10" : "h-16 w-16"} ${accent}`}
    >
      {visualKind === "pdf" ? (
        <div className="relative flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={compact ? "h-5 w-5" : "h-8 w-8"}
          >
            <path d="M7 3.75h7.5L19 8.25v12H7Z" />
            <path d="M14.5 3.75v4.5H19" />
            <path d="M9.25 10.75h5.5" />
            <path d="M9.25 13.5h5.5" />
          </svg>
          <span
            className={`absolute rounded-full bg-current font-bold tracking-[0.18em] text-white ${
              compact
                ? "-bottom-1 px-1.5 py-[1px] text-[5px]"
                : "-bottom-1.5 px-2 py-0.5 text-[7px]"
            }`}
          >
            PDF
          </span>
        </div>
      ) : visualKind === "cad" ? (
        <div className="relative flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={compact ? "h-5 w-5" : "h-8 w-8"}
          >
            <path d="M5.5 18.5 18.5 5.5" />
            <path d="m15.75 4.75 3.5 3.5" />
            <path d="M4.75 15.75 8.25 19.25" />
            <path d="M8.75 19.25H4.75v-4" />
            <path d="M15.5 8.5 19 12" />
          </svg>
          <span
            className={`absolute rounded-full bg-current font-bold tracking-[0.18em] text-white ${
              compact
                ? "-bottom-1 px-1.5 py-[1px] text-[5px]"
                : "-bottom-1.5 px-2 py-0.5 text-[7px]"
            }`}
          >
            CAD
          </span>
        </div>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={compact ? "h-5 w-5" : "h-8 w-8"}
        >
          {visualKind === "document" ? (
            <>
              <path d="M7 3.75h7.5L19 8.25v12H7Z" />
              <path d="M14.5 3.75v4.5H19" />
              <path d="M9.25 12h5.5" />
              <path d="M9.25 15h5.5" />
            </>
          ) : visualKind === "sheet" ? (
            <>
              <rect x="4.5" y="4.5" width="15" height="15" rx="2" />
              <path d="M4.5 9.5h15" />
              <path d="M9.5 4.5v15" />
            </>
          ) : (
            <>
              <path d="M5.5 5.25h13A1.75 1.75 0 0 1 20.25 7v8.25A1.75 1.75 0 0 1 18.5 17h-13A1.75 1.75 0 0 1 3.75 15.25V7A1.75 1.75 0 0 1 5.5 5.25Z" />
              <path d="M9 19.25h6" />
              <path d="M12 17v2.25" />
            </>
          )}
        </svg>
      )}
    </div>
  );
}
function IconPlane() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M21 3 9 15" />
      <path d="m21 3-8 18-4-6-6-4 18-8Z" />
    </svg>
  );
}
function IconX({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </svg>
  );
}
function IconBack() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M15 18 9 12l6-6" />
    </svg>
  );
}
function IconArrow({
  direction,
  className = "h-4 w-4",
}: {
  direction: "up" | "down" | "left" | "right";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {direction === "left" ? (
        <path d="M15 18 9 12l6-6" />
      ) : direction === "right" ? (
        <path d="m9 18 6-6-6-6" />
      ) : direction === "up" ? (
        <path d="m18 15-6-6-6 6" />
      ) : (
        <path d="m18 9-6 6-6-6" />
      )}
    </svg>
  );
}
export function DesktopFileBrowser({
  title,
  description,
  sectionEyebrow,
  layoutVariant,
  layoutDensity,
  workspaceId,
  backHref,
  returnToHref,
  allFolderName = "全部文件",
  allFolderDescription = "浏览当前空间里的全部内容。",
  folderSectionTitle = "文件夹区域",
  folderSectionDescription,
  contentSectionDescription = "选择文件夹后，在这里查看对应内容。",
  newItemLabel,
  uploadLabel,
  uploadAccept,
  uploadKind,
  browserStateKind,
  newItemHref,
  hideNewItemButton = false,
  newFolderLabel,
  emptyTitle,
  emptyDescription,
  allowTrashActions = true,
  allowRootFolderDeletion = true,
  sharedWorkspaceState = false,
  memberChips = EMPTY_MEMBERS,
  contactOptions = EMPTY_CONTACTS,
  allowMemberManagement = false,
  currentUserIdentity,
  folders,
  files,
  initialActiveFolderId = "all",
  initialActiveInnerFolderId = null,
  initialFolderViewMode = "small",
  initialCustomFolders = EMPTY_FOLDERS,
  initialInnerFolders = EMPTY_INNER_FOLDERS,
  initialFileStates = EMPTY_FILE_STATES,
  initialDeletedFolderIds = EMPTY_DELETED_FOLDER_IDS,
  initialBoardMessages = EMPTY_BOARD_MESSAGES,
  contentAccessMode = "manage",
  copyTargets = EMPTY_TARGETS,
}: DesktopFileBrowserProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const boardScrollerRef = useRef<HTMLDivElement | null>(null);
  const nodeMapViewportRef = useRef<HTMLDivElement | null>(null);
  const contentViewportRef = useRef<HTMLDivElement | null>(null);
  const nodeMapDragRef = useRef<{
    pointerX: number;
    pointerY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const contentSelectionRef = useRef<{
    move: (event: MouseEvent) => void;
    up: (event: MouseEvent) => void;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const skipSaveRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectiveLayoutVariant =
    layoutVariant ?? (sharedWorkspaceState ? "workspace" : "personal");
  const isPersonalLayout = effectiveLayoutVariant === "personal";
  const effectiveLayoutDensity =
    layoutDensity ?? (isPersonalLayout ? "compact" : "comfortable");
  const isCompactLayout = effectiveLayoutDensity === "compact";
  const kind =
    browserStateKind ?? (uploadKind === "auto" ? "document" : uploadKind);
  const viewKey = workspaceId
    ? `bpai-browser-view-${kind}-${workspaceId}`
    : `bpai-browser-view-${kind}`;
  const canManage = contentAccessMode === "manage" && allowTrashActions;
  const canCreate = contentAccessMode === "manage";
  const canDeleteRootFolders = canManage && allowRootFolderDeletion;

  const [managedFiles, setManagedFiles] = useState<ManagedBrowserFile[]>(() =>
    applyFileStates(files, initialFileStates),
  );
  const [workspaceMembers, setWorkspaceMembers] = useState(memberChips);
  const [workspaceContacts, setWorkspaceContacts] = useState(contactOptions);
  const [customFolders, setCustomFolders] =
    useState<BrowserFolder[]>(initialCustomFolders);
  const [innerFolders, setInnerFolders] =
    useState<InnerFolder[]>(initialInnerFolders);
  const [deletedFolderIds, setDeletedFolderIds] = useState<string[]>(
    initialDeletedFolderIds,
  );
  const [boardMessages, setBoardMessages] =
    useState<BrowserBoardMessage[]>(initialBoardMessages);
  const [activeFolderId, setActiveFolderId] = useState(initialActiveFolderId);
  const [activeInnerFolderId, setActiveInnerFolderId] = useState<string | null>(
    initialActiveInnerFolderId,
  );
  const [folderViewMode, setFolderViewMode] = useState<FolderViewMode>(
    initialFolderViewMode,
  );
  const [editingTarget, setEditingTarget] = useState<EditTarget>(null);
  const [editingValue, setEditingValue] = useState("");
  const [boardDraft, setBoardDraft] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [memberError, setMemberError] = useState("");
  const [draggedItem, setDraggedItem] = useState<DraggedItem>(null);
  const [folderDropTargetId, setFolderDropTargetId] = useState<string | null>(
    null,
  );
  const [innerDropTargetId, setInnerDropTargetId] = useState<string | null>(
    null,
  );
  const [rootDropActive, setRootDropActive] = useState(false);
  const [clipboardItem, setClipboardItem] = useState<ClipboardItem>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [selectedItemKeys, setSelectedItemKeys] = useState<string[]>([]);
  const [selectionRect, setSelectionRect] = useState<SelectionRect>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState<"create" | "edit">(
    "create",
  );
  const [folderDialogTargetId, setFolderDialogTargetId] = useState<
    string | null
  >(null);
  const [folderDraftName, setFolderDraftName] = useState(DEFAULT_FOLDER_NAME);
  const [folderDraftDescription, setFolderDraftDescription] =
    useState("自定义文件夹");
  const [folderDraftTone, setFolderDraftTone] = useState<FolderTone>("blue");
  const [folderDraftIcon, setFolderDraftIcon] =
    useState<FolderIconName>("folder");
  const [newItemDialogOpen, setNewItemDialogOpen] = useState(false);
  const [newItemDraftName, setNewItemDraftName] = useState(
    DEFAULT_NEW_ITEM_NAME.document,
  );
  const [newItemDraftKind, setNewItemDraftKind] =
    useState<CreateItemKind>("document");
  const [newItemTargetFolderId, setNewItemTargetFolderId] = useState<
    string | null
  >(null);
  const [newItemTargetInnerFolderId, setNewItemTargetInnerFolderId] = useState<
    string | null
  >(null);
  const [newItemError, setNewItemError] = useState("");
  const [isCreatingNewItem, setIsCreatingNewItem] = useState(false);
  const [selectedInviteEmails, setSelectedInviteEmails] = useState<string[]>(
    [],
  );
  const [savingMembers, setSavingMembers] = useState(false);
  const [copyFileId, setCopyFileId] = useState<string | null>(null);
  const [spaceUploadSource, setSpaceUploadSource] =
    useState<SpaceUploadSource>(null);
  const [spaceUploadTargets, setSpaceUploadTargets] =
    useState<BrowserCopyTarget[]>(copyTargets);
  const [spaceUploadTargetId, setSpaceUploadTargetId] = useState<string | null>(
    null,
  );
  const [spaceUploadTargetFolderId, setSpaceUploadTargetFolderId] = useState<
    string | null
  >(null);
  const [spaceUploadTargetInnerFolderId, setSpaceUploadTargetInnerFolderId] =
    useState<string | null>(null);
  const [spaceUploadError, setSpaceUploadError] = useState("");
  const [spaceUploadingOut, setSpaceUploadingOut] = useState(false);
  const [copyingOut, setCopyingOut] = useState(false);
  const [isDraggingNodeMap, setIsDraggingNodeMap] = useState(false);
  const derivedManagedFiles = useMemo(
    () => applyFileStates(files, initialFileStates),
    [files, initialFileStates],
  );

  useEffect(() => {
    setManagedFiles((cur) =>
      sameArrayByValue(cur, derivedManagedFiles) ? cur : derivedManagedFiles,
    );
  }, [derivedManagedFiles]);
  useEffect(() => {
    setCustomFolders((cur) =>
      sameArrayByValue(cur, initialCustomFolders) ? cur : initialCustomFolders,
    );
  }, [initialCustomFolders]);
  useEffect(() => {
    setInnerFolders((cur) =>
      sameArrayByValue(cur, initialInnerFolders) ? cur : initialInnerFolders,
    );
  }, [initialInnerFolders]);
  useEffect(() => {
    setDeletedFolderIds((cur) =>
      sameArrayByValue(cur, initialDeletedFolderIds)
        ? cur
        : initialDeletedFolderIds,
    );
  }, [initialDeletedFolderIds]);
  useEffect(() => {
    setBoardMessages((cur) =>
      sameArrayByValue(cur, initialBoardMessages) ? cur : initialBoardMessages,
    );
  }, [initialBoardMessages]);
  useEffect(() => {
    setWorkspaceMembers((cur) =>
      sameMembers(cur, memberChips) ? cur : memberChips,
    );
  }, [memberChips]);
  useEffect(() => {
    setWorkspaceContacts((cur) =>
      sameContacts(cur, contactOptions) ? cur : contactOptions,
    );
  }, [contactOptions]);
  useEffect(() => {
    setSpaceUploadTargets((cur) =>
      sameArrayByValue(cur, copyTargets) ? cur : copyTargets,
    );
  }, [copyTargets]);
  useEffect(() => {
    const v = readViewState(viewKey);
    if (v) {
      setActiveFolderId(v.activeFolderId);
      setActiveInnerFolderId(v.activeInnerFolderId);
      setFolderViewMode(v.folderViewMode);
    }
  }, [viewKey]);

  const fileMap = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);
  const detachedStates = useMemo(
    () =>
      initialFileStates.filter(
        (s) =>
          !files.some((f) => f.id === s.fileId) && (s.isTrashed || s.isDeleted),
      ),
    [files, initialFileStates],
  );
  const folderCounts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const f of managedFiles) {
      if (f.isTrashed || f.isDeleted) continue;
      c.all += 1;
      c[f.folderId] = (c[f.folderId] ?? 0) + 1;
    }
    return c;
  }, [managedFiles]);
  const allFolders = useMemo(() => {
    const hiddenFolderIds = new Set(deletedFolderIds);
    const baseFolderIds = new Set(folders.map((folder) => folder.id));
    const folderOverrides = new Map(
      customFolders.map((folder) => [folder.id, folder]),
    );
    const extraCustomFolders = customFolders.filter(
      (folder) => !baseFolderIds.has(folder.id),
    );
    const resolvedFolders = [
      ...extraCustomFolders,
      ...folders.map((folder) => {
        const override = folderOverrides.get(folder.id);
        return override
          ? {
              ...folder,
              ...override,
              isLocal: override.isLocal ?? folder.isLocal,
            }
          : folder;
      }),
    ]
      .filter((folder) => !hiddenFolderIds.has(folder.id))
      .map((folder) => ({ ...folder, count: folderCounts[folder.id] ?? 0 }));

    return [
      {
        id: "all",
        name: allFolderName,
        description: allFolderDescription,
        count: folderCounts.all ?? 0,
        tone: "slate" as const,
        icon: "archive" as const,
      },
      ...resolvedFolders,
    ];
  }, [
    allFolderDescription,
    allFolderName,
    customFolders,
    deletedFolderIds,
    folderCounts,
    folders,
  ]);
  const activeFolder =
    allFolders.find((f) => f.id === activeFolderId) ?? allFolders[0];
  const tone = toneStyles[activeFolder.tone];
  const activeFolderInnerFolders = useMemo(
    () =>
      activeFolderId === "all"
        ? []
        : innerFolders.filter((f) => f.parentFolderId === activeFolderId),
    [activeFolderId, innerFolders],
  );
  const innerFolderMap = useMemo(
    () => new Map(activeFolderInnerFolders.map((f) => [f.id, f])),
    [activeFolderInnerFolders],
  );
  const activeInnerFolder = activeInnerFolderId
    ? (innerFolderMap.get(activeInnerFolderId) ?? null)
    : null;
  const currentPath = useMemo(() => {
    if (!activeInnerFolderId) return [] as InnerFolder[];
    const path: InnerFolder[] = [];
    let cursor = innerFolderMap.get(activeInnerFolderId) ?? null;
    while (cursor) {
      path.unshift(cursor);
      cursor = cursor.parentInnerFolderId
        ? (innerFolderMap.get(cursor.parentInnerFolderId) ?? null)
        : null;
    }
    return path;
  }, [activeInnerFolderId, innerFolderMap]);
  const visibleInnerFolders = useMemo(
    () =>
      activeFolderId === "all"
        ? []
        : activeFolderInnerFolders.filter(
            (f) => f.parentInnerFolderId === activeInnerFolderId,
          ),
    [activeFolderId, activeFolderInnerFolders, activeInnerFolderId],
  );
  const visibleFiles = useMemo(
    () =>
      managedFiles.filter(
        (f) =>
          !f.isTrashed &&
          !f.isDeleted &&
          (activeFolderId === "all"
            ? true
            : f.folderId === activeFolderId &&
              f.subfolderId === activeInnerFolderId),
      ),
    [activeFolderId, activeInnerFolderId, managedFiles],
  );
  const selectedItemSet = useMemo(
    () => new Set(selectedItemKeys),
    [selectedItemKeys],
  );
  const selectedItems = useMemo(
    () =>
      selectedItemKeys.flatMap((key) => {
        const item = parseSelectableKey(key);
        return item ? [item] : [];
      }),
    [selectedItemKeys],
  );
  const selectedInnerFolderIds = useMemo(
    () =>
      selectedItems
        .filter((item) => item.kind === "inner-folder")
        .map((item) => item.id),
    [selectedItems],
  );
  const selectedFileIds = useMemo(
    () =>
      selectedItems
        .filter((item) => item.kind === "file")
        .map((item) => item.id),
    [selectedItems],
  );
  const selectedCount = selectedItems.length;
  const currentPathIds = useMemo(
    () => new Set(currentPath.map((folder) => folder.id)),
    [currentPath],
  );
  const treeColumns = useMemo(() => {
    if (activeFolderId === "all") return [] as InnerFolder[][];

    const childrenMap = new Map<string | null, InnerFolder[]>();
    for (const folder of activeFolderInnerFolders) {
      const siblings = childrenMap.get(folder.parentInnerFolderId) ?? [];
      siblings.push(folder);
      childrenMap.set(folder.parentInnerFolderId, siblings);
    }

    const columns: InnerFolder[][] = [];
    let levelNodes = childrenMap.get(null) ?? [];

    while (levelNodes.length > 0) {
      columns.push(levelNodes);
      const nextLevel: InnerFolder[] = [];
      for (const folder of levelNodes) {
        nextLevel.push(...(childrenMap.get(folder.id) ?? []));
      }
      levelNodes = nextLevel;
    }

    return columns;
  }, [activeFolderId, activeFolderInnerFolders]);
  const currentMessages = useMemo(
    () =>
      boardMessages
        .filter(
          (m) =>
            m.folderId === activeFolderId &&
            m.innerFolderId === activeInnerFolderId,
        )
        .sort(
          (a, b) =>
            new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime(),
        ),
    [activeFolderId, activeInnerFolderId, boardMessages],
  );
  const createItemRootFolders = useMemo(
    () =>
      allFolders.filter(
        (folder) =>
          folder.id !== "all" && !NON_DESTINATION_FOLDER_IDS.has(folder.id),
      ),
    [allFolders],
  );
  const createItemTargetFolder =
    createItemRootFolders.find((folder) => folder.id === newItemTargetFolderId) ??
    null;
  const createItemInnerFolders = useMemo(
    () =>
      createItemTargetFolder
        ? innerFolders.filter(
            (folder) => folder.parentFolderId === createItemTargetFolder.id,
          )
        : [],
    [createItemTargetFolder, innerFolders],
  );
  const createItemInnerFolderMap = useMemo(
    () => new Map(createItemInnerFolders.map((folder) => [folder.id, folder])),
    [createItemInnerFolders],
  );
  const createItemTargetPath = useMemo(() => {
    if (!newItemTargetInnerFolderId) return [] as InnerFolder[];

    const path: InnerFolder[] = [];
    let cursor =
      createItemInnerFolderMap.get(newItemTargetInnerFolderId) ?? null;

    while (cursor) {
      path.unshift(cursor);
      cursor = cursor.parentInnerFolderId
        ? (createItemInnerFolderMap.get(cursor.parentInnerFolderId) ?? null)
        : null;
    }

    return path;
  }, [createItemInnerFolderMap, newItemTargetInnerFolderId]);
  const createItemVisibleInnerFolders = useMemo(
    () =>
      createItemInnerFolders.filter(
        (folder) => folder.parentInnerFolderId === newItemTargetInnerFolderId,
      ),
    [createItemInnerFolders, newItemTargetInnerFolderId],
  );
  const createItemTemplate =
    CREATE_ITEM_TEMPLATE_OPTIONS.find(
      (option) => option.value === newItemDraftKind,
    ) ?? CREATE_ITEM_TEMPLATE_OPTIONS[0];
  const hasStructuredCopyTargets =
    isPersonalLayout &&
    spaceUploadTargets.some(
      (target) => target.shareMode === "workspace" && (target.folders?.length ?? 0) > 0,
    );
  const selectedSpaceUploadTarget =
    spaceUploadTargets.find((target) => target.id === spaceUploadTargetId) ??
    spaceUploadTargets[0] ??
    null;
  const selectedSpaceUploadFolders = useMemo(
    () =>
      selectedSpaceUploadTarget?.folders?.filter(
        (folder) => !NON_DESTINATION_FOLDER_IDS.has(folder.id),
      ) ?? [],
    [selectedSpaceUploadTarget],
  );
  const selectedSpaceUploadInnerFolders = useMemo(
    () =>
      selectedSpaceUploadTarget?.innerFolders?.filter((folder) =>
        selectedSpaceUploadFolders.some(
          (rootFolder) => rootFolder.id === folder.parentFolderId,
        ),
      ) ?? [],
    [selectedSpaceUploadFolders, selectedSpaceUploadTarget],
  );
  const selectedSpaceUploadInnerFolderMap = useMemo(
    () =>
      new Map(
        selectedSpaceUploadInnerFolders.map((folder) => [folder.id, folder]),
      ),
    [selectedSpaceUploadInnerFolders],
  );
  const selectedSpaceUploadPath = useMemo(() => {
    if (!spaceUploadTargetInnerFolderId) return [] as BrowserCopyTargetInnerFolder[];

    const path: BrowserCopyTargetInnerFolder[] = [];
    let cursor =
      selectedSpaceUploadInnerFolderMap.get(spaceUploadTargetInnerFolderId) ??
      null;

    while (cursor) {
      path.unshift(cursor);
      cursor = cursor.parentInnerFolderId
        ? (selectedSpaceUploadInnerFolderMap.get(cursor.parentInnerFolderId) ??
            null)
        : null;
    }

    return path;
  }, [selectedSpaceUploadInnerFolderMap, spaceUploadTargetInnerFolderId]);
  const visibleSpaceUploadInnerFolders = useMemo(
    () =>
      selectedSpaceUploadInnerFolders.filter(
        (folder) =>
          folder.parentFolderId === spaceUploadTargetFolderId &&
          folder.parentInnerFolderId === spaceUploadTargetInnerFolderId,
      ),
    [
      selectedSpaceUploadInnerFolders,
      spaceUploadTargetFolderId,
      spaceUploadTargetInnerFolderId,
    ],
  );
  const spaceUploadSourceMeta = useMemo(() => {
    if (!spaceUploadSource) return null;

    if (spaceUploadSource.kind === "file") {
      const file = managedFiles.find((item) => item.id === spaceUploadSource.id);
      return file
        ? {
            label: file.title,
            helper: "会复制这个文件到所选合作空间目录",
          }
        : null;
    }

    if (spaceUploadSource.kind === "folder") {
      const folder = allFolders.find((item) => item.id === spaceUploadSource.id);
      return folder
        ? {
            label: folder.name,
            helper: "会把这个大文件夹整理成一个子文件夹后复制过去",
          }
        : null;
    }

    const folder = innerFolders.find((item) => item.id === spaceUploadSource.id);
    return folder
      ? {
          label: folder.name,
          helper: "会把这个子文件夹连同里面的文件一起复制过去",
        }
      : null;
  }, [allFolders, innerFolders, managedFiles, spaceUploadSource]);
  const copyTargetsForModal = copyFileId
    ? managedFiles.find((f) => f.id === copyFileId)
    : null;
  const latestBoardMessageId = currentMessages.length
    ? currentMessages[currentMessages.length - 1]?.id
    : null;

  const buildBrowserStatePayload = useCallback((options?: {
    nextManagedFiles?: ManagedBrowserFile[];
    nextActiveFolderId?: string;
    nextActiveInnerFolderId?: string | null;
  }) => {
    const nextManagedFiles = options?.nextManagedFiles ?? managedFiles;

    return {
      kind,
      workspaceId,
      shareMode: sharedWorkspaceState ? "workspace" : "personal",
      activeFolderId: options?.nextActiveFolderId ?? activeFolderId,
      activeInnerFolderId:
        options?.nextActiveInnerFolderId !== undefined
          ? options.nextActiveInnerFolderId
          : activeInnerFolderId,
      folderViewMode,
      deletedFolderIds,
      customFolders: customFolders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        description: folder.description,
        tone: folder.tone,
        icon: folder.icon,
      })),
      innerFolders: innerFolders.map((folder) => ({
        id: folder.id,
        parentFolderId: folder.parentFolderId,
        parentInnerFolderId: folder.parentInnerFolderId,
        name: folder.name,
        description: folder.description,
        tone: folder.tone,
        icon: folder.icon,
      })),
      fileStates: [
        ...nextManagedFiles.map((file) => ({
          fileId: file.id,
          folderId: file.folderId,
          subfolderId: file.subfolderId,
          titleOverride:
            file.title !== fileMap.get(file.id)?.title ? file.title : undefined,
          isTrashed: file.isTrashed,
          isDeleted: file.isDeleted,
          trashedAt: file.trashedAt,
        })),
        ...detachedStates.filter(
          (state) => !nextManagedFiles.some((file) => file.id === state.fileId),
        ),
      ],
      boardMessages: sharedWorkspaceState ? boardMessages : undefined,
    };
  }, [
    activeFolderId,
    activeInnerFolderId,
    boardMessages,
    customFolders,
    deletedFolderIds,
    detachedStates,
    fileMap,
    folderViewMode,
    innerFolders,
    kind,
    managedFiles,
    sharedWorkspaceState,
    workspaceId,
  ]);

  const persistBrowserStateSnapshot = useCallback(async (options?: {
    nextManagedFiles?: ManagedBrowserFile[];
    nextActiveFolderId?: string;
    nextActiveInnerFolderId?: string | null;
  }) => {
    await fetch("/api/browser-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBrowserStatePayload(options)),
    }).catch(() => null);
  }, [buildBrowserStatePayload]);

  function resolveDefaultCreateItemDestination() {
    const currentFolderSelectable =
      activeFolderId !== "all" &&
      !NON_DESTINATION_FOLDER_IDS.has(activeFolderId) &&
      createItemRootFolders.some((folder) => folder.id === activeFolderId);

    const folderId = currentFolderSelectable
      ? activeFolderId
      : (createItemRootFolders[0]?.id ?? null);
    const innerFolderId =
      currentFolderSelectable &&
      activeInnerFolderId &&
      innerFolders.some(
        (folder) =>
          folder.id === activeInnerFolderId &&
          folder.parentFolderId === activeFolderId,
      )
        ? activeInnerFolderId
        : null;

    return {
      folderId,
      innerFolderId,
    };
  }

  useEffect(() => {
    if (!isDraggingNodeMap) return;

    const handleMouseMove = (event: MouseEvent) => {
      const viewport = nodeMapViewportRef.current;
      const dragState = nodeMapDragRef.current;

      if (!viewport || !dragState) return;

      viewport.scrollLeft =
        dragState.scrollLeft - (event.clientX - dragState.pointerX);
      viewport.scrollTop =
        dragState.scrollTop - (event.clientY - dragState.pointerY);
    };

    const handleMouseUp = () => {
      nodeMapDragRef.current = null;
      setIsDraggingNodeMap(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingNodeMap]);

  useEffect(() => {
    if (activeFolderId === "all") return;

    const viewport = nodeMapViewportRef.current;
    if (!viewport) return;

    const activeNode = viewport.querySelector<HTMLElement>("[data-node-active='true']");
    activeNode?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeFolderId, activeInnerFolderId]);

  useEffect(() => {
    if (!allFolders.some((f) => f.id === activeFolderId)) {
      setActiveFolderId("all");
      setActiveInnerFolderId(null);
    }
  }, [activeFolderId, allFolders]);
  useEffect(() => {
    if (activeFolderId === "all") {
      if (activeInnerFolderId !== null) setActiveInnerFolderId(null);
      return;
    }
    if (
      activeInnerFolderId &&
      !activeFolderInnerFolders.some((f) => f.id === activeInnerFolderId)
    )
      setActiveInnerFolderId(null);
  }, [activeFolderId, activeFolderInnerFolders, activeInnerFolderId]);
  useEffect(() => {
    if (typeof window !== "undefined")
      window.sessionStorage.setItem(
        viewKey,
        JSON.stringify({ activeFolderId, activeInnerFolderId, folderViewMode }),
      );
  }, [activeFolderId, activeInnerFolderId, folderViewMode, viewKey]);
  useEffect(() => {
    if (!editingTarget || !renameInputRef.current) return;
    renameInputRef.current.focus();
    renameInputRef.current.select();
  }, [editingTarget]);
  useEffect(() => {
    if (!sharedWorkspaceState || !boardScrollerRef.current) return;
    requestAnimationFrame(() => {
      const s = boardScrollerRef.current;
      if (s) s.scrollTop = s.scrollHeight;
    });
  }, [
    activeFolderId,
    activeInnerFolderId,
    currentMessages.length,
    latestBoardMessageId,
    sharedWorkspaceState,
  ]);
  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (contextMenuRef.current && t && contextMenuRef.current.contains(t))
        return;
      setContextMenu(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [contextMenu]);
  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;

    const menu = contextMenuRef.current;
    const rect = menu.getBoundingClientRect();
    const inset = 12;
    const nextX = Math.min(
      Math.max(contextMenu.x, inset),
      window.innerWidth - rect.width - inset,
    );
    const nextY = Math.min(
      Math.max(contextMenu.y, inset),
      window.innerHeight - rect.height - inset,
    );

    if (nextX === contextMenu.x && nextY === contextMenu.y) return;

    setContextMenu((current) =>
      current ? { ...current, x: nextX, y: nextY } : current,
    );
  }, [contextMenu]);
  useEffect(() => {
    return () => {
      if (!contentSelectionRef.current) return;
      window.removeEventListener("mousemove", contentSelectionRef.current.move);
      window.removeEventListener("mouseup", contentSelectionRef.current.up);
    };
  }, []);
  useEffect(() => {
    setSelectedItemKeys([]);
    setSelectionRect(null);
  }, [activeFolderId, activeInnerFolderId]);
  useEffect(() => {
    const visibleKeys = new Set<string>([
      ...visibleInnerFolders.map((folder) =>
        selectableKey("inner-folder", folder.id),
      ),
      ...visibleFiles.map((file) => selectableKey("file", file.id)),
    ]);
    setSelectedItemKeys((current) =>
      current.filter((key) => visibleKeys.has(key)),
    );
  }, [visibleFiles, visibleInnerFolders]);
  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const payload = buildBrowserStatePayload();
    saveTimerRef.current = setTimeout(() => {
      void fetch("/api/browser-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);
    }, 250);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    activeFolderId,
    activeInnerFolderId,
    boardMessages,
    buildBrowserStatePayload,
    customFolders,
    deletedFolderIds,
    detachedStates,
    fileMap,
    folderViewMode,
    innerFolders,
    kind,
    managedFiles,
    sharedWorkspaceState,
    workspaceId,
  ]);

  function scrollNodeMapBy(left: number, top: number) {
    const viewport = nodeMapViewportRef.current;
    if (!viewport) return;

    viewport.scrollBy({
      left,
      top,
      behavior: "smooth",
    });
  }

  function beginNodeMapDrag(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, a")) {
      return;
    }

    const viewport = nodeMapViewportRef.current;
    if (!viewport) return;

    nodeMapDragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    setIsDraggingNodeMap(true);
  }

  function readDraggedItem(event: DragEvent<HTMLElement>): DraggedItem {
    if (draggedItem) return draggedItem;
    const raw = event.dataTransfer.getData("application/x-bpai-browser-item");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as DraggedItem;
      if (
        parsed &&
        (parsed.kind === "file" || parsed.kind === "inner-folder") &&
        typeof parsed.id === "string"
      ) {
        return parsed;
      }
    } catch {}
    return null;
  }

  function clearDrag() {
    setDraggedItem(null);
    setFolderDropTargetId(null);
    setInnerDropTargetId(null);
    setRootDropActive(false);
  }
  function clearSelection() {
    setSelectedItemKeys([]);
    setSelectionRect(null);
  }
  function syncSelectionWithRect(nextRect: Exclude<SelectionRect, null>) {
    const viewport = contentViewportRef.current;
    if (!viewport) return;
    const viewportRect = viewport.getBoundingClientRect();
    const nextKeys: string[] = [];

    viewport
      .querySelectorAll<HTMLElement>("[data-selectable-item='true']")
      .forEach((element) => {
        const itemId = element.dataset.itemId;
        const itemKind = element.dataset.itemKind as SelectableItemKind | undefined;
        if (!itemId || !itemKind) return;
        const rect = element.getBoundingClientRect();
        const candidateRect = {
          left: rect.left - viewportRect.left + viewport.scrollLeft,
          top: rect.top - viewportRect.top + viewport.scrollTop,
          width: rect.width,
          height: rect.height,
        };
        if (intersectsRect(nextRect, candidateRect)) {
          nextKeys.push(selectableKey(itemKind, itemId));
        }
      });

    setSelectedItemKeys(nextKeys);
  }
  function beginContentSelection(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const viewport = contentViewportRef.current;
    const target = event.target as HTMLElement | null;
    if (
      !viewport ||
      target?.closest(
        "[data-selectable-item='true'],button,input,a,textarea,[contenteditable='true']",
      )
    ) {
      return;
    }

    event.preventDefault();
    stopRename();
    setContextMenu(null);
    clearSelection();

    const viewportRect = viewport.getBoundingClientRect();
    const startX = event.clientX - viewportRect.left + viewport.scrollLeft;
    const startY = event.clientY - viewportRect.top + viewport.scrollTop;

    const move = (moveEvent: MouseEvent) => {
      const currentX = Math.min(
        Math.max(
          moveEvent.clientX - viewportRect.left + viewport.scrollLeft,
          0,
        ),
        viewport.scrollWidth,
      );
      const currentY = Math.min(
        Math.max(
          moveEvent.clientY - viewportRect.top + viewport.scrollTop,
          0,
        ),
        viewport.scrollHeight,
      );
      const nextRect = {
        left: Math.min(startX, currentX),
        top: Math.min(startY, currentY),
        width: Math.abs(currentX - startX),
        height: Math.abs(currentY - startY),
      };
      setSelectionRect(nextRect);
      syncSelectionWithRect(nextRect);
    };
    const up = () => {
      if (contentSelectionRef.current) {
        window.removeEventListener("mousemove", contentSelectionRef.current.move);
        window.removeEventListener("mouseup", contentSelectionRef.current.up);
        contentSelectionRef.current = null;
      }
      setSelectionRect(null);
    };

    contentSelectionRef.current = { move, up };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
  function startRename(target: EditTarget, currentValue: string) {
    setEditingTarget(target);
    setEditingValue(currentValue);
    setContextMenu(null);
  }
  function stopRename() {
    setEditingTarget(null);
    setEditingValue("");
  }
  function nextFolderTone() {
    return (
      toneOptions[
        (customFolders.length + folders.length) % toneOptions.length
      ] ?? "blue"
    );
  }
  function closeFolderDialog() {
    setFolderDialogOpen(false);
    setFolderDialogMode("create");
    setFolderDialogTargetId(null);
  }
  function closeCreateItemDialog() {
    if (isCreatingNewItem) return;
    setNewItemDialogOpen(false);
    setNewItemError("");
  }
  function resolveDefaultSpaceUploadDestination(target?: BrowserCopyTarget | null) {
    const nextTarget =
      target ??
      spaceUploadTargets.find(
        (item) =>
          item.shareMode === "workspace" && (item.folders?.length ?? 0) > 0,
      ) ??
      spaceUploadTargets[0] ??
      null;
    const nextFolderId =
      nextTarget?.folders?.find(
        (folder) => !NON_DESTINATION_FOLDER_IDS.has(folder.id),
      )?.id ?? null;

    return {
      targetId: nextTarget?.id ?? null,
      folderId: nextFolderId,
      innerFolderId: null as string | null,
    };
  }
  function closeSpaceUploadDialog() {
    setSpaceUploadSource(null);
    setSpaceUploadError("");
  }
  function openSpaceUploadDialog(source: Exclude<SpaceUploadSource, null>) {
    if (!hasStructuredCopyTargets) return;
    const defaults = resolveDefaultSpaceUploadDestination();
    setSpaceUploadSource(source);
    setSpaceUploadTargetId(defaults.targetId);
    setSpaceUploadTargetFolderId(defaults.folderId);
    setSpaceUploadTargetInnerFolderId(defaults.innerFolderId);
    setSpaceUploadError("");
    setContextMenu(null);
  }
  function changeSpaceUploadTarget(targetId: string) {
    const nextTarget =
      spaceUploadTargets.find((target) => target.id === targetId) ?? null;
    const defaults = resolveDefaultSpaceUploadDestination(nextTarget);
    setSpaceUploadTargetId(targetId);
    setSpaceUploadTargetFolderId(defaults.folderId);
    setSpaceUploadTargetInnerFolderId(defaults.innerFolderId);
    setSpaceUploadError("");
  }
  function selectSpaceUploadTargetFolder(folderId: string) {
    setSpaceUploadTargetFolderId(folderId);
    setSpaceUploadTargetInnerFolderId(null);
    setSpaceUploadError("");
  }
  function selectSpaceUploadTargetInnerFolder(folderId: string | null) {
    setSpaceUploadTargetInnerFolderId(folderId);
    setSpaceUploadError("");
  }
  function openCreateItemDialog() {
    if (!canCreate || !workspaceId) {
      router.push(newItemHref);
      return;
    }
    const destination = resolveDefaultCreateItemDestination();
    setNewItemDraftKind("document");
    setNewItemDraftName(DEFAULT_NEW_ITEM_NAME.document);
    setNewItemTargetFolderId(destination.folderId);
    setNewItemTargetInnerFolderId(destination.innerFolderId);
    setNewItemError("");
    setNewItemDialogOpen(true);
    setContextMenu(null);
  }
  function changeCreateItemKind(nextKind: CreateItemKind) {
    const nextTemplate = CREATE_ITEM_TEMPLATE_OPTIONS.find(
      (option) => option.value === nextKind,
    );
    if (!nextTemplate || nextTemplate.disabled) return;

    const nextBaseName = newItemDraftName
      .trim()
      .replace(/\.[^.]+$/u, "")
      .trim();

    setNewItemDraftKind(nextKind);
    setNewItemDraftName(nextBaseName || DEFAULT_NEW_ITEM_NAME[nextKind]);
    setNewItemError("");
  }
  function selectCreateItemRootFolder(folderId: string) {
    setNewItemTargetFolderId(folderId);
    setNewItemTargetInnerFolderId(null);
    setNewItemError("");
  }
  function selectCreateItemInnerFolder(folderId: string | null) {
    setNewItemTargetInnerFolderId(folderId);
    setNewItemError("");
  }
  function openCreateFolderDialog() {
    if (!canCreate) return;
    setFolderDialogMode("create");
    setFolderDialogTargetId(null);
    setFolderDraftName(DEFAULT_FOLDER_NAME);
    setFolderDraftDescription("自定义文件夹");
    setFolderDraftTone(nextFolderTone());
    setFolderDraftIcon("folder");
    setFolderDialogOpen(true);
    setContextMenu(null);
  }
  function openEditFolderDialog(folderId: string) {
    if (!canManage || folderId === "all") return;
    const folder = allFolders.find((item) => item.id === folderId);
    if (!folder) return;
    setFolderDialogMode("edit");
    setFolderDialogTargetId(folder.id);
    setFolderDraftName(folder.name);
    setFolderDraftDescription(folder.description || "自定义文件夹");
    setFolderDraftTone(folder.tone);
    setFolderDraftIcon(folder.icon ?? "folder");
    setFolderDialogOpen(true);
    setContextMenu(null);
  }
  function commitRename() {
    if (!editingTarget) return;
    const name = editingValue.trim();
    if (!name) {
      stopRename();
      return;
    }
    if (editingTarget.type === "file")
      setManagedFiles((cur) =>
        cur.map((f) =>
          f.id === editingTarget.id
            ? { ...f, title: name, titleOverride: name }
            : f,
        ),
      );
    if (editingTarget.type === "folder")
      setCustomFolders((cur) =>
        cur.map((f) => (f.id === editingTarget.id ? { ...f, name } : f)),
      );
    if (editingTarget.type === "inner-folder")
      setInnerFolders((cur) =>
        cur.map((f) => (f.id === editingTarget.id ? { ...f, name } : f)),
      );
    stopRename();
  }
  function selectFolder(folderId: string) {
    setActiveFolderId(folderId);
    setActiveInnerFolderId(null);
    stopRename();
    setContextMenu(null);
  }
  function selectInnerFolder(folderId: string | null) {
    setActiveInnerFolderId(folderId);
    stopRename();
    setContextMenu(null);
  }
  function createFolder() {
    const name = folderDraftName.trim() || DEFAULT_FOLDER_NAME;
    const description = folderDraftDescription.trim() || "自定义文件夹";
    if (folderDialogMode === "edit" && folderDialogTargetId) {
      const currentFolder = allFolders.find(
        (folder) => folder.id === folderDialogTargetId,
      );
      if (currentFolder && currentFolder.id !== "all") {
        const nextFolder: BrowserFolder = {
          ...currentFolder,
          name,
          description,
          tone: folderDraftTone,
          icon: folderDraftIcon,
        };
        setCustomFolders((cur) => {
          const existingIndex = cur.findIndex(
            (folder) => folder.id === nextFolder.id,
          );
          if (existingIndex >= 0) {
            return cur.map((folder, index) =>
              index === existingIndex ? nextFolder : folder,
            );
          }
          return [nextFolder, ...cur];
        });
      }
      closeFolderDialog();
      return;
    }
    const next: BrowserFolder = {
      id: makeId("folder"),
      name,
      description,
      count: 0,
      tone: folderDraftTone,
      icon: folderDraftIcon,
      isLocal: true,
    };
    setCustomFolders((cur) => [next, ...cur]);
    setDeletedFolderIds((cur) => cur.filter((v) => v !== next.id));
    setActiveFolderId(next.id);
    setActiveInnerFolderId(null);
    closeFolderDialog();
  }
  async function createNewItem() {
    if (!workspaceId) {
      setNewItemError("当前空间还没有准备好，请刷新后重试。");
      return;
    }
    if (!createItemTargetFolder) {
      setNewItemError("请先选择要放入的文件夹。");
      return;
    }
    if (createItemTemplate.disabled || !createItemTemplate.sampleFileName) {
      setNewItemError(
        createItemTemplate.disabledReason || "当前类型还没有可用模板。",
      );
      return;
    }

    setIsCreatingNewItem(true);
    setNewItemError("");

    try {
      const title = ensureTitleForKind(newItemDraftName, newItemDraftKind);
      const response = await fetch("/api/assets/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: newItemDraftKind,
          assetId: `sample-${newItemDraftKind}`,
          source: "sample",
          sampleFileName: createItemTemplate.sampleFileName,
          title,
          targetWorkspaceId: workspaceId,
        }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | {
            asset?: {
              id: string;
              kind: BrowserFile["kind"];
              title: string;
              updatedAt: string;
            };
            openPath?: string;
            message?: string;
          }
        | null;

      if (!response?.ok || !payload?.asset) {
        setNewItemError(payload?.message ?? "新建文档失败，请稍后再试。");
        return;
      }

      const nextFile: ManagedBrowserFile = {
        id: payload.asset.id,
        title: payload.asset.title,
        subtitle: isPersonalLayout ? "新建文档" : "空间新建",
        owner: currentUserIdentity?.name ?? "当前用户",
        updatedAt: fmt(payload.asset.updatedAt),
        folderId: createItemTargetFolder.id,
        subfolderId: newItemTargetInnerFolderId,
        tag: "新建",
        href: withReturnTo(
          payload.openPath ?? `/docs/documents/${payload.asset.id}`,
          returnToHref,
        ),
        kind: payload.asset.kind,
        source: "asset",
        storageKind: payload.asset.kind,
      };
      const nextActiveFolderId = createItemTargetFolder.id;
      const nextActiveInnerFolderId = newItemTargetInnerFolderId;
      const nextManagedFiles = [nextFile, ...managedFiles];

      setManagedFiles(nextManagedFiles);
      setActiveFolderId(nextActiveFolderId);
      setActiveInnerFolderId(nextActiveInnerFolderId);
      setNewItemDialogOpen(false);

      await persistBrowserStateSnapshot({
        nextManagedFiles,
        nextActiveFolderId,
        nextActiveInnerFolderId,
      });

      router.push(
        withReturnTo(
          payload.openPath ?? `/docs/documents/${payload.asset.id}`,
          returnToHref,
        ),
      );
    } catch {
      setNewItemError("新建文档失败，请稍后再试。");
    } finally {
      setIsCreatingNewItem(false);
    }
  }
  function createInnerFolder() {
    if (!canCreate || activeFolderId === "all") return;
    const next = {
      id: makeId("inner-folder"),
      parentFolderId: activeFolderId,
      parentInnerFolderId: activeInnerFolderId,
      name: DEFAULT_FOLDER_NAME,
      description: "",
      tone: activeFolder.tone,
      icon: "folder" as const,
    };
    setInnerFolders((cur) => [...cur, next]);
    startRename({ type: "inner-folder", id: next.id }, next.name);
  }
  function descendants(rootId: string) {
    const ids: string[] = [];
    const queue = [rootId];
    while (queue.length) {
      const id = queue.shift();
      if (!id) continue;
      ids.push(id);
      queue.push(
        ...innerFolders
          .filter((f) => f.parentInnerFolderId === id)
          .map((f) => f.id),
      );
    }
    return ids;
  }
  async function markLifecycle(
    file: ManagedBrowserFile,
    action: "trash" | "restore",
  ) {
    await fetch("/api/browser-state/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        workspaceId,
        shareMode: sharedWorkspaceState ? "workspace" : "personal",
        fileId: file.id,
        action,
        folderId: file.folderId,
        subfolderId: file.subfolderId,
        titleOverride:
          file.title !== fileMap.get(file.id)?.title ? file.title : undefined,
      }),
    }).catch(() => null);
  }
  async function trashFile(file: ManagedBrowserFile) {
    if (!canManage) return;
    await markLifecycle(file, "trash");
    if (file.source === "asset" && file.storageKind)
      await fetch("/api/assets/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: file.id,
          kind: file.storageKind,
          workspaceId,
        }),
      }).catch(() => null);
    const now = new Date().toISOString();
    setManagedFiles((cur) =>
      cur.map((f) =>
        f.id === file.id ? { ...f, isTrashed: true, trashedAt: now } : f,
      ),
    );
  }
  async function trashFiles(filesToTrash: ManagedBrowserFile[]) {
    for (const file of filesToTrash) await trashFile(file);
  }
  async function deleteBigFolder(folderId: string) {
    if (!canDeleteRootFolders || folderId === "all") return;
    if (!window.confirm("所有文件都会进入回收站，确定删除这个大文件夹吗？"))
      return;
    const innerIds = innerFolders
      .filter((f) => f.parentFolderId === folderId)
      .flatMap((f) => descendants(f.id));
    const targets = managedFiles.filter(
      (f) =>
        !f.isTrashed &&
        !f.isDeleted &&
        f.folderId === folderId &&
        (f.subfolderId === null || innerIds.includes(f.subfolderId)),
    );
    await trashFiles(targets);
    setDeletedFolderIds((cur) => Array.from(new Set([...cur, folderId])));
    setInnerFolders((cur) => cur.filter((f) => f.parentFolderId !== folderId));
    setBoardMessages((cur) => cur.filter((m) => m.folderId !== folderId));
    if (activeFolderId === folderId) {
      setActiveFolderId("all");
      setActiveInnerFolderId(null);
    }
  }
  async function deleteInnerFolder(folderId: string) {
    if (!canManage) return;
    const ids = descendants(folderId);
    const targets = managedFiles.filter(
      (f) =>
        !f.isTrashed &&
        !f.isDeleted &&
        f.folderId === activeFolderId &&
        f.subfolderId &&
        ids.includes(f.subfolderId),
    );
    await trashFiles(targets);
    setInnerFolders((cur) => cur.filter((f) => !ids.includes(f.id)));
    setBoardMessages((cur) =>
      cur.filter(
        (m) =>
          !(
            m.folderId === activeFolderId &&
            m.innerFolderId &&
            ids.includes(m.innerFolderId)
          ),
      ),
    );
    if (activeInnerFolderId && ids.includes(activeInnerFolderId)) {
      const folder = innerFolders.find((f) => f.id === folderId);
      setActiveInnerFolderId(folder?.parentInnerFolderId ?? null);
    }
  }
  function moveFile(
    fileId: string,
    folderId: string,
    subfolderId: string | null,
  ) {
    setManagedFiles((cur) =>
      cur.map((f) => (f.id === fileId ? { ...f, folderId, subfolderId } : f)),
    );
  }
  function canMoveInnerFolder(
    folderId: string,
    targetFolderId: string,
    targetParentInnerFolderId: string | null,
  ) {
    if (!canManage) return false;
    if (targetParentInnerFolderId === folderId) return false;
    if (!targetParentInnerFolderId) return true;
    return !descendants(folderId).includes(targetParentInnerFolderId);
  }
  function moveInnerFolder(
    folderId: string,
    targetFolderId: string,
    targetParentInnerFolderId: string | null,
  ) {
    if (!canMoveInnerFolder(folderId, targetFolderId, targetParentInnerFolderId))
      return;
    const ids = descendants(folderId);
    setInnerFolders((cur) =>
      cur.map((folder) => {
        if (!ids.includes(folder.id)) return folder;
        if (folder.id === folderId) {
          return {
            ...folder,
            parentFolderId: targetFolderId,
            parentInnerFolderId: targetParentInnerFolderId,
          };
        }
        return {
          ...folder,
          parentFolderId: targetFolderId,
        };
      }),
    );
    setManagedFiles((cur) =>
      cur.map((file) =>
        file.subfolderId && ids.includes(file.subfolderId)
          ? { ...file, folderId: targetFolderId }
          : file,
      ),
    );
    setBoardMessages((cur) =>
      cur.map((message) =>
        message.innerFolderId && ids.includes(message.innerFolderId)
          ? { ...message, folderId: targetFolderId }
          : message,
      ),
    );
  }
  async function cloneFileIntoWorkspace(
    file: ManagedBrowserFile,
    targetWorkspaceId: string,
    titleOverride?: string,
  ) {
    const response = await fetch("/api/assets/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: file.storageKind ?? file.kind,
        assetId: file.id,
        source: file.source ?? "sample",
        sampleFileName: file.sampleFileName,
        title:
          titleOverride ??
          (file.title.includes("副本") ? file.title : `${file.title} 副本`),
        targetWorkspaceId,
      }),
    }).catch(() => null);
    if (!response?.ok) return null;

    return (await response.json().catch(() => null)) as
      | {
          asset?: {
            id: string;
            kind: BrowserFile["kind"];
            title: string;
            updatedAt: string;
          };
          openPath?: string;
        }
      | null;
  }
  async function copyIntoCurrentWorkspace(
    file: ManagedBrowserFile,
    folderId: string,
    subfolderId: string | null,
    titleOverride?: string,
  ) {
    if (!workspaceId) return null;
    const payload = await cloneFileIntoWorkspace(file, workspaceId, titleOverride);
    if (!payload?.asset) return null;
    return {
      id: payload.asset.id,
      title: payload.asset.title,
      subtitle: file.subtitle,
      owner: currentUserIdentity?.name ?? file.owner,
      updatedAt: fmt(payload.asset.updatedAt),
      folderId,
      subfolderId,
      tag: file.tag,
      href: withReturnTo(
        payload.openPath ?? `/docs/documents/${payload.asset.id}`,
        returnToHref,
      ),
      kind: payload.asset.kind,
      source: "asset" as const,
      storageKind: payload.asset.kind,
    } satisfies ManagedBrowserFile;
  }
  async function copyInnerFolder(
    folderId: string,
    targetFolderId: string,
    targetParentInnerFolderId: string | null,
  ) {
    if (!canManage) return;
    const sourceFolder = innerFolders.find((folder) => folder.id === folderId);
    if (!sourceFolder) return;
    if (!canMoveInnerFolder(folderId, targetFolderId, targetParentInnerFolderId))
      return;

    const ids = descendants(folderId);
    const sourceFolders = innerFolders.filter((folder) => ids.includes(folder.id));
    const copiedFolders: InnerFolder[] = [];
    const folderIdMap = new Map<string, string>();
    const queue = [folderId];

    while (queue.length) {
      const currentId = queue.shift();
      if (!currentId) continue;
      const current = sourceFolders.find((folder) => folder.id === currentId);
      if (!current) continue;
      const nextId = makeId("inner-folder");
      folderIdMap.set(current.id, nextId);
      copiedFolders.push({
        ...current,
        id: nextId,
        parentFolderId: targetFolderId,
        parentInnerFolderId:
          current.id === folderId
            ? targetParentInnerFolderId
            : current.parentInnerFolderId
              ? (folderIdMap.get(current.parentInnerFolderId) ?? null)
              : null,
        name:
          current.id === folderId && !current.name.includes("副本")
            ? `${current.name} 副本`
            : current.name,
      });
      queue.push(
        ...sourceFolders
          .filter((folder) => folder.parentInnerFolderId === current.id)
          .map((folder) => folder.id),
      );
    }

    const copiedFiles: ManagedBrowserFile[] = [];
    const targetFiles = managedFiles.filter(
      (file) =>
        !file.isTrashed &&
        !file.isDeleted &&
        file.subfolderId &&
        ids.includes(file.subfolderId),
    );

    for (const file of targetFiles) {
      const nextSubfolderId = file.subfolderId
        ? (folderIdMap.get(file.subfolderId) ?? null)
        : null;
      const copied = await copyIntoCurrentWorkspace(
        file,
        targetFolderId,
        nextSubfolderId,
        file.title,
      );
      if (copied) copiedFiles.push(copied);
    }

    setInnerFolders((cur) => [...cur, ...copiedFolders]);
    if (copiedFiles.length) {
      setManagedFiles((cur) => [...copiedFiles, ...cur]);
    }
  }
  function copySelectionToClipboard(mode: "cut" | "copy") {
    if (!selectedItems.length) return;
    setClipboardItem({
      mode,
      items: selectedItems,
    });
    setContextMenu(null);
  }
  async function deleteSelectedItems() {
    if (!canManage || !selectedItems.length) return;
    for (const folderId of selectedInnerFolderIds) {
      await deleteInnerFolder(folderId);
    }
    const fileIdSet = new Set(selectedFileIds);
    const filesToTrash = managedFiles.filter(
      (file) =>
        fileIdSet.has(file.id) &&
        !file.isTrashed &&
        !file.isDeleted,
    );
    if (filesToTrash.length) {
      await trashFiles(filesToTrash);
    }
    clearSelection();
    setContextMenu(null);
  }
  async function pasteHere(folderId: string, subfolderId: string | null) {
    if (!clipboardItem?.items.length) return;

    const folderEntries = clipboardItem.items.filter(
      (item) => item.kind === "inner-folder",
    );
    const fileEntries = clipboardItem.items.filter(
      (item) => item.kind === "file",
    );

    if (clipboardItem.mode === "cut") {
      for (const folderEntry of folderEntries) {
        moveInnerFolder(folderEntry.id, folderId, subfolderId);
      }
      for (const fileEntry of fileEntries) {
        moveFile(fileEntry.id, folderId, subfolderId);
      }
      setClipboardItem(null);
      return;
    }

    for (const folderEntry of folderEntries) {
      const folder = innerFolders.find((item) => item.id === folderEntry.id);
      if (!folder) continue;
      await copyInnerFolder(folder.id, folderId, subfolderId);
    }

    const copiedFiles: ManagedBrowserFile[] = [];
    for (const fileEntry of fileEntries) {
      const file = managedFiles.find((item) => item.id === fileEntry.id);
      if (!file) continue;
      const copied = await copyIntoCurrentWorkspace(file, folderId, subfolderId);
      if (copied) copiedFiles.push(copied);
    }
    if (copiedFiles.length) {
      setManagedFiles((cur) => [...copiedFiles, ...cur]);
    }
  }
  async function copyToTarget(
    file: ManagedBrowserFile,
    target: BrowserCopyTarget,
  ) {
    setCopyingOut(true);
    try {
      await cloneFileIntoWorkspace(file, target.workspaceId, file.title);
      setCopyFileId(null);
      router.refresh();
    } finally {
      setCopyingOut(false);
    }
  }
  async function persistStructuredCopyTargetState(params: {
    target: BrowserCopyTarget;
    nextInnerFolders: BrowserCopyTargetInnerFolder[];
    nextFileStates: BrowserCopyTargetFileState[];
  }) {
    const { target, nextInnerFolders, nextFileStates } = params;
    await fetch("/api/browser-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        workspaceId: target.workspaceId,
        shareMode: target.shareMode,
        activeFolderId: params.target.folders?.[0]?.id ?? "all",
        activeInnerFolderId: null,
        folderViewMode: "small",
        deletedFolderIds: target.deletedFolderIds ?? [],
        customFolders: target.customFolders ?? [],
        innerFolders: nextInnerFolders,
        fileStates: nextFileStates,
        boardMessages: target.boardMessages ?? [],
      }),
    }).catch(() => null);
  }
  async function uploadSourceToStructuredSpace() {
    if (!spaceUploadSource) return;
    const target = selectedSpaceUploadTarget;
    if (!target || target.shareMode !== "workspace") {
      setSpaceUploadError("请先选择一个可用的合作空间。");
      return;
    }
    if (!spaceUploadTargetFolderId) {
      setSpaceUploadError("请先选择要放入的目标文件夹。");
      return;
    }

    setSpaceUploadingOut(true);
    setSpaceUploadError("");

    try {
      const nextInnerFolders = [...(target.innerFolders ?? [])];
      const nextFileStates = [...(target.fileStates ?? [])];

      const appendFileState = (fileState: BrowserCopyTargetFileState) => {
        nextFileStates.push(fileState);
      };

      if (spaceUploadSource.kind === "file") {
        const file = managedFiles.find((item) => item.id === spaceUploadSource.id);
        if (!file) {
          setSpaceUploadError("没有找到要上传的文件。");
          return;
        }
        const payload = await cloneFileIntoWorkspace(
          file,
          target.workspaceId,
          file.title,
        );
        if (!payload?.asset) {
          setSpaceUploadError("文件上传到合作空间失败，请稍后再试。");
          return;
        }
        appendFileState({
          fileId: payload.asset.id,
          folderId: spaceUploadTargetFolderId,
          subfolderId: spaceUploadTargetInnerFolderId,
        });
      }

      if (spaceUploadSource.kind === "inner-folder") {
        const sourceRoot =
          innerFolders.find((item) => item.id === spaceUploadSource.id) ?? null;
        if (!sourceRoot) {
          setSpaceUploadError("没有找到要上传的子文件夹。");
          return;
        }

        const sourceIds = descendants(sourceRoot.id);
        const sourceFolders = innerFolders.filter((folder) =>
          sourceIds.includes(folder.id),
        );
        const sourceFiles = managedFiles.filter(
          (file) =>
            !file.isTrashed &&
            !file.isDeleted &&
            file.subfolderId &&
            sourceIds.includes(file.subfolderId),
        );
        const folderIdMap = new Map<string, string>();
        const queue = [sourceRoot.id];

        while (queue.length) {
          const currentId = queue.shift();
          if (!currentId) continue;
          const current = sourceFolders.find((folder) => folder.id === currentId);
          if (!current) continue;

          const nextId = makeId("inner-folder");
          folderIdMap.set(current.id, nextId);
          nextInnerFolders.push({
            ...current,
            id: nextId,
            parentFolderId: spaceUploadTargetFolderId,
            parentInnerFolderId:
              current.id === sourceRoot.id
                ? spaceUploadTargetInnerFolderId
                : current.parentInnerFolderId
                  ? (folderIdMap.get(current.parentInnerFolderId) ?? null)
                  : null,
          });
          queue.push(
            ...sourceFolders
              .filter((folder) => folder.parentInnerFolderId === current.id)
              .map((folder) => folder.id),
          );
        }

        for (const file of sourceFiles) {
          const payload = await cloneFileIntoWorkspace(
            file,
            target.workspaceId,
            file.title,
          );
          if (!payload?.asset) continue;
          appendFileState({
            fileId: payload.asset.id,
            folderId: spaceUploadTargetFolderId,
            subfolderId: file.subfolderId
              ? (folderIdMap.get(file.subfolderId) ?? null)
              : null,
          });
        }
      }

      if (spaceUploadSource.kind === "folder") {
        const sourceFolder =
          allFolders.find((item) => item.id === spaceUploadSource.id) ?? null;
        if (!sourceFolder || sourceFolder.id === "all") {
          setSpaceUploadError("没有找到要上传的大文件夹。");
          return;
        }
        if (NON_DESTINATION_FOLDER_IDS.has(sourceFolder.id)) {
          setSpaceUploadError("这个系统文件夹不能整体上传到合作空间。");
          return;
        }

        const wrapperFolderId = makeId("inner-folder");
        nextInnerFolders.push({
          id: wrapperFolderId,
          parentFolderId: spaceUploadTargetFolderId,
          parentInnerFolderId: spaceUploadTargetInnerFolderId,
          name: sourceFolder.name,
          description: sourceFolder.description,
          tone: sourceFolder.tone,
          icon: sourceFolder.icon ?? "folder",
        });

        const sourceFolders = innerFolders.filter(
          (folder) => folder.parentFolderId === sourceFolder.id,
        );
        const folderIdMap = new Map<string, string>();
        const topLevelFolderIds = sourceFolders
          .filter((folder) => folder.parentInnerFolderId === null)
          .map((folder) => folder.id);
        const queue = [...topLevelFolderIds];

        while (queue.length) {
          const currentId = queue.shift();
          if (!currentId) continue;
          const current = sourceFolders.find((folder) => folder.id === currentId);
          if (!current) continue;

          const nextId = makeId("inner-folder");
          folderIdMap.set(current.id, nextId);
          nextInnerFolders.push({
            ...current,
            id: nextId,
            parentFolderId: spaceUploadTargetFolderId,
            parentInnerFolderId: current.parentInnerFolderId
              ? (folderIdMap.get(current.parentInnerFolderId) ?? wrapperFolderId)
              : wrapperFolderId,
          });
          queue.push(
            ...sourceFolders
              .filter((folder) => folder.parentInnerFolderId === current.id)
              .map((folder) => folder.id),
          );
        }

        const sourceFiles = managedFiles.filter(
          (file) =>
            !file.isTrashed &&
            !file.isDeleted &&
            file.folderId === sourceFolder.id,
        );
        for (const file of sourceFiles) {
          const payload = await cloneFileIntoWorkspace(
            file,
            target.workspaceId,
            file.title,
          );
          if (!payload?.asset) continue;
          appendFileState({
            fileId: payload.asset.id,
            folderId: spaceUploadTargetFolderId,
            subfolderId: file.subfolderId
              ? (folderIdMap.get(file.subfolderId) ?? wrapperFolderId)
              : wrapperFolderId,
          });
        }
      }

      await persistStructuredCopyTargetState({
        target,
        nextInnerFolders,
        nextFileStates,
      });

      setSpaceUploadTargets((current) =>
        current.map((item) =>
          item.id === target.id
            ? {
                ...item,
                innerFolders: nextInnerFolders,
                fileStates: nextFileStates,
              }
            : item,
        ),
      );
      closeSpaceUploadDialog();
    } catch {
      setSpaceUploadError("上传到合作空间失败，请稍后再试。");
    } finally {
      setSpaceUploadingOut(false);
    }
  }
  async function uploadFiles(
    fileList: File[],
    folderId: string,
    subfolderId: string | null,
  ) {
    if (!canCreate || fileList.length === 0) return;
    setUploadError("");
    setIsUploading(true);
    try {
      const added: ManagedBrowserFile[] = [];
      for (const file of fileList) {
        const form = new FormData();
        form.append("kind", uploadKind);
        form.append("file", file);
        if (workspaceId) form.append("workspaceId", workspaceId);
        const response = await fetch("/api/assets/upload", {
          method: "POST",
          body: form,
        });
        const payload = (await response.json().catch(() => null)) as {
          asset?: {
            id: string;
            kind: BrowserFile["kind"];
            title: string;
            updatedAt: string;
          };
          openPath?: string;
          message?: string;
        } | null;
        if (!response.ok || !payload?.asset) {
          setUploadError(payload?.message ?? "上传失败，请稍后再试。");
          continue;
        }
        added.push({
          id: payload.asset.id,
          title: payload.asset.title,
          subtitle: sharedWorkspaceState ? "空间上传" : "真实上传",
          owner: currentUserIdentity?.name ?? "当前用户",
          updatedAt: fmt(payload.asset.updatedAt),
          folderId,
          subfolderId,
          tag: "上传",
          href: withReturnTo(
            payload.openPath ?? `/docs/documents/${payload.asset.id}`,
            returnToHref,
          ),
          kind: payload.asset.kind,
          source: "asset",
          storageKind: payload.asset.kind,
        });
      }
      if (added.length) setManagedFiles((cur) => [...added, ...cur]);
    } catch {
      setUploadError("上传失败，请检查本地服务。");
    } finally {
      setIsUploading(false);
    }
  }
  function postMessage() {
    const msg = boardDraft.trim();
    if (!msg || !sharedWorkspaceState || activeFolderId === "all") return;
    setBoardMessages((cur) => [
      ...cur,
      {
        id: makeId("board"),
        folderId: activeFolderId,
        innerFolderId: activeInnerFolderId,
        authorUserId: currentUserIdentity?.id,
        authorName: currentUserIdentity?.name ?? "当前成员",
        authorRole: currentUserIdentity?.roleLabel,
        message: msg,
        postedAt: new Date().toISOString(),
      },
    ]);
    setBoardDraft("");
  }
  async function inviteMembers() {
    if (!workspaceId || selectedInviteEmails.length === 0) return;
    setSavingMembers(true);
    setMemberError("");
    try {
      const response = await fetch("/api/workspace-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invite",
          workspaceId,
          memberEmails: selectedInviteEmails,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok) {
        setMemberError(payload?.message ?? "邀请失败，请稍后再试。");
        return;
      }
      const added = workspaceContacts
        .filter((c) => selectedInviteEmails.includes(c.email))
        .map((c) => ({
          id: c.id,
          email: c.email,
          name: c.name,
          avatarLabel: c.avatarLabel ?? initial(c.name),
        }));
      setWorkspaceMembers((cur) => [...cur, ...added]);
      setWorkspaceContacts((cur) =>
        cur.filter((c) => !selectedInviteEmails.includes(c.email)),
      );
      setSelectedInviteEmails([]);
      setInviteOpen(false);
      router.refresh();
    } finally {
      setSavingMembers(false);
    }
  }
  async function removeMember(member: BrowserMemberChip) {
    if (!workspaceId || !member.email) return;
    setMemberError("");
    const response = await fetch("/api/workspace-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "remove",
        workspaceId,
        memberEmail: member.email,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    if (!response.ok) {
      setMemberError(payload?.message ?? "移除成员失败。");
      return;
    }
    setWorkspaceMembers((cur) => cur.filter((m) => m.id !== member.id));
    setWorkspaceContacts((cur) => [
      ...cur,
      {
        id: member.id,
        email: member.email!,
        name: member.name,
        avatarLabel: member.avatarLabel,
      },
    ]);
    router.refresh();
  }
  function openMenu(
    e: ReactMouseEvent<HTMLElement>,
    type: "file" | "folder" | "inner-folder" | "content" | "selection",
    id?: string,
  ) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  }
  function onDropRoot(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    const droppedItem = readDraggedItem(e);
    if (hasExternalFiles(e)) {
      void uploadFiles(
        Array.from(e.dataTransfer.files ?? []),
        activeFolderId === "all" ? "all" : activeFolderId,
        activeFolderId === "all" ? null : activeInnerFolderId,
      );
      clearDrag();
      return;
    }
    if (droppedItem && canManage && activeFolderId !== "all") {
      if (droppedItem.kind === "file") {
        moveFile(droppedItem.id, activeFolderId, activeInnerFolderId);
      } else {
        moveInnerFolder(droppedItem.id, activeFolderId, activeInnerFolderId);
      }
    }
    clearDrag();
  }
  function onDropFolder(e: DragEvent<HTMLElement>, folderId: string) {
    e.preventDefault();
    e.stopPropagation();
    const droppedItem = readDraggedItem(e);
    if (hasExternalFiles(e)) {
      void uploadFiles(Array.from(e.dataTransfer.files ?? []), folderId, null);
      clearDrag();
      return;
    }
    if (droppedItem && canManage) {
      if (droppedItem.kind === "file") {
        moveFile(droppedItem.id, folderId, null);
      } else {
        moveInnerFolder(droppedItem.id, folderId, null);
      }
    }
    clearDrag();
  }
  function onDropInner(e: DragEvent<HTMLElement>, folderId: string) {
    e.preventDefault();
    e.stopPropagation();
    const droppedItem = readDraggedItem(e);
    if (hasExternalFiles(e)) {
      void uploadFiles(
        Array.from(e.dataTransfer.files ?? []),
        activeFolderId,
        folderId,
      );
      clearDrag();
      return;
    }
    if (droppedItem && canManage) {
      if (droppedItem.kind === "file") {
        moveFile(droppedItem.id, activeFolderId, folderId);
      } else {
        moveInnerFolder(droppedItem.id, activeFolderId, folderId);
      }
    }
    clearDrag();
  }

  const personalFolderViewMode =
    folderViewMode === "list"
      ? "list"
      : folderViewMode === "large" || folderViewMode === "medium"
        ? "large"
        : "small";
  const rootFolderViewMode = isPersonalLayout
    ? personalFolderViewMode
    : folderViewMode;
  const folderGrid = isPersonalLayout
    ? personalFolderViewMode === "list"
      ? "flex flex-col gap-2.5"
      : personalFolderViewMode === "large"
        ? "grid grid-cols-[repeat(auto-fill,minmax(176px,176px))] justify-start gap-3"
        : "grid grid-cols-[repeat(auto-fill,minmax(92px,92px))] justify-start gap-3"
    : isCompactLayout
      ? folderViewMode === "list"
        ? "flex flex-col gap-3"
        : folderViewMode === "large"
          ? "grid grid-cols-[repeat(auto-fill,minmax(172px,172px))] justify-start gap-3"
          : folderViewMode === "medium"
            ? "grid grid-cols-[repeat(auto-fill,minmax(128px,128px))] justify-start gap-3"
            : "grid grid-cols-[repeat(auto-fill,minmax(92px,92px))] justify-start gap-3"
      : folderViewMode === "list"
        ? "flex flex-col gap-3"
        : folderViewMode === "large"
          ? "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
          : folderViewMode === "medium"
            ? "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
            : "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4";
  const fileGrid = isPersonalLayout
    ? "grid grid-cols-[repeat(auto-fill,minmax(82px,82px))] justify-start gap-x-3 gap-y-4"
    : isCompactLayout
      ? folderViewMode === "list"
        ? "flex flex-col gap-3"
        : folderViewMode === "large"
          ? "grid grid-cols-[repeat(auto-fill,minmax(148px,148px))] justify-start gap-3"
          : folderViewMode === "medium"
            ? "grid grid-cols-[repeat(auto-fill,minmax(112px,112px))] justify-start gap-3"
            : "grid grid-cols-[repeat(auto-fill,minmax(82px,82px))] justify-start gap-x-3 gap-y-4"
      : folderViewMode === "list"
        ? "flex flex-col gap-3"
        : folderViewMode === "large"
          ? "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
          : folderViewMode === "medium"
            ? "grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5"
            : "grid grid-cols-3 gap-x-3 gap-y-5 md:grid-cols-5 xl:grid-cols-7";
  const folderScrollHeight = isPersonalLayout
    ? personalFolderViewMode === "large"
      ? "max-h-[316px]"
      : personalFolderViewMode === "list"
        ? "max-h-[252px]"
        : "max-h-[174px]"
    : isCompactLayout
      ? rootFolderViewMode === "large"
        ? "max-h-[316px]"
        : rootFolderViewMode === "list"
          ? "max-h-[252px]"
          : rootFolderViewMode === "medium"
            ? "max-h-[240px]"
            : "max-h-[174px]"
    : folderViewMode === "list"
      ? "max-h-[260px]"
      : folderViewMode === "large"
        ? "max-h-[236px]"
        : folderViewMode === "medium"
          ? "max-h-[220px]"
          : "max-h-[228px]";
  const currentTitle = activeInnerFolder?.name ?? activeFolder.name;
  const currentDesc =
    activeInnerFolder?.description || activeFolder.description || "当前目录";
  const currentPathText =
    activeFolderId === "all"
      ? allFolderName
      : [activeFolder.name, ...currentPath.map((f) => f.name)].join(" / ");
  const currentCount = visibleFiles.length;
  const shellClass = isCompactLayout
    ? "rounded-[22px] border border-white/80 bg-white/94 p-4 shadow-[0_18px_46px_rgba(15,23,42,0.06)] backdrop-blur"
    : "rounded-[28px] border border-white/80 bg-white/92 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur";
  const heroClass = isCompactLayout
    ? "overflow-hidden rounded-[22px] border border-white/80 bg-white/94 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur"
    : "overflow-hidden rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-[0_26px_80px_rgba(15,23,42,0.07)] backdrop-blur";
  const heroTitleClass = isCompactLayout
    ? "mt-2 text-[22px] font-semibold tracking-tight text-slate-950 md:text-[24px]"
    : "mt-4 text-[34px] font-semibold tracking-tight text-slate-950 md:text-[42px]";
  const heroDescriptionClass = isCompactLayout
    ? "mt-1.5 max-w-2xl text-[13px] leading-5 text-slate-500"
    : "mt-3 max-w-3xl text-[15px] leading-7 text-slate-500";
  const sectionTitleClass = isCompactLayout
    ? "text-[17px] font-semibold tracking-tight text-slate-950"
    : "text-xl font-semibold tracking-tight text-slate-950";
  const contentGridClass = isCompactLayout
    ? "grid gap-3 lg:grid-cols-[196px_minmax(0,1fr)]"
    : "grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)]";
  const isRootFolderSmall = isCompactLayout && rootFolderViewMode === "small";
  const isRootFolderMedium =
    isCompactLayout && rootFolderViewMode === "medium";
  const isRootFolderLarge = isCompactLayout && rootFolderViewMode === "large";
  const isRootFolderList = isCompactLayout && rootFolderViewMode === "list";
  const showContentSectionIntro = !isCompactLayout;
  const showBoardPanel = false;
  const contentScrollClass = isCompactLayout
    ? "mt-3 max-h-[540px] min-h-[420px] overflow-y-auto pr-2 pb-28"
    : "mt-4 max-h-[420px] overflow-y-auto pr-2";

  return (
    <div className="space-y-5">
      {backHref ? (
        <div>
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
          >
            <IconBack />
            返回合作空间
          </Link>
        </div>
      ) : null}
      <section className={heroClass}>
        <div
          className={`flex flex-col xl:flex-row xl:justify-between ${
            isCompactLayout
              ? "gap-4 xl:items-center"
              : "gap-5 xl:items-start"
          }`}
        >
          <div className="max-w-3xl">
            <div
              className={`inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 font-semibold text-blue-700 ${isCompactLayout ? "px-2.5 py-1 text-[11px]" : "px-4 py-2 text-sm"}`}
            >
              <IconFolder icon="folder" className="h-4 w-4" />
              {sectionEyebrow}
            </div>
            <h1 className={heroTitleClass}>
              {title}
            </h1>
            <p className={heroDescriptionClass}>
              {description}
            </p>
            {workspaceMembers.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-2.5">
                {workspaceMembers.map((m) => {
                  const removable =
                    allowMemberManagement &&
                    m.email &&
                    m.email !== currentUserIdentity?.email;
                  return (
                    <div
                      key={m.id}
                      className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3.5 py-2 shadow-sm"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                        {m.avatarLabel || initial(m.name)}
                      </div>
                      <div className="text-sm font-semibold text-slate-800">
                        {m.name}
                      </div>
                      {removable ? (
                        <button
                          type="button"
                          onClick={() => void removeMember(m)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                        >
                          <IconX className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
            {memberError ? (
              <div className="mt-3 text-sm text-rose-600">{memberError}</div>
            ) : null}
          </div>
          <div
            className={`flex flex-wrap items-center justify-end ${
              isCompactLayout ? "gap-2" : "gap-3"
            }`}
          >
            {allowMemberManagement ? (
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className={`rounded-full border border-slate-200 bg-white font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 ${isCompactLayout ? "px-3 py-1.5 text-[11px]" : "px-4 py-2.5 text-sm"}`}
              >
                邀请进入空间
              </button>
            ) : null}
            {canCreate ? (
              <button
                type="button"
                onClick={openCreateFolderDialog}
                className={`rounded-full border border-slate-200 bg-white font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 ${isCompactLayout ? "px-3 py-1.5 text-[11px]" : "px-4 py-2.5 text-sm"}`}
              >
                {newFolderLabel}
              </button>
            ) : null}
            {!hideNewItemButton ? (
              workspaceId && canCreate ? (
                <button
                  type="button"
                  onClick={openCreateItemDialog}
                  className={`rounded-full border border-slate-200 bg-white font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 ${isCompactLayout ? "px-3 py-1.5 text-[11px]" : "px-4 py-2.5 text-sm"}`}
                >
                  {newItemLabel}
                </button>
              ) : (
                <Link
                  href={newItemHref}
                  className={`rounded-full border border-slate-200 bg-white font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 ${isCompactLayout ? "px-3 py-1.5 text-[11px]" : "px-4 py-2.5 text-sm"}`}
                >
                  {newItemLabel}
                </Link>
              )
            ) : null}
            {canCreate ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`rounded-full bg-blue-600 font-semibold text-white shadow-[0_18px_36px_rgba(37,99,235,0.2)] transition hover:bg-blue-700 ${isCompactLayout ? "px-3 py-1.5 text-[11px]" : "px-4 py-2.5 text-sm"}`}
              >
                {isUploading ? "上传中..." : uploadLabel}
              </button>
            ) : null}
          </div>
        </div>
      </section>
      <section className={shellClass}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className={sectionTitleClass}>
              {folderSectionTitle}
            </h2>
            {folderSectionDescription ? (
              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                {folderSectionDescription}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {isPersonalLayout ? (
              <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                {(["small", "large", "list"] as FolderViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFolderViewMode(mode)}
                    className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                      mode === personalFolderViewMode
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {mode === "small" ? "小图标" : mode === "large" ? "大图标" : "列表"}
                  </button>
                ))}
              </div>
            ) : (
              <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                {(["small", "medium", "large", "list"] as FolderViewMode[]).map(
                  (mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setFolderViewMode(mode)}
                      className={`rounded-full px-3 py-2 text-sm font-semibold transition ${mode === folderViewMode ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"}`}
                    >
                      {mode === "small"
                        ? "小图标"
                        : mode === "medium"
                          ? "中图标"
                          : mode === "large"
                            ? "大图标"
                            : "列表"}
                    </button>
                  ),
                )}
              </div>
            )}
            <div
              className={`rounded-full border border-slate-200 bg-white font-semibold text-slate-500 shadow-sm ${
                isCompactLayout ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
              }`}
            >
              {allFolders.length - 1} 个文件夹
            </div>
          </div>
        </div>
        <div className={`mt-5 overflow-y-auto pr-2 ${folderScrollHeight}`}>
          <div className={folderGrid}>
            {allFolders.map((folder) => {
              const s = toneStyles[folder.tone];
              const isActive = folder.id === activeFolderId;
              const isEditing =
                editingTarget?.type === "folder" &&
                editingTarget.id === folder.id;
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => selectFolder(folder.id)}
                  onContextMenu={(e) => {
                    if (
                      folder.id === "all" ||
                      (!canManage && !canDeleteRootFolders)
                    ) {
                      return;
                    }
                    openMenu(e, "folder", folder.id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFolderDropTargetId(folder.id);
                  }}
                  onDragLeave={() =>
                    folderDropTargetId === folder.id &&
                    setFolderDropTargetId(null)
                  }
                  onDrop={(e) => onDropFolder(e, folder.id)}
                  className={`group relative text-left transition ${
                    isRootFolderSmall
                      ? `flex h-[82px] w-[92px] shrink-0 flex-col items-center justify-start rounded-[16px] border border-slate-200 bg-white px-2 py-2 text-center shadow-none ${
                          isActive
                            ? "border-slate-900 bg-slate-50 ring-1 ring-slate-200"
                            : "hover:border-slate-300 hover:bg-slate-50"
                        }`
                      : isRootFolderMedium
                        ? `flex min-h-[108px] w-full flex-col rounded-[18px] border bg-white px-3.5 py-3 shadow-sm ${
                            isActive
                              ? "border-slate-900 ring-1 ring-slate-200"
                              : "border-slate-200 hover:border-slate-300"
                          }`
                        : isRootFolderLarge
                        ? `flex min-h-[136px] w-full flex-col rounded-[20px] border bg-white px-4 py-4 shadow-sm ${
                            isActive
                              ? "border-slate-900 ring-1 ring-slate-200"
                              : "border-slate-200 hover:border-slate-300"
                          }`
                        : isRootFolderList
                          ? `flex h-[64px] w-full items-center justify-between rounded-[18px] border bg-white px-4 shadow-sm ${
                              isActive
                                ? "border-slate-900 ring-1 ring-slate-200"
                                : "border-slate-200 hover:border-slate-300"
                            }`
                          : isCompactLayout
                            ? `flex h-[82px] w-[92px] shrink-0 flex-col items-center justify-start rounded-[16px] border border-slate-200 bg-white px-2 py-2 text-center shadow-none ${
                                isActive
                                  ? "border-slate-900 bg-slate-50 ring-1 ring-slate-200"
                                  : "hover:border-slate-300 hover:bg-slate-50"
                              }`
                            : `h-[136px] rounded-[20px] border p-4 shadow-sm ${s.surface} ${s.border} ${
                                isActive
                                  ? "ring-2 ring-slate-900/10"
                                  : "hover:-translate-y-0.5"
                              }`
                  } ${folderDropTargetId === folder.id ? "ring-2 ring-blue-400" : ""}`}
                >
                  {canDeleteRootFolders && folder.id !== "all" ? (
                    <div
                      className={`absolute ${
                        isRootFolderSmall
                          ? "right-1.5 top-1.5"
                          : isRootFolderList
                            ? "right-2 top-1/2 -translate-y-1/2"
                          : "right-3 top-3"
                      }`}
                    >
                      <span
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void deleteBigFolder(folder.id);
                        }}
                        className={`inline-flex items-center justify-center rounded-full bg-white/90 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 ${
                          isRootFolderSmall
                            ? "h-5 w-5 opacity-0 group-hover:opacity-100"
                          : "h-6 w-6"
                        }`}
                      >
                        <IconX className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  ) : null}
                  {isRootFolderList ? (
                    <>
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`inline-flex rounded-full ${s.tab} ${s.accent} p-2`}
                        >
                          <IconFolder
                            icon={folder.icon ?? "folder"}
                            className="h-4 w-4"
                          />
                        </div>
                        <div className="min-w-0">
                          {isEditing ? (
                            <input
                              ref={renameInputRef}
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitRename();
                                if (e.key === "Escape") stopRename();
                              }}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base font-semibold text-slate-950 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          ) : (
                            <div
                              className="truncate text-sm font-semibold tracking-tight text-slate-950"
                            >
                              {folder.name}
                            </div>
                          )}
                        </div>
                      </div>
                      <div
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${s.chip}`}
                      >
                        {folder.count} 项
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className={`inline-flex rounded-full ${s.tab} ${s.accent} ${
                          isRootFolderLarge || isRootFolderMedium
                            ? "p-2"
                            : isCompactLayout
                              ? "p-1.5"
                              : "p-2.5"
                        }`}
                      >
                        <IconFolder
                          icon={folder.icon ?? "folder"}
                          className={
                            isRootFolderLarge || isRootFolderMedium
                              ? "h-5 w-5"
                              : isCompactLayout
                                ? "h-4 w-4"
                                : "h-5 w-5"
                          }
                        />
                      </div>
                      {(isRootFolderLarge || isRootFolderMedium || !isCompactLayout) ? (
                        <div
                          className={`absolute right-4 top-4 rounded-full px-2.5 py-1 text-xs font-semibold ${s.chip}`}
                        >
                          {folder.count} 项
                        </div>
                      ) : null}
                      <div
                        className={
                          isRootFolderLarge
                            ? "mt-4 w-full"
                            : isRootFolderMedium
                              ? "mt-3 w-full"
                            : isCompactLayout
                              ? "mt-2 w-full"
                              : "mt-6"
                        }
                      >
                        {isEditing ? (
                          <input
                            ref={renameInputRef}
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") stopRename();
                            }}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base font-semibold text-slate-950 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        ) : (
                          <div
                            className={`font-semibold tracking-tight text-slate-950 ${
                              isRootFolderLarge
                                ? "text-[14px] leading-5"
                                : isRootFolderMedium
                                  ? "text-[13px] leading-5"
                                : isCompactLayout
                                  ? "text-[12px] leading-4"
                                  : "text-[15px]"
                            }`}
                            style={titleClamp}
                          >
                            {folder.name}
                          </div>
                        )}
                        {isRootFolderSmall ? (
                          <div className="mt-1 text-[10px] font-medium text-slate-400">
                            {folder.count} 项
                          </div>
                        ) : null}
                        {isRootFolderMedium ? (
                          <div
                            className="mt-1 text-[11px] leading-4 text-slate-400"
                            style={descriptionClamp}
                          >
                            {folder.description}
                          </div>
                        ) : null}
                        {(isRootFolderLarge || !isCompactLayout) ? (
                          <div
                            className="mt-1.5 text-[12px] leading-5 text-slate-500"
                            style={descriptionClamp}
                          >
                            {folder.description}
                          </div>
                        ) : null}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className={shellClass}>
        {showContentSectionIntro ? (
          <div className="mb-4">
            <h2 className={sectionTitleClass}>
              {currentTitle} 内容
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-500">
              {contentSectionDescription}
            </p>
            <div className="mt-2 text-xs font-semibold text-slate-400">
              {currentPathText}
            </div>
          </div>
        ) : null}
        <div className={contentGridClass}>
          <div className="space-y-4">
            <div
              className={`rounded-[22px] border shadow-sm ${tone.surface} ${tone.border} ${isCompactLayout ? "p-3" : "p-4"}`}
            >
              <div
                className={`inline-flex items-center gap-2 rounded-full font-semibold ${tone.chip} ${isCompactLayout ? "px-2.5 py-1 text-[11px]" : "px-4 py-2 text-sm"}`}
              >
                <IconFolder
                  icon={activeFolder.icon ?? "folder"}
                  className="h-4 w-4"
                />
                当前区域
              </div>
              <div
                className={`mt-4 font-semibold tracking-tight text-slate-950 ${
                  isCompactLayout ? "text-[15px]" : "text-lg"
                }`}
              >
                {currentTitle}
              </div>
              <div
                className={`mt-2 text-slate-500 ${
                  isCompactLayout ? "text-xs leading-5" : "text-sm leading-6"
                }`}
              >
                {currentDesc}
              </div>
              <div
                className={`mt-4 grid ${
                  isCompactLayout ? "grid-cols-1 gap-2" : "grid-cols-2 gap-3"
                }`}
              >
                <div
                  className={`rounded-[18px] border border-white/80 bg-white/90 shadow-sm ${
                    isCompactLayout ? "p-3" : "p-3.5"
                  }`}
                >
                  <div
                    className={`font-semibold text-slate-400 ${
                      isCompactLayout ? "text-xs" : "text-sm"
                    }`}
                  >
                    内容数
                  </div>
                  <div
                    className={`mt-2 font-semibold text-slate-950 ${
                      isCompactLayout ? "text-lg" : "text-xl"
                    }`}
                  >
                    {currentCount}
                  </div>
                </div>
                <div
                  className={`rounded-[18px] border border-white/80 bg-white/90 shadow-sm ${
                    isCompactLayout ? "p-3" : "p-3.5"
                  }`}
                >
                  <div
                    className={`font-semibold text-slate-400 ${
                      isCompactLayout ? "text-xs" : "text-sm"
                    }`}
                  >
                    操作
                  </div>
                  <div className="mt-2.5 space-y-2">
                    {activeInnerFolderId ? (
                      <button
                        type="button"
                        onClick={() =>
                          selectInnerFolder(
                            activeInnerFolder?.parentInnerFolderId ?? null,
                          )
                        }
                        className={`w-full rounded-full border border-slate-200 bg-white font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 ${
                          isCompactLayout
                            ? "px-3 py-1.5 text-xs"
                            : "px-3 py-2 text-sm"
                        }`}
                      >
                        返回上一级
                      </button>
                    ) : null}
                    {activeFolderId !== "all" && canCreate ? (
                      <button
                        type="button"
                        onClick={createInnerFolder}
                        className={`w-full rounded-full bg-slate-900 font-semibold text-white transition hover:bg-slate-800 ${
                          isCompactLayout
                            ? "px-3 py-1.5 text-xs"
                            : "px-3 py-2 text-sm"
                        }`}
                      >
                        在当前区域创建
                      </button>
                    ) : null}
                    {clipboardItem && canManage && activeFolderId !== "all" ? (
                      <button
                        type="button"
                        onClick={() =>
                          void pasteHere(activeFolderId, activeInnerFolderId)
                        }
                        className={`w-full rounded-full border border-slate-200 bg-white font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 ${
                          isCompactLayout
                            ? "px-3 py-1.5 text-xs"
                            : "px-3 py-2 text-sm"
                        }`}
                      >
                        粘贴到这里
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            {showBoardPanel && sharedWorkspaceState ? (
              <div className="rounded-[22px] border border-slate-200 bg-white/96 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-slate-950">
                      互动留言板
                    </h3>
                    <div className="mt-1 text-sm text-slate-500">
                      {currentTitle}
                    </div>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-500">
                    {currentMessages.length} 条
                  </div>
                </div>
                <div
                  ref={boardScrollerRef}
                  className="mt-4 max-h-[300px] space-y-3 overflow-y-auto pr-2"
                >
                  {currentMessages.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-sm text-slate-500">
                      这里还没有留言。
                    </div>
                  ) : (
                    currentMessages.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-[20px] border border-slate-200 bg-white px-4 py-3.5 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                              {initial(m.authorName)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {m.authorName}
                              </div>
                              <div className="text-xs text-slate-500">
                                {m.authorRole || "空间成员"}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-xs font-semibold text-slate-400">
                            {fmt(m.postedAt)}
                          </div>
                        </div>
                        <div className="mt-3 text-sm leading-7 text-slate-700">
                          {m.message}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-4 rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <input
                      value={boardDraft}
                      onChange={(e) => setBoardDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          postMessage();
                        }
                      }}
                      disabled={activeFolderId === "all"}
                      placeholder={
                        activeFolderId === "all"
                          ? "进入具体文件夹后再留言"
                          : `给 ${currentTitle} 留一句话`
                      }
                      className="h-11 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={postMessage}
                      disabled={!boardDraft.trim() || activeFolderId === "all"}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <IconPlane />
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            {activeFolderId !== "all" ? (
              <div className="rounded-[22px] border border-slate-200 bg-white/96 p-4 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h3
                      className={`font-semibold tracking-tight text-slate-950 ${
                        isCompactLayout ? "text-[15px]" : "text-lg"
                      }`}
                    >
                      文件夹节点
                    </h3>
                    <p
                      className={`mt-1.5 text-slate-500 ${
                        isCompactLayout ? "text-xs leading-5" : "text-sm leading-6"
                      }`}
                    >
                      拖动画布可上下左右查看全貌，点击节点可快速跳转到对应目录。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                      <button
                        type="button"
                        onClick={() => scrollNodeMapBy(0, -160)}
                        className={`inline-flex items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 ${
                          isCompactLayout ? "h-8 w-8" : "h-9 w-9"
                        }`}
                        aria-label="向上移动"
                      >
                        <IconArrow direction="up" />
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollNodeMapBy(-180, 0)}
                        className={`inline-flex items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 ${
                          isCompactLayout ? "h-8 w-8" : "h-9 w-9"
                        }`}
                        aria-label="向左移动"
                      >
                        <IconArrow direction="left" />
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollNodeMapBy(180, 0)}
                        className={`inline-flex items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 ${
                          isCompactLayout ? "h-8 w-8" : "h-9 w-9"
                        }`}
                        aria-label="向右移动"
                      >
                        <IconArrow direction="right" />
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollNodeMapBy(0, 160)}
                        className={`inline-flex items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 ${
                          isCompactLayout ? "h-8 w-8" : "h-9 w-9"
                        }`}
                        aria-label="向下移动"
                      >
                        <IconArrow direction="down" />
                      </button>
                    </div>
                    {activeInnerFolderId ? (
                      <button
                        type="button"
                        onClick={() =>
                          selectInnerFolder(
                            activeInnerFolder?.parentInnerFolderId ?? null,
                          )
                        }
                        className={`rounded-full border border-slate-200 bg-white font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 ${
                          isCompactLayout ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
                        }`}
                      >
                        返回上一级
                      </button>
                    ) : null}
                    {canCreate ? (
                      <button
                        type="button"
                        onClick={createInnerFolder}
                        className={`rounded-full bg-slate-900 font-semibold text-white transition hover:bg-slate-800 ${
                          isCompactLayout ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
                        }`}
                      >
                        新建文件夹
                      </button>
                    ) : null}
                    {clipboardItem && canManage ? (
                      <button
                        type="button"
                        onClick={() =>
                          void pasteHere(activeFolderId, activeInnerFolderId)
                        }
                        className={`rounded-full border border-slate-200 bg-white font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 ${
                          isCompactLayout ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
                        }`}
                      >
                        粘贴
                      </button>
                    ) : null}
                  </div>
                </div>
                <div
                  className={`mt-4 rounded-[20px] border border-slate-200 bg-slate-50/80 ${
                    isCompactLayout ? "p-3" : "p-4"
                  }`}
                >
                  <div
                    ref={nodeMapViewportRef}
                    onMouseDown={beginNodeMapDrag}
                    className={`overflow-auto pr-2 ${
                      isCompactLayout ? "max-h-[252px]" : "max-h-[320px]"
                    } ${isDraggingNodeMap ? "cursor-grabbing" : "cursor-grab"}`}
                  >
                    <div
                      className={`flex min-w-max items-start pb-2 ${
                        isCompactLayout ? "gap-4" : "gap-5"
                      }`}
                    >
                      <div className="sticky left-0 z-10 pr-1">
                        <button
                          type="button"
                          onClick={() => selectInnerFolder(null)}
                          data-node-active={activeInnerFolderId === null}
                          className={`inline-flex items-center gap-2 rounded-[16px] border font-semibold transition ${
                            isCompactLayout
                              ? "w-[132px] px-3 py-2.5 text-xs"
                              : "w-[156px] px-4 py-3 text-sm"
                          } ${
                            activeInnerFolderId === null
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700"
                          }`}
                        >
                          <IconFolder
                            icon={activeFolder.icon ?? "folder"}
                            className="h-4 w-4"
                          />
                          <span className="truncate">{activeFolder.name}</span>
                        </button>
                      </div>

                      {treeColumns.length > 0 ? (
                        treeColumns.map((column, columnIndex) => (
                          <div
                            key={`column-${columnIndex}`}
                            className={`relative border-l border-slate-200 ${
                              isCompactLayout
                                ? "min-w-[152px] pl-4"
                                : "min-w-[176px] pl-5"
                            }`}
                          >
                            <div className={isCompactLayout ? "space-y-2.5" : "space-y-3"}>
                              {column.map((folder) => {
                                const editing =
                                  editingTarget?.type === "inner-folder" &&
                                  editingTarget.id === folder.id;
                                const isActive = activeInnerFolderId === folder.id;
                                const isOnPath = currentPathIds.has(folder.id);

                                return (
                                  <div
                                    key={folder.id}
                                    className="relative flex items-center gap-3"
                                  >
                                    <div
                                      className={
                                        isCompactLayout
                                          ? "h-px w-4 bg-slate-200"
                                          : "h-px w-5 bg-slate-200"
                                      }
                                    />
                                    <button
                                      type="button"
                                      onClick={() => selectInnerFolder(folder.id)}
                                      onContextMenu={(e) =>
                                        openMenu(e, "inner-folder", folder.id)
                                      }
                                      data-node-active={isActive}
                                      className={`inline-flex items-center gap-2 rounded-[16px] border font-semibold transition ${
                                        isCompactLayout
                                          ? "w-[126px] px-3 py-2.5 text-xs"
                                          : "w-[150px] px-4 py-3 text-sm"
                                      } ${
                                        isActive
                                          ? "border-slate-900 bg-slate-900 text-white"
                                          : isOnPath
                                            ? "border-blue-200 bg-blue-50 text-blue-700"
                                            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700"
                                      }`}
                                    >
                                      {editing ? (
                                        <input
                                          ref={renameInputRef}
                                          value={editingValue}
                                          onChange={(e) =>
                                            setEditingValue(e.target.value)
                                          }
                                          onBlur={commitRename}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") commitRename();
                                            if (e.key === "Escape") stopRename();
                                          }}
                                          className="w-full bg-transparent outline-none"
                                        />
                                      ) : (
                                        <>
                                          <IconFolder
                                            icon={folder.icon}
                                            className="h-4 w-4 shrink-0"
                                          />
                                          <span className="truncate">
                                            {folder.name}
                                          </span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-5 py-8 text-sm text-slate-500">
                          这里还没有子文件夹，新建后会显示在节点图里。
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            <div
              onContextMenu={(e) =>
                openMenu(e, selectedCount > 0 ? "selection" : "content")
              }
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (hasExternalFiles(e) || draggedItem)
                  setRootDropActive(true);
              }}
              onDragLeave={() => setRootDropActive(false)}
              onDrop={onDropRoot}
              className={`rounded-[22px] border bg-white/96 p-4 shadow-sm transition ${
                rootDropActive
                  ? "border-blue-400 ring-2 ring-blue-100"
                  : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-400">
                    {currentPathText}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {activeFolderId === "all"
                      ? "从这里浏览全部内容。"
                      : "文件可以拖进子文件夹，也可以继续拖到上面的文件夹里。"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedCount > 0 ? (
                    <div
                      className={`rounded-full border border-blue-200 bg-blue-50 font-semibold text-blue-700 ${
                        isCompactLayout ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
                      }`}
                    >
                      已选 {selectedCount} 项
                    </div>
                  ) : null}
                  {activeFolderId !== "all" ? (
                    <div
                      className={`rounded-full border border-slate-200 bg-white font-semibold text-slate-500 ${
                        isCompactLayout ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
                      }`}
                    >
                      {visibleInnerFolders.length} 个小文件夹
                    </div>
                  ) : null}
                  <div
                    className={`rounded-full border border-slate-200 bg-white font-semibold text-slate-500 ${
                      isCompactLayout ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
                    }`}
                  >
                    {visibleFiles.length} 个文件
                  </div>
                </div>
              </div>

              <div
                ref={contentViewportRef}
                onMouseDown={beginContentSelection}
                className={`${contentScrollClass} relative ${selectionRect ? "select-none" : ""}`}
              >
                {activeFolderId !== "all" && visibleInnerFolders.length > 0 ? (
                  <div
                    className={
                      isCompactLayout
                        ? "flex flex-wrap gap-3"
                        : "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
                    }
                  >
                    {visibleInnerFolders.map((folder) => {
                      const s = toneStyles[folder.tone];
                      const editing =
                        editingTarget?.type === "inner-folder" &&
                        editingTarget.id === folder.id;
                      const isSelected = selectedItemSet.has(
                        selectableKey("inner-folder", folder.id),
                      );
                      const directCount = managedFiles.filter(
                        (f) =>
                          !f.isTrashed &&
                          !f.isDeleted &&
                          f.folderId === activeFolderId &&
                          f.subfolderId === folder.id,
                      ).length;

                      return (
                        <div
                          key={folder.id}
                          data-selectable-item="true"
                          data-item-kind="inner-folder"
                          data-item-id={folder.id}
                          draggable={canManage}
                          onClick={() => selectInnerFolder(folder.id)}
                          onDragStart={(e) => {
                            const nextDraggedItem = {
                              kind: "inner-folder" as const,
                              id: folder.id,
                            };
                            setDraggedItem(nextDraggedItem);
                            e.dataTransfer.setData(
                              "application/x-bpai-browser-item",
                              JSON.stringify(nextDraggedItem),
                            );
                          }}
                          onDragEnd={clearDrag}
                          onContextMenu={(e) => {
                            if (isSelected) {
                              openMenu(e, "selection");
                              return;
                            }
                            openMenu(e, "inner-folder", folder.id);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setInnerDropTargetId(folder.id);
                          }}
                          onDragLeave={() =>
                            innerDropTargetId === folder.id &&
                            setInnerDropTargetId(null)
                          }
                          onDrop={(e) => onDropInner(e, folder.id)}
                          className={`cursor-pointer transition ${
                            isCompactLayout
                              ? `flex h-[82px] w-[92px] shrink-0 flex-col items-center justify-start rounded-[16px] border border-slate-200 bg-white px-2 py-2 text-center shadow-none ${
                                  innerDropTargetId === folder.id
                                    ? "border-blue-300 ring-2 ring-blue-100"
                                    : "hover:border-slate-300 hover:bg-slate-50"
                                }`
                              : `rounded-[18px] border p-3 shadow-sm ${s.surface} ${s.border} ${
                                  innerDropTargetId === folder.id
                                    ? "ring-2 ring-blue-400"
                                    : "hover:-translate-y-0.5"
                                }`
                          } ${
                            isSelected
                              ? isCompactLayout
                                ? "border-blue-300 bg-blue-50 ring-2 ring-blue-100"
                                : "border-blue-300 ring-2 ring-blue-100"
                              : ""
                          }`}
                          title={`${folder.name} · ${directCount} 项`}
                        >
                          <div
                            className={`flex gap-3 ${
                              isCompactLayout
                                ? "items-center justify-center"
                                : "items-start justify-between"
                            }`}
                          >
                            <div
                              className={`inline-flex rounded-full ${s.tab} ${s.accent} ${isCompactLayout ? "p-1.5" : "p-2"}`}
                            >
                              <IconFolder
                                icon={folder.icon}
                                className={isCompactLayout ? "h-4 w-4" : "h-5 w-5"}
                              />
                            </div>
                            {!isCompactLayout ? (
                              <div
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.chip}`}
                              >
                                {directCount} 项
                              </div>
                            ) : null}
                          </div>
                          <div className={isCompactLayout ? "mt-2 w-full" : "mt-2.5"}>
                            {editing ? (
                              <input
                                ref={renameInputRef}
                                value={editingValue}
                                onChange={(e) =>
                                  setEditingValue(e.target.value)
                                }
                                onBlur={commitRename}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitRename();
                                  if (e.key === "Escape") stopRename();
                                }}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base font-semibold text-slate-950 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              />
                            ) : (
                              <div
                                className={`font-semibold text-slate-950 ${
                                  isCompactLayout ? "text-[12px] leading-4" : "text-sm"
                                }`}
                                style={titleClamp}
                              >
                                {folder.name}
                              </div>
                            )}
                            {isCompactLayout ? (
                              <div className="mt-1 text-[10px] font-medium text-slate-400">
                                {directCount} 项
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div
                  className={
                    activeFolderId !== "all" && visibleInnerFolders.length > 0
                      ? "mt-4"
                      : ""
                  }
                >
                  {visibleFiles.length === 0 ? (
                    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-8 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
                        <IconFolder icon="folder" className="h-6 w-6" />
                      </div>
                      <h3 className="mt-4 text-xl font-semibold text-slate-900">
                        {emptyTitle}
                      </h3>
                      <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
                        {emptyDescription}
                      </p>
                    </div>
                  ) : (
                    <div className={fileGrid}>
                      {visibleFiles.map((file) => {
                        const editing =
                          editingTarget?.type === "file" &&
                          editingTarget.id === file.id;
                        const isSelected = selectedItemSet.has(
                          selectableKey("file", file.id),
                        );
                        return (
                          <button
                            key={file.id}
                            type="button"
                            data-selectable-item="true"
                            data-item-kind="file"
                            data-item-id={file.id}
                            draggable={canManage}
                            onDragStart={(e) => {
                              const nextDraggedItem = {
                                kind: "file" as const,
                                id: file.id,
                              };
                              setDraggedItem(nextDraggedItem);
                              e.dataTransfer.setData(
                                "application/x-bpai-browser-item",
                                JSON.stringify(nextDraggedItem),
                              );
                            }}
                            onDragEnd={clearDrag}
                            onClick={() =>
                              router.push(withReturnTo(file.href, returnToHref))
                            }
                            onContextMenu={(e) => {
                              if (isSelected) {
                                openMenu(e, "selection");
                                return;
                              }
                              openMenu(e, "file", file.id);
                            }}
                            className={`text-left transition ${
                              isCompactLayout && folderViewMode === "small"
                                ? "flex h-[88px] w-[82px] shrink-0 flex-col items-center justify-center rounded-[14px] border border-transparent bg-transparent px-1.5 py-2 text-center shadow-none hover:bg-slate-50"
                                : folderViewMode === "list"
                                  ? "flex items-center gap-4 rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm hover:-translate-y-0.5 hover:border-blue-200"
                                  : folderViewMode === "small"
                                    ? "mx-auto flex w-full max-w-[124px] flex-col items-center rounded-[18px] border border-transparent bg-transparent p-2 text-center shadow-none hover:bg-slate-50"
                                    : "flex h-[136px] flex-col items-start rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm hover:-translate-y-0.5 hover:border-blue-200"
                            } ${
                              isSelected
                                ? "border-blue-300 bg-blue-50/70 ring-2 ring-blue-100"
                                : ""
                            }`}
                            title={`${file.title}${file.subtitle ? ` · ${file.subtitle}` : ""}`}
                          >
                            <div className={isCompactLayout && folderViewMode === "small" ? "scale-90" : ""}>
                              <IconFile
                                kind={file.kind}
                                title={file.title}
                                sampleFileName={file.sampleFileName}
                                compact={
                                  (isCompactLayout && folderViewMode === "small") ||
                                  folderViewMode === "list" ||
                                  folderViewMode === "small"
                                }
                              />
                            </div>
                            <div
                              className={
                                isCompactLayout && folderViewMode === "small"
                                  ? "mt-2 w-full text-center"
                                  : folderViewMode === "list"
                                  ? "min-w-0 flex-1"
                                  : folderViewMode === "small"
                                    ? "mt-2 w-full text-center"
                                  : "mt-3 w-full"
                              }
                            >
                              {editing ? (
                                <input
                                  ref={renameInputRef}
                                  value={editingValue}
                                  onChange={(e) =>
                                    setEditingValue(e.target.value)
                                  }
                                  onBlur={commitRename}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") commitRename();
                                    if (e.key === "Escape") stopRename();
                                  }}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base font-semibold text-slate-950 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                              ) : (
                                <div
                                  className={`font-semibold text-slate-900 ${
                                    (isCompactLayout && folderViewMode === "small") || folderViewMode === "small"
                                      ? "text-[12px] leading-4"
                                      : "text-sm"
                                  }`}
                                  style={titleClamp}
                                >
                                  {file.title}
                                </div>
                              )}
                              {!(isCompactLayout && folderViewMode === "small") && folderViewMode !== "small" ? (
                                <div className="mt-1.5 text-xs leading-6 text-slate-500">
                                  {file.subtitle}
                                </div>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {selectionRect ? (
                  <div
                    className="pointer-events-none absolute z-20 rounded-[18px] border border-blue-400 bg-blue-200/20"
                    style={{
                      left: selectionRect.left,
                      top: selectionRect.top,
                      width: selectionRect.width,
                      height: selectionRect.height,
                    }}
                  />
                ) : null}
                {isCompactLayout ? <div className="h-24 shrink-0" /> : null}
              </div>

              {uploadError ? (
                <div className="mt-4 text-sm text-rose-600">{uploadError}</div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {newItemDialogOpen ? (
        <div className="fixed inset-0 z-[89] flex items-center justify-center bg-slate-950/28 px-5 py-10 backdrop-blur-sm">
          <div className="w-full max-w-[980px] max-h-[calc(100vh-88px)] overflow-y-auto rounded-[26px] border border-white/80 bg-white/96 p-5 shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  新建文档
                </div>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                  先确定类型，再放进目标文件夹
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  确认后会先创建文件，再直接进入 OnlyOffice 编辑页。
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateItemDialog}
                disabled={isCreatingNewItem}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <IconX />
              </button>
            </div>

            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void createNewItem();
              }}
            >
              <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <label className="space-y-2">
                  <div className="text-sm font-semibold text-slate-700">
                    文件名称
                  </div>
                  <input
                    autoFocus
                    value={newItemDraftName}
                    onChange={(event) => {
                      setNewItemDraftName(event.target.value);
                      setNewItemError("");
                    }}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    placeholder="例如：项目周报"
                  />
                </label>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                  <div className="text-sm font-semibold text-slate-700">
                    即将创建
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <IconFile
                      kind={newItemDraftKind}
                      title={ensureTitleForKind(newItemDraftName, newItemDraftKind)}
                      compact
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {ensureTitleForKind(newItemDraftName, newItemDraftKind)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {createItemTemplate.label} ·{" "}
                        {createItemTargetFolder
                          ? [
                              createItemTargetFolder.name,
                              ...createItemTargetPath.map((folder) => folder.name),
                            ].join(" / ")
                          : "请选择目标文件夹"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-700">
                  文档类型
                </div>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                  {CREATE_ITEM_TEMPLATE_OPTIONS.map((option) => {
                    const selected = option.value === newItemDraftKind;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={option.disabled}
                        onClick={() => changeCreateItemKind(option.value)}
                        className={`rounded-[20px] border px-3.5 py-3.5 text-left transition ${
                          selected
                            ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                            : option.disabled
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50/60"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <IconFile
                            kind={option.value}
                            title={`blank.${option.extension}`}
                            compact
                          />
                          <div>
                            <div className="text-sm font-semibold">
                              {option.label}
                            </div>
                            <div
                              className={`mt-1 text-xs leading-5 ${
                                selected ? "text-white/75" : "text-slate-500"
                              }`}
                            >
                              {option.helper}
                            </div>
                            {option.disabledReason ? (
                              <div
                                className={`mt-2 text-[11px] font-semibold ${
                                  selected ? "text-white/75" : "text-amber-600"
                                }`}
                              >
                                {option.disabledReason}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-700">
                  目标文件夹
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[248px_minmax(0,1fr)]">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-3.5">
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                      大文件夹
                    </div>
                    <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                      {createItemRootFolders.length > 0 ? (
                        createItemRootFolders.map((folder) => {
                          const selected = folder.id === createItemTargetFolder?.id;
                          const folderTone = toneStyles[folder.tone];
                          return (
                            <button
                              key={folder.id}
                              type="button"
                              onClick={() => selectCreateItemRootFolder(folder.id)}
                              className={`flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition ${
                                selected
                                  ? `border-slate-900 ${folderTone.surface}`
                                  : "border-slate-200 bg-white hover:border-slate-300"
                              }`}
                            >
                              <span
                                className={`inline-flex rounded-full p-2 ${folderTone.tab} ${folderTone.accent}`}
                              >
                                <IconFolder
                                  icon={folder.icon ?? "folder"}
                                  className="h-4 w-4"
                                />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-slate-900">
                                  {folder.name}
                                </span>
                                <span className="mt-1 block truncate text-xs text-slate-500">
                                  {folder.description || "根目录"}
                                </span>
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                          这里还没有可用文件夹，请先创建大文件夹。
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-slate-200 bg-white p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                          子文件夹
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                          <button
                            type="button"
                            disabled={!createItemTargetFolder}
                            onClick={() => selectCreateItemInnerFolder(null)}
                            className={`rounded-full border px-3 py-1.5 font-semibold transition ${
                              createItemTargetFolder && newItemTargetInnerFolderId === null
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                            }`}
                          >
                            {createItemTargetFolder
                              ? createItemTargetFolder.name
                              : "先选大文件夹"}
                          </button>
                          {createItemTargetPath.map((folder) => (
                            <button
                              key={folder.id}
                              type="button"
                              onClick={() => selectCreateItemInnerFolder(folder.id)}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-semibold transition ${
                                folder.id === newItemTargetInnerFolderId
                                  ? "border-slate-900 bg-slate-900 text-white"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800"
                              }`}
                            >
                              <IconArrow direction="right" className="h-3.5 w-3.5" />
                              {folder.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">
                        当前落点：
                        {" "}
                        {createItemTargetFolder
                          ? [
                              createItemTargetFolder.name,
                              ...createItemTargetPath.map((folder) => folder.name),
                            ].join(" / ")
                          : "未选择"}
                      </div>
                    </div>

                    <div className="mt-3 rounded-[20px] border border-slate-200 bg-slate-50/70 p-3.5">
                      {createItemTargetFolder ? (
                        createItemVisibleInnerFolders.length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {createItemVisibleInnerFolders.map((folder) => {
                              const folderTone = toneStyles[folder.tone];
                              const selected =
                                folder.id === newItemTargetInnerFolderId;
                              return (
                                <button
                                  key={folder.id}
                                  type="button"
                                  onClick={() => selectCreateItemInnerFolder(folder.id)}
                                  className={`rounded-[20px] border px-4 py-4 text-left transition ${
                                    selected
                                      ? `border-slate-900 ${folderTone.surface}`
                                      : "border-slate-200 bg-white hover:border-slate-300"
                                  }`}
                                >
                                  <span
                                    className={`inline-flex rounded-full p-2 ${folderTone.tab} ${folderTone.accent}`}
                                  >
                                    <IconFolder
                                      icon={folder.icon}
                                      className="h-4 w-4"
                                    />
                                  </span>
                                  <div className="mt-3 text-sm font-semibold text-slate-900">
                                    {folder.name}
                                  </div>
                                  <div className="mt-1 text-xs leading-5 text-slate-500">
                                    {folder.description || "继续进入这个子文件夹"}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-5 py-8 text-sm text-slate-500">
                            当前目录下没有更深层子文件夹。确认后会直接在这里创建文件。
                          </div>
                        )
                      ) : (
                        <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-5 py-8 text-sm text-slate-500">
                          先在左侧选一个大文件夹，再决定是否进入子文件夹。
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {newItemError ? (
                <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                  {newItemError}
                </div>
              ) : null}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCreateItemDialog}
                  disabled={isCreatingNewItem}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={
                    isCreatingNewItem ||
                    !createItemTargetFolder ||
                    createItemTemplate.disabled
                  }
                  className="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isCreatingNewItem ? "创建中..." : "创建并进入编辑"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {folderDialogOpen ? (
        <div className="fixed inset-0 z-[88] flex items-center justify-center bg-slate-950/28 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/80 bg-white/96 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {folderDialogMode === "edit" ? "重新编辑" : "新建文件夹"}
                </div>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                  {folderDialogMode === "edit"
                    ? "调整文件夹信息"
                    : "配置文件夹信息"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {folderDialogMode === "edit"
                    ? "调整名称、描述、颜色和图标，保存后会立即更新当前文件夹。"
                    : "先设置名称、描述、颜色和图标，再把文件拖进来。"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeFolderDialog}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              >
                <IconX />
              </button>
            </div>

            <form
              className="mt-6 space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                createFolder();
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <div className="text-sm font-semibold text-slate-700">
                    名称
                  </div>
                  <input
                    autoFocus
                    value={folderDraftName}
                    onChange={(e) => setFolderDraftName(e.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    placeholder="例如：验收归档"
                  />
                </label>
                <label className="space-y-2">
                  <div className="text-sm font-semibold text-slate-700">
                    描述
                  </div>
                  <input
                    value={folderDraftDescription}
                    onChange={(e) => setFolderDraftDescription(e.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    placeholder="例如：照片、表单和签字材料"
                  />
                </label>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-700">
                  颜色
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {toneOptions.map((tone) => {
                    const toneStyle = toneStyles[tone];
                    const selected = folderDraftTone === tone;
                    return (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => setFolderDraftTone(tone)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                          selected
                            ? `border-slate-900 ${toneStyle.surface} ${toneStyle.accent}`
                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                        }`}
                      >
                        <span
                          className={`h-3 w-3 rounded-full ${toneStyle.tab}`}
                        />
                        {toneLabels[tone]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-700">
                  图标
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {folderIconOptions.map((option) => {
                    const selected = folderDraftIcon === option.value;
                    const toneStyle = toneStyles[folderDraftTone];
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFolderDraftIcon(option.value)}
                        className={`flex items-center gap-3 rounded-[20px] border px-4 py-3 text-left transition ${
                          selected
                            ? `border-slate-900 ${toneStyle.surface}`
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <span
                          className={`inline-flex rounded-full p-2 ${toneStyle.tab} ${toneStyle.accent}`}
                        >
                          <IconFolder
                            icon={option.value}
                            className="h-4 w-4"
                          />
                        </span>
                        <span className="text-sm font-semibold text-slate-800">
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <div className="text-sm font-semibold text-slate-700">
                  预览
                </div>
                <div className="mt-4">
                  <div
                    className={`inline-flex min-w-[176px] flex-col rounded-[20px] border bg-white px-4 py-4 shadow-sm ${toneStyles[folderDraftTone].border}`}
                  >
                    <div
                      className={`inline-flex rounded-full p-2 ${toneStyles[folderDraftTone].tab} ${toneStyles[folderDraftTone].accent}`}
                    >
                      <IconFolder icon={folderDraftIcon} className="h-5 w-5" />
                    </div>
                    <div className="mt-4 text-sm font-semibold text-slate-950">
                      {folderDraftName.trim() || DEFAULT_FOLDER_NAME}
                    </div>
                    <div className="mt-1.5 text-xs leading-5 text-slate-500">
                      {folderDraftDescription.trim() || "自定义文件夹"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeFolderDialog}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {folderDialogMode === "edit" ? "保存修改" : "创建文件夹"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className="fixed z-[80] w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_60px_rgba(15,23,42,0.16)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.type === "file"
            ? (() => {
                const file = managedFiles.find((f) => f.id === contextMenu.id);
                if (!file) return null;
                return (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        router.push(withReturnTo(file.href, returnToHref));
                        setContextMenu(null);
                      }}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      打开
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        startRename({ type: "file", id: file.id }, file.title)
                      }
                      className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      重命名
                    </button>
                    {canManage ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setClipboardItem({
                              mode: "cut",
                              items: [{ kind: "file", id: file.id }],
                            });
                            setContextMenu(null);
                          }}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          剪切
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setClipboardItem({
                              mode: "copy",
                              items: [{ kind: "file", id: file.id }],
                            });
                            setContextMenu(null);
                          }}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          复制
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void trashFile(file);
                            setContextMenu(null);
                          }}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                        >
                          删除并移入回收站
                        </button>
                      </>
                    ) : null}
                    {hasStructuredCopyTargets ? (
                      <button
                        type="button"
                        onClick={() =>
                          openSpaceUploadDialog({ kind: "file", id: file.id })
                        }
                        className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        上传到合作空间...
                      </button>
                    ) : null}
                    {!hasStructuredCopyTargets && copyTargets.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCopyFileId(file.id);
                          setContextMenu(null);
                        }}
                        className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        复制到...
                      </button>
                    ) : null}
                  </div>
                );
              })()
            : contextMenu.type === "folder"
              ? (() => {
                const folder = allFolders.find(
                  (item) => item.id === contextMenu.id,
                );
                if (!folder || folder.id === "all") return null;
                return (
                  <div className="space-y-1">
                    {hasStructuredCopyTargets &&
                    !NON_DESTINATION_FOLDER_IDS.has(folder.id) ? (
                      <button
                        type="button"
                        onClick={() =>
                          openSpaceUploadDialog({ kind: "folder", id: folder.id })
                        }
                        className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        上传到合作空间...
                      </button>
                    ) : null}
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => openEditFolderDialog(folder.id)}
                        className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        重新编辑
                      </button>
                    ) : null}
                    {canDeleteRootFolders ? (
                      <button
                        type="button"
                        onClick={() => {
                          void deleteBigFolder(folder.id);
                          setContextMenu(null);
                        }}
                        className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                      >
                        删除文件夹
                      </button>
                    ) : null}
                    {!canManage && !canDeleteRootFolders ? (
                      <div className="rounded-xl px-3 py-2 text-sm text-slate-400">
                        当前文件夹暂无可用操作
                      </div>
                    ) : null}
                  </div>
                );
              })()
            : contextMenu.type === "inner-folder"
              ? (() => {
                const folder = innerFolders.find(
                  (f) => f.id === contextMenu.id,
                );
                if (!folder) return null;
                return (
                  <div className="space-y-1">
                    {hasStructuredCopyTargets ? (
                      <button
                        type="button"
                        onClick={() =>
                          openSpaceUploadDialog({
                            kind: "inner-folder",
                            id: folder.id,
                          })
                        }
                        className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        上传到合作空间...
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        selectInnerFolder(folder.id);
                        setContextMenu(null);
                      }}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      打开
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        startRename(
                          { type: "inner-folder", id: folder.id },
                          folder.name,
                        )
                      }
                      className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      重命名
                    </button>
                    {canManage ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setClipboardItem({
                              mode: "cut",
                              items: [{ kind: "inner-folder", id: folder.id }],
                            });
                            setContextMenu(null);
                          }}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          剪切
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setClipboardItem({
                              mode: "copy",
                              items: [{ kind: "inner-folder", id: folder.id }],
                            });
                            setContextMenu(null);
                          }}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          复制
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void deleteInnerFolder(folder.id);
                            setContextMenu(null);
                          }}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                        >
                          删除文件夹
                        </button>
                      </>
                    ) : null}
                  </div>
                );
              })()
              : contextMenu.type === "selection"
                ? (
                  <div className="space-y-1">
                    <div className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500">
                      已选中 {selectedCount} 项
                    </div>
                    {canManage ? (
                      <>
                        <button
                          type="button"
                          onClick={() => copySelectionToClipboard("cut")}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          剪切所选
                        </button>
                        <button
                          type="button"
                          onClick={() => copySelectionToClipboard("copy")}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          复制所选
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void deleteSelectedItems();
                          }}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                        >
                          删除所选
                        </button>
                      </>
                    ) : (
                      <div className="rounded-xl px-3 py-2 text-sm text-slate-400">
                        当前选中项暂无可用操作
                      </div>
                    )}
                  </div>
                )
              : (
                <div className="space-y-1">
                  {activeFolderId !== "all" && canCreate ? (
                    <button
                      type="button"
                      onClick={() => {
                        createInnerFolder();
                        setContextMenu(null);
                      }}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      新建文件夹
                    </button>
                  ) : null}
                  {clipboardItem && canManage && activeFolderId !== "all" ? (
                    <button
                      type="button"
                      onClick={() => {
                        void pasteHere(activeFolderId, activeInnerFolderId);
                        setContextMenu(null);
                      }}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      粘贴到这里
                    </button>
                  ) : null}
                  {activeFolderId === "all" || (!canCreate && !clipboardItem) ? (
                    <div className="rounded-xl px-3 py-2 text-sm text-slate-400">
                      当前区域暂无可用操作
                    </div>
                  ) : null}
                </div>
              )}
        </div>
      ) : null}

      {spaceUploadSource && spaceUploadSourceMeta ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/28 px-5 py-10 backdrop-blur-sm">
          <div className="w-full max-w-[1080px] max-h-[calc(100vh-88px)] overflow-y-auto rounded-[26px] border border-white/80 bg-white/96 p-5 shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  上传到合作空间
                </div>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                  选择目标空间和落点
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {spaceUploadSourceMeta.label}：{spaceUploadSourceMeta.helper}
                </p>
              </div>
              <button
                type="button"
                onClick={closeSpaceUploadDialog}
                disabled={spaceUploadingOut}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <IconX />
              </button>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[248px_minmax(0,1fr)]">
              <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-3.5">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  我创建的空间
                </div>
                <div className="mt-3 space-y-2">
                  {spaceUploadTargets.map((target) => {
                    const selected = target.id === selectedSpaceUploadTarget?.id;
                    return (
                      <button
                        key={target.id}
                        type="button"
                        onClick={() => changeSpaceUploadTarget(target.id)}
                        className={`w-full rounded-[18px] border px-3 py-3 text-left transition ${
                          selected
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        <div className="text-sm font-semibold">{target.label}</div>
                        {target.description ? (
                          <div
                            className={`mt-1 text-xs leading-5 ${
                              selected ? "text-white/75" : "text-slate-500"
                            }`}
                          >
                            {target.description}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                    <div className="text-sm font-semibold text-slate-700">
                      即将上传
                    </div>
                    <div className="mt-3 rounded-[18px] border border-slate-200 bg-white px-4 py-3">
                      <div className="text-sm font-semibold text-slate-900">
                        {spaceUploadSourceMeta.label}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {spaceUploadSourceMeta.helper}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                    <div className="text-sm font-semibold text-slate-700">
                      当前落点
                    </div>
                    <div className="mt-3 rounded-[18px] border border-slate-200 bg-white px-4 py-3">
                      <div className="text-sm font-semibold text-slate-900">
                        {selectedSpaceUploadTarget?.label ?? "未选择空间"}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {selectedSpaceUploadTarget && spaceUploadTargetFolderId
                          ? [
                              selectedSpaceUploadTarget.label,
                              selectedSpaceUploadFolders.find(
                                (folder) => folder.id === spaceUploadTargetFolderId,
                              )?.name,
                              ...selectedSpaceUploadPath.map((folder) => folder.name),
                            ]
                              .filter(Boolean)
                              .join(" / ")
                          : "先选择目标空间和具体目录"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-700">
                    目标文件夹
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[248px_minmax(0,1fr)]">
                    <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-3.5">
                      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        大文件夹
                      </div>
                      <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                        {selectedSpaceUploadFolders.length > 0 ? (
                          selectedSpaceUploadFolders.map((folder) => {
                            const selected = folder.id === spaceUploadTargetFolderId;
                            const folderTone = toneStyles[folder.tone];
                            return (
                              <button
                                key={folder.id}
                                type="button"
                                onClick={() => selectSpaceUploadTargetFolder(folder.id)}
                                className={`flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition ${
                                  selected
                                    ? `border-slate-900 ${folderTone.surface}`
                                    : "border-slate-200 bg-white hover:border-slate-300"
                                }`}
                              >
                                <span
                                  className={`inline-flex rounded-full p-2 ${folderTone.tab} ${folderTone.accent}`}
                                >
                                  <IconFolder
                                    icon={folder.icon ?? "folder"}
                                    className="h-4 w-4"
                                  />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-slate-900">
                                    {folder.name}
                                  </span>
                                  <span className="mt-1 block truncate text-xs text-slate-500">
                                    {folder.description || "目标目录"}
                                  </span>
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                            这个合作空间里还没有可用的大文件夹。
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                            子文件夹
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                            <button
                              type="button"
                              disabled={!spaceUploadTargetFolderId}
                              onClick={() => selectSpaceUploadTargetInnerFolder(null)}
                              className={`rounded-full border px-3 py-1.5 font-semibold transition ${
                                spaceUploadTargetFolderId &&
                                spaceUploadTargetInnerFolderId === null
                                  ? "border-slate-900 bg-slate-900 text-white"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                              }`}
                            >
                              {spaceUploadTargetFolderId
                                ? selectedSpaceUploadFolders.find(
                                    (folder) => folder.id === spaceUploadTargetFolderId,
                                  )?.name ?? "当前大文件夹"
                                : "先选大文件夹"}
                            </button>
                            {selectedSpaceUploadPath.map((folder) => (
                              <button
                                key={folder.id}
                                type="button"
                                onClick={() =>
                                  selectSpaceUploadTargetInnerFolder(folder.id)
                                }
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-semibold transition ${
                                  folder.id === spaceUploadTargetInnerFolderId
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800"
                                }`}
                              >
                                <IconArrow direction="right" className="h-3.5 w-3.5" />
                                {folder.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-[18px] border border-slate-200 bg-white p-3.5">
                        {spaceUploadTargetFolderId ? (
                          visibleSpaceUploadInnerFolders.length > 0 ? (
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                              {visibleSpaceUploadInnerFolders.map((folder) => {
                                const folderTone = toneStyles[folder.tone];
                                const selected =
                                  folder.id === spaceUploadTargetInnerFolderId;
                                return (
                                  <button
                                    key={folder.id}
                                    type="button"
                                    onClick={() =>
                                      selectSpaceUploadTargetInnerFolder(folder.id)
                                    }
                                    className={`rounded-[18px] border px-4 py-4 text-left transition ${
                                      selected
                                        ? `border-slate-900 ${folderTone.surface}`
                                        : "border-slate-200 bg-white hover:border-slate-300"
                                    }`}
                                  >
                                    <span
                                      className={`inline-flex rounded-full p-2 ${folderTone.tab} ${folderTone.accent}`}
                                    >
                                      <IconFolder
                                        icon={folder.icon}
                                        className="h-4 w-4"
                                      />
                                    </span>
                                    <div className="mt-3 text-sm font-semibold text-slate-900">
                                      {folder.name}
                                    </div>
                                    <div className="mt-1 text-xs leading-5 text-slate-500">
                                      {folder.description || "继续落到这个子文件夹"}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-8 text-sm text-slate-500">
                              当前目录下没有更深层子文件夹，确认后会直接放在这里。
                            </div>
                          )
                        ) : (
                          <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-8 text-sm text-slate-500">
                            先选一个目标大文件夹，再决定是否进入子文件夹。
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {spaceUploadError ? (
                  <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                    {spaceUploadError}
                  </div>
                ) : null}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeSpaceUploadDialog}
                    disabled={spaceUploadingOut}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => void uploadSourceToStructuredSpace()}
                    disabled={
                      spaceUploadingOut ||
                      !selectedSpaceUploadTarget ||
                      !spaceUploadTargetFolderId
                    }
                    className="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {spaceUploadingOut ? "上传中..." : "上传到所选空间"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {inviteOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/28 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[32px] border border-white/80 bg-white/96 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  邀请进入空间
                </div>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                  选择联系人加入当前合作空间
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInviteOpen(false);
                  setSelectedInviteEmails([]);
                  setMemberError("");
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              >
                <IconX />
              </button>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {workspaceContacts.map((contact) => {
                const checked = selectedInviteEmails.includes(contact.email);
                return (
                  <label
                    key={contact.id}
                    className={`flex cursor-pointer items-start gap-4 rounded-[24px] border p-4 transition ${checked ? "border-blue-300 bg-blue-50/80" : "border-slate-200 bg-white hover:border-blue-200"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setSelectedInviteEmails((cur) =>
                          e.target.checked
                            ? [...cur, contact.email]
                            : cur.filter((email) => email !== contact.email),
                        )
                      }
                      className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-700">
                      {contact.avatarLabel || initial(contact.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-lg font-semibold text-slate-900">
                        {contact.name}
                      </div>
                      {contact.roleLabel ? (
                        <div className="text-sm text-slate-500">
                          {contact.roleLabel}
                        </div>
                      ) : null}
                      {contact.teamLabel ? (
                        <div className="mt-1 text-sm text-slate-400">
                          {contact.teamLabel}
                        </div>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>
            {memberError ? (
              <div className="mt-4 text-sm text-rose-600">{memberError}</div>
            ) : null}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setInviteOpen(false);
                  setSelectedInviteEmails([]);
                  setMemberError("");
                }}
                className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void inviteMembers()}
                disabled={selectedInviteEmails.length === 0 || savingMembers}
                className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {savingMembers ? "邀请中..." : "加入空间"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {copyFileId && copyTargetsForModal ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/28 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[32px] border border-white/80 bg-white/96 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  复制文件
                </div>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                  选择复制目标
                </h3>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  {copyTargetsForModal.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCopyFileId(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              >
                <IconX />
              </button>
            </div>
            <div className="mt-6 space-y-3">
              {copyTargets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => void copyToTarget(copyTargetsForModal, target)}
                  disabled={copyingOut}
                  className="flex w-full items-start justify-between gap-4 rounded-[24px] border border-slate-200 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div>
                    <div className="text-lg font-semibold text-slate-900">
                      {target.label}
                    </div>
                    {target.description ? (
                      <div className="mt-1 text-sm text-slate-500">
                        {target.description}
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                    {target.shareMode === "personal"
                      ? "我的文档空间"
                      : "合作空间"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <input
        ref={fileInputRef}
        type="file"
        accept={uploadAccept}
        multiple
        className="hidden"
        onChange={(e) => {
          const input = e.currentTarget;
          const picked = Array.from(input.files ?? []);
          void uploadFiles(
            picked,
            activeFolderId === "all" ? "all" : activeFolderId,
            activeFolderId === "all" ? null : activeInnerFolderId,
          ).finally(() => {
            input.value = "";
          });
        }}
      />
    </div>
  );
}
