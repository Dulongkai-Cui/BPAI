"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AiDormSkillRepositoryData } from "@/lib/ai-dorm/server";

type AiDormSkillsProps = {
  repository: AiDormSkillRepositoryData;
  initialPanel?: PanelId;
};

type ApiKeyRecord = AiDormSkillRepositoryData["apiKeys"][number];
type ApiKeyDraft = {
  apiKey: string;
  baseUrl: string;
  model: string;
};
type LocalSkillPackage = AiDormSkillRepositoryData["localSkillPackages"][number];
type PanelId = "api" | "skill" | "blueprints" | "rag" | "memory";
type CommandRunResult = {
  command: string;
  cwd: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  message: string;
};

const PANEL_CARDS: Array<{
  id: PanelId;
  eyebrow: string;
  title: string;
  summary: string;
  color: string;
}> = [
  {
    id: "api",
    eyebrow: "MODEL ACCESS",
    title: "API Key 中心",
    summary: "DeepSeek、Kimi 与模型地址配置。",
    color: "bg-[#2f63af]",
  },
  {
    id: "skill",
    eyebrow: "SKILL FACTORY",
    title: "Skill 工厂",
    summary: "命令安装、Zip 导入和本地包管理。",
    color: "bg-[#0b8f6a]",
  },
  {
    id: "blueprints",
    eyebrow: "BUILT-IN",
    title: "内置 Skill 蓝图",
    summary: "查看系统预设的生产资料蓝图。",
    color: "bg-[#6f5aa7]",
  },
  {
    id: "rag",
    eyebrow: "RAG FACTORY",
    title: "RAG 工厂",
    summary: "知识库、索引和检索测试工作台。",
    color: "bg-[#d57a00]",
  },
  {
    id: "memory",
    eyebrow: "AI MEMORY CORE",
    title: "AI记忆主脑",
    summary: "身份 Prompt、BP问问记忆和龙虾记忆入口。",
    color: "bg-[#25606b]",
  },
];

const MEMORY_BRAIN_NODES = [
  {
    id: "system-prompt",
    title: "系统级身份提示词",
    summary: "前额叶：决定 BP问问是谁、怎么接任务。",
    href: "/ai-dorm/skills/memory/system-prompt",
    x: 27,
    y: 39,
    color: "bg-blue-600",
  },
  {
    id: "long-term-preferences",
    title: "长期偏好",
    summary: "用户口吻、常用项目、默认输出格式。",
    href: "/ai-dorm/skills/memory/long-term-preferences",
    x: 42,
    y: 27,
    color: "bg-emerald-500",
  },
  {
    id: "task-context",
    title: "任务上下文",
    summary: "多轮对话里未完成的目标、约束和追问。",
    href: "/ai-dorm/skills/memory/task-context",
    x: 61,
    y: 42,
    color: "bg-violet-500",
  },
  {
    id: "tool-habits",
    title: "工具习惯",
    summary: "常用工单、文档和工作协议调用路径。",
    href: "/ai-dorm/skills/memory/tool-habits",
    x: 46,
    y: 67,
    color: "bg-amber-500",
  },
  {
    id: "memory-trash",
    title: "回收站",
    summary: "被清理、覆盖或暂存的记忆片段。",
    href: "/ai-dorm/skills/memory/memory-trash",
    x: 72,
    y: 62,
    color: "bg-slate-500",
  },
];

const LOBSTER_MEMORY_ENTRIES = [
  {
    id: "work-order-longxia",
    name: "工单龙虾",
    scope: "工单 / 工单列表 / 当前工单附件",
    path: "docker/openclaw/state/agents/main/agent",
    status: "已接入",
  },
  {
    id: "document-longxia",
    name: "文档龙虾",
    scope: "文档档案室 / 文件夹 / 合作空间",
    path: "docker/openclaw/state-document/agents/main/agent",
    status: "待细化",
  },
  {
    id: "report-longxia",
    name: "报表龙虾",
    scope: "总览 / 预警中心 / 报表输出",
    path: "docker/openclaw/state-report/agents/main/agent",
    status: "待细化",
  },
  {
    id: "alert-longxia",
    name: "预警龙虾",
    scope: "总览 / 预警中心",
    path: "docker/openclaw/state-alert/agents/main/agent",
    status: "待细化",
  },
  {
    id: "drawing-longxia",
    name: "图纸龙虾",
    scope: "工程队 / 图纸和 CAD 资料",
    path: "docker/openclaw/state-drawing/agents/main/agent",
    status: "待细化",
  },
];

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

