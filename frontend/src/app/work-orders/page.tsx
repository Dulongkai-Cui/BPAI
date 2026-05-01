import type { ReactNode } from "react";
import Link from "next/link";

import { requireCurrentUser } from "@/lib/auth/server";
import { CreateWorkOrderButton } from "@/components/work-order/create-work-order-button";
import { WorkOrderCardActions } from "@/components/work-order/work-order-card-actions";
import { WorkOrderStageStrip } from "@/components/work-order/work-order-stage-strip";
import type { WorkOrderSidebarView } from "@/components/work-order/work-orders-sidebar";
import {
  getWorkOrderCreationOptions,
  getWorkOrderDashboardData,
} from "@/lib/work-order/server";

type DashboardData = Awaited<ReturnType<typeof getWorkOrderDashboardData>>;
type WorkOrderItem = DashboardData["workOrders"][number];
type CreationOptions = Awaited<ReturnType<typeof getWorkOrderCreationOptions>>;

function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    source_intake: "来源",
    registration: "工单登记",
    dispatch: "派单",
    warning: "预警",
    field_construction: "现场施工",
    return_sheet: "回单",
    drawing_delivery: "竣工图纸交付",
    resource_entry: "录资源",
    resource_audit: "资源稽核",
    design_package: "打包出设计",
  };

  return labels[stage] ?? stage;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    open: "待启动",
    in_progress: "进行中",
    waiting: "待处理",
    blocked: "有阻塞",
    completed: "已完成",
    cancelled: "已取消",
    archived: "已归档",
  };

  return labels[status] ?? status;
}

