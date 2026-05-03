import "server-only";

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type AiProductionApiProviderId = "deepseek" | "kimi";

export type AiProductionApiKeyRecord = {
  id: AiProductionApiProviderId;
  label: string;
  envKey: string;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  maskedKey: string;
  sourceLabel: string;
  savedKeyValue: string;
};

export type AiProductionApiKeyDraft = {
  id: AiProductionApiProviderId;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export type AiProductionCommandPreset = {
  id: string;
  label: string;
  command: string;
  note: string;
};

export type AiProductionCommandResult = {
  command: string;
  cwd: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  message: string;
};

export type AiProductionSkillPackage = {
  id: string;
  fileName: string;
  displayName: string;
  sizeBytes: number;
  uploadedAt: string;
  zipStored: boolean;
  sourceLabel: string;
  statusLabel: string;
  zipPath: string;
  extractPath: string;
  extracted: boolean;
  entryFileNames: string[];
  folderId: string | null;
  folderName: string;
};

export type AiProductionSkillFolder = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  packageCount: number;
};

type SavedApiKeyConfig = {
  providers?: Partial<
    Record<
      AiProductionApiProviderId,
      {
        apiKey?: string;
        baseUrl?: string;
        model?: string;
      }
    >
  >;
};

type SkillPackageFolderConfig = {
  folders?: Record<
    string,
    {
      name: string;
      description?: string;
      createdAt: string;
      updatedAt: string;
    }
  >;
  packageFolders?: Record<string, string>;
};

const PRODUCTION_ASSET_ROOT = path.join(process.cwd(), ".bpai", "production-assets");
const API_KEY_CONFIG_PATH = path.join(PRODUCTION_ASSET_ROOT, "api-keys.json");
const SKILL_FOLDERS_PATH = path.join(PRODUCTION_ASSET_ROOT, "skill-package-folders.json");
const SKILL_ZIP_ROOT = path.join(PRODUCTION_ASSET_ROOT, "skill-zips");
const SKILL_EXTRACT_ROOT = path.join(PRODUCTION_ASSET_ROOT, "skills");
const SKILL_COMMAND_ROOT = path.join(PRODUCTION_ASSET_ROOT, "market-workspace");
const MAX_ZIP_SIZE_BYTES = 80 * 1024 * 1024;

const PROVIDERS = [
  {
    id: "deepseek" as const,
    label: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    baseUrlEnvKey: "DEEPSEEK_BASE_URL",
    modelEnvKey: "DEEPSEEK_MODEL",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-pro",
  },
  {
    id: "kimi" as const,
    label: "Kimi",
    envKey: "KIMI_API_KEY",
    fallbackEnvKey: "MOONSHOT_API_KEY",
    baseUrlEnvKey: "KIMI_BASE_URL",
    fallbackBaseUrlEnvKey: "MOONSHOT_BASE_URL",
    modelEnvKey: "KIMI_MODEL",
    fallbackModelEnvKey: "MOONSHOT_MODEL",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "kimi-k2.5",
  },
];

function getEnv(name?: string) {
  return name ? process.env[name]?.trim() ?? "" : "";
}

function maskKey(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.length <= 12) {
    return `${trimmed.slice(0, 3)}...${trimmed.slice(-3)}`;
  }

  return `${trimmed.slice(0, 6)}...${trimmed.slice(-6)}`;
}

function normalizeRelativePath(value: string) {
  return path.relative(process.cwd(), value).replace(/\\/g, "/");
}

function sanitizeFileName(value: string) {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 120) || "skill.zip"
  );
}

function sanitizePackageId(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 120);
}

function getDisplayName(fileName: string) {
  const withoutPrefix = fileName.includes("__")
    ? fileName.split("__").slice(1).join("__")
    : fileName;

  return withoutPrefix.replace(/\.zip$/i, "");
}

async function ensureProductionAssetDirs() {
  await Promise.all([
    mkdir(PRODUCTION_ASSET_ROOT, { recursive: true }),
    mkdir(SKILL_ZIP_ROOT, { recursive: true }),
    mkdir(SKILL_EXTRACT_ROOT, { recursive: true }),
    mkdir(SKILL_COMMAND_ROOT, { recursive: true }),
  ]);
}

