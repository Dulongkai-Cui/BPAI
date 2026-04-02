import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { requireCurrentUser } from "@/lib/auth/server";
import { WorkOrderCardActions } from "@/components/work-order/work-order-card-actions";
import { DispatchAssignmentButton } from "@/components/work-order/dispatch-assignment-button";
import { WorkOrderStageStrip } from "@/components/work-order/work-order-stage-strip";
import {
  ensureCanViewWorkOrder,
  getWorkOrderCreationOptions,
  getWorkOrderDetailById,
} from "@/lib/work-order/server";

type WorkOrderDetail = NonNullable<
  Awaited<ReturnType<typeof getWorkOrderDetailById>>
>;
type CreationOptions = Awaited<ReturnType<typeof getWorkOrderCreationOptions>>;
type PillTone = "slate" | "blue" | "amber" | "emerald" | "red" | "violet";

function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    source_intake: "来源",
    registration: "登记",
    dispatch: "派单",
    warning: "预警",
    field_construction: "施工",
    return_sheet: "回单",
    drawing_delivery: "图纸交付",
    resource_entry: "录资源",
    resource_audit: "资源稽核",
    design_package: "出设计",
  };

  return labels[stage] ?? stage;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    open: "待启动",
    in_progress: "进行中",
    waiting: "待处理",
    blocked: "阻塞中",
    completed: "已完成",
    cancelled: "已取消",
    archived: "已归档",
  };

  return labels[status] ?? status;
}

function priorityLabel(priority: string) {
  const labels: Record<string, string> = {
    low: "低",
    normal: "普通",
    high: "高",
    urgent: "紧急",
  };

  return labels[priority] ?? priority;
}

function sourceChannelLabel(sourceType: string) {
  const labels: Record<string, string> = {
    email: "邮箱",
    wechat: "微信",
    phone: "电话",
    manual: "人工",
    other: "其他",
  };

  return labels[sourceType] ?? sourceType;
}

function intakeStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "待确认",
    confirmed: "已确认",
    revised: "待修订",
  };

  return labels[status] ?? status;
}

function dispatchStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "待派单",
    assigned: "已派单",
    in_progress: "执行中",
    paused: "已暂停",
    completed: "已完成",
    cancelled: "已取消",
  };

  return labels[status] ?? status;
}

function deliveryStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "待处理",
    in_progress: "处理中",
    completed: "已完成",
    needs_revision: "待修订",
    not_applicable: "不适用",
  };

  return labels[status] ?? status;
}

function warningStatusLabel(status: string) {
  const labels: Record<string, string> = {
    normal: "正常",
    warning: "预警",
    critical: "严重预警",
    resolved: "已解除",
  };

  return labels[status] ?? status;
}

function linkTypeLabel(linkType: string) {
  const labels: Record<string, string> = {
    source_attachment: "来源附件",
    construction_material: "施工资料",
    drawing_package: "图纸包",
    return_sheet: "回单",
    resource_package: "资源包",
    archive_reference: "归档引用",
  };

  return labels[linkType] ?? linkType;
}

function targetTypeLabel(targetType: string) {
  const labels: Record<string, string> = {
    asset: "文件",
    folder_node: "文件夹",
    external: "外部引用",
  };

  return labels[targetType] ?? targetType;
}

function clampPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "未记录";
  }

  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "未记录";
  }

  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function firstFilled(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "未填写";
}

