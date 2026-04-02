"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ResponsibleUserOption } from "@/components/work-order/work-order-form-dialog";

type DispatchAssignmentInitialValues = {
  assignedTeamLabel?: string;
  assignedUserId?: string | null;
  crewLeaderName?: string;
  crewMemberNames?: string[];
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  coordinationRecord?: string;
  nextAction?: string;
};

type DispatchAssignmentButtonProps = {
  workOrderId: string;
  responsibleUsers: ResponsibleUserOption[];
  initialValues?: DispatchAssignmentInitialValues;
};

function toDateInputValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

export function DispatchAssignmentButton({
  workOrderId,
  responsibleUsers,
  initialValues,
}: DispatchAssignmentButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [assignedTeamLabel, setAssignedTeamLabel] = useState(
    initialValues?.assignedTeamLabel ?? "",
  );
  const [assignedUserId, setAssignedUserId] = useState(
    initialValues?.assignedUserId ?? "",
  );
  const [crewLeaderName, setCrewLeaderName] = useState(
    initialValues?.crewLeaderName ?? "",
  );
  const [crewMembersText, setCrewMembersText] = useState(
    (initialValues?.crewMemberNames ?? []).join("、"),
  );
  const [plannedStartAt, setPlannedStartAt] = useState(
    toDateInputValue(initialValues?.plannedStartAt),
  );
  const [plannedEndAt, setPlannedEndAt] = useState(
    toDateInputValue(initialValues?.plannedEndAt),
  );
  const [coordinationRecord, setCoordinationRecord] = useState(
    initialValues?.coordinationRecord ?? "",
  );
  const [nextAction, setNextAction] = useState(initialValues?.nextAction ?? "");

  const selectedResponsibleUser = useMemo(
    () => responsibleUsers.find((item) => item.id === assignedUserId) ?? null,
    [assignedUserId, responsibleUsers],
  );

  function resetAndClose() {
    if (isPending) {
      return;
    }

    setErrorMessage("");
    setOpen(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!assignedTeamLabel.trim()) {
      setErrorMessage("请先填写施工队名称。");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/work-orders/${workOrderId}/dispatch-executions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              assignedTeamLabel,
              assignedUserId: assignedUserId || null,
              crewLeaderName,
              crewMembersText,
              plannedStartAt: plannedStartAt || null,
              plannedEndAt: plannedEndAt || null,
              coordinationRecord,
              nextAction,
            }),
          },
        );

        const result = (await response.json()) as { message?: string };

        if (!response.ok) {
          throw new Error(result.message || "施工队分配失败，请稍后再试。");
        }

        setOpen(false);
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "施工队分配失败，请稍后再试。",
        );
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        施工队分配人员
      </button>

      {open ? (
        <div className="fixed inset-0 z-[92] flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-sm">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  施工队派单
                </div>
                <h3 className="mt-3 text-[1.55rem] font-black tracking-tight text-slate-950">
                  给这张工单安排施工队
                </h3>
              </div>

              <button
                type="button"
                onClick={resetAndClose}
                className="rounded-full border border-slate-200 p-3 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    d="M6 6l12 12M18 6 6 18"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col px-6 py-5">
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-700">
                      施工队名称
                    </div>
                    <input
                      value={assignedTeamLabel}
                      onChange={(event) => setAssignedTeamLabel(event.target.value)}
                      placeholder="例如：朱三班组 / 刘主管一队"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-700">
                      系统内对接负责人
                    </div>
                    <select
                      value={assignedUserId}
                      onChange={(event) => setAssignedUserId(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="">暂不指定</option>
                      {responsibleUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} · {user.teamLabel}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-700">
                      带队人 / 现场联系人
                    </div>
                    <input
                      value={crewLeaderName}
                      onChange={(event) => setCrewLeaderName(event.target.value)}
                      placeholder="例如：朱三"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    />
                    {selectedResponsibleUser ? (
                      <div className="mt-2 text-xs text-slate-500">
                        当前系统内对接人：{selectedResponsibleUser.name} /{" "}
                        {selectedResponsibleUser.roleLabel}
                      </div>
                    ) : null}
                  </label>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block">
                      <div className="mb-2 text-sm font-semibold text-slate-700">
                        计划开工
                      </div>
                      <input
                        type="date"
                        value={plannedStartAt}
                        onChange={(event) => setPlannedStartAt(event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block">
                      <div className="mb-2 text-sm font-semibold text-slate-700">
                        计划完工
                      </div>
                      <input
                        type="date"
                        value={plannedEndAt}
                        onChange={(event) => setPlannedEndAt(event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>
                  </div>
                </div>

                <label className="mt-5 block">
                  <div className="mb-2 text-sm font-semibold text-slate-700">
                    施工人员
                  </div>
                  <textarea
                    rows={5}
                    value={crewMembersText}
                    onChange={(event) => setCrewMembersText(event.target.value)}
                    placeholder="支持换行、逗号、顿号分隔，例如：朱三、徐凡久、沈军"
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  />
                </label>

                <label className="mt-5 block">
                  <div className="mb-2 text-sm font-semibold text-slate-700">
                    派单备注
                  </div>
                  <textarea
                    rows={4}
                    value={coordinationRecord}
                    onChange={(event) => setCoordinationRecord(event.target.value)}
                    placeholder="例如：2026年04月03日安排一队施工，优先处理雨花分局两单。"
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  />
                </label>

                <label className="mt-5 block">
                  <div className="mb-2 text-sm font-semibold text-slate-700">
                    下一步动作
                  </div>
                  <textarea
                    rows={3}
                    value={nextAction}
                    onChange={(event) => setNextAction(event.target.value)}
                    placeholder="例如：按计划开工，完成后回单并同步图纸。"
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  />
                </label>

                {errorMessage ? (
                  <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {errorMessage}
                  </div>
                ) : null}
              </div>

              <div className="mt-5 flex flex-shrink-0 items-center justify-end gap-3 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {isPending ? "分配中..." : "确认分配"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
