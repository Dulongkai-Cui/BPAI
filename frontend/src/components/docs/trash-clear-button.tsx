"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type TrashClearButtonProps = {
  disabled?: boolean;
};

export function TrashClearButton({ disabled = false }: TrashClearButtonProps) {
  const router = useRouter();
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState("");

  async function handleClear() {
    if (disabled || isClearing) {
      return;
    }

    setIsClearing(true);
    setError("");

    try {
      const response = await fetch("/api/trash/clear", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        setError(payload?.message ?? "清空回收站失败，请稍后再试。");
        return;
      }

      router.refresh();
    } catch {
      setError("清空回收站失败，请检查本地服务。");
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleClear}
        disabled={disabled || isClearing}
        className="inline-flex items-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isClearing ? "清空中..." : "清空回收站"}
      </button>
      {error ? <div className="text-xs text-rose-600">{error}</div> : null}
    </div>
  );
}
