# 12｜AI Agent 理想状态缺口清单 List

> 信息来源范围：`11_AI Agent架构_MCP_CLI_Skill_Longxia总设计.md`、`04_AI链路_BPAsk_记忆_调度.md`、`05_基础设施_外部依赖_运行支撑.md`、`frontend/src/lib/bp-ask/**`、`frontend/src/lib/ai-dorm/**`、`frontend/src/lib/db/schema.ts`、`docker/openclaw/**`、`AI_Dev_Memo/Project_skeleton/**`。更新时间：2026-04-26。
>
> 本文是缺口清单，不是承诺清单。状态以当前代码事实为准。

## 1. 当前理想状态一句话

目标中的 BPAI AI Agent 架构应是：

```text
BP问问作为大总管
-> 追问细节、统筹目标、规划步骤
-> 简单 Tool 自己执行
-> 复杂任务匹配 AI员工协同工作流
-> 无合适工作流时外包给龙虾 / Agent
-> 执行结果回到 BP问问上下文
-> BP问问继续推进或输出最终报告
```

当前已经有入口、调度、任务表、AI宿舍页面和 OpenClaw 发射入口；缺的是把这些东西接成真实可运行的后场。

## 2. 缺口优先级定义

| 优先级 | 含义 |
| --- | --- |
| P0 | 没有它，理想循环无法开始 |
| P1 | 有了 P0 后，能跑通第一条真实最小链路 |
| P2 | 让系统从 demo 变成可扩展 Agent 平台 |
| P3 | 长期增强，暂不阻塞最小闭环 |

## 3. P0 缺口：大总管循环的基础件

| 编号 | 缺口 | 当前状态 | 为什么重要 | 建议落点 |
| --- | --- | --- | --- | --- |
| P0-01 | 执行方式评估器 | 已在 BP问问服务层最小落地 `executionRoute = direct_tool / skill / dispatch_plan`，但尚未沉淀为 dispatch 统一字段 | 决定 BP问问到底自己做、走工作流，还是外包龙虾 | `frontend/src/lib/bp-ask/dispatch.ts` + `server.ts` |
| P0-02 | 追问细节策略 | 已有 clarification，但还没有按对象、权限、输出格式、成功标准拆分追问类型 | 大总管不能在信息不足时假装执行 | `dispatch.ts` + `intents.ts` |
| P0-03 | 简单 Tool 直执边界 | 最小 Tool Gateway 已落地，当前支持 `work_order.read` 只读直执 | BP问问需要能自己处理低风险短链路任务 | `frontend/src/lib/ai-tools/**` |
| P0-04 | execution result 回收循环 | 当前会写 result，但 BP问问尚未把后场结果作为下一步上下文继续规划 | 理想架构是循环，不是一次性转述 | `bp-ask/server.ts` + `ai-dorm/server.ts` |
| P0-05 | Agent / Skill / Workflow manifest schema | 当前 AI宿舍靠 blueprint 常量展示 | 后续无法做可配置、可校验、可迁移 | 新增 schema 草案或配置目录 |
| P0-06 | 当前能力状态标记 | 页面上有“已接入承接/只读接入”等，但工程状态没有统一枚举 | 避免把草案、模板、真实执行混在一起 | AI宿舍 manifest |

## 4. P1 缺口：第一条真实最小执行链路

