"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AuthenticatedUser } from "@/lib/auth/types";

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
    href: "/docs/documents",
    label: "我的文档空间",
    icon: (
      <SidebarIcon>
        <path d="M7 3.75h7.5L19 8.25V20.25H7z" />
        <path d="M14.5 3.75v4.5H19" />
        <path d="M9.5 11.25h7" />
        <path d="M9.5 14.25h7" />
      </SidebarIcon>
    ),
  },
  {
    href: "/docs/trash",
    label: "回收站",
    icon: (
      <SidebarIcon>
        <path d="M5.75 7.5h12.5" />
        <path d="M9.25 7.5V5.75A1.75 1.75 0 0 1 11 4h2a1.75 1.75 0 0 1 1.75 1.75V7.5" />
        <path d="m7 7.5.75 10.25A2 2 0 0 0 9.75 19.5h4.5a2 2 0 0 0 2-1.75L17 7.5" />
        <path d="M10 11v4.25" />
        <path d="M14 11v4.25" />
      </SidebarIcon>
    ),
  },
  {
    href: "/docs/workspace",
    label: "合作空间",
    icon: (
      <SidebarIcon>
        <path d="M9 11a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 9 11Z" />
        <path d="M15.5 10a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" />
        <path d="M4.75 18c.55-2.05 2.5-3.5 4.75-3.5S13.7 15.95 14.25 18" />
        <path d="M13.25 17.25c.45-1.45 1.78-2.5 3.35-2.5 1.13 0 2.15.54 2.9 1.45" />
      </SidebarIcon>
    ),
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type DocsSidebarProps = {
  user: AuthenticatedUser;
};

export function DocsSidebar({ user }: DocsSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed top-16 left-0 z-30 flex h-[calc(100vh-4rem)] w-64 flex-col border-r border-slate-200 bg-slate-50 py-4">
      <div className="mb-8 px-6">
        <h2 className="text-lg font-black text-blue-600">文档空间</h2>
        <p className="mt-1 text-xs text-slate-500">管理您的文档、表格与归档文件</p>
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
        <div className="mb-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            当前身份
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-900">{user.name}</div>
          <div className="mt-1 text-xs text-slate-500">{user.roleLabel}</div>
          <div className="mt-1 text-xs text-slate-500">
            {user.teamLabel} / {user.workspaceLabel}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-lg text-blue-600">☁</span>
            <span className="text-xs font-semibold text-blue-600">存储空间</span>
          </div>
          <div className="mb-2 h-1.5 w-full rounded-full bg-slate-200">
            <div className="h-1.5 w-[65%] rounded-full bg-blue-600" />
          </div>
          <p className="text-[10px] text-slate-500">已使用 12.4 GB / 20 GB</p>
        </div>
      </div>
    </aside>
  );
}
