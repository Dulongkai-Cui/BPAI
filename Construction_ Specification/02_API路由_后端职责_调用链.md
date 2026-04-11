# API 路由、后端职责与调用链

> 信息来源范围：`frontend/src/app/api/**/route.ts`、对应 `frontend/src/lib/**` 服务层。更新时间：2026-04-11。
>
> 目标：当你准备联调、扩 route、排查 BFF、确定某个页面到底调用了什么接口时，优先查本页。

## 1. API 总体形态

当前后端形态不是独立服务，而是 **Next.js App Router BFF**：

- 路由定义：`frontend/src/app/api/**/route.ts`
- 鉴权入口：`frontend/src/lib/auth/server.ts`
- 业务处理：`frontend/src/lib/<domain>/server.ts`
- 数据访问：`frontend/src/lib/db/client.ts` + `frontend/src/lib/db/schema.ts`

常见模式：

```text
Route Handler
-> getCurrentUser / requireCurrentUser
-> payload 校验与参数标准化
-> 调用 domain server
-> 读写 Drizzle/Postgres / raw shadow / 本地文件存储
-> 返回 JSON
```

## 2. API 分组索引

| 分组 | 主要路由 | 核心服务 |
| --- | --- | --- |
| auth | `/api/auth/login`、`/logout`、`/session` | `auth/server.ts` |
| assets | `/api/assets/upload`、`/copy`、`/trash`、`/[kind]/[assetId]/content` | `content/server.ts` |
| browser-state | `/api/browser-state`、`/api/browser-state/files` | `content/browser-state.ts` |
| trash | `/api/trash/restore`、`/api/trash/clear` | `content/server.ts` |
| collaboration | `/api/collaboration-spaces`、`/[workspaceId]`、`/workspace-members`、`/system-forms` | `workspace/server.ts` |
| engineering | `/api/engineering/members`、`/dispatch-options`、`/squads`、`/squads/[squadId]` | `engineering-team/server.ts`、`engineering/server.ts` |
| work-orders | `/api/work-orders`、`/[workOrderId]`、`/[workOrderId]/dispatch-executions`、`/[workOrderId]/stage-assets` | `work-order/server.ts` |
| onlyoffice | `/api/onlyoffice/callback` | `content/server.ts` |
| bp-ask | `/api/bp-ask/threads`、`/threads/[threadId]`、`/threads/[threadId]/messages`、`/dispatch` | `bp-ask/server.ts`、`bp-ask/dispatch.ts`、`bp-ask/kimi.ts` |
| cad-files | `/api/cad-files/[kind]/[assetId]/[...fileName]` | `content/cad.ts` + asset content |

## 3. 认证域

### 3.1 `POST /api/auth/login`

- 路由：`frontend/src/app/api/auth/login/route.ts`
- 上游调用：登录页 `frontend/src/components/auth/login-form.tsx`
- 输入：`{ email, password }`
- 下游：`frontend/src/lib/auth/server.ts: authenticateUser`
- 输出：`{ user }` + 设置 `bpai_session` cookie
- 依赖：`users`、`sessions`
- 错误口径：
  - `400`：缺少账号或密码
  - `401`：账号或密码不正确

**请求字段骨架**
```json
{
  "email": "user@example.com",
  "password": "your-password"
}
```

**响应字段骨架**
```json
{
  "user": {
    "id": "user-first-local",
    "name": "Dulongkai Cui",
    "email": "...",
    "roleKey": "dispatcher"
  }
}
```

**调用链**
```text
/api/auth/login
-> authenticateUser(email, password)
-> 校验 PBKDF2 hash
-> 创建/镜像 session
-> response.cookies.set(AUTH_COOKIE_NAME, token)
```

### 3.2 `POST /api/auth/logout`

- 作用：销毁当前会话
- 下游：`auth/server.ts` 中 session 清理逻辑
- 依赖：`sessions` 与 raw shadow 会话镜像

### 3.3 `GET /api/auth/session`

