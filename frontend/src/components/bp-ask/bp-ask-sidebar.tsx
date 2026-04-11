"use client";

import type { ReactNode } from "react";

import { quickActions, type BpAskThreadSummary } from "@/lib/bp-ask/shared";

function SidebarIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-5 w-5 items-center justify-center text-current">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        {children}
      </svg>
    </span>
  );
}

type BpAskSidebarProps = {
  threads: BpAskThreadSummary[];
  activeThreadId: string | null;
  isLoading?: boolean;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
  onDeleteThread: (threadId: string) => void;
};

function formatUpdatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function BpAskSidebar({
  threads,
  activeThreadId,
  isLoading = false,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
}: BpAskSidebarProps) {
  return (
    <aside className="flex h-full w-[18.5rem] shrink-0 flex-col border-r border-slate-200 bg-[#f8fafc]">
      <div className="p-5">
        <button
          type="button"
          onClick={onCreateThread}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(37,99,235,0.28)] transition hover:bg-blue-500"
        >
          <span className="text-base">+</span>
          <span>开启新对话</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <section>
          <h3 className="px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            常用操作
          </h3>
          <div className="mt-3 space-y-1">
            {quickActions.map((item) => (
              <button
                key={item.title}
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white hover:shadow-sm"
              >
                <span className={item.tone}>
                  <SidebarIcon>
                    <path d="M7 3.75h7.5L19 8.25V20.25H7z" />
                    <path d="M14.5 3.75v4.5H19" />
                    <path d="M9.5 11.25h7" />
                    <path d="M9.5 14.25h7" />
                  </SidebarIcon>
                </span>
                <span className="text-sm font-medium text-slate-700">
                  {item.title}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            历史对话
          </h3>
          <div className="mt-3 space-y-2">
            {threads.map((thread) => {
              const isActive = thread.id === activeThreadId;

              return (
                <div
                  key={thread.id}
                  className={
                    isActive
                      ? "rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-sm"
                      : "rounded-2xl px-4 py-3 transition hover:bg-white hover:shadow-sm"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onSelectThread(thread.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold text-slate-800">
                          {thread.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {formatUpdatedAt(thread.updatedAt)}
                        </span>
                      </div>
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">
                        {thread.lastMessagePreview || "还没有消息，点击继续开始。"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteThread(thread.id);
                      }}
                      className="shrink-0 rounded-xl px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-rose-500"
                      aria-label="删除对话"
                      title="删除对话"
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}

            {!isLoading && threads.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-400">
                还没有历史对话，点击上方按钮开启第一条对话。
              </div>
            ) : null}

            {isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-400 shadow-sm">
                正在同步你的对话线程...
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div className="border-t border-slate-200 p-4">
        <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_8px_18px_rgba(37,99,235,0.25)]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M12 3v5" />
                <path d="M12 16v5" />
                <path d="M4.5 7.5 8 9.5" />
                <path d="M16 14.5l3.5 2" />
                <path d="M4.5 16.5 8 14.5" />
                <path d="M16 9.5l3.5-2" />
                <circle cx="12" cy="12" r="3.5" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">BPAI 调度台 v0.1</div>
              <div className="text-[11px] text-slate-500">
                长对话与执行任务承接层
              </div>
            </div>
          </div>
          <p className="text-[11px] leading-5 text-slate-500">
            当前这一版先把对话线程、消息持久化、滚动摘要和记忆事实落到后端，
            后续继续接 Kimi 调度和龙虾执行。
          </p>
        </div>
      </div>
    </aside>
  );
}
