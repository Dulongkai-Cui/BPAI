import type { BrowserFile, BrowserFolder } from "@/components/docs/desktop-file-browser";
import type {
  BrowserFileState,
  BrowserInnerFolderState,
} from "@/lib/content/browser-state";

export type SpaceTone = "blue" | "amber" | "emerald" | "violet";
export type FormState = "处理中" | "待确认" | "已分配" | "本周重点";

export type CollaborationSpace = {
  id: string;
  name: string;
  summary: string;
  ownerEmail: string;
  memberEmails: string[];
  documentCount: number;
  systemFormCount: number;
  updatedAt: string;
  tone: SpaceTone;
};

export type AssignedSystemForm = {
  id: string;
  title: string;
  spaceId: string;
  assigneeEmail: string;
  assignerName: string;
  formType: string;
  state: FormState;
  updatedAt: string;
};

export type SystemFormScope = {
  id: string;
  name: string;
  summary: string;
  tone: SpaceTone;
  managerLabel: string;
};

export type CollaborationUpdate = {
  id: string;
  title: string;
  time: string;
  spaceId: string;
};

export type WorkspaceMemberProfile = {
  email: string;
  role: string;
  team: string;
  badge?: string;
};

export type WorkspaceBoardMessage = {
  id: string;
  folderId?: string;
  innerFolderId?: string | null;
  authorEmail: string;
  authorName: string;
  authorRole: string;
  postedAt: string;
  message: string;
  tone: "blue" | "amber" | "emerald" | "violet";
};

export type WorkspaceDetailSeed = {
  folders: BrowserFolder[];
  sampleFiles: BrowserFile[];
  innerFolders: BrowserInnerFolderState[];
  fileStates: BrowserFileState[];
  activeFolderId: string;
  activeInnerFolderId: string | null;
  boardMessages: WorkspaceBoardMessage[];
};

export const collaborationSpaces: CollaborationSpace[] = [
  {
    id: "space-bridge-review",
    name: "桥梁送审联动区",
    summary: "送审资料、联审批注和回传结果都在这里协同。",
    ownerEmail: "dulongkai.cui@akane.waseda.jp",
    memberEmails: [
      "dulongkai.cui@akane.waseda.jp",
      "li.gong@bpai.local",
      "zhou.yu@bpai.local",
      "lin.min@bpai.local",
    ],
    documentCount: 12,
    systemFormCount: 3,
    updatedAt: "今天 10:24",
    tone: "blue",
  },
  {
    id: "space-design-review",
    name: "设计联审区",
    summary: "设计院、工程组和项目负责人共用的联审空间。",
    ownerEmail: "li.gong@bpai.local",
    memberEmails: [
      "dulongkai.cui@akane.waseda.jp",
      "li.gong@bpai.local",
      "zhou.yu@bpai.local",
    ],
    documentCount: 9,
    systemFormCount: 2,
    updatedAt: "今天 09:12",
    tone: "violet",
  },
  {
    id: "space-storage-ops",
    name: "仓储运营区",
    summary: "仓库表、材料清单和库存快照在这里集中管理。",
    ownerEmail: "lin.min@bpai.local",
    memberEmails: [
      "dulongkai.cui@akane.waseda.jp",
      "lin.min@bpai.local",
      "zhou.yu@bpai.local",
    ],
    documentCount: 7,
    systemFormCount: 4,
    updatedAt: "昨天 18:40",
    tone: "amber",
  },
  {
    id: "space-field-execution",
    name: "工程异常跟进区",
    summary: "现场问题、施工队反馈和异常工单跟进统一放在这里。",
    ownerEmail: "zhou.yu@bpai.local",
    memberEmails: [
      "dulongkai.cui@akane.waseda.jp",
      "li.gong@bpai.local",
      "zhou.yu@bpai.local",
    ],
    documentCount: 11,
    systemFormCount: 3,
    updatedAt: "昨天 16:05",
    tone: "emerald",
  },
];

