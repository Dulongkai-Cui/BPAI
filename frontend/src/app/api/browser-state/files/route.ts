import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import {
  setBrowserFileLifecycleForUser,
  setBrowserFileLifecycleForWorkspace,
} from "@/lib/content/browser-state";
import type { StoredContentKind } from "@/lib/auth/types";

type BrowserFileLifecyclePayload = {
  kind?: StoredContentKind;
  workspaceId?: string;
  shareMode?: "personal" | "workspace";
  fileId?: string;
  action?: "trash" | "restore";
  folderId?: string;
  subfolderId?: string | null;
  titleOverride?: string;
};

function isContentKind(value: unknown): value is StoredContentKind {
  return value === "document" || value === "sheet" || value === "slide";
}

function isLifecycleAction(
  value: unknown,
): value is "trash" | "restore" {
  return value === "trash" || value === "restore";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as
    | BrowserFileLifecyclePayload
    | null;

  if (
    !payload ||
    !isContentKind(payload.kind) ||
    typeof payload.fileId !== "string" ||
    !isLifecycleAction(payload.action)
  ) {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  const action = payload.action;
  const workspaceId =
    typeof payload.workspaceId === "string" && payload.workspaceId.trim()
      ? payload.workspaceId.trim()
      : undefined;

  if (payload.shareMode === "workspace" && workspaceId) {
    await setBrowserFileLifecycleForWorkspace({
      kind: payload.kind,
      workspaceId,
      fileId: payload.fileId,
      action,
      folderId: payload.folderId,
      subfolderId: payload.subfolderId,
      titleOverride: payload.titleOverride,
    });
  } else {
    await setBrowserFileLifecycleForUser({
      user,
      kind: payload.kind,
      workspaceId,
      fileId: payload.fileId,
      action,
      folderId: payload.folderId,
      subfolderId: payload.subfolderId,
      titleOverride: payload.titleOverride,
    });
  }

  return NextResponse.json({ ok: true });
}
