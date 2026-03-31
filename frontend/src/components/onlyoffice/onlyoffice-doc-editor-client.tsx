"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";

const OnlyOfficeDocEditorInner = dynamic(
  () =>
    import("@/components/onlyoffice/onlyoffice-doc-editor").then(
      (mod) => mod.OnlyOfficeDocEditor,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-slate-200 bg-[#edf2fb] text-sm text-slate-500 shadow-inner">
        正在加载文档编辑器...
      </div>
    ),
  },
);

type OnlyOfficeDocEditorClientProps = {
  documentTitle: string;
  documentKey: string;
  documentUrl: string;
  fileType?: string;
  minimal?: boolean;
};

export function OnlyOfficeDocEditorClient(
  props: OnlyOfficeDocEditorClientProps,
) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/docs/documents";

  return (
    <div className="relative h-full">
      {props.minimal ? (
        <button
          type="button"
          onClick={() => {
            router.push(returnTo);
            router.refresh();
          }}
          className="absolute top-1 left-1 z-30 inline-flex items-center gap-1.5 rounded-full border border-white/90 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.14)] backdrop-blur transition hover:bg-white"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <path d="M15 18 9 12l6-6" />
          </svg>
          返回文档空间
        </button>
      ) : null}
      <OnlyOfficeDocEditorInner {...props} />
    </div>
  );
}
