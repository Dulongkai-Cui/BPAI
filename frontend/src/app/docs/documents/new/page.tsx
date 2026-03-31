import { OnlyOfficeDocEditorClient } from "@/components/onlyoffice/onlyoffice-doc-editor-client";

const newDocumentUrl =
  `${process.env.NEXT_PUBLIC_ONLYOFFICE_FILE_BASE_URL ?? "http://bpai-front-dev:3000"}/onlyoffice/new.docx`;

export default function NewDocumentPage() {
  return (
    <div className="h-full bg-slate-100 p-0">
      <section className="h-full overflow-hidden bg-white p-0 shadow-none">
        <OnlyOfficeDocEditorClient
          documentTitle="未命名文档.docx"
          documentKey="bpai-doc-new"
          documentUrl={newDocumentUrl}
          fileType="docx"
          minimal
        />
      </section>
    </div>
  );
}
