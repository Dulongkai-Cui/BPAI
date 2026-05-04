import type { WorkProtocolExecutorAdapterRegistrySummary } from "@/lib/work-protocol/executor-adapters";
import type { ProtocolNodeKind } from "@/lib/work-protocol/types";

type ProtocolParameterCodeBlock = {
  target: "protocol" | "node" | "edge";
  targetId: string;
  label: string;
  code: Record<string, unknown>;
};

type AdapterDiagnosticIssue = {
  id: string;
  severity: "warning";
  targetKind: "node" | "canvas";
  targetId?: string;
  code: string;
  message: string;
  suggestion: string;
};

type AdapterExecutionNodePlan = {
  nodeId: string;
  title: string;
  kind: ProtocolNodeKind;
  executorKind: string;
  approvalPolicy: "none" | "recommended" | "required";
  adapterId?: string;
  adapterLabel?: string;
  adapterAvailable?: boolean;
  requiredPermissions?: string[];
  mutatesData?: boolean;
  externalCallPlanned?: boolean;
};

type AdapterExecutionPlanSummary = {
  nodePlan: AdapterExecutionNodePlan[];
};

type AdapterRegistryNodeDiagnostic = {
  id: string;
  title: string;
  source: "execution" | "groomed";
  nodeKind?: ProtocolNodeKind;
  executorKind?: string;
  adapterId?: string;
  adapterLabel?: string;
  adapterAvailable?: boolean;
  requiredPermissions: string[];
  departmentScopeId?: string;
  mutatesData: boolean;
  plansExternalCall: boolean;
  approvalPolicy?: string;
  warnings: string[];
};

const GATEWAY_NODE_KIND_LABELS: Record<ProtocolNodeKind, string> = {
  bp_ask_entry: "入口",
  tool_call: "Tool",
  skill_call: "Skill",
  rag_search: "RAG",
  agent_task: "AI员工",
  task_dispatch: "分派",
  result_aggregate: "汇总",
  condition: "条件",
  human_confirm: "人工确认",
  bp_ask_followup: "追问",
  write_object: "写入",
  bp_ask_report: "汇报",
};

function asText(value: unknown, fallback = "") {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
}

function asGatewayProtocolNodeKind(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  return value in GATEWAY_NODE_KIND_LABELS ? (value as ProtocolNodeKind) : undefined;
}

function getAdapterById(
  adapterRegistry: WorkProtocolExecutorAdapterRegistrySummary | null | undefined,
  adapterId?: string,
) {
  if (!adapterRegistry || !adapterId) {
    return undefined;
  }

  return adapterRegistry.adapters.find((adapter) => adapter.adapterId === adapterId);
}

function getAdapterMapping(params: {
  adapterRegistry?: WorkProtocolExecutorAdapterRegistrySummary | null;
  nodeKind?: ProtocolNodeKind;
  executorKind?: string;
}) {
  if (!params.adapterRegistry || !params.nodeKind || !params.executorKind) {
    return undefined;
  }

  return params.adapterRegistry.nodeKindAdapters.find(
    (item) =>
      item.nodeKind === params.nodeKind &&
      item.executorKind === params.executorKind,
  );
}

function hasDepartmentScopedPermission(
  adapterRegistry: WorkProtocolExecutorAdapterRegistrySummary | null | undefined,
  permissions: string[],
) {
  if (!adapterRegistry) {
    return false;
  }

  const permissionMap = new Map(
    adapterRegistry.permissions.map((permission) => [
      permission.permission,
      permission,
    ]),
  );

  return permissions.some(
    (permission) => permissionMap.get(permission)?.guardKind === "department_scope",
  );
}

function buildAdapterDiagnosticWarnings(params: {
  adapterRegistry?: WorkProtocolExecutorAdapterRegistrySummary | null;
  adapterId?: string;
  adapterAvailable?: boolean;
  requiredPermissions: string[];
  departmentScopeId?: string;
  mutatesData: boolean;
  approvalPolicy?: string;
}) {
  const warnings: string[] = [];

  if (!params.adapterId) {
    warnings.push("没有匹配到执行适配器。");
  }

  if (params.adapterAvailable === false) {
    warnings.push("适配器当前不可用。");
  }

  if (
    hasDepartmentScopedPermission(
      params.adapterRegistry,
      params.requiredPermissions,
    ) &&
    !params.departmentScopeId
  ) {
    warnings.push("需要部门资源范围，但节点还没有绑定范围。");
  }

  if (params.mutatesData && params.approvalPolicy !== "required") {
    warnings.push("会写入或变更数据，建议保持强制确认。");
  }

  return warnings;
}