- 作用：读取当前登录用户
- 常用于前端恢复登录态

## 4. 文档与资产域

### 4.1 `POST /api/assets/upload`

- 路由：`frontend/src/app/api/assets/upload/route.ts`
- 上游调用：文档档案室、阶段资料上传等
- 输入：`multipart/form-data`
  - `file`
  - `kind`: `document | sheet | slide | auto`
  - `workspaceId`（可选）
- 下游：`frontend/src/lib/content/server.ts: createUploadedAsset`
- 输出：`asset/openPath/contentUrl/editorKey`
- 依赖：`.bpai/storage`、`content_assets`、`file_placements`
- 错误口径：
  - `401`：未登录
  - `400`：上传表单无效或缺少文件/类型

**返回字段骨架**
```json
{
  "asset": {
    "id": "document-xxxx",
    "kind": "document",
    "title": "示例文件",
    "updatedAt": "2026-04-11T..."
  },
  "openPath": "/docs/documents/document-xxxx",
  "contentUrl": "http://.../api/assets/document/document-xxxx/content",
  "editorKey": "bpai-asset-document-document-xxxx"
}
```

**调用链**
```text
/api/assets/upload
-> getCurrentUser
-> inferContentKind(可选)
-> createUploadedAsset
-> 本地存储写文件
-> mirrorAssetToPostgres
-> raw shadow 同步
```

### 4.2 `POST /api/assets/copy`

- 作用：复制资产/文件到目标空间或文件夹
- 下游：`content/server.ts`
- 依赖：`content_assets`、`file_placements`

### 4.3 `POST /api/assets/trash`

- 作用：移动到回收站
- 下游：`content/server.ts`
- 依赖：资产状态与 placement 状态

### 4.4 `GET /api/assets/[kind]/[assetId]/content`

- 作用：读取真实文件流
- 上游调用：OnlyOffice、下载、CAD 文件查看
- 下游：`content/server.ts` 文件读取逻辑

### 4.5 `GET /api/assets/[kind]/[assetId]/named/[fileName]`

- 作用：以带文件名路径导出/读取资产，通常为更友好的下载地址

## 5. 浏览器状态与回收站域

### 5.1 `POST /api/browser-state`

- 路由：`frontend/src/app/api/browser-state/route.ts`
- 上游调用：`desktop-file-browser.tsx`
- 输入：
  - `kind`
  - `workspaceId`
  - `shareMode`
  - 当前 folder / innerFolder / viewMode / fileStates / customFolders 等
- 下游：
  - `saveSharedBrowserStateForWorkspace`
  - 或 `saveBrowserStateForUser`
- 依赖：`user_workspace_view_states`、`workspace_shared_states`
- 错误口径：
  - `401`：未登录
  - `400`：payload 不合法

**请求字段骨架**
```json
{
  "kind": "document",
  "workspaceId": "workspace-xxx",
  "shareMode": "workspace",
  "activeFolderId": "recent-uploads",
  "activeInnerFolderId": null,
  "folderViewMode": "large",
  "deletedFolderIds": [],
  "customFolders": [],
  "innerFolders": [],
  "fileStates": [],
  "boardMessages": []
}
```

**调用链**
```text
/api/browser-state
-> getCurrentUser
-> 校验 payload
-> shareMode=workspace ? saveSharedBrowserStateForWorkspace : saveBrowserStateForUser
-> 保存浏览器状态
```

### 5.2 `POST /api/browser-state/files`

- 作用：细粒度文件状态同步
- 下游：browser-state 相关服务

### 5.3 `POST /api/trash/restore`

- 作用：从回收站恢复文件
- 下游：`content/server.ts`

### 5.4 `POST /api/trash/clear`

- 作用：清空回收站
- 下游：`content/server.ts`

## 6. 合作空间与系统表单域

### 6.1 `POST /api/collaboration-spaces`

