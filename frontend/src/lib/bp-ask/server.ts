import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, asc, desc, eq, or } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/types";
import { dispatchBpAskPrompt } from "@/lib/bp-ask/dispatch";
import {
  createNewThreadLabel,
  pickThreadAccent,
  previewFromText,
  threadTitleFromPrompt,
  type BpAskMessage,
  type BpAskThreadDetail,
  type BpAskThreadSummary,
  type DispatchExecutionPreview,
  type InsightBlock,
} from "@/lib/bp-ask/shared";
import { getDb } from "@/lib/db/client";
import {
  conversationMessages,
  conversationSummaries,
  conversationThreads,
  executionResults,
  executionTasks,
  memoryFacts,
} from "@/lib/db/schema";

type MessageRow = typeof conversationMessages.$inferSelect;
type ThreadRow = typeof conversationThreads.$inferSelect;
type JsonRecord = Record<string, unknown> | null | undefined;
type MemoryScopeKind =
  | "user"
  | "thread"
  | "workspace"
  | "collaboration_space"
  | "system_form"
  | "document"
  | "work_order";

function nowDate() {
  return new Date();
}

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return new Date().toISOString();
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function buildId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

function buildStableId(parts: string[]) {
  return createHash("sha1").update(parts.join(":")).digest("hex");
}

function estimateTokenCount(text: string) {
  return Math.max(1, Math.ceil(text.trim().length / 3));
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readInsight(metadata: JsonRecord) {
  const insight = metadata?.insight;
  return insight && typeof insight === "object" ? (insight as InsightBlock) : null;
}

function readPreview(metadata: JsonRecord) {
  const preview = metadata?.lastMessagePreview;
  return typeof preview === "string" ? preview : "";
}

function readExecutionPreview(metadata: JsonRecord) {
  const executionPreview = metadata?.executionPreview;
  return executionPreview && typeof executionPreview === "object"
    ? (executionPreview as DispatchExecutionPreview)
    : null;
}

function mapThreadSummary(row: ThreadRow): BpAskThreadSummary {
  return {
    id: row.id,
    title: row.title,
    updatedAt: toIso(row.lastMessageAt),
    lastMessagePreview: readPreview(asRecord(row.metadata)),
    accent: pickThreadAccent(row.id),
  };
}

function mapMessage(row: MessageRow): BpAskMessage {
  return {
    id: row.id,
    role: row.role,
    text: row.content,
    createdAt: toIso(row.createdAt),
    insight: readInsight(asRecord(row.metadata)) ?? undefined,
    executionPreview: readExecutionPreview(asRecord(row.metadata)) ?? undefined,
  };
}

function buildRollingSummary(params: {
  messages: BpAskMessage[];
  latestAssistantText?: string;
  latestInsight?: InsightBlock | null;
}) {
  if (params.messages.length === 0) {
    return null;
  }

  const recentMessages = params.messages.slice(-12);
  const latestUserMessage = [...recentMessages]
    .reverse()
    .find((message) => message.role === "user");
  const latestAssistantMessage = [...recentMessages]
    .reverse()
    .find((message) => message.role === "assistant");
  const insight = params.latestInsight ?? latestAssistantMessage?.insight ?? null;
  const assistantText =
    params.latestAssistantText ?? latestAssistantMessage?.text ?? "";

  const parts = [
    latestUserMessage ? `当前用户目标：${latestUserMessage.text}` : null,
    assistantText ? `分析结论：${assistantText}` : null,
    insight?.findings?.length
      ? `识别出的重点：${insight.findings.join("；")}`
      : null,
    insight?.summary ? `下一步建议：${insight.summary}` : null,
  ].filter(Boolean);

  return parts.join("\n");
}

async function getThreadRowForUser(user: AuthenticatedUser, threadId: string) {
  const db = getDb();
  const [thread] = await db
    .select()
    .from(conversationThreads)
    .where(
      and(
        eq(conversationThreads.id, threadId),
        eq(conversationThreads.userId, user.id),
      ),
    )
    .limit(1);

  if (!thread) {
    throw new Error("THREAD_NOT_FOUND");
  }

  return thread;
}

async function getMessagesForThread(threadId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.threadId, threadId))
    .orderBy(asc(conversationMessages.sequence));

  return rows.map(mapMessage);
}

async function getLatestRollingSummary(threadId: string) {
  const db = getDb();
  const [summary] = await db
    .select()
    .from(conversationSummaries)
    .where(
      and(
        eq(conversationSummaries.threadId, threadId),
        eq(conversationSummaries.kind, "rolling"),
      ),
    )
    .orderBy(desc(conversationSummaries.updatedAt))
    .limit(1);

  return summary?.summaryText ?? null;
}

