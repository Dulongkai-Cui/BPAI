import Link from "next/link";

import { CreateSquadButton } from "@/components/engineering/create-squad-button";
import { requireCurrentUser } from "@/lib/auth/server";
import { getEngineeringBoardData } from "@/lib/engineering/server";

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "待更新";
  }

  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getTaskBadgeClass(warningStatus: string, priorityLabel: string) {
  if (warningStatus === "warning" || warningStatus === "critical") {
    return "bg-rose-100 text-rose-700";
  }

  if (priorityLabel === "紧急") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-blue-100 text-blue-700";
}

function getMemberStatusClass(status: string) {
  switch (status) {
    case "on_site":
      return "bg-emerald-100 text-emerald-700";
    case "assigned":
      return "bg-blue-100 text-blue-700";
    case "leave":
      return "bg-amber-100 text-amber-700";
    case "inactive":
      return "bg-slate-200 text-slate-500";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default async function EngineeringBoardPage() {
  const user = await requireCurrentUser();
  const board = await getEngineeringBoardData(user.id);

  return (
    <div className="min-h-full bg-[#f4f7fb] px-8 py-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link
              href="/engineering"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-blue-600"
            >
              <span>返回工程队基地 - 互动中心</span>
            </Link>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900">
              工程组综合看板
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              当前 {board.summary.activeTaskCount} 个活跃任务，{board.summary.squadCount} 支编队在岗，{board.summary.memberCount} 名成员已纳入管理。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/work-orders"
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-600"
            >
              进入工单中心
            </Link>
            <CreateSquadButton members={board.roster} />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-500">
              活跃任务
            </div>
            <div className="mt-3 text-3xl font-black text-slate-900">
              {board.summary.activeTaskCount}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              当前由工程组持续推进中的工单
            </div>
          </div>
          <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-500">
              在岗成员
            </div>
            <div className="mt-3 text-3xl font-black text-slate-900">
              {board.summary.availableMemberCount}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              可直接安排任务的工程人员
            </div>
          </div>
          <div className="rounded-3xl border border-amber-100 bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-amber-500">
              已分配成员
            </div>
            <div className="mt-3 text-3xl font-black text-slate-900">
              {board.summary.assignedMemberCount}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              正在执行编队任务或现场作业
            </div>
          </div>
          <div className="rounded-3xl border border-rose-100 bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-rose-500">
              预警任务
            </div>
            <div className="mt-3 text-3xl font-black text-slate-900">
              {board.summary.warningTaskCount}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              需要工程组优先关注的异常或阻塞任务
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <section className="col-span-12 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm xl:col-span-8">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-xl font-black text-slate-900">当前施工任务清单</h2>
                <p className="mt-1 text-sm text-slate-500">
                  结合工单真源和派单记录，展示当前由工程组承接的任务。
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                {board.recentTasks.length} 条
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                  <tr>
                    <th className="px-6 py-3 font-semibold">工单 / 站点</th>
                    <th className="px-6 py-3 font-semibold">执行编队</th>
                    <th className="px-6 py-3 font-semibold">当前节点</th>
                    <th className="px-6 py-3 font-semibold">材料进度</th>
                    <th className="px-6 py-3 font-semibold">最近更新</th>
                    <th className="px-6 py-3 font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {board.recentTasks.map((task) => (
                    <tr
                      key={task.id}
                      className="transition-colors hover:bg-slate-50/80"
                    >
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{task.title}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {task.workOrderNo}
                          {task.siteName ? ` 路 ${task.siteName}` : ""}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-slate-800">
                          {task.assignedCrewTeamLabel}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          带队：{task.assignedCrewLeaderName} 路 {task.assignedCrewMemberCount} 人
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ${getTaskBadgeClass(
                              task.warningStatus,
                              task.priorityLabel,
                            )}`}
                          >
                            {task.stageLabel}
                          </span>
                          <span className="text-xs text-slate-400">
                            {task.priorityLabel}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="w-40">
                          <div className="h-2 rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full bg-blue-600"
                              style={{
                                width: `${Math.max(
                                  8,
                                  Math.min(100, task.materialCompleteness),
                                )}%`,
                              }}
                            />
                          </div>
                          <div className="mt-1 text-right text-xs font-semibold text-slate-500">
                            {task.materialCompleteness}%
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {formatDate(task.updatedAt)}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/work-orders/${task.id}`}
                          className="text-sm font-semibold text-blue-600 transition hover:text-blue-500"
                        >
                          查看工单
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="col-span-12 flex flex-col gap-6 xl:col-span-4">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-slate-900">班组负荷仪表盘</h2>
              <div className="mt-5 space-y-4">
                {board.squadCards.map((squad) => (
                  <div
                    key={squad.id}
                    className={`rounded-2xl border border-slate-100 p-4 ${squad.loadBgClass}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-black text-slate-900">
                          {squad.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          队长：{squad.leaderMemberName ?? "待指定"} 路 {squad.baseLabel}
                        </div>
                      </div>
                      <span className={`text-xs font-black ${squad.loadTextClass}`}>
                        {squad.loadLabel}
                      </span>
                    </div>
                    <div className="mt-4 h-2 rounded-full bg-white/70">
                      <div
                        className={`h-2 rounded-full ${squad.loadBarClass}`}
                        style={{ width: `${squad.loadPercent}%` }}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>{squad.activeWorkOrderCount} 单</span>
                      <span>{squad.memberCount} 人</span>
                      <span>{squad.loadPercent}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-slate-900">待编队成员</h2>
              <div className="mt-4 space-y-3">
                {board.unassignedMembers.length > 0 ? (
                  board.unassignedMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {member.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {member.roleLabel} 路 {member.baseLabel || "暂未设置基地"}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${getMemberStatusClass(
                          member.status,
                        )}`}
                      >
                        {member.statusLabel}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    当前所有成员都已经编入现有工程队。
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="col-span-12 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">编队总览</h2>
                <p className="mt-1 text-sm text-slate-500">
                  每支编队的队长、成员、负荷和当前承接任务。
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                {board.squadCards.length} 支编队
              </span>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              {board.squadCards.map((squad) => (
                <div
                  key={squad.id}
                  className="rounded-[26px] border border-slate-200 bg-slate-50 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                        {squad.code}
                      </div>
                      <div className="mt-2 text-2xl font-black text-slate-900">
                        {squad.name}
                      </div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500">
                      {squad.statusLabel}
                    </span>
                  </div>

                  <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                    {squad.summary || "暂未填写编队说明。"}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                      <div className="text-xs font-bold text-slate-400">队长</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {squad.leaderMemberName ?? "待指定"}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                      <div className="text-xs font-bold text-slate-400">成员</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {squad.memberCount} 人
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {squad.members.map((member) => (
                      <span
                        key={member.id}
                        className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm"
                      >
                        {member.name}
                        {member.memberRole === "leader" ? " 路 队长" : ""}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                      <span>当前任务</span>
                      <span>{squad.activeWorkOrderCount} 单</span>
                    </div>
                    <div className="space-y-2">
                      {squad.linkedTasks.length > 0 ? (
                        squad.linkedTasks.map((task) => (
                          <Link
                            key={task.id}
                            href={`/work-orders/${task.id}`}
                            className="block rounded-2xl border border-white bg-white px-4 py-3 text-sm shadow-sm transition hover:border-blue-200"
                          >
                            <div className="font-semibold text-slate-900">
                              {task.title}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {task.workOrderNo} 路 {task.stageLabel} 路 {task.priorityLabel}
                            </div>
                          </Link>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                          当前没有挂在这支编队上的活跃任务。
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="col-span-12 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">工程人员总览</h2>
                <p className="mt-1 text-sm text-slate-500">
                  人员状态、当前编队和基地归属统一在这里看。
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                {board.roster.length} 人
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {board.roster.map((member) => (
                <div
                  key={member.id}
                  className="rounded-[24px] border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-sm font-black text-blue-700">
                      {member.name.slice(0, 1)}
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${getMemberStatusClass(
                        member.status,
                      )}`}
                    >
                      {member.statusLabel}
                    </span>
                  </div>

                  <div className="mt-4 text-xl font-black text-slate-900">
                    {member.name}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {member.roleLabel}
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    <div className="rounded-2xl bg-white px-3 py-2 shadow-sm">
                      <div className="text-xs font-bold text-slate-400">当前编队</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {member.currentSquadName ?? "待编队"}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 shadow-sm">
                      <div className="text-xs font-bold text-slate-400">基地</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {member.baseLabel || "暂未设置"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
