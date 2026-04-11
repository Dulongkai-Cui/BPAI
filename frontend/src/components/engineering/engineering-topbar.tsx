"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import type { AuthenticatedUser } from "@/lib/auth/types";

const topNavItems = [
  { href: "/bp-ask", label: "BP问问" },
  { href: "/dashboard", label: "总览" },
  { href: "/engineering", label: "工程队" },
  { href: "/work-orders", label: "工单" },
  { href: "/docs/documents", label: "文档档案室" },
  { href: "/ai-dorm", label: "AI宿舍" },
];

type EngineeringTopbarProps = {
  user: AuthenticatedUser;
};

export function EngineeringTopbar({ user }: EngineeringTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <header className="fixed top-0 left-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="text-xl font-bold tracking-tight text-blue-700">
          我的BPAI
        </span>
        <nav className="ml-8 hidden items-center space-x-6 text-sm font-medium md:flex">
          {topNavItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "border-b-2 border-blue-600 pb-1 text-blue-600"
                    : "text-slate-600 transition-colors hover:text-blue-500"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative hidden sm:block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            搜
          </span>
          <input
            type="text"
            placeholder="搜索基地、工单或模块..."
            className="w-64 rounded-full border border-slate-200 bg-slate-50 py-1.5 pr-4 pl-10 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="hidden items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 md:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              {user.name}
            </div>
            <div className="truncate text-xs text-slate-500">
              {user.roleLabel}
            </div>
          </div>
        </div>

        <button className="rounded-full p-2 text-slate-600 transition hover:bg-slate-50">
          通知
        </button>
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoggingOut ? "退出中..." : "退出"}
        </button>
      </div>
    </header>
  );
}
