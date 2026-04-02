import Link from "next/link";

import { getEngineeringHubSummary } from "@/lib/engineering/server";

const HUB_BG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDUpEyUKLAmloKOtXMhv6vnfFyzYsKmpvE5ug2vYpiDjR2O7cLfu7VqWVUWTQ8QLxCR5CVcVXBTswrOKFFakk1TEbzKq5WWGjaDOnw88fvjh1v7OIDKw7VVjxb8Y9qmXVbcRwTIR2rDwACgzMdqtpcxxtVeYWy4xMdM9q0Zfzej3SlYW2ZpH5HFGbxvIzsGOusnMkRbqsUJuSLGgyVIVJhqQggCM_duVHxPU7ScaeNB1W9NafPi30ueO_v7rtUAeWZpPy0n1o6RPQ";

type HubCard = {
  eyebrow: string;
  title: string;
  color: string;
  mark: string;
  href?: string;
};

const hubCards: HubCard[] = [
  {
    eyebrow: "ADMIN",
    title: "办公室",
    color: "bg-[#3867ad]",
    mark: "井",
  },
  {
    eyebrow: "OPERATIONS",
    title: "工程组",
    color: "bg-[#667087]",
    mark: "工",
    href: "/engineering/board",
  },
  {
    eyebrow: "COMPLIANCE",
    title: "送审中心",
    color: "bg-[#629be9]",
    mark: "审",
  },
  {
    eyebrow: "MONITORING",
    title: "现场施工监控",
    color: "bg-[#129d73]",
    mark: "监",
  },
  {
    eyebrow: "LOGISTICS",
    title: "仓库",
    color: "bg-[#233046]",
    mark: "仓",
  },
  {
    eyebrow: "R&D",
    title: "设计院",
    color: "bg-[#7a5e86]",
    mark: "设",
  },
  {
    eyebrow: "FINANCE",
    title: "会计部",
    color: "bg-[#e68500]",
    mark: "财",
  },
  {
    eyebrow: "SYSTEM",
    title: "系统后台",
    color: "bg-[#8b8b8b]",
    mark: "系",
    href: "/engineering/system-backend",
  },
];

export default async function EngineeringHubPage() {
  const summary = await getEngineeringHubSummary();

  return (
    <div className="relative min-h-full overflow-hidden bg-slate-100">
      <div className="absolute inset-0">
        <div
          className="h-full w-full bg-cover bg-center opacity-30 blur-[2px] grayscale"
          style={{ backgroundImage: `url(${HUB_BG})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/70 to-slate-100/95" />
      </div>

      <div className="relative z-10 min-h-full xl:pr-[24rem]">
        <section className="px-8 pt-12 pb-20">
          <h1 className="text-4xl font-black tracking-tight text-[#2f63af] md:text-5xl">
            工程队基地 - 互动中心
          </h1>
          <div className="mt-3 flex items-center gap-3">
            <span className="h-5 w-5 rounded-full bg-emerald-500" />
            <span className="text-sm font-black uppercase tracking-[0.24em] text-slate-600 md:text-base">
              Base Alpha-01 Status: Active
            </span>
          </div>
        </section>

        <section className="px-8 pb-20">
          <div className="mx-auto max-w-[1180px]">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
              {hubCards.map((card) => {
                const content = (
                  <div
                    className={`${card.color} relative flex min-h-[284px] flex-col justify-end overflow-hidden p-8 text-white shadow-2xl transition duration-300 group-hover:-translate-y-1`}
                    style={{
                      clipPath:
                        "polygon(5% 0%, 100% 0%, 100% 90%, 95% 100%, 0% 100%, 0% 10%)",
                    }}
                  >
                    <span className="absolute top-4 right-4 text-5xl font-black text-white/18">
                      {card.mark}
                    </span>
                    <div className="relative z-10">
                      <div className="text-sm font-black tracking-[0.18em] text-white/80">
                        {card.eyebrow}
                      </div>
                      <div className="mt-4 text-3xl font-black tracking-tight">
                        {card.title}
                      </div>
                    </div>
                  </div>
                );

                if (!card.href) {
                  return (
                    <div
                      key={card.title}
                      className="group relative cursor-default transition-all duration-300 hover:-translate-y-3"
                    >
                      {content}
                    </div>
                  );
                }

                return (
                  <Link
                    key={card.title}
                    href={card.href}
                    className="group relative block transition-all duration-300 hover:-translate-y-3"
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <aside className="absolute top-0 right-0 hidden h-full w-[360px] flex-col gap-6 border-l border-slate-200 bg-white/95 p-6 shadow-2xl backdrop-blur-sm xl:flex">
        <div>
          <div className="text-3xl font-black text-slate-900">基地总览</div>
          <p className="mt-1 text-sm text-slate-500">
            从这里进入工程组、系统后台和其它协作模块。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-blue-50 p-4">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-800/70">
              协作空间
            </div>
            <div className="mt-2 text-3xl font-black text-blue-900">
              {summary.collaborationSpaceCount}
            </div>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-4">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-800/70">
              文档资产
            </div>
            <div className="mt-2 text-3xl font-black text-emerald-900">
              {summary.assetCount}
            </div>
          </div>
          <div className="rounded-2xl bg-slate-100 p-4">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
              工程成员
            </div>
            <div className="mt-2 text-3xl font-black text-slate-900">
              {summary.memberCount}
            </div>
          </div>
          <div className="rounded-2xl bg-amber-50 p-4">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-amber-800/70">
              工单真源
            </div>
            <div className="mt-2 text-3xl font-black text-amber-900">
              {summary.workOrderCount}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mb-4 text-xs font-black uppercase tracking-[0.24em] text-slate-400">
            系统入口
          </div>
          <div className="space-y-4">
            <Link
              href="/engineering/board"
              className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <div className="text-sm font-black text-slate-900">工程组总览</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                查看编队负荷、当前施工任务、人员状态和编队成员。
              </p>
            </Link>

            <Link
              href="/engineering/system-backend"
              className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <div className="text-sm font-black text-slate-900">
                工单 PostgreSQL 真源
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                查看已落库的工单、附表和系统后台壳页。
              </p>
            </Link>

            {summary.latestWorkOrders.length > 0 ? (
              summary.latestWorkOrders.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-black text-slate-900">
                      {item.title}
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      {item.stage}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {item.workOrderNo}
                  </div>
                  <div className="mt-3 text-xs font-medium text-slate-400">
                    预警状态：{item.warningStatus}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-sm leading-7 text-slate-500">
                当前还没有工单数据，可以先进入工程组或系统后台继续往下搭。
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
