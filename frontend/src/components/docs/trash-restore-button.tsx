"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type TrashRestoreButtonProps = {
  fileId: string;
  source: "asset" | "sample";
  storageKind: "document" | "sheet" | "slide";
};

export function TrashRestoreButton({
  fileId,
  source,
  storageKind,
}: TrashRestoreButtonProps) {
  const router = useRouter();
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState("");

  async function handleRestore() {
    if (isRestoring) {
      return;
    }

    setIsRestoring(true);
    setError("");

    try {
      const response = await fetch("/api/trash/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileId,
          source,
          storageKind,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        setError(payload?.message ?? "恢复失败，请稍后再试。");
        return;
      }

      router.refresh();
    } catch {
      setError("恢复失败，请检查本地服务。");
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleRestore}
        disabled={isRestoring}
        className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRestoring ? "恢复中..." : "恢复"}
      </button>
      {error ? <div className="text-[11px] text-rose-600">{error}</div> : null}
    </div>
  );
}
