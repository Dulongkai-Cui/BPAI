import Link from "next/link";
import { redirect } from "next/navigation";
import { buildCadLabUrl, normalizeCadAssetKind } from "@/lib/content/cad";

type DocsCadPageProps = {
  searchParams?: Promise<{
    kind?: string;
    assetId?: string;
    name?: string;
    returnTo?: string | string[];
  }>;
};

function resolveReturnTo(value: string | string[] | undefined, fallback: string) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && candidate.startsWith("/") ? candidate : fallback;
}

export default async function DocsCadPage({ searchParams }: DocsCadPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const kind = normalizeCadAssetKind(resolvedSearchParams?.kind);
  const assetId = resolvedSearchParams?.assetId?.trim();
  const fileName = resolvedSearchParams?.name?.trim();
  const returnTo = resolveReturnTo(resolvedSearchParams?.returnTo, "/docs/documents");

  if (!kind || !assetId || !fileName) {
    redirect("/docs/documents");
  }

  const cadLabUrl = buildCadLabUrl({
    kind,
    assetId,
    fileName,
  });
  const cadLabEmbedUrl = buildCadLabUrl({
    kind,
    assetId,
    fileName,
    embed: true,
  });

  return (
    <div className="min-h-[calc(100vh-96px)] bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_26%),linear-gradient(180deg,#eef4ff_0%,#f7faff_46%,#edf2fb_100%)] px-4 py-5 sm:px-6">
      <section className="mx-auto overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
              CAD Workspace
            </div>
            <h1 className="mt-2 truncate text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
              {fileName}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={returnTo}
              className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              返回文档空间
            </Link>
            <a
              href={cadLabUrl}
              rel="noreferrer"
              target="_blank"
              className="inline-flex rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              新窗口打开
            </a>
          </div>
        </div>
        <iframe
          src={cadLabEmbedUrl}
          title={`CAD viewer: ${fileName}`}
          className="h-[calc(100vh-210px)] min-h-[720px] w-full bg-slate-950"
        />
      </section>
    </div>
  );
}
