import Link from "next/link";

import type { AiDormLandingData } from "@/lib/ai-dorm/server";

type AiDormOverviewProps = {
  overview: AiDormLandingData;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const metricCards = [
  {
    key: "pendingTasks",
    label: "待承接",
    tone: "bg-amber-50 text-amber-700",
  },
  {
    key: "completedTasks",
    label: "已完成",
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    key: "delegatedTasks",
    label: "已委派",
    tone: "bg-violet-50 text-violet-700",
  },
  {
    key: "confirmationTasks",
    label: "待确认",
    tone: "bg-rose-50 text-rose-700",
  },
] as const;

const coreToneMap = {
  workflows: "border-blue-200 bg-blue-50/70",
  skills: "border-emerald-200 bg-emerald-50/70",
  agents: "border-amber-200 bg-amber-50/80",
} as const;

export function AiDormOverviewPanel({ overview }: AiDormOverviewProps) {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.22),transparent_24%),linear-gradient(135deg,#0f172a_0%,#1d4ed8_48%,#22c55e_100%)] px-6 py-7 text-white">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-blue-100/80">
            AI Dorm Backend Hub
          </div>
          <h1 className="mt-3 text-[2rem] font-black tracking-tight">
            AI宿舍
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-blue-50/90">工作流、Skill、AI员工</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/ai-dorm/workflows"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
            >
              进入工作流工坊
            </Link>
            <Link
              href="/ai-dorm/skills"
              className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              查看 Skill 仓库
            </Link>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => (
            <div
              key={card.key}
              className={`rounded-[1.5rem] border border-slate-200 p-5 shadow-sm ${card.tone}`}
            >
              <div className="text-xs font-black uppercase tracking-[0.16em]">
                {card.label}
              </div>
              <div className="mt-3 text-[2.2rem] font-black">
                {overview.counts[card.key]}
              </div>
              <div className="mt-2 text-xs text-current/80">
                总任务 {overview.counts.totalTasks}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {overview.coreEntries.map((entry) => (
          <Link
            key={entry.id}
            href={entry.href}
            className={`group rounded-[1.8rem] border p-5 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-md ${
              coreToneMap[entry.id]
            }`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {entry.eyebrow}
            </div>
            <div className="mt-3 text-[1.65rem] font-black tracking-tight text-slate-950">
              {entry.title}
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-500">{entry.summary}</p>

            <div className="mt-5 rounded-[1.3rem] border border-slate-200 bg-white/80 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {entry.metricLabel}
              </div>
              <div className="mt-2 text-[2rem] font-black tracking-tight text-slate-950">
                {entry.metricValue}
              </div>
            </div>

            {entry.note ? (
              <div className="mt-4 text-sm leading-7 text-slate-500">{entry.note}</div>
            ) : null}
            <div className="mt-4 text-sm font-semibold text-blue-600 transition group-hover:text-blue-700">
              进入板块
            </div>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950">
                任务收件箱
              </h2>
              <p className="mt-1 text-sm text-slate-500">最近任务与结果</p>
            </div>
            <Link
              href="/ai-dorm/tasks"
              className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
            >
              打开收件箱
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {overview.taskInboxPreview.length > 0 ? (
              overview.taskInboxPreview.map((task) => (
                <div
                  key={task.taskId}
                  className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                      {task.primaryIntentLabel}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                      {task.targetDomainLabel}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                      {task.executionModeLabel}
                    </span>
                  </div>
                  <div className="mt-3 text-base font-bold text-slate-950">{task.goal}</div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                    <span>executor: {task.executorKind}</span>
                    <span>status: {task.status}</span>
                    <span>{formatDateTime(task.createdAt)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.4rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm leading-7 text-slate-500">
                暂无任务
              </div>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black tracking-tight text-slate-950">
              资源位
            </h2>
            <div className="mt-4 rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-950">
                {overview.resourceNote.title}
              </div>
              <div className="mt-2 text-sm leading-7 text-slate-500">
                {overview.resourceNote.summary}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
