import { NextResponse } from "next/server";
import {
  readAssetBinary,
  type ContentKind,
} from "@/lib/content/server";

export const runtime = "nodejs";

type NamedAssetContentRouteProps = {
  params: Promise<{
    kind: string;
    assetId: string;
    fileName: string;
  }>;
};

function resolveContentKind(value: string): ContentKind | null {
  if (value === "document" || value === "sheet" || value === "slide") {
    return value;
  }

  return null;
}

export async function GET(_request: Request, { params }: NamedAssetContentRouteProps) {
  const { kind: rawKind, assetId } = await params;
  const kind = resolveContentKind(rawKind);

  if (!kind) {
    return NextResponse.json({ message: "未知内容类型。" }, { status: 404 });
  }

  const payload = await readAssetBinary(kind, assetId).catch(() => null);

  if (!payload) {
    return NextResponse.json({ message: "文件不存在。" }, { status: 404 });
  }

  return new NextResponse(payload.buffer, {
    headers: {
      "Content-Type": payload.asset.mimeType ?? "application/octet-stream",
      "Content-Length": payload.buffer.byteLength.toString(),
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(payload.asset.originalFileName)}`,
    },
  });
}
