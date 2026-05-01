# BP问问 Capability-first 接续 Memo｜2026-04-27

## 1. 当前方向

我们已经决定把 BP问问从“关键词 / 规则工程”转向 **系统级 capability-first 架构**。

目标状态是：

```text
用户自然聊天
-> BP问问保持普通对话能力
-> 用户开始要求做事时，BP问问识别目标、对象、约束、成功标准
-> 信息不足则主动追问
-> 信息足够则优先调用系统内 Tool Gateway capability
-> 系统内能力做不了时，转写任务给 AI宿舍 / 龙虾 / OpenClaw
-> 回收执行结果，继续判断目标是否完成
-> 最终用自然语言向用户汇总结果
```

核心原则：**不要继续堆硬编码关键词规则；新增系统能力时优先定义 capability descriptor 和执行器。**

## 2. 已完成的代码方向

### 2.1 Tool Gateway / capability 协议雏形

代码位置：`frontend/src/lib/ai-tools/gateway.ts`

已经把 `AiCapabilityDescriptor` 从简单字段扩展为系统级协议，包含：

- `name`
- `displayName`
- `domain`
- `action`
- `sourceKind`
- `riskLevel`
- `executionMode`
- `description`
- `target`
- `inputSchema`
- `outputSchema`
- `requiredContext`
- `plannerHints`
- `failureModes`
- `mutatesDemoData`
- `requiresConfirmationDefault`

当前已注册 capability：

- `work_order.read`
- `work_order.create`
- `work_order.update`
- `work_order.archive`
- `work_order.writeback_draft.create`
- `work_order.writeback.apply`
- `document.list`
- `document.read`
- `document.create`
- `openclaw.work_order.execute`

### 2.2 BP问问 capability-first 主路径

代码位置：

- `frontend/src/lib/bp-ask/server.ts`
- `frontend/src/lib/bp-ask/model-provider.ts`

已经调整为：

```text
appendMessageToThreadForUser
-> dispatchBpAskPrompt 仍保留粗分 / 审计 / fallback
-> planAiCapabilityWithModel 读取 listAiCapabilityDescriptors()
-> 优先使用 modelCapabilityExecutionPlan
-> 旧 work-order planner / 关键词规则仅作为 fallback
```

`work_order.update` / `work_order.archive` 当前不是直接裸跑工具，而是由 BP问问转换成：

```text
写回候选
-> work_order.writeback_draft.create
-> 自动 ready
-> work_order.writeback.apply
-> 真实修改 demo work_orders 白名单字段
```

### 2.3 统一缺参追问协议雏形

代码位置：`frontend/src/lib/bp-ask/server.ts`

已经新增 `capability_followup` 路由：

```text
模型匹配 capability
-> 检查 inputSchema.required / anyOf
-> 如果缺必要参数
   -> 使用 plannerHints.missingInformationPrompt 追问
   -> 不调用工具
   -> 不编造 ID / 参数
   -> metadata 写入 missingInformationFollowup
```

例子：

```text
用户：帮我归档一个工单
BP问问：请告诉我要归档的工单编号。
```

目前缺参追问只覆盖“模型已经选中 capability”的场景。

## 3. 已更新的规格文档

已同步更新：

- `Construction_ Specification/04_AI链路_BPAsk_记忆_调度.md`
- `Construction_ Specification/11_AI Agent架构_MCP_CLI_Skill_Longxia总设计.md`

主要写入内容：

- BP问问理想循环
- capability-first 方向
- Tool Gateway / MCP / Longxia 分层
- 系统级 Capability Descriptor 协议
- 当前已落地能力与缺口
- 新增系统能力时不要优先补 dispatch 关键词

## 4. 当前仍未完成的关键缺口

### 4.1 跨轮槽位填充

下一步最建议做这个。

当前已经能追问缺参，但还不能稳定做到：

```text
用户：帮我归档一个工单
BP问问：请告诉我要归档的工单编号。
用户：WO-20260427-001
BP问问：自动把上一轮 capability intent + 这一轮参数合并，然后执行归档。
```

需要设计：

- 如何从上一轮 assistant metadata 读取 `missingInformationFollowup`
- 如何判断用户这轮是在补参数，而不是新任务
- 如何把补充参数合并回上一轮 `modelCapabilityPlan.args`
- 合并后重新走 capability execution plan

### 4.2 多步 tool loop

当前 capability planner 还是单工具。

理想后续：

