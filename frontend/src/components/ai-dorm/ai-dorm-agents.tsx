import type { AiDormAgentCard } from "@/lib/ai-dorm/server";

type AiDormAgentsProps = {
  agents: AiDormAgentCard[];
  canManage: boolean;
  scopeLabel: string;
};

export function AiDormAgents({
  agents,
  canManage,
  scopeLabel,
}: AiDormAgentsProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">
              AI Employees
            </div>
            <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-slate-950">
              AI员工
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-500">列表、状态、配置</p>
          </div>

          <div
            className={
              canManage
                ? "rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700"
                : "rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600"
            }
          >
            {scopeLabel}
          </div>
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-bold text-slate-950">配置口径</div>
          <div className="mt-2 text-sm leading-7 text-slate-500">支持全局查看与配置入口</div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {agents.map((agent) => (
          <article
            key={agent.id}
            className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-black tracking-tight text-slate-950">
                  {agent.name}
                </div>
                <div className="mt-2 text-sm leading-7 text-slate-500">
                  {agent.description}
                </div>
              </div>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                {agent.statusLabel}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {agent.domainLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  最近任务数
                </div>
                <div className="mt-2 text-[2rem] font-black tracking-tight text-slate-950">
                  {agent.recentTaskCount}
                </div>
              </div>
              <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  owner
                </div>
                <div className="mt-2 text-sm leading-7 text-slate-700">
                  {agent.ownerLabel}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                协议说明
              </div>
              <div className="mt-2 text-sm leading-7 text-slate-700">
                {agent.protocolSummary}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {agent.capabilityTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                配置入口预留
              </span>
              {canManage ? (
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                  当前角色可编辑全局配置
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                  当前角色只读查看
                </span>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