function toneClass(tone: PillTone) {
  switch (tone) {
    case "blue":
      return "bg-blue-100 text-blue-700";
    case "amber":
      return "bg-amber-100 text-amber-700";
    case "emerald":
      return "bg-emerald-100 text-emerald-700";
    case "red":
      return "bg-red-100 text-red-700";
    case "violet":
      return "bg-violet-100 text-violet-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function stageAccent(stage: string) {
  switch (stage) {
    case "field_construction":
      return { pill: "blue" as PillTone, line: "bg-blue-600", value: "text-blue-600" };
    case "return_sheet":
      return { pill: "amber" as PillTone, line: "bg-amber-500", value: "text-amber-500" };
    case "drawing_delivery":
      return { pill: "amber" as PillTone, line: "bg-orange-500", value: "text-orange-500" };
    case "resource_entry":
      return { pill: "emerald" as PillTone, line: "bg-emerald-500", value: "text-emerald-600" };
    case "resource_audit":
      return { pill: "emerald" as PillTone, line: "bg-teal-500", value: "text-teal-600" };
    case "dispatch":
      return { pill: "red" as PillTone, line: "bg-red-500", value: "text-red-500" };
    case "warning":
      return { pill: "red" as PillTone, line: "bg-red-500", value: "text-red-500" };
    case "design_package":
      return { pill: "violet" as PillTone, line: "bg-violet-500", value: "text-violet-600" };
    default:
      return { pill: "slate" as PillTone, line: "bg-slate-500", value: "text-slate-600" };
  }
}

function progressLabel(stage: string) {
  switch (stage) {
    case "field_construction":
      return "施工进度";
    case "return_sheet":
      return "回单进度";
    case "drawing_delivery":
      return "图纸交付进度";
    case "resource_entry":
      return "录资源进度";
    case "resource_audit":
      return "资源稽核进度";
    case "dispatch":
      return "派单准备度";
    case "warning":
      return "预警处理进度";
    case "design_package":
      return "出设计进度";
    default:
      return "推进进度";
  }
}

function hashNumber(seed: string) {
  let value = 0;

  for (const char of seed) {
    value = (value * 33 + char.charCodeAt(0)) % 100000;
  }

  return value;
}

function modelMetrics(detail: WorkOrderDetail) {
  const seed = hashNumber(detail.workOrder.id);

  return {
    x: (seed % 180 + 28).toFixed(2),
    y: ((seed * 1.37) % 120 + 16).toFixed(2),
    z: ((seed * 0.29) % 24 + 3).toFixed(2),
    scale: 100 + (seed % 4) * 50,
    rev: String((seed % 8) + 1).padStart(2, "0"),
  };
}

function TonePill({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: PillTone;
}) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneClass(tone)}`}>
      {children}
    </span>
  );
}

function SectionCard({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-black tracking-tight text-slate-950">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function DataField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </div>
      <div className="mt-1.5 text-sm font-semibold leading-6 text-slate-900">
        {value}
      </div>
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
      {text}
    </div>
  );
}

function ModelToolButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/8 text-white/80 backdrop-blur transition hover:bg-white/12"
      aria-label={label}
    >
      <span className="text-sm font-bold">{label}</span>
    </button>
  );
}

function CadViewport({ detail }: { detail: WorkOrderDetail }) {
  const metrics = modelMetrics(detail);
  const completeness = clampPercent(detail.workOrder.materialCompleteness);
  const openMissingCount = detail.missingItems.open.length;
  const title = firstFilled(
    detail.workOrder.siteName,
    detail.workOrder.projectName,
    detail.workOrder.title,
  );

  return (
    <section className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-[#151d2c] shadow-[0_28px_90px_rgba(15,23,42,0.16)] xl:sticky xl:top-4 xl:h-[calc(100vh-6rem)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.18),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_24%),linear-gradient(180deg,#1b2435_0%,#111827_100%)]" />
      <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.25)_1px,transparent_1px)] [background-size:26px_26px]" />

      <div className="absolute inset-0">
        <svg viewBox="0 0 900 1100" className="h-full w-full">
          <defs>
            <radialGradient id="cadGlow" cx="50%" cy="48%" r="48%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="900" height="1100" fill="url(#cadGlow)" />
          <g fill="none" stroke="#dbeafe" strokeOpacity="0.4">
            <ellipse cx="455" cy="608" rx="260" ry="215" strokeWidth="2.4" />
            <ellipse cx="455" cy="608" rx="230" ry="182" strokeWidth="1.5" />
            <ellipse cx="455" cy="608" rx="185" ry="138" strokeWidth="1.2" />
            <path d="M208 700c92 34 187 49 286 49 112 0 209-19 293-56" strokeWidth="3" />
            <path d="M214 755c82 26 165 38 248 38 125 0 219-18 302-58" strokeWidth="2.4" />
            <path d="M277 498c62-55 121-79 178-79 54 0 103 18 150 56 47 37 84 93 112 170" strokeWidth="2.2" />
            <path d="M273 537c70-43 136-64 198-64 60 0 114 18 163 54 49 36 86 87 110 152" strokeWidth="1.3" />
            <path d="M233 840c119 55 244 80 372 76 89-3 173-20 252-51" strokeWidth="1.8" />
            <path d="M324 393h266" strokeWidth="1.4" strokeOpacity="0.25" />
            <path d="M294 436h324" strokeWidth="1.1" strokeOpacity="0.22" />
            <path d="M242 912c86 34 178 50 272 50 103 0 202-20 296-60" strokeWidth="1.2" strokeOpacity="0.28" />
            {Array.from({ length: 12 }).map((_, index) => {
              const x = 240 + index * 34;
              return (
                <path
                  key={`v-${x}`}
                  d={`M${x} 432c8 190 22 326 42 408`}
                  strokeWidth="1"
                  strokeOpacity="0.18"
                />
              );
            })}
            {Array.from({ length: 10 }).map((_, index) => {
              const startY = 470 + index * 34;
              return (
                <path
                  key={`h-${startY}`}
                  d={`M245 ${startY}c96 22 197 33 302 33 76 0 150-7 224-21`}
                  strokeWidth="1"
                  strokeOpacity="0.16"
                />
              );
            })}
          </g>
        </svg>
      </div>

      <div className="relative z-10 flex min-h-[560px] flex-col justify-between p-5 xl:h-full">
        <div className="space-y-4">
          <div className="max-w-xs rounded-[22px] border border-white/12 bg-white/10 p-4 backdrop-blur">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
              CAD 视图
            </div>
            <div className="mt-2 text-sm font-bold text-white">{title}</div>
            <div className="mt-3 text-[11px] leading-6 text-white/65">
              坐标: X {metrics.x} / Y {metrics.y} / Z {metrics.z}
              <br />
              比例: 1:{metrics.scale} · 版本: REV-{metrics.rev}
            </div>
          </div>

          <div className="flex gap-2">
            <ModelToolButton label="放" />
            <ModelToolButton label="旋" />
            <ModelToolButton label="层" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            材料完整度 {completeness}%
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            未解决缺失项 {openMissingCount}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            关联资料 {detail.documentLinks.length}
          </div>
        </div>
      </div>
    </section>
  );
}

function DetailHeader({
  detail,
  creationOptions,
}: {
  detail: WorkOrderDetail;
  creationOptions: CreationOptions;
}) {
  const accent = stageAccent(detail.workOrder.stage);
  const progress = clampPercent(detail.workOrder.materialCompleteness);
  const badgeTone =
    detail.workOrder.stage === "warning"
      ? "red"
      : detail.workOrder.stage === "field_construction"
        ? "blue"
        : detail.workOrder.stage === "return_sheet"
          ? "amber"
          : detail.workOrder.status === "completed" || detail.workOrder.archivedAt
            ? "emerald"
            : accent.pill;

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <Link
            href="/work-orders"
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-blue-700"
          >
            返回工单中心
          </Link>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <TonePill tone={badgeTone}>{stageLabel(detail.workOrder.stage)}</TonePill>
            <TonePill tone="slate">#{detail.workOrder.workOrderNo}</TonePill>
            <TonePill
              tone={
                detail.workOrder.priority === "urgent"
                  ? "red"
                  : detail.workOrder.priority === "high"
                    ? "amber"
                    : "slate"
              }
            >
              {priorityLabel(detail.workOrder.priority)}
            </TonePill>
            <TonePill
              tone={
                detail.workOrder.warningStatus === "critical"
                  ? "red"
                  : detail.workOrder.warningStatus === "warning"
                    ? "amber"
                    : detail.workOrder.warningStatus === "resolved"
                      ? "emerald"
                      : "slate"
              }
            >
              {warningStatusLabel(detail.workOrder.warningStatus)}
            </TonePill>
          </div>

          <h1 className="mt-4 text-[2.1rem] font-black tracking-tight text-slate-950">
            {detail.workOrder.title}
          </h1>

          <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
            <span>来源：{sourceChannelLabel(detail.workOrder.sourceType)}</span>
            <span>状态：{statusLabel(detail.workOrder.status)}</span>
            <span>更新：{formatDateTime(detail.workOrder.updatedAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {detail.collaborationSpace ? (
            <Link
              href={`/docs/workspace/${detail.collaborationSpace.id}`}
              className="inline-flex items-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              进入合作空间
            </Link>
          ) : null}

          <WorkOrderCardActions
            item={{
              id: detail.workOrder.id,
              workOrderNo: detail.workOrder.workOrderNo,
              title: detail.workOrder.title,
              sourceType: detail.workOrder.sourceType,
              priority: detail.workOrder.priority,
              sourceSummary: detail.workOrder.sourceSummary ?? "",
              projectName: detail.workOrder.projectName ?? "",
              siteName: detail.workOrder.siteName ?? "",
              siteAddress: detail.workOrder.siteAddress ?? "",
              currentResponsibleUserId: detail.workOrder.currentResponsibleUserId,
              currentResponsibleTeam: detail.workOrder.currentResponsibleTeam ?? "",
              stage: detail.workOrder.stage,
              materialCompleteness: clampPercent(detail.workOrder.materialCompleteness),
              collaborationSpaceId: detail.workOrder.collaborationSpaceId,
            }}
            responsibleUsers={creationOptions.responsibleUsers}
            collaborationSpaces={creationOptions.collaborationSpaces}
          />
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="text-sm font-semibold text-slate-600">
              {progressLabel(detail.workOrder.stage)}
            </div>
            <div className={`text-[1.9rem] font-black ${accent.value}`}>{progress}%</div>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full ${accent.line}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-5">
            <WorkOrderStageStrip stage={detail.workOrder.stage} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              当前节点负责人
            </div>
            <div className="mt-2 text-[1.65rem] font-black tracking-tight text-slate-950">
              {detail.workOrder.currentResponsibleUserName ?? "未指定"}
            </div>
            <div className="mt-2 text-sm font-semibold text-blue-700">
              {firstFilled(
                detail.workOrder.currentResponsibleUserTeamLabel,
                detail.workOrder.currentResponsibleTeam,
              )}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {detail.workOrder.currentResponsibleUserRoleLabel ?? stageLabel(detail.workOrder.stage)}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[1.45rem] font-black text-slate-950">
                  {detail.missingItems.totalCount}
                </div>
                <div className="mt-1 text-xs text-slate-500">缺失项</div>
              </div>
              <div>
                <div className="text-[1.45rem] font-black text-red-600">
                  {detail.missingItems.blockingCount}
                </div>
                <div className="mt-1 text-xs text-slate-500">阻塞项</div>
              </div>
              <div>
                <div className="text-[1.45rem] font-black text-slate-950">
                  {detail.documentLinks.length}
                </div>
                <div className="mt-1 text-xs text-slate-500">关联资料</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function OverviewSection({ detail }: { detail: WorkOrderDetail }) {
  return (
    <SectionCard title="工单总览">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <DataField label="工单编号" value={detail.workOrder.workOrderNo} />
        <DataField label="项目名称" value={firstFilled(detail.workOrder.projectName)} />
        <DataField label="站点名称" value={firstFilled(detail.workOrder.siteName)} />
        <DataField label="现场地址" value={firstFilled(detail.workOrder.siteAddress)} />
        <DataField label="来源渠道" value={sourceChannelLabel(detail.workOrder.sourceType)} />
        <DataField label="优先级" value={priorityLabel(detail.workOrder.priority)} />
        <DataField label="当前节点" value={stageLabel(detail.workOrder.stage)} />
        <DataField label="系统状态" value={statusLabel(detail.workOrder.status)} />
        <DataField label="预警状态" value={warningStatusLabel(detail.workOrder.warningStatus)} />
        <DataField
          label="责任团队"
          value={firstFilled(
            detail.workOrder.currentResponsibleUserTeamLabel,
            detail.workOrder.currentResponsibleTeam,
          )}
        />
        <DataField
          label="创建人"
          value={firstFilled(detail.workOrder.createdByUserName)}
        />
        <DataField label="更新时间" value={formatDateTime(detail.workOrder.updatedAt)} />
      </div>

      <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          需求摘要
        </div>
        <div className="mt-2 text-sm leading-7 text-slate-700">
          {firstFilled(
            detail.workOrder.sourceSummary,
            detail.workOrder.nextAction,
            detail.workOrder.latestProgressSummary,
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function MaterialsSection({ detail }: { detail: WorkOrderDetail }) {
  const items = [...detail.missingItems.open, ...detail.missingItems.resolved];

  return (
    <SectionCard
      title="材料与缺失项"
      right={
        <span className="text-xs font-semibold text-slate-500">共 {items.length} 项</span>
      }
    >
      {items.length > 0 ? (
        <div className="overflow-hidden rounded-[22px] border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">项目</th>
                <th className="px-4 py-3 font-semibold">阶段</th>
                <th className="px-4 py-3 font-semibold">责任人</th>
                <th className="px-4 py-3 font-semibold">状态</th>
                <th className="px-4 py-3 font-semibold text-right">更新时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="px-4 py-4">
                    <div className="font-semibold text-slate-900">
                      {firstFilled(item.materialLabel, item.fieldKey, item.itemType)}
                    </div>
                    <div className="mt-1 text-xs leading-6 text-slate-500">
                      {item.aiSuggestedContent || "未补充说明"}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{stageLabel(item.stage)}</td>
                  <td className="px-4 py-4 text-slate-600">
                    {item.ownerUserName || "未指定"}
                  </td>
                  <td className="px-4 py-4">
                    <TonePill
                      tone={
                        item.status === "resolved" || item.status === "waived"
                          ? "emerald"
                          : item.isBlocking
                            ? "red"
                            : "amber"
                      }
                    >
                      {item.status === "resolved"
                        ? "已解决"
                        : item.status === "waived"
                          ? "已豁免"
                          : item.isBlocking
                            ? "阻塞"
                            : "待补录"}
                    </TonePill>
                  </td>
                  <td className="px-4 py-4 text-right text-slate-500">
                    {formatDate(item.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyBox text="暂无材料与缺失项。" />
      )}
    </SectionCard>
  );
}

function SourceSection({ detail }: { detail: WorkOrderDetail }) {
  return (
    <SectionCard title="来源记录">
      {detail.sourceIntakes.length > 0 ? (
        <div className="space-y-3">
          {detail.sourceIntakes.map((item, index) => (
            <article
              key={item.id}
              className="rounded-[22px] border border-slate-200 bg-white px-4 py-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <TonePill tone={index === 0 ? "blue" : "slate"}>
                  {index === 0 ? "当前来源" : `来源记录 ${detail.sourceIntakes.length - index}`}
                </TonePill>
                <TonePill tone="slate">
                  {sourceChannelLabel(item.sourceChannel)}
                </TonePill>
                <TonePill tone="amber">
                  {intakeStatusLabel(item.confirmationStatus)}
                </TonePill>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <DataField
                  label="提取项目"
                  value={firstFilled(item.extractedProjectName)}
                />
                <DataField
                  label="提取站点"
                  value={firstFilled(item.extractedSiteName)}
                />
                <DataField
                  label="确认人"
                  value={firstFilled(item.confirmedByUserName)}
                />
                <DataField label="更新时间" value={formatDateTime(item.updatedAt)} />
              </div>

              <div className="mt-4 rounded-[20px] bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-700">
                {firstFilled(item.requirementSummary, item.originalMessageSummary)}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyBox text="暂无来源记录。" />
      )}
    </SectionCard>
  );
}

function DispatchSection({
  detail,
  creationOptions,
}: {
  detail: WorkOrderDetail;
  creationOptions: CreationOptions;
}) {
  const latestDispatch = detail.dispatchExecutions[0] ?? null;

  return (
    <SectionCard
      title="派单与执行"
      right={
        <DispatchAssignmentButton
          workOrderId={detail.workOrder.id}
          responsibleUsers={creationOptions.responsibleUsers}
          initialValues={
            latestDispatch
              ? {
                  assignedTeamLabel: latestDispatch.assignedTeamLabel,
                  assignedUserId: latestDispatch.assignedUserId,
                  crewLeaderName: latestDispatch.crewLeaderName,
                  crewMemberNames: latestDispatch.crewMemberNames,
                  plannedStartAt: latestDispatch.plannedStartAt?.toISOString() ?? null,
                  plannedEndAt: latestDispatch.plannedEndAt?.toISOString() ?? null,
                  coordinationRecord:
                    latestDispatch.assignmentNote || latestDispatch.coordinationRecord,
                  nextAction: latestDispatch.nextAction,
                }
              : {
                  assignedTeamLabel: detail.workOrder.currentResponsibleTeam ?? "",
                }
          }
        />
      }
    >
      {detail.dispatchExecutions.length > 0 ? (
        <div className="space-y-3">
          {detail.dispatchExecutions.map((item) => (
            <article
              key={item.id}
              className="rounded-[22px] border border-slate-200 bg-white px-4 py-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <TonePill tone="blue">轮次 {item.dispatchRound}</TonePill>
                <TonePill tone="slate">
                  {dispatchStatusLabel(item.executionStatus)}
                </TonePill>
                <TonePill
                  tone={
                    item.warningStatus === "critical"
                      ? "red"
                      : item.warningStatus === "warning"
                        ? "amber"
                        : item.warningStatus === "resolved"
                          ? "emerald"
                          : "slate"
                  }
                >
                  {warningStatusLabel(item.warningStatus)}
                </TonePill>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <DataField
                  label="派单人"
                  value={firstFilled(item.dispatchedByUserName)}
                />
                <DataField
                  label="执行人"
                  value={firstFilled(item.assignedUserName)}
                />
                <DataField
                  label="执行团队"
                  value={firstFilled(item.assignedUserTeamLabel, item.assignedTeamLabel)}
                />
                <DataField
                  label="带队人"
                  value={firstFilled(item.crewLeaderName, item.assignedUserName)}
                />
                <DataField
                  label="施工人数"
                  value={String(item.crewMemberCount ?? 0)}
                />
                <DataField
                  label="计划开始"
                  value={formatDateTime(item.plannedStartAt)}
                />
                <DataField
                  label="计划结束"
                  value={formatDateTime(item.plannedEndAt)}
                />
                <DataField label="更新时间" value={formatDateTime(item.updatedAt)} />
              </div>

              {item.crewMemberNames.length > 0 ? (
                <div className="mt-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    施工人员
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.crewMemberNames.map((memberName) => (
                      <span
                        key={`${item.id}-${memberName}`}
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600"
                      >
                        {memberName}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-[20px] bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    异常说明
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">
                    {firstFilled(item.anomalySummary)}
                  </div>
                </div>
                <div className="rounded-[20px] bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    预警原因
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">
                    {firstFilled(item.warningReason)}
                  </div>
                </div>
                <div className="rounded-[20px] bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    下一步
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">
                    {firstFilled(item.nextAction)}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyBox text="暂无派单与执行记录。" />
      )}
    </SectionCard>
  );
}

function DeliverySection({ detail }: { detail: WorkOrderDetail }) {
  return (
    <SectionCard title="交付与资源">
      {detail.deliveryResources.length > 0 ? (
        <div className="space-y-3">
          {detail.deliveryResources.map((item) => (
            <article
              key={item.id}
              className="rounded-[22px] border border-slate-200 bg-white px-4 py-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <TonePill tone="blue">轮次 {item.deliveryRound}</TonePill>
                <TonePill tone="amber">
                  回单 {deliveryStatusLabel(item.returnSheetStatus)}
                </TonePill>
                <TonePill tone="amber">
                  图纸 {deliveryStatusLabel(item.drawingDeliveryStatus)}
                </TonePill>
                <TonePill tone="emerald">
                  资源 {deliveryStatusLabel(item.resourceEntryStatus)}
                </TonePill>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <DataField
                  label="提交人"
                  value={firstFilled(item.submittedByUserName)}
                />
                <DataField
                  label="完成时间"
                  value={formatDateTime(item.completedAt)}
                />
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-[20px] bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    回单说明
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">
                    {firstFilled(item.returnSheetSummary)}
                  </div>
                </div>
                <div className="rounded-[20px] bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    资源稽核结论
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">
                    {firstFilled(item.resourceAuditConclusion)}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyBox text="暂无交付与资源记录。" />
      )}
    </SectionCard>
  );
}

function CollaborationSpaceSection({ detail }: { detail: WorkOrderDetail }) {
  return (
    <SectionCard title="关联合作空间">
      {detail.collaborationSpace ? (
        <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <TonePill tone="blue">已关联</TonePill>
            <TonePill tone="slate">{detail.collaborationSpace.name}</TonePill>
          </div>

          <div className="mt-4 text-xl font-black tracking-tight text-slate-950">
            {detail.collaborationSpace.name}
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <DataField
              label="空间拥有者"
              value={firstFilled(detail.collaborationSpace.ownerUserName)}
            />
            <DataField
              label="更新时间"
              value={formatDateTime(detail.collaborationSpace.updatedAt)}
            />
          </div>

          <div className="mt-4 rounded-[20px] bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-700">
            {firstFilled(detail.collaborationSpace.summary)}
          </div>

          <Link
            href={`/docs/workspace/${detail.collaborationSpace.id}`}
            className="mt-5 inline-flex items-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            打开合作空间
          </Link>
        </div>
      ) : (
        <EmptyBox text="未关联合作空间。" />
      )}
    </SectionCard>
  );
}

function DocumentsSection({ detail }: { detail: WorkOrderDetail }) {
  return (
    <SectionCard
      title="资料挂接"
      right={
        <span className="text-xs font-semibold text-slate-500">
          共 {detail.documentLinks.length} 条
        </span>
      }
    >
      {detail.documentLinks.length > 0 ? (
        <div className="space-y-3">
          {detail.documentLinks.map((item) => (
            <article
              key={item.id}
              className="rounded-[22px] border border-slate-200 bg-white px-4 py-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <TonePill tone="blue">{linkTypeLabel(item.linkType)}</TonePill>
                <TonePill tone="slate">{targetTypeLabel(item.targetType)}</TonePill>
                {item.targetDeletedAt ? <TonePill tone="red">已删除</TonePill> : null}
              </div>

              <div className="mt-3 text-base font-black text-slate-950">
                {item.targetTitle}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                {firstFilled(item.relationNote, item.targetDescription)}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span>来源空间：{firstFilled(item.linkedWorkspaceName)}</span>
                <span>关联人：{firstFilled(item.linkedByUserName)}</span>
                <span>更新时间：{formatDateTime(item.updatedAt)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyBox text="暂无资料挂接。" />
      )}
    </SectionCard>
  );
}

function WorkOrderDetailPageInner({
  detail,
  creationOptions,
}: {
  detail: WorkOrderDetail;
  creationOptions: CreationOptions;
}) {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.22),transparent_26%),linear-gradient(180deg,#eef4ff_0%,#f8fbff_38%,#edf3fb_100%)] px-2 py-4 sm:px-4">
      <div className="mx-auto max-w-[1680px]">
        <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.6fr)_minmax(0,1.4fr)]">
          <CadViewport detail={detail} />

          <div className="space-y-6">
            <DetailHeader detail={detail} creationOptions={creationOptions} />

            <div className="space-y-6">
              <OverviewSection detail={detail} />
              <MaterialsSection detail={detail} />
              <CollaborationSpaceSection detail={detail} />
              <SourceSection detail={detail} />
              <DispatchSection detail={detail} creationOptions={creationOptions} />
              <DeliverySection detail={detail} />
              <DocumentsSection detail={detail} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type WorkOrderDetailPageProps = {
  params: Promise<{ workOrderId: string }>;
};

export default async function WorkOrderDetailPage({
  params,
}: WorkOrderDetailPageProps) {
  const currentUser = await requireCurrentUser();
  const { workOrderId } = await params;

  try {
    const access = await ensureCanViewWorkOrder(currentUser, workOrderId);

    if (!access) {
      notFound();
    }
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      notFound();
    }
    throw error;
  }

  const [detail, creationOptions] = await Promise.all([
    getWorkOrderDetailById(workOrderId),
    getWorkOrderCreationOptions(currentUser.id),
  ]);

  if (!detail) {
    notFound();
  }

  return (
    <WorkOrderDetailPageInner
      detail={detail}
      creationOptions={creationOptions}
    />
  );
}