- 路由：`frontend/src/app/api/collaboration-spaces/route.ts`
- 上游调用：`create-collaboration-space-button.tsx`
- 输入：`{ name, summary, tone, memberEmails }`
- 下游：`frontend/src/lib/workspace/server.ts: createCollaborationSpace`
- 输出：`{ ok, space }`
- 依赖：合作空间状态、raw shadow、Postgres mirror

### 6.2 `PATCH/DELETE /api/collaboration-spaces/[workspaceId]`

- 作用：维护、解散指定合作空间
- 下游：`workspace/server.ts`

### 6.3 `POST /api/workspace-members`

- 作用：维护工作区/合作空间成员
- 下游：`workspace/server.ts`

### 6.4 `POST /api/system-forms`

- 路由：`frontend/src/app/api/system-forms/route.ts`
- 上游调用：`create-system-form-button.tsx`
- 输入：`{ title, spaceId, assigneeEmail, formType, state }`
- 下游：`workspace/server.ts: createAssignedSystemForm`
- 输出：`{ ok, form }`
- 注意：存在 `FORBIDDEN`、`SYSTEM_SCOPE_NOT_FOUND`、`ASSIGNEE_NOT_FOUND` 等业务错误
- 错误口径：
  - `401`：未登录
  - `400`：标题/表单类型/分配对象缺失
  - `403`：当前账号没有系统表单后台权限
  - `404`：系统后台 scope 不存在

**请求字段骨架**
```json
{
  "title": "材料缺项表",
  "spaceId": "space-xxx",
  "assigneeEmail": "li.gong@bpai.local",
  "formType": "缺项表",
  "state": "已分配"
}
```

## 7. 工程队域

### 7.1 `GET /api/engineering/squads`

- 路由：`frontend/src/app/api/engineering/squads/route.ts`
- 上游调用：工程页/编队弹窗
- 下游：`listEngineeringSquads`

### 7.2 `POST /api/engineering/squads`

- 上游调用：`create-squad-button.tsx`
- 输入：`{ name, code, leaderMemberId, memberIds, baseLabel, summary, note }`
- 下游：`frontend/src/lib/engineering-team/server.ts: createEngineeringSquad`
- 输出：`{ squad }`
- 依赖：`engineering_squads`、`engineering_squad_members`
- 权限：调度者或系统管理员

### 7.3 `GET /api/engineering/members`

- 作用：列施工成员与状态
- 下游：`engineering-team/server.ts`
- 依赖：`engineering_members`

### 7.4 `GET /api/engineering/dispatch-options`

- 作用：为工单派单弹窗提供班组/成员备选项
- 下游：工程数据 + 工单上下文

### 7.5 `PATCH /api/engineering/squads/[squadId]`

- 作用：维护现有编队信息

## 8. 工单域

### 8.1 `POST /api/work-orders`

- 路由：`frontend/src/app/api/work-orders/route.ts`
- 上游调用：`create-work-order-button.tsx`、`work-order-form-dialog.tsx`
- 输入：
  - `title`
  - `sourceType`
  - `priority`
  - `projectName/siteName/siteAddress`
  - `currentResponsibleUserId/currentResponsibleTeam`
  - `currentStage`
  - `progressPercent`
  - `collaborationSpaceId`
  - `createDedicatedSpace` + 专属空间参数
- 下游：`frontend/src/lib/work-order/server.ts: createWorkOrder`
- 输出：`{ ok, workOrder }`
- 依赖：`work_orders`、`source_intakes`、`missing_items`，必要时 `collaboration_spaces`
- 错误口径：
  - `400`：标题为空 / 负责人不存在
  - `401`：未登录
  - `403`：协作空间不属于当前用户
  - `409`：工单编号已存在

**请求字段骨架**
```json
{
  "title": "长沙某站点图纸补录",
  "sourceType": "manual",
  "priority": "normal",
  "projectName": "长沙项目",
  "siteName": "望城区站点",
  "siteAddress": "...",
  "currentResponsibleUserId": "user-engineering-local",
  "currentResponsibleTeam": "工程执行组",
  "currentStage": "registration",
  "progressPercent": 0,
  "collaborationSpaceId": null,
  "createDedicatedSpace": true,
  "dedicatedSpaceName": "图纸补录协作空间"
}
```

