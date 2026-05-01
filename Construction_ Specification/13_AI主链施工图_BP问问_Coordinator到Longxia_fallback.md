# 13｜AI 主链施工图：从 BP问问 Coordinator 到 Longxia fallback

> 信息来源范围：`frontend/src/lib/bp-ask/server.ts`、`frontend/src/lib/bp-ask/model-provider.ts`、`frontend/src/lib/bp-ask/dispatch.ts`、`frontend/src/lib/bp-ask/shared.ts`、`frontend/src/lib/ai-tools/gateway.ts`、`frontend/src/lib/ai-dorm/longxia-adapter.ts`、`frontend/src/lib/ai-dorm/workflow-runner.ts`、`frontend/src/lib/ai-dorm/server.ts`、`Construction_ Specification/04_AI链路_BPAsk_记忆_调度.md`、`11_AI Agent架构_MCP_CLI_Skill_Longxia总设计.md`、`12_AI_Agent理想状态缺口清单_List.md`。更新时间：2026-04-29。
>
> 本文不是理想蓝图，也不是缺口清单，而是**接下来几轮开发默认遵循的施工图**。目的只有一个：在“东西很多而且很乱”的状态下，把 BPAI 的 AI 模块收束到一条压倒性的默认主链上。

## 1. 当前施工总判断

当前 BPAI 的问题不是“没有能力”，而是“并行路径太多”。

已经同时存在：

- 普通聊天路径
- dispatch 规则粗分路径
- model capability 单工具路径
- model capability 多步路径
- 本地 work-order tool planner fallback
- 本地 step planner fallback
- direct tool / skill / workflow / Longxia 并列选路
- AI宿舍 blueprint 展示层

这导致两个后果：

1. 用户体验上，BP问问还没有形成压倒性的默认行为。
2. 开发体验上，每次想扩能力都会犹豫“应该加到哪一层”。

所以接下来不优先横向扩很多新能力，而是先纵向打穿一条唯一主链。

## 2. 接下来唯一默认主链

后续所有 AI 模块开发，默认以这条链为核心：

```text
用户自然聊天
-> BP问问判断是否进入 task mode
-> 若不是任务：继续普通聊天
-> 若是任务：抽取目标、对象、约束、成功标准
-> 若信息不足：生成缺参 followup 并等待用户补充
-> 若信息足够：优先生成 capability step plan
-> 逐步执行系统内 capability / tool
-> 每步后统一评估：完成 / 继续 / 追问 / 等确认 / 转 Longxia
-> 内置能力不足时，生成标准 Longxia handoff payload
-> Longxia 返回结构化结果 / 产物 / 候选写回 / 追问
-> BP问问把结果重新纳入上下文，继续判断是否完成
-> 向用户输出自然语言总结、变更对象、待确认事项、下一步
```

一句话：

> **BP问问 是唯一前台入口；Tool / Skill / Workflow / Longxia 都是它的后场执行手段。**

## 3. 当前应收束到哪里

### 3.1 以 `bp-ask/server.ts` 为 AI 主链真源

当前最接近目标状态的 runtime 已经在：

- `frontend/src/lib/bp-ask/server.ts`

尤其是以下段落，后续都应围绕它们收束：

- `resolveSlotFillContinuation`：补参接续
- `resolveStepSlotFillContinuation`：多步补参接续
- `selectBpAskExecutionRoute`：当前总选路口
- `executeBpAskPlan`：当前总执行口
- `runCapabilityStepMachine`：当前多步执行器
- `buildLongxiaHandoffPayload` / `buildLongxiaContinuation`：Longxia 后备执行接入点

原则：

- 新增任务型能力时，优先想“怎么进 `capability step plan`”。
- 不再优先想“要不要加一个新的 dispatch 关键词分支”。
- 不再优先想“是不是再单独补一个平行 workflow 页面功能”。

### 3.2 以 `capability step plan` 作为默认任务执行形态

当前系统还保留多条平行顶层路径：

- `direct_tool`
- `skill`
- `workflow`
- `writeback_draft`
- `capability_tool`
- `capability_steps`
- `dispatch_plan`

施工目标不是立即删除这些分支，而是逐步改变心智模型：

