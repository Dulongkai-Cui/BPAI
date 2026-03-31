import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import {
  moveAssetToTrash,
  type ContentKind,
} from "@/lib/content/server";

type TrashAssetPayload = {
  assetId?: string;
  kind?: ContentKind;
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

  const payload = (await request.json().catch(() => null)) as TrashAssetPayload | null;

  if (!payload?.assetId || !isContentKind(payload.kind)) {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  const asset = await moveAssetToTrash({
    kind: payload.kind,
    assetId: payload.assetId,
    user,
    workspaceId:
      typeof payload.workspaceId === "string" && payload.workspaceId.trim()
        ? payload.workspaceId.trim()
        : undefined,
  });

  if (!asset) {
    return NextResponse.json({ message: "Asset not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, assetId: asset.id });
}
