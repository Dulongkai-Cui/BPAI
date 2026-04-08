"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function SidebarIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-5 w-5 items-center justify-center text-current">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        {children}
      </svg>
    </span>
  );
}

const navItems = [
  {
    href: "/dashboard",
    label: "全城实时地图",
    icon: (
      <SidebarIcon>
        <path d="M3.75 6.5 8 4.5l4 2 4-2 4.25 2v11L16 19.5l-4-2-4 2-4.25-2Z" />
        <path d="M8 4.5v13" />
        <path d="M12 6.5v11" />
        <path d="M16 4.5v13" />
      </SidebarIcon>
    ),
  },
  {
    href: "/dashboard/team-status",
    label: "工程队状态",
    icon: (
      <SidebarIcon>
        <path d="M8.75 11a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8.75 11Z" />
        <path d="M15.75 10a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" />
        <path d="M4.75 18c.5-2 2.35-3.5 4.5-3.5s4 1.5 4.5 3.5" />
        <path d="M13 17.5c.35-1.35 1.6-2.35 3.05-2.35 1.05 0 2 .5 2.7 1.35" />
      </SidebarIcon>
    ),
  },
  {
    href: "/dashboard/alerts",
    label: "预警中心",
    icon: (
      <SidebarIcon>
        <path d="M12 4.5 20 18.5H4Z" />
        <path d="M12 9v4.25" />
        <path d="M12 16h.01" />
      </SidebarIcon>
    ),
  },
  {
    href: "/dashboard/settings",
    label: "设置",
    icon: (
      <SidebarIcon>
        <path d="M12 8.25A3.75 3.75 0 1 0 12 15.75A3.75 3.75 0 1 0 12 8.25Z" />
        <path d="M19.5 12a7.45 7.45 0 0 0-.1-1.2l2-1.55-2-3.46-2.4.85a7.7 7.7 0 0 0-2.05-1.2L14.5 3h-4.99l-.45 2.44a7.7 7.7 0 0 0-2.06 1.2l-2.39-.85-2 3.46 2 1.55a7.7 7.7 0 0 0 0 2.4l-2 1.55 2 3.46 2.39-.85a7.7 7.7 0 0 0 2.06 1.2l.45 2.44h5l.44-2.44a7.7 7.7 0 0 0 2.05-1.2l2.4.85 2-3.46-2-1.55c.07-.4.1-.8.1-1.2Z" />
      </SidebarIcon>
    ),
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-16 z-30 flex h-[calc(100vh-4rem)] w-64 flex-col border-r border-slate-200 bg-slate-50 py-4">
      <div className="mb-8 px-6">
        <h2 className="text-lg font-black text-blue-600">总览</h2>
        <p className="mt-1 text-xs text-slate-500">全城地图与实时态势</p>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? "flex translate-x-1 items-center gap-3 border-r-4 border-blue-600 bg-blue-50 px-3 py-2.5 font-semibold text-blue-700 transition-transform"
                  : "flex items-center gap-3 px-3 py-2.5 text-slate-600 transition-all hover:bg-slate-100 hover:text-blue-600"
              }
            >
              {item.icon}
              <span className="text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">地图引擎状态</span>
            <span className="text-xs font-bold text-emerald-600">开源底图</span>
          </div>
          <div className="mb-2 h-1.5 w-full rounded-full bg-slate-200">
            <div className="h-1.5 w-[72%] rounded-full bg-blue-600" />
          </div>
          <p className="text-[10px] text-slate-500">
            当前总览页已切到开源底图方案，后续继续叠加工程队、工单和预警图层。
          </p>
        </div>
      </div>
    </aside>
  );
}