export const assignedSystemForms: AssignedSystemForm[] = [
  {
    id: "form-work-orders-ledger",
    title: "工单台账",
    spaceId: "sys-space-workorders",
    assigneeEmail: "dulongkai.cui@akane.waseda.jp",
    assignerName: "林敏",
    formType: "业务台账",
    state: "本周重点",
    updatedAt: "今天 10:18",
  },
  {
    id: "form-review-package",
    title: "送审资料总表",
    spaceId: "sys-space-review",
    assigneeEmail: "li.gong@bpai.local",
    assignerName: "Dulongkai Cui",
    formType: "送审表单",
    state: "处理中",
    updatedAt: "今天 09:34",
  },
  {
    id: "form-team-status",
    title: "施工队状态表",
    spaceId: "sys-space-execution",
    assigneeEmail: "zhou.yu@bpai.local",
    assignerName: "Dulongkai Cui",
    formType: "执行表单",
    state: "待确认",
    updatedAt: "今天 08:52",
  },
  {
    id: "form-storage-ledger",
    title: "仓库表",
    spaceId: "sys-space-warehouse",
    assigneeEmail: "lin.min@bpai.local",
    assignerName: "Dulongkai Cui",
    formType: "库存主表",
    state: "处理中",
    updatedAt: "昨天 17:40",
  },
  {
    id: "form-missing-materials",
    title: "材料缺项表",
    spaceId: "sys-space-warehouse",
    assigneeEmail: "dulongkai.cui@akane.waseda.jp",
    assignerName: "林敏",
    formType: "异常追踪",
    state: "已分配",
    updatedAt: "昨天 15:10",
  },
];

export const systemFormScopes: SystemFormScope[] = [
  {
    id: "sys-space-workorders",
    name: "工单系统后台",
    summary: "用于工单总表、业务台账和派单底表的受控维护。",
    tone: "blue",
    managerLabel: "开发者 / 老板 / AI",
  },
  {
    id: "sys-space-review",
    name: "送审系统后台",
    summary: "用于送审主表、联审总表和确认底表的受控维护。",
    tone: "violet",
    managerLabel: "开发者 / 老板 / AI",
  },
  {
    id: "sys-space-execution",
    name: "执行系统后台",
    summary: "用于施工队状态表、执行跟踪表和异常底表的受控维护。",
    tone: "emerald",
    managerLabel: "开发者 / 老板 / AI",
  },
  {
    id: "sys-space-warehouse",
    name: "仓储系统后台",
    summary: "用于仓库主表、材料缺项表和库存总表的受控维护。",
    tone: "amber",
    managerLabel: "开发者 / 老板 / AI",
  },
];

export const collaborationUpdates: CollaborationUpdate[] = [
  {
    id: "update-bridge-1",
    title: "桥梁送审联动区新增 3 条联审意见",
    time: "10 分钟前",
    spaceId: "space-bridge-review",
  },
  {
    id: "update-field-1",
    title: "施工队状态表提交了 1 条状态更新",
    time: "今天 09:25",
    spaceId: "space-field-execution",
  },
  {
    id: "update-storage-1",
    title: "仓库表完成一次库存快照更新",
    time: "昨天 18:10",
    spaceId: "space-storage-ops",
  },
];

export const workspaceMemberProfiles: Record<string, WorkspaceMemberProfile[]> = {
  "space-bridge-review": [
    {
      email: "dulongkai.cui@akane.waseda.jp",
      role: "空间拥有者 / 项目总负责人",
      team: "项目总控组",
      badge: "主负责人",
    },
    {
      email: "li.gong@bpai.local",
      role: "设计联审负责人",
      team: "设计联审组",
      badge: "系统表单负责人",
    },
    {
      email: "zhou.yu@bpai.local",
      role: "现场协作人",
      team: "工程执行组",
    },
    {
      email: "lin.min@bpai.local",
      role: "系统治理 / 数据确认",
      team: "系统治理组",
    },
  ],
  "space-design-review": [
    {
      email: "li.gong@bpai.local",
      role: "空间拥有者 / 设计联审负责人",
      team: "设计联审组",
      badge: "主负责人",
    },
    {
      email: "dulongkai.cui@akane.waseda.jp",
      role: "项目总负责人",
      team: "项目总控组",
    },
    {
      email: "zhou.yu@bpai.local",
      role: "施工反馈协作人",
      team: "工程执行组",
    },
  ],
  "space-storage-ops": [
    {
      email: "lin.min@bpai.local",
      role: "空间拥有者 / 系统管理员",
      team: "系统治理组",
      badge: "主负责人",
    },
    {
      email: "dulongkai.cui@akane.waseda.jp",
      role: "项目总负责人",
      team: "项目总控组",
    },
    {
      email: "zhou.yu@bpai.local",
      role: "执行反馈协作人",
      team: "工程执行组",
    },
  ],
  "space-field-execution": [
    {
      email: "zhou.yu@bpai.local",
      role: "空间拥有者 / 现场协调人",
      team: "工程执行组",
      badge: "主负责人",
    },
    {
      email: "dulongkai.cui@akane.waseda.jp",
      role: "项目总负责人",
      team: "项目总控组",
    },
    {
      email: "li.gong@bpai.local",
      role: "联审协作人",
      team: "设计联审组",
    },
  ],
};