function buildAdapterRegistryNodeDiagnostics(params: {
  adapterRegistry?: WorkProtocolExecutorAdapterRegistrySummary | null;
  parameterCodeBlocks: ProtocolParameterCodeBlock[];
  executionPlans: AdapterExecutionPlanSummary[];
}) {
  const blockByTargetId = new Map(
    params.parameterCodeBlocks
      .filter((block) => block.target === "node")
      .map((block) => [block.targetId, block] as const),
  );
  const latestPlan = params.executionPlans[0];

  if (latestPlan?.nodePlan.length) {
    return latestPlan.nodePlan.map<AdapterRegistryNodeDiagnostic>((node) => {
      const block = blockByTargetId.get(node.nodeId);
      const adapter =
        getAdapterById(params.adapterRegistry, node.adapterId) ??
        getAdapterById(
          params.adapterRegistry,
          getAdapterMapping({
            adapterRegistry: params.adapterRegistry,
            nodeKind: node.kind,
            executorKind: node.executorKind,
          })?.adapterId,
        );
      const requiredPermissions =
        node.requiredPermissions ??
        adapter?.requiredPermissions ??
        [];
      const departmentScopeId = asText(block?.code.departmentScopeId);
      const approvalPolicy =
        node.approvalPolicy ?? asText(block?.code.approvalPolicy);
      const mutatesData = Boolean(node.mutatesData ?? adapter?.mutatesData);
      const warnings = buildAdapterDiagnosticWarnings({
        adapterRegistry: params.adapterRegistry,
        adapterId: node.adapterId ?? adapter?.adapterId,
        adapterAvailable: node.adapterAvailable ?? Boolean(adapter),
        requiredPermissions,
        departmentScopeId,
        mutatesData,
        approvalPolicy,
      });

      return {
        id: node.nodeId,
        title: node.title,
        source: "execution",
        nodeKind: node.kind,
        executorKind: node.executorKind,
        adapterId: node.adapterId ?? adapter?.adapterId,
        adapterLabel: node.adapterLabel ?? adapter?.label,
        adapterAvailable: node.adapterAvailable ?? Boolean(adapter),
        requiredPermissions,
        departmentScopeId,
        mutatesData,
        plansExternalCall: Boolean(
          node.externalCallPlanned ?? adapter?.plansExternalCall,
        ),
        approvalPolicy,
        warnings,
      };
    });
  }

  return params.parameterCodeBlocks
    .filter((block) => block.target === "node")
    .map<AdapterRegistryNodeDiagnostic>((block) => {
      const nodeKind = asGatewayProtocolNodeKind(block.code.kind);
      const executorKind = asText(block.code.executorKind);
      const mapping = getAdapterMapping({
        adapterRegistry: params.adapterRegistry,
        nodeKind,
        executorKind,
      });
      const adapter = getAdapterById(params.adapterRegistry, mapping?.adapterId);
      const requiredPermissions =
        adapter?.requiredPermissions ?? mapping?.requiredPermissions ?? [];
      const departmentScopeId = asText(block.code.departmentScopeId);
      const approvalPolicy = asText(block.code.approvalPolicy);
      const mutatesData = Boolean(adapter?.mutatesData);
      const warnings = buildAdapterDiagnosticWarnings({
        adapterRegistry: params.adapterRegistry,
        adapterId: adapter?.adapterId,
        adapterAvailable: Boolean(adapter),
        requiredPermissions,
        departmentScopeId,
        mutatesData,
        approvalPolicy,
      });

      return {
        id: block.targetId,
        title: block.label,
        source: "groomed",
        nodeKind,
        executorKind,
        adapterId: adapter?.adapterId,
        adapterLabel: adapter?.label ?? mapping?.adapterLabel,
        adapterAvailable: Boolean(adapter),
        requiredPermissions,
        departmentScopeId,
        mutatesData,
        plansExternalCall: Boolean(adapter?.plansExternalCall),
        approvalPolicy,
        warnings,
      };
    });
}

export function buildAdapterRegistryCompileIssues(params: {
  adapterRegistry?: WorkProtocolExecutorAdapterRegistrySummary | null;
  parameterCodeBlocks: ProtocolParameterCodeBlock[];
}) {
  if (!params.adapterRegistry || params.parameterCodeBlocks.length === 0) {
    return [];
  }

  const diagnostics = buildAdapterRegistryNodeDiagnostics({
    adapterRegistry: params.adapterRegistry,
    parameterCodeBlocks: params.parameterCodeBlocks,
    executionPlans: [],
  });
  const issues = diagnostics.flatMap<AdapterDiagnosticIssue>((diagnostic) =>
    diagnostic.warnings.map((warning, index) => ({
      id: `adapter-diagnostic-${diagnostic.id}-${index}`,
      severity: "warning",
      targetKind: "node",
      targetId: diagnostic.id,
      code: "ADAPTER_BOUNDARY_DIAGNOSTIC",
      message: `${diagnostic.title}：${warning}`,
      suggestion: diagnostic.adapterId
        ? `检查 ${diagnostic.adapterLabel ?? diagnostic.adapterId} 的部门范围、权限和确认策略。`
        : "请重新协议梳理，或确认该节点类型在 adapter registry 中已有映射。",
    })),
  );

  if (params.adapterRegistry.counts.unknownPermissionCount > 0) {
    issues.push({
      id: "adapter-diagnostic-unknown-permissions",
      severity: "warning",
      targetKind: "canvas",
      code: "ADAPTER_UNKNOWN_PERMISSION",
      message: "执行适配器注册表里存在未声明守卫的权限。",
      suggestion:
        "需要先在 adapter registry 或 runtime preflight 中补齐权限守卫，再把该类能力接入真实执行。",
    });
  }

  return issues;
}

