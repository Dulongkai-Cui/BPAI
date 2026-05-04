type WorkProtocolParameterPatchAuditSummary = {
  id: string;
  mode: "dry_run" | "apply";
  status: "validated" | "applied" | "rejected" | "no_effect";
  operationCount: number;
  appliedChangeCount: number;
  rejectedChangeCount: number;
  preflightIssueCount: number;
  commitStatus?: "not_requested" | "skipped" | "committed";
  createdAt: string;
  result?: {
    rejectedChanges?: Array<{
      code: string;
      message: string;
      path: string;
      operationId?: string;
    }>;
    appliedChanges?: Array<{
      path: string;
      operationId?: string;
    }>;
  };
};

type PendingParameterPatchApply = {
  block: {
    target: "protocol" | "node" | "edge";
  };
  slot: {
    label: string;
    currentValue: string;
  };
  option: {
    label: string;
    value: string;
  };
  payload: {
    path: string;
  };
};

function shortTraceId(value?: string) {
  if (!value) {
    return "未生成";
  }

  if (value.length <= 22) {
    return value;
  }

  return `${value.slice(0, 13)}...${value.slice(-6)}`;
}

function formatExecutionTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parameterPatchStatusLabel(
  status: WorkProtocolParameterPatchAuditSummary["status"],
) {
  if (status === "applied") {
    return "已写回";
  }

  if (status === "validated") {
    return "已验证";
  }

  if (status === "no_effect") {
    return "无变化";
  }

  return "已拒绝";
}

function parameterPatchStatusTone(
  status: WorkProtocolParameterPatchAuditSummary["status"],
) {
  if (status === "rejected") {
    return "bg-rose-50 text-rose-700";
  }

  if (status === "no_effect") {
    return "bg-slate-100 text-slate-600";
  }

  if (status === "applied") {
    return "bg-emerald-50 text-emerald-700";
  }

  return "bg-blue-50 text-blue-700";
}

export function WorkProtocolParameterPatchAuditPanel({
  records,
}: {
  records: WorkProtocolParameterPatchAuditSummary[];
}) {
  const latestRecords = records.slice(0, 5);
  const rejected = records.filter((record) => record.status === "rejected").length;

  return (
    <details
      open={rejected > 0}
      className="mt-3 overflow-hidden rounded-[1.1rem] border border-slate-200 bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            参数 Patch
          </div>
          <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-600">
            最近事务 / 审计回读
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
            rejected > 0 ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {records.length} 条
        </span>
      </summary>

      <div className="max-h-44 space-y-2 overflow-y-auto border-t border-slate-100 bg-slate-50/70 px-2.5 py-2.5 pr-1">
        {latestRecords.length === 0 ? (
          <div className="rounded-[0.9rem] border border-dashed border-slate-200 bg-white px-3 py-3 text-[11px] leading-5 text-slate-500">
            暂无参数 Patch 事务。后续参数下拉框、模型改写和人工修正都会先进入这里。
          </div>
        ) : (
          latestRecords.map((record) => {
            const rejectedChanges = record.result?.rejectedChanges ?? [];
            const appliedChanges = record.result?.appliedChanges ?? [];

            return (
              <details
                key={record.id}
                className="overflow-hidden rounded-[0.95rem] border border-slate-200 bg-white"
              >
                <summary className="cursor-pointer list-none px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black text-slate-950">
                        {record.mode === "apply" ? "apply" : "dry-run"} · {shortTraceId(record.id)}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">
                        {formatExecutionTime(record.createdAt)} · {record.operationCount} 操作 ·{" "}
                        {record.appliedChangeCount} 写回
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${parameterPatchStatusTone(
                        record.status,
                      )}`}
                    >
                      {parameterPatchStatusLabel(record.status)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      拒绝 {record.rejectedChangeCount}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      preflight {record.preflightIssueCount}
                    </span>
                    {record.commitStatus === "committed" ? (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        已提交
                      </span>
                    ) : null}
                  </div>
                </summary>

                <div className="space-y-1.5 border-t border-slate-100 px-3 py-2">
                  {rejectedChanges.slice(0, 3).map((change, index) => (
                    <div
                      key={`${record.id}-rejected-${index}`}
                      className="rounded-[0.75rem] bg-rose-50 px-2.5 py-2 text-[10px] leading-4 text-rose-800"
                    >
                      <div className="font-black">{change.code}</div>
                      <div className="mt-0.5 text-current/80">{change.message}</div>
                      <div className="mt-0.5 font-mono text-[9px] text-current/55">
                        {change.path}
                      </div>
                    </div>
                  ))}

                  {rejectedChanges.length === 0
                    ? appliedChanges.slice(0, 3).map((change, index) => (
                        <div
                          key={`${record.id}-applied-${index}`}
                          className="rounded-[0.75rem] bg-emerald-50 px-2.5 py-2 text-[10px] leading-4 text-emerald-800"
                        >
                          <div className="font-black">applied</div>
                          <div className="mt-0.5 font-mono text-[9px] text-current/65">
                            {change.path}
                          </div>
                        </div>
                      ))
                    : null}

                  {rejectedChanges.length === 0 && appliedChanges.length === 0 ? (
                    <div className="rounded-[0.75rem] bg-slate-50 px-2.5 py-2 text-[10px] leading-4 text-slate-500">
                      本次事务没有产生实际写回。
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })
        )}
      </div>
    </details>
  );
}

export function PendingParameterPatchApplyPanel({
  pending,
  applying,
  onApply,
  onCancel,
}: {
  pending?: PendingParameterPatchApply | null;
  applying: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  if (!pending) {
    return null;
  }

  const targetLabel = pending.block.target === "edge" ? "连线" : "方块";

  return (
    <div className="mt-3 rounded-[1.1rem] border border-indigo-100 bg-indigo-50/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-400">
            参数待应用
          </div>
          <div className="mt-1 text-sm font-black text-slate-950">
            {pending.slot.label}
            {" -> "}
            {pending.option.label}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-slate-600">
            dry-run 已通过。确认后会保存一个新的 groomed 协议版本，不覆盖旧版本。
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-indigo-700">
          {targetLabel}
        </span>
      </div>

      <div className="mt-2 grid gap-1.5 text-[10px] font-semibold text-slate-500">
        <div className="rounded-[0.75rem] bg-white px-2.5 py-2">
          当前：{pending.slot.currentValue}
        </div>
        <div className="rounded-[0.75rem] bg-white px-2.5 py-2">
          路径：<span className="font-mono">{pending.payload.path}</span>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className="flex-1 rounded-[0.85rem] bg-indigo-600 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-wait disabled:bg-slate-300"
        >
          {applying ? "应用中" : "应用参数"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={applying}
          className="rounded-[0.85rem] bg-white px-3 py-2 text-xs font-black text-slate-500 shadow-sm transition hover:bg-slate-100 disabled:cursor-wait"
        >
          取消
        </button>
      </div>
    </div>
  );
}
