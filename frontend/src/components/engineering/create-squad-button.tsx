"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type EngineeringMemberItem = {
  id: string;
  name: string;
  roleLabel: string;
  status: string;
  statusLabel: string;
  baseLabel: string;
  currentSquadId: string | null;
  currentSquadName: string | null;
};

type CreateSquadButtonProps = {
  members: EngineeringMemberItem[];
};

function buildSuggestedCode(name: string) {
  const normalized = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9\u4e00-\u9fa5-]/g, "")
    .slice(0, 24);

  return normalized ? `SQ-${normalized}`.toUpperCase() : "";
}

export function CreateSquadButton({ members }: CreateSquadButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [baseLabel, setBaseLabel] = useState("");
  const [summary, setSummary] = useState("");
  const [note, setNote] = useState("");
  const [leaderMemberId, setLeaderMemberId] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const sortedMembers = useMemo(
    () =>
      [...members].sort((left, right) => {
        const leftAvailable = left.currentSquadId ? 1 : 0;
        const rightAvailable = right.currentSquadId ? 1 : 0;
        if (leftAvailable !== rightAvailable) {
          return leftAvailable - rightAvailable;
        }

        return left.name.localeCompare(right.name, "zh-CN");
      }),
    [members],
  );

  function resetForm() {
    setErrorMessage("");
    setName("");
    setCode("");
    setBaseLabel("");
    setSummary("");
    setNote("");
    setLeaderMemberId("");
    setSelectedMemberIds([]);
  }

  function closeModal() {
    if (isPending) {
      return;
    }

    setOpen(false);
    resetForm();
  }

  function toggleMember(memberId: string) {
    setSelectedMemberIds((current) => {
      if (current.includes(memberId)) {
        if (leaderMemberId === memberId) {
          setLeaderMemberId("");
        }
        return current.filter((item) => item !== memberId);
      }

      return [...current, memberId];
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!name.trim()) {
      setErrorMessage("请先填写编队名称。");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/engineering/squads", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name.trim(),
            code: code.trim() || buildSuggestedCode(name),
            leaderMemberId: leaderMemberId || null,
            memberIds: selectedMemberIds,
            baseLabel: baseLabel.trim(),
            summary: summary.trim(),
            note: note.trim(),
          }),
        });

        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.message || "创建编队失败，请稍后再试。");
        }

        closeModal();
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "创建编队失败，请稍后再试。",
        );
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
      >
        新建编队
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-sm">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.18)]">
            <div className="flex flex-shrink-0 items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  新建编队
                </div>
                <h2 className="mt-3 text-[1.8rem] font-black tracking-tight text-slate-950">
                  先把施工编队立起来
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  这里先确定编队名称、队长、成员和基地信息，后面工单派单时就能直接调用。
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
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
                <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
                  <div className="space-y-5">
                    <label className="block">
                      <div className="mb-2 text-sm font-semibold text-slate-700">编队名称</div>
                      <input
                        value={name}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setName(nextValue);
                          if (!code.trim()) {
                            setCode(buildSuggestedCode(nextValue));
                          }
                        }}
                        placeholder="例如：天心抢修一队"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>

                    <div className="grid gap-5 md:grid-cols-2">
                      <label className="block">
                        <div className="mb-2 text-sm font-semibold text-slate-700">编队编号</div>
                        <input
                          value={code}
                          onChange={(event) => setCode(event.target.value)}
                          placeholder="例如：ENG-SQ-04"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        />
                      </label>

                      <label className="block">
                        <div className="mb-2 text-sm font-semibold text-slate-700">所属基地 / 片区</div>
                        <input
                          value={baseLabel}
                          onChange={(event) => setBaseLabel(event.target.value)}
                          placeholder="例如：雨花 / 天心执行线"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <div className="mb-2 text-sm font-semibold text-slate-700">编队说明</div>
                      <textarea
                        value={summary}
                        onChange={(event) => setSummary(event.target.value)}
                        rows={4}
                        placeholder="例如：主要承接 FTTH 接入、抢修和现场摸底。"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block">
                      <div className="mb-2 text-sm font-semibold text-slate-700">备注</div>
                      <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={3}
                        placeholder="可选，用于记录班组特点、特殊能力或注意事项。"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>

                    <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-5">
                      <div className="text-sm font-semibold text-slate-700">队长</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setLeaderMemberId("")}
                          className={
                            leaderMemberId === ""
                              ? "rounded-full bg-blue-100 px-3 py-2 text-xs font-semibold text-blue-700"
                              : "rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-100"
                          }
                        >
                          暂不指定
                        </button>
                        {selectedMemberIds.map((memberId) => {
                          const member = sortedMembers.find((item) => item.id === memberId);
                          if (!member) return null;

                          return (
                            <button
                              key={member.id}
                              type="button"
                              onClick={() => setLeaderMemberId(member.id)}
                              className={
                                leaderMemberId === member.id
                                  ? "rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                                  : "rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100"
                              }
                            >
                              {member.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="rounded-[26px] border border-slate-200 bg-white p-5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-700">编队成员</div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                          已选 {selectedMemberIds.length} 人
                        </span>
                      </div>

                      <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                        {sortedMembers.map((member) => {
                          const selected = selectedMemberIds.includes(member.id);
                          const occupied = Boolean(member.currentSquadId);

                          return (
                            <button
                              key={member.id}
                              type="button"
                              onClick={() => toggleMember(member.id)}
                              className={
                                selected
                                  ? "w-full rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-left"
                                  : "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300"
                              }
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">
                                    {member.name}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {member.roleLabel} 路 {member.baseLabel || "未设置基地"}
                                  </div>
                                  <div className="mt-2 text-xs text-slate-400">
                                    {occupied
                                      ? `当前在 ${member.currentSquadName}`
                                      : "当前未编入班组"}
                                  </div>
                                </div>

                                <div className="flex flex-col items-end gap-2">
                                  <span
                                    className={
                                      selected
                                        ? "rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white"
                                        : "rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500"
                                    }
                                  >
                                    {selected ? "已选择" : member.statusLabel}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {errorMessage ? (
                  <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                    {errorMessage}
                  </div>
                ) : null}
              </div>

              <div className="mt-6 flex flex-shrink-0 items-center justify-between gap-4 border-t border-slate-100 bg-white pt-5">
                <div className="text-sm text-slate-500">
                  编队建好后，工单详情页里的施工队分配人员会直接读取这里的结果。
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  >
                    {isPending ? "创建中..." : "创建编队"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
