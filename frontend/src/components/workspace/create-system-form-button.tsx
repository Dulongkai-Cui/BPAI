"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import type { FormState, SpaceTone } from "@/lib/workspace/mock-data";

type SystemFormSpaceMemberOption = {
  email: string;
  name: string;
  roleLabel: string;
  teamLabel: string;
};

type SystemFormSpaceOption = {
  id: string;
  name: string;
  summary: string;
  tone: SpaceTone;
  memberOptions: SystemFormSpaceMemberOption[];
};

type CreateSystemFormButtonProps = {
  spaces: SystemFormSpaceOption[];
};

const formTypeOptions = [
  "仓库主表",
  "材料缺项表",
  "工单台账",
  "执行底表",
  "送审主表",
  "业务台账",
] as const;

const stateOptions: FormState[] = ["已分配", "处理中", "待确认", "本周重点"];

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function toneClasses(tone: SpaceTone) {
  if (tone === "amber") {
    return "border-amber-200 bg-amber-50/70";
  }

  if (tone === "emerald") {
    return "border-emerald-200 bg-emerald-50/70";
  }

  if (tone === "violet") {
    return "border-violet-200 bg-violet-50/70";
  }

  return "border-blue-200 bg-blue-50/70";
}

export function CreateSystemFormButton({ spaces }: CreateSystemFormButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [formType, setFormType] = useState<string>(formTypeOptions[0]);
  const [state, setState] = useState<FormState>("已分配");
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  const [assigneeEmail, setAssigneeEmail] = useState(
    spaces[0]?.memberOptions[0]?.email ?? "",
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeSpace = useMemo(
    () => spaces.find((space) => space.id === spaceId) ?? spaces[0] ?? null,
    [spaceId, spaces],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  function closePanel() {
    setIsOpen(false);
    setError("");
    setIsSubmitting(false);
  }

  function openPanel() {
    setError("");

    if (!activeSpace && spaces[0]) {
      setSpaceId(spaces[0].id);
      setAssigneeEmail(spaces[0].memberOptions[0]?.email ?? "");
    } else if (
      activeSpace &&
      !activeSpace.memberOptions.some((member) => member.email === assigneeEmail)
    ) {
      setAssigneeEmail(activeSpace.memberOptions[0]?.email ?? "");
    }

    setIsOpen(true);
  }

  function selectSpace(nextSpace: SystemFormSpaceOption) {
    setSpaceId(nextSpace.id);
    setAssigneeEmail((current) => {
      if (nextSpace.memberOptions.some((member) => member.email === current)) {
        return current;
      }

      return nextSpace.memberOptions[0]?.email ?? "";
    });
  }

  function handleSubmit() {
    void (async () => {
      setError("");
      setIsSubmitting(true);

      const response = await fetch("/api/system-forms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          formType,
          state,
          spaceId,
          assigneeEmail,
        }),
      }).catch(() => null);

      if (!response) {
        setError("系统表单创建失败，请检查本地服务。");
        setIsSubmitting(false);
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | {
            message?: string;
            form?: { spaceId: string; assigneeEmail: string };
          }
        | null;

      if (!response.ok || !payload?.form) {
        setError(payload?.message ?? "系统表单创建失败，请稍后再试。");
        setIsSubmitting(false);
        return;
      }

      closePanel();
      router.refresh();
    })();
  }

  const canUsePortal = typeof window !== "undefined";

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        disabled={spaces.length === 0}
        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        新建并分配系统表单
      </button>

      {canUsePortal && isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/28 px-4 py-8 backdrop-blur-md"
              onClick={closePanel}
            >
              <div
                className="max-h-[calc(100vh-4rem)] w-full max-w-5xl overflow-y-auto rounded-[32px] border border-white/80 bg-white/96 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.22)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      系统表单后台控制
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                      新建并分配系统表单
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      系统表单不挂到普通合作空间，而是进入受控的系统后台域。开发者主账号、老板账号和 AI 负责管理，被分配账号默认只有编辑权。
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closePanel}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                    aria-label="关闭"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="space-y-5">
                    <div className="rounded-[26px] border border-slate-200 bg-slate-50/85 p-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                            表单名称
                          </div>
                          <input
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="例如：仓库材料总表"
                            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>

                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                            表单类型
                          </div>
                          <select
                            value={formType}
                            onChange={(event) => setFormType(event.target.value)}
                            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          >
                            {formTypeOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                            初始状态
                          </div>
                          <select
                            value={state}
                            onChange={(event) => setState(event.target.value as FormState)}
                            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          >
                            {stateOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-slate-200 bg-white p-5">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                            所属系统后台
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {spaces.map((space) => {
                          const selected = activeSpace?.id === space.id;

                          return (
                            <button
                              key={space.id}
                              type="button"
                              onClick={() => selectSpace(space)}
                              className={`rounded-[22px] border p-4 text-left transition ${
                                selected
                                  ? `${toneClasses(space.tone)} border-slate-900 shadow-sm`
                                  : "border-slate-200 bg-slate-50/70 hover:border-slate-300"
                              }`}
                            >
                              <div className="text-sm font-semibold text-slate-900">
                                {space.name}
                              </div>
                              <div className="mt-2 text-xs leading-5 text-slate-500">
                                {space.summary}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[26px] border border-slate-200 bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          分配给谁
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          这里分配的是主维护账号。被分配账号只有编辑权，不能上传、删除或改动后台控制规则。
                        </div>
                      </div>
                      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                        {activeSpace?.memberOptions.length ?? 0} 人
                      </div>
                    </div>

                    <div className="mt-4 max-h-[380px] space-y-3 overflow-y-auto pr-1">
                      {(activeSpace?.memberOptions ?? []).map((member) => {
                        const selected = assigneeEmail === member.email;

                        return (
                          <button
                            key={member.email}
                            type="button"
                            onClick={() => setAssigneeEmail(member.email)}
                            className={`flex w-full items-start gap-3 rounded-[22px] border px-4 py-3 text-left transition ${
                              selected
                                ? "border-blue-200 bg-blue-50/70"
                                : "border-slate-200 bg-slate-50/70 hover:border-slate-300"
                            }`}
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                              {initials(member.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900">
                                {member.name}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {member.roleLabel}
                              </div>
                              <div className="mt-1 text-xs text-slate-400">
                                {member.teamLabel}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {error ? (
                  <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closePanel}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting || !spaceId || !assigneeEmail}
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? "创建中..." : "创建并分配"}
                  </button>
                </div>
              </div>
            </div>,
            window.document.body,
          )
        : null}
    </>
  );
}
