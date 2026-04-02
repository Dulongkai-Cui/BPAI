import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/server";
import {
  archiveEngineeringSquad,
  updateEngineeringSquad,
} from "@/lib/engineering-team/server";

type UpdateEngineeringSquadPayload = {
  name?: string;
  code?: string;
  leaderMemberId?: string | null;
  memberIds?: string[];
  baseLabel?: string;
  summary?: string;
  note?: string;
  status?: "standby" | "assigned" | "in_transit" | "on_site" | "paused" | "archived";
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ squadId: string }> },
) {
  try {
    const currentUser = await requireCurrentUser();
    const { squadId } = await context.params;
    const payload = (await request.json()) as UpdateEngineeringSquadPayload;
    const squad = await updateEngineeringSquad(currentUser, {
      id: squadId,
      name: payload.name,
      code: payload.code,
      leaderMemberId: payload.leaderMemberId ?? undefined,
      memberIds: payload.memberIds,
      baseLabel: payload.baseLabel,
      summary: payload.summary,
      note: payload.note,
      status: payload.status,
    });

    if (!squad) {
      return NextResponse.json({ message: "编队不存在。" }, { status: 404 });
    }

    return NextResponse.json({ squad });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "FORBIDDEN") {
        return NextResponse.json(
          { message: "只有调度或系统管理员可以维护编队。" },
          { status: 403 },
        );
      }
      if (error.message === "INVALID_SQUAD_NAME") {
        return NextResponse.json({ message: "请先填写编队名称。" }, { status: 400 });
      }
      if (error.message === "INVALID_SQUAD_CODE") {
        return NextResponse.json({ message: "请先填写编队编号。" }, { status: 400 });
      }
      if (error.message === "INVALID_MEMBER_IDS") {
        return NextResponse.json(
          { message: "选择的施工人员不存在，请刷新后重试。" },
          { status: 400 },
        );
      }
      if (error.message === "SQUAD_ALREADY_EXISTS") {
        return NextResponse.json(
          { message: "编队名称或编号已存在，请换一个。" },
          { status: 409 },
        );
      }
    }

    console.error(error);
    return NextResponse.json(
      { message: "更新编队失败，请稍后再试。" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ squadId: string }> },
) {
  try {
    const currentUser = await requireCurrentUser();
    const { squadId } = await context.params;
    const archived = await archiveEngineeringSquad(currentUser, squadId);

    if (!archived) {
      return NextResponse.json({ message: "编队不存在。" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "FORBIDDEN") {
        return NextResponse.json(
          { message: "只有调度或系统管理员可以维护编队。" },
          { status: 403 },
        );
      }
    }

    console.error(error);
    return NextResponse.json(
      { message: "归档编队失败，请稍后再试。" },
      { status: 500 },
    );
  }
}
