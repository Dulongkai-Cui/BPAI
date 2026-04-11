# AI 链路：BP Ask、记忆与调度

> 信息来源范围：`frontend/src/app/bp-ask/page.tsx`、`frontend/src/components/bp-ask/**`、`frontend/src/app/api/bp-ask/**`、`frontend/src/lib/bp-ask/**`、`frontend/src/lib/db/schema.ts`、`frontend/.env.local.example`。更新时间：2026-04-11。
>
> 目标：当你要扩展 BP Ask、做记忆、调度、模型适配、AI 任务写入时，先查本页。

## 1. 当前 AI 能力边界

当前代码中真正落地的 AI 产品入口是 **BP Ask / BP问问**。

已落地事实（2026-04-12 更新）：
- 有页面入口：`/bp-ask`
- 有会话线程 API
- 有消息追加 API
- 有调度预判 API
- 有历史线程归档/删除 API
- 有 Drizzle 表承载线程、消息、摘要、记忆事实、执行任务、执行结果
- 有任务筛网：没有明确任务信号时默认普通聊天，明确任务才进入调度链
- 有规则型调度分类器
- 有 Kimi/Moonshot 适配：结构化 dispatch 分类增强 + 普通聊天生成
- 有模拟执行返回层：`DispatchExecutionPreview`
- 有前端渐进式任务呈现：普通聊天不显示调度细节，任务细节默认折叠
- 有发送体验优化：用户消息先即时上屏，assistant 独立显示加载动画
- 有 31 条 dispatch 回归样例与 BP Ask 主链 smoke

当前边界：
- `frontend/package.json` 未见 Anthropic/OpenAI SDK 正式依赖
- `frontend/.env.local.example` 预留的是 `KIMI_API_KEY` 与 `KIMI_BASE_URL`
- `dispatch.ts` 引入 `@/lib/bp-ask/kimi`，但当前 Glob 结果未列出 `frontend/src/lib/bp-ask/kimi.ts`；若后续要启用模型增强，先核验该文件是否在当前分支实际存在或是否未提交
- “AI 宿舍 / 龙虾 / OpenClaw / AI 员工”主要来自 `AI_Dev_Memo/Project_skeleton/**` 的规划文档，不应直接当成当前已实现代码

## 2. 前端入口

### 2.1 页面

- `frontend/src/app/bp-ask/page.tsx`

当前极薄：

```text
BpAskPage
-> <BpAskShell />
```

### 2.2 组件

| 组件 | 路径 | 职责 |
| --- | --- | --- |
| `BpAskShell` | `frontend/src/components/bp-ask/bp-ask-shell.tsx` | 会话列表、当前线程、创建/删除线程、发送状态、pending user message 即时展示、API 调用 |
| `BpAskSidebar` | `frontend/src/components/bp-ask/bp-ask-sidebar.tsx` | 线程列表、新建线程、删除线程 |
| `BpAskWorkbench` | `frontend/src/components/bp-ask/bp-ask-workbench.tsx` | 消息展示、输入框、assistant 加载动画、折叠任务处理细节 |
| `BpAskTopbar` | `frontend/src/components/bp-ask/bp-ask-topbar.tsx` | 顶部区域/导航 |

## 3. 客户端调用链

`BpAskShell` 是当前前端主控壳层。

### 3.1 初始化线程列表

```text
BpAskShell.useEffect(loadThreads)
-> GET /api/bp-ask/threads
-> setThreads
-> setActiveThreadId
```

### 3.2 切换线程

```text
activeThreadId 变化
-> GET /api/bp-ask/threads/[activeThreadId]
-> setActiveThread(result.thread)
```

### 3.3 删除线程

```text
BpAskSidebar 删除按钮
-> DELETE /api/bp-ask/threads/[threadId]
-> archiveConversationThreadForUser
-> conversation_threads.status = archived
-> 列表层只展示 active 线程
```

### 3.4 新建线程

```text
handleCreateThread
-> POST /api/bp-ask/threads
-> syncThreadSummary
-> setActiveThread / setActiveThreadId
```

### 3.4 发送消息

