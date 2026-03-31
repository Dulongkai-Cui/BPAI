"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function DocumentsHeaderActions() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href="/docs/documents/new"
        className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        新建文档
      </Link>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
      >
        上传文档
      </button>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".txt,.md,.docx"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }

          const fileName = encodeURIComponent(file.name);
          router.push(`/docs/documents/uploaded?name=${fileName}`);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
