import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import {
  createUploadedAsset,
  type ContentKind,
} from "@/lib/content/server";

export const runtime = "nodejs";

type RequestedContentKind = ContentKind | "auto";

function resolveRequestedContentKind(
  value: FormDataEntryValue | null,
): RequestedContentKind | null {
  if (typeof value !== "string") {
    return null;
  }

  if (value === "document" || value === "sheet" || value === "slide" || value === "auto") {
    return value;
  }

  return null;
}

function inferContentKind(file: File): ContentKind {
  const fileName = file.name.toLowerCase();
  const mimeType = file.type.toLowerCase();

  if (
    fileName.endsWith(".xls") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".csv") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv"
  ) {
    return "sheet";
  }

  if (
    fileName.endsWith(".ppt") ||
    fileName.endsWith(".pptx") ||
    fileName.endsWith(".pps") ||
    fileName.endsWith(".ppsx") ||
    fileName.endsWith(".odp") ||
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint")
  ) {
    return "slide";
  }

  return "document";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "未登录。" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json({ message: "上传表单无效。" }, { status: 400 });
  }

  const requestedKind = resolveRequestedContentKind(formData.get("kind"));
  const file = formData.get("file");
  const workspaceIdEntry = formData.get("workspaceId");
  const workspaceId =
    typeof workspaceIdEntry === "string" && workspaceIdEntry.trim()
      ? workspaceIdEntry.trim()
      : undefined;

  if (!requestedKind || !(file instanceof File)) {
    return NextResponse.json(
      { message: "请提供上传文件和内容类型。" },
      { status: 400 },
    );
  }

  const kind = requestedKind === "auto" ? inferContentKind(file) : requestedKind;
  const uploaded = await createUploadedAsset({
    kind,
    file,
    user,
    workspaceId,
  });

  return NextResponse.json({
    asset: {
      id: uploaded.asset.id,
      kind: uploaded.asset.kind,
      title: uploaded.asset.title,
      updatedAt: uploaded.asset.updatedAt,
    },
    openPath: uploaded.openPath,
    contentUrl: uploaded.contentUrl,
    editorKey: uploaded.editorKey,
  });
}
