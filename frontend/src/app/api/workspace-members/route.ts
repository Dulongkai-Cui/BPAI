import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import {
  getWorkspaceContactOptions,
  getWorkspaceMemberProfiles,
  inviteMembersToWorkspace,
  removeMemberFromWorkspace,
} from "@/lib/workspace/server";

type WorkspaceMemberPayload = {
  action?: "invite" | "remove";
  workspaceId?: string;
  memberEmails?: string[];
  memberEmail?: string;
};

function isAction(value: unknown): value is "invite" | "remove" {
  return value === "invite" || value === "remove";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as WorkspaceMemberPayload | null;

  if (
    !payload ||
    !isAction(payload.action) ||
    typeof payload.workspaceId !== "string" ||
    !payload.workspaceId.trim()
  ) {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  try {
    if (payload.action === "invite") {
      if (!Array.isArray(payload.memberEmails) || payload.memberEmails.length === 0) {
        return NextResponse.json({ message: "请选择联系人" }, { status: 400 });
      }

      await inviteMembersToWorkspace({
        actor: user,
        workspaceId: payload.workspaceId.trim(),
        memberEmails: payload.memberEmails,
      });
    } else {
      if (typeof payload.memberEmail !== "string" || !payload.memberEmail.trim()) {
        return NextResponse.json({ message: "缺少成员邮箱" }, { status: 400 });
      }

      await removeMemberFromWorkspace({
        actor: user,
        workspaceId: payload.workspaceId.trim(),
        memberEmail: payload.memberEmail.trim(),
      });
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "FORBIDDEN") {
        return NextResponse.json({ message: "你没有管理该空间成员的权限" }, { status: 403 });
      }

      if (error.message === "CANNOT_REMOVE_OWNER") {
        return NextResponse.json({ message: "不能移除空间拥有者" }, { status: 400 });
      }
    }

    return NextResponse.json({ message: "成员操作失败，请稍后再试" }, { status: 500 });
  }

  const [members, contacts] = await Promise.all([
    getWorkspaceMemberProfiles(payload.workspaceId.trim()),
    getWorkspaceContactOptions(payload.workspaceId.trim()),
  ]);

  return NextResponse.json({
    ok: true,
    members,
    contacts,
  });
}
