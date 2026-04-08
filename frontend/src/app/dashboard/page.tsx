import { OpenSourceMapCanvas } from "@/components/dashboard/amap-map-canvas";

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "amber" | "rose";
}) {
  const toneClasses =
    tone === "amber"
      ? "border-amber-200/80 bg-white/88 text-amber-700"
      : tone === "rose"
        ? "border-rose-200/80 bg-white/88 text-rose-700"
        : "border-blue-200/80 bg-white/88 text-blue-700";

  return (
    <div
      className={`rounded-2xl border px-4 py-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur ${toneClasses}`}
    >
      <div className="text-xs font-semibold tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.28),transparent_28%),linear-gradient(180deg,#eef4ff_0%,#edf3ff_34%,#eef3fb_100%)]">
      <section className="relative isolate h-full overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.04))]">
        <OpenSourceMapCanvas />

        <div className="absolute left-8 top-8 right-8 z-20 flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xl rounded-[24px] bg-white/72 px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />
              全城实时地图
            </div>
            <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-slate-950 md:text-[34px]">
              长沙全域协同地图
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
              当前先用开源底图稳定显示长沙市范围，后续继续叠加工程队、工单和预警点位。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <StatCard label="活跃工程队" value="42" tone="blue" />
            <StatCard label="执行中工单" value="128" tone="amber" />
            <StatCard label="预警提示" value="03" tone="rose" />
          </div>
        </div>

        <div className="absolute right-8 top-36 z-20 w-80 rounded-[26px] border border-white/70 bg-white/88 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                地图引擎状态
              </div>
              <div className="mt-1 text-xs leading-6 text-slate-500">
                当前总览底图切为开源方案，先保证长沙市底图、点位和交互在本地开发可用。
              </div>
            </div>
            <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              开源已接入
            </div>
          </div>

          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              当前底图：Leaflet + OpenStreetMap
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              当前聚焦长沙市区，后续直接往上叠加工程队位置、预警和业务图层。
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              当前不改动已有文档、工单、合作空间前后端。
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
