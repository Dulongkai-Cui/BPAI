import Link from "next/link";
import { notFound } from "next/navigation";
import { OnlyOfficeDocEditorClient } from "@/components/onlyoffice/onlyoffice-doc-editor-client";
import { OnlyOfficeSheetEditorClient } from "@/components/onlyoffice/onlyoffice-sheet-editor-client";
import { OnlyOfficeSlideEditorClient } from "@/components/onlyoffice/onlyoffice-slide-editor-client";
import { requireCurrentUser } from "@/lib/auth/server";
import {
  buildOnlyOfficeAssetKey,
  getAssetById,
  type ContentKind,
} from "@/lib/content/server";
import { getDocumentById, getSheetById } from "@/lib/docs/mock-data";

type DocumentWorkspacePageProps = {
  params: Promise<{ docId: string }>;
};

function buildSampleFileUrl(fileName: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_ONLYOFFICE_FILE_BASE_URL ?? "http://bpai-front-dev:3000";
  return `${baseUrl}/onlyoffice/${fileName}`;
}

function buildAssetFileUrl(kind: ContentKind, assetId: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_ONLYOFFICE_FILE_BASE_URL ?? "http://bpai-front-dev:3000";
  return `${baseUrl}/api/assets/${kind}/${assetId}/content`;
}

function isSpreadsheetFile(fileName: string) {
  const normalizedName = fileName.toLowerCase();

  return (
    normalizedName.endsWith(".xls") ||
    normalizedName.endsWith(".xlsx") ||
    normalizedName.endsWith(".csv")
  );
}

function isPresentationFile(fileName: string) {
  const normalizedName = fileName.toLowerCase();

  return (
    normalizedName.endsWith(".ppt") ||
    normalizedName.endsWith(".pptx") ||
    normalizedName.endsWith(".pps") ||
    normalizedName.endsWith(".ppsx") ||
    normalizedName.endsWith(".odp")
  );
}

function isOnlyOfficeDocumentFile(fileName: string) {
  const normalizedName = fileName.toLowerCase();

  return (
    normalizedName.endsWith(".doc") ||
    normalizedName.endsWith(".docx") ||
    normalizedName.endsWith(".txt") ||
    normalizedName.endsWith(".md") ||
    normalizedName.endsWith(".pdf")
  );
}

function renderGenericAssetPage(params: {
  documentTitle: string;
  fileType?: string;
  documentUrl: string;
}) {
  const fileTypeLabel = params.fileType?.toUpperCase() || "FILE";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.15),transparent_28%),linear-gradient(180deg,#f5f8ff_0%,#f8fbff_48%,#eef3fb_100%)] px-6 py-8">
      <div className="mx-auto max-w-[920px] rounded-[32px] border border-slate-200 bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold tracking-[0.2em] text-slate-600">
            {fileTypeLabel}
          </span>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            已上传到文档空间
          </span>
        </div>
        <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-950">
          {params.documentTitle}
        </h1>
        <div className="mt-3 text-sm leading-6 text-slate-500">
          当前文件已收进文档空间。这个类型暂时不走 OnlyOffice 在线编辑，先支持上传、管理和下载，后面再接 CAD 模块。
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={params.documentUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            下载文件
          </a>
          <Link
            href="/docs/documents"
            className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
          >
            返回文档空间
          </Link>
        </div>
      </div>
    </div>
  );
}

function renderDocEditor(params: {
  documentTitle: string;
  documentKey: string;
  documentUrl: string;
  fileType?: string;
}) {
  return (
    <div className="h-full bg-slate-100 p-0">
      <section className="h-full overflow-hidden bg-white p-0 shadow-none">
        <OnlyOfficeDocEditorClient
          documentTitle={params.documentTitle}
          documentKey={params.documentKey}
          documentUrl={params.documentUrl}
          fileType={params.fileType}
          minimal
        />
      </section>
    </div>
  );
}

function renderSheetEditor(params: {
  documentTitle: string;
  documentKey: string;
  documentUrl: string;
  fileType?: string;
}) {
  return (
    <div className="h-full bg-slate-100 p-0">
      <section className="h-full overflow-hidden bg-white p-0 shadow-none">
        <OnlyOfficeSheetEditorClient
          documentTitle={params.documentTitle}
          documentKey={params.documentKey}
          documentUrl={params.documentUrl}
          fileType={params.fileType}
          minimal
        />
      </section>
    </div>
  );
}

