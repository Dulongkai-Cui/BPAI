# 11｜AI Agent 架构、MCP、CLI、Skill 与 Longxia 总设计

> 信息来源范围：`frontend/src/lib/bp-ask/**`、`frontend/src/lib/ai-dorm/**`、`frontend/src/lib/db/schema.ts`、`docker/openclaw/**`、`AI_Dev_Memo/Project_skeleton/**`、`Claude源码/src/tools/**`、`Claude源码/src/services/mcp/**`、`Claude源码/src/skills/**`、`Claude源码/src/cli/**`。更新时间：2026-04-26。
>
> 本文是 Agent 总设计文档，不是当前实现清单。凡是尚未落地的能力都标为“目标设计”或“后续阶段”。

## 1. 文档定位

BPAI 已经有 BP问问、execution task/result、AI宿舍、Skill 仓库页面、工作流页面、AI员工页面与 OpenClaw sidecar 入口。

但这些能力目前仍分散在：

- BP问问调度链路
- AI宿舍页面与 blueprint 数据
- OpenClaw sidecar 配置
- 阶段四/阶段五草案
- Claude 源码参考结构

本文要把它们收束成一套 Agent 总架构，用来回答：

- BP问问、大总管、龙虾、Skill、Workflow、MCP、CLI 各自是什么
- execution task/result 在 Agent 架构里承担什么接口角色
- LongxiaAdapter 应该放在哪里
- MCP 与 CLI 应该如何进入 BPAI，而不是直接堆进前台
- 下一阶段最小可落地范围是什么

## 2. 当前已落地事实

| 能力 | 当前状态 | 代码锚点 |
| --- | --- | --- |
| BP问问入口 | 已落地 | `frontend/src/app/bp-ask/page.tsx` |
| 意图识别与调度 | 已落地，规则优先，模型复核 | `frontend/src/lib/bp-ask/dispatch.ts` |
| 模型 provider | 已落地，DeepSeek / Kimi 可切换 | `frontend/src/lib/bp-ask/model-provider.ts` |
| 对话与记忆表 | 已落地 | `conversation_*`、`memory_facts` |
| execution task/result | 已落地 | `execution_tasks`、`execution_results` |
| AI宿舍任务看板 | 已落地 | `/ai-dorm/tasks` |
| AI宿舍 Skill 仓库 | 页面和 blueprint 已落地；`skill-work-order-summary` 最小 Runner 已落地，真实持久化未落地 | `/ai-dorm/skills`、`frontend/src/lib/ai-dorm/server.ts`、`frontend/src/lib/ai-dorm/skill-runner.ts` |
| AI宿舍工作流 | 页面和 blueprint 已落地；`workflow-work-order-intake` 最小 Runner 已落地，当前可跑 `input -> 工单摘要 Skill -> 工单龙虾 dry-run -> waiting_confirmation -> confirmation evaluation -> post-confirmation dry-run -> 写回草案落库 -> 草案审阅 -> 白名单正式写回 -> output`，并记录确认项同意/拒绝/暂缓、草案批准/拒绝/取消和 applied 写回结果 | `/ai-dorm/workflows`、`frontend/src/lib/ai-dorm/workflow-runner.ts` |
| AI员工/龙虾目录 | 页面和 blueprint 已落地 | `/ai-dorm/agents` |
| OpenClaw sidecar 发射入口 | 已落地 | `frontend/src/lib/ai-dorm/openclaw.ts`、`/api/ai-dorm/openclaw/**` |
| LongxiaAdapter | 已最小落地 dry-run，当前仅支持 `work-order-longxia` 生成承接预案与待确认项；未调用 OpenClaw sidecar | `frontend/src/lib/ai-dorm/longxia-adapter.ts` |
| MCP Registry / Tool Gateway | Tool Gateway 最小链路已落地 `work_order.read`、`work_order.writeback_draft.create` 和 `work_order.writeback.apply`；正式写回只处理 ready 草案和白名单字段；草案审阅 API 已支持 `ready / rejected / cancelled / applied`；MCP Registry 未落地 | `frontend/src/lib/ai-tools/gateway.ts`、`/api/bp-ask/threads/[threadId]/writeback-drafts` |
| BPAI CLI | 未落地 | 当前仅有设计需求 |

## 3. 当前核心判断

BPAI 的 Agent 架构不应该做成“很多聊天机器人互相聊天”。

更稳的设计是：

