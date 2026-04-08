export type CadAssetKind = "document" | "sheet" | "slide";

export function isCadFileName(fileName: string) {
  const normalizedName = fileName.toLowerCase();
  return normalizedName.endsWith(".dwg") || normalizedName.endsWith(".dxf");
}

export function buildCadLabUrl(params: {
  kind: CadAssetKind;
  assetId: string;
  fileName: string;
  embed?: boolean;
}) {
  const cadLabBaseUrl =
    process.env.NEXT_PUBLIC_CAD_LAB_BASE_URL?.trim() || "/cad-lab/index.html";
  const cadLabApiBaseUrl =
    process.env.NEXT_PUBLIC_CAD_LAB_API_BASE_URL?.trim() || "";
  const filePath = params.fileName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const proxiedAssetUrl =
    `${cadLabApiBaseUrl}/api/cad-files/${params.kind}/${params.assetId}/${filePath}`;
  const search = new URLSearchParams({
    url: proxiedAssetUrl,
    name: params.fileName,
    v: "20260409-cad-integrated",
  });

  if (params.embed) {
    search.set("embed", "1");
  }

  return `${cadLabBaseUrl}?${search.toString()}`;
}

export function buildCadViewerHref(params: {
  kind: CadAssetKind;
  assetId: string;
  fileName: string;
  returnTo?: string;
}) {
  const search = new URLSearchParams({
    kind: params.kind,
    assetId: params.assetId,
    name: params.fileName,
  });

  if (params.returnTo) {
    search.set("returnTo", params.returnTo);
  }

  return `/docs/cad?${search.toString()}`;
}

export function normalizeCadAssetKind(value: string | null | undefined): CadAssetKind | null {
  if (value === "document" || value === "sheet" || value === "slide") {
    return value;
  }

  return null;
}
