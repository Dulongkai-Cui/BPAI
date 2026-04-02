"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  WorkOrderFormDialog,
  type CollaborationSpaceOption,
  type ResponsibleUserOption,
  type WorkOrderFormSubmitPayload,
} from "@/components/work-order/work-order-form-dialog";

type CreateWorkOrderButtonProps = {
  responsibleUsers: ResponsibleUserOption[];
  collaborationSpaces: CollaborationSpaceOption[];
  defaultResponsibleUserId?: string | null;
  defaultResponsibleTeam?: string;
};

export function CreateWorkOrderButton({
  responsibleUsers,
  collaborationSpaces,
  defaultResponsibleUserId,
  defaultResponsibleTeam,
}: CreateWorkOrderButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSubmit(payload: WorkOrderFormSubmitPayload) {
    const response = await fetch("/api/work-orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as { message?: string };

    if (!response.ok) {
      throw new Error(result.message || "创建工单失败，请稍后再试。");
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
      >
        <span className="text-lg leading-none">+</span>
        <span>新建工单</span>
      </button>

      {open ? (
        <WorkOrderFormDialog
          mode="create"
          open={open}
          onClose={() => setOpen(false)}
          onSubmit={handleSubmit}
          responsibleUsers={responsibleUsers}
          collaborationSpaces={collaborationSpaces}
          defaultResponsibleUserId={defaultResponsibleUserId}
          defaultResponsibleTeam={defaultResponsibleTeam}
        />
      ) : null}
    </>
  );
}
