"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { WorkOrderStageStrip } from "@/components/work-order/work-order-stage-strip";
import { useWorkOrderStageSelection } from "@/components/work-order/work-order-stage-selection-context";

type WorkOrderProgressEditorProps = {
  workOrderId: string;
  stage: string;
  label: string;
  initialProgress: number;
  lineClassName: string;
  valueClassName: string;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function WorkOrderProgressEditor({
  workOrderId,
  stage,
  label,
  initialProgress,
  lineClassName,
  valueClassName,
}: WorkOrderProgressEditorProps) {
  const router = useRouter();
  const stageSelection = useWorkOrderStageSelection();
  const [draftProgress, setDraftProgress] = useState(clampPercent(initialProgress));
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  const isDirty = draftProgress !== clampPercent(initialProgress);
  const progressStyle = useMemo(
    () => ({ width: `${draftProgress}%` }),
    [draftProgress],
  );

  function saveProgress(nextProgress: number) {
    const safeProgress = clampPercent(nextProgress);

    startTransition(async () => {
      setErrorMessage("");

      const response = await fetch(`/api/work-orders/${workOrderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progressPercent: safeProgress,
        }),
      }).catch(() => null);

      if (!response?.ok) {
        const payload = await response?.json().catch(() => null);
        setErrorMessage(
          payload?.message || "更新进度失败，请稍后再试。",
        );
        return;
      }

      router.refresh();
    });
  }

  function handleStageSelect(nextStage: string) {
    if (isPending || nextStage === stage) {
      stageSelection?.setSelectedStage(nextStage);
      return;
    }

    stageSelection?.setSelectedStage(nextStage);
    setDraftProgress(1);

    startTransition(async () => {
      setErrorMessage("");

      const response = await fetch(`/api/work-orders/${workOrderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStage: nextStage,
          progressPercent: 1,
        }),
      }).catch(() => null);

      if (!response?.ok) {
        const payload = await response?.json().catch(() => null);
        setErrorMessage(
          payload?.message || "切换当前节点失败，请稍后再试。",
        );
        stageSelection?.setSelectedStage(stage);
        setDraftProgress(clampPercent(initialProgress));
        return;
      }

      router.refresh();
    });
  }

  function handleRangeChange(value: string) {
    setDraftProgress(clampPercent(Number(value)));
  }

  function handleCommit() {
    if (!isDirty || isPending) {
      return;
    }

    saveProgress(draftProgress);
  }

  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-slate-600">{label}</div>
          <div className="text-xs text-slate-400">
            点击或拖动进度条可以直接更新当前节点进度。
          </div>
        </div>
        <div className={`text-[1.9rem] font-black ${valueClassName}`}>{draftProgress}%</div>
      </div>

      <div className="relative">
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
          <div className={`h-full rounded-full ${lineClassName}`} style={progressStyle} />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={draftProgress}
          onChange={(event) => handleRangeChange(event.target.value)}
          onMouseUp={handleCommit}
          onTouchEnd={handleCommit}
          onKeyUp={handleCommit}
          onBlur={handleCommit}
          className="absolute inset-0 h-2.5 w-full cursor-pointer opacity-0"
          aria-label="调整工单节点进度"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <div className="text-slate-400">
          {isPending
            ? "正在保存进度..."
            : isDirty
              ? "松开后会自动保存。"
              : "当前进度已同步。"}
        </div>
        {errorMessage ? (
          <div className="font-semibold text-red-500">{errorMessage}</div>
        ) : null}
      </div>

      <div className="mt-5">
        <WorkOrderStageStrip
          stage={stage}
          selectedStage={stageSelection?.selectedStage}
          onStageSelect={handleStageSelect}
        />
      </div>
    </div>
  );
}
