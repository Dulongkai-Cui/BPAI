import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { copyAssetToWorkspace, type ContentKind } from "@/lib/content/server";

type CopyAssetPayload = {
  kind?: ContentKind;
  assetId?: string;
  source?: "asset" | "sample";
  sampleFileName?: string;
  title?: string;
  targetWorkspaceId?: string;
};

function isContentKind(value: unknown): value is ContentKind {
  return value === "document" || value === "sheet" || value === "slide";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as CopyAssetPayload | null;

  if (
    !payload ||
    !isContentKind(payload.kind) ||
    typeof payload.assetId !== "string" ||
    (payload.source !== "asset" && payload.source !== "sample") ||
    typeof payload.targetWorkspaceId !== "string" ||
    !payload.targetWorkspaceId.trim()
  ) {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  const copiedAsset = await copyAssetToWorkspace({
    kind: payload.kind,
    assetId: payload.assetId,
    source: payload.source,
    sampleFileName:
      typeof payload.sampleFileName === "string" && payload.sampleFileName.trim()
        ? payload.sampleFileName.trim()
        : undefined,
    title: typeof payload.title === "string" ? payload.title : undefined,
    user,
    targetWorkspaceId: payload.targetWorkspaceId.trim(),
  });

  if (!copiedAsset) {
    return NextResponse.json({ message: "Asset not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    asset: {
      id: copiedAsset.asset.id,
      kind: copiedAsset.asset.kind,
      title: copiedAsset.asset.title,
      updatedAt: copiedAsset.asset.updatedAt,
    },
    openPath: copiedAsset.openPath,
  });
}
