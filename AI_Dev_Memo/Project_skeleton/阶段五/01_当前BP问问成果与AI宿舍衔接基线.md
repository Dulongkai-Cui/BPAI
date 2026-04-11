# 当前 BP问问成果与 AI宿舍衔接基线

## 1. 这份文档要说明什么

这份文档不谈未来完整蓝图，只回答一个问题：

> **在开始做 AI宿舍之前，BP问问现在已经真实做成了什么？这些成果如何成为 AI宿舍的起点？**

---

## 2. 当前已完成成果（代码事实）

### 2.1 前台入口与多轮线程

当前已具备：

- `/bp-ask` 页面入口
- 新建线程
- 历史线程列表
- 当前线程详情读取
- 历史线程删除（归档）
- 用户消息即时上屏
- assistant 独立加载动画

### 2.2 多轮与记忆

当前已具备：

- `conversation_threads`
- `conversation_messages`
- `conversation_summaries`
- `memory_facts`

意味着：
- BP问问不是单轮临时对话框
- 已经能承接线程级上下文
- 已经有最小记忆层

### 2.3 调度骨架

当前已具备：

- `primaryIntent`
- `targetDomain`
- `executionMode`
- `targetRefs`
- `constraints`
- `toolHints`
- `memoryScopes`
- `requiresWrite`
- `requiresConfirmation`

意味着：
- BP问问不是普通聊天页
- 已经能够把自然语言翻译成结构化任务意图

### 2.4 Kimi 接入

当前已具备：

- Kimi 结构化分类增强
- Kimi 普通聊天生成
- 固定 BPAI / BP问问 system prompt
- 与本地规则和 fallback 共存

意味着：
- 模型层已经开始进入系统，而不是纯模板回复

### 2.5 模拟执行

当前已具备：

- `DispatchExecutionPreview`
- 受控模拟执行预案
- assistant message metadata 中保留 executionPreview
- `execution_results.structuredPayload` 中保留 executionPreview

意味着：
- BP问问已经不只是“识别完就结束”
- 它开始能表达“下一步准备怎么做”

### 2.6 execution task / result

当前已具备：

- `execution_tasks`
- `execution_results`

意味着：
- BP问问已经有天然的“向后场派任务”的数据桥梁

---

## 3. 当前还没有完成的部分

### 3.1 真实执行后场仍缺失

当前 execution task/result 更像：
- 调度记录层
- 计划表达层

还不是：
- 稳定的执行承接层

### 3.2 真实工具链仍未接通

例如：
- 真实合作空间读取工具
- 真实文档空间检索
- 真实对象操作工具
- LongxiaAdapter
- workflow runner

### 3.3 复合任务仍未处理好

例如：
- 先找对象，再操作对象
- 跨域对象承接
- “它/那个/最新上传的那个”这类对象解析

---

## 4. 这意味着什么

结论是：

> **BP问问前台和调度中枢已经站起来了，但后场还没有真正接住它派出去的任务。**

这正是 AI宿舍要承接的空位。

---

## 5. AI宿舍为什么现在该上场

如果继续只加强 BP问问：
- 它会越来越会理解任务
- 但仍然缺真实承接层

结果就会变成：
- 前台越来越聪明
- 但“会理解，不会落地”

所以当前最顺的下一步不是再把 BP问问前台做得更复杂，而是：

> **让 AI宿舍正式接住 `execution_tasks`。**

---

## 6. 当前 BP问问 -> AI宿舍 的天然接口

现在已经存在的天然桥：

- `execution_tasks`
  - 任务是谁发起的
  - 目标域是什么
  - 执行模式是什么
  - 有没有写风险
  - 需不需要确认
  - 目标 refs / constraints 是什么

- `execution_results`
  - 结果摘要
  - 响应文本
  - structuredPayload

这说明 AI宿舍第一版完全可以不是新造一套协议，而是先沿这两张表承接。

---

## 7. 阶段五最重要的设计前提

### 前提 1
BP问问仍然是入口与解释层。

### 前提 2
AI宿舍是执行承接层，不是再造一个前台入口。

### 前提 3
Longxia / tools / workflow 都应先收编到 AI宿舍后场，不应直接堆进 BP问问本体。

### 前提 4
阶段五先做“最小执行后场”，不是一次性做完整自治系统。

---

## 8. 一句话总结

当前 BP问问已经完成了：

> **会听、会判断、会记、会写任务。**

阶段五的 AI宿舍要承接的是：

> **会真正接任务并向后执行。**