```text
用户
-> BP问问 / 大总管
-> dispatch decision
-> execution_tasks
-> AI宿舍 Runtime
-> Skill / Workflow / Agent / Longxia / system tool / MCP tool
-> execution_results
-> BP问问总结与确认
```

这里有三个关键边界：

- BP问问负责理解、调度、解释、确认，不直接承担所有执行。
- AI宿舍负责承接任务、管理执行资源、记录运行状态。
- 龙虾、Skill、Workflow、MCP tool 都是后场执行能力，不是新的前台入口。

### 3.1 大总管循环架构

BP问问的目标形态不是“一次判断后把任务扔出去”，而是一个持续循环的大总管。

推荐循环如下：

```text
用户提出目标
-> BP问问识别对象、约束、风险和目标域
-> 如果信息不足，先追问关键细节
-> 如果信息足够，评估谁最适合处理
-> 简单只读 / 低风险 Tool 由 BP问问直接执行
-> 复杂多步骤任务先查是否有现成工作流
-> 有工作流：按 AI员工协同工作流推进
-> 无工作流或范围过大：外包给合适龙虾 / Agent
-> 龙虾 / Agent 返回结构化结果、日志、产物或待确认项
-> BP问问把返回结果纳入当前上下文，继续下一步
-> 任务完成后，BP问问汇总整体结果，并说明改变了哪些对象、文件或记录
```

这个循环意味着 BP问问至少要具备六种能力：

| 能力 | 含义 |
| --- | --- |
| 追问细节 | 不清楚目标、对象、权限或输出格式时先问，不假装执行 |
| 统筹目的 | 把用户自然语言整理成目标、约束、成功标准 |
| 规划步骤 | 把复杂任务拆成可追踪步骤 |
| 直接执行简单工具 | 对只读、低风险、短链路工具，BP问问可以自己调用 |
| 匹配工作流或龙虾 | 复杂任务先匹配现成工作流；没有合适工作流再交给龙虾 |
| 回收结果并继续 | 把执行器结果作为后续上下文，而不是只转述一次 |

### 3.2 调度决策梯度

BP问问判断“谁来做”时，建议按以下梯度走：

| 梯度 | 条件 | 执行方式 |
| --- | --- | --- |
| 直接回答 | 纯解释、问候、能力说明、轻量上下文问题 | BP问问直接回答 |
| 简单工具 | 单对象、只读、低风险、一步查询或摘要 | BP问问通过 Tool Gateway 直接执行 |
| Skill | 单点可复用能力，例如工单摘要、待确认意见扫描 | BP问问调用 Skill Runner |
| Workflow | 多步骤、多角色、需要 AI员工协作或人工确认 | AI宿舍按工作流推进 |
| 龙虾 / Agent | 范围大、任务复杂、需要专业执行体或浏览器执行 | 外包给对应龙虾 / Agent |
| 人工确认 | 写入、权限、删除、外部动作、不可逆操作 | 进入确认节点，再继续执行 |

所以，Workflow 的定位不应是“具体 tool 该怎么调的底层脚本”，而应是：

> **BP问问、大总管、Skill、AI员工、龙虾、人工确认之间的协作方式。**

## 4. 从 Claude 源码参考中借什么

`Claude源码` 里最值得借的是工程结构，不是照搬代码。

### 4.1 Agent 是声明式对象

Claude 的 Agent 定义包含类似以下能力面：

- agent 类型
- prompt
- tools / disallowedTools
- skills
- mcpServers
- model
- permissionMode
- memory
- isolation
- maxTurns

BPAI 应该把“工单龙虾、文档龙虾、图纸龙虾、预警龙虾、报表龙虾”也做成声明式对象，而不是长期停留在页面 blueprint。

### 4.2 Tool、MCP、Skill 是三类资产

Claude 里这三层边界比较清楚：

- Tool：真正可执行的动作
- MCP：外部工具和资源的连接协议
- Skill：可复用的任务能力说明与执行包装

BPAI 当前产品上已经分出 Skill 仓库、工作流、AI员工，但工程协议还没分开。

### 4.3 MCP 需要连接管理和权限管理

Claude 的 MCP 不是“有地址就直接调”，而是有：

- server config
- transport type
- auth / token / oauth
- connection health
- tool schema
- resource listing
- permission pass-through

BPAI 接 MCP 时也应先做 MCP Registry 与 Tool Gateway，而不是让 BP问问直接碰任意 MCP server。

### 4.4 CLI 是治理入口

