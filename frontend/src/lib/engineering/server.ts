import "server-only";

import { desc, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import {
  collaborationSpaces,
  contentAssets,
  engineeringMembers,
  engineeringSquads,
  workOrders,
} from "@/lib/db/schema";
import {
  ensureEngineeringSeedData,
  listEngineeringMembers,
  listEngineeringSquads,
} from "@/lib/engineering-team/server";
import { getWorkOrderDashboardData } from "@/lib/work-order/server";

function countExpr() {
  return sql<number>`count(*)::int`;
}

function formatStageLabel(stage: string) {
  const labels: Record<string, string> = {
    source_intake: "来源",
    registration: "登记",
    dispatch: "派单",
    warning: "预警",
    field_construction: "施工",
    return_sheet: "回单",
    drawing_delivery: "图纸",
    resource_entry: "录资",
    resource_audit: "稽核",
    design_package: "出设",
  };

  return labels[stage] ?? stage;
}

function formatPriorityLabel(priority: string) {
  const labels: Record<string, string> = {
    low: "低",
    normal: "普通",
    high: "高",
    urgent: "紧急",
  };

  return labels[priority] ?? priority;
}

function formatMemberStatusLabel(status: string) {
  const labels: Record<string, string> = {
    available: "可调度",
    assigned: "已分配",
    on_site: "现场中",
    leave: "请假",
    inactive: "停用",
  };

  return labels[status] ?? status;
}

function formatSquadStatusLabel(status: string) {
  const labels: Record<string, string> = {
    standby: "待命",
    assigned: "已分配",
    in_transit: "路途中",
    on_site: "现场中",
    paused: "暂停",
    archived: "归档",
  };

  return labels[status] ?? status;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getSquadLoadTone(loadPercent: number) {
  if (loadPercent >= 85) {
    return {
      tone: "red",
      label: "超负荷",
      barClass: "bg-rose-500",
      textClass: "text-rose-600",
      bgClass: "bg-rose-50",
    };
  }

  if (loadPercent >= 60) {
    return {
      tone: "amber",
      label: "繁忙",
      barClass: "bg-amber-500",
      textClass: "text-amber-600",
      bgClass: "bg-amber-50",
    };
  }

  if (loadPercent >= 35) {
    return {
      tone: "blue",
      label: "健康",
      barClass: "bg-blue-500",
      textClass: "text-blue-600",
      bgClass: "bg-blue-50",
    };
  }

  return {
    tone: "emerald",
    label: "待命",
    barClass: "bg-emerald-500",
    textClass: "text-emerald-600",
    bgClass: "bg-emerald-50",
  };
}

export async function getEngineeringHubSummary() {
  const db = getDb();
  await ensureEngineeringSeedData();

  const [
    memberCountRows,
    squadCountRows,
    assetCountRows,
    workOrderCountRows,
    collaborationSpaceCountRows,
    latestWorkOrders,
  ] = await Promise.all([
    db.select({ count: countExpr() }).from(engineeringMembers),
    db
      .select({ count: countExpr() })
      .from(engineeringSquads)
      .where(isNull(engineeringSquads.archivedAt)),
    db.select({ count: countExpr() }).from(contentAssets),
    db.select({ count: countExpr() }).from(workOrders),
    db
      .select({ count: countExpr() })
      .from(collaborationSpaces)
      .where(isNull(collaborationSpaces.dissolvedAt)),
    db
      .select({
        id: workOrders.id,
        workOrderNo: workOrders.workOrderNo,
        title: workOrders.title,
        stage: workOrders.stage,
        warningStatus: workOrders.warningStatus,
        updatedAt: workOrders.updatedAt,
      })
      .from(workOrders)
      .orderBy(desc(workOrders.updatedAt))
      .limit(5),
  ]);

  return {
    userCount: memberCountRows[0]?.count ?? 0,
    memberCount: memberCountRows[0]?.count ?? 0,
    squadCount: squadCountRows[0]?.count ?? 0,
    assetCount: assetCountRows[0]?.count ?? 0,
    workOrderCount: workOrderCountRows[0]?.count ?? 0,
    collaborationSpaceCount: collaborationSpaceCountRows[0]?.count ?? 0,
    latestWorkOrders,
  };
}

export async function getSystemBackendSummary() {
  const db = getDb();

  const [
    totalWorkOrdersRows,
    activeWorkOrdersRows,
    warningWorkOrdersRows,
    latestWorkOrders,
  ] = await Promise.all([
    db.select({ count: countExpr() }).from(workOrders),
    db
      .select({ count: countExpr() })
      .from(workOrders)
      .where(isNull(workOrders.archivedAt)),
    db
      .select({ count: countExpr() })
      .from(workOrders)
      .where(eq(workOrders.warningStatus, "warning")),
    db
      .select({
        id: workOrders.id,
        workOrderNo: workOrders.workOrderNo,
        title: workOrders.title,
        stage: workOrders.stage,
        status: workOrders.status,
        priority: workOrders.priority,
        updatedAt: workOrders.updatedAt,
      })
      .from(workOrders)
      .orderBy(desc(workOrders.updatedAt))
      .limit(8),
  ]);

  return {
    totalWorkOrders: totalWorkOrdersRows[0]?.count ?? 0,
    activeWorkOrders: activeWorkOrdersRows[0]?.count ?? 0,
    warningWorkOrders: warningWorkOrdersRows[0]?.count ?? 0,
    workOrderTableCount: 6,
    latestWorkOrders,
  };
}

export async function getEngineeringBoardData(userId: string) {
  await ensureEngineeringSeedData();

  const [members, squads, dashboard] = await Promise.all([
    listEngineeringMembers(),
    listEngineeringSquads(),
    getWorkOrderDashboardData(userId),
  ]);

  const memberStatusCounts = {
    available: members.filter((member) => member.status === "available").length,
    assigned: members.filter((member) => member.status === "assigned").length,
    onSite: members.filter((member) => member.status === "on_site").length,
    leave: members.filter((member) => member.status === "leave").length,
  };

  const activeTasks = [...dashboard.workOrders]
    .filter((item) => item.archivedAt === null && item.status !== "archived")
    .sort((left, right) => {
      const leftWarning = left.stage === "warning" ? 1 : 0;
      const rightWarning = right.stage === "warning" ? 1 : 0;
      if (leftWarning !== rightWarning) {
        return rightWarning - leftWarning;
      }

      const leftUpdated = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
      const rightUpdated = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
      return rightUpdated - leftUpdated;
    });

  const squadCards = squads.map((squad) => {
    const assignedMembers = squad.members.filter((member) =>
      ["assigned", "on_site"].includes(member.status),
    ).length;
    const onSiteMembers = squad.members.filter(
      (member) => member.status === "on_site",
    ).length;
    const linkedTasks = activeTasks.filter(
      (task) =>
        task.assignedCrewSquadId === squad.id ||
        task.assignedCrewTeamLabel === squad.name,
    );

    const loadPercent = clamp(
      linkedTasks.length * 28 + assignedMembers * 7 + onSiteMembers * 10,
      linkedTasks.length > 0 ? 18 : 8,
      98,
    );
    const load = getSquadLoadTone(loadPercent);

    return {
      ...squad,
      loadPercent,
      loadLabel: load.label,
      loadTone: load.tone,
      loadBarClass: load.barClass,
      loadTextClass: load.textClass,
      loadBgClass: load.bgClass,
      assignedMemberCount: assignedMembers,
      onSiteMemberCount: onSiteMembers,
      linkedTasks: linkedTasks.slice(0, 3).map((task) => ({
        id: task.id,
        workOrderNo: task.workOrderNo,
        title: task.title,
        stageLabel: formatStageLabel(task.stage),
        priorityLabel: formatPriorityLabel(task.priority),
      })),
    };
  });

  const recentTasks = activeTasks.slice(0, 10).map((task) => ({
    id: task.id,
    workOrderNo: task.workOrderNo,
    title: task.title,
    projectName: task.projectName,
    siteName: task.siteName,
    stageLabel: formatStageLabel(task.stage),
    priorityLabel: formatPriorityLabel(task.priority),
    warningStatus: task.warningStatus,
    assignedCrewTeamLabel: task.assignedCrewTeamLabel || "待编队",
    assignedCrewLeaderName: task.assignedCrewLeaderName || "待指定",
    assignedCrewMemberCount: task.assignedCrewMemberCount ?? 0,
    materialCompleteness: task.materialCompleteness,
    updatedAt: task.updatedAt,
  }));

  const roster = members.map((member) => ({
    ...member,
    statusLabel: formatMemberStatusLabel(member.status),
  }));

  return {
    summary: {
      memberCount: members.length,
      squadCount: squads.length,
      activeTaskCount: activeTasks.length,
      warningTaskCount: activeTasks.filter((task) => task.stage === "warning")
        .length,
      availableMemberCount: memberStatusCounts.available,
      assignedMemberCount:
        memberStatusCounts.assigned + memberStatusCounts.onSite,
      onSiteMemberCount: memberStatusCounts.onSite,
    },
    squadCards: squadCards.map((item) => ({
      ...item,
      statusLabel: formatSquadStatusLabel(item.status),
    })),
    recentTasks,
    roster,
    unassignedMembers: roster.filter((member) => !member.currentSquadId),
  };
}