async function readSavedApiKeyConfig(): Promise<SavedApiKeyConfig> {
  await ensureProductionAssetDirs();

  const raw = await readFile(API_KEY_CONFIG_PATH, "utf8").catch(() => "");

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as SavedApiKeyConfig;
  } catch {
    return {};
  }
}

async function readSkillPackageFolderConfig(): Promise<SkillPackageFolderConfig> {
  await ensureProductionAssetDirs();

  const raw = await readFile(SKILL_FOLDERS_PATH, "utf8").catch(() => "");

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as SkillPackageFolderConfig;
  } catch {
    return {};
  }
}

async function writeSkillPackageFolderConfig(config: SkillPackageFolderConfig) {
  await ensureProductionAssetDirs();
  await writeFile(SKILL_FOLDERS_PATH, JSON.stringify(config, null, 2), "utf8");
}

function getPackageFolder(
  folderConfig: SkillPackageFolderConfig,
  packageId: string,
) {
  const folderId = folderConfig.packageFolders?.[packageId] ?? null;
  const folder = folderId ? folderConfig.folders?.[folderId] : null;

  return {
    folderId: folder ? folderId : null,
    folderName: folder?.name ?? "未归档",
  };
}

export async function getAiProductionApiKeyRecords(): Promise<AiProductionApiKeyRecord[]> {
  const saved = await readSavedApiKeyConfig();

  return PROVIDERS.map((provider) => {
    const savedProvider = saved.providers?.[provider.id] ?? {};
    const savedApiKey = savedProvider.apiKey?.trim() ?? "";
    const envApiKey = getEnv(provider.envKey) || getEnv(provider.fallbackEnvKey);
    const apiKey = savedApiKey || envApiKey;
    const baseUrl =
      savedProvider.baseUrl?.trim() ||
      getEnv(provider.baseUrlEnvKey) ||
      getEnv(provider.fallbackBaseUrlEnvKey) ||
      provider.defaultBaseUrl;
    const model =
      savedProvider.model?.trim() ||
      getEnv(provider.modelEnvKey) ||
      getEnv(provider.fallbackModelEnvKey) ||
      provider.defaultModel;

    return {
      id: provider.id,
      label: provider.label,
      envKey: provider.envKey,
      baseUrl,
      model,
      hasKey: Boolean(apiKey),
      maskedKey: maskKey(apiKey),
      sourceLabel: savedApiKey ? "页面保存" : envApiKey ? "环境变量" : "未配置",
      savedKeyValue: savedApiKey,
    };
  });
}

