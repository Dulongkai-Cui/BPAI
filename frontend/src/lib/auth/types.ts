export type UserRoleKey =
  | "dispatcher"
  | "document_editor"
  | "comment_reviewer"
  | "system_admin";

export type WorkspaceKind = "personal" | "collaboration";
export type StoredContentKind = "document" | "sheet" | "slide";
export type StoredBrowserFolderTone =
  | "blue"
  | "amber"
  | "emerald"
  | "slate"
  | "violet"
  | "rose";
export type StoredBrowserFolderIcon =
  | "folder"
  | "archive"
  | "bookmark"
  | "briefcase"
  | "spark";
export type StoredBrowserViewMode = "small" | "medium" | "large" | "list";

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  roleKey: UserRoleKey;
  roleLabel: string;
  teamLabel: string;
  passwordHash: string;
  passwordSalt: string;
  primaryWorkspaceId: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredWorkspace = {
  id: string;
  name: string;
  kind: WorkspaceKind;
  ownerUserId: string;
  visibility: "private" | "shared";
  createdAt: string;
  updatedAt: string;
};

export type StoredSession = {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
};

export type StoredContentAsset = {
  id: string;
  kind: StoredContentKind;
  title: string;
  ownerUserId: string;
  workspaceId: string;
  folderId?: string;
  originalFileName: string;
  storedFileName: string;
  storedRelativePath: string;
  mimeType?: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  trashedAt?: string | null;
};

export type StoredBrowserCustomFolder = {
  id: string;
  name: string;
  description: string;
  tone: StoredBrowserFolderTone;
  icon?: StoredBrowserFolderIcon;
  createdAt: string;
  updatedAt: string;
};

export type StoredBrowserInnerFolder = {
  id: string;
  parentFolderId: string;
  parentInnerFolderId: string | null;
  name: string;
  description: string;
  tone: StoredBrowserFolderTone;
  icon: StoredBrowserFolderIcon;
  createdAt: string;
  updatedAt: string;
};

export type StoredBrowserFileState = {
  fileId: string;
  folderId: string;
  subfolderId: string | null;
  titleOverride?: string;
  isTrashed?: boolean;
  isDeleted?: boolean;
  trashedAt?: string;
  updatedAt: string;
};

export type StoredWorkspaceBoardMessage = {
  id: string;
  folderId: string;
  innerFolderId: string | null;
  authorUserId?: string;
  authorName: string;
  authorRole?: string;
  message: string;
  postedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredWorkspaceBrowserState = {
  id: string;
  kind: StoredContentKind;
  ownerUserId: string;
  workspaceId: string;
  activeFolderId?: string;
  activeInnerFolderId?: string | null;
  folderViewMode?: StoredBrowserViewMode;
  deletedFolderIds?: string[];
  customFolders: StoredBrowserCustomFolder[];
  innerFolders: StoredBrowserInnerFolder[];
  fileStates: StoredBrowserFileState[];
  createdAt: string;
  updatedAt: string;
};

export type StoredSharedWorkspaceBrowserState = {
  id: string;
  kind: StoredContentKind;
  workspaceId: string;
  deletedFolderIds?: string[];
  customFolders: StoredBrowserCustomFolder[];
  innerFolders: StoredBrowserInnerFolder[];
  fileStates: StoredBrowserFileState[];
  boardMessages: StoredWorkspaceBoardMessage[];
  createdAt: string;
  updatedAt: string;
};

export type StoredCollaborationSpaceMembers = {
  id: string;
  workspaceId: string;
  memberEmails: string[];
  createdAt: string;
  updatedAt: string;
};

export type StoredCollaborationSpace = {
  id: string;
  name: string;
  summary: string;
  ownerEmail: string;
  memberEmails: string[];
  documentCount: number;
  systemFormCount: number;
  tone: "blue" | "amber" | "emerald" | "violet";
  createdAt: string;
  updatedAt: string;
};

export type AppStore = {
  version: 1;
  users: StoredUser[];
  workspaces: StoredWorkspace[];
  sessions: StoredSession[];
  documents: StoredContentAsset[];
  sheets: StoredContentAsset[];
  slides: StoredContentAsset[];
  browserStates: StoredWorkspaceBrowserState[];
  workspaceBrowserStates: StoredSharedWorkspaceBrowserState[];
  collaborationSpaces: StoredCollaborationSpace[];
  collaborationSpaceMembers: StoredCollaborationSpaceMembers[];
  dissolvedCollaborationSpaceIds: string[];
};

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  roleKey: UserRoleKey;
  roleLabel: string;
  teamLabel: string;
  workspaceId: string;
  workspaceLabel: string;
};
