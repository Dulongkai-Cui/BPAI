import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  overwriteAssetBinary,
  parseOnlyOfficeAssetKey,
  type ContentKind,
} from "@/lib/content/server";

export const runtime = "nodejs";

type OnlyOfficeCallbackBody = {
  key?: string;
  status?: number;
  url?: string;
};

function resolveLegacyTargetFileName(key?: string) {
  if (!key) {
    return "sample.docx";
  }

  if (key.includes("doc-weekly-001")) {
    return "doc-weekly-001.docx";
  }
  if (key.includes("doc-submission-002")) {
    return "doc-submission-002.docx";
  }
  if (key.includes("doc-acceptance-003")) {
    return "doc-acceptance-003.docx";
  }
  if (key.includes("sheet-ledger-001")) {
    return "sheet-ledger-001.xlsx";
  }
  if (key.includes("sheet-material-002")) {
    return "sheet-material-002.xlsx";
  }
  if (key.includes("sheet-review-003")) {
    return "sheet-review-003.xlsx";
  }
  if (key.includes("bpai-sheet-uploaded") || key.includes("sheet-uploaded")) {
    return "sheet-uploaded.xlsx";
  }
  if (key.includes("bpai-sheet-new") || key.includes("sheet-new")) {
    return "sheet-new.xlsx";
  }
  if (key.includes("bpai-doc-new") || key.includes("doc-new")) {
    return "new.docx";
  }
  if (key.includes("bpai-doc-uploaded") || key.includes("doc-uploaded")) {
    return "uploaded.docx";
  }

  return "sample.docx";
}

function resolveLegacyTargetPath(key?: string) {
  return path.join(
    process.cwd(),
    "public",
    "onlyoffice",
    resolveLegacyTargetFileName(key),
  );
}

function resolveOnlyOfficeInternalBaseUrl() {
  return process.env.ONLYOFFICE_INTERNAL_BASE_URL ?? "http://bpai-onlyoffice";
}

function rewriteDownloadUrl(downloadUrl: string) {
  try {
    const parsed = new URL(downloadUrl);

    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      const internalBaseUrl = new URL(resolveOnlyOfficeInternalBaseUrl());
      parsed.protocol = internalBaseUrl.protocol;
      parsed.hostname = internalBaseUrl.hostname;
      parsed.port = internalBaseUrl.port;
    }

    return parsed.toString();
  } catch {
    return downloadUrl;
  }
}

async function downloadCallbackBuffer(downloadUrl: string) {
  const resolvedUrl = rewriteDownloadUrl(downloadUrl);
  const response = await fetch(resolvedUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to download ONLYOFFICE payload: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function saveAssetPayload(params: {
  kind: ContentKind;
  assetId: string;
  downloadUrl: string;
}) {
  const buffer = await downloadCallbackBuffer(params.downloadUrl);
  const updatedAsset = await overwriteAssetBinary(
    params.kind,
    params.assetId,
    buffer,
  );

  if (!updatedAsset) {
    throw new Error(`Asset not found: ${params.kind}/${params.assetId}`);
  }

  console.log("ONLYOFFICE saved asset to workspace:", {
    assetId: updatedAsset.id,
    kind: updatedAsset.kind,
    updatedAt: updatedAsset.updatedAt,
  });
}

async function saveLegacyPayload(key: string | undefined, downloadUrl: string) {
  const buffer = await downloadCallbackBuffer(downloadUrl);
  const targetPath = resolveLegacyTargetPath(key);
  await writeFile(targetPath, buffer);
  console.log("ONLYOFFICE saved legacy file to:", targetPath);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as OnlyOfficeCallbackBody | null;
  console.log("ONLYOFFICE callback payload:", body);

  if (!body || typeof body !== "object") {
    return Response.json({ error: 0 });
  }

  const status = typeof body.status === "number" ? body.status : undefined;
  const downloadUrl = typeof body.url === "string" ? body.url : null;
  const key = typeof body.key === "string" ? body.key : undefined;

  if ((status === 2 || status === 6) && downloadUrl) {
    try {
      const assetRef = parseOnlyOfficeAssetKey(key);

      if (assetRef) {
        await saveAssetPayload({
          kind: assetRef.kind,
          assetId: assetRef.assetId,
          downloadUrl,
        });
      } else {
        await saveLegacyPayload(key, downloadUrl);
      }
    } catch (error) {
      console.error("ONLYOFFICE callback save failed:", error);
      return Response.json({ error: 1 });
    }
  }

  return Response.json({ error: 0 });
}
