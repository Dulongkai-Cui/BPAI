import Link from "next/link";

import type { AiDormSkillRepositoryData } from "@/lib/ai-dorm/server";

type AiDormSkillsProps = {
  repository: AiDormSkillRepositoryData;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function sourceKindLabel(value: "upload" | "template" | "bp_ask_draft") {
  if (value === "upload") {
    return "上传";
  }

  if (value === "template") {
    return "模板";
  }

  return "BP问问草案";
}

export function AiDormSkills({ repository }: AiDormSkillsProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">
              Capability Assets
            </div>
            <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-slate-950">
              Skill 仓库
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-500">上传、模板、草案</p>
          </div>

          <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
            共 {repository.skills.length} 个 Skill
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[0.95fr_0.95fr_1.1fr]">
          {repository.entryPoints.map((entry) => (
            <article
              key={entry.id}
              className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 shadow-sm"
            >
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                {entry.badge}
              </span>
              <div className="mt-4 text-xl font-black tracking-tight text-slate-950">
                {entry.title}
              </div>
              <div className="mt-3 text-sm leading-7 text-slate-500">
                {entry.description}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950">
                Skill 列表
              </h2>
              <p className="mt-1 text-sm text-slate-500">选择一个 Skill</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {repository.skills.map((skill) => {
              const active = skill.id === repository.selectedSkill.id;

              return (
                <Link
                  key={skill.id}
                  href={`/ai-dorm/skills?skill=${skill.id}`}
                  className={
                    active
                      ? "block rounded-[1.4rem] border border-blue-200 bg-blue-50 p-4 shadow-sm"
                      : "block rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-white"
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                      {skill.category}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                      {sourceKindLabel(skill.sourceKind)}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {skill.statusLabel}
                    </span>
                  </div>
                  <div className="mt-3 text-lg font-black tracking-tight text-slate-950">
                    {skill.name}
                  </div>
                  <div className="mt-2 text-sm leading-7 text-slate-500">
                    {skill.summary}
                  </div>
                  <div className="mt-3 text-xs text-slate-400">
                    最近更新：{formatDate(skill.updatedAt)}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">
              Selected Skill
            </div>
            <h2 className="mt-2 text-[1.7rem] font-black tracking-tight text-slate-950">
              {repository.selectedSkill.name}
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              {repository.selectedSkill.summary}
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  输入
                </div>
                <div className="mt-2 text-sm leading-7 text-slate-700">
                  {repository.selectedSkill.inputSummary}
                </div>
              </div>
              <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  输出
                </div>
                <div className="mt-2 text-sm leading-7 text-slate-700">
                  {repository.selectedSkill.outputSummary}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  关联工作流
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {repository.selectedSkill.linkedWorkflowNames.map((name) => (
                    <span
                      key={name}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  关联 AI员工
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {repository.selectedSkill.linkedAgentNames.map((name) => (
                    <span
                      key={name}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">
                  Embedded BP Ask
                </div>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                  {repository.draftAssistant.title}
                </h2>
              </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-950 p-4 shadow-sm">
              <div className="space-y-3">
                {repository.draftAssistant.messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={
                      message.role === "user"
                        ? "ml-auto max-w-[85%] rounded-2xl bg-blue-600 px-4 py-3 text-sm leading-7 text-white"
                        : "max-w-[88%] rounded-2xl bg-slate-800 px-4 py-3 text-sm leading-7 text-slate-100"
                    }
                  >
                    {message.text}
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-4 text-sm leading-7 text-slate-500">生成后回到仓库整理</p>

            <Link
              href={repository.draftAssistant.ctaHref}
              className="mt-4 inline-flex rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {repository.draftAssistant.ctaLabel}
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