```text
用户：查一下这个工单，然后把下一步改成联系施工队
-> plan: work_order.read + work_order.update
-> 执行 read
-> 用 read 结果补上下文
-> 执行 update
-> 汇总结果
```

### 4.3 Tool Gateway 能力还不够完整

优先补：

- `work_order.search`
- `document.search`
- `document.write_content`
- `workspace.read`
- `system_form.read`

### 4.4 通用 Longxia fallback

当前 OpenClaw / Longxia 已有最小链路，但还不是通用后备执行层。

后续目标：

```text
capability planner 认为内部 tools 做不了
-> 生成 Longxia handoff payload
-> 交给 AI宿舍 / 龙虾
-> 龙虾返回结构化结果 / 产物 / 候选写回 / 追问
-> BP问问回收并继续判断是否完成
```

## 5. 验证状态

最近验证命令：

```bash
npm --prefix frontend run typecheck
```

结果：通过。

## 6. 下次建议从这里继续

建议下一步任务：**实现跨轮槽位填充**。

切入点：

- `frontend/src/lib/bp-ask/server.ts`
  - `appendMessageToThreadForUser`
  - `mapMessage`
  - assistant message metadata 中的 `missingInformationFollowup`
- `frontend/src/lib/bp-ask/model-provider.ts`
  - 如有必要，增加一个“补参数识别 / merge args”小 planner
- `frontend/src/lib/ai-tools/gateway.ts`
  - 使用 capability descriptor 的 `inputSchema` / `plannerHints.requiredInformation` 来判断补齐状态

注意：继续保持 **能力定义优先，不继续堆关键词规则**。

## 7. 2026-04-28 接续进展：Tool Registry 已落地，开始 multi-step capability plan

### 7.1 重新确认的当前事实

本轮重新完整梳理后确认：BP问问已经不只是“设计类 MCP”，而是已经有一条可跑的 **MCP-lite / Tool Registry / Capability Planner / Tool Gateway / BP问问执行链**。

已落地入口：

- Tool Registry API：`frontend/src/app/api/ai-tools/registry/route.ts`
- Tool Registry 页面：`frontend/src/app/ai-dorm/tool-registry/page.tsx`
- AI宿舍侧边栏入口：`frontend/src/components/ai-dorm/ai-dorm-sidebar.tsx`
- Registry / executor 真源：`frontend/src/lib/ai-tools/gateway.ts`

当前 registry 暴露：

- resources：`work_order`、`document`、`openclaw`
- capabilities：`work_order.read/create/update/archive`、`work_order.writeback_draft.create`、`work_order.writeback.apply`、`document.list/read/create`、`openclaw.work_order.execute`

当前真实可跑能力：

- BP问问可真实读取、创建、修改、归档 demo 工单。
- BP问问可通过写回草案 + apply 修改 `work_orders` 白名单字段。
- BP问问可运行工单摘要 Skill、工单受理 Workflow 到确认节点。
- BP问问可通过 OpenClaw gateway 做工单侧 probe / submit 链路。
- 文档侧已有 `document.list/read/create` 的轻量工具雏形。

### 7.2 用户确认的产品理想状态

BP问问目标不是命令解析器，而是自然对话中的任务型入口：普通聊天一直自然聊；用户开始让它做事时，BP问问识别 task mode，主动检查条件和缺失信息，信息不足就追问，信息足够就优先调用系统内 Tool Gateway capabilities；内置 tools 做不了时，转写给 AI宿舍 / 龙虾，并回收结果后再转写成人能读懂的结论。

该理想状态已同步保存到项目记忆：`bpask_conversational_agent_ideal_state.md`。

### 7.3 本轮代码改动：multi-step capability planner v0

本轮完成第一版 **multi-step capability plan**，目标不是一次做完整 agent loop，而是先把“单工具选择”升级为“模型能给出线性 steps”。

改动位置：

- `frontend/src/lib/bp-ask/model-provider.ts`
- `frontend/src/lib/bp-ask/server.ts`
- `frontend/src/lib/bp-ask/shared.ts`
- `frontend/scripts/bp-ask-work-order-mutation-smoke.mjs`

新增模型类型与 planner：

- `ModelAiCapabilityStepPlan`
- `planAiCapabilityStepsWithModel()`

规划输出支持：

```json
{
  "mode": "chat|task|delegate",
  "taskTitle": "short title",
  "steps": [
    { "stepId": "step-1", "toolName": "work_order.read", "args": { "workOrderNo": "WO-..." }, "purpose": "确认工单", "requiresPreviousResult": false },
    { "stepId": "step-2", "toolName": "work_order.update", "args": { "workOrderNo": "WO-...", "nextAction": "联系施工队" }, "purpose": "更新下一步", "requiresPreviousResult": false }
  ],
  "missingInformation": [],
  "followupQuestion": "",
  "delegateTarget": "",
  "delegateReason": "",
  "confidence": 0,
  "reason": ""
}
```

