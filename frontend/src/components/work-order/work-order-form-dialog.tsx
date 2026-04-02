"use client";

import { useMemo, useState, useTransition } from "react";

export type ResponsibleUserOption = {
  id: string;
  name: string;
  teamLabel: string;
  roleLabel: string;
};

export type CollaborationSpaceOption = {
  id: string;
  name: string;
  summary: string;
};

export type SourceType = "email" | "wechat" | "phone" | "manual" | "other";
export type Priority = "low" | "normal" | "high" | "urgent";
export type WorkOrderStage =
  | "source_intake"
  | "registration"
  | "dispatch"
  | "warning"
  | "field_construction"
  | "return_sheet"
  | "drawing_delivery"
  | "resource_entry"
  | "resource_audit"
  | "design_package";
type SpaceMode = "existing" | "create";
type SpaceTone = "blue" | "amber" | "emerald" | "violet";

export type WorkOrderFormInitialValues = {
  workOrderNo?: string;
  title?: string;
  sourceType?: SourceType;
  priority?: Priority;
  sourceSummary?: string;
  projectName?: string;
  siteName?: string;
  siteAddress?: string;
  currentResponsibleUserId?: string | null;
  currentResponsibleTeam?: string;
  currentStage?: WorkOrderStage;
  progressPercent?: number | null;
  collaborationSpaceId?: string | null;
  dedicatedSpaceName?: string;
  dedicatedSpaceSummary?: string;
  dedicatedSpaceTone?: SpaceTone;
};

export type WorkOrderFormSubmitPayload = {
  workOrderNo: string;
  title: string;
  sourceType: SourceType;
  priority: Priority;
  sourceSummary: string;
  projectName: string;
  siteName: string;
  siteAddress: string;
  currentResponsibleUserId: string | null;
  currentResponsibleTeam: string;
  currentStage: WorkOrderStage;
  progressPercent: number;
  collaborationSpaceId: string | null;
  createDedicatedSpace: boolean;
  dedicatedSpaceName: string;
  dedicatedSpaceSummary: string;
  dedicatedSpaceTone: SpaceTone;
};

type WorkOrderFormDialogProps = {
  mode: "create" | "edit";
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: WorkOrderFormSubmitPayload) => Promise<void>;
  responsibleUsers: ResponsibleUserOption[];
  collaborationSpaces: CollaborationSpaceOption[];
  defaultResponsibleUserId?: string | null;
  defaultResponsibleTeam?: string;
  initialValues?: WorkOrderFormInitialValues;
};

const sourceTypeOptions: Array<{ value: SourceType; label: string }> = [
  { value: "email", label: "邮箱" },
  { value: "wechat", label: "微信" },
  { value: "phone", label: "电话" },
  { value: "manual", label: "人工" },
  { value: "other", label: "其他" },
];

