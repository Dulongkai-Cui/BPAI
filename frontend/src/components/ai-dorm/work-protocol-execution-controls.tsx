"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type WorkProtocolExecutionAdvanceAction = "advance" | "confirm_waiting";

type WorkProtocolExecutionControlsProps = {
  executionId: string;
  status: string;
  hasWaitingConfirmation: boolean;
  hasQueuedNodes: boolean;
};

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

export function WorkProtocolExecutionControls({
  executionId,
  status,
  hasWaitingConfirmation,
  hasQueuedNodes,
}: WorkProtocolExecutionControlsProps) {
  const router = useRouter();
  const [busyAction, setBusyAction] =
    useState<WorkProtocolExecutionAdvanceAction | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const isTerminal = TERMINAL_STATUSES.has(status);

  async function runAction(action: WorkProtocolExecutionAdvanceAction) {
    setBusyAction(action);
    setErrorMessage("");

    try {
      const response = await fetch(
        "/api/ai-dorm/work-protocol-gateway/executions",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            executionId,
            action,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        setErrorMessage(payload?.message ?? "推进执行计划失败。");
        return;
      }

      router.refresh();
    } catch {
      setErrorMessage("网络或服务异常，暂时无法推进执行计划。");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
            Dry-run Control
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            按节点推进 plan-only 计划，不真实调用 Tool、Skill、RAG 或龙虾。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runAction("advance")}
            disabled={isTerminal || busyAction !== null || (!hasQueuedNodes && !hasWaitingConfirmation)}
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {busyAction === "advance" ? "推进中" : "推进一步"}
          </button>
          <button
            type="button"
            onClick={() => runAction("confirm_waiting")}
            disabled={isTerminal || busyAction !== null || !hasWaitingConfirmation}
            className="rounded-full bg-amber-100 px-4 py-2 text-sm font-black text-amber-800 shadow-sm transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            {busyAction === "confirm_waiting" ? "确认中" : "确认并继续"}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
