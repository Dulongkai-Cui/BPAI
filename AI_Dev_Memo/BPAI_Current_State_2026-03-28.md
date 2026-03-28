# BPAI 当前前端原型状态巡检（2026-03-28）

## 一、当前可用的顶层模块

当前站点已经形成 6 个主模块入口：

1. BP问问
2. 总览
3. 工程队
4. 工单
5. 文档档案室
6. AI宿舍

其中当前主入口链接关系已经基本建立：

- BP问问 → `Front/site/bp-ask.html`
- 总览 → `Front/site/dashboard.html`
- 工程队 → `Front/site/engineering-hub.html`
- 工单 → `Front/site/work-orders.html`
- 文档档案室 → `Front/site/docs-home.html`
- AI宿舍 → `Front/site/ai-home.html`

---

## 二、当前 Front/site 已有页面

### 总览 / 通用
- `dashboard.html`
- `team-status.html`
- `alerts.html`
- `settings.html`
- `bp-ask.html`

### 工程队
- `engineering-hub.html`
- `department-overview.html`（当前承接“办公室”）
- `engineering-board.html`
- `audit-center.html`
- `site-monitoring.html`
- `team-warehouse.html`
- `cad-design.html`
- `team-logs.html`
- `accounting.html`
- `system-backend.html`

### 工单
- `work-orders.html`
- `work-orders-active.html`
- `work-orders-archived.html`
- `work-orders-exceptions.html`

### 文档档案室
- `docs-home.html`
- `docs-sheets.html`
- `docs-cad.html`
- `docs-workspace.html`

### AI宿舍
- `ai-home.html`
- `ai-billing.html`
- `ai-workflows.html`
- `ai-employees.html`

---

## 三、当前各模块状态

### 1. BP问问
- 已有独立页。
- 规则基本稳定：保留顶栏，不使用系统侧栏，内部保留自己的会话栏。
- 当前入口正常。

### 2. 总览
- `dashboard.html` 已作为总站首页使用。
- `team-status.html`、`alerts.html`、`settings.html` 已存在。
- **仍有少量总览页顶部“总览”自身使用 `#` 作为 active 链接占位**，属于轻微残留，不影响主流程，但后续可统一成 `./dashboard.html`。

当前巡检发现的残留：
- `alerts.html`
- `settings.html`
- `team-status.html`
- `site-monitoring.html`（顶部“总览”仍是 `#`）

### 3. 工程队
- 已形成完整的工程队主入口：`engineering-hub.html`
- 当前子模块已明确接入：
  - 办公室
  - 工程组
  - 送审中心
  - 现场施工监控
  - 仓库
  - 设计院
  - 会计部
  - 系统后台
- 工程队子页已移除左侧栏，并增加返回 `engineering-hub.html` 的小按钮。
- 当前整体框架稳定。

### 4. 工单
- 已形成第一版工单体系。
- 当前侧栏子项：
  - 全部工单
  - 正在跟进
  - 已完成归档
  - 异常工单
- BP问问已从工单侧栏移除。
- 顶栏已恢复 BP问问，不再丢失。
- 顶栏与侧栏风格已向 dashboard 体系统一了一轮。

### 5. 文档档案室
- 已搭建第一版 4 个页面：
  - 我的文档
  - 我的表格
  - 我的CAD
  - 合作空间
- 当前重点是框架已通，便于后续接入开源项目。
- 左侧栏已移除 BP问问，并统一到系统侧栏语言。
- 合作空间已经有可用的示意页。

### 6. AI宿舍
- 已接入第一版 4 个页面：
  - 协同总览
  - 算力充值
  - 我的工作流
  - 我的AI员工
- AI宿舍侧栏已建立，并移除 BP问问，避免与全局顶栏重复。
- 顶栏已统一接入 `ai-home.html`。
- 当前属于静态原型阶段，但框架已完整。

---

## 四、当前已知的结构性设计决策

### 顶层 IA 已基本定型
- BP问问：独立顶层模块，不进入系统侧栏
- 总览：系统首页 / 总体控制台
- 工程队：已形成一级模块和多子页体系
- 工单：保留侧栏
- 文档档案室：保留侧栏
- AI宿舍：保留侧栏

### 工程队当前特殊说明
- `department-overview.html` 当前实际承接“办公室”，虽然文件名仍像部门总览。
- `site-monitoring.html` 已从旧 hub 残留转成真正监控页第一版。
- 会计部与系统后台目前都已建立独立页，不再落到 settings。

---

## 五、当前巡检结果

### 已确认正常的顶层主入口
- BP问问：正常
- 工程队：正常
- 工单：正常
- 文档档案室：正常
- AI宿舍：正常

### 当前还存在的轻微残留 / 后续建议修正项

#### 1. 少量页面顶部“总览”仍是 `#`
发现页面：
- `alerts.html`
- `settings.html`
- `team-status.html`
- `site-monitoring.html`

建议：
- 后续统一改成 `./dashboard.html`

#### 2. 仍有少量历史任务残留未清理
当前任务清单里还有部分老 task 未完成状态，但实际代码已完成，不影响站点本身。
建议：
- 后续清理会话 task 状态，保持任务列表干净。

#### 3. 某些页面仍处于“可用但未精修”状态
优先级较低，但后续可以进一步处理：
- 工单全部工单页目前仍带一点详情页气质
- 文档档案室的我的文档 / 我的表格目前是示意页
- AI宿舍四页目前也是第一版原型，适合后续精修

---

## 六、当前运行状态

Docker 容器状态：
- `bpai-front-static` 正常运行
- 端口：`http://localhost:3000`

说明：
- 当前站点可直接本地访问
- Docker 构建链路正常

---

## 七、下一步优先建议

如果继续推进，建议按以下顺序：

1. 统一修复所有残留的“总览 -> #”链接
2. 做一次全站细节收口（顶栏 / active / 搜索框 / 品牌文本）
3. 再进入内容精修阶段：
   - 工单详情页
   - 文档档案室接开源项目
   - AI宿舍深度内容

---

## 八、一句话总结

当前 BPAI 前端原型已经从“零散页面集合”进入到“模块化产品骨架已成型”的阶段：
- 主入口齐
- 一级模块齐
- 工程队 / 工单 / 文档档案室 / AI宿舍均已有第一版体系
- 目前主要剩统一收口与后续内容精修。
