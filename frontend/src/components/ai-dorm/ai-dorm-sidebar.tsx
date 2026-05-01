"use client";

import type { ReactNode } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AuthenticatedUser } from "@/lib/auth/types";

type AiDormSidebarProps = {
  user: AuthenticatedUser;
  counts: {
    workflows: number;
    skills: number;
    agents: number;
    tasks: number;
  };
};

type CountKey = keyof AiDormSidebarProps["counts"];

type SidebarItem = {
  href: string;
  label: string;
  description: string;
  countKey?: CountKey;
  count?: number;
  icon: ReactNode;
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

const coreItems: SidebarItem[] = [
  {
    href: "/ai-dorm/workflows",
    label: "工作流工坊",
    description: "查看流程、节点与配置",
    countKey: "workflows" as const,
    icon: (
      <SidebarIcon>
        <path d="M5.5 6h5v5h-5z" />
        <path d="M13.5 6h5v5h-5z" />
        <path d="M9.5 11v2.5" />
        <path d="M16 11v2.5" />
        <path d="M9.5 13.5H16" />
        <path d="M9.5 16.5h5v5h-5z" />
      </SidebarIcon>
    ),
  },
  {
    href: "/ai-dorm/skills",
    label: "Skill 仓库",
    description: "查看上传、模板与草案",
    countKey: "skills" as const,
    icon: (
      <SidebarIcon>
        <path d="M6 5.75h12v12.5H6z" />
        <path d="M9 9.25h6" />
        <path d="M9 12.25h6" />
        <path d="M9 15.25h4" />
      </SidebarIcon>
    ),
  },
  {
    href: "/ai-dorm/agents",
    label: "AI员工",
    description: "查看列表、状态与配置",
    countKey: "agents" as const,
    icon: (
      <SidebarIcon>
        <path d="M12 10.75a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" />
        <path d="M6.25 18.25c.8-2.4 3.05-4 5.75-4s4.95 1.6 5.75 4" />
        <path d="M18.5 8.25h2" />
        <path d="M19.5 7.25v2" />
      </SidebarIcon>
    ),
  },
];

const secondaryItems: SidebarItem[] = [
  {
    href: "/ai-dorm/tool-registry",
    label: "Tool Registry",
    description: "查看 MCP-lite 工具与资源",
    count: 10,
    icon: (
      <SidebarIcon>
        <path d="M6 7.5h12" />
        <path d="M6 12h12" />
        <path d="M6 16.5h12" />
        <path d="M8.25 5.75v3.5" />
        <path d="M15.75 10.25v3.5" />
        <path d="M10.5 14.75v3.5" />
      </SidebarIcon>
    ),
  },
  {
    href: "/ai-dorm/tasks",
    label: "任务收件箱",
    description: "查看 execution_tasks / execution_results",
    countKey: "tasks" as const,
    icon: (
      <SidebarIcon>
        <path d="M7.5 6h9" />
        <path d="M7.5 11h9" />
        <path d="M7.5 16h5.5" />
        <path d="M4.75 6h.01" />
        <path d="M4.75 11h.01" />
        <path d="M4.75 16h.01" />
      </SidebarIcon>
    ),
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({
  href,
  label,
  description,
  count,
  active,
  icon,
}: {
  href: string;
  label: string;
  description: string;
  count: number;
  active: boolean;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "min-w-[16rem] rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-700 md:min-w-0 md:translate-x-1 md:rounded-none md:border-0 md:border-r-4 md:border-blue-600 md:bg-blue-50 md:px-3 md:py-2.5"
          : "min-w-[16rem] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-600 transition hover:border-blue-200 hover:text-blue-700 md:min-w-0 md:rounded-none md:border-0 md:bg-transparent md:px-3 md:py-2.5 md:hover:bg-slate-100"
      }
    >
      <span className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{label}</span>
            <span
              className={
                active
                  ? "rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700"
                  : "rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500"
              }
            >
              {count}
            </span>
          </span>
          <span className="mt-1 block text-xs leading-5 text-current/75">
            {description}
          </span>
        </span>
      </span>
    </Link>
  );
}

export function AiDormSidebar({ user, counts }: AiDormSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="border-b border-slate-200 bg-slate-50 md:fixed md:top-16 md:left-0 md:z-30 md:flex md:h-[calc(100vh-4rem)] md:w-72 md:flex-col md:border-r md:border-b-0">
      <div className="px-4 pt-4 md:px-6 md:pt-5">
        <Link href="/ai-dorm" className="block">
          <div className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">
            Three Core Boards
          </div>
          <h2 className="mt-3 text-lg font-black text-blue-600">AI宿舍</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">工作流、Skill、AI员工</p>
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto px-4 py-4 md:flex-1 md:flex-col md:overflow-visible md:px-3">
        <div className="flex gap-3 md:flex-col md:gap-1">
          {coreItems.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              description={item.description}
              count={item.countKey ? counts[item.countKey] : (item.count ?? 0)}
              active={isActive(pathname, item.href)}
              icon={item.icon}
            />
          ))}
        </div>

        <div className="min-w-[16rem] rounded-2xl border border-dashed border-slate-300 bg-white/80 p-4 md:min-w-0 md:rounded-none md:border-0 md:border-t md:border-dashed md:bg-transparent md:px-3 md:pt-4 md:pb-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Secondary Lane
          </div>
          <div className="mt-3 space-y-1">
            {secondaryItems.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                description={item.description}
                count={item.countKey ? counts[item.countKey] : (item.count ?? 0)}
                active={isActive(pathname, item.href)}
                icon={item.icon}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="hidden px-4 pb-4 md:mt-auto md:block">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            资源位
          </div>
          <div className="mt-2 text-sm font-bold text-slate-900">资源与账单</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">后续放到设置</div>
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            当前身份
          </div>
          <div className="mt-2 text-sm font-bold text-slate-900">{user.name}</div>
          <div className="mt-1 text-xs text-slate-500">{user.roleLabel}</div>
          <div className="mt-1 text-xs text-slate-500">{user.teamLabel}</div>
        </div>
      </div>
    </aside>
  );
}