function normalizeView(value: string | undefined): WorkOrderSidebarView {
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

function clampPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatShortDate(date: Date | null | undefined) {
  if (!date) {
    return "未更新";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function firstChar(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "?";
}

function badgeMeta(item: WorkOrderItem) {
  if (isClosedLike(item)) {
    return {
      label: "已归档",
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  if (item.stage === "warning" || item.status === "blocked") {
    return {
      label: "流转中",
      className: "bg-violet-100 text-violet-700",
    };
  }

  if (item.stage === "return_sheet") {
    return {
      label: "待验收",
      className: "bg-amber-100 text-amber-700",
    };
  }

  if (item.stage === "field_construction") {
    return {
      label: "施工中",
      className: "bg-blue-100 text-blue-700",
    };
  }

  if (item.stage === "dispatch") {
    return {
      label: "待派单",
      className: "bg-red-100 text-red-700",
    };
  }

  if (item.stage === "drawing_delivery") {
    return {
      label: "图纸交付",
      className: "bg-orange-100 text-orange-700",
    };
  }

  if (item.stage === "resource_entry" || item.stage === "resource_audit") {
    return {
      label: "资源处理中",
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  return {
    label: statusLabel(item.status),
    className: "bg-slate-100 text-slate-600",
  };
}

function progressMeta(item: WorkOrderItem) {
  const value = clampPercent(item.materialCompleteness);

  if (item.stage === "field_construction") {
    return {
      label: "施工进度",
      value,
      barClassName: "bg-blue-600",
      valueClassName: "text-blue-600",
      iconClassName: "bg-blue-100 text-blue-700",
    };
  }

  if (item.stage === "return_sheet") {
    return {
      label: "验收准备度",
      value,
      barClassName: "bg-amber-500",
      valueClassName: "text-amber-500",
      iconClassName: "bg-pink-100 text-pink-700",
    };
  }

  if (item.stage === "drawing_delivery") {
    return {
      label: "图纸交付进度",
      value,
      barClassName: "bg-orange-500",
      valueClassName: "text-orange-500",
      iconClassName: "bg-pink-100 text-pink-700",
    };
  }

  if (item.stage === "resource_entry") {
    return {
      label: "录资源进度",
      value,
      barClassName: "bg-emerald-500",
      valueClassName: "text-emerald-600",
      iconClassName: "bg-emerald-100 text-emerald-700",
    };
  }

  if (item.stage === "dispatch") {
    return {
      label: "派单准备度",
      value,
      barClassName: "bg-red-500",
      valueClassName: "text-red-500",
      iconClassName: "bg-red-100 text-red-700",
    };
  }

  if (item.stage === "warning") {
    return {
      label: "材料补齐度",
      value,
      barClassName: "bg-violet-500",
      valueClassName: "text-violet-600",
      iconClassName: "bg-violet-100 text-violet-700",
    };
  }

  if (isClosedLike(item)) {
    return {
      label: "归档完成度",
      value,
      barClassName: "bg-emerald-500",
      valueClassName: "text-emerald-600",
      iconClassName: "bg-emerald-100 text-emerald-700",
    };
  }

  return {
    label: "推进进度",
    value,
    barClassName: "bg-slate-500",
    valueClassName: "text-slate-600",
    iconClassName: "bg-slate-100 text-slate-700",
  };
}

function actionLabel(item: WorkOrderItem) {
  void item;
  return "查看详情";
}

function workOrderHref(item: WorkOrderItem) {
  return `/work-orders/${item.id}`;
}

function noteMeta(item: WorkOrderItem) {
  if (item.warningStatus === "critical" || item.blockingItemCount > 0) {
    return {
      tone: "text-red-600",
      dot: "bg-red-500",
      text: `当前有 ${item.blockingItemCount} 项阻塞待处理`,
    };
  }

  if (item.warningStatus === "warning") {
    return {
      tone: "text-amber-600",
      dot: "bg-amber-500",
      text: "当前存在预警，建议优先跟进",
    };
  }

  if (isClosedLike(item) || item.warningStatus === "resolved") {
    return {
      tone: "text-emerald-600",
      dot: "bg-emerald-500",
      text: "当前工单已完成闭环",
    };
  }

  if (item.missingItemCount > 0) {
    return {
      tone: "text-amber-600",
      dot: "bg-amber-500",
      text: `待补录 ${item.missingItemCount} 项材料`,
    };
  }

  return {
    tone: "text-slate-500",
    dot: "bg-slate-300",
    text: item.currentResponsibleTeam || "当前按计划推进中",
  };
}

function crewSummary(item: WorkOrderItem) {
  if (!item.assignedCrewTeamLabel) {
    return "";
  }

  const parts = [item.assignedCrewTeamLabel];

  if (item.assignedCrewLeaderName) {
    parts.push(item.assignedCrewLeaderName);
  }

  if (item.assignedCrewMemberCount > 0) {
    parts.push(`${item.assignedCrewMemberCount} 人`);
  }

  return parts.join(" · ");
}

function isWarningAlert(item: WorkOrderItem) {
  return item.warningStatus === "warning" || item.warningStatus === "critical";
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
      <path
        d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 18.25c.75-2.35 2.95-4 5.5-4s4.75 1.65 5.5 4"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
      <rect
        x="5.25"
        y="6.5"
        width="13.5"
        height="12.25"
        rx="2"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 4.75v3"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.5 4.75v3"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.25 10.5h13.5"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ParticipantBubbles({ item }: { item: WorkOrderItem }) {
  const bubbles = [
    firstChar(item.currentResponsibleUserName),
    firstChar(item.currentResponsibleTeam),
  ];

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {bubbles.map((value, index) => (
          <div
            key={`${value}-${index}`}
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-black text-slate-600 shadow-sm"
          >
            {value}
          </div>
        ))}
        {item.missingItemCount > 0 ? (
          <div className="flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white bg-slate-100 px-2 text-[10px] font-black text-slate-500 shadow-sm">
            +{item.missingItemCount}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SectionPill({
  active,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-blue-100 px-4 py-1.5 text-xs font-semibold text-blue-700"
          : "rounded-full bg-white px-4 py-1.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200"
      }
    >
      {children}
    </span>
  );
}

function StandardWorkOrderCard({
  item,
  creationOptions,
}: {
  item: WorkOrderItem;
  creationOptions: CreationOptions;
}) {
  const badge = badgeMeta(item);
  const progress = progressMeta(item);
  const note = noteMeta(item);

  return (
    <article className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${badge.className}`}
            >
              {badge.label}
            </span>
            <span className="font-mono text-xs font-semibold text-slate-400">
              #{item.workOrderNo}
            </span>
          </div>
          <h3 className="text-[1.45rem] font-black tracking-tight text-slate-950">
            {item.title}
          </h3>
        </div>
        <WorkOrderCardActions
          item={item}
          responsibleUsers={creationOptions.responsibleUsers}
          collaborationSpaces={creationOptions.collaborationSpaces}
        />
      </div>

      <div className="mt-3">
        <WorkOrderStageStrip stage={item.stage} />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3 text-[13px]">
          <span className="font-semibold text-slate-500">{progress.label}</span>
          <span className={`text-[1.75rem] font-black ${progress.valueClassName}`}>
            {progress.value}%
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${progress.barClassName}`}
            style={{ width: `${progress.value}%` }}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 border-b border-slate-100 pb-4 sm:grid-cols-2">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-700">
            <PersonIcon />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">当前节点负责人</div>
            <div className="mt-1 text-[1.2rem] font-black tracking-tight text-slate-900">
              {item.currentResponsibleUserName ?? "未分配"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full ${progress.iconClassName}`}
          >
            <CalendarIcon />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">最近更新</div>
            <div className="mt-1 text-[1.2rem] font-black tracking-tight text-slate-900">
              {formatShortDate(item.updatedAt)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-4">
            <ParticipantBubbles item={item} />
            <div className={`min-w-0 text-sm font-semibold ${note.tone}`}>
              <span className="mr-2 inline-flex h-2.5 w-2.5 rounded-full align-middle">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${note.dot}`} />
              </span>
              <span className="align-middle">{note.text}</span>
            </div>
          </div>

          {item.assignedCrewTeamLabel ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                工程队 · {crewSummary(item)}
              </span>
            </div>
          ) : null}
        </div>

        <Link
          href={workOrderHref(item)}
          className={
            item.stage === "return_sheet"
              ? "rounded-xl bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-200"
              : "text-sm font-semibold text-blue-600 transition hover:text-blue-700"
          }
        >
          {actionLabel(item)}
          {item.stage === "return_sheet" ? null : (
            <span className="ml-2 align-middle text-base">›</span>
          )}
        </Link>
      </div>
    </article>
  );
}

function WarningAlertWorkOrderCard({
  item,
  creationOptions,
}: {
  item: WorkOrderItem;
  creationOptions: CreationOptions;
}) {
  const warningLabel =
    item.warningStatus === "critical" ? "最高级预警" : "预警工单";

  return (
    <article className="lg:col-span-2 overflow-hidden rounded-[24px] border border-red-500 bg-[#e72826] px-5 py-5 text-white shadow-[0_18px_48px_rgba(220,38,38,0.22)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-lg bg-white/16 px-2.5 py-1 text-[11px] font-bold text-white">
              {warningLabel}
            </span>
            <span className="font-mono text-xs font-semibold text-white/70">
              #{item.workOrderNo}
            </span>
          </div>
          <h3 className="text-[1.65rem] font-black tracking-tight text-white">
            {item.title}
          </h3>
          <p className="mt-2.5 max-w-3xl text-sm leading-6 text-white/88">
            {item.nextAction || item.latestProgressSummary}
          </p>
        </div>
        <WorkOrderCardActions
          item={item}
          responsibleUsers={creationOptions.responsibleUsers}
          collaborationSpaces={creationOptions.collaborationSpaces}
          tone="light"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.08fr_1fr_0.4fr] xl:items-center">
        <div className="rounded-[20px] border border-white/12 bg-black/10 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
            预警描述
          </div>
          <div className="mt-3 text-xl font-black leading-tight text-white">
            {item.blockingItemCount > 0
              ? `当前有 ${item.blockingItemCount} 项阻塞待处理`
              : "当前节点存在预警，需要优先处理。"}
          </div>
          <div className="mt-3 text-sm leading-6 text-white/82">
            {item.latestProgressSummary || "请优先处理当前预警，再继续向下推进。"}
          </div>
        </div>

        <div className="min-w-0 rounded-[20px] border border-white/12 bg-black/10 p-4">
          <WorkOrderStageStrip stage={item.stage} tone="alert" />
        </div>

        <div className="rounded-[20px] border border-white/12 bg-black/10 p-4 xl:min-h-[150px] xl:border-l-0">
          <div className="text-xs font-medium text-white/70">当前节点负责人</div>
          <div className="mt-2 text-[1.5rem] font-black tracking-tight text-white">
            {item.currentResponsibleUserName ?? "未指定"}
          </div>
          <div className="mt-1.5 text-sm font-semibold text-white/90">
            {item.currentResponsibleTeam || stageLabel(item.stage)}
          </div>
          {item.assignedCrewTeamLabel ? (
            <div className="mt-3 rounded-2xl bg-white/10 px-3 py-2 text-xs font-semibold text-white/90">
              工程队 · {crewSummary(item)}
            </div>
          ) : null}
          <Link
            href={workOrderHref(item)}
            className="mt-5 inline-flex items-center rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-white/90"
          >
            {actionLabel(item)}
          </Link>
        </div>
      </div>
    </article>
  );
}

function ArchivedWorkOrderTile({ item }: { item: WorkOrderItem }) {
  return (
    <article className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
          已归档
        </span>
        <span className="font-mono text-xs font-semibold text-slate-400">
          #{item.workOrderNo}
        </span>
      </div>
      <h3 className="text-base font-black tracking-tight text-slate-950">
        {item.title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        {item.latestProgressSummary}
      </p>
      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>{item.currentResponsibleUserName ?? "未分配"}</span>
        <span>{formatShortDate(item.updatedAt)}</span>
      </div>
      <div className="mt-4">
        <Link
          href={workOrderHref(item)}
          className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
        >
          {actionLabel(item)}
          <span className="ml-2 align-middle text-base">→</span>
        </Link>
      </div>
    </article>
  );
}

function AllWorkOrdersOverview({
  dashboard,
  workOrders,
  creationOptions,
  currentUser,
}: {
  dashboard: DashboardData;
  workOrders: WorkOrderItem[];
  creationOptions: CreationOptions;
  currentUser: Awaited<ReturnType<typeof requireCurrentUser>>;
}) {
  const activeItems = workOrders.filter((item) => !isClosedLike(item));
  const orderedActiveItems = [
    ...activeItems.filter((item) => isWarningAlert(item)),
    ...activeItems.filter((item) => !isWarningAlert(item)),
  ];
  const archivedItems = workOrders.filter((item) => isClosedLike(item));
  const constructionCount = activeItems.filter(
    (item) => item.stage === "field_construction",
  ).length;
  const acceptanceCount = activeItems.filter(
    (item) =>
      item.stage === "return_sheet" || item.stage === "drawing_delivery",
  ).length;
  const circulationCount = activeItems.filter(
    (item) =>
      item.stage === "dispatch" ||
      item.stage === "warning" ||
      item.status === "waiting" ||
      item.status === "blocked",
  ).length;

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-[1.9rem] font-black tracking-tight text-slate-950">
              全部工单
            </h1>
            <p className="mt-2 text-[15px] text-slate-500">
              当前共有{" "}
              <span className="font-bold text-blue-600">{dashboard.totalCount}</span>{" "}
              条工单，正在推进{" "}
              <span className="font-bold text-blue-600">{dashboard.activeCount}</span>{" "}
              条，异常预警{" "}
              <span className="font-bold text-amber-600">
                {dashboard.warningCount}
              </span>{" "}
              条。
            </p>
          </div>

          <button
            type="button"
            className="hidden"
          >
            <span className="text-lg leading-none">＋</span>
            <span>新建工单</span>
          </button>
          <CreateWorkOrderButton
            responsibleUsers={creationOptions.responsibleUsers}
            collaborationSpaces={creationOptions.collaborationSpaces}
            defaultResponsibleUserId={currentUser.id}
            defaultResponsibleTeam={currentUser.teamLabel}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <SectionPill active>全部工单</SectionPill>
          <SectionPill>施工中 ({constructionCount})</SectionPill>
          <SectionPill>待验收 ({acceptanceCount})</SectionPill>
          <SectionPill>流转中 ({circulationCount})</SectionPill>
          <SectionPill>已归档 ({dashboard.archivedCount})</SectionPill>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {orderedActiveItems.map((item) =>
            isWarningAlert(item) ? (
              <WarningAlertWorkOrderCard
                key={item.id}
                item={item}
                creationOptions={creationOptions}
              />
            ) : (
              <StandardWorkOrderCard
                key={item.id}
                item={item}
                creationOptions={creationOptions}
              />
            ),
          )}
        </div>
      </section>

      {archivedItems.length > 0 ? (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950">
                最近归档
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                已完成并进入归档口的工单会集中显示在这里。
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              {archivedItems.length} 条
            </span>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {archivedItems.map((item) => (
              <ArchivedWorkOrderTile key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function CompactListView({
  title,
  description,
  workOrders,
  creationOptions,
  currentUser,
}: {
  title: string;
  description: string;
  workOrders: WorkOrderItem[];
  creationOptions: CreationOptions;
  currentUser: Awaited<ReturnType<typeof requireCurrentUser>>;
}) {
  void creationOptions;
  void currentUser;

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">
            {title}
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
            {description}
          </p>
        </div>

        <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
          共 {workOrders.length} 条
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
        <div className="grid grid-cols-[1.05fr_1.25fr_0.95fr_0.85fr_0.8fr_0.95fr_0.65fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
          <div>工单编号</div>
          <div>标题 / 站点</div>
          <div>阶段</div>
          <div>状态</div>
          <div>优先级</div>
          <div>责任人</div>
          <div>缺失项</div>
        </div>

        {workOrders.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {workOrders.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1.05fr_1.25fr_0.95fr_0.85fr_0.8fr_0.95fr_0.65fr] gap-4 px-5 py-5 text-sm"
              >
                <div className="font-mono text-xs font-bold text-slate-500">
                  {item.workOrderNo}
                </div>

                <div>
                  <div className="font-bold text-slate-950">{item.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.projectName || "未挂项目"} / {item.siteName || "未挂站点"}
                  </div>
                  <div className="mt-2 text-xs leading-6 text-slate-400">
                    {item.latestProgressSummary}
                  </div>
                  <div className="mt-2">
                    <Link
                      href={workOrderHref(item)}
                      className="text-xs font-semibold text-blue-600 transition hover:text-blue-700"
                    >
                      {actionLabel(item)}
                    </Link>
                  </div>
                </div>

                <div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {stageLabel(item.stage)}
                  </span>
                </div>

                <div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {statusLabel(item.status)}
                  </span>
                </div>

                <div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {item.priority}
                  </span>
                </div>

                <div>
                  <div className="font-semibold text-slate-800">
                    {item.currentResponsibleUserName ?? "未分配"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.currentResponsibleTeam || "未挂团队"}
                  </div>
                  {item.assignedCrewTeamLabel ? (
                    <div className="mt-2 text-xs font-semibold text-blue-600">
                      工程队 · {crewSummary(item)}
                    </div>
                  ) : null}
                </div>

                <div>
                  <div className="font-bold text-slate-900">
                    {item.missingItemCount}
                  </div>
                  {item.blockingItemCount > 0 ? (
                    <div className="mt-1 text-xs text-red-500">
                      阻塞 {item.blockingItemCount}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-10 text-center text-sm leading-7 text-slate-500">
            当前没有符合条件的工单。
          </div>
        )}
      </div>
    </section>
  );
}

type WorkOrdersPageProps = {
  searchParams?: Promise<{
    view?: string | string[];
  }>;
};

export default async function WorkOrdersPage({
  searchParams,
}: WorkOrdersPageProps) {
  const currentUser = await requireCurrentUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedView = Array.isArray(resolvedSearchParams?.view)
    ? resolvedSearchParams.view[0]
    : resolvedSearchParams?.view;
  const currentView = normalizeView(requestedView);
  const [dashboard, creationOptions] = await Promise.all([
    getWorkOrderDashboardData(currentUser.id),
    getWorkOrderCreationOptions(currentUser.id),
  ]);

  const allWorkOrders = dashboard.workOrders;
  const assignedToMe = allWorkOrders.filter(
    (item) =>
      item.currentResponsibleUserId === currentUser.id && !isClosedLike(item),
  );
  const teamInFlight = allWorkOrders.filter((item) => !isClosedLike(item));
  const missingAndBackfill = allWorkOrders.filter(
    (item) =>
      !isClosedLike(item) &&
      (item.missingItemCount > 0 || item.blockingItemCount > 0),
  );
  const warningItems = allWorkOrders.filter(
    (item) =>
      !isClosedLike(item) &&
      (item.warningStatus === "warning" || item.warningStatus === "critical"),
  );
  const archivedItems = allWorkOrders.filter((item) => isClosedLike(item));

  const viewConfig: Record<
    Exclude<WorkOrderSidebarView, "all">,
    { title: string; description: string; items: WorkOrderItem[] }
  > = {
    mine: {
      title: "我需要处理的工单",
      description: "查看当前分配给你或等待你处理的工单。",
      items: assignedToMe,
    },
    team: {
      title: "团队正在推进",
      description: "查看团队当前处于推进中的工单。",
      items: teamInFlight,
    },
    missing: {
      title: "缺失项 / 补录",
      description: "集中处理资料缺失、待补录与阻塞项。",
      items: missingAndBackfill,
    },
    warning: {
      title: "异常 / 预警",
      description: "查看当前存在异常或预警的工单。",
      items: warningItems,
    },
    archived: {
      title: "已完成 / 归档",
      description: "查看已完成、已归档和已闭环工单。",
      items: archivedItems,
    },
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.2),transparent_26%),linear-gradient(180deg,#f1f6ff_0%,#f8fbff_42%,#eef3fb_100%)] px-2 py-4 sm:px-4">
      <div className="mx-auto max-w-[1520px]">
        {currentView === "all" ? (
          <AllWorkOrdersOverview
            dashboard={dashboard}
            workOrders={allWorkOrders}
            creationOptions={creationOptions}
            currentUser={currentUser}
          />
        ) : (
          <CompactListView
            title={viewConfig[currentView].title}
            description={viewConfig[currentView].description}
            workOrders={viewConfig[currentView].items}
            creationOptions={creationOptions}
            currentUser={currentUser}
          />
        )}
      </div>
    </div>
  );
}
