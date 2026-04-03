"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useWorkOrderStageSelection } from "@/components/work-order/work-order-stage-selection-context";

type StagePreset = {
  stage: string;
  label: string;
  folderId: string;
  folderName: string;
  description: string;
  tone: "blue" | "amber" | "emerald" | "slate" | "violet" | "rose";
};

type StageDocumentLink = {
  id: string;
  title: string;
  relationNote: string;
  stage: string | null;
  folderName: string | null;
  updatedAtLabel: string;
};

type WorkOrderStageAssetPanelProps = {
  workOrderId: string;
  workOrderNo: string;
  projectName: string;
  siteName: string;
  siteAddress: string;
  collaborationSpaceId: string | null;
  collaborationSpaceName: string | null;
  currentStage: string;
  stagePresets: StagePreset[];
  stageLinks: StageDocumentLink[];
};

function toneClass(tone: StagePreset["tone"]) {
  switch (tone) {
    case "blue":
      return "bg-blue-100 text-blue-700";
    case "amber":
      return "bg-amber-100 text-amber-700";
    case "emerald":
      return "bg-emerald-100 text-emerald-700";
    case "violet":
      return "bg-violet-100 text-violet-700";
    case "rose":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function fallback(value: string) {
  return value.trim() || "未填写";
}

export function WorkOrderStageAssetPanel({
  workOrderId,
  workOrderNo,
  projectName,
  siteName,
  siteAddress,
  collaborationSpaceId,
  collaborationSpaceName,
  currentStage,
  stagePresets,
  stageLinks,
}: WorkOrderStageAssetPanelProps) {
  const router = useRouter();
  const stageSelection = useWorkOrderStageSelection();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localSelectedStage, setLocalSelectedStage] = useState(
    stagePresets.some((item) => item.stage === currentStage)
      ? currentStage
      : (stagePresets[0]?.stage ?? currentStage),
  );
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);

  const selectedStage = stageSelection?.selectedStage ?? localSelectedStage;
  const setSelectedStage = stageSelection?.setSelectedStage ?? setLocalSelectedStage;

  const activePreset =
    stagePresets.find((item) => item.stage === selectedStage) ?? stagePresets[0] ?? null;
  const selectedLinks = useMemo(
    () => stageLinks.filter((item) => item.stage === selectedStage),
    [selectedStage, stageLinks],
  );

  function triggerFilePicker() {
    inputRef.current?.click();
  }

  function uploadFiles(files: File[]) {
    if (!activePreset || isPending) {
      return;
    }

    if (files.length === 0) {
      return;
    }

    startTransition(async () => {
      setErrorMessage("");
      const formData = new FormData();
      formData.append("stage", activePreset.stage);
      for (const file of files) {
        formData.append("files", file);
      }

      const response = await fetch(`/api/work-orders/${workOrderId}/stage-assets`, {
        method: "POST",
        body: formData,
      }).catch(() => null);

      if (!response?.ok) {
        const payload = await response?.json().catch(() => null);
        setErrorMessage(
          payload?.message || "上传节点资料失败，请稍后再试。",
        );
        return;
      }

      if (inputRef.current) {
        inputRef.current.value = "";
      }

      router.refresh();
    });
  }

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList) {
      return;
    }

    uploadFiles(Array.from(fileList).filter((file) => file.size > 0));
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();

    if (!activePreset || isPending) {
      return;
    }

    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();

    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragActive(false);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);

    if (!activePreset || isPending) {
      return;
    }

    uploadFiles(Array.from(event.dataTransfer.files ?? []).filter((file) => file.size > 0));
  }

  if (!collaborationSpaceId || !collaborationSpaceName) {
    return (
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-black tracking-tight text-slate-950">节点资料投递</h2>
        </div>
        <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          当前工单还没有关联合作空间，先在编辑工单里绑定或新建一个专属合作空间，再按节点上传资料。
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-950">节点资料投递</h2>
          <div className="mt-1 text-sm text-slate-500">
            直接把当前资料送进对应节点的合作空间预设文件夹。
          </div>
        </div>
        <button
          type="button"
          onClick={triggerFilePicker}
          disabled={!activePreset || isPending}
          className="inline-flex items-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending ? "上传中..." : "上传资料"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => handleFilesSelected(event.target.files)}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                工单编号
              </div>
              <div className="mt-1.5 text-sm font-semibold leading-6 text-slate-900">
                {workOrderNo}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                项目名称
              </div>
              <div className="mt-1.5 text-sm font-semibold leading-6 text-slate-900">
                {fallback(projectName)}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                站点名称
              </div>
              <div className="mt-1.5 text-sm font-semibold leading-6 text-slate-900">
                {fallback(siteName)}
              </div>
            </div>
            <div className="sm:col-span-2 xl:col-span-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                现场地址
              </div>
              <div className="mt-1.5 text-sm font-semibold leading-6 text-slate-900">
                {fallback(siteAddress)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {stagePresets.map((preset) => {
              const count = stageLinks.filter((item) => item.stage === preset.stage).length;
              const selected = preset.stage === selectedStage;

              return (
                <button
                  key={preset.stage}
                  type="button"
                  onClick={() => setSelectedStage(preset.stage)}
                  className={
                    selected
                      ? "rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm"
                      : "rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                  }
                >
                  {preset.label} ({count})
                </button>
              );
            })}
          </div>

          {activePreset ? (
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneClass(activePreset.tone)}`}>
                  {activePreset.label}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {collaborationSpaceName}
                </span>
              </div>
              <div className="mt-4 text-base font-black tracking-tight text-slate-950">
                {activePreset.folderName}
              </div>
              <div className="mt-2 text-sm leading-7 text-slate-600">
                {activePreset.description}
              </div>
              <div className="mt-3 text-xs font-medium text-slate-400">
                合作空间 / {collaborationSpaceName} / {activePreset.folderName}
              </div>
              {errorMessage ? (
                <div className="mt-3 text-sm font-semibold text-red-500">{errorMessage}</div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          className={
            isDragActive
              ? "rounded-[22px] border-2 border-dashed border-blue-400 bg-blue-50/70 p-4 transition"
              : "rounded-[22px] border border-slate-200 bg-white p-4 transition"
          }
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black tracking-tight text-slate-950">
                当前节点资料
              </div>
              <div className="mt-1 text-xs text-slate-500">
                这里显示当前选中节点已挂到工单上的资料。
              </div>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              共 {selectedLinks.length} 条
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {isDragActive ? (
              <div className="rounded-[18px] border border-dashed border-blue-300 bg-white px-4 py-5 text-sm font-semibold text-blue-700">
                把桌面材料拖到这里，放手后就会直接上传到当前节点对应的合作空间文件夹。
              </div>
            ) : null}
            {selectedLinks.length > 0 ? (
              selectedLinks.map((item) => (
                <article
                  key={item.id}
                  className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                  <div className="mt-1 text-xs leading-6 text-slate-500">
                    {item.folderName || item.relationNote}
                  </div>
                  <div className="mt-2 text-[11px] font-medium text-slate-400">
                    最近更新 {item.updatedAtLabel}
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                当前节点还没有挂接资料，点上方“上传资料”就会直接落到对应合作空间文件夹。
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
