function TeamStatusCard({
  title,
  subtitle,
  count,
}: {
  title: string;
  subtitle: string;
  count: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/80 bg-white/92 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="text-sm font-semibold text-slate-400">{title}</div>
      <div className="mt-3 text-3xl font-black text-slate-950">{count}</div>
      <div className="mt-2 text-sm leading-7 text-slate-500">{subtitle}</div>
    </div>
  );
}

export default function DashboardTeamStatusPage() {
  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.28),transparent_28%),linear-gradient(180deg,#eef4ff_0%,#f8faff_36%,#eef3fb_100%)] p-6">
      <section className="rounded-[38px] border border-white/80 bg-white/90 p-8 shadow-[0_30px_90px_rgba(15,23,42,0.08)]">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
            工程队状态
          </div>
          <h1 className="mt-4 text-[34px] font-semibold tracking-tight text-slate-950 md:text-[42px]">
            工程队状态占位页
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-500">
            这里先预留总览侧栏后的二级页，后续再接工程队分布、在线状态和任务负载。
          </p>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <TeamStatusCard
          title="在线工程队"
          count="18"
          subtitle="当前正在执行现场任务的工程队。"
        />
        <TeamStatusCard
          title="待命工程队"
          count="09"
          subtitle="已经接入系统，但暂未分配现场任务。"
        />
        <TeamStatusCard
          title="异常工程队"
          count="02"
          subtitle="存在延迟签到、缺材料或状态回写异常。"
        />
      </div>
    </div>
  );
}