function sourceKindLabel(value: "upload" | "template" | "bp_ask_draft") {
  if (value === "upload") {
    return "上传";
  }

  if (value === "template") {
    return "模板";
  }

  return "BP问问草稿";
}

function buildApiDrafts(apiKeys: ApiKeyRecord[]) {
  return Object.fromEntries(
    apiKeys.map((apiKey) => [
      apiKey.id,
      {
        apiKey: apiKey.savedKeyValue,
        baseUrl: apiKey.baseUrl,
        model: apiKey.model,
      },
    ]),
  ) as Record<ApiKeyRecord["id"], ApiKeyDraft>;
}

function terminalText(result: CommandRunResult | null) {
  if (!result) {
    return "等待输入命令。安装命令会在 Docker 内的本地 Skill 市场工作区执行。";
  }

  return [
    `$ ${result.command}`,
    result.cwd ? `cwd: ${result.cwd}` : "",
    `exit: ${result.exitCode ?? "timeout"} / ${result.durationMs}ms`,
    result.message,
    result.stdout ? `\n[stdout]\n${result.stdout.trim()}` : "",
    result.stderr ? `\n[stderr]\n${result.stderr.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function AiDormSkills({ repository, initialPanel = "api" }: AiDormSkillsProps) {
  const [activePanel, setActivePanel] = useState<PanelId>(initialPanel);
  const [activeSkillId, setActiveSkillId] = useState(repository.selectedSkill.id);
  const [apiKeys, setApiKeys] = useState(repository.apiKeys);
  const [apiDrafts, setApiDrafts] = useState(() => buildApiDrafts(repository.apiKeys));
  const [apiSaving, setApiSaving] = useState(false);
  const [apiMessage, setApiMessage] = useState("环境变量中的密钥会以脱敏形式显示。");
  const [packages, setPackages] = useState(repository.localSkillPackages);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(
    "上传 zip 后会保存压缩包，并尝试在容器内自动解压。",
  );
  const [command, setCommand] = useState(
    repository.commandPresets[0]?.command ?? "npx skills add bytedance/deer-flow",
  );
  const [commandRunning, setCommandRunning] = useState(false);
  const [commandResult, setCommandResult] = useState<CommandRunResult | null>(null);
  const [dreamScheduled, setDreamScheduled] = useState(false);
  const [dreamTime, setDreamTime] = useState("03:30");
  const [dreamRunning, setDreamRunning] = useState(false);
  const [dreamProgress, setDreamProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const configuredApiCount = apiKeys.filter((apiKey) => apiKey.hasKey).length;
  const packageCountLabel = packages.length === 0 ? "暂无本地包" : `${packages.length} 个本地包`;
  const activeCard = PANEL_CARDS.find((card) => card.id === activePanel) ?? PANEL_CARDS[0];
  const selectedSkill =
    repository.skills.find((skill) => skill.id === activeSkillId) ?? repository.selectedSkill;
  const sortedPackages = useMemo(
    () =>
      [...packages].sort(
        (left, right) => Date.parse(right.uploadedAt) - Date.parse(left.uploadedAt),
      ),
    [packages],
  );
  const dreamStatusText = dreamRunning
    ? "做梦中"
    : dreamProgress >= 100
      ? "最近一次已完成"
      : "待启动";

  useEffect(() => {
    if (!dreamRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      setDreamProgress((progress) => Math.min(progress + 5, 100));
    }, 450);

    return () => window.clearInterval(timer);
  }, [dreamRunning]);

  useEffect(() => {
    if (dreamRunning && dreamProgress >= 100) {
      setDreamRunning(false);
    }
  }, [dreamProgress, dreamRunning]);

  function updateApiDraft(
    providerId: ApiKeyRecord["id"],
    field: keyof ApiKeyDraft,
    value: string,
  ) {
    setApiDrafts((current) => ({
      ...current,
      [providerId]: {
        ...current[providerId],
        [field]: value,
      },
    }));
  }

  async function saveApiKeys() {
    setApiSaving(true);
    setApiMessage("正在保存 API Key 配置...");

    try {
      const response = await fetch("/api/ai-dorm/production-assets/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providers: apiKeys.map((apiKey) => ({
            id: apiKey.id,
            apiKey: apiDrafts[apiKey.id]?.apiKey ?? "",
            baseUrl: apiDrafts[apiKey.id]?.baseUrl ?? "",
            model: apiDrafts[apiKey.id]?.model ?? "",
          })),
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { apiKeys?: ApiKeyRecord[]; message?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.message ?? "保存失败");
      }

      if (data?.apiKeys) {
        setApiKeys(data.apiKeys);
        setApiDrafts(buildApiDrafts(data.apiKeys));
      }

      setApiMessage("API Key 配置已保存。空密钥会继续使用环境变量。");
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setApiSaving(false);
    }
  }

  async function runCommand() {
    const trimmed = command.trim();

    if (!trimmed) {
      setCommandResult({
        command: "",
        cwd: "",
        ok: false,
        exitCode: null,
        durationMs: 0,
        stdout: "",
        stderr: "",
        message: "请先输入命令。",
      });
      return;
    }

    setCommandRunning(true);
    setCommandResult({
      command: trimmed,
      cwd: "",
      ok: true,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      message: "命令执行中...",
    });

    try {
      const response = await fetch("/api/ai-dorm/production-assets/skill-command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command: trimmed }),
      });
      const data = (await response.json().catch(() => null)) as
        | {
            result?: CommandRunResult;
            packages?: LocalSkillPackage[];
            message?: string;
          }
        | null;

      if (!response.ok || !data?.result) {
        throw new Error(data?.message ?? "命令执行失败");
      }

      setCommandResult(data.result);

      if (data.packages) {
        setPackages(data.packages);
      }
    } catch (error) {
      setCommandResult({
        command: trimmed,
        cwd: "",
        ok: false,
        exitCode: null,
        durationMs: 0,
        stdout: "",
        stderr: "",
        message: error instanceof Error ? error.message : "命令执行失败",
      });
    } finally {
      setCommandRunning(false);
    }
  }

  function startDreaming() {
    if (dreamRunning) {
      return;
    }

    setDreamProgress(6);
    setDreamRunning(true);
  }

  async function uploadZip() {
    if (!selectedFile) {
      setUploadMessage("请先选择一个 .zip 文件。");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    setUploading(true);
    setUploadMessage("正在上传并解压...");

    try {
      const response = await fetch("/api/ai-dorm/production-assets/skill-zips", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as
        | { packages?: LocalSkillPackage[]; message?: string }
        | null;

      if (!response.ok || !data?.packages) {
        throw new Error(data?.message ?? "上传失败");
      }

      setPackages(data.packages);
      setSelectedFile(null);
      setUploadMessage("Skill zip 已进入本地仓。");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function deletePackage(packageId: string) {
    setUploadMessage("正在删除本地包...");

    try {
      const response = await fetch(
        `/api/ai-dorm/production-assets/skill-zips/${encodeURIComponent(packageId)}`,
        { method: "DELETE" },
      );
      const data = (await response.json().catch(() => null)) as
        | { packages?: LocalSkillPackage[]; message?: string }
        | null;

      if (!response.ok || !data?.packages) {
        throw new Error(data?.message ?? "删除失败");
      }

      setPackages(data.packages);
      setUploadMessage("本地包已删除。");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "删除失败");
    }
  }

  const renderPackageList = (compact = false) => (
    <div className={compact ? "space-y-3" : "grid gap-3"}>
      {sortedPackages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-7 text-slate-500">
          还没有本地 Skill 包。
        </div>
      ) : (
        sortedPackages.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                    {item.sourceLabel}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {item.statusLabel}
                  </span>
                </div>
                <div className="mt-3 text-lg font-black tracking-tight text-slate-950">
                  {item.displayName}
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {formatDate(item.uploadedAt)} · {formatBytes(item.sizeBytes)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => deletePackage(item.id)}
                className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-rose-600 ring-1 ring-rose-100 transition hover:bg-rose-50"
              >
                删除
              </button>
            </div>

            {!compact && (
              <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-xs leading-6 text-slate-500 ring-1 ring-slate-200">
                <div>路径：{item.extractPath || item.zipPath}</div>
                <div>
                  内容：
                  {item.entryFileNames.length > 0
                    ? item.entryFileNames.join(" / ")
                    : "尚未识别"}
                </div>
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );

  const renderApiPanel = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-500">{apiMessage}</div>
        <button
          type="button"
          onClick={saveApiKeys}
          disabled={apiSaving}
          className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {apiSaving ? "保存中" : "保存配置"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {apiKeys.map((apiKey) => {
          const draft = apiDrafts[apiKey.id];

          return (
            <article
              key={apiKey.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-lg font-black tracking-tight text-slate-950">
                    {apiKey.label}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-400">
                    {apiKey.envKey}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={
                      apiKey.hasKey
                        ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
                        : "rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700"
                    }
                  >
                    {apiKey.hasKey ? "已配置" : "未配置"}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                    {apiKey.sourceLabel}
                  </span>
                </div>
              </div>

              <label className="mt-4 block text-xs font-bold text-slate-500">
                API Key
                <input
                  type="password"
                  value={draft?.apiKey ?? ""}
                  onChange={(event) => updateApiDraft(apiKey.id, "apiKey", event.target.value)}
                  placeholder={
                    apiKey.maskedKey ? `已读取：${apiKey.maskedKey}` : "填写后保存为页面覆盖值"
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                />
              </label>

              <div className="mt-3 grid gap-3">
                <label className="block text-xs font-bold text-slate-500">
                  Base URL
                  <input
                    value={draft?.baseUrl ?? ""}
                    onChange={(event) => updateApiDraft(apiKey.id, "baseUrl", event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-500">
                  Model
                  <input
                    value={draft?.model ?? ""}
                    onChange={(event) => updateApiDraft(apiKey.id, "model", event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                  />
                </label>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );

  const renderSkillPanel = () => (
    <div className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Command Install
            </div>
            <h3 className="mt-1 text-lg font-black text-slate-950">命令安装</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {repository.commandPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setCommand(preset.command)}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                title={preset.note}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
          />
          <button
            type="button"
            onClick={runCommand}
            disabled={commandRunning}
            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {commandRunning ? "执行中" : "运行"}
          </button>
        </div>

        <pre className="mt-4 h-[30rem] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
          {terminalText(commandResult)}
        </pre>
      </div>

      <div className="grid max-h-[39rem] gap-4 overflow-y-auto pr-1">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Zip Import
              </div>
              <h3 className="mt-1 text-lg font-black text-slate-950">Zip 导入</h3>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
              {packageCountLabel}
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            className="mt-4 block w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          />

          <button
            type="button"
            onClick={uploadZip}
            disabled={uploading}
            className="mt-4 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? "上传中" : selectedFile ? `上传 ${selectedFile.name}` : "上传并解压"}
          </button>

          <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-700">
            {uploadMessage}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-black text-slate-900">
                最近下载/上传的Skill包
              </div>
              <div className="mt-1 text-xs text-slate-400">
                这里只放最近快照，完整文件夹管理进入管理页维护。
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
              {packageCountLabel}
            </span>
          </div>
          <div className="max-h-[19rem] overflow-y-auto pr-1">
            {sortedPackages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-7 text-slate-500">
                还没有本地 Skill 包。
              </div>
            ) : (
              <div className="space-y-3">
                {sortedPackages.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-950">
                          {item.displayName}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {item.sourceLabel} · {formatDate(item.uploadedAt)}
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {item.folderName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Link
            href="/ai-dorm/skills/packages"
            className="mt-4 flex w-full items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
          >
            进入本地包管理
          </Link>
        </div>
      </div>
    </div>
  );

  const renderBlueprintPanel = () => (
    <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="max-h-[39rem] space-y-3 overflow-y-auto pr-1">
        {repository.skills.map((skill) => {
          const active = skill.id === selectedSkill.id;

          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => setActiveSkillId(skill.id)}
              className={
                active
                  ? "block w-full rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left shadow-sm"
                  : "block w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-200 hover:bg-white"
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  {skill.category}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  {sourceKindLabel(skill.sourceKind)}
                </span>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {skill.statusLabel}
                </span>
              </div>
              <div className="mt-3 text-lg font-black tracking-tight text-slate-950">
                {skill.name}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-500">{skill.summary}</div>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">
          Selected Production Asset
        </div>
        <h2 className="mt-2 text-[1.65rem] font-black tracking-tight text-slate-950">
          {selectedSkill.name}
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-500">{selectedSkill.summary}</p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              输入
            </div>
            <div className="mt-2 text-sm leading-7 text-slate-700">
              {selectedSkill.inputSummary}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              输出
            </div>
            <div className="mt-2 text-sm leading-7 text-slate-700">
              {selectedSkill.outputSummary}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              关联工作协议
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedSkill.linkedWorkflowNames.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              关联 AI员工
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedSkill.linkedAgentNames.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Embedded BP Ask
              </div>
              <div className="mt-1 text-sm font-black text-slate-900">
                {repository.draftAssistant.title}
              </div>
            </div>
            <Link
              href={repository.draftAssistant.ctaHref}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {repository.draftAssistant.ctaLabel}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  const renderMemoryPanel = () => (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              BP Ask Brain Map
            </div>
            <h3 className="mt-2 text-xl font-black text-slate-950">BP问问大脑</h3>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">
              项目里已有 memory_facts 表和 BP问问 memory fact 读写链路。这里先把记忆拆成脑区入口，点击小点或下方列表进入单独配置页。
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            点位入口 / 配置页
          </span>
        </div>

        <div className="relative mt-5 overflow-hidden rounded-[1.5rem] border border-blue-100 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.16),transparent_30%),linear-gradient(135deg,#eef6ff,#f8fbff)] p-4">
          <div className="relative h-[24rem]">
            <svg
              viewBox="0 0 760 390"
              className="absolute inset-0 h-full w-full"
              role="img"
              aria-label="BP问问大脑记忆脑区图"
            >
              <defs>
                <linearGradient id="bpai-brain-fill" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#dbeafe" />
                  <stop offset="55%" stopColor="#bfdbfe" />
                  <stop offset="100%" stopColor="#e0f2fe" />
                </linearGradient>
                <filter id="bpai-brain-shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="16" stdDeviation="18" floodColor="#1e3a8a" floodOpacity="0.16" />
                </filter>
              </defs>
              <path
                d="M132 252c-42-12-72-47-72-91 0-51 40-92 92-94 22-40 66-63 111-51 31-31 77-39 116-18 42-27 96-17 126 23 48-6 93 24 106 69 43 10 72 47 72 91 0 50-39 91-89 94-20 42-69 65-115 50-37 32-93 36-134 7-38 19-84 10-113-20-36 11-79-10-100-60Z"
                fill="url(#bpai-brain-fill)"
                stroke="#60a5fa"
                strokeWidth="4"
                filter="url(#bpai-brain-shadow)"
              />
              <path
                d="M372 27c-24 38-25 80-2 124 19 38 16 77-8 116-14 22-14 47-2 76"
                fill="none"
                stroke="#93c5fd"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M166 110c37-18 76-14 112 13M130 164c42-13 81-5 119 23M138 218c44-1 79 15 106 48M220 78c15 34 43 55 84 64M258 248c34-30 74-38 120-23M292 84c-4 38 12 75 47 112M462 69c-33 33-45 72-35 117M486 121c46-21 90-10 130 31M470 203c39 23 82 24 130 4M428 271c47 6 88-5 122-33M548 91c18 27 19 59 4 96M213 160c42-5 76 10 102 44M185 274c39 23 79 23 121 0M343 307c35 25 73 29 115 10"
                fill="none"
                stroke="#ffffff"
                strokeWidth="9"
                strokeLinecap="round"
                opacity="0.78"
              />
              <path
                d="M166 110c37-18 76-14 112 13M130 164c42-13 81-5 119 23M138 218c44-1 79 15 106 48M220 78c15 34 43 55 84 64M258 248c34-30 74-38 120-23M292 84c-4 38 12 75 47 112M462 69c-33 33-45 72-35 117M486 121c46-21 90-10 130 31M470 203c39 23 82 24 130 4M428 271c47 6 88-5 122-33M548 91c18 27 19 59 4 96M213 160c42-5 76 10 102 44M185 274c39 23 79 23 121 0M343 307c35 25 73 29 115 10"
                fill="none"
                stroke="#60a5fa"
                strokeWidth="2.2"
                strokeLinecap="round"
                opacity="0.74"
              />
            </svg>

            {MEMORY_BRAIN_NODES.map((node, index) => (
              <Link
                key={node.id}
                href={node.href}
                title={node.title}
                aria-label={node.title}
                className={`absolute z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white text-xs font-black text-white shadow-lg transition hover:scale-110 ${node.color}`}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
              >
                {index + 1}
              </Link>
            ))}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {MEMORY_BRAIN_NODES.map((node, index) => (
              <Link
                key={node.id}
                href={node.href}
                className="rounded-2xl border border-blue-100 bg-white/90 p-3 text-left shadow-sm transition hover:border-blue-300 hover:bg-white"
              >
                <div className="flex items-center gap-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white ${node.color}`}>
                    {index + 1}
                  </span>
                  <span className="text-sm font-black text-slate-950">{node.title}</span>
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{node.summary}</div>
              </Link>
            ))}
          </div>

          <div className="mt-4 rounded-[1.4rem] border border-indigo-100 bg-white/90 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-indigo-300">
                  Dream Cycle
                </div>
                <h4 className="mt-2 text-xl font-black text-slate-950">做梦</h4>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">
                  未来让 BP问问在空闲时间整理自己的记忆，发现缺口、合并重复片段，并生成待确认的补全建议。
                </p>
              </div>
              <button
                type="button"
                onClick={startDreaming}
                disabled={dreamRunning}
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {dreamRunning ? "做梦中" : "开始做梦"}
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black text-slate-500">每日自动做梦</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={dreamScheduled}
                    onClick={() => setDreamScheduled((value) => !value)}
                    className={`flex h-7 w-12 items-center rounded-full p-1 transition ${
                      dreamScheduled ? "bg-indigo-500" : "bg-slate-200"
                    }`}
                  >
                    <span
                      className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${
                        dreamScheduled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {dreamScheduled ? "已开启定时整理。" : "关闭时只支持手动启动。"}
                </p>
              </div>

              <label className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-black text-slate-500">
                定时时间
                <input
                  type="time"
                  value={dreamTime}
                  onChange={(event) => setDreamTime(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-indigo-300"
                />
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-black text-slate-500">当前状态</div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      dreamRunning ? "bg-indigo-500" : dreamProgress >= 100 ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  />
                  <span className="text-sm font-black text-slate-800">{dreamStatusText}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {dreamScheduled ? `每天 ${dreamTime} 自动做梦。` : "尚未安排自动时间。"}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs font-black text-slate-500">
                <span>记忆整理进度</span>
                <span>{dreamProgress}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-blue-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${dreamProgress}%` }}
                />
              </div>
              <div className="mt-3 grid gap-2 text-xs font-bold text-slate-500 sm:grid-cols-4">
                {["读取近期记忆", "发现记忆空洞", "合并重复片段", "生成待确认建议"].map((step) => (
                  <span key={step} className="rounded-full bg-slate-100 px-3 py-2 text-center">
                    {step}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Lobster Memory List
              </div>
              <h3 className="mt-2 text-xl font-black text-slate-950">龙虾记忆入口</h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                不画大图，直接列出已有龙虾。点击进入单只龙虾的记忆目录、可见范围和记忆片段页面。
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              {LOBSTER_MEMORY_ENTRIES.length} 只龙虾
            </span>
          </div>

          <div className="mt-4 grid max-h-[31rem] gap-3 overflow-y-auto pr-1">
            {LOBSTER_MEMORY_ENTRIES.map((agent) => (
              <Link
                key={agent.id}
                href={`/ai-dorm/skills/memory/lobsters/${agent.id}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-emerald-200 hover:bg-white"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-slate-950">{agent.name}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{agent.scope}</div>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                    {agent.status}
                  </span>
                </div>
                <div className="mt-3 rounded-xl bg-white px-3 py-2 font-mono text-[11px] leading-5 text-slate-500 ring-1 ring-slate-200">
                  {agent.path}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
            Existing Memory Base
          </div>
          <h3 className="mt-2 text-lg font-black text-slate-950">现有底座</h3>
          <div className="mt-4 grid gap-3">
            {[
              ["memory_facts", "数据库已有记忆事实表，含 scope / fact_type / fact_key。"],
              ["BP问问 memory fact", "服务层已有近期记忆读取、upsert 和核心记忆同步函数。"],
              ["OpenClaw state", "docker/openclaw/state-* 下已有龙虾状态目录。"],
            ].map(([title, description]) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="text-sm font-black text-slate-950">{title}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  {description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderRagPanel = () => (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
            Knowledge Base
          </div>
          <h3 className="mt-2 text-lg font-black text-slate-950">知识库配置</h3>
          <div className="mt-4 grid gap-3">
            <label className="block text-xs font-bold text-slate-500">
              知识库名称
              <input
                defaultValue="项目资料默认知识库"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none"
              />
            </label>
            <label className="block text-xs font-bold text-slate-500">
              数据来源
              <select className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none">
                <option>文档档案室 / 全部文件</option>
                <option>文档档案室 / 我的文档空间</option>
                <option>文档档案室 / 合作空间</option>
                <option>工单 / 当前工单附件</option>
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
            Chunking
          </div>
          <h3 className="mt-2 text-lg font-black text-slate-950">切片与索引参数</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block text-xs font-bold text-slate-500">
              Chunk Size
              <input
                defaultValue="900"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none"
              />
            </label>
            <label className="block text-xs font-bold text-slate-500">
              Overlap
              <input
                defaultValue="120"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-white/45">
              Retrieval Lab
            </div>
            <h3 className="mt-2 text-xl font-black">检索测试台</h3>
          </div>
          <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-200">
            原型占位
          </span>
        </div>

        <textarea
          defaultValue="查一下当前项目里和送审资料包相关的缺项、风险和负责人。"
          className="mt-5 h-28 w-full resize-none rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm leading-7 text-white outline-none placeholder:text-white/45"
        />

        <button
          type="button"
          className="mt-4 rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950"
        >
          模拟检索
        </button>

        <div className="mt-5 h-[18rem] overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-slate-200">
          <p>这里会显示召回片段、来源文件、相似度和最终交给 BP问问 / 龙虾的上下文包。</p>
          <p className="mt-3 text-slate-400">
            下一步接真实链路时，这里会连到文档解析、向量索引、检索评分和权限范围过滤。
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <section className="hidden rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">
              AI Production Assets
            </div>
            <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-slate-950">
              AI生产资料仓
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-500">
              API Key、Skill、RAG、记忆和内置蓝图集中在一个操作中心。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActivePanel("api")}
              className="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              API Key {configuredApiCount}/{apiKeys.length}
            </button>
            <button
              type="button"
              onClick={() => setActivePanel("skill")}
              className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              {packageCountLabel}
            </button>
            <button
              type="button"
              onClick={() => setActivePanel("blueprints")}
              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
            >
              内置 Skill {repository.skills.length}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {PANEL_CARDS.map((card) => {
          const active = card.id === activePanel;

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setActivePanel(card.id)}
              className="group relative text-left transition-all duration-300 hover:-translate-y-0.5"
            >
              <div
                className={`${card.color} relative flex min-h-[8.3rem] flex-col justify-end overflow-hidden p-4 text-white shadow-lg ${
                  active ? "ring-4 ring-blue-100" : ""
                }`}
                style={{
                  clipPath:
                    "polygon(5% 0%, 100% 0%, 100% 88%, 96% 100%, 0% 100%, 0% 12%)",
                }}
              >
                <div className="absolute top-3 right-3 h-12 w-12 rounded-full border border-white/20 bg-white/10" />
                <div className="relative z-10">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/75">
                    {card.eyebrow}
                  </div>
                  <div className="mt-2 text-xl font-black tracking-tight">{card.title}</div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/75">
                    {card.summary}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              {activeCard.eyebrow}
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              {activeCard.title}
            </h2>
          </div>
          <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-500 ring-1 ring-slate-200">
            {activeCard.summary}
          </div>
        </div>

        <div className="h-[calc(100vh-25rem)] min-h-[42rem] overflow-y-auto p-5">
          {activePanel === "api" && renderApiPanel()}
          {activePanel === "skill" && renderSkillPanel()}
          {activePanel === "blueprints" && renderBlueprintPanel()}
          {activePanel === "rag" && renderRagPanel()}
          {activePanel === "memory" && renderMemoryPanel()}
        </div>
      </section>
    </div>
  );
}