**调用链**
```text
/api/work-orders
-> requireCurrentUser
-> 校验枚举/负责人/协作空间归属
-> createWorkOrder
-> 写 work_orders
-> 初始化 source_intakes / missing_items
-> 可选创建 dedicated collaboration space
```

### 8.2 `GET /api/work-orders/[workOrderId]`

- 路由：`frontend/src/app/api/work-orders/[workOrderId]/route.ts`
- 上游调用：工单详情页
- 下游：
  - `ensureCanViewWorkOrder`
  - `getWorkOrderDetailById`
- 输出：`{ ok, detail }`
- 依赖：工单聚合表 + 相关用户/空间/资料

### 8.3 `PATCH /api/work-orders/[workOrderId]`

- 上游调用：进度编辑、卡片动作、详情页表单
- 下游：`updateWorkOrder`
- 依赖：`work_orders`
- 注意：支持 createDedicatedSpace 与局部更新

### 8.4 `DELETE /api/work-orders/[workOrderId]`

- 下游：`deleteWorkOrder`
- 依赖：工单主记录与级联资源

### 8.5 `POST /api/work-orders/[workOrderId]/dispatch-executions`

- 上游调用：`dispatch-assignment-button.tsx`
- 下游：`assignWorkOrderDispatch`
- 依赖：`dispatch_executions`、`engineering_members`、`engineering_squads`
- 作用：派施工队/班组，生成派单执行记录，并推动工单下一动作

### 8.6 `POST /api/work-orders/[workOrderId]/stage-assets`

- 上游调用：`work-order-stage-asset-panel.tsx`
- 输入：`multipart/form-data`，至少包含 `stage` 和 `files[]`
- 下游：
  - `ensureWorkOrderStageFolders`
  - `createUploadedAsset`
  - 工单资料挂接逻辑
- 依赖：`content_assets`、`file_placements`、`work_order_document_links`

**调用链**
```text
/api/work-orders/[id]/stage-assets
-> 权限校验
-> ensureWorkOrderStageFolders
-> createUploadedAsset
-> 建立阶段文件夹与资产关系
-> 写 work_order_document_links
```

## 9. OnlyOffice 与 CAD

### 9.1 `POST /api/onlyoffice/callback`

- 路由：`frontend/src/app/api/onlyoffice/callback/route.ts`
- 上游调用：OnlyOffice Document Server 回调
- 输入：`{ key, status, url }`
- 下游：
  - `parseOnlyOfficeAssetKey`
  - `overwriteAssetBinary`
  - 老版本逻辑会写回 `public/onlyoffice/*`
- 作用：把在线编辑后的内容持久化回 BPAI 资产存储

**调用链**
```text
OnlyOffice callback
-> 根据 key 判断新资产 or legacy 文件
-> fetch 下载回调 url
-> overwriteAssetBinary / 写 legacy file
-> 更新资产内容
```

### 9.2 `GET /api/cad-files/[kind]/[assetId]/[...fileName]`

- 作用：给 CAD viewer 提供文件流
- 上游调用：`/docs/cad` 与文档详情中的 CAD redirect

## 10. BP Ask AI 域

### 10.1 `GET /api/bp-ask/threads`

- 路由：`frontend/src/app/api/bp-ask/threads/route.ts`
- 上游调用：`bp-ask-shell.tsx` 初始化
- 下游：`listConversationThreadsForUser`
- 输出：`{ threads }`

### 10.2 `POST /api/bp-ask/threads`

- 上游调用：新建线程按钮或首次发言前自动创建
- 下游：`createConversationThreadForUser`
- 输出：`{ summary, thread }`

### 10.3 `GET /api/bp-ask/threads/[threadId]`

