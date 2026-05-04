import "server-only";

import type { DispatchDecision } from "@/lib/bp-ask/intents";
import { getRegisteredWorkProtocols } from "@/lib/work-protocol/registry";
import type {
  CompiledProtocolDefinition,
  ProtocolRuntimeMode,
  ProtocolReference,
  ProtocolTriggerRule,
  RegisteredProtocol,
  RegisteredProtocolVersion,
} from "@/lib/work-protocol/types";

export type WorkProtocolGatewayMatch = {
  protocolId: string;
  draftId: string;
  protocolName: string;
  activeVersionId: string;
  confidence: number;
  reason: string;
  matchedTriggerRuleIds: string[];
  entryNodeIds: string[];
  reportNodeIds: string[];
  enabled: boolean;
  runtimeMode: ProtocolRuntimeMode;
};

export type WorkProtocolGatewayMatchInput = {
  prompt: string;
  decision?: DispatchDecision;
  limit?: number;
  minConfidence?: number;
};

type ScoredProtocol = WorkProtocolGatewayMatch & {
  priority: number;
  updatedAt: string;
};

const DEFAULT_MATCH_LIMIT = 3;
const DEFAULT_MIN_CONFIDENCE = 55;

const MANUAL_PROTOCOL_CUES = [
  "协议",
  "流程",
  "网关",
  "联动",
  "启动",
  "执行",
  "跑一下",
  "走一下",
  "自动处理",
  "交给",
] as const;

const DOMAIN_KEYWORDS: Record<string, readonly string[]> = {
  work_order: ["工单", "受理", "派单", "整改", "异常", "预警", "责任人"],
  document_space: ["文档", "文件", "表格", "档案", "资料", "文件夹"],
  collaboration_space: ["合作空间", "协作", "联审", "会审"],
  engineering_team: ["工程队", "施工", "现场", "班组"],
  map_dashboard: ["地图", "总览", "预警中心", "态势"],
  ai_dorm: ["AI宿舍", "龙虾", "AI员工", "协议网关", "生产资料"],
  bp_ask: ["BP问问", "问问"],
  cross_domain: ["跨部门", "联动", "协同", "流转"],
};

const DOMAIN_SCOPE_PREFIXES: Record<string, readonly string[]> = {
  work_order: ["work_orders"],
  document_space: ["documents"],
  collaboration_space: ["documents"],
  engineering_team: ["engineering_team"],
  map_dashboard: ["overview"],
  ai_dorm: ["ai_dorm"],
  bp_ask: ["bp_ask"],
};

function normalizeText(value: string | undefined | null) {
  return (value ?? "").trim().toLocaleLowerCase();
}

