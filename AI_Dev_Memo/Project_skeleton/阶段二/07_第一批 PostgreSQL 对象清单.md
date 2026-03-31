# 第一批 PostgreSQL 对象清单

## 1. 这份文档的定位

这份文档不是 DDL，也不是 ORM schema 代码，而是阶段二第一批真正准备落进 PostgreSQL 的对象清单。

它的作用是先把下面几件事定死：

- 第一批到底迁哪些对象
- 为什么是这些对象先迁
- 哪些内容不进第一批
- 第一批做完之后，工单模块怎么往上接

一句话说：

这份文档是“从当前本地 JSON 后端走向 PostgreSQL 真源”的第一张施工清单。

---

## 2. 第一批的目标是什么

第一批不追求把整个 BPAI 一口气数据库化。

第一批的目标很克制，只做一件事：

先把账号、工作区、文档档案室元数据、合作空间元数据这些公共底座从本地 JSON 里拆出来，变成正式 PostgreSQL 真源。

这样做的原因很直接：

- 这是工单模块和合作空间系统表单的共同底座
- 这是后续 AI 自动化要频繁查询和回写的公共结构
- 这是当前 `app-store.json` 里最不应该继续长期扛着的那部分

所以第一批不是“先做工单页面”，也不是“先做所有业务对象”，而是：

先把公共结构化底座迁出来。

---

## 3. 第一批对象选择原则

### 3.1 先迁公共真源

优先迁那些会被多个模块共同依赖的对象。

### 3.2 先迁结构，不迁大文件本体

优先迁关系、权限、归属、版本、状态；不把 PDF、图片、图纸包这些大文件本体直接塞进第一批。

### 3.3 先迁长期稳定对象

优先迁那些短期内边界比较清楚、后面不太容易推翻的对象。

### 3.4 先迁“会被 AI 高频查询”的对象

如果后续 Open Claw 或其他 AI 要频繁查账号、工作区、文件归属、合作空间关系，这些对象就应该先进入 PostgreSQL。

---

## 4. 第一批 PostgreSQL 对象清单

阶段二建议第一批至少包含 10 个核心对象。

### 4.1 User

作用：

- 承接系统登录账号
- 承接人员身份、角色、团队信息
- 给后续工单责任人、协同人、AI 审计提供统一引用

建议承接的信息包括：

- user_id
- name
- email
- role_key
- role_label
- team_label
- password_hash
- password_salt
- primary_workspace_id
- created_at
- updated_at

为什么进第一批：

- 它是全系统共同底座
- 当前已经存在本地 seed 和真实 session 逻辑
- 不先迁它，后面工作区、合作空间、工单都没法做正规引用

---

### 4.2 Workspace

作用：

- 承接个人工作区和合作空间工作区的统一容器定义
- 给文档、工单、合作空间和权限体系提供统一范围

建议承接的信息包括：

- workspace_id
- name
- kind
- owner_user_id
- visibility
- created_at
- updated_at

为什么进第一批：

- 文档档案室已经强依赖 workspace 作用域
- 后续工单和合作空间系统表单也都要挂 workspace

---

### 4.3 WorkspaceMember

作用：

- 承接合作空间成员关系
- 让成员列表、加入关系、角色视图不再依赖本地临时结构或 mock 合并

建议承接的信息包括：

- membership_id
- workspace_id
- user_id
- member_role
- joined_at
- updated_at

为什么进第一批：

- 合作空间已经成立
- 后续“分配到你名下的系统表单”必须依赖稳定成员关系

---

### 4.4 Session

作用：

- 承接登录态
- 让账号系统从本地 JSON session 变成正式数据库 session

建议承接的信息包括：

- session_id
- user_id
- created_at
- expires_at
- last_seen_at

为什么进第一批：

- 当前已经是真登录、真 cookie，不是纯前端假 session
- 不先迁 session，账号后端仍然停留在本地 JSON 阶段

---

### 4.5 ContentAsset

作用：

- 承接文档、表格、演示稿等文件的结构化元数据
- 作为文件本体和业务对象之间的稳定索引层

建议承接的信息包括：

- asset_id
- kind
- title
- owner_user_id
- workspace_id
- original_file_name
- mime_type
- size_bytes
- storage_key / stored_path
- current_version
- trashed_at
- created_at
- updated_at

为什么进第一批：

- 这是文档档案室后端的核心元数据层
- 后续工单、合作空间、AI 文件访问都会依赖它

---

### 4.6 FolderNode

作用：

- 承接大文件夹和子文件夹结构
- 给文档档案室和合作空间提供统一文件夹树

建议承接的信息包括：

- folder_id
- workspace_id
- owner_user_id（个人空间可用）
- share_scope
- parent_folder_id
- name
- description
- tone
- icon
- deleted_at
- created_at
- updated_at

这里建议把现在的“大文件夹”和“子文件夹”统一成一个节点对象，只通过 parent 关系区分，而不是永远拆两套结构。

为什么进第一批：

- 文件夹结构已经是文档档案室的主交互对象
- 后续工单挂接资料包、合作空间工作台挂接资料，也都会依赖稳定文件夹节点

---

### 4.7 FilePlacement

作用：

- 承接“某个文件当前放在哪个文件夹 / 子文件夹里”
- 承接文件在视图中的归位和生命周期状态

