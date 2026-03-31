export type DocItem = {
  id: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  owner: string;
  tag: string;
  folder: string;
  fileName?: string;
  fileType?: string;
};

export type SheetItem = {
  id: string;
  title: string;
  category: string;
  owner: string;
  updatedAt: string;
  fileName?: string;
  fileType?: string;
};

export const documentFolders = [
  {
    id: "weekly-reports",
    name: "工程周报",
    count: 18,
    description: "本周进度、风险和待办汇总",
  },
  {
    id: "submission-packs",
    name: "送审资料包",
    count: 12,
    description: "待送审与补件中的项目资料",
  },
  {
    id: "acceptance-files",
    name: "验收归档",
    count: 9,
    description: "验收记录、照片与签字材料",
  },
];

export const documentItems: DocItem[] = [
  {
    id: "doc-weekly-001",
    title: "望城北区工程周报.docx",
    subtitle: "工程周报 / 本周进展、风险与资源情况",
    updatedAt: "今天 14:30",
    owner: "张芷晴",
    tag: "周报",
    folder: "工程周报",
    fileName: "doc-weekly-001.docx",
    fileType: "docx",
  },
  {
    id: "doc-submission-002",
    title: "金星路项目送审说明.docx",
    subtitle: "送审文档 / 当前缺口与补件建议",
    updatedAt: "昨天 18:10",
    owner: "陈承安",
    tag: "送审",
    folder: "送审资料包",
    fileName: "doc-submission-002.docx",
    fileType: "docx",
  },
  {
    id: "doc-acceptance-003",
    title: "高塘岭验收纪要.docx",
    subtitle: "验收纪要 / 现场问题与后续安排",
    updatedAt: "03-28 09:20",
    owner: "李书意",
    tag: "纪要",
    folder: "验收归档",
    fileName: "doc-acceptance-003.docx",
    fileType: "docx",
  },
];

export const sheetItems: SheetItem[] = [
  {
    id: "sheet-ledger-001",
    title: "本周工单异常台账.xlsx",
    category: "运营台账",
    owner: "陈承安",
    updatedAt: "今天 15:05",
    fileName: "sheet-ledger-001.xlsx",
    fileType: "xlsx",
  },
  {
    id: "sheet-material-002",
    title: "材料申请缺失项清单.xlsx",
    category: "材料清单",
    owner: "张芷晴",
    updatedAt: "今天 11:40",
    fileName: "sheet-material-002.xlsx",
    fileType: "xlsx",
  },
  {
    id: "sheet-review-003",
    title: "送审项目跟踪表.xlsx",
    category: "送审跟踪",
    owner: "李书意",
    updatedAt: "昨天 20:18",
    fileName: "sheet-review-003.xlsx",
    fileType: "xlsx",
  },
];

export function getDocumentById(docId: string) {
  return (
    documentItems.find((item) => item.id === docId) ?? {
      id: docId,
      title: "未命名文档.docx",
      subtitle: "BPAI 文档工作区",
      updatedAt: "刚刚",
      owner: "系统",
      tag: "草稿",
      folder: "我的文档",
      fileName: "sample.docx",
      fileType: "docx",
    }
  );
}

export function getSheetById(sheetId: string) {
  return (
    sheetItems.find((item) => item.id === sheetId) ?? {
      id: sheetId,
      title: "未命名表格.xlsx",
      category: "草稿表格",
      owner: "系统",
      updatedAt: "刚刚",
      fileName: "sheet-ledger-001.xlsx",
      fileType: "xlsx",
    }
  );
}
