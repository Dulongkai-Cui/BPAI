import Link from "next/link";

import type {
  AiDormPaletteGroup,
  AiDormWorkflowCard,
  AiDormWorkflowStudioData,
} from "@/lib/ai-dorm/server";

type AiDormWorkflowsProps = {
  studio: AiDormWorkflowStudioData;
};

type WorkflowStep = AiDormWorkflowCard["steps"][number];
type WorkflowPosition = {
  x: number;
  y: number;
};

const CANVAS_WIDTH = 1320;
const CANVAS_HEIGHT = 680;
const NODE_WIDTH = 198;
const NODE_HEIGHT = 120;

function kindLabel(
  kind: "input" | "skill" | "agent" | "condition" | "human" | "output",
) {
  const labels = {
    input: "输入",
    skill: "Skill",
    agent: "AI员工",
    condition: "条件",
    human: "人工确认",
    output: "输出",
  };

  return labels[kind];
}

function kindTone(
  kind: "input" | "skill" | "agent" | "condition" | "human" | "output",
) {
  const tones = {
    input: "bg-slate-100 text-slate-700",
    skill: "bg-blue-100 text-blue-700",
    agent: "bg-emerald-100 text-emerald-700",
    condition: "bg-amber-100 text-amber-700",
    human: "bg-rose-100 text-rose-700",
    output: "bg-violet-100 text-violet-700",
  };

  return tones[kind];
}

function paletteTone(
  kind: "input" | "skill" | "agent" | "condition" | "human" | "output",
) {
  const tones = {
    input: "border-slate-200 bg-white text-slate-700",
    skill: "border-blue-200 bg-blue-50 text-blue-700",
    agent: "border-emerald-200 bg-emerald-50 text-emerald-700",
    condition: "border-amber-200 bg-amber-50 text-amber-700",
    human: "border-rose-200 bg-rose-50 text-rose-700",
    output: "border-violet-200 bg-violet-50 text-violet-700",
  };

  return tones[kind];
}

function formatWorkflowCount(count: number) {
  return `共 ${count} 条工作流`;
}

function flattenPaletteGroups(groups: AiDormPaletteGroup[]) {
  return groups.flatMap((group) =>
    group.nodes.map((node) => ({
      ...node,
      groupLabel: group.label,
    })),
  );
}

function buildNodePositions(steps: WorkflowStep[]) {
  const positions = new Map<string, WorkflowPosition>();
  const rowBaseY = [112, 246, 392, 528];

  steps.forEach((step, index) => {
    const horizontalGap = steps.length > 1 ? 212 : 0;
    const baseX = 48 + index * horizontalGap;
    const rowIndex = Math.max(0, step.row - 1);
    const baseY = rowBaseY[rowIndex] ?? 112 + rowIndex * 148;
    const columnOffset =
      step.column === 1 ? -4 : step.column === 2 ? 10 : step.column === 3 ? 3 : 0;
    const kindOffset =
      step.kind === "condition"
        ? -10
        : step.kind === "human"
          ? 8
          : step.kind === "output"
            ? 4
            : 0;

    positions.set(step.id, {
      x: baseX + columnOffset,
      y: baseY + kindOffset,
    });
  });

  return positions;
}

function resolveConnectors(
  workflow: AiDormWorkflowCard,
  positions: Map<string, WorkflowPosition>,
) {
  const byTitle = new Map(workflow.steps.map((step) => [step.title, step]));

  return workflow.steps.flatMap((step) => {
    const from = positions.get(step.id);
    if (!from) {
      return [];
    }

    return step.nextTitles.flatMap((nextTitle) => {
      const targetStep = byTitle.get(nextTitle);
      const to = targetStep ? positions.get(targetStep.id) : undefined;

      if (!targetStep || !to) {
        return [];
      }

      const startX = from.x + NODE_WIDTH;
      const startY = from.y + NODE_HEIGHT / 2;
      const endX = to.x;
      const endY = to.y + NODE_HEIGHT / 2;
      const distance = Math.max(64, Math.abs(endX - startX) * 0.38);

      return [
        {
          id: `${step.id}-${targetStep.id}`,
          path: `M ${startX} ${startY} C ${startX + distance} ${startY}, ${
            endX - distance
          } ${endY}, ${endX} ${endY}`,
        },
      ];
    });
  });
}

