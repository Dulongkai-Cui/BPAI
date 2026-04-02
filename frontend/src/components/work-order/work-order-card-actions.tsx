"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  WorkOrderFormDialog,
  type CollaborationSpaceOption,
  type ResponsibleUserOption,
  type SourceType,
  type Priority,
  type WorkOrderFormSubmitPayload,
  type WorkOrderStage,
} from "@/components/work-order/work-order-form-dialog";

type WorkOrderCardActionItem = {
  id: string;
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
  stage: WorkOrderStage;
  materialCompleteness: number;
  collaborationSpaceId: string | null;
};

type WorkOrderCardActionsProps = {
  item: WorkOrderCardActionItem;
  responsibleUsers: ResponsibleUserOption[];
  collaborationSpaces: CollaborationSpaceOption[];
  tone?: "default" | "light";
};

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

export function WorkOrderCardActions({
  item,
  responsibleUsers,
  collaborationSpaces,
  tone = "default",
}: WorkOrderCardActionsProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  async function handleEditSubmit(payload: WorkOrderFormSubmitPayload) {
    const response = await fetch(`/api/work-orders/${item.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as { message?: string };

    if (!response.ok) {
      throw new Error(result.message || "保存工单失败，请稍后再试。");
    }

    setEditOpen(false);
    setMenuOpen(false);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);

    try {
      const response = await fetch(`/api/work-orders/${item.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(result.message || "删除工单失败，请稍后再试。");
      }

      setDeleteOpen(false);
      setMenuOpen(false);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className={
            tone === "light"
              ? "rounded-full p-2 text-white/75 transition hover:bg-white/10 hover:text-white"
              : "rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          }
          aria-label="工单操作"
        >
          <DotsIcon />
        </button>

        {menuOpen ? (
          <div className="absolute right-0 top-11 z-20 min-w-32 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_48px_rgba(15,23,42,0.14)]">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setEditOpen(true);
              }}
              className="flex w-full items-center rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setDeleteOpen(true);
              }}
              className="mt-1 flex w-full items-center rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              删除
            </button>
          </div>
        ) : null}
      </div>

      {editOpen ? (
        <WorkOrderFormDialog
          mode="edit"
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSubmit={handleEditSubmit}
          responsibleUsers={responsibleUsers}
          collaborationSpaces={collaborationSpaces}
          initialValues={{
            workOrderNo: item.workOrderNo,
            title: item.title,
            sourceType: item.sourceType,
            priority: item.priority,
            sourceSummary: item.sourceSummary,
            projectName: item.projectName,
            siteName: item.siteName,
            siteAddress: item.siteAddress,
            currentResponsibleUserId: item.currentResponsibleUserId,
            currentResponsibleTeam: item.currentResponsibleTeam,
            currentStage: item.stage,
            progressPercent: item.materialCompleteness,
            collaborationSpaceId: item.collaborationSpaceId,
          }}
        />
      ) : null}

      {deleteOpen ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_28px_90px_rgba(15,23,42,0.18)]">
            <div className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
              删除工单
            </div>
            <h3 className="mt-3 text-[1.45rem] font-black tracking-tight text-slate-950">
              删掉后这张工单就要重新开始了
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              工单删除后，当前记录、缺失项和阶段进度都会一起消失。已经关联的合作空间不会解散，空间里的文件和协作内容会保留。
            </p>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-medium text-slate-400">即将删除</div>
              <div className="mt-1 text-base font-black text-slate-950">{item.title}</div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => !deleting && setDeleteOpen(false)}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {deleting ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
