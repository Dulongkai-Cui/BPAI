"use client";

import type { ReactNode } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type { AuthenticatedUser } from "@/lib/auth/types";

export type WorkOrderSidebarView =
  | "all"
  | "mine"
  | "team"
  | "missing"
  | "warning"
  | "archived";

type WorkOrdersSidebarProps = {
  user: AuthenticatedUser;
  counts: Record<WorkOrderSidebarView, number>;
};

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

const navItems: Array<{
  view: WorkOrderSidebarView;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    view: "all",
    label: "全部工单",
    description: "先看全局盘子",
    icon: (
      <SidebarIcon>
        <rect x="4.5" y="5" width="15" height="14" rx="2" />
        <path d="M8 9h8" />
        <path d="M8 12h8" />
        <path d="M8 15h5" />
      </SidebarIcon>
    ),
  },
  {
    view: "mine",
    label: "我需要处理的工单",
    description: "个人待办工作台",
    icon: (
      <SidebarIcon>
        <path d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M6.5 18.25c.75-2.35 2.95-4 5.5-4s4.75 1.65 5.5 4" />
      </SidebarIcon>
    ),
  },
  {
    view: "team",
    label: "团队正在推进",
    description: "看今天还在流转的活",
    icon: (
      <SidebarIcon>
        <path d="M8.75 10.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" />
        <path d="M15.25 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
        <path d="M4.75 18c.5-1.95 2.25-3.25 4.5-3.25 1.3 0 2.45.45 3.3 1.25" />
        <path d="M12.75 18c.4-1.5 1.75-2.55 3.35-2.55 1.1 0 2.1.5 2.9 1.4" />
      </SidebarIcon>
    ),
  },
  {
    view: "missing",
    label: "缺失项 / 补录",
    description: "先补齐不完整材料",
    icon: (
      <SidebarIcon>
        <path d="M7 4.75h7.25L18 8.5v10.75H7z" />
        <path d="M14.25 4.75V8.5H18" />
        <path d="M11.75 11v4.75" />
        <path d="M9.5 13.25h4.5" />
      </SidebarIcon>
    ),
  },
  {
    view: "warning",
    label: "异常 / 预警",
    description: "把会拖进度的事拉出来",
    icon: (
      <SidebarIcon>
        <path d="m12 4.75 7 13H5z" />
        <path d="M12 9.5v3.75" />
        <path d="M12 16.25h.01" />
      </SidebarIcon>
    ),
  },
  {
    view: "archived",
    label: "已完成 / 归档",
    description: "看闭环与归档结果",
    icon: (
      <SidebarIcon>
        <path d="M5.5 7.25h13v10.5a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z" />
        <path d="M4.75 7.25h14.5V5.5a1.25 1.25 0 0 0-1.25-1.25H6A1.25 1.25 0 0 0 4.75 5.5z" />
        <path d="M9.5 12.25h5" />
      </SidebarIcon>
    ),
  },
];

function viewHref(view: WorkOrderSidebarView) {
  if (view === "all") {
    return "/work-orders";
  }

  return `/work-orders?view=${view}`;
}

function normalizeView(value: string | null): WorkOrderSidebarView {
  if (
    value === "mine" ||
    value === "team" ||
    value === "missing" ||
    value === "warning" ||
    value === "archived"
  ) {
    return value;
  }

  return "all";
}

export function WorkOrdersSidebar({
  user,
  counts,
}: WorkOrdersSidebarProps) {
  const searchParams = useSearchParams();
  const currentView = normalizeView(searchParams.get("view"));

  return (
    <aside className="fixed top-16 left-0 z-30 flex h-[calc(100vh-4rem)] w-64 flex-col border-r border-slate-200 bg-slate-50 py-4">
      <div className="mb-8 px-6">
        <h2 className="text-lg font-black text-blue-600">工单中心</h2>
        <p className="mt-1 text-xs text-slate-500">工单管理与 AI 助手</p>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const active = item.view === currentView;

          return (
            <Link
              key={item.view}
              href={viewHref(item.view)}
              className={
                active
                  ? "flex translate-x-1 items-start gap-3 border-r-4 border-blue-600 bg-blue-50 px-3 py-2.5 text-blue-700 transition-transform"
                  : "flex items-start gap-3 px-3 py-2.5 text-slate-600 transition-all hover:bg-slate-100 hover:text-blue-700"
              }
            >
              <span className="mt-0.5 shrink-0">{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{item.label}</span>
                  <span
                    className={
                      active
                        ? "rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700"
                        : "rounded-full bg-slate-200/70 px-2.5 py-1 text-[11px] font-semibold text-slate-500"
                    }
                  >
                    {counts[item.view]}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-current/70">
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-4">
        <div className="mb-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            当前身份
          </div>
          <div className="mt-2 text-sm font-bold text-slate-900">{user.name}</div>
          <div className="mt-1 text-xs text-slate-500">{user.roleLabel}</div>
          <div className="mt-1 text-xs text-slate-500">
            {user.teamLabel} / {user.workspaceLabel}
          </div>
        </div>

        <Link
          href="/engineering"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-blue-700"
        >
          <SidebarIcon>
            <path d="M9.25 6.25 4.75 10.75l4.5 4.5" />
            <path d="M5.25 10.75H19.25" />
          </SidebarIcon>
          <span>返回互动中心</span>
        </Link>
      </div>
    </aside>
  );
}