```text
不是：顶层先决定 direct_tool / skill / workflow / longxia
而是：
先生成一个 step plan
-> step 内部再决定每一步调用 tool / skill / workflow / longxia
```

这意味着：

- 单工具任务只是 `steps.length = 1` 的特例。
- 复杂任务优先进入 step machine，而不是先把 workflow / skill 当平行宇宙。
- Longxia 不是和 tool 平级的第一反应，而是 step 执行中的 fallback executor。

## 4. 施工优先级

## 4.1 P0：先把 BP问问 任务型对话主链做成唯一核心

这是接下来最重要的阶段。

### 目标

让 BP问问稳定表现为：

- 普通聊天自然继续
- 感知用户何时“开始让它做事”
- 缺信息时明确追问缺什么
- 信息足够时优先进入 capability step plan
- 能内部完成就内部完成
- 做不完就转 Longxia
- Longxia 返回后继续推进而不是只转述一次

### 具体改造点

#### P0-1｜降低 `dispatch.ts` 的决策权重

涉及：

- `frontend/src/lib/bp-ask/dispatch.ts`

当前定位应逐步收敛为：

- 判断是否进入 task mode
- 提供粗粒度 domain / refs / constraints / risk hints
- 提供普通聊天 fallback

不再继续扩张为：

- 复杂执行路径决策器
- 无限关键词规则库
- 各业务域能力分发主控器

后续原则：

> dispatch 负责“看懂大概是什么”，step planner 负责“具体怎么做”。

#### P0-2｜让 `ModelAiCapabilityStepPlan` 成为任务默认入口

涉及：

- `frontend/src/lib/bp-ask/model-provider.ts`
- `frontend/src/lib/bp-ask/server.ts`

目标：

- 只要进入 task mode，优先尝试多步 capability 规划。
- 单工具规划只作为 step plan 的降级或兼容分支。
- 本地 work-order planner 与本地 step planner 继续保留，但明确作为 fallback，不再是默认心智。

建议落点：

- 强化 `planAiCapabilityStepsWithModel`
- 在 `selectBpAskExecutionRoute` 中进一步提高 `capability_steps` 的优先级
- 把 direct tool / skill / workflow 看成 step 的执行类型，而不是顶层产品模式

#### P0-3｜把 slot filling 做成第一公民

涉及：

- `frontend/src/lib/bp-ask/server.ts`
  - `buildCapabilityMissingInformationFollowup`
  - `buildCapabilityStepMissingInformationFollowup`
  - `resolveSlotFillContinuation`
  - `resolveStepSlotFillContinuation`

这是最关键的体验工程。

目标体验：

```text
用户：帮我归档一个工单
BP问问：请告诉我要归档的工单编号。
用户：WO-20260427-001
BP问问：自动接着执行归档链路，而不是重新从头猜。
```

当前阶段至少要补齐：

- `workOrderNo`
- `query`
- `title`
- `documentId`
- `assetId`
- 候选对象选择（序号 / 工单号 / 再描述一句）

随后要继续补：

- 更新字段值本身
- 多字段补齐
- 判断当前用户回复是在“补参数”还是“开启新任务”

原则：

> 用户补一句，系统就应该像人一样接上，不要把每轮都当全新请求。

## 4.2 P1：把 `runCapabilityStepMachine` 升级成真正 agent loop

涉及：

- `frontend/src/lib/bp-ask/server.ts`

当前它已经是第一版多步执行器，但仍偏“线性 step runner”。

下一阶段目标是把它升级为：

```text
step 执行
-> 读取结果
-> 判断目标是否完成
-> 判断是否缺信息
-> 判断是否需要确认
-> 判断是否需要 Longxia fallback
-> 再决定下一步
```

### P1-1｜给每一步补统一 post-step evaluator

当前每步执行后更多是：

- 成功继续
- 失败 break
- 特定情况 followup

后续要统一成 evaluator：

- `completed`
- `needs_followup`
- `waiting_confirmation`
- `ready_to_delegate`
- `failed`
- `continue_internal`

这样 BP问问 才真正像 agent，而不是串行脚本。

### P1-2｜扩大“系统内足够做完”的 capability 集

