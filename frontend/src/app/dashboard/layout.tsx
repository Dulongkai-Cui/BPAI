import type { ReactNode } from "react";

import { DashboardTopbar } from "@/components/dashboard/dashboard-topbar";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireCurrentUser();

  return (
    <div className="h-screen overflow-hidden bg-slate-100 text-slate-900">
      <DashboardTopbar user={user} />
      <DashboardSidebar />
      <main className="ml-64 mt-16 h-[calc(100vh-4rem)] overflow-hidden">
        {children}
      </main>
    </div>
  );
}
