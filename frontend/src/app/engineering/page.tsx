import Link from "next/link";
import type { ComponentType, SVGProps } from "react";

import { getEngineeringHubSummary } from "@/lib/engineering/server";

const HUB_BG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDUpEyUKLAmloKOtXMhv6vnfFyzYsKmpvE5ug2vYpiDjR2O7cLfu7VqWVUWTQ8QLxCR5CVcVXBTswrOKFFakk1TEbzKq5WWGjaDOnw88fvjh1v7OIDKw7VVjxb8Y9qmXVbcRwTIR2rDwACgzMdqtpcxxtVeYWy4xMdM9q0Zfzej3SlYW2ZpH5HFGbxvIzsGOusnMkRbqsUJuSLGgyVIVJhqQggCM_duVHxPU7ScaeNB1W9NafPi30ueO_v7rtUAeWZpPy0n1o6RPQ";

type IconProps = SVGProps<SVGSVGElement>;

function OfficeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 10h.01" />
      <path d="M9 14h.01" />
      <path d="M15 10h.01" />
      <path d="M15 14h.01" />
      <path d="M11 21v-4h2v4" />
    </svg>
  );
}

function OperationsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M14.5 4.5a3.2 3.2 0 0 0 4 4l-5.7 5.7-2.3-2.3z" />
      <path d="M3.5 20.5l5.8-5.8 2.3 2.3-5.8 5.8H3.5z" />
      <path d="M6.8 5.2l12 12" />
      <path d="M5 6.8l2.5-2.5 3.2 3.2-2.5 2.5z" />
      <path d="M15.5 16.5l2.2 2.2" />
    </svg>
  );
}

function AuditIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M9 3h6l5 5v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h2z" />
      <path d="M9 12l2 2 4-4" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function MonitorIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <circle cx="12" cy="11" r="3" />
    </svg>
  );
}

function WarehouseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M3 10l9-6 9 6" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-4h6v4" />
      <path d="M8 13h.01" />
      <path d="M16 13h.01" />
    </svg>
  );
}

function DesignIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 20l7-7" />
      <path d="M14 4l6 6" />
      <path d="M13 5l6 6" />
      <path d="M3 21l4-1 11-11-3-3L4 17l-1 4z" />
    </svg>
  );
}

function FinanceIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M7 10h.01" />
      <path d="M17 14h.01" />
    </svg>
  );
}

function SystemIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3l7 3v5c0 4.5-2.9 8.5-7 10-4.1-1.5-7-5.5-7-10V6l7-3z" />
      <path d="M9.5 12l1.7 1.7 3.3-3.7" />
    </svg>
  );
}

type HubCard = {
  eyebrow: string;
  title: string;
  color: string;
  icon: ComponentType<IconProps>;
  href?: string;
};

const hubCards: HubCard[] = [
  {
    eyebrow: "ADMIN",
    title: "办公室",
    color: "bg-[#3867ad]",
    icon: OfficeIcon,
  },
  {
    eyebrow: "OPERATIONS",
    title: "工程组",
    color: "bg-[#667087]",
    icon: OperationsIcon,
    href: "/engineering/board",
  },
  {
    eyebrow: "COMPLIANCE",
    title: "送审中心",
    color: "bg-[#629be9]",
    icon: AuditIcon,
  },
  {
    eyebrow: "MONITORING",
    title: "现场施工监控",
    color: "bg-[#129d73]",
    icon: MonitorIcon,
  },
  {
    eyebrow: "LOGISTICS",
    title: "仓库",
    color: "bg-[#233046]",
    icon: WarehouseIcon,
  },
  {
    eyebrow: "R&D",
    title: "设计院",
    color: "bg-[#7a5e86]",
    icon: DesignIcon,
  },
  {
    eyebrow: "FINANCE",
    title: "会计部",
    color: "bg-[#e68500]",
    icon: FinanceIcon,
  },
  {
    eyebrow: "SYSTEM",
    title: "系统后台",
    color: "bg-[#8b8b8b]",
    icon: SystemIcon,
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
                const CornerIcon = card.icon;
                const content = (
                  <div
                    className={`${card.color} relative flex min-h-[284px] flex-col justify-end overflow-hidden p-8 text-white shadow-2xl transition duration-300 group-hover:-translate-y-1`}
                    style={{
                      clipPath:
                        "polygon(5% 0%, 100% 0%, 100% 90%, 95% 100%, 0% 100%, 0% 10%)",
                    }}
                  >
                    <span className="absolute top-4 right-4 text-white/18">
                      <CornerIcon className="h-14 w-14 rotate-12" />
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