- 路由：`frontend/src/app/api/bp-ask/threads/[threadId]/route.ts`
- 上游调用：线程切换
- 下游：`getConversationThreadDetailForUser`
- 输出：`{ thread }`

### 10.4 `DELETE /api/bp-ask/threads/[threadId]`

- 路由：`frontend/src/app/api/bp-ask/threads/[threadId]/route.ts`
- 上游调用：侧栏历史对话删除按钮
- 下游：`archiveConversationThreadForUser`
- 输出：`{ ok: true }`
- 行为：归档线程，不做物理删除
- 影响：`listConversationThreadsForUser` 只返回 active 线程

### 10.5 `POST /api/bp-ask/threads/[threadId]/messages`

- 路由：`frontend/src/app/api/bp-ask/threads/[threadId]/messages/route.ts`
- 上游调用：`BpAskShell.handleSubmit`
- 输入：`{ prompt }`
- 下游：`appendMessageToThreadForUser`
- 输出：通常为更新后的 `{ summary, thread }`
- 依赖：`conversation_messages`、`conversation_summaries`、`memory_facts`、`execution_tasks`、`execution_results`
- 错误口径：
  - `400`：prompt 为空
  - `401`：未登录
  - `404`：线程不存在
  - `500`：发送消息失败

**请求字段骨架**
```json
{
  "prompt": "帮我看看最近一周长沙有哪些预警工单"
}
```

**返回核心结构**
```json
{
  "summary": {
    "id": "thread-xxx",
    "title": "...",
    "updatedAt": "2026-04-11T..."
  },
  "thread": {
    "id": "thread-xxx",
    "messages": [...],
    "insight": {...}
  }
}
```

### 10.6 `POST /api/bp-ask/dispatch`

- 路由：`frontend/src/app/api/bp-ask/dispatch/route.ts`
- 上游调用：调度预判/预览
- 输入：`{ prompt | message, threadId? }`
- 下游：`previewDispatchForUser`
- 作用：不一定落库完整消息，但做 dispatch preview

## 11. 高风险/高耦合路由提醒

| 路由 | 为什么高耦合 | 改动前必须看 |
| --- | --- | --- |
| `/api/assets/upload` | 同时涉及文件存储、Postgres mirror、raw shadow | `content/server.ts`、`db/app-store-write.ts`、`store/raw-shadow.ts` |
| `/api/browser-state` | 同时涉及个人态与 workspace 共享态 | `content/browser-state.ts`、schema 中 view state 表 |
| `/api/work-orders/**` | 工单、工程队、文档资料、协作空间互相牵连 | `work-order/server.ts`、schema 工单域 |
| `/api/onlyoffice/callback` | 影响在线编辑持久化与 legacy 文件路径 | `content/server.ts`、文档详情页 |
| `/api/bp-ask/**` | 会影响线程、摘要、记忆、执行任务/结果 | `bp-ask/server.ts`、`bp-ask/dispatch.ts`、schema AI 域 |
| `/api/collaboration-spaces` / `/api/system-forms` | 仍处于 mock/raw store/镜像并存的过渡层 | `workspace/server.ts`、`store/raw-shadow.ts` |

## 12. 路由开发检查清单

### 加新 route 之前
- 先确认是否已有相邻域 route 可复用
- 先确认页面是服务端直接取数还是必须走客户端 fetch
- 先确认是否真的需要新 route，还是补现有 `lib/*/server.ts` 就够

### 改现有 route 时
- 看鉴权方式：`getCurrentUser` 还是 `requireCurrentUser`
- 看返回结构是否已被前端强依赖
- 看下游是否还会同步 raw shadow / app store mirror / 本地文件
- 看是否涉及枚举值，若涉及要同步 schema / UI label / migration

### 改 BP Ask route 时
- 同时检查 thread summary、message metadata、memory fact 与 execution result 的一致性

### 改工单 route 时
- 同时检查 collaboration space、stage folder、工程编队与资料链路