| 编号 | 缺口 | 当前状态 | 为什么重要 | 建议落点 |
| --- | --- | --- | --- | --- |
| P1-01 | `work_order.read` Tool | 已注册为 AI Tool，可读取工单详情并返回结构化 payload | 最适合作为第一批只读工具 | `frontend/src/lib/ai-tools/gateway.ts` |
| P1-02 | Tool Gateway 最小实现 | 已最小落地，具备统一输入、结果和 toolRuns 结构 | 统一权限、输入校验、审计、结果结构 | `frontend/src/lib/ai-tools/gateway.ts` |
| P1-03 | Skill Runner 最小实现 | 已最小落地 `skill-work-order-summary`，内部调用 `work_order.read` | 让“工单摘要 Skill”从卡片变成可执行能力 | `frontend/src/lib/ai-dorm/skill-runner.ts` |
| P1-04 | Workflow Matcher | 已最小落地，当前支持工单目标匹配 `workflow-work-order-intake` | 复杂任务需要先匹配现成工作流 | `frontend/src/lib/ai-dorm/workflow-matcher.ts` |
| P1-05 | Workflow Runner 最小实现 | 已最小落地，当前支持 `input -> 工单摘要 Skill -> 工单龙虾 dry-run -> waiting_confirmation -> confirmation evaluation -> post-confirmation dry-run -> 写回草案落库 -> 草案审阅 -> 白名单正式写回 -> output`，确认项支持同意/拒绝/暂缓记录与结果评估；写回草案支持批准待写回 / 拒绝 / 取消；正式写回仅允许 ready 草案和白名单字段；尚未真实调用 OpenClaw | 跑通 input -> skill -> agent dry-run -> human confirmation -> output 的第一条链 | `frontend/src/lib/ai-dorm/workflow-runner.ts` |
| P1-06 | AI宿舍消费 task 的动作入口 | `/ai-dorm/tasks` 可看任务，但不能执行/试运行 | execution task 需要有后场承接动作 | 新增 `/api/ai-dorm/tasks/[taskId]/run` |
| P1-07 | execution result 结构扩展约定 | 已在 payload 中写入 `executionRoute`、`toolRuns`、`skillRuns`、`changedObjects`、`artifacts`，并新增 `execution_writeback_drafts` 追踪候选写回草案与审阅状态；尚未建独立 agent/tool run 日志表 | BP问问需要稳定读取 toolRuns、artifacts、changedObjects 和可审计草案 | 先写约定，再决定是否建表 |
| P1-08 | 最小端到端回归 | 已新增 `smoke:bp-ask:skill` 与 `smoke:bp-ask:workflow`，覆盖 BP问问 -> Skill / Workflow -> Tool -> Result | 防止工作流接入后破坏 BP问问主链 | `frontend/scripts/bp-ask-skill-runner-smoke.mjs`、`frontend/scripts/bp-ask-workflow-runner-smoke.mjs` |

## 5. P2 缺口：Agent 平台化能力

| 编号 | 缺口 | 当前状态 | 为什么重要 | 建议落点 |
| --- | --- | --- | --- | --- |
| P2-01 | Agent Registry 持久化 | `AGENT_BLUEPRINTS` 写在代码里 | 龙虾/AI员工需要可配置、可启停、可权限控制 | `ai_agents` 表或 manifest 文件 |
| P2-02 | Skill Registry 持久化 | `SKILL_BLUEPRINTS` 写在代码里 | Skill 需要版本、草案、测试、发布状态 | `ai_skills` 表或 manifest 文件 |
| P2-03 | Workflow Registry 持久化 | `WORKFLOW_BLUEPRINTS` 写在代码里 | 工作流需要启用状态、节点配置、匹配规则 | `ai_workflows` 表或 manifest 文件 |
| P2-04 | Agent Run / Tool Run 日志 | 当前只有 execution result | 排查复杂执行时需要逐步日志 | `ai_agent_runs`、`ai_tool_runs` 或 payload 过渡 |
| P2-05 | LongxiaAdapter | 已新增最小 dry-run adapter，当前支持 `work-order-longxia` 生成承接预案、待确认项和候选写回；尚未调用 OpenClaw sidecar | 龙虾外包执行无法真实闭环 | `frontend/src/lib/ai-dorm/longxia-adapter.ts` |
| P2-06 | OpenClaw 任务协议 | 当前只有 sidecar URL/token | 需要能把 task payload 发给 sidecar 或 gateway | `docker/openclaw/**` + API route |
| P2-07 | MCP Gateway | 未落地 | 外部工具和资源不能裸接 BP问问 | `frontend/src/lib/ai-mcp/**` |
| P2-08 | BPAI CLI | 未落地 | Agent/Skill/MCP 需要调试和治理入口 | `tools/bpai-cli` 或 `frontend/scripts/bpai-*.mjs` |
| P2-09 | AI宿舍管理动作 | 页面以查看为主 | 需要 enable/disable、validate、test、run、replay | AI宿舍页面与 API |

