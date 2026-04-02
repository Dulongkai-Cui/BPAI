import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/server";
import {
  createEngineeringSquad,
  listEngineeringSquads,
} from "@/lib/engineering-team/server";

type CreateEngineeringSquadPayload = {
  name?: string;
  code?: string;
  leaderMemberId?: string | null;
  memberIds?: string[];
  baseLabel?: string;
  summary?: string;
  note?: string;
};

export async function GET() {
  try {
    await requireCurrentUser();
    const squads = await listEngineeringSquads();
    return NextResponse.json({ squads });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      error.message === "Unauthorized"
    ) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json(
      { message: "加载编队列表失败，请稍后再试。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    const payload = (await request.json()) as CreateEngineeringSquadPayload;
    const squad = await createEngineeringSquad(currentUser, {
      name: payload.name ?? "",
      code: payload.code,
      leaderMemberId: payload.leaderMemberId ?? null,
      memberIds: payload.memberIds ?? [],
      baseLabel: payload.baseLabel,
      summary: payload.summary,
      note: payload.note,
      createdByUserId: currentUser.id,
    });

    return NextResponse.json({ squad }, { status: 201 });
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
      { message: "创建编队失败，请稍后再试。" },
      { status: 500 },
    );
  }
}
