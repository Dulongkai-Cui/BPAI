export default function DashboardSettingsPage() {
  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.28),transparent_28%),linear-gradient(180deg,#eef4ff_0%,#f8faff_36%,#eef3fb_100%)] p-6">
      <section className="rounded-[38px] border border-white/80 bg-white/90 p-8 shadow-[0_30px_90px_rgba(15,23,42,0.08)]">
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
          设置
        </div>
        <h1 className="mt-4 text-[34px] font-semibold tracking-tight text-slate-950 md:text-[42px]">
          总览设置占位页
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
          这里后续承接地图图层开关、预警阈值、总览模块展示偏好等设置能力。
        </p>
      </section>
    </div>
  );
}
