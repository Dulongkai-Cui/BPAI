import type { AiDormTaskRecord } from "@/lib/ai-dorm/server";

type AiDormTaskListProps = {
  title: string;
  description: string;
  tasks: AiDormTaskRecord[];
};

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

function formatJson(value: Record<string, unknown> | null) {
  return value ? JSON.stringify(value, null, 2) : "暂无";
}

function statusTone(status: string) {
  if (status === "delegated") {
    return "bg-violet-100 text-violet-700";
  }

  if (status === "completed") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "failed" || status === "cancelled") {
    return "bg-rose-100 text-rose-700";
  }

  return "bg-amber-100 text-amber-700";
}

function flagTone(enabled: boolean) {
  return enabled
    ? "bg-rose-100 text-rose-700"
    : "bg-slate-100 text-slate-500";
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm leading-6 text-slate-700">{value}</div>
    </div>
  );
}

function JsonPanel({
  label,
  value,
}: {
  label: string;
  value: Record<string, unknown> | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-950/95 p-4 text-slate-100 shadow-sm">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-200">
        {formatJson(value)}
      </pre>
    </div>
  );
}

export function AiDormTaskList({
  title,
  description,
  tasks,
}: AiDormTaskListProps) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">
            Task Inbox
          </div>
          <h1 className="mt-2 text-[1.9rem] font-black tracking-tight text-slate-950">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
            {description}
          </p>
        </div>

        <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
          共 {tasks.length} 条
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {tasks.length > 0 ? (
          tasks.map((task, index) => (
            <details
              key={task.taskId}
              className="group rounded-[1.6rem] border border-slate-200 bg-slate-50/70 open:bg-white open:shadow-sm"
              open={index === 0}
            >
              <summary className="cursor-pointer list-none px-5 py-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone(task.status)}`}
                      >
                        {task.status}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {task.executorKind}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                        {task.primaryIntentLabel}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                        {task.targetDomainLabel}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                        {task.executionModeLabel}
                      </span>
                    </div>

                    <h2 className="mt-3 text-xl font-black tracking-tight text-slate-950">
                      {task.goal}
                    </h2>
                    <div className="mt-2 text-sm text-slate-500">
                      taskId: <span className="font-mono">{task.taskId}</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      线程：{task.threadTitle}
                    </div>
                  </div>

                  <div className="grid gap-3 text-sm sm:grid-cols-2 xl:min-w-[26rem] xl:grid-cols-2">
                    <Field label="createdAt" value={formatDateTime(task.createdAt)} />
                    <Field label="confidence" value={`${task.confidence}%`} />
                    <Field label="requiresWrite" value={task.requiresWrite ? "是" : "否"} />
                    <Field
                      label="requiresConfirmation"
                      value={task.requiresConfirmation ? "是" : "否"}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span
                    className={`rounded-full px-3 py-1 font-semibold ${flagTone(
                      task.requiresWrite,
                    )}`}
                  >
                    写入：{task.requiresWrite ? "需要" : "只读"}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 font-semibold ${flagTone(
                      task.requiresConfirmation,
                    )}`}
                  >
                    确认：{task.requiresConfirmation ? "需要" : "无需"}
                  </span>
                  <span className="rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-700">
                    memory：{task.needsMemory ? "on" : "off"}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">
                    tools：{task.needsTools ? "on" : "off"}
                  </span>
                  {task.resultStatus ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">
                      result：{task.resultStatus}
                    </span>
                  ) : null}
                </div>
              </summary>

              <div className="border-t border-slate-200 px-5 py-5">
                <div className="grid gap-4 xl:grid-cols-3">
                  <JsonPanel label="targetRefs" value={task.targetRefs} />
                  <JsonPanel label="constraints" value={task.constraints} />
                  <JsonPanel label="metadata" value={task.metadata} />
                </div>

                <div className="mt-4 rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="threadId" value={task.threadId} />
                    <Field label="primaryIntent" value={task.primaryIntent} />
                    <Field label="targetDomain" value={task.targetDomain} />
                    <Field label="executionMode" value={task.executionMode} />
                  </div>
                </div>

                {task.result ? (
                  <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        result summary
                      </div>
                      <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                        {task.result.summaryText}
                      </div>

                      <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        response
                      </div>
                      <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                        {task.result.responseText || "暂无"}
                      </div>
                    </div>

                    <JsonPanel
                      label="structuredPayload"
                      value={task.result.structuredPayload}
                    />
                  </div>
                ) : (
                  <div className="mt-4 rounded-[1.4rem] border border-dashed border-slate-300 bg-white p-5 text-sm leading-7 text-slate-500">
                    当前任务还没有 execution_results 回执。
                  </div>
                )}
              </div>
            </details>
          ))
        ) : (
          <div className="rounded-[1.6rem] border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm leading-7 text-slate-500">
            当前还没有可展示的执行任务。
          </div>
        )}
      </div>
    </section>
  );
}