优先补的不是 MCP，而是 BPAI 自己真正常用的内置能力：

- `document.search`
- `document.write_content`
- `workspace.read`
- `system_form.read`

原则：

- 用户最常要求的事情，优先让 BP问问能在系统内直接完成。
- 只有系统内确实做不了时，才进入 Longxia。

### P1-3｜让 step 结果真正成为下一步上下文

当前要继续强化读取与复用：

- `toolRuns`
- `changedObjects`
- `artifacts`
- `candidates`
- `followupQuestions`
- 上一步返回对象本身

目标例子：

```text
先搜索工单
-> 选中唯一候选
-> 读取工单
-> 依据读取结果补全更新字段
-> 生成写回草案
-> 等确认 / 正式写回
```

## 4.3 P2：把 Longxia 从 dry-run 外挂升级成标准 fallback executor

涉及：

- `frontend/src/lib/ai-dorm/longxia-adapter.ts`
- `frontend/src/lib/bp-ask/server.ts`
- `frontend/src/lib/ai-dorm/openclaw-gateway.ts`

当前判断：

- Longxia 已经接到 BP问问 主链上。
- 但当前更像“结构化 dry-run 承接器”。
- 还不是一个成熟的后备执行层。

### P2-1｜先只做透 `work-order-longxia`

不要急着同时做很多龙虾。

先把 `work-order-longxia` 做成标准样板：

- 标准 handoff payload
- 标准 output payload
- 明确 `needs_followup / waiting_confirmation / completed / failed`
- 返回 artifacts / changedObjects / writebackCandidates
- dry-run 与 submit 语义清楚分开

### P2-2｜Longxia 永远是后场执行体，不是新的聊天前台

后续任何设计都应坚持：

- 用户只和 BP问问对话
- Longxia 不直接变成新的前台入口
- Longxia 的结果必须回到 BP问问上下文，由 BP问问继续解释和推进

### P2-3｜Longxia fallback 的触发条件要明确

建议后续统一为：

- 系统内 capability 缺失
- 范围太大
- 步骤复杂，且已有 Longxia 具备该域专长
- 需要 OpenClaw / sidecar / 浏览器执行能力

不建议：

- 因为 planner 不稳定就过早把任务甩给 Longxia
- 把所有复杂任务默认外包，导致 BP问问 变薄

## 4.4 P3：最后再做 AI宿舍 registry / 平台治理

涉及：

- `frontend/src/lib/ai-dorm/server.ts`
- 后续 registry / manifest 持久化层

当前 AI宿舍 的主要问题不是“没有页面”，而是：

- `AGENT_BLUEPRINTS`
- `SKILL_BLUEPRINTS`
- `WORKFLOW_BLUEPRINTS`

仍是代码常量样板。

所以后续平台化方向应放在 BP问问 主链收束后进行。

届时再推进：

- agent manifest schema
- skill manifest schema
- workflow manifest schema
- enable / disable
- validate / test / replay
- agent/tool run 日志
- 持久化 registry
- CLI 治理入口

原则：

> 先把主链跑顺，再把后场治理做漂亮。

## 5. 当前明确“不优先做”的事

为了避免继续发散，当前阶段明确不优先做以下事项：

### 5.1 不优先扩更多 AI宿舍页面表达

原因：当前瓶颈在 runtime 主链，不在页面数量。

### 5.2 不优先做完整 MCP Registry

原因：内置 capability 主链尚未完全收束，过早做 MCP 会继续增加并行路径。

### 5.3 不优先继续强化旧 dispatch 关键词规则

原因：这会加剧架构分叉。

后续新增能力时，优先问：

- 能不能注册成 capability descriptor？
- 能不能进入 step plan？
- 能不能通过 step machine 执行？

### 5.4 不优先同时做很多新 Longxia / 新 Agent

原因：当前更缺“标准执行协议”，不是缺更多名义上的 Agent。

## 6. 建议施工顺序

## 6.1 第一轮施工

目标：**收束 BP问问 顶层任务主链。**

建议动作：

