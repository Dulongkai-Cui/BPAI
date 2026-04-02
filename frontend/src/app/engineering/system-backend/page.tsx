import Link from "next/link";

import { getSystemBackendSummary } from "@/lib/engineering/server";

const tableCards = [
  {
    name: "work_orders",
    title: "工单主表",
    summary: "统一承接工单编号、阶段、状态、责任人、预警与完整度。",
  },
  {
    name: "source_intakes",
    title: "来源附表",
    summary: "承接邮箱、微信、电话、人工登记等来源与需求摘要。",
  },
  {
    name: "dispatch_executions",
    title: "派单执行附表",
    summary: "承接派单轮次、施工状态、预警与协调记录。",
  },
  {
    name: "delivery_resources",
    title: "交付资源附表",
    summary: "承接回单、图纸交付、录资源、稽核与打包出设计。",
  },
  {
    name: "missing_items",
    title: "缺失项附表",
    summary: "承接缺什么、是否阻塞、谁来补、何时补齐。",
  },
  {
    name: "work_order_document_links",
    title: "文档挂接表",
    summary: "把工单与文档档案室里的文件、文件夹、资料包正式连起来。",
  },
] as const;

export default async function EngineeringSystemBackendPage() {
  const summary = await getSystemBackendSummary();

  return (
    <div className="min-h-full bg-slate-100 px-8 py-10">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/engineering"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          <span>←</span>
          <span>返回工程队基地 - 互动中心</span>
        </Link>

        <div className="mt-8 flex flex-col gap-3">
          <div className="text-sm font-black uppercase tracking-[0.24em] text-slate-400">
            System Backend
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">
            系统后台
          </h1>
          <p className="max-w-3xl text-base leading-7 text-slate-500">
            这页先作为工程队基地里的可视化后台壳页使用。当前重点不是把工单前端全铺开，而是先把真源表、工作台入口和最小查询骨架稳稳接起来。
          </p>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              工单真源表
            </div>
            <div className="mt-3 text-4xl font-black text-slate-950">
              {summary.workOrderTableCount}
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              第一版核心对象已经全部落进 PostgreSQL。
            </p>
          </div>
          <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-800/70">
              全部工单
            </div>
            <div className="mt-3 text-4xl font-black text-blue-950">
              {summary.totalWorkOrders}
            </div>
            <p className="mt-3 text-sm leading-6 text-blue-900/70">
              后续会从这里继续接工单主表、附表与系统表单工作台。
            </p>
          </div>
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-800/70">
              未归档工单
            </div>
            <div className="mt-3 text-4xl font-black text-emerald-950">
              {summary.activeWorkOrders}
            </div>
            <p className="mt-3 text-sm leading-6 text-emerald-900/70">
              当前按未归档口径统计，后续再补待办与责任工作台。
            </p>
          </div>
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-amber-800/70">
              预警工单
            </div>
            <div className="mt-3 text-4xl font-black text-amber-950">
              {summary.warningWorkOrders}
            </div>
            <p className="mt-3 text-sm leading-6 text-amber-900/70">
              这里后面会直接对应刘主管和团队的待处理预警底表。
            </p>
          </div>
        </section>

        <section className="mt-10 grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">
                  PostgreSQL 真源对象
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                  第一版工单核心表
                </h2>
              </div>
              <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
                已落库
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {tableCards.map((card) => (
                <div
                  key={card.name}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
                >
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    {card.name}
                  </div>
                  <div className="mt-3 text-xl font-black text-slate-950">
                    {card.title}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    {card.summary}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">
                下一步
              </div>
              <div className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                工单最小 API
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                现在壳子和真源表都在了，下一步就该把最小工单创建、详情读取、我需要处理的工单工作台查询直接接出来。
              </p>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">
                最近工单
              </div>
              <div className="mt-4 space-y-3">
                {summary.latestWorkOrders.length > 0 ? (
                  summary.latestWorkOrders.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-black text-slate-900">
                          {item.title}
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                          {item.priority}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {item.workOrderNo}
                      </div>
                      <div className="mt-2 text-xs text-slate-400">
                        {item.stage} / {item.status}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-7 text-slate-500">
                    当前数据库里还没有正式工单记录。这个空状态是正常的，下一步把创建 API 接出来以后，这里就会开始长真实数据。
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