建议承接的信息包括：

- placement_id
- asset_id
- workspace_id
- folder_id
- subfolder_id
- title_override
- is_trashed
- is_deleted
- trashed_at
- updated_at

为什么进第一批：

- 这是文档档案室文件位置关系的核心层
- 不把它迁出来，文件仍然会绑死在当前本地 browser state 结构里

---

### 4.8 UserWorkspaceViewState

作用：

- 承接个人空间视图状态
- 承接当前 active folder、view mode 等用户级状态

建议承接的信息包括：

- state_id
- user_id
- workspace_id
- content_kind
- active_folder_id
- active_inner_folder_id
- folder_view_mode
- updated_at

为什么进第一批：

- 这部分虽然偏“视图状态”，但现在已经影响实际工作流
- 后续如果不迁，文档档案室的一些核心交互仍然会留在本地 JSON 里

---

### 4.9 WorkspaceSharedState

作用：

- 承接合作空间中的共享文件夹布局和共享文件状态
- 作为多人共用布局的真源层

建议承接的信息包括：

- shared_state_id
- workspace_id
- content_kind
- active_folder_id（可选）
- folder_view_mode（可选）
- updated_at

为什么进第一批：

- 合作空间已经是正式协作容器
- 后续系统表单区和共享资料区都要依赖共享状态

---

### 4.10 CollaborationSpace

作用：

- 承接合作空间对象本身
- 让空间名称、摘要、owner、色调、统计信息进入正式真源

建议承接的信息包括：

- collaboration_space_id
- workspace_id
- name
- summary
- owner_user_id 或 owner_email（建议最终收成 owner_user_id）
- tone
- document_count
- system_form_count
- created_at
- updated_at
- dissolved_at

为什么进第一批：

- 合作空间现在还混着 store 和 mock
- 后续工单系统表单和角色工作台一定会压在它上面

---

## 5. 第一批明确不包含什么

为了让第一批能真正落地，下面这些对象建议先不放进第一批。

### 5.1 不包含工单主表和附表

不是因为它们不重要，而是因为第一批更偏底座迁移。

工单主表、附表、缺失项建议在“底座稳定后”直接以 PostgreSQL 真源方式建立，不再走本地 JSON 过渡。

### 5.2 不包含 AI 任务与 AI 审计对象

这些对象很重要，但建议放在第二批或第三批，因为它们必须建立在稳定真源之上。

### 5.3 不包含文件本体

下面这些内容不建议进第一批 PostgreSQL：

- PDF 本体
- DOCX 本体
- XLSX 本体
- PPTX 本体
- 图片本体
- 图纸包
- 资源包

它们继续留在存储层即可。

### 5.4 不包含复杂审批流和状态机扩展

第一批只做底座，不做重业务流。

---

## 6. 第一批对象之间的关系怎么理解

建议把第一批理解成三组关系。

### 6.1 身份与空间关系

- User
- Workspace
- WorkspaceMember
- Session

这组决定“谁是谁、谁在哪个空间、谁现在登录着”。

### 6.2 文件与文件夹关系

- ContentAsset
- FolderNode
- FilePlacement

这组决定“文件是什么、挂在哪、现在在哪个文件夹里”。

### 6.3 合作空间与共享状态关系

- CollaborationSpace
- WorkspaceSharedState
- UserWorkspaceViewState

这组决定“合作空间怎么成立、共享布局怎么存在、个人如何看自己的视图状态”。

---

## 7. 第一批内部建议顺序

即便叫第一批，内部也建议分成三个小顺序。

### 7.1 先做身份与工作区

先做：

- User
- Workspace
- WorkspaceMember
- Session

这是所有其他对象的引用基础。

### 7.2 再做文件元数据与文件夹关系

再做：

- ContentAsset
- FolderNode
- FilePlacement

这样文档档案室的结构化底座就能先稳住。

### 7.3 最后做合作空间元数据与共享状态

最后做：

- CollaborationSpace
- UserWorkspaceViewState
- WorkspaceSharedState

这样可以避免一开始就陷入共享状态细节。

---

## 8. 第一批完成后的验收标准

如果第一批做顺，至少应达到下面这些结果：

1. 账号、工作区、session 不再以本地 JSON 为唯一真源。
2. 文档档案室的文件元数据、文件夹结构、文件位置关系进入 PostgreSQL。
3. 合作空间对象和成员关系进入 PostgreSQL。
4. 文件本体仍可继续按现有方式读取，不影响现有文档功能使用。
5. 后续工单模块已经具备可以直接建立在 PostgreSQL 之上的公共底座。

---

## 9. 第一批完成后，工单模块怎么接

第一批做完以后，工单模块建议直接在 PostgreSQL 上接第二批对象：

- WorkOrder
- SourceIntake
- DispatchExecution
- DeliveryResource
- MissingItem
- WorkOrderDocumentLink

也就是说：

第一批不是工单本身，但它是工单模块正式起飞前必须先铺好的跑道。

---

## 10. 一句话版本

第一批 PostgreSQL 对象，不是把所有业务一口气搬过去，而是先把账号、工作区、文件元数据、文件夹关系和合作空间元数据这些公共底座迁过去，为后续工单模块和 AI 自动化提供稳定真源。