## 6. P3 缺口：长期增强

| 编号 | 缺口 | 当前状态 | 为什么重要 | 建议阶段 |
| --- | --- | --- | --- | --- |
| P3-01 | 多 Agent 协商协议 | 未落地 | 多龙虾并行、互相交接时需要 | 最小 runner 后 |
| P3-02 | 远程隔离执行环境 | 未落地 | 高风险浏览器/文件任务需要隔离 | LongxiaAdapter 稳定后 |
| P3-03 | 插件市场 / 外部 Skill 导入 | 未落地 | 让能力资产可扩展 | Skill Registry 稳定后 |
| P3-04 | 成本与额度治理 | 仅有资源位概念 | 多 Agent 执行需要成本控制 | 平台化阶段 |
| P3-05 | 语义搜索 / RAG 深度接入 | 文档里有规划，当前未完整落地 | 大总管需要跨文档和对象检索 | Tool Gateway 之后 |
| P3-06 | 自动生成 Skill / Workflow 并测试 | 只有产品设想 | 能力沉淀效率会提升 | Skill Runner 之后 |
| P3-07 | Agent 记忆与长期偏好 | BP问问已有 memory facts，Agent 侧未分层 | 专业员工需要稳定经验和偏好 | Agent Registry 后 |

## 7. 按模块看缺什么

### 7.1 BP问问 / 大总管

- 缺“执行方式评估器”：把 dispatch decision 转成 direct_tool / skill / workflow / agent / human_confirm。
- 缺“追问类型”：目标不清、对象不清、权限不清、输出格式不清、成功标准不清。
- 缺“步骤规划对象”：复杂任务应该生成 step plan，而不是只生成一句 assistantText。
- 缺“结果回收循环”：读 execution result 后继续判断下一步。
- 缺“最终报告结构”：做了什么、谁做的、改了什么、产物在哪里、哪些待确认。

### 7.2 Tool Gateway

- 缺统一 Tool interface。
- 缺输入 schema / 输出 schema。
- 缺风险级别。
- 缺权限检查。
- 缺 tool run 日志。
- 缺失败降级策略。
- 缺第一批只读工具。

### 7.3 Skill 仓库

- 缺持久化。
- 缺版本号。
- 缺草案/已发布/已停用状态。
- 缺 validate。
- 缺 test run。
- 缺 input/output schema。
- 缺与 Tool Gateway 的绑定。

### 7.4 工作流工坊

- 缺工作流匹配规则。
- 缺工作流 runner。
- 缺 workflow run 状态。
- 缺节点执行日志。
- 人工确认节点已能输出 `waiting_confirmation`、确认请求和候选写回展示，并支持同意/拒绝/暂缓记录、结果评估、全部同意后的续跑 dry-run、写回草案落库、草案审阅与白名单正式写回；仍缺正式 OpenClaw 执行。
- 缺失败分支和重试策略。
- 缺“结果回到 BP问问继续执行”的协议。

### 7.5 AI员工 / 龙虾

- 缺 Agent manifest。
- 缺 Agent 状态机。
- 缺 Agent 允许工具列表。
- 缺 Agent 绑定 Skill / Workflow 的规范。
- 缺 LongxiaAdapter。
- 缺 OpenClaw 执行 payload 与 result payload 协议。
- 缺 Agent 执行日志与 artifacts。

### 7.6 MCP

- 缺 MCP server registry。
- 缺连接测试。
- 缺 transport / auth / envRefs 配置。
- 缺 MCP tool 到 BPAI Tool Gateway 的映射。
- 缺 MCP 资源读取权限。
- 缺 MCP 调用审计。
- 缺页面和 CLI 管理入口。