function CanvasNode({
  step,
  position,
}: {
  step: WorkflowStep;
  position: WorkflowPosition;
}) {
  return (
    <article
      className="absolute rounded-[1.2rem] border border-slate-200/90 bg-white/95 p-2.5 shadow-[0_16px_38px_-30px_rgba(15,23,42,0.42)] backdrop-blur"
      style={{
        left: position.x,
        top: position.y,
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
      }}
    >
      <span className="absolute top-1/2 left-[-4px] h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500 shadow-sm" />
      <span className="absolute top-1/2 right-[-4px] h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500 shadow-sm" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${kindTone(
              step.kind,
            )}`}
          >
            {kindLabel(step.kind)}
          </span>
          <div className="min-w-0 text-[0.88rem] font-black tracking-tight text-slate-950">
            {step.title}
          </div>
        </div>
        <button
          type="button"
          className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
        >
          •••
        </button>
      </div>

      <div className="mt-2.5 text-[11px] leading-[1.2rem] text-slate-500">{step.description}</div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
        {step.nextTitles.length > 0 ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-500">
            下一步 · {step.nextTitles.join(" / ")}
          </span>
        ) : (
          <span className="rounded-full bg-violet-50 px-3 py-1 font-semibold text-violet-700">
            输出到 execution_results
          </span>
        )}
      </div>
    </article>
  );
}

export function AiDormWorkflows({ studio }: AiDormWorkflowsProps) {
  const selectedWorkflow = studio.selectedWorkflow;
  const positions = buildNodePositions(selectedWorkflow.steps);
  const connectors = resolveConnectors(selectedWorkflow, positions);
  const paletteNodes = flattenPaletteGroups(studio.paletteGroups);
  const bottomNodes = paletteNodes.slice(0, 6);

  return (
    <section className="relative min-h-[calc(100vh-5.75rem)] -mx-2 overflow-hidden rounded-[2.1rem] border border-slate-200 bg-white shadow-[0_30px_90px_-45px_rgba(15,23,42,0.45)] sm:-mx-4">
      <div className="relative z-40 overflow-visible border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur md:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                Workflow Workshop
              </div>
              <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-slate-950">
                工作流工坊
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
            <details className="relative z-50">
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-white">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    当前工作流
                  </div>
                  <div className="truncate font-semibold text-slate-900">
                    {selectedWorkflow.name}
                  </div>
                </div>
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  className="h-4 w-4 shrink-0 text-slate-400"
                >
                  <path
                    d="M5 7.5 10 12.5l5-5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </summary>

              <div className="absolute top-[calc(100%+0.6rem)] left-0 z-50 w-80 rounded-[1.4rem] border border-slate-200 bg-white p-2 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]">
                {studio.workflows.map((workflow) => {
                  const active = workflow.id === selectedWorkflow.id;

                  return (
                    <Link
                      key={workflow.id}
                      href={`/ai-dorm/workflows?workflow=${workflow.id}`}
                      className={
                        active
                          ? "block rounded-[1rem] bg-blue-50 px-4 py-3 text-blue-700"
                          : "block rounded-[1rem] px-4 py-3 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                      }
                    >
                      <div className="text-sm font-semibold">{workflow.name}</div>
                      <div className="mt-1 text-xs text-current/75">
                        {workflow.stepCount} 个节点
                      </div>
                    </Link>
                  );
                })}
              </div>
            </details>

            <details className="relative z-50">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700">
                <span className="text-lg leading-none">+</span>
                新建工作流
              </summary>

              <div className="absolute top-[calc(100%+0.6rem)] left-0 z-50 w-72 rounded-[1.4rem] border border-slate-200 bg-white p-2 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]">
                <button
                  type="button"
                  className="block w-full rounded-[1rem] px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <div className="text-sm font-semibold text-slate-900">从空白开始</div>
                  <div className="mt-1 text-xs text-slate-500">创建一个新的画布流程</div>
                </button>
                <button
                  type="button"
                  className="block w-full rounded-[1rem] px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <div className="text-sm font-semibold text-slate-900">从当前模板复制</div>
                  <div className="mt-1 text-xs text-slate-500">复制当前骨架再继续编辑</div>
                </button>
              </div>
            </details>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
              {formatWorkflowCount(studio.workflows.length)}
            </span>
            <span
              className={
                selectedWorkflow.enabled
                  ? "rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700"
                  : "rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500"
              }
            >
              {selectedWorkflow.enabled ? "已启用" : "未启用"}
            </span>
            <Link
              href="/ai-dorm/tasks"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              查看任务
            </Link>
          </div>
        </div>
      </div>

      <div className="relative z-0 min-h-[calc(100vh-11.5rem)] overflow-hidden bg-[#f7f9fe]">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.24) 1.2px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.12),transparent_62%)]" />

        <div className="relative h-full overflow-auto px-4 py-5 md:px-6 md:py-6">
          <div
            className="relative"
            style={{
              width: CANVAS_WIDTH,
              minHeight: CANVAS_HEIGHT,
            }}
          >
            <div className="pointer-events-none absolute top-0 left-0 z-10 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm backdrop-blur">
              画布预览
            </div>

            <svg
              className="pointer-events-none absolute inset-0 z-0"
              viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
              fill="none"
            >
              {connectors.map((connector) => (
                <path
                  key={connector.id}
                  d={connector.path}
                  stroke="#4f46e5"
                  strokeWidth="4"
                  strokeLinecap="round"
                  className="drop-shadow-[0_0_16px_rgba(79,70,229,0.24)]"
                />
              ))}
            </svg>

            {selectedWorkflow.steps.map((step) => {
              const position = positions.get(step.id);

              return position ? (
                <CanvasNode key={step.id} step={step} position={position} />
              ) : null;
            })}

          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-[1.45rem] border border-slate-200/90 bg-white/95 px-3 py-3 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <span className="font-semibold">缩放</span>
              <span>90%</span>
            </div>

            <div className="hidden h-7 w-px bg-slate-200 sm:block" />

            {bottomNodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className={`hidden rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 lg:inline-flex ${paletteTone(
                  node.kind,
                )}`}
              >
                {node.label}
              </button>
            ))}

            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[1rem] bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100">
                <span className="text-lg leading-none">+</span>
                添加节点
              </summary>
              <div className="absolute bottom-[calc(100%+0.75rem)] left-1/2 z-40 w-80 -translate-x-1/2 rounded-[1.4rem] border border-slate-200 bg-white p-2 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]">
                {paletteNodes.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-[1rem] px-4 py-3 text-left transition hover:bg-slate-50"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">
                        {node.label}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {node.groupLabel}
                      </span>
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${kindTone(
                        node.kind,
                      )}`}
                    >
                      {kindLabel(node.kind)}
                    </span>
                  </button>
                ))}
              </div>
            </details>

            <button
              type="button"
              className="rounded-[1rem] bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
            >
              试运行
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
