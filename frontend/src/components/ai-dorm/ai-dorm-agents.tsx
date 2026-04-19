import type { AiDormAgentCard } from "@/lib/ai-dorm/server";

type AiDormAgentsProps = {
  agents: AiDormAgentCard[];
  canManage: boolean;
  scopeLabel: string;
};

type AgentVisualTheme = {
  avatarBg: string;
  avatarRing: string;
  avatarGlow: string;
  iconFill: string;
  chipTone: string;
};

function getAgentVisualTheme(agentId: string): AgentVisualTheme {
  switch (agentId) {
    case "work-order-longxia":
      return {
        avatarBg: "from-sky-100 via-blue-50 to-white",
        avatarRing: "border-sky-200",
        avatarGlow: "bg-sky-300/35",
        iconFill: "fill-sky-600",
        chipTone: "bg-sky-100 text-sky-700",
      };
    case "document-longxia":
      return {
        avatarBg: "from-emerald-100 via-teal-50 to-white",
        avatarRing: "border-emerald-200",
        avatarGlow: "bg-emerald-300/35",
        iconFill: "fill-emerald-600",
        chipTone: "bg-emerald-100 text-emerald-700",
      };
    case "drawing-longxia":
      return {
        avatarBg: "from-violet-100 via-indigo-50 to-white",
        avatarRing: "border-violet-200",
        avatarGlow: "bg-violet-300/35",
        iconFill: "fill-violet-600",
        chipTone: "bg-violet-100 text-violet-700",
      };
    case "alert-longxia":
      return {
        avatarBg: "from-amber-100 via-orange-50 to-white",
        avatarRing: "border-amber-200",
        avatarGlow: "bg-amber-300/35",
        iconFill: "fill-amber-600",
        chipTone: "bg-amber-100 text-amber-700",
      };
    case "report-longxia":
      return {
        avatarBg: "from-cyan-100 via-slate-50 to-white",
        avatarRing: "border-cyan-200",
        avatarGlow: "bg-cyan-300/35",
        iconFill: "fill-cyan-700",
        chipTone: "bg-cyan-100 text-cyan-700",
      };
    default:
      return {
        avatarBg: "from-slate-100 via-slate-50 to-white",
        avatarRing: "border-slate-200",
        avatarGlow: "bg-slate-300/35",
        iconFill: "fill-slate-600",
        chipTone: "bg-slate-100 text-slate-700",
      };
  }
}

function AgentAvatarIllustration({ agentId }: { agentId: string }) {
  const theme = getAgentVisualTheme(agentId);

  return (
    <div
      className={`relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[1.6rem] border ${theme.avatarRing} bg-gradient-to-br ${theme.avatarBg} shadow-sm`}
    >
      <div
        className={`absolute -right-4 -top-5 h-14 w-14 rounded-full blur-xl ${theme.avatarGlow}`}
      />
      <div
        className={`absolute -bottom-5 -left-4 h-16 w-16 rounded-full blur-xl ${theme.avatarGlow}`}
      />

      {agentId === "work-order-longxia" ? (
        <svg
          viewBox="0 0 96 96"
          className={`h-16 w-16 ${theme.iconFill}`}
          aria-hidden="true"
        >
          <path
            d="M28 18a8 8 0 0 1 8-8h24l16 16v44a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8V18Zm36 2v12h12"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M38 40h20M38 54h20M38 68h12"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
      ) : null}

      {agentId === "document-longxia" ? (
        <svg
          viewBox="0 0 96 96"
          className={`h-16 w-16 ${theme.iconFill}`}
          aria-hidden="true"
        >
          <path
            d="M24 24a8 8 0 0 1 8-8h18l6 8h24a8 8 0 0 1 8 8v32a8 8 0 0 1-8 8H32a8 8 0 0 1-8-8V24Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinejoin="round"
          />
          <path
            d="M34 42h28M34 56h22"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
      ) : null}

      {agentId === "drawing-longxia" ? (
        <svg
          viewBox="0 0 96 96"
          className={`h-16 w-16 ${theme.iconFill}`}
          aria-hidden="true"
        >
          <path
            d="M18 66 66 18m-8 44 20-20"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M18 78h20l40-40-20-20-40 40v20Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinejoin="round"
          />
          <circle cx="72" cy="24" r="6" fill="currentColor" />
        </svg>
      ) : null}

      {agentId === "alert-longxia" ? (
        <svg
          viewBox="0 0 96 96"
          className={`h-16 w-16 ${theme.iconFill}`}
          aria-hidden="true"
        >
          <path
            d="M48 18v20m0 16v24M26 54a22 22 0 0 1 44 0M18 54a30 30 0 0 1 60 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <circle cx="48" cy="48" r="8" fill="currentColor" />
        </svg>
      ) : null}

      {agentId === "report-longxia" ? (
        <svg
          viewBox="0 0 96 96"
          className={`h-16 w-16 ${theme.iconFill}`}
          aria-hidden="true"
        >
          <path
            d="M20 74h56M28 66V44m18 22V30m18 36V22"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="m26 30 18-10 12 8 16-12"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </div>
  );
}

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
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-500">
              列表、状态、配置
            </p>
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
          <div className="mt-2 text-sm leading-7 text-slate-500">
            支持全局查看与配置入口
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {agents.map((agent) => {
          const theme = getAgentVisualTheme(agent.id);

          return (
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

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <AgentAvatarIllustration agentId={agent.id} />

                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Focus
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {agent.domainLabels.map((label) => (
                          <span
                            key={label}
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.chipTone}`}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 text-sm leading-7 text-slate-600">
                        {agent.protocolSummary}
                      </div>
                    </div>
                  </div>
                </div>

                {agent.consoleEntry ? (
                  <div className="rounded-[1.2rem] border border-blue-200 bg-blue-50/70 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-500">
                      OpenClaw
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {agent.consoleEntry.note}
                    </div>
                    <a
                      href={agent.consoleEntry.href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                      {agent.consoleEntry.label}
                    </a>
                  </div>
                ) : null}
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
                    Owner
                  </div>
                  <div className="mt-2 text-sm leading-7 text-slate-700">
                    {agent.ownerLabel}
                  </div>
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
          );
        })}
      </section>
    </div>
  );
}