export async function saveAiProductionApiKeyRecords(
  drafts: AiProductionApiKeyDraft[],
) {
  await ensureProductionAssetDirs();
  const current = await readSavedApiKeyConfig();
  const next: SavedApiKeyConfig = {
    providers: {
      ...(current.providers ?? {}),
    },
  };

  for (const draft of drafts) {
    if (!PROVIDERS.some((provider) => provider.id === draft.id)) {
      continue;
    }

    const previous = next.providers?.[draft.id] ?? {};
    next.providers = next.providers ?? {};
    next.providers[draft.id] = {
      ...previous,
      apiKey:
        typeof draft.apiKey === "string" && draft.apiKey.trim()
          ? draft.apiKey.trim()
          : undefined,
      baseUrl:
        typeof draft.baseUrl === "string" && draft.baseUrl.trim()
          ? draft.baseUrl.trim()
          : undefined,
      model:
        typeof draft.model === "string" && draft.model.trim()
          ? draft.model.trim()
          : undefined,
    };
  }

  await writeFile(API_KEY_CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");

  return getAiProductionApiKeyRecords();
}

export function getAiProductionCommandPresets(): AiProductionCommandPreset[] {
  return [
    {
      id: "skills-add-npx",
      label: "npx 安装",
      command: "npx skills add bytedance/deer-flow",
      note: "适合直接从 Skill 市场安装公开仓库。",
    },
    {
      id: "skills-add-bunx",
      label: "bunx 安装",
      command: "bunx skills add bytedance/deer-flow",
      note: "如果镜像里更偏向 bunx，可以用这一条。",
    },
    {
      id: "skills-add-pnpm",
      label: "pnpm dlx",
      command: "pnpm dlx skills add bytedance/deer-flow",
      note: "等价的 pnpm 临时执行方式。",
    },
    {
      id: "workspace-list",
      label: "查看目录",
      command: "ls",
      note: "查看本地 Skill 市场工作区当前内容。",
    },
  ];
}

export function getAiProductionCommandRoot() {
  return SKILL_COMMAND_ROOT;
}

function parseCommandLine(command: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const char of command.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function stripNpxFlags(args: string[]) {
  let index = 0;

  while (
    index < args.length &&
    (args[index] === "-y" || args[index] === "--yes" || args[index] === "--package")
  ) {
    index += args[index] === "--package" ? 2 : 1;
  }

  return args.slice(index);
}

function hasHttpUrl(args: string[]) {
  return args.some((arg) => /^https?:\/\//i.test(arg));
}

function validateProductionCommand(tokens: string[]) {
  if (tokens.length === 0) {
    return { ok: false, message: "请先输入命令。" };
  }

  const command = tokens[0].toLowerCase();
  const args = tokens.slice(1);

  if (command === "pwd") {
    return { ok: args.length === 0, message: args.length === 0 ? "" : "pwd 不需要参数。" };
  }

  if (command === "ls") {
    const allowed = args.every((arg) => !arg.includes("..") && !/[;&|<>]/.test(arg));
    return {
      ok: allowed,
      message: allowed ? "" : "ls 只允许查看本地 Skill 市场工作区内的相对路径。",
    };
  }

  if (command === "wget" || command === "curl") {
    return {
      ok: hasHttpUrl(args),
      message: hasHttpUrl(args) ? "" : "下载命令需要包含 http(s) 链接。",
    };
  }

  if (command === "npx" || command === "bunx") {
    const normalized = stripNpxFlags(args);
    return {
      ok: normalized[0] === "skills" && normalized[1] === "add",
      message: "这里只允许执行 skills add 安装命令。",
    };
  }

  if (command === "pnpm") {
    const normalized = args[0] === "dlx" ? args.slice(1) : args;
    return {
      ok: normalized[0] === "skills" && normalized[1] === "add",
      message: "pnpm 这里只允许执行 pnpm dlx skills add。",
    };
  }

  return {
    ok: false,
    message: "当前只支持 npx/bunx/pnpm skills add、wget/curl、ls、pwd。",
  };
}

function resolveExecutable(command: string) {
  if (
    process.platform === "win32" &&
    ["npm", "npx", "pnpm", "bunx"].includes(command.toLowerCase())
  ) {
    return `${command}.cmd`;
  }

  return command;
}

function runProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    timeoutMs: number;
    originalCommand?: string;
  },
): Promise<AiProductionCommandResult> {
  const startedAt = Date.now();
  const originalCommand = options.originalCommand ?? [command, ...args].join(" ");

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(resolveExecutable(command), args, {
      cwd: options.cwd,
      shell: false,
      env: process.env,
    });
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      resolve({
        command: originalCommand,
        cwd: normalizeRelativePath(options.cwd),
        ok: false,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        message: "命令超时，已停止。",
      });
    }, options.timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      stdout = stdout.slice(-20000);
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      stderr = stderr.slice(-20000);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        command: originalCommand,
        cwd: normalizeRelativePath(options.cwd),
        ok: false,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        message: error.message,
      });
    });

    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        command: originalCommand,
        cwd: normalizeRelativePath(options.cwd),
        ok: exitCode === 0,
        exitCode,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        message: exitCode === 0 ? "命令执行完成。" : "命令执行失败。",
      });
    });
  });
}

export async function runAiProductionSkillCommand(command: string) {
  await ensureProductionAssetDirs();
  const trimmed = command.trim();
  const tokens = parseCommandLine(trimmed);
  const validation = validateProductionCommand(tokens);

  if (!validation.ok) {
    return {
      command: trimmed,
      cwd: normalizeRelativePath(SKILL_COMMAND_ROOT),
      ok: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      message: validation.message,
    };
  }

  return runProcess(tokens[0], tokens.slice(1), {
    cwd: SKILL_COMMAND_ROOT,
    timeoutMs: 120000,
    originalCommand: trimmed,
  });
}

async function listEntryNames(directoryPath: string) {
  const entries = await readdir(directoryPath).catch(() => []);
  return entries.slice(0, 10);
}