```text
handleSubmit(prompt)
-> 若没有 activeThreadId：先 POST /api/bp-ask/threads
-> 立即写入 pendingUserMessage 到前端临时态（用户消息先上屏）
-> POST /api/bp-ask/threads/[threadId]/messages { prompt }
-> assistant 独立显示加载动画
-> syncThreadSummary
-> setActiveThread(result.thread)
-> 清空 pendingUserMessage
```

## 4. API 层

### 4.1 `GET /api/bp-ask/threads`

- 路由：`frontend/src/app/api/bp-ask/threads/route.ts`
- 鉴权：`getCurrentUser`
- 下游：`listConversationThreadsForUser`
- 输出：`{ threads }`

### 4.2 `POST /api/bp-ask/threads`

- 输入：`{ title? }`
- 下游：`createConversationThreadForUser`
- 输出：`{ summary, thread }`

### 4.3 `GET /api/bp-ask/threads/[threadId]`

- 路由：`frontend/src/app/api/bp-ask/threads/[threadId]/route.ts`
- 下游：`getConversationThreadDetailForUser`
- 输出：`{ thread }`
- 错误：`THREAD_NOT_FOUND -> 404`

### 4.4 `DELETE /api/bp-ask/threads/[threadId]`

- 路由：`frontend/src/app/api/bp-ask/threads/[threadId]/route.ts`
- 下游：`archiveConversationThreadForUser`
- 输出：`{ ok: true }`
- 行为：归档线程，不做物理删除
- 影响：线程列表只返回 `status = active` 的线程

### 4.5 `POST /api/bp-ask/threads/[threadId]/messages`

- 路由：`frontend/src/app/api/bp-ask/threads/[threadId]/messages/route.ts`
- 输入：`{ prompt }`
- 下游：`appendMessageToThreadForUser`
- 输出：更新后的 thread 与 summary
- 错误：
  - 未登录：401
  - 无 prompt：400
  - 线程不存在：404

### 4.6 `POST /api/bp-ask/dispatch`

- 路由：`frontend/src/app/api/bp-ask/dispatch/route.ts`
- 输入：`{ prompt | message, threadId? }`
- 下游：`previewDispatchForUser`
- 作用：调度预判/预览

## 5. 服务层与核心函数

### 5.1 `frontend/src/lib/bp-ask/server.ts`

职责：
- 创建/列出/读取会话线程
- 追加用户消息
- 写 assistant 消息
- 构建 rolling summary
- 读取最近 memory facts
- 写 memory facts
- 写 execution tasks / results
- 把调度结果组装回前端需要的 thread detail 和 summary

关键内部函数/逻辑：

| 函数/逻辑 | 作用 |
| --- | --- |
| `buildId` | 生成带前缀 ID |
| `buildStableId` | 用 sha1 生成稳定 ID，rolling summary 等可用 |
| `estimateTokenCount` | 基于文本长度粗估 token |
| `buildRollingSummary` | 从最近 12 条消息与 insight 拼滚动摘要 |
| `getThreadRowForUser` | 校验线程归属 |
| `getMessagesForThread` | 按 sequence 读取消息 |
| `getLatestRollingSummary` | 读取 rolling summary |
| `getRecentMemoryFactsForUser` | 取当前 user/thread 相关记忆 |
| `replaceRollingSummary` | 删除旧 rolling summary 并写新摘要 |
| `archiveConversationThreadForUser` | 将线程状态标记为 archived，供历史删除使用 |
| `upsertMemoryFact` | 按 scope/key upsert 记忆事实 |

### 5.2 `frontend/src/lib/bp-ask/dispatch.ts`

职责：
- 先把用户输入过“任务筛网”
- 没有明确任务信号时，按普通聊天处理
- 明确任务时，再做 dispatch decision
- 抽取目标对象、约束、时间范围、文件名、工单号、地名等
- 判断 primary intent / target domain / execution mode / executor / priority
- 生成模拟执行预案 `DispatchExecutionPreview`
- 组装 assistantText 与 insight
- 可选调用 Kimi 分类增强
- 在普通聊天 / help / 轻量上下文问题上，可选调用 Kimi 生成自然回复

关键输入类型：

```text
DispatchContext = {
  user,
  prompt,
  rollingSummary,
  recentMessages,
  memoryFacts
}
```

关键输出类型：

```text
DispatchResult = {
  decision,
  assistantText,
  insight
}
```

### 5.3 `frontend/src/lib/bp-ask/intents.ts`

