import { TrashClearButton } from "@/components/docs/trash-clear-button";
import { TrashRestoreButton } from "@/components/docs/trash-restore-button";
import { requireCurrentUser } from "@/lib/auth/server";
import { getBrowserStateForUser } from "@/lib/content/browser-state";
import {
  formatAssetUpdatedAt,
  listAssetsForUser,
} from "@/lib/content/server";
import {
  documentItems,
  sheetItems,
} from "@/lib/docs/mock-data";

type TrashItem = {
  id: string;
  title: string;
  meta: string;
  kind: "document" | "sheet" | "slide";
  source: "asset" | "sample";
  storageKind: "document" | "sheet" | "slide";
};

function TrashGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M5.75 7.5h12.5" />
      <path d="M9.25 7.5V5.75A1.75 1.75 0 0 1 11 4h2a1.75 1.75 0 0 1 1.75 1.75V7.5" />
      <path d="m7 7.5.75 10.25A2 2 0 0 0 9.75 19.5h4.5a2 2 0 0 0 2-1.75L17 7.5" />
      <path d="M10 11v4.25" />
      <path d="M14 11v4.25" />
    </svg>
  );
}

function FileGlyph({ kind }: { kind: "document" | "sheet" | "slide" }) {
  const accent =
    kind === "document"
      ? "text-blue-600"
      : kind === "sheet"
        ? "text-emerald-600"
        : "text-amber-600";
  const surface =
    kind === "document"
      ? "bg-blue-50"
      : kind === "sheet"
        ? "bg-emerald-50"
        : "bg-amber-50";

  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-white/80 ${surface} ${accent} shadow-sm`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        {kind === "document" ? (
          <>
            <path d="M7 3.75h7.5L19 8.25v12H7z" />
            <path d="M14.5 3.75v4.5H19" />
            <path d="M9.25 12h5.5" />
            <path d="M9.25 15h5.5" />
          </>
        ) : kind === "sheet" ? (
          <>
            <rect x="4.5" y="4.5" width="15" height="15" rx="2" />
            <path d="M4.5 9.5h15" />
            <path d="M9.5 4.5v15" />
            <path d="M14.5 9.5v10" />
          </>
        ) : (
          <>
            <path d="M5.5 5.25h13a1.75 1.75 0 0 1 1.75 1.75v8.25a1.75 1.75 0 0 1-1.75 1.75h-13A1.75 1.75 0 0 1 3.75 15.25V7A1.75 1.75 0 0 1 5.5 5.25Z" />
            <path d="M9 19.25h6" />
            <path d="M12 17v2.25" />
            <path d="M8.5 9.25h7" />
            <path d="M8.5 12.25h4.75" />
          </>
        )}
      </svg>
    </div>
  );
}

export default async function TrashPage() {
  const user = await requireCurrentUser();
  const personalWorkspaceId = user.workspaceId;
  const [trashedDocuments, trashedSheets, trashedSlides, browserState] = await Promise.all([
    listAssetsForUser(user, "document", {
      trashMode: "trashed",
      workspaceId: personalWorkspaceId,
    }),
    listAssetsForUser(user, "sheet", {
      trashMode: "trashed",
      workspaceId: personalWorkspaceId,
    }),
    listAssetsForUser(user, "slide", {
      trashMode: "trashed",
      workspaceId: personalWorkspaceId,
    }),
    getBrowserStateForUser(user, "document", {
      workspaceId: personalWorkspaceId,
    }),
  ]);

  const fileStateMap = new Map(
    browserState.fileStates.map((fileState) => [fileState.fileId, fileState]),
  );
  const sampleTrashItems: TrashItem[] = [
    ...documentItems.flatMap((item) => {
      const fileState = fileStateMap.get(item.id);

      if (!fileState?.isTrashed || fileState.isDeleted) {
        return [];
      }

      return [
        {
          id: item.id,
          title: fileState.titleOverride?.trim() || item.title,
          meta: `样例文档 / ${item.updatedAt}`,
          kind: "document" as const,
          source: "sample" as const,
          storageKind: "document" as const,
        },
      ];
    }),
    ...sheetItems.flatMap((item) => {
      const fileState = fileStateMap.get(item.id);

      if (!fileState?.isTrashed || fileState.isDeleted) {
        return [];
      }

      return [
        {
          id: item.id,
          title: fileState.titleOverride?.trim() || item.title,
          meta: `样例表格 / ${item.updatedAt}`,
          kind: "sheet" as const,
          source: "sample" as const,
          storageKind: "sheet" as const,
        },
      ];
    }),
  ];
  const assetTrashItems: TrashItem[] = [
    ...trashedDocuments.map((asset) => ({
      id: asset.id,
      title: asset.title,
      meta: `真实上传 / ${formatAssetUpdatedAt(asset.updatedAt)}`,
      kind: "document" as const,
      source: "asset" as const,
      storageKind: "document" as const,
    })),
    ...trashedSheets.map((asset) => ({
      id: asset.id,
      title: asset.title,
      meta: `真实上传 / ${formatAssetUpdatedAt(asset.updatedAt)}`,
      kind: "sheet" as const,
      source: "asset" as const,
      storageKind: "sheet" as const,
    })),
    ...trashedSlides.map((asset) => ({
      id: asset.id,
      title: asset.title,
      meta: `真实上传 / ${formatAssetUpdatedAt(asset.updatedAt)}`,
      kind: "slide" as const,
      source: "asset" as const,
      storageKind: "slide" as const,
    })),
  ];
  const trashItems = [...assetTrashItems, ...sampleTrashItems];

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.32),transparent_28%),linear-gradient(180deg,#eef4ff_0%,#f7f9fd_34%,#eef3fb_100%)] px-8 py-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <section className="rounded-[36px] border border-white/80 bg-white/88 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
                <TrashGlyph />
                回收站
              </div>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950">
                已删除文件
              </h1>
              <p className="mt-3 text-base leading-8 text-slate-500">
                从文档空间删除的文件会先进入这里。清空回收站后，将永久删除并无法恢复。
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 shadow-sm">
                {trashItems.length} 个项目
              </div>
              <TrashClearButton disabled={trashItems.length === 0} />
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/80 bg-white/88 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          {trashItems.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50/70 px-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
                <TrashGlyph />
              </div>
              <h2 className="mt-5 text-2xl font-semibold text-slate-900">回收站还是空的</h2>
              <p className="mt-3 max-w-md text-sm leading-7 text-slate-500">
                在文档空间里右键文件并选择删除后，文件会先进入这里。
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {trashItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,247,252,0.96))] p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <FileGlyph kind={item.kind} />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {item.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{item.meta}</div>
                      </div>
                    </div>
                    <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                      {item.source === "asset" ? "真实文件" : "样例文件"}
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <TrashRestoreButton
                      fileId={item.id}
                      source={item.source}
                      storageKind={item.storageKind}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