### 7.7 CLI / 运维调试

- 缺 `bpai agents list/inspect`。
- 缺 `bpai skills validate/test`。
- 缺 `bpai mcp list/test`。
- 缺 `bpai tasks inspect/replay`。
- 缺本地 dry-run 调试。
- 缺 manifest 校验脚本。

### 7.8 权限、确认与审计

- 缺 Agent/Skill/Tool/MCP 的统一风险等级。
- 缺确认请求对象。
- 缺谁确认、确认什么、确认后执行什么的记录。
- `writebackCandidates` 已有最小标准结构，并可落库到 `execution_writeback_drafts`；写回草案已支持 `draft -> ready / rejected / cancelled -> applied` 状态；`work_order.writeback.apply` 只允许 ready 草案和白名单字段，当前支持 `draft_next_action -> work_orders.next_action`、`draft_risk_followup -> work_orders.metadata.bpAskRiskFollowups`。
- `changedObjects` 已有最小字段路径记录，并能在多次正式写回后累计展示；`artifacts` 仍缺标准结构。

### 7.9 UI / 产品表达

- BP问问缺“我正在规划/正在执行/等待确认/已完成”的连续状态表达。
- AI宿舍任务页缺“试运行/执行/取消/重试/回放”。
- 工作流画布缺真实运行态。
- Skill 仓库缺创建、编辑、测试、发布。
- AI员工页缺启停、授权、能力测试。
- 最终报告缺“改变了哪些文件或对象”的固定展示区。

## 8. 建议第一条最小闭环

第一条闭环不要从 Longxia 或 MCP 开始，先从最小只读链路开始：

```text
用户问：查一下 WO-20240101 当前状态，并总结下一步
-> BP问问识别 work_order + status_query
-> 执行方式评估：direct_tool 或 skill
-> Tool Gateway 调 `work_order.read`
-> Skill Runner 执行 `skill-work-order-summary`
-> 写 execution_result.structuredPayload.toolRuns
-> BP问问读取 result
-> 输出最终报告
```

这条链路能验证：

- BP问问是否会选执行方式
- Tool Gateway 是否能安全读系统对象
- Skill Runner 是否能包装单点能力
- execution result 是否能回到 BP问问上下文
- 最终报告是否能说明读取对象和后续建议

## 9. 建议第二条闭环

第二条闭环再做工作流：

```text
用户说：把这个工单整理一下，看看能不能安排施工队，需要的话让我确认
-> BP问问追问缺失对象或确认当前工单
-> 匹配“工单受理流程”
-> workflow input 接收 task
-> 工单摘要 Skill
-> 工单龙虾 dry-run 承接
-> human node 记录待确认项并进入 waiting_confirmation
-> 全部确认同意后续跑 dry-run，并把候选写回落成 execution_writeback_drafts
-> output 写 execution_result
-> BP问问汇总并提示待确认事项
```

这条链路能验证：

- 工作流是不是 AI员工协作方式
- human node 是否能进入确认
- 龙虾在未接真实执行前是否能 dry-run
- 候选写回是否能先变成草案，而不是直接改业务字段
- BP问问是否能把执行结果继续纳入对话

## 10. 暂时不要先做的事

以下能力很重要，但不建议作为下一步第一优先级：

- 全量 MCP Gateway
- 完整 Longxia 浏览器执行
- 多 Agent 并行协商
- 插件市场
- 复杂画布编辑器
- 全量向量 RAG
- 正式写回自动执行

原因是：这些能力都会放大系统复杂度。当前更关键的是先跑通“BP问问 -> 简单工具 / Skill -> execution result -> BP问问”的最小循环。

## 11. 一句话总结

当前 BPAI 离理想 Agent 状态最核心的缺口不是“缺更多模型”，而是：

> 缺一个能把 BP问问的调度判断，稳定落到 Tool、Skill、Workflow、龙虾、人工确认，并把结果回收到 BP问问上下文继续推进的后场运行系统。
