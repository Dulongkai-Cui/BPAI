import { NextResponse } from "next/server";
import {
  readAssetBinary,
  type ContentKind,
} from "@/lib/content/server";

export const runtime = "nodejs";

type CadAssetRouteProps = {
  params: Promise<{
    kind: string;
    assetId: string;
    fileName: string[];
  }>;
};

function resolveContentKind(value: string): ContentKind | null {
  if (value === "document" || value === "sheet" || value === "slide") {
    return value;
  }

  return null;
}

function buildHeaders(fileName: string, payload: NonNullable<Awaited<ReturnType<typeof readAssetBinary>>>) {
  return {
    "Content-Type": payload.asset.mimeType ?? "application/octet-stream",
    "Content-Length": payload.buffer.byteLength.toString(),
    "Cache-Control": "no-store",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  };
}

export async function GET(_request: Request, { params }: CadAssetRouteProps) {
  const { kind: rawKind, assetId, fileName } = await params;
  const kind = resolveContentKind(rawKind);

  if (!kind) {
    return NextResponse.json({ message: "Unknown content kind." }, { status: 404 });
  }

  const payload = await readAssetBinary(kind, assetId).catch(() => null);

  if (!payload) {
    return NextResponse.json({ message: "Asset file not found." }, { status: 404 });
  }

  const requestedFileName =
    decodeURIComponent(fileName.join("/")).trim() || payload.asset.originalFileName;

  return new NextResponse(payload.buffer, {
    headers: buildHeaders(requestedFileName, payload),
  });
}

export async function HEAD(_request: Request, context: CadAssetRouteProps) {
  const { kind: rawKind, assetId, fileName } = await context.params;
  const kind = resolveContentKind(rawKind);

  if (!kind) {
    return NextResponse.json({ message: "Unknown content kind." }, { status: 404 });
  }

  const payload = await readAssetBinary(kind, assetId).catch(() => null);

  if (!payload) {
    return NextResponse.json({ message: "Asset file not found." }, { status: 404 });
  }

  const requestedFileName =
    decodeURIComponent(fileName.join("/")).trim() || payload.asset.originalFileName;

  return new NextResponse(null, {
    headers: buildHeaders(requestedFileName, payload),
  });
}