function renderSlideEditor(params: {
  documentTitle: string;
  documentKey: string;
  documentUrl: string;
  fileType?: string;
}) {
  return (
    <div className="h-full bg-slate-100 p-0">
      <section className="h-full overflow-hidden bg-white p-0 shadow-none">
        <OnlyOfficeSlideEditorClient
          documentTitle={params.documentTitle}
          documentKey={params.documentKey}
          documentUrl={params.documentUrl}
          fileType={params.fileType}
          minimal
        />
      </section>
    </div>
  );
}

export default async function DocumentWorkspacePage({
  params,
}: DocumentWorkspacePageProps) {
  await requireCurrentUser();
  const { docId } = await params;

  if (docId === "new") {
    return renderDocEditor({
      documentTitle: "未命名文档.docx",
      documentKey: "bpai-doc-new",
      documentUrl: buildSampleFileUrl("new.docx"),
      fileType: "docx",
    });
  }

  const [uploadedDocumentAsset, uploadedSheetAsset, uploadedSlideAsset] = await Promise.all([
    getAssetById("document", docId),
    getAssetById("sheet", docId),
    getAssetById("slide", docId),
  ]);

  if (uploadedDocumentAsset) {
    const fileType = uploadedDocumentAsset.storedFileName.split(".").pop()?.toLowerCase();

    if (isSpreadsheetFile(uploadedDocumentAsset.storedFileName)) {
      return renderSheetEditor({
        documentTitle: uploadedDocumentAsset.title,
        documentKey: buildOnlyOfficeAssetKey("document", uploadedDocumentAsset.id),
        documentUrl: buildAssetFileUrl("document", uploadedDocumentAsset.id),
        fileType,
      });
    }

    if (isPresentationFile(uploadedDocumentAsset.storedFileName)) {
      return renderSlideEditor({
        documentTitle: uploadedDocumentAsset.title,
        documentKey: buildOnlyOfficeAssetKey("document", uploadedDocumentAsset.id),
        documentUrl: buildAssetFileUrl("document", uploadedDocumentAsset.id),
        fileType,
      });
    }

    if (!isOnlyOfficeDocumentFile(uploadedDocumentAsset.storedFileName)) {
      return renderGenericAssetPage({
        documentTitle: uploadedDocumentAsset.title,
        documentUrl: buildAssetFileUrl("document", uploadedDocumentAsset.id),
        fileType,
      });
    }

    return renderDocEditor({
      documentTitle: uploadedDocumentAsset.title,
      documentKey: buildOnlyOfficeAssetKey("document", uploadedDocumentAsset.id),
      documentUrl: buildAssetFileUrl("document", uploadedDocumentAsset.id),
      fileType,
    });
  }

  if (uploadedSheetAsset) {
    return renderSheetEditor({
      documentTitle: uploadedSheetAsset.title,
      documentKey: buildOnlyOfficeAssetKey("sheet", uploadedSheetAsset.id),
      documentUrl: buildAssetFileUrl("sheet", uploadedSheetAsset.id),
      fileType: uploadedSheetAsset.storedFileName.split(".").pop()?.toLowerCase(),
    });
  }

  if (uploadedSlideAsset) {
    return renderSlideEditor({
      documentTitle: uploadedSlideAsset.title,
      documentKey: buildOnlyOfficeAssetKey("slide", uploadedSlideAsset.id),
      documentUrl: buildAssetFileUrl("slide", uploadedSlideAsset.id),
      fileType: uploadedSlideAsset.storedFileName.split(".").pop()?.toLowerCase(),
    });
  }

  if (
    /^document-[a-f0-9]{16}$/i.test(docId) ||
    /^sheet-[a-f0-9]{16}$/i.test(docId) ||
    /^slide-[a-f0-9]{16}$/i.test(docId)
  ) {
    notFound();
  }

  if (docId.startsWith("sheet-")) {
    const sheet = getSheetById(docId);

    return renderSheetEditor({
      documentTitle: sheet.title,
      documentKey: `bpai-sheet-${sheet.id}`,
      documentUrl: buildSampleFileUrl(sheet.fileName ?? "sheet-ledger-001.xlsx"),
      fileType: sheet.fileType,
    });
  }

  const doc = getDocumentById(docId);

  return renderDocEditor({
    documentTitle: doc.title,
    documentKey: `bpai-doc-${doc.id}`,
    documentUrl: buildSampleFileUrl(doc.fileName ?? "sample.docx"),
    fileType: doc.fileType,
  });
}
