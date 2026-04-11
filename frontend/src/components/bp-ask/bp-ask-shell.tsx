"use client";

import { useCallback, useEffect, useState } from "react";

import { BpAskSidebar } from "@/components/bp-ask/bp-ask-sidebar";
import { BpAskWorkbench } from "@/components/bp-ask/bp-ask-workbench";
import type { BpAskThreadDetail, BpAskThreadSummary } from "@/lib/bp-ask/shared";

type ThreadsResponse = {
  threads: BpAskThreadSummary[];
};

type ThreadResponse = {
  thread: BpAskThreadDetail;
};

type ThreadMutationResponse = {
  summary: BpAskThreadSummary;
  thread: BpAskThreadDetail;
};

type PendingUserMessage = {
  id: string;
  text: string;
  createdAt: string;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      json && typeof json.message === "string"
        ? json.message
        : "请求失败，请稍后再试。";
    throw new Error(message);
  }

  return json as T;
}

export function BpAskShell() {
  const [threads, setThreads] = useState<BpAskThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<BpAskThreadDetail | null>(null);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<PendingUserMessage | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const syncThreadSummary = useCallback((nextSummary: BpAskThreadSummary) => {
    setThreads((current) => {
      const remaining = current.filter((thread) => thread.id !== nextSummary.id);
      return [nextSummary, ...remaining];
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadThreads() {
      setIsLoadingThreads(true);

      try {
        const result = await requestJson<ThreadsResponse>("/api/bp-ask/threads");

        if (cancelled) {
          return;
        }

        setThreads(result.threads);
        setActiveThreadId((current) => current ?? result.threads[0]?.id ?? null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "读取对话列表失败。",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingThreads(false);
        }
      }
    }

    void loadThreads();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeThreadId) {
      setActiveThread(null);
      return;
    }

    if (activeThread?.id === activeThreadId) {
      return;
    }

    let cancelled = false;

    async function loadThread() {
      setIsLoadingThread(true);
      setErrorMessage(null);

      try {
        const result = await requestJson<ThreadResponse>(
          `/api/bp-ask/threads/${activeThreadId}`,
        );

        if (!cancelled) {
          setActiveThread(result.thread);
        }
      } catch (error) {
        if (!cancelled) {
          setActiveThread(null);
          setErrorMessage(error instanceof Error ? error.message : "读取对话失败。");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingThread(false);
        }
      }
    }

    void loadThread();

    return () => {
      cancelled = true;
    };
  }, [activeThread?.id, activeThreadId]);

  const handleCreateThread = useCallback(async () => {
    setErrorMessage(null);

    try {
      const result = await requestJson<ThreadMutationResponse>("/api/bp-ask/threads", {
        method: "POST",
        body: JSON.stringify({}),
      });

      syncThreadSummary(result.summary);
      setActiveThread(result.thread);
      setActiveThreadId(result.thread.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "创建对话失败。");
    }
  }, [syncThreadSummary]);

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      setErrorMessage(null);

      try {
        await requestJson<{ ok: true }>(`/api/bp-ask/threads/${threadId}`, {
          method: "DELETE",
        });

        setThreads((current) => current.filter((thread) => thread.id !== threadId));
        setActiveThreadId((current) => {
          if (current !== threadId) {
            return current;
          }

          const remaining = threads.filter((thread) => thread.id !== threadId);
          return remaining[0]?.id ?? null;
        });
        setActiveThread((current) => (current?.id === threadId ? null : current));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "删除对话失败。");
      }
    },
    [threads],
  );

  const handleSubmit = useCallback(
    async (prompt: string) => {
      const normalizedPrompt = prompt.trim();

      if (!normalizedPrompt) {
        return;
      }

      let threadId = activeThreadId;

      if (!threadId) {
        try {
          const created = await requestJson<ThreadMutationResponse>("/api/bp-ask/threads", {
            method: "POST",
            body: JSON.stringify({}),
          });

          syncThreadSummary(created.summary);
          setActiveThread(created.thread);
          setActiveThreadId(created.thread.id);
          threadId = created.thread.id;
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : "创建对话失败。");
          return;
        }
      }

      setIsResponding(true);
      setPendingUserMessage({
        id: `pending-${Date.now().toString(36)}`,
        text: normalizedPrompt,
        createdAt: new Date().toISOString(),
      });
      setErrorMessage(null);

      try {
        const result = await requestJson<ThreadMutationResponse>(
          `/api/bp-ask/threads/${threadId}/messages`,
          {
            method: "POST",
            body: JSON.stringify({
              prompt: normalizedPrompt,
            }),
          },
        );

        syncThreadSummary(result.summary);
        setActiveThread(result.thread);
        setActiveThreadId(result.thread.id);
        setPendingUserMessage(null);
      } catch (error) {
        setPendingUserMessage(null);
        setErrorMessage(error instanceof Error ? error.message : "发送消息失败。");
      } finally {
        setIsResponding(false);
      }
    },
    [activeThreadId, syncThreadSummary],
  );

  return (
    <div className="flex h-full min-h-0 bg-slate-100">
      <BpAskSidebar
        threads={threads}
        activeThreadId={activeThreadId}
        isLoading={isLoadingThreads}
        onSelectThread={setActiveThreadId}
        onCreateThread={handleCreateThread}
        onDeleteThread={handleDeleteThread}
      />
      <div className="min-w-0 flex-1">
        <BpAskWorkbench
          activeThread={
            pendingUserMessage && activeThread
              ? {
                  ...activeThread,
                  messages: [
                    ...activeThread.messages,
                    {
                      id: pendingUserMessage.id,
                      role: "user",
                      text: pendingUserMessage.text,
                      createdAt: pendingUserMessage.createdAt,
                    },
                  ],
                }
              : activeThread
          }
          isLoadingThread={isLoadingThread}
          isResponding={isResponding}
          errorMessage={errorMessage}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
