import type { ReactNode } from "react";

import { EngineeringTopbar } from "@/components/engineering/engineering-topbar";
import { requireCurrentUser } from "@/lib/auth/server";
import {
  WorkOrdersSidebar,
  type WorkOrderSidebarView,
} from "@/components/work-order/work-orders-sidebar";
import { getWorkOrderDashboardData } from "@/lib/work-order/server";

function isClosedLike(item: {
  archivedAt: Date | null;
  status: string;
}) {
  return (
    item.archivedAt !== null ||
    item.status === "completed" ||
    item.status === "archived"
  );
}

export default async function WorkOrdersLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireCurrentUser();
  const dashboard = await getWorkOrderDashboardData(user.id);

  const allWorkOrders = dashboard.workOrders;
  const counts: Record<WorkOrderSidebarView, number> = {
    all: allWorkOrders.length,
    mine: allWorkOrders.filter(
      (item) =>
        item.currentResponsibleUserId === user.id && !isClosedLike(item),
    ).length,
    team: allWorkOrders.filter((item) => !isClosedLike(item)).length,
    missing: allWorkOrders.filter(
      (item) =>
        !isClosedLike(item) &&
        (item.missingItemCount > 0 || item.blockingItemCount > 0),
    ).length,
    warning: allWorkOrders.filter(
      (item) =>
        !isClosedLike(item) &&
        (item.warningStatus === "warning" || item.warningStatus === "critical"),
    ).length,
    archived: allWorkOrders.filter((item) => isClosedLike(item)).length,
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-100 text-slate-900">
      <EngineeringTopbar user={user} />
      <WorkOrdersSidebar user={user} counts={counts} />
      <main className="ml-64 mt-16 h-[calc(100vh-4rem)] overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