async function extractZip(zipPath: string, extractPath: string) {
  await rm(extractPath, { force: true, recursive: true }).catch(() => undefined);
  await mkdir(extractPath, { recursive: true });

  const result = await runProcess("unzip", ["-q", zipPath, "-d", extractPath], {
    cwd: PRODUCTION_ASSET_ROOT,
    timeoutMs: 90000,
  });

  if (!result.ok) {
    await rm(extractPath, { force: true, recursive: true }).catch(() => undefined);
  }

  return result.ok;
}

async function getUploadedZipPackages(
  folderConfig: SkillPackageFolderConfig,
): Promise<AiProductionSkillPackage[]> {
  const zipFiles = await readdir(SKILL_ZIP_ROOT).catch(() => []);
  const packages = await Promise.all(
    zipFiles
      .filter((fileName) => fileName.toLowerCase().endsWith(".zip"))
      .map(async (fileName) => {
        const id = fileName.split("__")[0] || fileName.replace(/\.zip$/i, "");
        const zipPath = path.join(SKILL_ZIP_ROOT, fileName);
        const extractPath = path.join(SKILL_EXTRACT_ROOT, id);
        const [zipStat, extractedEntries] = await Promise.all([
          stat(zipPath),
          listEntryNames(extractPath),
        ]);
        const folder = getPackageFolder(folderConfig, id);

        return {
          id,
          fileName,
          displayName: getDisplayName(fileName),
          sizeBytes: zipStat.size,
          uploadedAt: zipStat.mtime.toISOString(),
          zipStored: true,
          sourceLabel: "Zip 上传",
          statusLabel: extractedEntries.length > 0 ? "已解压" : "仅保存压缩包",
          zipPath: normalizeRelativePath(zipPath),
          extractPath: normalizeRelativePath(extractPath),
          extracted: extractedEntries.length > 0,
          entryFileNames: extractedEntries,
          folderId: folder.folderId,
          folderName: folder.folderName,
        };
      }),
  );

  return packages;
}

async function getCommandWorkspacePackages(
  folderConfig: SkillPackageFolderConfig,
): Promise<AiProductionSkillPackage[]> {
  const entries = await readdir(SKILL_COMMAND_ROOT, { withFileTypes: true }).catch(
    () => [],
  );
  const packages = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const safeName = sanitizePackageId(entry.name);
        const packageId = `cmd-${safeName}`;
        const directoryPath = path.join(SKILL_COMMAND_ROOT, entry.name);
        const directoryStat = await stat(directoryPath);
        const entryFileNames = await listEntryNames(directoryPath);
        const folder = getPackageFolder(folderConfig, packageId);

        return {
          id: packageId,
          fileName: entry.name,
          displayName: entry.name,
          sizeBytes: 0,
          uploadedAt: directoryStat.mtime.toISOString(),
          zipStored: false,
          sourceLabel: "命令行安装",
          statusLabel: "工作区目录",
          zipPath: "",
          extractPath: normalizeRelativePath(directoryPath),
          extracted: true,
          entryFileNames,
          folderId: folder.folderId,
          folderName: folder.folderName,
        };
      }),
  );

  return packages;
}

export async function getAiProductionSkillPackages(): Promise<
  AiProductionSkillPackage[]
> {
  await ensureProductionAssetDirs();
  const folderConfig = await readSkillPackageFolderConfig();
  const [uploadedPackages, commandPackages] = await Promise.all([
    getUploadedZipPackages(folderConfig),
    getCommandWorkspacePackages(folderConfig),
  ]);

  return [...uploadedPackages, ...commandPackages].sort(
    (left, right) => Date.parse(right.uploadedAt) - Date.parse(left.uploadedAt),
  );
}

export async function saveAiProductionSkillZip(file: File) {
  await ensureProductionAssetDirs();

  if (!file.name.toLowerCase().endsWith(".zip")) {
    throw new Error("INVALID_SKILL_ZIP");
  }

  if (file.size > MAX_ZIP_SIZE_BYTES) {
    throw new Error("SKILL_ZIP_TOO_LARGE");
  }

  const originalName = sanitizeFileName(file.name);
  const id = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const fileName = `${id}__${
    originalName.toLowerCase().endsWith(".zip") ? originalName : `${originalName}.zip`
  }`;
  const zipPath = path.join(SKILL_ZIP_ROOT, fileName);
  const extractPath = path.join(SKILL_EXTRACT_ROOT, id);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(zipPath, buffer);
  await extractZip(zipPath, extractPath);

  return getAiProductionSkillPackages();
}