function permissionGuardLabel(
  permission: WorkProtocolExecutorAdapterRegistrySummary["permissions"][number],
) {
  if (permission.guardKind === "department_scope") {
    return "部门范围";
  }

  if (permission.guardKind === "human_confirmation") {
    return "人工确认";
  }

  if (permission.guardKind === "runtime_state") {
    return "运行态";
  }

  if (permission.guardKind === "unknown") {
    return "未知";
  }

  return "无";
}

export function WorkProtocolAdapterRegistryPanel({
  adapterRegistry,
  parameterCodeBlocks,
  executionPlans,
}: {
  adapterRegistry?: WorkProtocolExecutorAdapterRegistrySummary | null;
  parameterCodeBlocks: ProtocolParameterCodeBlock[];
  executionPlans: AdapterExecutionPlanSummary[];
}) {
  const diagnostics = buildAdapterRegistryNodeDiagnostics({
    adapterRegistry,
    parameterCodeBlocks,
    executionPlans,
  });
  const warningCount =
    diagnostics.reduce((total, item) => total + item.warnings.length, 0) +
    (adapterRegistry?.counts.unknownPermissionCount ?? 0);
  const latestDiagnostics = diagnostics.slice(0, 5);
  const guardedPermissions = adapterRegistry?.permissions.slice(0, 5) ?? [];

  return (
    <details className="mt-3 overflow-hidden rounded-[1.1rem] border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            执行适配器
          </div>
          <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-600">
            权限边界 / 节点映射
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
            warningCount > 0
              ? "bg-amber-50 text-amber-700"
              : adapterRegistry
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500"
          }`}
        >
          {adapterRegistry ? (warningCount > 0 ? `${warningCount} 提醒` : "就绪") : "未读取"}
        </span>
      </summary>

      <div className="space-y-2 border-t border-slate-100 bg-slate-50/70 px-2.5 py-2.5">
        {!adapterRegistry ? (
          <div className="rounded-[0.9rem] border border-dashed border-slate-200 bg-white px-3 py-3 text-[11px] leading-5 text-slate-500">
            暂未读取能力目录。刷新链路后会展示适配器、权限守卫和节点映射。
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1.5 text-[10px] font-semibold text-slate-500">
              <div className="rounded-[0.7rem] bg-white px-2 py-1.5">
                适配器 <span className="font-black text-slate-900">{adapterRegistry.counts.totalAdapters}</span>
              </div>
              <div className="rounded-[0.7rem] bg-white px-2 py-1.5">
                权限 <span className="font-black text-slate-900">{adapterRegistry.counts.guardedPermissionCount}</span>
              </div>
              <div className="rounded-[0.7rem] bg-white px-2 py-1.5">
                未知 <span className="font-black text-slate-900">{adapterRegistry.counts.unknownPermissionCount}</span>
              </div>
            </div>

            <div className="rounded-[0.9rem] bg-white px-2.5 py-2">
              <div className="text-[10px] font-black text-slate-400">
                权限守卫
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {guardedPermissions.map((permission) => (
                  <span
                    key={permission.permission}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                    title={permission.note}
                  >
                    {permission.permission} / {permissionGuardLabel(permission)}
                  </span>
                ))}
              </div>
            </div>

            <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {latestDiagnostics.length === 0 ? (
                <div className="rounded-[0.9rem] border border-dashed border-slate-200 bg-white px-3 py-3 text-[11px] leading-5 text-slate-500">
                  还没有 groomed 节点或执行计划。协议梳理后会显示每个方块对应的适配器。
                </div>
              ) : (
                latestDiagnostics.map((item) => (
                  <div
                    key={`${item.source}-${item.id}`}
                    className="rounded-[0.9rem] border border-slate-200 bg-white px-2.5 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-black text-slate-900">
                          {item.title}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">
                          {item.nodeKind
                            ? GATEWAY_NODE_KIND_LABELS[item.nodeKind]
                            : "未知节点"} / {item.adapterLabel ?? "未匹配适配器"}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                          item.warnings.length > 0
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {item.warnings.length > 0 ? "需检查" : "OK"}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {item.requiredPermissions.length > 0 ? (
                        item.requiredPermissions.slice(0, 3).map((permission) => (
                          <span
                            key={`${item.id}-${permission}`}
                            className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700"
                          >
                            {permission}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                          无额外权限
                        </span>
                      )}
                      {item.mutatesData ? (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                          写入
                        </span>
                      ) : null}
                      {item.plansExternalCall ? (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          外部调用
                        </span>
                      ) : null}
                    </div>

                    {item.warnings.length > 0 ? (
                      <div className="mt-1.5 space-y-1">
                        {item.warnings.slice(0, 2).map((warning) => (
                          <div
                            key={`${item.id}-${warning}`}
                            className="rounded-[0.65rem] bg-amber-50 px-2 py-1 text-[10px] leading-4 text-amber-700"
                          >
                            {warning}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
