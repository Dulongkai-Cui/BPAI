"use client";

import { useEffect, useRef, useState } from "react";

import {
  composerExamples,
  type ActionCard,
  type BpAskMessage,
  type BpAskThreadDetail,
  type DispatchExecutionPreview,
} from "@/lib/bp-ask/shared";

function shouldShowTaskPreview(message: BpAskMessage) {
  if (!message.executionPreview || !message.insight) {
    return false;
  }

  const status = message.insight.status;
  const findings = message.insight.findings.join(" ");
  const summary = message.insight.summary;

  return (
    status !== "直接回答" &&
    !summary.includes("Simple greeting") &&
    !findings.includes("BP问问")
  );
}

function simulationToneClasses() {
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function toneClasses(tone: ActionCard["tone"]) {
  if (tone === "purple") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  if (tone === "emerald") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
}

type BpAskWorkbenchProps = {
  activeThread: BpAskThreadDetail | null;
  isLoadingThread: boolean;
  isResponding: boolean;
  errorMessage?: string | null;
  onSubmit: (prompt: string) => void;
};

function formatTimestamp(value: string) {
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

function UserAvatar() {
  return (
    <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-200 text-slate-600">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4.5 w-4.5"
      >
        <path d="M12 12a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" />
        <path d="M5.75 19.25c.8-2.55 3.15-4.25 6.25-4.25s5.45 1.7 6.25 4.25" />
      </svg>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_12px_30px_rgba(37,99,235,0.3)]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4.5 w-4.5"
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
  );
}

export function BpAskWorkbench({
  activeThread,
  isLoadingThread,
  isResponding,
  errorMessage,
  onSubmit,
}: BpAskWorkbenchProps) {
  const [inputValue, setInputValue] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeThread?.messages.length, isResponding]);

  function handleExampleClick(example: string) {
    setInputValue(example);
  }

  function handleSubmit() {
    const trimmed = inputValue.trim();

    if (!trimmed || !activeThread || isResponding) {
      return;
    }

    setInputValue("");
    onSubmit(trimmed);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,#f6f9fd_0%,#eef4fb_55%,#edf2f9_100%)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        <div className="mx-auto flex max-w-[980px] flex-col gap-5 pb-8">
          {isLoadingThread ? (
            <div className="rounded-[26px] border border-slate-200 bg-white px-8 py-10 text-center shadow-sm">
              <div className="text-lg font-semibold text-slate-900">
                正在同步对话内容
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                BPAI 正在从后端读取当前线程的消息、摘要和记忆上下文。
              </p>
            </div>
          ) : null}

          {!isLoadingThread && !activeThread ? (
            <div className="rounded-[26px] border border-dashed border-slate-200 bg-white px-8 py-10 text-center shadow-sm">
              <div className="text-lg font-semibold text-slate-900">
                先开启一条新对话
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                左侧点击“开启新对话”后，BPAI 会为你创建真实线程，并开始记录消息、
                摘要和记忆。
              </p>
            </div>
          ) : null}

          {!isLoadingThread &&
          activeThread &&
          activeThread.messages.length === 0 ? (
            <div className="rounded-[26px] border border-dashed border-slate-200 bg-white px-8 py-10 text-center shadow-sm">
              <div className="text-lg font-semibold text-slate-900">
                {activeThread.title}
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                这是一个新的 BPAI 对话线程。你可以直接输入问题，
                或点击下方示例开始。
              </p>
            </div>
          ) : null}

          {activeThread?.rollingSummary ? (
            <section className="rounded-[24px] border border-blue-100 bg-blue-50/85 px-5 py-4 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-500">
                线程摘要
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700">
                {activeThread.rollingSummary}
              </p>
            </section>
          ) : null}

          {(activeThread?.messages ?? []).map((message) => {
            const isAssistant = message.role === "assistant";

            return (
              <div
                key={message.id}
                className={isAssistant ? "flex gap-4" : "flex justify-end gap-4"}
              >
                {isAssistant ? <AssistantAvatar /> : null}

                <div className={isAssistant ? "max-w-[760px] flex-1" : "max-w-[480px]"}>
                  <div
                    className={
                      isAssistant
                        ? "rounded-[26px] rounded-tl-md border border-slate-200 bg-white px-5 py-4 shadow-[0_14px_40px_rgba(15,23,42,0.08)]"
                        : "rounded-[22px] rounded-tr-md border border-blue-100 bg-blue-50 px-4 py-3.5 text-sm leading-7 text-slate-700 shadow-sm"
                    }
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {isAssistant ? "BPAI" : "你"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {formatTimestamp(message.createdAt)}
                      </span>
                    </div>

                    <p className="text-sm leading-7 text-slate-700">{message.text}</p>

                    {shouldShowTaskPreview(message) ? (
                      <div className="mt-4">
                        <details className="group rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
                          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-700">
                            查看处理细节
                          </summary>
                          <div className="mt-4 space-y-4">
                            <div className={`rounded-[20px] border p-4 ${simulationToneClasses()}`}>
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-amber-600">
                                    模拟执行
                                  </div>
                                  <div className="mt-1 text-sm font-semibold text-amber-900">
                                    {message.executionPreview?.title}
                                  </div>
                                </div>
                                <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold text-amber-700">
                                  {message.executionPreview?.mode}
                                </span>
                              </div>
                              <p className="mt-3 text-sm leading-6 text-amber-900/90">
                                {message.executionPreview?.summary}
                              </p>
                              <p className="mt-2 text-sm leading-6 text-amber-900/80">
                                下一步：{message.executionPreview?.nextStep}
                              </p>
                              <p className="mt-2 text-xs leading-6 text-amber-800/80">
                                {message.executionPreview?.safety}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {(message.executionPreview?.simulatedActions ?? []).map((action) => (
                                  <span
                                    key={`${message.id}-${action}`}
                                    className="rounded-full border border-amber-200 bg-white/75 px-3 py-1 text-xs text-amber-800"
                                  >
                                    {action}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {message.insight ? (
                              <div className="space-y-4">
                                <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                                  <div className="mb-4 flex items-center justify-between">
                                    <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                                      {message.insight.metric}
                                    </h4>
                                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                                      {message.insight.status}
                                    </span>
                                  </div>
                                  <div className="flex h-40 items-end gap-3 rounded-[18px] bg-slate-50 px-3 py-4">
                                    {message.insight.bars.map((value, index) => (
                                      <div
                                        key={`${message.id}-${index}`}
                                        className="flex h-full flex-1 items-end"
                                      >
                                        <div
                                          className="w-full rounded-t-[8px] bg-gradient-to-t from-blue-600 via-blue-500 to-blue-200"
                                          style={{ height: `${value}%` }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="rounded-[22px] border border-rose-100 bg-rose-50/70 p-4">
                                  <div className="mb-3 text-sm font-bold text-rose-600">
                                    识别到的重点
                                  </div>
                                  <div className="space-y-3">
                                    {message.insight.findings.map((finding) => (
                                      <div
                                        key={finding}
                                        className="flex gap-3 rounded-2xl bg-white/85 px-4 py-3 text-sm leading-6 text-slate-700"
                                      >
                                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
                                        <span>{finding}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                  {message.insight.actions.map((action) => (
                                    <button
                                      key={action.title}
                                      type="button"
                                      className={`rounded-[20px] border px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 ${toneClasses(action.tone)}`}
                                    >
                                      <div className="text-sm font-bold">{action.title}</div>
                                      <div className="mt-1 text-xs opacity-80">
                                        {action.subtitle}
                                      </div>
                                    </button>
                                  ))}
                                </div>

                                <p className="text-sm leading-7 text-slate-600">
                                  {message.insight.summary}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </details>
                      </div>
                    ) : null}
                  </div>
                </div>

                {!isAssistant ? <UserAvatar /> : null}
              </div>
            );
          })}

          {isResponding ? (
            <div className="flex gap-4">
              <AssistantAvatar />
              <div className="rounded-[26px] rounded-tl-md border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500 shadow-[0_14px_40px_rgba(15,23,42,0.08)]">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-400 [animation-delay:120ms]" />
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-300 [animation-delay:240ms]" />
                </div>
                <div className="mt-3">BPAI 正在整理当前线程上下文，并生成最新回复...</div>
              </div>
            </div>
          ) : null}

          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur lg:px-8">
        <div className="mx-auto max-w-[980px]">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {composerExamples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleExampleClick(example)}
                className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                {example}
              </button>
            ))}
          </div>

          {errorMessage ? (
            <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {errorMessage}
            </div>
          ) : null}

          <div className="rounded-[26px] border border-blue-100 bg-white px-4 py-3 shadow-[0_20px_48px_rgba(37,99,235,0.08)]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M21.44 11.05 12.25 20a6.25 6.25 0 1 1-8.84-8.84l8.49-8.5a4.25 4.25 0 0 1 6 6l-8.64 8.65a2.25 2.25 0 1 1-3.18-3.18l7.95-7.95" />
                </svg>
              </button>
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <rect x="4.5" y="5.5" width="15" height="13" rx="2.5" />
                  <path d="m8 14 2.75-2.75a1.25 1.25 0 0 1 1.77 0L16 14.75" />
                  <circle cx="9" cy="9.5" r="1.25" />
                </svg>
              </button>
              <input
                disabled={!activeThread || isResponding}
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={
                  activeThread
                    ? "向 BPAI 咨询你的工单、表单、文档或空间状态..."
                    : "请先在左侧开启一条新对话..."
                }
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!activeThread || isResponding || inputValue.trim().length === 0}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_12px_24px_rgba(37,99,235,0.25)] transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>

          <p className="mt-3 text-center text-[11px] text-slate-400">
            BPAI 当前已经支持真实多轮线程、滚动摘要、记忆事实与模拟执行预案，
            后续继续接 Kimi 增强、真实读取链路与龙虾执行。
          </p>
        </div>
      </div>
    </div>
  );
}