1. 明确 `capability_steps` 为默认任务执行心智。
2. 继续下调 `dispatch.ts` 的执行决策职责。
3. 梳理 `selectBpAskExecutionRoute` 的优先级顺序，并写注释说明每个分支属于主路径还是 fallback。
4. 给 `appendMessageToThreadForUser` 的 planner / fallback / route selection 主段补结构化注释，防止后续继续发散。

验收问题：

- 新任务进入时，开发者是否能明确知道应该先改哪一层？
- 同一个任务是否还能同时走很多平行路线？

## 6.2 第二轮施工

目标：**把补参接续体验做稳。**

建议动作：

1. 扩展 slot fill 支持的字段种类。
2. 统一候选对象选择协议。
3. 明确补参回复与新任务回复的判定规则。
4. 把 followup state 的来源与消费路径稳定写入 metadata / execution payload。

验收问题：

- 用户补一句后，系统是否能自动继续，而不是重新从头判断？
- 歧义对象是否能通过序号或工单号完成接续？

## 6.3 第三轮施工

目标：**把 step machine 升级成 loop。**

建议动作：

1. 补 post-step evaluator。
2. 扩更多常用内置 capability。
3. 强化对上一步结果的结构化复用。
4. 收敛 terminal state 语义。

验收问题：

- 多步任务是否能在系统内连续做完更多步骤？
- BP问问 是否能更稳定地判断“继续内部做”还是“转 Longxia”？

## 6.4 第四轮施工

目标：**把 Longxia fallback 做成标准后备执行层。**

建议动作：

1. 标准化 handoff / continuation payload。
2. 补完整的 dry-run / submit / confirmation 边界。
3. 让 Longxia 结果真正回流到 BP问问后续规划。
4. 先做透 `work-order-longxia`，再复制模式到其他域。

验收问题：

- Longxia 是否还是外挂预览器，还是已经变成标准 fallback executor？
- Longxia 的结果是否能驱动 BP问问继续推进而不是只展示一次？

## 7. 文件级施工地图

### 7.1 第一优先文件

#### `frontend/src/lib/bp-ask/server.ts`

这是当前 AI 主链真源。

接下来优先改这里：

- planner 入口收束
- slot filling
- route selection
- step machine
- Longxia handoff / continuation
- execution task/result 主链拼装

#### `frontend/src/lib/bp-ask/model-provider.ts`

这里负责：

- capability planner
- capability step planner
- 补参辅助规划
- patch refine

后续重点是提高 step planning 的稳定性和输出约束。

#### `frontend/src/lib/ai-tools/gateway.ts`

这里负责：

- capability descriptor 真源
- tool execute 真源
- 风险级别 / input schema / plannerHints

后续新增系统能力，优先加到这里，而不是先加 dispatch 关键词。

### 7.2 第二优先文件

#### `frontend/src/lib/ai-dorm/longxia-adapter.ts`

这里负责 Longxia 标准输入输出协议，应从单一 dry-run 样板逐步升级为标准 fallback executor。

#### `frontend/src/lib/ai-dorm/openclaw-gateway.ts`

这里负责 OpenClaw sidecar / gateway 下发边界。后续重点不是扩更多入口，而是保证 fallback 执行的安全边界、状态回执和结果回流。

### 7.3 当前暂缓平台化的文件

#### `frontend/src/lib/ai-dorm/server.ts`

当前更多是 blueprint / 展示聚合层。

后续会成为 registry / platform 层，但当前阶段不应喧宾夺主，不要让平台治理先于 BP问问 runtime 主链。

## 8. 当前阶段的验收标准

只有当下面四件事越来越稳定，才说明 AI 主链真的在变好：

1. 用户随口聊天时，BP问问不会误入复杂执行。
2. 用户一旦开始要求做事，BP问问能自然追问缺失条件。
3. 系统内 tools 能做的事，BP问问会优先自己做完更多步骤。
4. 做不完时，Longxia 能被标准化接管，结果再回流到 BP问问继续推进。

## 9. 一句施工原则

后续每次想加 AI 能力时，先问这四句：

1. 这是不是应该先定义为 capability descriptor？
2. 这是不是应该先进入 capability step plan？
3. 这是不是应该优先由 BP问问 在系统内完成？
4. 只有真的做不了时，才该不该交给 Longxia？

如果这四句还没问，就先不要去补新的平行分支。