职责：
- 定义调度分类枚举/标签
- 包括 `PrimaryIntent`、`TargetDomain`、`ExecutionMode`、`DispatchPriority`、`SuggestedExecutor` 等类型与 label

### 5.5 `frontend/src/lib/bp-ask/kimi.ts`

职责：
- 封装 Kimi OpenAI-compatible `/chat/completions` 调用
- 提供两类入口：
  - `classifyWithKimi`：结构化三分类增强（intent / domain / mode）
  - `generateChatReplyWithKimi`：普通聊天自然回复
- 固定 BPAI / BP问问 system prompt
- 失败时回退到本地规则或模板回复

## 5.6 当前任务筛网原则

BP Ask 当前不是把所有输入都默认当任务，而是先过“任务筛网”：

- 若输入只是寒暄、身份询问、能力询问等轻量对话：
  - `chat_general` / `help_meta`
  - `bp_ask`
  - `answer_directly`
- 若输入明确有任务信号（查、总结、创建、更新、分配、删除、委托等）
  或明确业务对象（工单、文档、表单、合作空间、工程队等）：
  - 进入 dispatch
- 若任务意图明确但关键对象缺失：
  - 进入 `clarification / ask_followup`

这一层的目的，是把“普通聊天”和“任务调度”区分开，而不是让 BP问问默认进入任务状态机。

## 6. 数据表生命周期

### 6.1 线程与消息

```text
conversation_threads
└─ conversation_messages
```

- `conversation_threads`：每个 BP Ask 会话线程
- `conversation_messages`：线程内消息，使用 `threadId + sequence` 保证顺序唯一

### 6.2 滚动摘要

```text
conversation_messages 最近 12 条
-> buildRollingSummary
-> conversation_summaries(kind='rolling')
```

当前摘要内容由以下部分拼装：
- 当前用户目标
- 分析结论
- 识别出的重点
- 下一步建议

### 6.3 记忆事实

```text
dispatch / insight / 用户消息上下文
-> upsertMemoryFact
-> memory_facts(scopeKind, scopeId, factKey)
```

`memory_facts` 支持 scope：
- `user`
- `thread`
- `workspace`
- `collaboration_space`
- `system_form`
- `document`
- `work_order`

当前读取逻辑重点取：
- 当前 thread 的 facts
- 当前 user scope facts

### 6.4 执行任务与结果

```text
用户 prompt
-> dispatchBpAskPrompt
-> execution_tasks
-> execution_results
```

`execution_tasks` 保存：
- `executorKind`
- `primaryIntent`
- `targetDomain`
- `executionMode`
- `goal`
- `needsMemory`
- `needsTools`
- `requiresWrite`
- `requiresConfirmation`
- `targetRefs`
- `constraints`

`execution_results` 保存：
- `summaryText`
- `responseText`
- `structuredPayload`
  - `decision`
  - `insight`
  - `executionPreview`

### 6.5 模拟执行预案

当前 BP Ask 已有 `DispatchExecutionPreview`，用于在真实工具链尚未接通时，先把“下一步要怎么做”以受控方式表达出来。

它当前会根据不同 executionMode 生成不同预案，例如：
- `ask_followup`：等待补充信息
- `retrieve_then_answer` / `retrieve_and_summarize`：只读读取上下文
- `write_restricted`：生成受控写入预案，等待确认
- `delegate_to_longxia`：生成执行器委托草案

这层预案会同时出现在：
- assistant message metadata
- `execution_results.structuredPayload`
- 前端工作台的折叠“查看处理细节”区域

## 7. 一次发送消息的完整链路

```text
用户在 /bp-ask 输入 prompt
-> BpAskShell.handleSubmit
-> POST /api/bp-ask/threads/[threadId]/messages
-> appendMessageToThreadForUser(user, threadId, prompt)
-> getThreadRowForUser 校验线程归属
-> 写 user message 到 conversation_messages
-> 读取 recentMessages / rollingSummary / memoryFacts
-> dispatchBpAskPrompt({ user, prompt, rollingSummary, recentMessages, memoryFacts })
-> 写 execution_tasks
-> 写 execution_results
-> 写 assistant message 到 conversation_messages
-> replaceRollingSummary
-> upsertMemoryFact（按调度结果/上下文）
-> 返回 thread detail + summary
-> BpAskShell 更新 activeThread 与 thread list
```