server 侧新增执行 route：`capability_steps`。第一版只允许较窄触发，避免抢走所有单步修改：prompt 里需要有 `查一下 / 先查 / 先看 / 读取 / 看一下 / 然后 / 再把 / 再改` 等 read-then-write 信号，step 数量至少 2，并同时包含 `work_order.read` 和 `work_order.update` 或 `work_order.archive`。

第一版 executor 支持：

- `work_order.read`
- `work_order.update`
- `work_order.archive`

并记录：

- `modelCapabilityStepPlanner`
- `modelCapabilityStepPlan`
- `capabilityStepRuns`
- `toolRuns`
- `changedObjects`

前端 preview mode 新增：`capability_steps_result`。

### 7.4 本轮修正的方向性问题

此前本地 capability fallback 会覆盖模型 capability plan。本轮已调整为：优先使用模型 capability plan，模型没有 plan 时再走本地 fallback。这符合“能力清单 + 模型自由选择”的方向，避免又回到关键词规则工程。

### 7.5 本轮验证

已跑通过：

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run build
BPAI_BASE_URL=http://localhost:3006 npm --prefix frontend run smoke:bp-ask:work-order-mutation
```

smoke 中新增/覆盖 multi-step 场景：

```text
查一下 WO-20260401-001，然后把下一步改成联系施工队，状态推进到处理中
```

当前验证重点是：multi-step planner 能触发，route 能进入 `capability_steps_result`，metadata 有 `modelCapabilityStepPlanner`，payload 有 `modelCapabilityStepPlan` / `capabilityStepRuns`，且原有真实写回链路仍能跑通。

注意：模型对“联系施工队 / 处理中”的字段抽取仍不稳定，当前不是最终 agent loop，只是多步 plan/executor 的第一根骨架。

### 7.6 当前新的下一步建议

1. 增强 multi-step update 参数可靠性：让 read 后可以二次模型补齐 update args，或让 step executor 对 update step 做更严格的 required field 检查和追问。
2. 把 multi-step missingInformation 做成跨轮补槽：把 `missingInformation` 和 steps 一起存入 assistant metadata，下一轮用户补对象/字段后继续执行。
3. 补 `work_order.search`：这是让 BP问问从“必须知道 WO 编号”变成“能先找对象再执行”的关键 capability。
4. 再做 Longxia delegate path：`mode: delegate` 已经进 planner schema，后续需要把无法由内置 tools 完成的任务转写给 `work-order-longxia`。

### 7.8 2026-04-29 接续进展：orchestrator skeleton 已明显成型

本轮继续沿 capability-first 主线推进，重点不是再加单点功能，而是把 BP问问从“很多分支脚本”收束成更像一个真正的 conversational orchestrator。

本轮落地结构：

- `frontend/src/lib/bp-ask/server.ts`
  - `selectBpAskExecutionRoute()`：统一 route selection
  - `resolveSlotFillContinuation()` / `resolveStepSlotFillContinuation()`：跨轮 continuation 已从工单号特例走向 capability-first 通用机制
  - `executeBpAskPlan()`：开始承担统一 execution layer
  - `runCapabilityStepMachine()`：多步内部执行已提升为显式 state machine
  - `BpAskOrchestrationTerminalState`：已明确 `needs_followup / waiting_confirmation / ready_to_delegate / completed / failed`
  - `buildLongxiaHandoffPayload()`：当内置多步执行不足时，生成标准 Longxia handoff payload
  - `buildLongxiaContinuation()`：Longxia dry-run 结果不再只是转述，而是重新进入 BP问问终态判断

### 7.9 本轮实际新增的关键能力

#### 7.9.1 统一 route + execution 主骨架

当前主链已经是：

```text
appendMessageToThreadForUser
-> dispatchBpAskPrompt
-> capability planners
-> continuation merge（如有）
-> selectBpAskExecutionRoute
-> executeBpAskPlan
-> execution task/result
-> assistant message
```

这意味着 route 判定与 execute 已开始分层，后续更适合继续补 completion policy，而不是继续在主函数里堆分支。

#### 7.9.2 capability step state machine

`runCapabilityStepMachine()` 当前已承接：

- `work_order.search`
- `work_order.read`
- `work_order.update`
- `work_order.archive`
- 歧义搜索 followup
- draft/create/apply 写回链

当多步执行无法自然完成时，state machine 不再只给 `failed`，而是会根据上下文进入：

- `needs_followup`
- `ready_to_delegate`
- `completed`
- `failed`

#### 7.9.3 Longxia handoff + result re-entry

当前已经打通：

```text
capability step machine
-> ready_to_delegate
-> buildLongxiaHandoffPayload
-> runLongxiaAgent(dry_run)
-> buildLongxiaContinuation
-> terminalState / preview / insight / assistantText 更新
```

Longxia 当前仍是 dry-run，但已经不再是“只有 workflow 才能用的孤立执行器”，而是开始成为 BP问问统一 fallback path 的一部分。

#### 7.9.4 Longxia 输出语义映射

Longxia dry-run 输出里的：

- `requiredConfirmations`
- `writebackCandidates`

已开始翻译到 BP问问自己的语义：

- `confirmationRequests`
- `confirmationEvaluation`
- `writebackDrafts`

这一步的意义是：Longxia 回来的结果不只是展示给用户看，而是开始被 BP问问自己的编排系统消费。

### 7.10 当前真实边界（非常重要）

虽然主骨架已经明显成型，但当前仍有边界：

- Longxia 仍以 `dry_run` 为主，尚未形成真实 delegated execution loop。
- Longxia 的 confirmation / writeback 语义目前已接入 preview/payload，但还没有完全接入现有真实写回主链的落库与 apply 流。
- capability planner 虽然已有 single-step + multi-step + state machine，但还没有形成“持续自动循环直到任务满意完成”的统一 completion policy。
- 当前 Longxia fallback 仍主要服务工单域，尚未推广到更多业务域。

### 7.11 当前新的下一步建议

下一步最建议做：**把 Longxia 映射出来的 confirmation/writeback 继续接入现有 BP问问真实确认与写回主链**。

目标应该是：

```text
Longxia dry-run 返回
-> BP问问映射 confirmationRequests / writebackDrafts
-> 进入现有确认态 / 草案审阅态
-> 审阅后决定是否正式写回
-> BP问问最终总结
```

这样才能真正形成你要的闭环：

```text
BP问问自己做
-> 做不了就交给龙虾
-> 龙虾返回结构化结果
-> BP问问继续推进确认 / 写回 / 汇总
```

## 8. Docker / 本地服务重启备忘

当前开发 compose 文件是：`docker-compose.dev.yml`。

核心服务：

- `postgres`：PostGIS/Postgres，容器名 `bpai-postgres`，宿主端口默认 `5433`
- `frontend-dev`：Next dev server，容器名 `bpai-front-dev`，宿主端口默认 `3001`
- `onlyoffice-documentserver`：OnlyOffice，宿主端口 `8080`
- `openclaw-*`：OpenClaw gateway 系列，挂在 `openclaw` profile 下，默认不随普通 up 启动

常用命令：

```bash
# 查看当前容器状态
docker compose -f docker-compose.dev.yml ps

