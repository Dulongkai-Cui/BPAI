"use client";

import Link from "next/link";
import type { DragEvent } from "react";
import { useMemo, useState } from "react";

import type {
  AiProductionSkillFolder,
  AiProductionSkillPackage,
} from "@/lib/ai-dorm/production-assets";

type AiDormSkillPackagesProps = {
  packages: AiProductionSkillPackage[];
  folders: AiProductionSkillFolder[];
};

type FolderSelection = "all" | "recent" | "unfiled" | string;
type FolderTileTone = "blue" | "emerald" | "slate" | "amber";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value <= 0) {
    return "目录";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getFolderCount(
  packages: AiProductionSkillPackage[],
  folderId: FolderSelection,
) {
  if (folderId === "all") {
    return packages.length;
  }

  if (folderId === "recent") {
    return packages.length;
  }

  if (folderId === "unfiled") {
    return packages.filter((item) => !item.folderId).length;
  }

  return packages.filter((item) => item.folderId === folderId).length;
}

function getFilteredPackages(
  packages: AiProductionSkillPackage[],
  folderId: FolderSelection,
) {
  if (folderId === "all") {
    return packages;
  }

  if (folderId === "recent") {
    return [...packages].sort(
      (left, right) => Date.parse(right.uploadedAt) - Date.parse(left.uploadedAt),
    );
  }

  if (folderId === "unfiled") {
    return packages.filter((item) => !item.folderId);
  }

  return packages.filter((item) => item.folderId === folderId);
}

function getFolderName(
  folders: AiProductionSkillFolder[],
  folderId: FolderSelection,
) {
  if (folderId === "all") {
    return "全部 Skill 包";
  }

  if (folderId === "recent") {
    return "最近上传";
  }

  if (folderId === "unfiled") {
    return "未归档";
  }

  return folders.find((folder) => folder.id === folderId)?.name ?? "未知文件夹";
}

function getFolderIconClass(tone: FolderTileTone, active: boolean) {
  if (active) {
    return "bg-blue-600 text-white ring-blue-100";
  }

  if (tone === "emerald") {
    return "bg-emerald-100 text-emerald-600 ring-emerald-50";
  }

  if (tone === "amber") {
    return "bg-amber-100 text-amber-600 ring-amber-50";
  }

  if (tone === "blue") {
    return "bg-blue-100 text-blue-600 ring-blue-50";
  }

  return "bg-slate-100 text-slate-500 ring-slate-50";
}

function FolderTileIcon({
  active,
  tone,
}: {
  active: boolean;
  tone: FolderTileTone;
}) {
  return (
    <span
      className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-4 ${getFolderIconClass(
        tone,
        active,
      )}`}
    >
      <span className="relative h-3.5 w-4 rounded-[0.2rem] border-2 border-current">
        <span className="absolute -top-1 left-0 h-1.5 w-2 rounded-t-[0.2rem] border-2 border-b-0 border-current bg-inherit" />
      </span>
    </span>
  );
}

export function AiDormSkillPackages({
  packages: initialPackages,
  folders: initialFolders,
}: AiDormSkillPackagesProps) {
  const [packages, setPackages] = useState(initialPackages);
  const [folders, setFolders] = useState(initialFolders);
  const [selectedFolderId, setSelectedFolderId] = useState<FolderSelection>("all");
  const [selectedPackageId, setSelectedPackageId] = useState(
    initialPackages[0]?.id ?? "",
  );
  const [folderNameDraft, setFolderNameDraft] = useState("");
  const [folderDescriptionDraft, setFolderDescriptionDraft] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [message, setMessage] = useState(
    "这里先只管理本地 Skill 包与文件夹。龙虾可见范围后续在 AI员工配置面板按文件夹开放。",
  );
  const selectedPackage =
    packages.find((item) => item.id === selectedPackageId) ?? packages[0] ?? null;
  const filteredPackages = useMemo(
    () => getFilteredPackages(packages, selectedFolderId),
    [packages, selectedFolderId],
  );
  const unfiledCount = getFolderCount(packages, "unfiled");

  async function refreshFolders() {
    const response = await fetch("/api/ai-dorm/production-assets/skill-folders");
    const data = (await response.json().catch(() => null)) as
      | { folders?: AiProductionSkillFolder[] }
      | null;

    if (response.ok && data?.folders) {
      setFolders(data.folders);
    }
  }

  async function createFolder() {
    const name = folderNameDraft.trim();

    if (!name) {
      setMessage("请先填写文件夹名称。");
      return;
    }

    setCreatingFolder(true);
    setMessage("正在创建 Skill 文件夹...");

    try {
      const response = await fetch("/api/ai-dorm/production-assets/skill-folders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description: folderDescriptionDraft,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { folders?: AiProductionSkillFolder[]; message?: string }
        | null;

      if (!response.ok || !data?.folders) {
        throw new Error(data?.message ?? "创建失败");
      }

      setFolders(data.folders);
      setFolderNameDraft("");
      setFolderDescriptionDraft("");
      setMessage("Skill 文件夹已创建。可以把包拖进去。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建失败");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function movePackage(packageId: string, folderId: FolderSelection) {
    const targetName = getFolderName(folders, folderId);

    if (folderId === "all" || folderId === "recent") {
      setMessage(`「${targetName}」只是查看视图，拖到“未归档”或自定义文件夹才会移动。`);
      return;
    }

    const targetFolderId = folderId === "unfiled" ? null : folderId;
    setMessage(`正在移动到「${targetName}」...`);

    try {
      const response = await fetch(
        `/api/ai-dorm/production-assets/skill-packages/${encodeURIComponent(
          packageId,
        )}/folder`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ folderId: targetFolderId }),
        },
      );
      const data = (await response.json().catch(() => null)) as
        | {
            packages?: AiProductionSkillPackage[];
            folders?: AiProductionSkillFolder[];
            message?: string;
          }
        | null;

      if (!response.ok || !data?.packages || !data.folders) {
        throw new Error(data?.message ?? "移动失败");
      }

      setPackages(data.packages);
      setFolders(data.folders);
      setSelectedPackageId(packageId);
      setMessage(`已移动到「${targetName}」。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "移动失败");
    }
  }

  async function deleteFolder(folderId: string) {
    setMessage("正在删除文件夹...");

    try {
      const response = await fetch(
        `/api/ai-dorm/production-assets/skill-folders/${encodeURIComponent(folderId)}`,
        { method: "DELETE" },
      );
      const data = (await response.json().catch(() => null)) as
        | { folders?: AiProductionSkillFolder[]; message?: string }
        | null;

      if (!response.ok || !data?.folders) {
        throw new Error(data?.message ?? "删除失败");
      }

      setFolders(data.folders);
      setPackages((current) =>
        current.map((item) =>
          item.folderId === folderId
            ? { ...item, folderId: null, folderName: "未归档" }
            : item,
        ),
      );
      setSelectedFolderId("all");
      setMessage("文件夹已删除，里面的 Skill 包已回到未归档。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    }
  }

  async function deletePackage(packageId: string) {
    setMessage("正在删除本地 Skill 包...");

    try {
      const response = await fetch(
        `/api/ai-dorm/production-assets/skill-zips/${encodeURIComponent(packageId)}`,
        { method: "DELETE" },
      );
      const data = (await response.json().catch(() => null)) as
        | { packages?: AiProductionSkillPackage[]; message?: string }
        | null;

      if (!response.ok || !data?.packages) {
        throw new Error(data?.message ?? "删除失败");
      }

      setPackages(data.packages);
      setSelectedPackageId(data.packages[0]?.id ?? "");
      await refreshFolders();
      setMessage("本地 Skill 包已删除。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>, folderId: FolderSelection) {
    event.preventDefault();
    const packageId = event.dataTransfer.getData("text/plain");

    if (packageId) {
      void movePackage(packageId, folderId);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link
              href="/ai-dorm/skills"
              className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
            >
              返回 AI生产资料仓
            </Link>
            <div className="mt-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
              Local Skill Market
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              本地 Skill 市场管理
            </h1>
            <p className="mt-2 max-w-4xl text-xs leading-6 text-slate-500">
              这里负责下载、上传、建文件夹和归档 Skill 包。AI员工配置里后续会按文件夹开放可见范围。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="rounded-full bg-blue-50 px-3 py-2 text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700/70">
                Packages
              </div>
              <div className="text-sm font-black text-blue-900">
                {packages.length}
              </div>
            </div>
            <div className="rounded-full bg-emerald-50 px-3 py-2 text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700/70">
                Folders
              </div>
              <div className="text-sm font-black text-emerald-900">
                {folders.length}
              </div>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-2 text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                Unfiled
              </div>
              <div className="text-sm font-black text-slate-900">
                {unfiledCount}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-950">
              文件夹区域
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              可以把下方 Skill 包拖进文件夹。未来龙虾权限会按这些文件夹开放。
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            {message}
          </span>
        </div>

        <div className="grid max-h-[12.5rem] gap-2 overflow-y-auto overscroll-contain pr-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
          {[
            {
              id: "all" as const,
              name: "全部 Skill 包",
              description: "所有上传和下载的本地 Skill。",
              tone: "blue" as const,
            },
            {
              id: "recent" as const,
              name: "最近上传",
              description: "按最近上传和下载时间查看。",
              tone: "emerald" as const,
            },
            {
              id: "unfiled" as const,
              name: "未归档",
              description: "还没有放进文件夹的 Skill。",
              tone: "slate" as const,
            },
          ].map((folder) => {
            const active = folder.id === selectedFolderId;
            const count = getFolderCount(packages, folder.id);
            const acceptsDrop = folder.id === "unfiled";

            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => setSelectedFolderId(folder.id)}
                onDragOver={acceptsDrop ? (event) => event.preventDefault() : undefined}
                onDrop={acceptsDrop ? (event) => handleDrop(event, folder.id) : undefined}
                className={
                  active
                    ? "min-h-[5.65rem] rounded-xl border border-blue-300 bg-blue-50 p-2.5 text-left shadow-sm"
                    : "min-h-[5.65rem] rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-left transition hover:border-blue-200 hover:bg-white"
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <FolderTileIcon active={active} tone={folder.tone} />
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                    {count}
                  </span>
                </div>
                <div className="mt-2 truncate text-xs font-black text-slate-950">
                  {folder.name}
                </div>
                <div className="mt-1 line-clamp-1 text-[11px] leading-4 text-slate-500">
                  {folder.description}
                </div>
              </button>
            );
          })}

          {folders.map((folder) => {
            const active = folder.id === selectedFolderId;

            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => setSelectedFolderId(folder.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(event, folder.id)}
                className={
                  active
                    ? "min-h-[5.65rem] rounded-xl border border-blue-300 bg-blue-50 p-2.5 text-left shadow-sm"
                    : "min-h-[5.65rem] rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-left transition hover:border-blue-200 hover:bg-white"
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <FolderTileIcon active={active} tone="amber" />
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                    {folder.packageCount}
                  </span>
                </div>
                <div className="mt-2 truncate text-xs font-black text-slate-950">
                  {folder.name}
                </div>
                <div className="mt-1 line-clamp-1 text-[11px] leading-4 text-slate-500">
                  {folder.description || "自定义 Skill 文件夹。"}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.74fr_1.26fr]">
        <div className="space-y-5">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-950">
                  新建文件夹
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  文件夹就是未来给龙虾开放 Skill 的权限单位。
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="block text-xs font-bold text-slate-500">
                文件夹名称
                <input
                  value={folderNameDraft}
                  onChange={(event) => setFolderNameDraft(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                  placeholder="例如：PPT生成、图纸解析、合同复核"
                />
              </label>
              <label className="block text-xs font-bold text-slate-500">
                说明
                <textarea
                  value={folderDescriptionDraft}
                  onChange={(event) => setFolderDescriptionDraft(event.target.value)}
                  className="mt-2 h-24 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                  placeholder="这个文件夹大概给哪类龙虾开放。"
                />
              </label>
              <button
                type="button"
                onClick={createFolder}
                disabled={creatingFolder}
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingFolder ? "创建中" : "新建文件夹"}
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-950">
                  当前区域
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {getFolderName(folders, selectedFolderId)}
                </p>
              </div>
              {selectedFolderId !== "all" && selectedFolderId !== "unfiled" ? (
                <button
                  type="button"
                  onClick={() => deleteFolder(selectedFolderId)}
                  className="rounded-full bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                >
                  删除文件夹
                </button>
              ) : null}
            </div>
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-7 text-slate-500">
              拖拽包卡片到任意文件夹卡片，即可移动。拖到“未归档”会移出当前文件夹。
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950">
                {getFolderName(folders, selectedFolderId)}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                当前区域共 {filteredPackages.length} 个 Skill 包。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
              拖入文件夹
            </span>
          </div>

          <div className="mt-5 grid max-h-[46rem] gap-4 overflow-y-auto pr-1 md:grid-cols-2 2xl:grid-cols-3">
            {filteredPackages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm leading-7 text-slate-500 md:col-span-2 2xl:col-span-3">
                当前区域还没有 Skill 包。可以回到 Skill 工厂下载或上传，然后拖进文件夹。
              </div>
            ) : (
              filteredPackages.map((item) => {
                const active = selectedPackage?.id === item.id;

                return (
                  <article
                    key={item.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", item.id);
                    }}
                    onClick={() => setSelectedPackageId(item.id)}
                    className={
                      active
                        ? "cursor-grab rounded-2xl border border-blue-300 bg-blue-50 p-4 shadow-sm active:cursor-grabbing"
                        : "cursor-grab rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-white active:cursor-grabbing"
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-lg font-black tracking-tight text-slate-950">
                          {item.displayName}
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          {item.sourceLabel} · {formatDate(item.uploadedAt)} ·{" "}
                          {formatBytes(item.sizeBytes)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deletePackage(item.id);
                        }}
                        className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-rose-600 ring-1 ring-rose-100 transition hover:bg-rose-50"
                      >
                        删除
                      </button>
                    </div>
                    <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-xs leading-6 text-slate-500 ring-1 ring-slate-200">
                      <div>位置：{item.folderName}</div>
                      <div>
                        内容：
                        {item.entryFileNames.length > 0
                          ? item.entryFileNames.join(" / ")
                          : "尚未识别入口文件"}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