const priorityOptions: Array<{ value: Priority; label: string }> = [
  { value: "low", label: "低" },
  { value: "normal", label: "普通" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" },
];

const workOrderStageOptions: Array<{ value: WorkOrderStage; label: string }> = [
  { value: "source_intake", label: "来源" },
  { value: "registration", label: "登记" },
  { value: "dispatch", label: "派单" },
  { value: "warning", label: "预警" },
  { value: "field_construction", label: "施工" },
  { value: "return_sheet", label: "回单" },
  { value: "drawing_delivery", label: "图纸" },
  { value: "resource_entry", label: "录资" },
  { value: "resource_audit", label: "稽核" },
  { value: "design_package", label: "出设" },
];

const spaceToneOptions: Array<{
  value: SpaceTone;
  label: string;
  activeClassName: string;
}> = [
  {
    value: "blue",
    label: "蓝色",
    activeClassName: "bg-blue-100 text-blue-700 ring-1 ring-blue-200",
  },
  {
    value: "amber",
    label: "橙色",
    activeClassName: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  },
  {
    value: "emerald",
    label: "绿色",
    activeClassName: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
  },
  {
    value: "violet",
    label: "紫色",
    activeClassName: "bg-violet-100 text-violet-700 ring-1 ring-violet-200",
  },
];

function buildSuggestedSpaceName(title: string) {
  const trimmedTitle = title.trim();
  return trimmedTitle ? `${trimmedTitle} 协作空间` : "新工单协作空间";
}

function clampPercent(value: number) {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function estimateProgressFromForm(input: {
  sourceSummary: string;
  projectName: string;
  siteName: string;
  siteAddress: string;
  currentResponsibleTeam: string;
  currentResponsibleUserId: string;
}) {
  const checkpoints = [
    input.sourceSummary.trim(),
    input.projectName.trim(),
    input.siteName.trim(),
    input.siteAddress.trim(),
    input.currentResponsibleTeam.trim() || input.currentResponsibleUserId,
  ];
  const completed = checkpoints.filter(Boolean).length;

  return clampPercent((completed / checkpoints.length) * 100);
}

function createInitialState(
  initialValues: WorkOrderFormInitialValues | undefined,
  defaultResponsibleUserId?: string | null,
  defaultResponsibleTeam?: string,
  hasExistingSpaces = false,
) {
  const title = initialValues?.title ?? "";
  const collaborationSpaceId = initialValues?.collaborationSpaceId ?? "";

  return {
    workOrderNo: initialValues?.workOrderNo ?? "",
    title,
    sourceType: initialValues?.sourceType ?? ("manual" as SourceType),
    priority: initialValues?.priority ?? ("normal" as Priority),
    sourceSummary: initialValues?.sourceSummary ?? "",
    projectName: initialValues?.projectName ?? "",
    siteName: initialValues?.siteName ?? "",
    siteAddress: initialValues?.siteAddress ?? "",
    currentStage:
      initialValues?.currentStage ?? ("registration" as WorkOrderStage),
    progressPercentOverride:
      typeof initialValues?.progressPercent === "number"
        ? String(clampPercent(initialValues.progressPercent))
        : "",
    currentResponsibleUserId:
      initialValues?.currentResponsibleUserId ?? defaultResponsibleUserId ?? "",
    currentResponsibleTeam:
      initialValues?.currentResponsibleTeam ?? defaultResponsibleTeam ?? "",
    collaborationSpaceId,
    spaceMode: (collaborationSpaceId || hasExistingSpaces ? "existing" : "create") as SpaceMode,
    dedicatedSpaceName:
      initialValues?.dedicatedSpaceName ?? buildSuggestedSpaceName(title),
    dedicatedSpaceSummary: initialValues?.dedicatedSpaceSummary ?? "",
    dedicatedSpaceTone: initialValues?.dedicatedSpaceTone ?? ("blue" as SpaceTone),
  };
}

export function WorkOrderFormDialog({
  mode,
  open,
  onClose,
  onSubmit,
  responsibleUsers,
  collaborationSpaces,
  defaultResponsibleUserId,
  defaultResponsibleTeam,
  initialValues,
}: WorkOrderFormDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");
  const [formState, setFormState] = useState(() =>
    createInitialState(
      initialValues,
      defaultResponsibleUserId,
      defaultResponsibleTeam,
      collaborationSpaces.length > 0,
    ),
  );

  const responsibleUserMap = useMemo(
    () => new Map(responsibleUsers.map((item) => [item.id, item])),
    [responsibleUsers],
  );

  const progressPercent =
    formState.progressPercentOverride === ""
      ? estimateProgressFromForm({
          sourceSummary: formState.sourceSummary,
          projectName: formState.projectName,
          siteName: formState.siteName,
          siteAddress: formState.siteAddress,
          currentResponsibleTeam: formState.currentResponsibleTeam,
          currentResponsibleUserId: formState.currentResponsibleUserId,
        })
      : clampPercent(Number(formState.progressPercentOverride));

  function closeModal() {
    if (isPending) {
      return;
    }

    onClose();
  }

  function updateField<Key extends keyof typeof formState>(
    key: Key,
    value: (typeof formState)[Key],
  ) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function switchSpaceMode(nextMode: SpaceMode) {
    setFormState((current) => ({
      ...current,
      spaceMode: nextMode,
      dedicatedSpaceName:
        nextMode === "create"
          ? current.dedicatedSpaceName || buildSuggestedSpaceName(current.title)
          : current.dedicatedSpaceName,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!formState.title.trim()) {
      setErrorMessage("请先填写工单标题。");
      return;
    }

    startTransition(async () => {
      try {
        await onSubmit({
          workOrderNo: formState.workOrderNo.trim(),
          title: formState.title.trim(),
          sourceType: formState.sourceType,
          priority: formState.priority,
          sourceSummary: formState.sourceSummary.trim(),
          projectName: formState.projectName.trim(),
          siteName: formState.siteName.trim(),
          siteAddress: formState.siteAddress.trim(),
          currentResponsibleUserId:
            formState.currentResponsibleUserId || null,
          currentResponsibleTeam: formState.currentResponsibleTeam.trim(),
          currentStage: formState.currentStage,
          progressPercent,
          collaborationSpaceId:
            formState.spaceMode === "existing"
              ? formState.collaborationSpaceId || null
              : null,
          createDedicatedSpace: formState.spaceMode === "create",
          dedicatedSpaceName:
            formState.spaceMode === "create"
              ? formState.dedicatedSpaceName.trim() ||
                buildSuggestedSpaceName(formState.title)
              : "",
          dedicatedSpaceSummary:
            formState.spaceMode === "create"
              ? formState.dedicatedSpaceSummary.trim()
              : "",
          dedicatedSpaceTone:
            formState.spaceMode === "create"
              ? formState.dedicatedSpaceTone
              : "blue",
        });

        onClose();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : mode === "create"
              ? "创建工单失败，请稍后再试。"
              : "保存工单失败，请稍后再试。",
        );
      }
    });
  }

  if (!open) {
    return null;
  }

  const badgeLabel = mode === "create" ? "新建工单" : "编辑工单";
  const heading = mode === "create" ? "先把工单立起来" : "调整当前工单信息";
  const description =
    mode === "create"
      ? "先录入最小必要信息，后面的材料、图纸、回单和资源都可以继续补。"
      : "这里先改基础信息，删除工单不会解散已关联的合作空间。";
  const submitLabel = mode === "create" ? "创建工单" : "保存修改";
  const pendingLabel = mode === "create" ? "创建中..." : "保存中...";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-sm">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.18)]">
        <div className="flex flex-shrink-0 items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {badgeLabel}
            </div>
            <h2 className="mt-3 text-[1.8rem] font-black tracking-tight text-slate-950">
              {heading}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
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
            <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-5">
                <label className="block">
                  <div className="mb-2 text-sm font-semibold text-slate-700">工单编号</div>
                  <input
                    value={formState.workOrderNo}
                    onChange={(event) => updateField("workOrderNo", event.target.value)}
                    placeholder={
                      mode === "create" ? "可手动填写，不填则自动生成" : "例如：WO-20260401-001"
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  />
                </label>

                <label className="block">
                  <div className="mb-2 text-sm font-semibold text-slate-700">工单标题</div>
                  <input
                    value={formState.title}
                    onChange={(event) => {
                      const nextTitle = event.target.value;
                      setFormState((current) => ({
                        ...current,
                        title: nextTitle,
                        dedicatedSpaceName:
                          current.spaceMode === "create" &&
                          (!current.dedicatedSpaceName ||
                            current.dedicatedSpaceName ===
                              buildSuggestedSpaceName(current.title))
                            ? buildSuggestedSpaceName(nextTitle)
                            : current.dedicatedSpaceName,
                      }));
                    }}
                    placeholder="例如：核心机房空调系统扩容"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  />
                </label>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-700">当前节点</div>
                    <select
                      value={formState.currentStage}
                      onChange={(event) =>
                        updateField("currentStage", event.target.value as WorkOrderStage)
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    >
                      {workOrderStageOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
                      <span>当前节点进度</span>
                      <span className="text-blue-600">{progressPercent}%</span>
                    </div>
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={progressPercent}
                        onChange={(event) =>
                          updateField("progressPercentOverride", event.target.value)
                        }
                        className="h-2 w-full accent-blue-600"
                      />
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={formState.progressPercentOverride}
                          onChange={(event) =>
                            updateField("progressPercentOverride", event.target.value)
                          }
                          placeholder="自动"
                          className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        />
                        <button
                          type="button"
                          onClick={() => updateField("progressPercentOverride", "")}
                          className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-100"
                        >
                          按当前信息自动估算
                        </button>
                      </div>
                    </div>
                  </label>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <div className="mb-2 text-sm font-semibold text-slate-700">来源渠道</div>
                    <div className="flex flex-wrap gap-2">
                      {sourceTypeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateField("sourceType", option.value)}
                          className={
                            formState.sourceType === option.value
                              ? "rounded-full bg-blue-100 px-3 py-2 text-xs font-semibold text-blue-700"
                              : "rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-200"
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-semibold text-slate-700">优先级</div>
                    <div className="flex flex-wrap gap-2">
                      {priorityOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateField("priority", option.value)}
                          className={
                            formState.priority === option.value
                              ? "rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                              : "rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-200"
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-700">
                      当前节点负责人
                    </div>
                    <select
                      value={formState.currentResponsibleUserId}
                      onChange={(event) => {
                        const nextUserId = event.target.value;
                        updateField("currentResponsibleUserId", nextUserId);
                        const nextUser = responsibleUserMap.get(nextUserId);
                        if (nextUser) {
                          updateField("currentResponsibleTeam", nextUser.teamLabel);
                        }
                      }}
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
                    <div className="mb-2 text-sm font-semibold text-slate-700">责任团队</div>
                    <input
                      value={formState.currentResponsibleTeam}
                      onChange={(event) =>
                        updateField("currentResponsibleTeam", event.target.value)
                      }
                      placeholder="例如：工程执行组"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-700">项目名称</div>
                    <input
                      value={formState.projectName}
                      onChange={(event) => updateField("projectName", event.target.value)}
                      placeholder="例如：园区机房改造"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-semibold text-slate-700">站点名称</div>
                    <input
                      value={formState.siteName}
                      onChange={(event) => updateField("siteName", event.target.value)}
                      placeholder="例如：高新区核心机房"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                </div>

                <label className="block">
                  <div className="mb-2 text-sm font-semibold text-slate-700">现场地址</div>
                  <input
                    value={formState.siteAddress}
                    onChange={(event) => updateField("siteAddress", event.target.value)}
                    placeholder="例如：长沙市岳麓区高新区主楼 B1"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  />
                </label>

                <label className="block">
                  <div className="mb-2 text-sm font-semibold text-slate-700">
                    来源 / 需求摘要
                  </div>
                  <textarea
                    value={formState.sourceSummary}
                    onChange={(event) => updateField("sourceSummary", event.target.value)}
                    placeholder="先写一句最小需求摘要，例如：客户要求本周完成夜间施工排期。"
                    rows={4}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
              </div>

              <div className="space-y-5">
                <div className="rounded-[26px] border border-slate-200 bg-white p-5">
                  <div className="mb-3 text-sm font-semibold text-slate-700">合作空间</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => switchSpaceMode("existing")}
                      className={
                        formState.spaceMode === "existing"
                          ? "rounded-full bg-blue-100 px-3 py-2 text-xs font-semibold text-blue-700"
                          : "rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-200"
                      }
                    >
                      关联已有空间
                    </button>
                    <button
                      type="button"
                      onClick={() => switchSpaceMode("create")}
                      className={
                        formState.spaceMode === "create"
                          ? "rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                          : "rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-200"
                      }
                    >
                      新建专属空间
                    </button>
                  </div>

                  {formState.spaceMode === "existing" ? (
                    <div className="mt-4 space-y-4">
                      <select
                        value={formState.collaborationSpaceId}
                        onChange={(event) =>
                          updateField("collaborationSpaceId", event.target.value)
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="">暂不关联</option>
                        {collaborationSpaces.map((space) => (
                          <option key={space.id} value={space.id}>
                            {space.name}
                          </option>
                        ))}
                      </select>

                      {collaborationSpaces.length > 0 ? (
                        <div className="space-y-3">
                          {collaborationSpaces.slice(0, 4).map((space) => (
                            <button
                              key={space.id}
                              type="button"
                              onClick={() => updateField("collaborationSpaceId", space.id)}
                              className={
                                formState.collaborationSpaceId === space.id
                                  ? "w-full rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-left"
                                  : "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300"
                              }
                            >
                              <div className="text-sm font-semibold text-slate-900">
                                {space.name}
                              </div>
                              <div className="mt-1 text-xs leading-5 text-slate-500">
                                {space.summary || "这个空间后面可以直接承接工单相关资料。"}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-500">
                          你目前还没有可关联的合作空间，可以直接切到“新建专属空间”。
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      <label className="block">
                        <div className="mb-2 text-sm font-semibold text-slate-700">
                          专属空间名称
                        </div>
                        <input
                          value={formState.dedicatedSpaceName}
                          onChange={(event) =>
                            updateField("dedicatedSpaceName", event.target.value)
                          }
                          placeholder={buildSuggestedSpaceName(formState.title)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        />
                      </label>

                      <label className="block">
                        <div className="mb-2 text-sm font-semibold text-slate-700">空间说明</div>
                        <textarea
                          value={formState.dedicatedSpaceSummary}
                          onChange={(event) =>
                            updateField("dedicatedSpaceSummary", event.target.value)
                          }
                          rows={3}
                          placeholder="例如：用于整理本工单的图纸、现场照片、回单和协作记录。"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        />
                      </label>

                      <div>
                        <div className="mb-2 text-sm font-semibold text-slate-700">空间颜色</div>
                        <div className="flex flex-wrap gap-2">
                          {spaceToneOptions.map((tone) => (
                            <button
                              key={tone.value}
                              type="button"
                              onClick={() => updateField("dedicatedSpaceTone", tone.value)}
                              className={
                                formState.dedicatedSpaceTone === tone.value
                                  ? `rounded-full px-3 py-2 text-xs font-semibold ${tone.activeClassName}`
                                  : "rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-200"
                              }
                            >
                              {tone.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm leading-6 text-blue-700">
                        {mode === "create"
                          ? "创建工单时会同步建立一个服务于这单的合作空间，后续图纸、现场照片、回单和协作记录都能直接往里面放。"
                          : "保存时会同时新建一个服务于这单的合作空间，工单本身不会被重建。"}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-5">
                  <div className="text-sm font-semibold text-slate-500">
                    {mode === "create" ? "创建后会自动完成" : "保存后会自动完成"}
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-slate-600">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-500" />
                      <span>工单会按你选择的节点和进度，直接出现在当前列表里。</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-500" />
                      <span>来源摘要、站点信息和责任归属会同步刷新到工单真源。</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-500" />
                      <span>缺失项会按你当前填写情况重新计算，但不会拦截保存。</span>
                    </div>
                    {formState.spaceMode === "create" ? (
                      <div className="flex items-start gap-3">
                        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-500" />
                        <span>专属合作空间会一并建立，后续文件可以直接沉淀到空间里。</span>
                      </div>
                    ) : null}
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
              这一步先把工单主线立起来，材料完整度、缺失项和合作空间都可以顺着这条线继续往下补。
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
                {isPending ? pendingLabel : submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
