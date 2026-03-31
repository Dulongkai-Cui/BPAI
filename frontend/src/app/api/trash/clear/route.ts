import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { finalizeTrashedBrowserFilesForUser } from "@/lib/content/browser-state";
import { clearTrashedAssetsForUser } from "@/lib/content/server";

export async function POST() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const removedAssets = await clearTrashedAssetsForUser(user);
  await finalizeTrashedBrowserFilesForUser({
    user,
    kind: "document",
    removedAssetFileIds: removedAssets.map((asset) => asset.id),
  });

  return NextResponse.json({
    ok: true,
    removedCount: removedAssets.length,
  });
}
