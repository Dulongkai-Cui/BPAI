import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  CompiledProtocolDefinition,
  ProtocolRuntimeMode,
  RegisteredProtocol,
  RegisteredProtocolVersion,
  WorkProtocolDraft,
  WorkProtocolDraftRecordKind,
} from "@/lib/work-protocol/types";

type RegistryFile = {
  protocols?: RegisteredProtocol[];
};

const REGISTRY_ROOT = path.join(process.cwd(), ".bpai", "work-protocol-gateway");
const REGISTRY_PATH = path.join(REGISTRY_ROOT, "registered-protocols.json");

async function ensureRegistryDir() {
  await mkdir(REGISTRY_ROOT, { recursive: true });
}

async function readRegistryFile(): Promise<RegistryFile> {
  await ensureRegistryDir();

  const raw = await readFile(REGISTRY_PATH, "utf8").catch(() => "");

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as RegistryFile;
  } catch {
    return {};
  }
}

async function writeRegistryFile(registry: RegistryFile) {
  await ensureRegistryDir();

  const tempPath = `${REGISTRY_PATH}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(registry, null, 2), "utf8");
  await rename(tempPath, REGISTRY_PATH);
}

function sortProtocols(protocols: RegisteredProtocol[]) {
  return [...protocols].sort((left, right) => {
    if (left.enabled !== right.enabled) {
      return left.enabled ? -1 : 1;
    }

    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function nextVersionNumber(protocol?: RegisteredProtocol) {
  if (!protocol) {
    return 1;
  }

  return (
    Math.max(0, ...protocol.versions.map((version) => version.versionNumber)) + 1
  );
}

function buildRegisteredVersion(params: {
  draft: WorkProtocolDraft;
  compiledDefinition: CompiledProtocolDefinition;
  versionNumber: number;
  registeredBy: string;
  draftRecordId?: string;
  draftKind?: WorkProtocolDraftRecordKind;
}) {
  const {
    draft,
    compiledDefinition,
    versionNumber,
    registeredBy,
    draftRecordId,
    draftKind,
  } = params;

  return {
    versionId: compiledDefinition.versionId,
    versionNumber,
    compiledDefinition: {
      ...compiledDefinition,
      versionNumber,
    },
    draftSnapshot: draft,
    draftRecordId,
    draftKind,
    capabilityCatalogHash: compiledDefinition.capabilityCatalogHash,
    registeredAt: new Date().toISOString(),
    registeredBy,
  } satisfies RegisteredProtocolVersion;
}

export async function getRegisteredWorkProtocols() {
  const registry = await readRegistryFile();
  return sortProtocols(registry.protocols ?? []);
}

export async function registerWorkProtocol(params: {
  draft: WorkProtocolDraft;
  compiledDefinition: CompiledProtocolDefinition;
  registeredBy: string;
  enabled?: boolean;
  priority?: number;
  runtimeMode?: ProtocolRuntimeMode;
  draftRecordId?: string;
  draftKind?: WorkProtocolDraftRecordKind;
}) {
  const registry = await readRegistryFile();
  const protocols = registry.protocols ?? [];
  const existingIndex = protocols.findIndex(
    (protocol) =>
      protocol.id === params.compiledDefinition.id ||
      protocol.draftId === params.draft.id,
  );
  const existing = existingIndex >= 0 ? protocols[existingIndex] : undefined;
  const now = new Date().toISOString();
  const version = buildRegisteredVersion({
    draft: params.draft,
    compiledDefinition: params.compiledDefinition,
    versionNumber: nextVersionNumber(existing),
    registeredBy: params.registeredBy,
    draftRecordId: params.draftRecordId,
    draftKind: params.draftKind,
  });
  const registered: RegisteredProtocol = {
    id: existing?.id ?? params.compiledDefinition.id,
    draftId: params.draft.id,
    name: params.compiledDefinition.name,
    enabled: params.enabled ?? existing?.enabled ?? false,
    runtimeMode: params.runtimeMode ?? existing?.runtimeMode ?? "plan_only",
    activeVersionId: version.versionId,
    priority: params.priority ?? existing?.priority ?? 100,
    triggerRules: params.compiledDefinition.triggerRules,
    versions: [...(existing?.versions ?? []), version],
    createdBy: existing?.createdBy ?? params.registeredBy,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const nextProtocols =
    existingIndex >= 0
      ? protocols.map((protocol, index) =>
          index === existingIndex ? registered : protocol,
        )
      : [...protocols, registered];

  await writeRegistryFile({ protocols: sortProtocols(nextProtocols) });

  return {
    registered,
    protocols: sortProtocols(nextProtocols),
  };
}

export async function setRegisteredWorkProtocolEnabled(params: {
  protocolId: string;
  enabled: boolean;
}) {
  const registry = await readRegistryFile();
  const protocols = registry.protocols ?? [];
  const protocol = protocols.find((item) => item.id === params.protocolId);

  if (!protocol) {
    throw new Error("PROTOCOL_NOT_FOUND");
  }

  const updated: RegisteredProtocol = {
    ...protocol,
    enabled: params.enabled,
    updatedAt: new Date().toISOString(),
  };
  const nextProtocols = protocols.map((item) =>
    item.id === protocol.id ? updated : item,
  );

  await writeRegistryFile({ protocols: sortProtocols(nextProtocols) });

  return {
    registered: updated,
    protocols: sortProtocols(nextProtocols),
  };
}