Claude 的 `agents`、`mcp`、`skills`、`plugins` 命令说明一件事：Agent 系统不能只靠 UI 管。

BPAI 后续也需要 CLI 来做：

- 列出 Agent
- 校验 Skill
- 测试 MCP
- 回放 execution task
- 检查权限
- 导入/导出能力资产

## 5. BPAI 目标分层

### 5.1 BP问问 Coordinator

职责：

- 接收用户自然语言
- 识别 intent / domain / mode
- 抽取 targetRefs / constraints
- 在目标、对象、权限、输出格式不清楚时主动追问
- 统筹用户目标，形成成功标准和步骤草案
- 判断是否需要工具、记忆、写入、确认
- 判断任务更适合 BP问问、Skill、Workflow、龙虾还是人工确认
- 对简单只读 / 低风险工具执行做直接编排
- 创建或更新 execution task/result
- 回收执行器结果并作为后续上下文继续推进
- 对用户解释当前状态

当前代码锚点：

- `frontend/src/lib/bp-ask/dispatch.ts`
- `frontend/src/lib/bp-ask/server.ts`
- `frontend/src/lib/bp-ask/model-provider.ts`

不应承担：

- 直接执行浏览器自动化
- 直接连接全部 MCP server
- 直接正式回写业务系统
- 直接替代 AI宿舍运行态管理

### 5.2 AI宿舍 Runtime / Task Hub

职责：

- 接收 `execution_tasks`
- 展示任务状态
- 选择执行器
- 运行或模拟运行
- 写入 `execution_results`
- 管理 Agent、Skill、Workflow、Longxia 的状态

当前代码锚点：

- `frontend/src/lib/ai-dorm/server.ts`
- `/ai-dorm/tasks`
- `/ai-dorm/workflows`
- `/ai-dorm/skills`
- `/ai-dorm/agents`

目标设计：

- 从 blueprint 过渡到 DB 持久化
- 形成统一 runner
- 支持 dry-run、planned、delegated、completed、failed 等状态流转

### 5.3 Agent Registry / 龙虾定义

Agent Registry 用来描述“谁来干活”。

建议 Agent manifest 最小字段：

```json
{
  "id": "work-order-longxia",
  "name": "工单龙虾",
  "kind": "longxia",
  "domains": ["work_order"],
  "modelProvider": "kimi",
  "skills": ["skill-work-order-summary"],
  "mcpServers": [],
  "allowedTools": ["work_order.read", "execution_result.write"],
  "permissionMode": "read_only",
  "memoryScope": "agent",
  "maxTurns": 8,
  "status": "enabled"
}
```

当前短期不需要一次性建完整表，但需要先确定 manifest 语义。

### 5.4 Skill Registry / Skill 仓库

Skill Registry 用来描述“怎么干一个可复用单点能力”。

建议 Skill manifest 最小字段：

```json
{
  "id": "skill-work-order-summary",
  "name": "工单摘要 Skill",
  "category": "summary",
  "sourceKind": "template",
  "description": "读取单个工单并输出状态、风险与下一步建议。",
  "inputSchema": {
    "workOrderId": "string"
  },
  "outputSchema": {
    "summary": "string",
    "risks": "array",
    "nextStep": "string"
  },
  "allowedTools": ["work_order.read"],
  "riskLevel": "read_only",
  "version": "0.1.0",
  "status": "draft"
}
```

Skill 不等于 Tool：

- Skill 是能力包装和提示策略。
- Tool 是实际系统动作。
- 一个 Skill 可以调用多个 Tool。
- 一个 Workflow 可以串联多个 Skill。

### 5.5 Workflow Runner

Workflow Runner 用来描述“多角色、多步骤的 AI 协作方式”，不是底层工具调用脚本。

也就是说，工作流更接近截图里的“AI员工协同工作流”：

```text
接收入参
-> 工单摘要 Skill
-> 工单龙虾承接
-> 人工确认
-> 结果回执
```

它表达的是：

- 哪个阶段由 BP问问负责解释和统筹
- 哪个阶段由 Skill 处理单点能力
- 哪个阶段由 AI员工 / 龙虾承接专业执行
- 哪个阶段必须进入人工确认
- 最终如何回写 execution_results 并交给 BP问问总结

当前页面已经有节点概念：

- input
- skill
- agent
- condition
- human
- output

目标设计：

```text
execution_task
-> workflow instance
-> input node：接收 BP问问目标、约束、上下文
-> skill node：执行单点能力
-> agent node：交给龙虾 / AI员工
-> human node：处理确认、审批或补充信息
-> output node：写入 execution_results
-> execution_result
```

