# 给 Codex 的保护性提示词｜AI宿舍第一版最小落地

你现在在 BPAI 项目里，开始尝试实现 **AI宿舍第一版最小可用结构**。

注意：这不是推翻式重构，而是**保护性新增**。当前 BP问问、Kimi、任务筛网、多轮线程、记忆、模拟执行、历史删除、即时发送体验等已经基本可用，**不要轻易修改或破坏这些已完成模块**。

---

## 一、首要原则

1. **优先新增，不要重构现有 BP问问主链**
2. **不要轻易改动现有 `/bp-ask` 页面、dispatch 主逻辑、现有 Kimi 接入、已有 memory/execution 表结构，除非绝对必要**
3. **如果必须碰现有 BP问问代码，尽量做最小接入式改动，不改变已有行为**
4. **这一轮重点是先做 AI宿舍最小承接层，不是直接接 Longxia 全执行闭环**
5. **不要顺手优化无关功能，不要扩大任务范围**

---

## 二、当前已完成的事实

你必须基于当前代码事实工作，尤其这些已经存在：

- `/bp-ask` 页面入口
- `conversation_threads / conversation_messages / conversation_summaries`
- `memory_facts`
- `execution_tasks / execution_results`
- BP问问任务筛网
- Kimi 普通聊天生成
- Kimi dispatch 分类增强
- 模拟执行预案 `executionPreview`
- 历史线程删除
- 用户消息即时上屏
- assistant 加载动画

这些都已经做成了，**不要把 AI宿舍实现建立在“重写 BP问问”上**。

---

## 三、本轮目标

先实现 **AI宿舍第一版页面骨架 + 最小任务承接视图**。

### 第一阶段只做这些页面
1. `/ai-dorm`
2. `/ai-dorm/tasks`
3. `/ai-dorm/agents`
4. `/ai-dorm/workflows`

---

## 四、页面要求

### 1. `/ai-dorm`
做一个总览页，展示：
- 待承接任务数
- 已完成任务数
- 最近任务列表
- 执行单元概览（可以先是静态/占位）

数据优先从现有 execution_tasks / execution_results 来。

---

### 2. `/ai-dorm/tasks`
这是最重要的页面。
请优先实现这个页面，并真正读取当前已有的：
- `execution_tasks`
- `execution_results`

页面至少展示：
- taskId
- goal
- primaryIntent
- targetDomain
- executionMode
- executorKind
- status
- requiresWrite
- requiresConfirmation
- createdAt

点击或展开一条任务时，能看到：
- targetRefs
- constraints
- metadata
- result summary / response / structuredPayload（如果有）

如果需要，新增一个最小的 server 读取函数，但**不要重构现有 BP问问 server 逻辑**。

---

### 3. `/ai-dorm/agents`
先做最小列表页即可。
可以先用静态数据 / mock 数据表示不同执行单元，例如：
- 工单龙虾
- 文档龙虾
- 图纸龙虾
- 预警龙虾
- 报表龙虾

每个展示：
- 名称
- 负责领域
- 当前状态
- 说明
- 最近任务数（可以先占位）

这一轮不要求接真实 LongxiaAdapter。

---

### 4. `/ai-dorm/workflows`
先做最小列表页即可。
可以先用静态数据 / mock 数据表示 workflow，例如：
- 工单受理流程
- 文档归档流程
- 风险汇总流程

每个展示：
- 名称
- 目标
- 步骤数
- 说明
- 是否启用

这一轮不要求做复杂拖拽编辑器。

---

## 五、实现约束

- 尽量复用现有页面风格和组件风格
- 能用现有布局体系就用现有布局体系
- 不要新造复杂状态管理
- 不要改 execution_tasks / execution_results 的 schema
- 不要现在就做真实执行器闭环
- 不要现在就接 Longxia
- 不要现在就做复杂 Skill 编辑器

---

## 六、如果需要新增代码

优先新增在这些区域：
- `frontend/src/app/ai-dorm/**`
- `frontend/src/components/ai-dorm/**`
- `frontend/src/lib/ai-dorm/**`

尽量不要把 AI宿舍代码塞进现有 `bp-ask/*` 目录。

---

## 七、你开始前先读这些文档

- `Construction_ Specification/04_AI链路_BPAsk_记忆_调度.md`
- `AI_Dev_Memo/Project_skeleton/阶段五/00_阶段五导航与总目标.md`
- `AI_Dev_Memo/Project_skeleton/阶段五/01_当前BP问问成果与AI宿舍衔接基线.md`
- `AI_Dev_Memo/Project_skeleton/阶段五/02_AI宿舍最小承接层草案.md`
- `AI_Dev_Memo/Project_skeleton/阶段五/03_BP问问到AI宿舍调度协议草案.md`
- `AI_Dev_Memo/Project_skeleton/阶段五/06_AI宿舍页面结构草图_文字版.md`

---

## 八、输出要求

开始前先告诉我：
1. 你准备新增哪些文件
2. 哪些现有文件会改
3. 你如何保证不破坏当前 BP问问主链

然后再开始实现。
