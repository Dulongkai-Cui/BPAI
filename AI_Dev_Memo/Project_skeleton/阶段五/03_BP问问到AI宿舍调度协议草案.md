# BP问问到 AI宿舍 调度协议草案

## 1. 为什么需要协议

当前 BP问问已经能把用户输入转成：

- `execution_tasks`
- `execution_results`

这两张表已经天然形成 BP问问 -> AI宿舍 的数据桥梁。

阶段五需要做的不是另起炉灶，而是：

> **围绕现有 execution task/result，把调度协议说清楚。**

---

## 2. BP问问输出给 AI宿舍的最小任务对象

建议以 `execution_tasks` 为核心，不单独再造新对象。

当前关键字段：

- `id`
- `userId`
- `threadId`
- `workspaceId`
- `sourceMessageId`
- `status`
- `executorKind`
- `primaryIntent`
- `targetDomain`
- `executionMode`
- `goal`
- `confidence`
- `needsMemory`
- `needsTools`
- `requiresWrite`
- `requiresConfirmation`
- `targetRefs`
- `constraints`
- `metadata`

其中最重要的是：

### 2.1 `goal`
用户原始目标。

### 2.2 `targetRefs`
对象解析结果，例如：
- workspaceName
- formName
- fileName
- workOrderNo
- assigneeName
- areaName

### 2.3 `constraints`
任务约束，例如：
- timeRange
- limit
- scope
- writePolicy
- urgency

### 2.4 `metadata`
当前已经能承载：
- `expectedOutput`
- `reason`
- `priority`
- `toolHints`
- `memoryScopes`
- `followupQuestion`

AI宿舍第一版可以直接消费这些字段。

---

## 3. AI宿舍返回给 BP问问的最小结果对象

建议以 `execution_results` 为核心。

关键字段：

- `taskId`
- `status`
- `summaryText`
- `responseText`
- `structuredPayload`

其中：

### 3.1 `summaryText`
给 BP问问做简短结果整合。

### 3.2 `responseText`
未来若后场有更完整自然语言结果，可直接供 BP问问引用或改写。

### 3.3 `structuredPayload`
承载结构化执行结果。

当前已承载：
- `decision`
- `insight`
- `executionPreview`

未来阶段五可扩：
- `resolvedObjects`
- `toolRuns`
- `executionLogs`
- `writtenEntities`
- `artifacts`

---

## 4. 最小协议方向

### BP问问 -> AI宿舍

```text
用户输入
-> BP问问任务筛网
-> dispatch decision
-> execution_tasks
```

### AI宿舍 -> BP问问

```text
execution_tasks
-> AI宿舍承接
-> execution_results
-> BP问问整合表达
```

---

## 5. 未来协议中的关键判断位

### 5.1 `executorKind`
决定谁承接：
- `bp_ask`
- `kimi`
- `system`
- `longxia`

### 5.2 `executionMode`
决定动作类型：
- `retrieve_then_answer`
- `retrieve_and_summarize`
- `draft_only`
- `write_safe`
- `write_restricted`
- `create_and_route`
- `delegate_to_longxia`
- `start_workflow`
- `ask_followup`

### 5.3 `requiresWrite / requiresConfirmation`
决定是否需要：
- AI宿舍只做预案
- 还是可以进入真实执行

---

## 6. 阶段五协议边界

阶段五先只约定：

- 任务输入字段
- 结果输出字段
- 状态流转
- 谁负责解释，谁负责执行

阶段五暂不要求：

- 复杂多执行器编排 DSL
- AI 员工自治协商协议
- 跨宿舍复杂消息总线

---

## 7. 一句话总结

BP问问到 AI宿舍 的阶段五协议，不是新发明一套复杂框架，而是：

> **直接把现有 execution_tasks / execution_results 正式定义成前台调度与后场执行之间的接口。**
