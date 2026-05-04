import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkProtocolExecutionControls } from "@/components/ai-dorm/work-protocol-execution-controls";
import { requireCurrentUser } from "@/lib/auth/server";
import {
  listWorkProtocolExecutionPlans,
  type WorkProtocolExecutionPlanRecord,
} from "@/lib/work-protocol/runtime";

type WorkProtocolExecutionDetailPageProps = {
  params?: Promise<{
    executionId?: string;
  }>;
};

function formatJson(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatListValue(values: string[] | undefined) {
  return values && values.length > 0 ? values.join(" / ") : "无";
}

function statusTone(status: string) {
  if (status === "completed") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "failed" || status === "cancelled") {
    return "bg-rose-100 text-rose-700";
  }

  if (status === "waiting_confirmation") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-blue-100 text-blue-700";
}

function riskTone(riskLevel: string) {
  if (riskLevel === "critical" || riskLevel === "high") {
    return "bg-rose-50 text-rose-700 ring-rose-100";
  }

  if (riskLevel === "medium") {
    return "bg-amber-50 text-amber-700 ring-amber-100";
  }

  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 break-words text-sm font-semibold leading-6 text-slate-800">
        {value ?? "暂无"}
      </div>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-slate-950 shadow-sm">
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">
          {title}
        </h2>
      </div>
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words px-5 py-4 font-mono text-xs leading-6 text-slate-100">
        {formatJson(value)}
      </pre>
    </section>
  );
}