async function getRecentMemoryFactsForUser(
  userId: string,
  threadId: string,
  limit = 8,
) {
  const db = getDb();
  return db
    .select()
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.userId, userId),
        or(
          eq(memoryFacts.threadId, threadId),
          and(eq(memoryFacts.scopeKind, "user"), eq(memoryFacts.scopeId, userId)),
        ),
      ),
    )
    .orderBy(desc(memoryFacts.updatedAt))
    .limit(limit);
}

async function replaceRollingSummary(params: {
  threadId: string;
  messages: BpAskMessage[];
  latestAssistantText?: string;
  latestInsight?: InsightBlock | null;
}) {
  const summaryText = buildRollingSummary({
    messages: params.messages,
    latestAssistantText: params.latestAssistantText,
    latestInsight: params.latestInsight,
  });

  if (!summaryText) {
    return null;
  }

  const db = getDb();
  const now = nowDate();

  await db
    .delete(conversationSummaries)
    .where(
      and(
        eq(conversationSummaries.threadId, params.threadId),
        eq(conversationSummaries.kind, "rolling"),
      ),
    );

  const [summary] = await db
    .insert(conversationSummaries)
    .values({
      id: buildStableId([params.threadId, "rolling-summary"]),
      threadId: params.threadId,
      kind: "rolling",
      summaryText,
      messageCount: params.messages.length,
      fromSequence: Math.max(1, params.messages.length - 11),
      toSequence: params.messages.length,
      metadata: {
        latestMessageId: params.messages.at(-1)?.id ?? null,
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return summary ?? null;
}

async function upsertMemoryFact(params: {
  userId: string;
  threadId: string;
  workspaceId: string | null;
  sourceMessageId: string;
  scopeKind: MemoryScopeKind;
  scopeId: string;
  factType: string;
  factKey: string;
  factValue: string;
  confidence?: number;
  metadata?: Record<string, unknown> | null;
}) {
  const db = getDb();
  const now = nowDate();
  const id = buildStableId([
    params.scopeKind,
    params.scopeId,
    params.factKey,
    "memory-fact",
  ]);

  await db
    .insert(memoryFacts)
    .values({
      id,
      userId: params.userId,
      threadId: params.threadId,
      workspaceId: params.workspaceId,
      sourceMessageId: params.sourceMessageId,
      scopeKind: params.scopeKind,
      scopeId: params.scopeId,
      factType: params.factType,
      factKey: params.factKey,
      factValue: params.factValue,
      confidence: params.confidence ?? 80,
      lastConfirmedAt: now,
      metadata: params.metadata ?? { source: "bp_ask" },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: memoryFacts.id,
      set: {
        userId: params.userId,
        threadId: params.threadId,
        workspaceId: params.workspaceId,
        sourceMessageId: params.sourceMessageId,
        factType: params.factType,
        factValue: params.factValue,
        confidence: params.confidence ?? 80,
        lastConfirmedAt: now,
        metadata: params.metadata ?? { source: "bp_ask" },
        updatedAt: now,
      },
    });
}

async function syncCoreMemoryFacts(params: {
  user: AuthenticatedUser;
  thread: ThreadRow;
  userMessageId: string;
  assistantMessageId: string;
  prompt: string;
  assistantText: string;
  decision: {
    primaryIntent: string;
    targetDomain: string;
    executionMode: string;
  };
  insight: InsightBlock;
}) {
  const base = {
    userId: params.user.id,
    threadId: params.thread.id,
    workspaceId: params.thread.workspaceId ?? null,
  };

  await Promise.all([
    upsertMemoryFact({
      ...base,
      sourceMessageId: params.userMessageId,
      scopeKind: "user",
      scopeId: params.user.id,
      factType: "goal",
      factKey: "last_user_goal",
      factValue: params.prompt,
      confidence: 84,
    }),
    upsertMemoryFact({
      ...base,
      sourceMessageId: params.userMessageId,
      scopeKind: "thread",
      scopeId: params.thread.id,
      factType: "focus",
      factKey: "current_focus",
      factValue: params.prompt,
      confidence: 82,
    }),
    upsertMemoryFact({
      ...base,
      sourceMessageId: params.assistantMessageId,
      scopeKind: "thread",
      scopeId: params.thread.id,
      factType: "dispatch",
      factKey: "last_dispatch_mode",
      factValue: `${params.decision.primaryIntent} / ${params.decision.targetDomain} / ${params.decision.executionMode}`,
      confidence: 78,
      metadata: {
        source: "bp_ask",
        findings: params.insight.findings,
      },
    }),
    upsertMemoryFact({
      ...base,
      sourceMessageId: params.assistantMessageId,
      scopeKind: "thread",
      scopeId: params.thread.id,
      factType: "assistant_summary",
      factKey: "last_assistant_summary",
      factValue: params.assistantText,
      confidence: 76,
    }),
  ]);
}

export async function listConversationThreadsForUser(
  user: AuthenticatedUser,
): Promise<BpAskThreadSummary[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversationThreads)
    .where(
      and(
        eq(conversationThreads.userId, user.id),
        eq(conversationThreads.status, "active"),
      ),
    )
    .orderBy(
      desc(conversationThreads.lastMessageAt),
      desc(conversationThreads.updatedAt),
    );

  return rows.map(mapThreadSummary);
}

export async function createConversationThreadForUser(
  user: AuthenticatedUser,
  title?: string,
) {
  const existingThreads = await listConversationThreadsForUser(user);
  const now = nowDate();
  const nextTitle =
    typeof title === "string" && title.trim()
      ? title.trim()
      : createNewThreadLabel(existingThreads.length);

  const [thread] = await getDb()
    .insert(conversationThreads)
    .values({
      id: buildId("thread"),
      userId: user.id,
      workspaceId: user.workspaceId,
      title: nextTitle,
      status: "active",
      lastMessageAt: now,
      metadata: {
        lastMessagePreview: "",
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const summary = mapThreadSummary(thread);

  return {
    summary,
    thread: {
      ...summary,
      messages: [],
      rollingSummary: null,
    } satisfies BpAskThreadDetail,
  };
}

export async function getConversationThreadDetailForUser(
  user: AuthenticatedUser,
  threadId: string,
): Promise<BpAskThreadDetail> {
  const thread = await getThreadRowForUser(user, threadId);
  const [messages, rollingSummary] = await Promise.all([
    getMessagesForThread(thread.id),
    getLatestRollingSummary(thread.id),
  ]);

  return {
    ...mapThreadSummary(thread),
    messages,
    rollingSummary,
  };
}

export async function archiveConversationThreadForUser(
  user: AuthenticatedUser,
  threadId: string,
) {
  const thread = await getThreadRowForUser(user, threadId);
  const now = nowDate();

  await getDb()
    .update(conversationThreads)
    .set({
      status: "archived",
      updatedAt: now,
      metadata: {
        ...(asRecord(thread.metadata) ?? {}),
        archivedAt: now.toISOString(),
      },
    })
    .where(eq(conversationThreads.id, thread.id));
}

export async function previewDispatchForUser(
  user: AuthenticatedUser,
  prompt: string,
  threadId?: string,
) {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    throw new Error("INVALID_PROMPT");
  }

  let rollingSummary: string | null = null;
  let recentMessages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    text: string;
  }> = [];
  let recentFacts: Array<{
    factType: string;
    factKey: string;
    factValue: string;
  }> = [];

  if (threadId) {
    const thread = await getThreadRowForUser(user, threadId);
    const [messages, summaryText, memoryRows] = await Promise.all([
      getMessagesForThread(thread.id),
      getLatestRollingSummary(thread.id),
      getRecentMemoryFactsForUser(user.id, thread.id),
    ]);

    rollingSummary = summaryText;
    recentMessages = messages.slice(-8).map((message) => ({
      role: message.role,
      text: message.text,
    }));
    recentFacts = memoryRows.map((fact) => ({
      factType: fact.factType,
      factKey: fact.factKey,
      factValue: fact.factValue,
    }));
  }

  return dispatchBpAskPrompt({
    user,
    prompt: normalizedPrompt,
    rollingSummary,
    recentMessages,
    memoryFacts: recentFacts,
  });
}

export async function appendMessageToThreadForUser(
  user: AuthenticatedUser,
  threadId: string,
  prompt: string,
) {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    throw new Error("INVALID_PROMPT");
  }

  const thread = await getThreadRowForUser(user, threadId);
  const db = getDb();

  const [lastMessage] = await db
    .select({ sequence: conversationMessages.sequence })
    .from(conversationMessages)
    .where(eq(conversationMessages.threadId, thread.id))
    .orderBy(desc(conversationMessages.sequence))
    .limit(1);

  const currentSequence = lastMessage?.sequence ?? 0;
  const now = nowDate();

  const userMessageId = buildId("message-user");
  const [userMessageRow] = await db
    .insert(conversationMessages)
    .values({
      id: userMessageId,
      threadId: thread.id,
      role: "user",
      sequence: currentSequence + 1,
      content: normalizedPrompt,
      tokenEstimate: estimateTokenCount(normalizedPrompt),
      metadata: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const recentMemoryRows = await getRecentMemoryFactsForUser(user.id, thread.id);
  const recentMessages = await getMessagesForThread(thread.id);
  const rollingSummary = await getLatestRollingSummary(thread.id);
  const dispatch = await dispatchBpAskPrompt({
    user,
    prompt: normalizedPrompt,
    rollingSummary,
    recentMessages: recentMessages.slice(-8).map((message) => ({
      role: message.role,
      text: message.text,
    })),
    memoryFacts: recentMemoryRows.map((fact) => ({
      factType: fact.factType,
      factKey: fact.factKey,
      factValue: fact.factValue,
    })),
  });

  const executionTaskId = buildId("exec-task");
  const executionResultId = buildId("exec-result");

  await db.insert(executionTasks).values({
    id: executionTaskId,
    userId: user.id,
    threadId: thread.id,
    workspaceId: thread.workspaceId ?? null,
    sourceMessageId: userMessageId,
    status:
      dispatch.decision.suggestedExecutor === "longxia" ? "delegated" : "planned",
    executorKind: dispatch.decision.suggestedExecutor,
    primaryIntent: dispatch.decision.primaryIntent,
    targetDomain: dispatch.decision.targetDomain,
    executionMode: dispatch.decision.executionMode,
    goal: normalizedPrompt,
    confidence: dispatch.decision.confidence,
    needsMemory: dispatch.decision.needsMemory,
    needsTools: dispatch.decision.needsTools,
    requiresWrite: dispatch.decision.requiresWrite,
    requiresConfirmation: dispatch.decision.requiresConfirmation,
    targetRefs: dispatch.decision.targetRefs,
    constraints: dispatch.decision.constraints,
    metadata: {
      expectedOutput: dispatch.decision.expectedOutput,
      reason: dispatch.decision.reason,
      priority: dispatch.decision.priority,
      toolHints: dispatch.decision.toolHints,
      memoryScopes: dispatch.decision.memoryScopes,
      followupQuestion: dispatch.decision.followupQuestion,
    },
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(executionResults).values({
    id: executionResultId,
    taskId: executionTaskId,
    status: "ready",
    summaryText: dispatch.insight.summary,
    responseText: dispatch.assistantText,
    structuredPayload: {
      decision: dispatch.decision,
      insight: dispatch.insight,
      executionPreview: dispatch.executionPreview,
    },
    createdAt: now,
    updatedAt: now,
  });

  const assistantMessageId = buildId("message-assistant");
  const [assistantMessageRow] = await db
    .insert(conversationMessages)
    .values({
      id: assistantMessageId,
      threadId: thread.id,
      role: "assistant",
      sequence: currentSequence + 2,
      content: dispatch.assistantText,
      tokenEstimate: estimateTokenCount(dispatch.assistantText),
      metadata: {
        insight: dispatch.insight,
        dispatch: dispatch.decision,
        executionPreview: dispatch.executionPreview,
        executionTaskId,
        executionResultId,
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const nextTitle =
    currentSequence === 0 || thread.title.startsWith("新对话")
      ? threadTitleFromPrompt(normalizedPrompt)
      : thread.title;
  const lastPreview = previewFromText(normalizedPrompt);

  await db
    .update(conversationThreads)
    .set({
      title: nextTitle,
      lastMessageAt: now,
      metadata: {
        ...(asRecord(thread.metadata) ?? {}),
        lastMessagePreview: lastPreview,
      },
      updatedAt: now,
    })
    .where(eq(conversationThreads.id, thread.id));

  const messages = await getMessagesForThread(thread.id);
  const rollingSummaryRow = await replaceRollingSummary({
    threadId: thread.id,
    messages,
    latestAssistantText: dispatch.assistantText,
    latestInsight: dispatch.insight,
  });

  await syncCoreMemoryFacts({
    user,
    thread,
    userMessageId: userMessageRow.id,
    assistantMessageId: assistantMessageRow.id,
    prompt: normalizedPrompt,
    assistantText: dispatch.assistantText,
    decision: dispatch.decision,
    insight: dispatch.insight,
  });

  const summary: BpAskThreadSummary = {
    id: thread.id,
    title: nextTitle,
    updatedAt: now.toISOString(),
    lastMessagePreview: lastPreview,
    accent: pickThreadAccent(thread.id),
  };

  return {
    summary,
    thread: {
      ...summary,
      messages,
      rollingSummary: rollingSummaryRow?.summaryText ?? null,
    } satisfies BpAskThreadDetail,
  };
}
