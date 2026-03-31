import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { dissolveCollaborationSpace } from "@/lib/workspace/server";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await context.params;

  try {
    const result = await dissolveCollaborationSpace({
      actor: user,
      workspaceId,
    });

    if (!result) {
      return NextResponse.json({ message: "Space not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, workspaceId: result.workspaceId });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "只有空间创建者可以解散空间" }, { status: 403 });
    }

    return NextResponse.json({ message: "解散空间失败，请稍后重试" }, { status: 500 });
  }
}