阶段目标不应是先做复杂画布，而是先做可执行的最小 runner。

### 5.5.1 Workflow 与 Tool 的边界

简单工具调用不需要进入 Workflow。

例如：

- 查一个工单状态
- 读取一个文档元数据
- 搜索一个表单
- 总结一个已知对象的简短信息

这类任务应该由 BP问问通过 Tool Gateway 直接执行。

Workflow 应该用于：

- 多步骤
- 多对象
- 多执行体
- 需要人工确认
- 需要形成可追踪结果
- 可能需要龙虾执行后再回到 BP问问继续推理

### 5.5.2 Workflow 匹配策略

当 BP问问识别到复杂任务时，应先做工作流匹配：

```text
dispatch decision
-> 根据 targetDomain / primaryIntent / executionMode / toolHints 匹配 workflow
-> 如果命中 enabled workflow，创建 workflow run
-> 如果没有命中，选择合适龙虾 / Agent 作为外包执行器
-> 如果风险较高，先插入 human node
```

匹配依据建议包括：

- `targetDomain`
- `primaryIntent`
- `executionMode`
- `requiresWrite`
- `requiresConfirmation`
- `toolHints`
- `targetRefs` 类型
- 用户所在角色和权限
- 当前任务是否需要多 Agent 协作

### 5.6 Tool Gateway

Tool Gateway 用来描述“系统里真正能做什么动作”。

BP问问可以直接调用 Tool Gateway 中低风险、短链路、可审计的工具；复杂工具链仍应交给 Skill、Workflow 或龙虾。

建议第一批内部 Tool：

| Tool | 风险级别 | 说明 |
| --- | --- | --- |
| `work_order.read` | read | 读取工单详情 |
| `work_order.search` | read | 搜索工单 |
| `document.read_metadata` | read | 读取文档元数据 |
| `workspace.read` | read | 读取合作空间信息 |
| `system_form.read` | read | 读取表单 |
| `execution_result.write` | safe_write | 写入执行结果 |
| `work_order.draft_dispatch` | draft_write | 生成派单草案 |

写入类 Tool 必须走权限和确认。

### 5.6.1 BP问问可直接执行的 Tool 条件

满足以下条件时，BP问问可以直接执行：

- 单步或短链路
- 只读或安全写入
- 目标对象明确
- 权限可在当前用户上下文内判断
- 结果可以直接进入当前回答
- 失败后不会造成业务副作用

不满足这些条件时，应转入 Skill / Workflow / Longxia。

### 5.7 MCP Gateway

MCP Gateway 用来接外部工具、外部资源和外部上下文。

建议 MCP server 配置最小字段：

```json
{
  "id": "cad-tools",
  "name": "CAD 工具服务",
  "transport": "stdio",
  "command": "node",
  "args": ["./mcp/cad-server.js"],
  "envRefs": ["CAD_TOOL_TOKEN"],
  "enabled": false,
  "allowedAgentIds": ["drawing-longxia"],
  "allowedToolNames": ["cad.readMetadata"],
  "riskLevel": "read_only"
}
```

BPAI 的 MCP 设计原则：

- MCP server 先注册，再暴露工具。
- 工具先经过 Tool Gateway，再给 Agent 使用。
- 任何 MCP tool 都要带风险级别、权限范围和审计记录。
- BP问问不直接看到全量 MCP tool。

### 5.8 LongxiaAdapter

LongxiaAdapter 是 AI宿舍到 OpenClaw / 浏览器执行器之间的桥。

职责：

- 把 `execution_task` 转成 Longxia 输入
- 在没有合适 Workflow 或任务范围过大时承接外包执行
- 下发允许动作、对象范围、权限边界
- 发起 OpenClaw sidecar 或调用 gateway
- 收集执行日志、截图、结果对象
- 写回 `execution_results`

建议输入：

```json
{
  "taskId": "exec_001",
  "agentId": "work-order-longxia",
  "goal": "检查 WO-20240101 当前状态并生成回执草案",
  "targetRefs": {
    "workOrderNo": "WO-20240101"
  },
  "constraints": {
    "writePolicy": "readonly"
  },
  "allowedActions": ["work_order.read", "execution_result.write"],
  "requiresConfirmation": false
}
```

建议输出：