export async function deleteAiProductionSkillPackage(packageId: string) {
  await ensureProductionAssetDirs();
  const safeId = sanitizePackageId(packageId);

  if (!safeId) {
    return getAiProductionSkillPackages();
  }

  const folderConfig = await readSkillPackageFolderConfig();
  if (folderConfig.packageFolders?.[safeId]) {
    delete folderConfig.packageFolders[safeId];
    await writeSkillPackageFolderConfig(folderConfig);
  }

  if (safeId.startsWith("cmd-")) {
    const commandDirName = safeId.slice(4);

    if (commandDirName) {
      await rm(path.join(SKILL_COMMAND_ROOT, commandDirName), {
        force: true,
        recursive: true,
      }).catch(() => undefined);
    }

    return getAiProductionSkillPackages();
  }

  const zipFiles = await readdir(SKILL_ZIP_ROOT).catch(() => []);
  await Promise.all([
    ...zipFiles
      .filter((fileName) => fileName.startsWith(`${safeId}__`))
      .map((fileName) => rm(path.join(SKILL_ZIP_ROOT, fileName), { force: true })),
    rm(path.join(SKILL_EXTRACT_ROOT, safeId), { force: true, recursive: true }),
  ]);

  return getAiProductionSkillPackages();
}

export async function getAiProductionSkillFolders(): Promise<
  AiProductionSkillFolder[]
> {
  const [folderConfig, packages] = await Promise.all([
    readSkillPackageFolderConfig(),
    getAiProductionSkillPackages(),
  ]);
  const packageCounts = new Map<string, number>();

  for (const item of packages) {
    if (item.folderId) {
      packageCounts.set(item.folderId, (packageCounts.get(item.folderId) ?? 0) + 1);
    }
  }

  return Object.entries(folderConfig.folders ?? {})
    .map(([id, folder]) => ({
      id,
      name: folder.name,
      description: folder.description ?? "",
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
      packageCount: packageCounts.get(id) ?? 0,
    }))
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

export async function createAiProductionSkillFolder(input: {
  name: string;
  description?: string;
}) {
  const name = input.name.trim();

  if (!name) {
    throw new Error("INVALID_FOLDER_NAME");
  }

  const folderConfig = await readSkillPackageFolderConfig();
  const timestamp = new Date().toISOString();
  const folderId = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  folderConfig.folders = folderConfig.folders ?? {};
  folderConfig.folders[folderId] = {
    name: name.slice(0, 48),
    description: input.description?.trim().slice(0, 160) ?? "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await writeSkillPackageFolderConfig(folderConfig);

  return getAiProductionSkillFolders();
}

export async function deleteAiProductionSkillFolder(folderId: string) {
  const safeId = sanitizePackageId(folderId);
  const folderConfig = await readSkillPackageFolderConfig();

  if (!safeId || !folderConfig.folders?.[safeId]) {
    return getAiProductionSkillFolders();
  }

  delete folderConfig.folders[safeId];

  if (folderConfig.packageFolders) {
    for (const [packageId, currentFolderId] of Object.entries(
      folderConfig.packageFolders,
    )) {
      if (currentFolderId === safeId) {
        delete folderConfig.packageFolders[packageId];
      }
    }
  }

  await writeSkillPackageFolderConfig(folderConfig);

  return getAiProductionSkillFolders();
}

export async function moveAiProductionSkillPackageToFolder(input: {
  packageId: string;
  folderId: string | null;
}) {
  const safePackageId = sanitizePackageId(input.packageId);
  const safeFolderId = input.folderId ? sanitizePackageId(input.folderId) : null;

  if (!safePackageId) {
    throw new Error("INVALID_PACKAGE_ID");
  }

  const folderConfig = await readSkillPackageFolderConfig();
  folderConfig.packageFolders = folderConfig.packageFolders ?? {};

  if (!safeFolderId) {
    delete folderConfig.packageFolders[safePackageId];
  } else {
    if (!folderConfig.folders?.[safeFolderId]) {
      throw new Error("INVALID_FOLDER_ID");
    }

    folderConfig.packageFolders[safePackageId] = safeFolderId;
  }

  await writeSkillPackageFolderConfig(folderConfig);

  const [packages, folders] = await Promise.all([
    getAiProductionSkillPackages(),
    getAiProductionSkillFolders(),
  ]);

  return { packages, folders };
}
