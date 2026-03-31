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