## 8. Dispatch 规则侧重点

`dispatch.ts` 当前是规则分类为主，能识别：

| 识别维度 | 例子 |
| --- | --- |
| 目标空间 | 桥梁送审联动区、设计联审区、合作空间、文档广场等 |
| 系统表单 | 工单台账、材料缺项表、仓库材料总表、施工队状态表等 |
| 用户名 | Dulongkai Cui、李工、周宇、林敏 |
| 地区 | 长沙、芙蓉区、望城区、雨花区等 |
| 文件 | `.doc/.docx/.xls/.xlsx/.ppt/.pptx/.pdf/.dwg/.dxf` |
| 工单号 | `WO/PG/GD/WK` 前缀或长数字 |
| 写入约束 | “只读/不要改/先别回写” vs “正式回写/直接改系统” |
| 紧急度 | “紧急/立刻/马上/今天必须”等 |
| 业务实体 | 工程队、施工队、班组、CAD、地图、点位等 |

## 9. 模型与环境变量

当前 env 预留位：`frontend/.env.local.example`

```text
KIMI_API_KEY=your-kimi-api-key
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODEL=kimi-k2.5
```

当前 `frontend/package.json` 未见 `@anthropic-ai/sdk`、`openai`、`langchain` 等正式依赖，当前模型调用通过兼容 OpenAI chat/completions 的 HTTP 封装完成。

`kimi.ts` 当前有两类能力：

```text
classifyWithKimi -> 结构化 dispatch 分类增强
generateChatReplyWithKimi -> 普通聊天自然回复
```

普通聊天侧当前已固定 BP问问产品 prompt，要求：
- 身份固定为 BPAI 平台里的 BP问问
- 语气专业、认真、克制
- 熟悉电信工程、工单、合作空间、系统表单、文档资料、图纸交付、工程队协同
- 不得自称百融云创、ChatGPT、OpenAI 或通用万能 AI 助手

实施建议：
- 如果要启用 Kimi：确保 Docker / 本地运行环境中存在有效 `KIMI_API_KEY`
- 如果要改用 Claude/Anthropic：需要新增独立生成层与分类层封装，并补 env、失败降级策略
- 不要把 `AI_Dev_Memo` 中的 OpenClaw/龙虾能力直接写成已接通，除非代码中已有真实适配器

## 10. 与其他业务域的潜在连接点

当前 BP Ask 的 schema 已经为跨业务 scope 预留：

| scope | 可连接业务 |
| --- | --- |
| `workspace` | 工作区/合作空间 |
| `collaboration_space` | 合作空间业务上下文 |
| `system_form` | 系统表单 |
| `document` | 文档资产 |
| `work_order` | 工单 |

但当前要判断某个业务域是否已被真实调用，必须检查：
- `bp-ask/server.ts`
- `bp-ask/dispatch.ts`
- 对应业务 service 是否被 import
- `execution_tasks` 是否只是记录“计划/预判”，还是已经执行了真实写入

## 11. 扩展 BP Ask 的检查清单

### 新增一个意图类型
- 改 `frontend/src/lib/bp-ask/intents.ts`
- 改 `frontend/src/lib/bp-ask/dispatch.ts` 的 scoring / labels / assistant text
- 检查 `execution_tasks.primaryIntent` 记录值是否需要迁移或兼容
- 检查前端 `InsightBlock` 展示是否能承载

### 新增一个业务域目标
- 在 `dispatch.ts` 增加 target domain 识别
- 决定是否需要 memory scope
- 决定是否写 execution task/result
- 如需真实执行，显式调用对应业务 service，而不是只记录 task

### 新增模型调用
- 增加 env 示例
- 增加 server-only 调用封装
- 增加超时/失败降级策略
- 确保不把密钥暴露到 `NEXT_PUBLIC_` 变量
- 若使用 Claude API，应单独设计 prompt caching 与消息压缩策略

### 新增记忆类型
- 优先复用 `memory_facts`
- 确认 `scopeKind + scopeId + factKey` 唯一性不会互相覆盖
- 决定事实是否来自用户明确输入、模型推断还是业务系统
- 对模型推断类事实降低 confidence 或加 metadata 标注