export const workspaceDetailSeeds: Record<string, WorkspaceDetailSeed> = {
  "space-bridge-review": {
    folders: [
      {
        id: "square-public",
        name: "文档广场",
        description: "对外共享的方案、说明和通知资料。",
        count: 0,
        tone: "blue",
        icon: "folder",
      },
      {
        id: "system-forms",
        name: "系统文档",
        description: "受控业务表单与联审主文件都从这里进入。",
        count: 0,
        tone: "amber",
        icon: "briefcase",
      },
      {
        id: "meeting-notes",
        name: "留言资料",
        description: "会议纪要、批注意见和补件记录。",
        count: 0,
        tone: "emerald",
        icon: "bookmark",
      },
    ],
    sampleFiles: [
      {
        id: "doc-submission-002",
        title: "金星路项目送审说明.docx",
        subtitle: "送审主文件 / 当前缺口与补件建议",
        owner: "陈承安",
        updatedAt: "昨天 18:10",
        folderId: "system-forms",
        tag: "送审主文件",
        href: "/docs/documents/doc-submission-002",
        kind: "document",
        source: "sample",
        storageKind: "document",
      },
      {
        id: "sheet-review-003",
        title: "送审项目跟踪表.xlsx",
        subtitle: "联审跟踪 / 待确认意见回写",
        owner: "李书意",
        updatedAt: "昨天 20:18",
        folderId: "system-forms",
        tag: "系统表单",
        href: "/docs/documents/sheet-review-003",
        kind: "sheet",
        source: "sample",
        storageKind: "sheet",
      },
      {
        id: "doc-weekly-001",
        title: "望城北区工程周报.docx",
        subtitle: "共享周报 / 本周进展与风险",
        owner: "张芷晴",
        updatedAt: "今天 14:30",
        folderId: "square-public",
        tag: "共享资料",
        href: "/docs/documents/doc-weekly-001",
        kind: "document",
        source: "sample",
        storageKind: "document",
      },
      {
        id: "doc-acceptance-003",
        title: "高塘岭验收纪要.docx",
        subtitle: "补件纪要 / 现场问题与后续安排",
        owner: "李书意",
        updatedAt: "03-28 09:20",
        folderId: "meeting-notes",
        tag: "留言资料",
        href: "/docs/documents/doc-acceptance-003",
        kind: "document",
        source: "sample",
        storageKind: "document",
      },
    ],
    innerFolders: [
      {
        id: "bridge-package-root",
        parentFolderId: "system-forms",
        parentInnerFolderId: null,
        name: "桥梁送审总包",
        description: "主送审材料与总表。",
        tone: "amber",
        icon: "briefcase",
      },
      {
        id: "bridge-review-ledger",
        parentFolderId: "system-forms",
        parentInnerFolderId: null,
        name: "联审跟踪",
        description: "待确认和已回写意见。",
        tone: "blue",
        icon: "folder",
      },
      {
        id: "bridge-review-pending",
        parentFolderId: "system-forms",
        parentInnerFolderId: "bridge-review-ledger",
        name: "待确认意见",
        description: "等待负责人确认的意见。",
        tone: "violet",
        icon: "bookmark",
      },
      {
        id: "bridge-weekly-share",
        parentFolderId: "square-public",
        parentInnerFolderId: null,
        name: "共享周报",
        description: "可供成员查看的周报资料。",
        tone: "blue",
        icon: "folder",
      },
    ],
    fileStates: [
      {
        fileId: "doc-submission-002",
        folderId: "system-forms",
        subfolderId: "bridge-package-root",
      },
      {
        fileId: "sheet-review-003",
        folderId: "system-forms",
        subfolderId: "bridge-review-pending",
      },
      {
        fileId: "doc-weekly-001",
        folderId: "square-public",
        subfolderId: "bridge-weekly-share",
      },
      {
        fileId: "doc-acceptance-003",
        folderId: "meeting-notes",
        subfolderId: null,
      },
    ],
    activeFolderId: "system-forms",
    activeInnerFolderId: "bridge-package-root",
    boardMessages: [
      {
        id: "bridge-board-1",
        authorEmail: "li.gong@bpai.local",
        authorName: "李工",
        authorRole: "设计联审负责人",
        postedAt: "10 分钟前",
        message: "结构计算补页已经补完，等你确认后我再把送审总表切到下一版。",
        tone: "blue",
      },
      {
        id: "bridge-board-2",
        authorEmail: "zhou.yu@bpai.local",
        authorName: "周宇",
        authorRole: "现场协作人",
        postedAt: "今天 09:58",
        message: "现场签字照片已经拖进留言资料区，施工队补件单还差一张。",
        tone: "emerald",
      },
      {
        id: "bridge-board-3",
        authorEmail: "lin.min@bpai.local",
        authorName: "林敏",
        authorRole: "系统治理",
        postedAt: "今天 09:10",
        message: "系统表单回写规则已经锁定，联审跟踪表改完后记得点回写确认。",
        tone: "amber",
      },
    ],
  },
  "space-design-review": {
    folders: [
      {
        id: "design-square",
        name: "文档广场",
        description: "设计说明、方案稿和共享汇报。",
        count: 0,
        tone: "violet",
        icon: "folder",
      },
      {
        id: "design-system",
        name: "系统文档",
        description: "联审总表和设计回写主表。",
        count: 0,
        tone: "blue",
        icon: "briefcase",
      },
    ],
    sampleFiles: [
      {
        id: "doc-weekly-001",
        title: "望城北区工程周报.docx",
        subtitle: "共享资料 / 设计同步周报",
        owner: "张芷晴",
        updatedAt: "今天 14:30",
        folderId: "design-square",
        tag: "共享资料",
        href: "/docs/documents/doc-weekly-001",
        kind: "document",
        source: "sample",
        storageKind: "document",
      },
      {
        id: "sheet-review-003",
        title: "送审项目跟踪表.xlsx",
        subtitle: "系统表单 / 联审状态主表",
        owner: "李书意",
        updatedAt: "昨天 20:18",
        folderId: "design-system",
        tag: "系统表单",
        href: "/docs/documents/sheet-review-003",
        kind: "sheet",
        source: "sample",
        storageKind: "sheet",
      },
    ],
    innerFolders: [
      {
        id: "design-comment-root",
        parentFolderId: "design-system",
        parentInnerFolderId: null,
        name: "设计联审总表",
        description: "当前联审主表。",
        tone: "violet",
        icon: "briefcase",
      },
    ],
    fileStates: [
      {
        fileId: "sheet-review-003",
        folderId: "design-system",
        subfolderId: "design-comment-root",
      },
    ],
    activeFolderId: "design-system",
    activeInnerFolderId: "design-comment-root",
    boardMessages: [
      {
        id: "design-board-1",
        authorEmail: "dulongkai.cui@akane.waseda.jp",
        authorName: "Dulongkai Cui",
        authorRole: "项目总负责人",
        postedAt: "今天 10:02",
        message: "今天只需要把联审主表里的红色问题关掉，其他资料先别动。",
        tone: "violet",
      },
    ],
  },
  "space-storage-ops": {
    folders: [
      {
        id: "storage-system",
        name: "系统文档",
        description: "库存主表与缺项追踪。",
        count: 0,
        tone: "amber",
        icon: "briefcase",
      },
      {
        id: "storage-square",
        name: "文档广场",
        description: "仓储制度、通知和照片记录。",
        count: 0,
        tone: "emerald",
        icon: "folder",
      },
    ],
    sampleFiles: [
      {
        id: "sheet-ledger-001",
        title: "本周工单异常台账.xlsx",
        subtitle: "系统表单 / 库存与工单联动",
        owner: "陈承安",
        updatedAt: "今天 15:05",
        folderId: "storage-system",
        tag: "库存主表",
        href: "/docs/documents/sheet-ledger-001",
        kind: "sheet",
        source: "sample",
        storageKind: "sheet",
      },
      {
        id: "sheet-material-002",
        title: "材料申请缺失项清单.xlsx",
        subtitle: "系统表单 / 缺项追踪",
        owner: "张芷晴",
        updatedAt: "今天 11:40",
        folderId: "storage-system",
        tag: "异常追踪",
        href: "/docs/documents/sheet-material-002",
        kind: "sheet",
        source: "sample",
        storageKind: "sheet",
      },
    ],
    innerFolders: [],
    fileStates: [],
    activeFolderId: "storage-system",
    activeInnerFolderId: null,
    boardMessages: [
      {
        id: "storage-board-1",
        authorEmail: "lin.min@bpai.local",
        authorName: "林敏",
        authorRole: "系统管理员",
        postedAt: "昨天 18:10",
        message: "仓库表今晚会推一次快照，缺项追踪里未确认的行先不要删。",
        tone: "amber",
      },
    ],
  },
  "space-field-execution": {
    folders: [
      {
        id: "field-system",
        name: "系统文档",
        description: "状态主表、异常工单和跟进记录。",
        count: 0,
        tone: "emerald",
        icon: "briefcase",
      },
      {
        id: "field-square",
        name: "文档广场",
        description: "现场照片、纪要和共享通知。",
        count: 0,
        tone: "blue",
        icon: "folder",
      },
    ],
    sampleFiles: [
      {
        id: "doc-acceptance-003",
        title: "高塘岭验收纪要.docx",
        subtitle: "共享资料 / 现场纪要",
        owner: "李书意",
        updatedAt: "03-28 09:20",
        folderId: "field-square",
        tag: "现场纪要",
        href: "/docs/documents/doc-acceptance-003",
        kind: "document",
        source: "sample",
        storageKind: "document",
      },
    ],
    innerFolders: [],
    fileStates: [],
    activeFolderId: "field-square",
    activeInnerFolderId: null,
    boardMessages: [
      {
        id: "field-board-1",
        authorEmail: "zhou.yu@bpai.local",
        authorName: "周宇",
        authorRole: "现场协调人",
        postedAt: "今天 09:25",
        message: "施工队状态表刚回了一版，下午我会把异常工单再过一遍。",
        tone: "emerald",
      },
    ],
  },
};

