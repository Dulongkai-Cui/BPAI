import Link from "next/link";
import { notFound } from "next/navigation";

const MEMORY_SECTION_CONFIG = {
  "system-prompt": {
    eyebrow: "FRONTAL CORTEX",
    title: "系统级身份提示词",
    subtitle: "决定 BP问问是谁、怎么接任务、何时追问、何时调用工具或下发给龙虾。",
    scope: "bpask.identity.system",
    factType: "system_identity",
    draft:
      "你是我的 BPAI 系统入口。默认自然对话；当用户表达任务意图时，主动梳理目标、缺失信息、可用工具和下游龙虾，并在信息充足后执行。",
    checkpoints: ["自然聊天不打断", "任务意图识别", "缺参追问", "工具优先", "必要时转交龙虾"],
  },
  "long-term-preferences": {
    eyebrow: "LONG TERM",
    title: "长期偏好",
    subtitle: "沉淀用户长期稳定的口吻、项目习惯、默认输出格式和常用范围。",
    scope: "bpask.memory.preference",
    factType: "preference",
    draft:
      "用户偏好直接、务实的工程协作方式；前端迭代优先先做可见可点的真实交互，再逐步接后端。",
    checkpoints: ["用户口吻", "默认项目", "输出格式", "常用模块"],
  },
  "task-context": {
    eyebrow: "WORKING MEMORY",
    title: "任务上下文",
    subtitle: "保存连续对话里尚未完成的目标、约束、追问和阶段进度。",
    scope: "bpask.memory.task_context",
    factType: "task_context",
    draft:
      "当前阶段正在搭建 AI宿舍里的工作协议网关、AI生产资料仓和 AI记忆主脑，重点先完成前端真实可用的交互骨架。",
    checkpoints: ["当前目标", "已完成项", "待验证项", "用户新要求"],
  },
  "tool-habits": {
    eyebrow: "TOOL ROUTING",
    title: "工具习惯",
    subtitle: "记录 BP问问常用工具、工单、文档和工作协议调用路径。",
    scope: "bpask.memory.tool_habit",
    factType: "tool_habit",
    draft:
      "工单和文档基础能力优先走 Tool Calling；工作协议网关负责把自然语言协议梳理成可执行节点、连线和参数。",
    checkpoints: ["工单工具", "文档工具", "协议梳理", "龙虾转交"],
  },
  "memory-trash": {
    eyebrow: "ARCHIVE",
    title: "回收站",
    subtitle: "放置被清理、覆盖、降权或暂存的记忆片段，避免直接丢失。",
    scope: "bpask.memory.trash",
    factType: "trash",
    draft:
      "这里后续用于暂存被替换的身份设定、过期偏好和误写入的记忆事实，支持恢复或彻底删除。",
    checkpoints: ["待确认", "可恢复", "已降权", "可删除"],
  },
} as const;

type MemorySectionPageProps = {
  params: Promise<{
    section: string;
  }>;
};

export default async function MemorySectionPage({ params }: MemorySectionPageProps) {
  const { section } = await params;
  const config = MEMORY_SECTION_CONFIG[section as keyof typeof MEMORY_SECTION_CONFIG];

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
              {config.eyebrow}
            </p>
            <h1 className="mt-3 text-4xl font-black">{config.title}</h1>
            <p className="mt-4 max-w-3xl text-lg font-semibold leading-8 text-slate-600">
              {config.subtitle}
            </p>
          </div>
          <div className="rounded-3xl bg-blue-50 px-6 py-4 text-right">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-500">Scope</p>
            <p className="mt-2 font-mono text-sm font-bold text-slate-700">{config.scope}</p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-slate-400">
            PROMPT DRAFT
          </p>
          <h2 className="mt-3 text-2xl font-black">当前草案</h2>
          <textarea
            defaultValue={config.draft}
            className="mt-6 min-h-64 w-full resize-y rounded-3xl border border-slate-200 bg-slate-50 p-6 text-base font-semibold leading-8 text-slate-700 outline-none focus:border-blue-300"
          />
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white">
              保存草案
            </button>
            <button className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-700">
              查看历史版本
            </button>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-slate-400">
            MEMORY FACT
          </p>
          <h2 className="mt-3 text-2xl font-black">记忆事实映射</h2>
          <div className="mt-6 rounded-3xl bg-slate-50 p-6">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
              fact_type
            </p>
            <p className="mt-2 font-mono text-base font-black text-slate-800">
              {config.factType}
            </p>
          </div>
          <div className="mt-6 grid gap-3">
            {config.checkpoints.map((checkpoint) => (
              <div
                key={checkpoint}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4"
              >
                <span className="font-black text-slate-800">{checkpoint}</span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                  待接入
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