# 启动/重启基础开发环境：Postgres + frontend-dev + OnlyOffice
docker compose -f docker-compose.dev.yml up -d postgres onlyoffice-documentserver frontend-dev

# 看前端日志
docker compose -f docker-compose.dev.yml logs -f frontend-dev

# 只重启前端 dev 容器
docker compose -f docker-compose.dev.yml restart frontend-dev

# 重新构建/重建前端 dev 容器（会重新 npm install、migrate、dev）
docker compose -f docker-compose.dev.yml up -d --force-recreate frontend-dev

# 停掉基础开发环境，但保留数据库 volume
docker compose -f docker-compose.dev.yml down

# 危险：连数据库 volume 一起删掉，demo 数据会清空
docker compose -f docker-compose.dev.yml down -v
```

如果要带 OpenClaw：

```bash
# 启动基础环境 + openclaw profile
docker compose -f docker-compose.dev.yml --profile openclaw up -d

# 查看 OpenClaw 日志
docker compose -f docker-compose.dev.yml logs -f openclaw-gateway
```

BP问问相关 smoke 默认打 `http://localhost:3001`：

```bash
npm --prefix frontend run smoke:bp-ask:work-order-mutation
npm --prefix frontend run smoke:ai-tools:registry
```

如果临时用了别的端口：

```bash
BPAI_BASE_URL=http://localhost:3006 npm --prefix frontend run smoke:bp-ask:work-order-mutation
```