```json
{
  "taskId": "exec_001",
  "status": "completed",
  "summaryText": "工单处于待派单状态，缺少施工队确认。",
  "structuredPayload": {
    "toolRuns": [],
    "artifacts": [],
    "writebackCandidates": []
  }
}
```

### 5.9 BPAI CLI

CLI 是调试、运维、治理入口。

建议第一批命令：

```text
bpai agents list
bpai agents inspect <agentId>
bpai skills list
bpai skills validate <skillId|path>
bpai mcp list
bpai mcp test <serverId>
bpai tasks list --status planned
bpai tasks inspect <taskId>
bpai tasks replay <taskId> --dry-run
```

CLI 不替代 UI，但能让复杂 Agent 系统可测试、可排障、可迁移。

## 6. 统一运行生命周期

建议所有执行都收束到同一生命周期。

```text
created
-> planned
-> queued
-> running
-> waiting_for_confirmation
-> completed
```

失败路径：

```text
running
-> failed
-> retry_planned
-> running
```

取消路径：

```text
planned / queued / running
-> cancelled
```

当前 `execution_task_status` 只有：

- pending
- planned
- delegated
- completed
- failed
- cancelled

短期可以继续沿用；等 runner 落地后再评估是否扩状态。

### 6.1 BP问问持续循环中的状态含义

在大总管循环里，`execution_result` 不是终点，而是下一步上下文。

推荐语义：

```text
execution_result
-> BP问问读取 summaryText / structuredPayload
-> 判断是否已经满足用户目标
-> 若未满足，继续规划下一步
-> 若需要确认，向用户追问或发起 human node
-> 若已满足，输出最终报告
```

最终报告应至少包含：

- 做了什么
- 谁执行了哪些步骤
- 读取或改变了哪些对象
- 生成了哪些文件、草案、记录或候选写回
- 哪些动作仍待人工确认
- 后续建议是什么


## 7. 权限与风险等级

建议把所有 Agent / Skill / Tool / MCP tool 都映射到统一风险级别：

| 风险级别 | 含义 | 是否需要确认 |
| --- | --- | --- |
| `read` | 只读查询 | 否 |
| `analysis` | 只读分析、总结、比较 | 否 |
| `draft_write` | 生成草案，不正式写回 | 视场景 |
| `safe_write` | 写入低风险内部记录，例如 execution result | 否 |
| `restricted_write` | 业务对象正式变更 | 是 |
| `destructive` | 删除、权限转移、批量覆盖 | 必须确认 |
| `external_action` | 外部系统或浏览器自动化 | 必须按策略确认 |

BP问问 dispatch 已有：

- `requiresWrite`
- `requiresConfirmation`
- `executionMode`
- `toolHints`

后续 Tool Gateway 应继续消费这些字段，而不是另起一套风险判断。

## 8. 模型分工

当前模型分工建议保持：

| 层 | 默认模型 | 说明 |
| --- | --- | --- |
| BP问问 / 大总管 | `deepseek-v4-pro` | 意图识别、调度复核、普通聊天 |
| AI员工 / 龙虾 | `kimi-k2.5` | OpenClaw 侧执行与专业员工 |
| Skill 生成辅助 | 先复用 BP问问 provider | 后续可单独配置 |

长期应从 `executorKind = kimi` 逐步迁移到更稳定的抽象：

- `model_assist`
- `agent`
- `workflow`
- `system_tool`
- `longxia`

不要把某个模型名永久写进执行器类型。

## 9. 建议新增或演进的数据对象

### 9.1 短期沿用

短期继续以这两张表作为主桥：

- `execution_tasks`
- `execution_results`

### 9.2 中期新增

建议中期新增：

| 表 | 用途 |
| --- | --- |
| `ai_agents` | Agent / 龙虾声明式定义 |
| `ai_skills` | Skill 元数据、版本、状态 |
| `ai_workflows` | Workflow 定义 |
| `ai_workflow_runs` | Workflow 运行实例 |
| `ai_tool_registry` | 内部 Tool 注册表 |
| `ai_mcp_servers` | MCP server 注册表 |
| `ai_tool_runs` | Tool / MCP tool 执行日志 |
| `ai_agent_runs` | Agent 运行日志 |

### 9.3 不建议过早新增

第一版不建议立刻做：

- 复杂多 Agent 协商消息总线
- Agent 间长期自治通信表
- 全量插件市场
- 远程工作区隔离系统

这些可以等最小 runner 跑通后再做。

## 10. 与现有文档的关系

