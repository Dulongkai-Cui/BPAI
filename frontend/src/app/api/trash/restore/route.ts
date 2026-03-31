import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { setBrowserFileLifecycleForUser } from "@/lib/content/browser-state";
import {
  restoreAssetFromTrash,
  type ContentKind,
} from "@/lib/content/server";

type RestoreTrashPayload = {
  fileId?: string;
  source?: "asset" | "sample";
  storageKind?: ContentKind;
  workspaceId?: string;
};

function isContentKind(value: unknown): value is ContentKind {
  return value === "document" || value === "sheet" || value === "slide";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as RestoreTrashPayload | null;

  if (
    !payload ||
    typeof payload.fileId !== "string" ||
    (payload.source !== "asset" && payload.source !== "sample")
  ) {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  if (payload.source === "asset") {
    if (!isContentKind(payload.storageKind)) {
      return NextResponse.json({ message: "Invalid asset kind" }, { status: 400 });
    }

    const restoredAsset = await restoreAssetFromTrash({
      kind: payload.storageKind,
      assetId: payload.fileId,
      user,
      workspaceId:
        typeof payload.workspaceId === "string" && payload.workspaceId.trim()
          ? payload.workspaceId.trim()
          : undefined,
    });

    if (!restoredAsset) {
      return NextResponse.json({ message: "Asset not found" }, { status: 404 });
    }
  }

  await setBrowserFileLifecycleForUser({
    user,
    kind: "document",
    workspaceId:
      typeof payload.workspaceId === "string" && payload.workspaceId.trim()
        ? payload.workspaceId.trim()
        : undefined,
    fileId: payload.fileId,
    action: "restore",
  });

  return NextResponse.json({ ok: true });
}
