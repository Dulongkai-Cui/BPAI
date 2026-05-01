import { getAiToolRegistrySnapshot } from "@/lib/ai-tools/gateway";
import { requireCurrentUser } from "@/lib/auth/server";

function countBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const value = String(item[key] ?? "unknown");
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-3 text-3xl font-black tracking-tight text-slate-950">{value}</div>
    </div>
  );
}

function CountPills({ title, counts }: { title: string; counts: Record<string, number> }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-black text-slate-900">{title}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        {Object.entries(counts).map(([key, value]) => (
          <span
            key={key}
            className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"
          >
            {key} · {value}
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function AiDormToolRegistryPage() {
  await requireCurrentUser();
  const registry = getAiToolRegistrySnapshot();
  const bySourceKind = countBy(registry.capabilities, "sourceKind");
  const byDomain = countBy(registry.capabilities, "domain");
  const byRiskLevel = countBy(registry.capabilities, "riskLevel");

  return (
    <div className="space-y-6 p-2 sm:p-4">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">
              MCP-lite Registry
            </div>
            <h1 className="mt-4 text-[2rem] font-black tracking-tight text-slate-950">
              Tool Registry
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              当前展示 BP问问可发现的资源与 capability。这里是后续接入 work_order.search、document.write_content、外部 MCP server 和 Longxia fallback 的观察入口。
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-500">
            GET /api/ai-tools/registry
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Resources" value={registry.resources.length} />
        <StatCard label="Capabilities" value={registry.capabilities.length} />
        <StatCard label="Internal Tools" value={bySourceKind.internal ?? 0} />
        <StatCard label="Longxia Tools" value={bySourceKind.longxia ?? 0} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <CountPills title="按来源" counts={bySourceKind} />
        <CountPills title="按领域" counts={byDomain} />
        <CountPills title="按风险等级" counts={byRiskLevel} />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-950">Resources</h2>
            <p className="mt-1 text-sm text-slate-500">MCP-like resource types exposed to BP问问.</p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {registry.resources.map((resource) => (
            <article key={resource.type} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                {resource.sourceKind}
              </div>
              <h3 className="mt-3 text-lg font-black text-slate-950">{resource.displayName}</h3>
              <div className="mt-1 font-mono text-xs font-semibold text-blue-700">{resource.type}</div>
              <p className="mt-3 text-sm leading-6 text-slate-500">{resource.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {resource.identifierKeys.map((key) => (
                  <span key={key} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {key}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-xl font-black tracking-tight text-slate-950">Capabilities</h2>
          <p className="mt-1 text-sm text-slate-500">按 capability descriptor 暴露的可执行/可编排动作。</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3 font-black">Name</th>
                <th className="px-5 py-3 font-black">Domain</th>
                <th className="px-5 py-3 font-black">Action</th>
                <th className="px-5 py-3 font-black">Source</th>
                <th className="px-5 py-3 font-black">Risk</th>
                <th className="px-5 py-3 font-black">Mode</th>
                <th className="px-5 py-3 font-black">Target</th>
                <th className="px-5 py-3 font-black">Input</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registry.capabilities.map((capability) => (
                <tr key={capability.name} className="align-top hover:bg-blue-50/40">
                  <td className="px-5 py-4">
                    <div className="font-mono text-xs font-bold text-blue-700">{capability.name}</div>
                    <div className="mt-1 font-semibold text-slate-900">{capability.displayName}</div>
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-700">{capability.domain}</td>
                  <td className="px-5 py-4 text-slate-600">{capability.action}</td>
                  <td className="px-5 py-4 text-slate-600">{capability.sourceKind}</td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                      {capability.riskLevel}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{capability.executionMode}</td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-500">
                    {capability.target.objectType}
                  </td>
                  <td className="max-w-[18rem] px-5 py-4 font-mono text-xs leading-5 text-slate-500">
                    {JSON.stringify(capability.inputSchema)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
