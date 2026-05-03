import Link from "next/link";
import { notFound } from "next/navigation";

const LOBSTER_MEMORY_CONFIG = {
  "work-order-longxia": {
    name: "工单龙虾",
    scope: "工单 / 工单列表 / 当前工单附件",
    statePath: "docker/openclaw/state/agents/main/agent",
    status: "已接入",
    folders: ["任务办理记忆", "工单上下文", "写回草案", "工具调用痕迹"],
    facts: [
      "优先读取工单目标、状态、负责人和附件。",
      "输出结构化处理方案，必要时写回 execution_results。",
      "只处理当前可见工单范围内的资料。",
    ],
  },
  "document-longxia": {
    name: "文档龙虾",
    scope: "文档档案室 / 文件夹 / 合作空间",
    statePath: "docker/openclaw/state-document/agents/main/agent",
    status: "待细化",
    folders: ["文档读取记忆", "文件夹范围", "协作空间痕迹", "表格写回草案"],
    facts: [
      "按工作协议网关给出的文档范围读取资料。",
      "未来表格编辑需要显式保存和版本回滚。",
      "合作空间权限独立于我的文档空间。",
    ],
  },
  "report-longxia": {
    name: "报表龙虾",
    scope: "总览 / 预警中心 / 报表输出",
    statePath: "docker/openclaw/state-report/agents/main/agent",
    status: "待细化",
    folders: ["报表模板", "指标口径", "日报周报草案", "输出历史"],
    facts: [
      "优先复用已有报表模板和指标口径。",
      "需要标记数据来源和统计时间。",
      "输出前保留可追溯草案。",
    ],
  },
  "alert-longxia": {
    name: "预警龙虾",
    scope: "总览 / 预警中心",
    statePath: "docker/openclaw/state-alert/agents/main/agent",
    status: "待细化",
    folders: ["风险规则", "预警历史", "确认记录", "升级策略"],
    facts: [
      "把异常、风险和待确认项分层汇总。",
      "需要保留人工确认状态。",
      "紧急风险优先推给 BP问问回问用户。",
    ],
  },
  "drawing-longxia": {
    name: "图纸龙虾",
    scope: "工程队 / 图纸和 CAD 资料",
    statePath: "docker/openclaw/state-drawing/agents/main/agent",
    status: "待细化",
    folders: ["图纸解析", "CAD 标注", "版本差异", "问题清单"],
    facts: [
      "读取图纸时要记录版本和来源文件。",
      "解析结果需要能回到原图定位。",
      "跨图纸问题统一输出到问题清单。",
    ],
  },
} as const;

type LobsterMemoryPageProps = {
  params: Promise<{
    agentId: string;
  }>;
};

export default async function LobsterMemoryPage({ params }: LobsterMemoryPageProps) {
  const { agentId } = await params;
  const config = LOBSTER_MEMORY_CONFIG[agentId as keyof typeof LOBSTER_MEMORY_CONFIG];

  if (!config) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-950">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <Link
          href="/ai-dorm/skills?panel=memory"
          className="inline-flex rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700"
        >
          返回 AI记忆主脑
        </Link>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-slate-400">
              LOBSTER MEMORY
            </p>
            <h1 className="mt-3 text-4xl font-black">{config.name}记忆</h1>
            <p className="mt-4 max-w-3xl text-lg font-semibold leading-8 text-slate-600">
              这里后续用于查看这只龙虾的记忆目录、可见范围和已沉淀的记忆片段。
            </p>
          </div>
          <div className="rounded-3xl bg-emerald-50 px-6 py-4 text-right">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">
              Status
            </p>
            <p className="mt-2 text-lg font-black text-emerald-800">{config.status}</p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-slate-400">
            VISIBLE SCOPE
          </p>
          <h2 className="mt-3 text-2xl font-black">可见范围</h2>
          <div className="mt-6 rounded-3xl bg-slate-50 p-6">
            <p className="font-black text-slate-800">{config.scope}</p>
            <p className="mt-3 font-mono text-sm font-semibold text-slate-500">
              {config.statePath}
            </p>
          </div>
          <div className="mt-6 rounded-3xl border border-blue-100 bg-blue-50 p-6 text-sm font-bold leading-7 text-blue-800">
            后续在 AI员工配置面板里开放这些记忆目录；一份记忆目录可以授权给一只或多只龙虾复用。
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-slate-400">
            MEMORY FOLDERS
          </p>
          <h2 className="mt-3 text-2xl font-black">记忆文件夹</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {config.folders.map((folder) => (
              <div
                key={folder}
                className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
              >
                <p className="text-lg font-black text-slate-900">{folder}</p>
                <p className="mt-2 text-sm font-semibold text-slate-500">等待真实目录接入</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-black uppercase tracking-[0.28em] text-slate-400">
          MEMORY FACTS
        </p>
        <h2 className="mt-3 text-2xl font-black">现有记忆片段</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {config.facts.map((fact) => (
            <div key={fact} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-bold leading-7 text-slate-700">{fact}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
