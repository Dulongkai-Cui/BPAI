"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { SpaceTone } from "@/lib/workspace/mock-data";

type WorkspaceCreateContactOption = {
  id: string;
  email: string;
  name: string;
  roleLabel: string;
  teamLabel: string;
};

type CreateCollaborationSpaceButtonProps = {
  contactOptions: WorkspaceCreateContactOption[];
};

const toneOptions: Array<{
  tone: SpaceTone;
  label: string;
  surface: string;
  badge: string;
}> = [
  {
    tone: "blue",
    label: "协作蓝",
    surface: "border-blue-200 bg-[linear-gradient(180deg,rgba(239,246,255,0.96),rgba(255,255,255,0.94))]",
    badge: "bg-blue-50 text-blue-700",
  },
  {
    tone: "amber",
    label: "项目黄",
    surface: "border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.96),rgba(255,255,255,0.94))]",
    badge: "bg-amber-50 text-amber-700",
  },
  {
    tone: "emerald",
    label: "运营绿",
    surface: "border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.96),rgba(255,255,255,0.94))]",
    badge: "bg-emerald-50 text-emerald-700",
  },
  {
    tone: "violet",
    label: "联审紫",
    surface: "border-violet-200 bg-[linear-gradient(180deg,rgba(245,243,255,0.96),rgba(255,255,255,0.94))]",
    badge: "bg-violet-50 text-violet-700",
  },
];

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export function CreateCollaborationSpaceButton({
  contactOptions,
}: CreateCollaborationSpaceButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [tone, setTone] = useState<SpaceTone>("blue");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const resetDraft = () => {
    setName("");
    setSummary("");
    setTone("blue");
    setSelectedEmails([]);
    setError("");
  };

  const closePanel = () => {
    setIsOpen(false);
    setIsCreating(false);
    resetDraft();
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const handleSubmit = () => {
    void (async () => {
      setError("");
      setIsCreating(true);

      const response = await fetch("/api/collaboration-spaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          summary,
          tone,
          memberEmails: selectedEmails,
        }),
      }).catch(() => null);

      if (!response) {
        setError("新建合作空间失败，请检查本地服务。");
        setIsCreating(false);
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | {
            message?: string;
            space?: {
              id: string;
            };
          }
        | null;

      if (!response.ok || !payload?.space?.id) {
        setError(payload?.message ?? "新建合作空间失败，请稍后再试。");
        setIsCreating(false);
        return;
      }

      closePanel();
      router.push(`/docs/workspace/${encodeURIComponent(payload.space.id)}`);
      router.refresh();
    })();
  };

  const canUsePortal = typeof window !== "undefined";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_20px_40px_rgba(37,99,235,0.24)] transition hover:bg-blue-700"
      >
        新建合作空间
      </button>

      {canUsePortal && isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/28 px-4 py-8 backdrop-blur-md"
              onClick={closePanel}
            >
              <div
                className="max-h-[calc(100vh-4rem)] w-full max-w-4xl overflow-y-auto rounded-[32px] border border-white/80 bg-white/96 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.22)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      新建合作空间
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                      建一个新的协作空间
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      先把空间名称、简介和成员定下来，创建后就能直接进入整理资料。
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closePanel}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                    aria-label="关闭"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="space-y-5">
                    <div className="rounded-[26px] border border-slate-200 bg-slate-50/85 p-5">
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                            空间名称
                          </div>
                          <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="输入合作空间名称"
                            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>

                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                            一句话说明
                          </div>
                          <textarea
                            value={summary}
                            onChange={(event) => setSummary(event.target.value)}
                            rows={3}
                            placeholder="补充这个空间主要协作用来做什么"
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-slate-200 bg-white p-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        空间颜色
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {toneOptions.map((option) => {
                          const selected = option.tone === tone;

                          return (
                            <button
                              key={option.tone}
                              type="button"
                              onClick={() => setTone(option.tone)}
                              className={`rounded-[22px] border p-4 text-left transition ${option.surface} ${
                                selected ? "border-slate-900 shadow-sm" : "hover:border-slate-300"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${option.badge}`}>
                                  {option.label}
                                </span>
                                {selected ? (
                                  <span className="text-xs font-semibold text-slate-900">已选</span>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[26px] border border-slate-200 bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          拉人进空间
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          勾选后会跟你一起加入这个合作空间。
                        </div>
                      </div>
                      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                        {selectedEmails.length} 人
                      </div>
                    </div>

                    <div className="mt-4 max-h-[340px] space-y-3 overflow-y-auto pr-1">
                      {contactOptions.map((contact) => {
                        const checked = selectedEmails.includes(contact.email);

                        return (
                          <label
                            key={contact.email}
                            className={`flex cursor-pointer items-start gap-3 rounded-[22px] border px-4 py-3 transition ${
                              checked
                                ? "border-blue-200 bg-blue-50/70"
                                : "border-slate-200 bg-slate-50/70 hover:border-slate-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSelectedEmails((current) =>
                                  checked
                                    ? current.filter((email) => email !== contact.email)
                                    : [...current, contact.email],
                                )
                              }
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                              {initials(contact.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900">{contact.name}</div>
                              <div className="mt-1 text-xs text-slate-500">{contact.roleLabel}</div>
                              <div className="mt-1 text-xs text-slate-400">{contact.teamLabel}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {error ? (
                  <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closePanel}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isCreating}
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreating ? "创建中..." : "创建合作空间"}
                  </button>
                </div>
              </div>
            </div>,
            window.document.body,
          )
        : null}
    </>
  );
}
