"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const stageSteps = [
  { key: "source_intake", label: "来源" },
  { key: "registration", label: "登记" },
  { key: "dispatch", label: "派单" },
  { key: "warning", label: "预警" },
  { key: "field_construction", label: "施工" },
  { key: "return_sheet", label: "回单" },
  { key: "drawing_delivery", label: "图纸" },
  { key: "resource_entry", label: "录资" },
  { key: "resource_audit", label: "稽核" },
  { key: "design_package", label: "出设" },
] as const;

function resolveStageIndex(stage: string) {
  const index = stageSteps.findIndex((item) => item.key === stage);
  return index >= 0 ? index : 0;
}

function ArrowButton({
  direction,
  disabled,
  onClick,
  tone = "default",
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
  tone?: "default" | "alert";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        tone === "alert"
          ? "flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white shadow-sm transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"
          : "flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35"
      }
      aria-label={direction === "left" ? "向前查看流程节点" : "向后查看流程节点"}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        {direction === "left" ? (
          <path d="m14.5 6.75-5 5.25 5 5.25" />
        ) : (
          <path d="m9.5 6.75 5 5.25-5 5.25" />
        )}
      </svg>
    </button>
  );
}

export function WorkOrderStageStrip({
  stage,
  tone = "default",
}: {
  stage: string;
  tone?: "default" | "alert";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const activeIndex = useMemo(() => resolveStageIndex(stage), [stage]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateScrollState = () => {
      const maxScrollLeft = element.scrollWidth - element.clientWidth;
      setCanScrollLeft(element.scrollLeft > 4);
      setCanScrollRight(maxScrollLeft - element.scrollLeft > 4);
    };

    updateScrollState();
    element.addEventListener("scroll", updateScrollState, { passive: true });

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(element);

    return () => {
      element.removeEventListener("scroll", updateScrollState);
      observer.disconnect();
    };
  }, []);

  function scrollByOffset(offset: number) {
    containerRef.current?.scrollBy({
      left: offset,
      behavior: "smooth",
    });
  }

  return (
    <div className="flex items-start gap-2">
      <div className="pt-5">
        <ArrowButton
          direction="left"
          disabled={!canScrollLeft}
          onClick={() => scrollByOffset(-180)}
          tone={tone}
        />
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex min-w-max items-start gap-2 py-1">
          {stageSteps.map((item, index) => {
            const reached = index <= activeIndex;
            const connectorReached = index < activeIndex;

            return (
              <div key={item.key} className="flex items-start gap-2">
                <div className="flex min-w-[56px] flex-col items-center gap-1">
                  <div
                    className={
                      reached
                        ? tone === "alert"
                          ? "flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-white text-red-600"
                          : "flex h-7 w-7 items-center justify-center rounded-full border-2 border-blue-600 bg-blue-600 text-white"
                        : tone === "alert"
                          ? "flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/40 bg-transparent text-white/50"
                          : "flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-300"
                    }
                  >
                    <span className="text-[10px] font-black">•</span>
                  </div>
                  <span
                    className={
                      reached
                        ? tone === "alert"
                          ? "text-[11px] font-semibold text-white"
                          : "text-[11px] font-semibold text-blue-600"
                        : tone === "alert"
                          ? "text-[11px] font-semibold text-white/65"
                          : "text-[11px] font-semibold text-slate-400"
                    }
                  >
                    {item.label}
                  </span>
                </div>

                {index < stageSteps.length - 1 ? (
                  <div
                    className={
                      connectorReached
                        ? tone === "alert"
                          ? "mt-3 h-1 w-8 rounded-full bg-white"
                          : "mt-3 h-1 w-8 rounded-full bg-blue-600"
                        : tone === "alert"
                          ? "mt-3 h-1 w-8 rounded-full bg-white/20"
                          : "mt-3 h-1 w-8 rounded-full bg-slate-200"
                    }
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-5">
        <ArrowButton
          direction="right"
          disabled={!canScrollRight}
          onClick={() => scrollByOffset(180)}
          tone={tone}
        />
      </div>
    </div>
  );
}