function NodePlan({ execution }: { execution: WorkProtocolExecutionPlanRecord }) {
  return (
    <section className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
            Node Plan
          </div>
          <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
            节点执行顺序
          </h2>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
          {execution.nodePlan.length} 个节点
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {execution.nodePlan.map((node) => (
          <article
            key={node.nodeId}
            className="rounded-[1.25rem] border border-slate-200 bg-slate-50/70 p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">
                    #{node.sequence}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(node.status)}`}>
                    {node.status}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${riskTone(node.riskLevel)}`}>
                    {node.riskLevel}
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-black tracking-tight text-slate-950">
                  {node.title}
                </h3>
                <div className="mt-1 font-mono text-xs text-slate-500">
                  {node.nodeId}
                </div>
              </div>

              <div className="grid gap-2 text-xs sm:grid-cols-2 lg:min-w-[28rem]">
                <Field label="kind" value={node.kind} />
                <Field label="executor" value={node.executorKind} />
                <Field label="adapter" value={node.adapterLabel ?? node.adapterId} />
                <Field label="adapterAvailable" value={node.adapterAvailable ? "yes" : "no"} />
                <Field label="approval" value={node.approvalPolicy} />
                <Field label="timeout" value={node.timeoutMs ? `${node.timeoutMs} ms` : "默认"} />
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="agentId" value={node.agentId} />
              <Field label="callableId" value={node.callableId} />
              <Field label="scope" value={node.departmentScopeId} />
              <Field label="writeObject" value={node.writableObjectKind} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field
                label="dependsOn"
                value={node.dependsOn.length > 0 ? node.dependsOn.join(" / ") : "无"}
              />
              <Field
                label="outgoingEdges"
                value={
                  node.outgoingEdgeIds.length > 0
                    ? node.outgoingEdgeIds.join(" / ")
                    : "无"
                }
              />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field
                label="requiredInputs"
                value={formatListValue(node.requiredInputNames)}
              />
              <Field
                label="plannedOutputs"
                value={formatListValue(node.plannedOutputNames)}
              />
              <Field
                label="requiredPermissions"
                value={formatListValue(node.requiredPermissions)}
              />
              <Field
                label="runtimeBoundary"
                value={
                  node.externalCallPlanned
                    ? node.mutatesData
                      ? "external + write"
                      : "external"
                    : "internal"
                }
              />
            </div>

            {node.adapterPlan?.planSummary ? (
              <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold leading-6 text-blue-800">
                {node.adapterPlan.planSummary}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function EdgePlan({ execution }: { execution: WorkProtocolExecutionPlanRecord }) {
  return (
    <section className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
            Edge Plan
          </div>
          <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
            连线传输计划
          </h2>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
          {execution.edgePlan.length} 条连线
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {execution.edgePlan.length > 0 ? (
          execution.edgePlan.map((edge) => (
            <article
              key={edge.edgeId}
              className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4"
            >
              <div className="font-mono text-xs font-black text-blue-700">
                {edge.edgeId}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="from" value={edge.sourceNodeId} />
                <Field label="to" value={edge.targetNodeId} />
              </div>
              <div className="mt-3">
                <Field label="mode" value={edge.transferMode} />
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-600">
                {edge.prompt || "暂无传输提示词"}
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm text-slate-500">
            这个协议计划里暂时没有连线。
          </div>
        )}
      </div>
    </section>
  );
}

function PermissionSummary({
  execution,
}: {
  execution: WorkProtocolExecutionPlanRecord;
}) {
  return (
    <section className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
        Permission Summary
      </div>
      <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
        权限与确认摘要
      </h2>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Field label="permissionRefs" value={execution.permissionSummary.length} />
        <Field label="confirmationNodes" value={execution.confirmationNodeIds.length} />
        <Field label="mode" value={execution.mode} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {execution.permissionSummary.length > 0 ? (
          execution.permissionSummary.map((ref) => (
            <span
              key={`${ref.kind}:${ref.id}`}
              className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
            >
              {ref.kind} / {ref.label ?? ref.id}
            </span>
          ))
        ) : (
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
            暂无权限引用
          </span>
        )}
      </div>
    </section>
  );
}

export default async function WorkProtocolExecutionDetailPage({
  params,
}: WorkProtocolExecutionDetailPageProps) {
  const user = await requireCurrentUser();
  const resolvedParams = params ? await params : undefined;
  const executionId = resolvedParams?.executionId ?? "";
  const executions = await listWorkProtocolExecutionPlans();
  const execution = executions.find(
    (item) => item.id === executionId && item.createdByUserId === user.id,
  );

  if (!execution) {
    notFound();
  }

  const hasWaitingConfirmation = execution.nodePlan.some(
    (node) => node.status === "waiting_confirmation",
  );
  const hasQueuedNodes = execution.nodePlan.some(
    (node) => node.status === "queued",
  );

  return (
    <div className="space-y-5 p-2 sm:p-4">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <Link
              href="/ai-dorm/workflows"
              className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
            >
              返回工作协议网关
            </Link>
            <div className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
              Work Protocol Execution
            </div>
            <h1 className="mt-2 text-[2rem] font-black tracking-tight text-slate-950">
              {execution.protocolName}
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-500">
              这是 plan-only 执行计划。当前只展示 BP问问命中协议后准备怎么跑，暂不真实调用 Tool、Skill、RAG 或龙虾。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[34rem] xl:grid-cols-3">
            <Field label="status" value={execution.status} />
            <Field label="confidence" value={execution.matchedConfidence} />
            <Field label="startedAt" value={formatDateTime(execution.startedAt)} />
            <Field label="executionId" value={execution.id} />
            <Field label="taskId" value={execution.executionTaskId} />
            <Field label="version" value={`v${execution.versionNumber}`} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusTone(execution.status)}`}>
            {execution.status}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
            {execution.nodePlan.length} nodes
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
            {execution.edgePlan.length} edges
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
            {execution.confirmationNodeIds.length} confirmations
          </span>
        </div>

        <div className="mt-5">
          <WorkProtocolExecutionControls
            executionId={execution.id}
            status={execution.status}
            hasWaitingConfirmation={hasWaitingConfirmation}
            hasQueuedNodes={hasQueuedNodes}
          />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-5">
          <NodePlan execution={execution} />
          <EdgePlan execution={execution} />
        </div>
        <div className="space-y-5">
          <PermissionSummary execution={execution} />
          <JsonBlock title="Input Packet" value={execution.inputPacket} />
          <JsonBlock title="Dispatch Decision" value={execution.dispatchDecision} />
        </div>
      </section>
    </div>
  );
}