| 文档 | 关系 |
| --- | --- |
| `04_AI链路_BPAsk_记忆_调度.md` | 记录 BP问问当前事实 |
| `05_基础设施_外部依赖_运行支撑.md` | 记录 env、OpenClaw、模型运行事实 |
| `06_产品意图到代码映射_仅参考.md` | 标明哪些 Agent 能力尚未落地 |
| `09_端到端场景剧本.md` | 后续补 Agent 场景剧本 |
| `12_AI_Agent理想状态缺口清单_List.md` | 列出从当前状态到理想 Agent 架构还缺哪些能力 |
| 本文 | 统一 Agent / MCP / CLI / Skill / Longxia 的目标架构 |

## 11. 分阶段落地建议

### 阶段 A：把 Agent 总设计固化

目标：

- 本文进入建设规范
- 更新术语与文档索引
- 明确当前已落地与未落地边界

完成标准：

- 后续讨论 Agent、Skill、MCP、Longxia 时都能回链到本文。

### 阶段 B：Agent / Skill manifest 最小持久化

目标：

- 把 `AGENT_BLUEPRINTS`、`SKILL_BLUEPRINTS` 从纯代码常量逐步转成 DB 或配置文件
- 定义 manifest schema
- 做只读展示和 validate

完成标准：

- AI宿舍页面读取统一 manifest，而不是硬编码数组。

### 阶段 C：Tool Gateway 第一批只读工具

目标：

- 注册 `work_order.read`
- 注册 `document.read_metadata`
- 注册 `workspace.read`
- 注册 `system_form.read`
- 写入 `ai_tool_runs` 或暂存到 `execution_results.structuredPayload.toolRuns`

完成标准：

- 一个只读 execution task 可以通过 AI宿舍 runner 真实读取系统对象并返回结果。

### 阶段 D：Skill Runner

目标：

- Skill 可以声明 input/output/allowedTools
- Runner 可以执行一个只读 Skill
- Skill 执行结果进入 `execution_results`

完成标准：

- `skill-work-order-summary` 不再只是页面卡片，而能真实读取工单并返回摘要。

### 阶段 E：Workflow Runner 最小闭环

目标：

- 支持 input -> skill -> output
- 支持 condition / human 节点先作为 planned 状态

完成标准：

- 一个 workflow 能从 execution task 创建 run，并写回 execution result。

### 阶段 F：LongxiaAdapter

目标：

- 对接 OpenClaw sidecar
- 支持只读 / dry-run
- 记录日志和 artifacts

完成标准：

- `delegate_to_longxia` 任务不再只生成草案，而能进入 OpenClaw 执行链。

### 阶段 G：MCP Gateway 与 CLI

目标：

- 注册 MCP server
- 测试连接
- 暴露经过权限过滤的 MCP tool
- 增加 CLI 调试命令

完成标准：

- 可以通过 CLI 或 AI宿舍页面验证 MCP server 状态，并让指定 Agent 使用指定 MCP tool。

## 12. 最近下一步建议

最务实的下一步不是马上接复杂 MCP，而是：

1. 给 BP问问补“执行方式评估”设计：直接工具 / Skill / Workflow / 龙虾 / 人工确认。
2. 给 Agent / Skill / Workflow 写 manifest schema 草案。
3. 把 AI宿舍里的 blueprint 数据整理成 manifest 形态。
4. 做一个只读 Tool Gateway：先支持 `work_order.read`，让 BP问问能直接执行简单查询。
5. 做一个最小 Skill Runner：执行“工单摘要 Skill”。
6. 做一个最小 Workflow Runner：跑通 input -> skill -> agent/dry-run -> human waiting_confirmation -> confirmation action/evaluation -> post-confirmation dry-run -> 写回草案落库 -> 草案审阅 -> 白名单正式写回 -> output。
7. 让 BP问问生成的 `execution_task` 可以被 AI宿舍真正消费一次，并把结果回收到 BP问问上下文继续对话。

这样 BPAI 的 Agent 架构会从“页面和概念已经有了”进入“后场真的能跑一条链路”。

## 13. 一句话总结

BPAI 的 Agent 架构应被设计成：

> BP问问做 Coordinator 和大总管，简单工具自己直接执行，复杂任务先匹配 AI员工协同工作流，没有合适工作流再外包龙虾；AI宿舍做 Runtime，Skill 沉淀单点能力，Workflow 编排大总管、AI员工、龙虾与人工确认的协作方式，Tool/MCP Gateway 管住真实动作，CLI 负责治理与调试。
