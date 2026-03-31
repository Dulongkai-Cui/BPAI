"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

type DissolveCollaborationSpaceButtonProps = {
  spaceId: string;
  spaceName: string;
  redirectHref?: string;
  compact?: boolean;
};

export function DissolveCollaborationSpaceButton({
  spaceId,
  spaceName,
  redirectHref,
  compact = false,
}: DissolveCollaborationSpaceButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const closeModal = () => {
    if (submitting) return;
    setOpen(false);
    setError("");
  };

  const handleDissolve = () => {
    void (async () => {
      setSubmitting(true);
      setError("");

      const response = await fetch(
        `/api/collaboration-spaces/${encodeURIComponent(spaceId)}`,
        {
          method: "DELETE",
        },
      ).catch(() => null);

      if (!response?.ok) {
        const payload = (await response?.json().catch(() => null)) as
          | { message?: string }
          | null;
        setError(payload?.message ?? "解散空间失败，请稍后重试。");
        setSubmitting(false);
        return;
      }

      setOpen(false);
      if (redirectHref) {
        router.push(redirectHref);
      }
      router.refresh();
    })();
  };

  const canUsePortal = typeof window !== "undefined";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-full border border-rose-200 bg-white font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 ${
          compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
        }`}
      >
        解散空间
      </button>

      {canUsePortal && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/30 px-4 py-8 backdrop-blur-md"
              onClick={closeModal}
            >
              <div
                className="w-full max-w-xl rounded-[30px] border border-white/80 bg-white/96 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.22)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="inline-flex rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                  高风险操作
                </div>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                  确认解散“{spaceName}”？
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-500">
                  解散后，这个合作空间会从列表中移除，空间里的真实上传文件会整体转入你的回收站。这个操作不建议误触。
                </p>

                <div className="mt-5 rounded-[22px] border border-rose-100 bg-rose-50/70 px-4 py-3 text-sm leading-6 text-rose-700">
                  继续后将：
                  1. 解散当前合作空间
                  2. 清空该空间的成员与协作状态
                  3. 把空间内文件丢入回收站
                </div>

                {error ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleDissolve}
                    disabled={submitting}
                    className="rounded-full bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? "解散中..." : "确认解散"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