function includesText(source: string, target: string | undefined | null) {
  const normalizedTarget = normalizeText(target);

  return Boolean(normalizedTarget && source.includes(normalizedTarget));
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function activeVersion(protocol: RegisteredProtocol) {
  return (
    protocol.versions.find(
      (version) => version.versionId === protocol.activeVersionId,
    ) ?? protocol.versions.at(-1)
  );
}

function hasAnyPromptCue(prompt: string, cues: readonly string[]) {
  return cues.some((cue) => includesText(prompt, cue));
}

function domainFromReference(ref: ProtocolReference) {
  if (ref.kind === "work_order") {
    return "work_order";
  }

  if (ref.kind === "document" || ref.kind === "spreadsheet") {
    return "document_space";
  }

  if (ref.kind === "department_scope") {
    for (const [domain, prefixes] of Object.entries(DOMAIN_SCOPE_PREFIXES)) {
      if (prefixes.some((prefix) => ref.id.startsWith(prefix))) {
        return domain;
      }
    }
  }

  return null;
}

function protocolTouchesDomain(
  compiled: CompiledProtocolDefinition,
  targetDomain: string | undefined,
) {
  if (!targetDomain) {
    return false;
  }

  return compiled.permissionSummary.some(
    (ref) => domainFromReference(ref) === targetDomain,
  );
}

function scoreTriggerRule(params: {
  rule: ProtocolTriggerRule;
  prompt: string;
  decision?: DispatchDecision;
  protocolNameMatched: boolean;
  domainMatched: boolean;
}) {
  const { rule, prompt, decision, protocolNameMatched, domainMatched } = params;

  if (!rule.enabled) {
    return { score: 0, matched: false };
  }

  if (rule.matchMode === "event") {
    return { score: 0, matched: false };
  }

  if (rule.matchMode === "keyword") {
    const matches = (rule.keywords ?? []).filter((keyword) =>
      includesText(prompt, keyword),
    );

    return {
      score: Math.min(60, matches.length * 24),
      matched: matches.length > 0,
    };
  }

  if (rule.matchMode === "semantic") {
    const hints = rule.intentHints ?? [];
    const decisionSignals = [
      decision?.primaryIntent,
      decision?.targetDomain,
      decision?.executionMode,
      decision?.suggestedExecutor,
    ]
      .filter(Boolean)
      .map((signal) => normalizeText(signal));
    const matches = hints.filter((hint) => {
      const normalizedHint = normalizeText(hint);

      return (
        Boolean(normalizedHint) &&
        (decisionSignals.includes(normalizedHint) ||
          includesText(prompt, normalizedHint))
      );
    });

    return {
      score: Math.min(45, matches.length * 18),
      matched: matches.length > 0,
    };
  }

  const hasManualCue = hasAnyPromptCue(prompt, MANUAL_PROTOCOL_CUES);

  return {
    score: hasManualCue && (protocolNameMatched || domainMatched) ? 28 : 0,
    matched: hasManualCue && (protocolNameMatched || domainMatched),
  };
}

function scoreProtocol(params: {
  protocol: RegisteredProtocol;
  version: RegisteredProtocolVersion;
  prompt: string;
  decision?: DispatchDecision;
}): ScoredProtocol | null {
  const { protocol, version, prompt, decision } = params;
  const compiled = version.compiledDefinition;
  const protocolNameMatched =
    includesText(prompt, protocol.name) ||
    includesText(prompt, compiled.name) ||
    includesText(prompt, protocol.draftId);
  const domainMatched = protocolTouchesDomain(compiled, decision?.targetDomain);
  const promptDomainMatched = hasAnyPromptCue(
    prompt,
    DOMAIN_KEYWORDS[decision?.targetDomain ?? ""] ?? [],
  );
  const matchedTriggerRuleIds: string[] = [];
  const reasons: string[] = [];
  let score = 0;

  if (protocolNameMatched) {
    score += 35;
    reasons.push("命中协议名称");
  }

  if (domainMatched) {
    score += 12;
    reasons.push("命中目标部门或资源范围");
  }

  if (promptDomainMatched) {
    score += 10;
    reasons.push("命中业务关键词");
  }

  if (
    decision?.primaryIntent === "workflow_execute" ||
    decision?.executionMode === "start_workflow"
  ) {
    score += 16;
    reasons.push("调度判断为流程执行");
  }

  if (decision?.executionMode === "delegate_to_longxia") {
    score += 8;
    reasons.push("调度判断需要龙虾协作");
  }

  for (const rule of protocol.triggerRules) {
    const ruleScore = scoreTriggerRule({
      rule,
      prompt,
      decision,
      protocolNameMatched,
      domainMatched,
    });

    if (!ruleScore.matched) {
      continue;
    }

    matchedTriggerRuleIds.push(rule.id);
    score += ruleScore.score;
  }

  if (matchedTriggerRuleIds.length > 0) {
    reasons.push("命中协议触发规则");
  }

  const confidence = clampConfidence(score);

  if (confidence <= 0) {
    return null;
  }

  return {
    protocolId: protocol.id,
    draftId: protocol.draftId,
    protocolName: protocol.name,
    activeVersionId: version.versionId,
    confidence,
    reason: reasons.join("；") || "命中已启用工作协议",
    matchedTriggerRuleIds,
    entryNodeIds: compiled.entryNodeIds,
    reportNodeIds: compiled.reportNodeIds,
    enabled: protocol.enabled,
    runtimeMode: protocol.runtimeMode ?? "plan_only",
    priority: protocol.priority,
    updatedAt: protocol.updatedAt,
  };
}

export async function matchEnabledWorkProtocols(
  input: WorkProtocolGatewayMatchInput,
): Promise<WorkProtocolGatewayMatch[]> {
  const prompt = normalizeText(input.prompt);

  if (!prompt) {
    return [];
  }

  const minConfidence = input.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const limit = input.limit ?? DEFAULT_MATCH_LIMIT;
  const protocols = await getRegisteredWorkProtocols();
  const scored = protocols
    .filter((protocol) => protocol.enabled)
    .map((protocol) => {
      const version = activeVersion(protocol);

      if (!version) {
        return null;
      }

      return scoreProtocol({
        protocol,
        version,
        prompt,
        decision: input.decision,
      });
    })
    .filter((match): match is ScoredProtocol =>
      Boolean(match && match.confidence >= minConfidence),
    )
    .sort((left, right) => {
      if (left.confidence !== right.confidence) {
        return right.confidence - left.confidence;
      }

      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, Math.max(1, limit));

  return scored.map(({ priority: _priority, updatedAt: _updatedAt, ...match }) => match);
}