export function normalizeWorkspaceEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getCollaborationSpaceById(spaceId: string) {
  return collaborationSpaces.find((space) => space.id === spaceId) ?? null;
}

export function getSpacesForUser(email: string) {
  const normalizedEmail = normalizeWorkspaceEmail(email);

  return {
    createdSpaces: collaborationSpaces.filter(
      (space) => normalizeWorkspaceEmail(space.ownerEmail) === normalizedEmail,
    ),
    joinedSpaces: collaborationSpaces.filter(
      (space) =>
        normalizeWorkspaceEmail(space.ownerEmail) !== normalizedEmail &&
        space.memberEmails.some(
          (memberEmail) => normalizeWorkspaceEmail(memberEmail) === normalizedEmail,
        ),
    ),
  };
}

export function getAssignedFormsForUser(email: string) {
  const normalizedEmail = normalizeWorkspaceEmail(email);

  return assignedSystemForms.filter(
    (form) => normalizeWorkspaceEmail(form.assigneeEmail) === normalizedEmail,
  );
}

export function getUpdatesForSpaceIds(spaceIds: string[]) {
  const spaceIdSet = new Set(spaceIds);
  return collaborationUpdates.filter((item) => spaceIdSet.has(item.spaceId));
}

export function getWorkspaceMemberProfiles(spaceId: string) {
  return workspaceMemberProfiles[spaceId] ?? [];
}

export function getWorkspaceDetailSeed(spaceId: string) {
  return workspaceDetailSeeds[spaceId] ?? null;
}
