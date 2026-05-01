# 101｜BP问问 Tool Calling 当前状态记录｜2026-05-01

> 信息来源范围：`frontend/src/lib/ai-tools/gateway.ts`、`frontend/src/lib/bp-ask/server.ts`、`frontend/src/lib/bp-ask/model-provider.ts`、`frontend/src/lib/bp-ask/dispatch.ts`、`frontend/src/lib/content/server.ts`、`frontend/src/app/api/ai-tools/**`、`frontend/scripts/*smoke*.mjs`、`docker-compose.dev.yml`、本轮 Docker smoke 结果。更新时间：2026-05-01。
>
> 本文是 100 号 Claude 断线记录之后的接续 checkpoint，用于说明“BP问问当前到底已经能不能真的调用工具做事”。

## 1. 总判断

当前可以把 BP问问的基础状态判断为：

```text
工单基础能力：Tool Calling MVP 已完成
文档基础能力：Tool Calling MVP 已完成
表格 / Office 精细编辑：尚未完成，需要后续补 sheet tools
复杂任务转 Longxia：已有 fallback 结构和 handoff 方向，但还不是完整生产闭环
```

更具体地说：

- BP问问已经不是只返回 dispatch 模拟预案；明确任务会优先走 capability / tool。
- 工单和文档两类对象已经能通过 Tool Gateway 做搜索、读取、创建和基础写入。
- 缺参、候选选择、下一轮补槽、再继续执行的主链已经打通。
- Docker 开发环境内已完成基础 smoke 验证。

## 2. 当前 Docker 运行环境

本项目当前主运行方式是 `docker-compose.dev.yml`：

```text
bpai-front-dev      node:20-alpine，宿主 http://localhost:3001 -> 容器 3000
bpai-postgres       postgis/postgis:16-3.4，宿主 localhost:5433 -> 容器 5432
bpai-onlyoffice     onlyoffice/documentserver，宿主 http://localhost:8080
bpai-openclaw*      多个 OpenClaw gateway profile 实例
```

容器内测试要使用容器端口：

```powershell
docker exec -e BPAI_BASE_URL=http://localhost:3000 bpai-front-dev npm run smoke:bp-ask:document-chain
```

浏览器手动体验仍然打开宿主端口：

```text
http://localhost:3001/bp-ask
```

如果改了 `frontend/src/lib/bp-ask/server.ts` 这类 server-only 主链代码，Next dev 在容器里有时不会立刻吃到最新编译态。稳妥做法：

```powershell
docker restart bpai-front-dev
docker exec -e BPAI_BASE_URL=http://localhost:3000 bpai-front-dev npm run smoke:bp-ask:document-chain
```

## 3. Tool Gateway 当前状态

核心位置：

- `frontend/src/lib/ai-tools/gateway.ts`
- `frontend/src/app/api/ai-tools/registry/route.ts`
- `frontend/src/app/api/ai-tools/run/route.ts`

当前已经有 capability descriptor 协议，字段包括：

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

本轮 Docker 内验证结果：

```text
npm run smoke:ai-tools:registry
resourceCount: 3
capabilityCount: 13
bySourceKind: internal 12, longxia 1
byDomain: work_order 7, openclaw 1, document 5
```

这说明 BP问问已经可以通过 registry 看见系统内能力，而不是只靠硬编码关键词。

## 4. 工单基础 Tool Calling

当前工单基础能力已经完成 MVP：

- `work_order.search`
- `work_order.read`
- `work_order.create`
- `work_order.update`
- `work_order.archive`
- `work_order.writeback_draft.create`
- `work_order.writeback.apply`

已实现的关键行为：

- 自然语言可进入 task mode。
- 缺工单号时能追问。
- 搜索多个候选时能让用户选候选。
- 用户回复工单号或“第 1 个”后能继续执行。
- 写入类动作不再默认停在人工确认，而是会生成写回草案、自动 approve/apply，并记录 `changedObjects`。
- 多步任务可走 capability step plan，例如“先查工单，再修改下一步/状态”。

直接工具 smoke 已验证：

```text
document.create
document.search
document.read
document.write_content
work_order.create
work_order.search
```

工单更完整的端到端脚本仍在：

```powershell
docker exec -e BPAI_BASE_URL=http://localhost:3000 bpai-front-dev npm run smoke:bp-ask:work-order-mutation
```

这份脚本较长、会真实改 demo 工单数据，适合大改后跑。

## 5. 文档基础 Tool Calling

当前文档基础能力已经完成 MVP：

- `document.search`
- `document.read`
- `document.create`
- `document.write_content`

已实现的关键行为：

- BP问问可搜索文档/表格/演示文稿资产。
- 搜索出现多个候选时，会生成候选追问。
- 用户回复“第 1 份”或文档 ID 后，会把 `documentId` 写回 step plan。
- 如果任务语义里有“后续写入”，但第一轮模型只规划了 `document.search`，用户选中文档后会自动补入 `document.write_content` step。
- 缺写入内容时会追问 content。
- 用户补内容后会调用 `document.write_content` 并持久化。
- 候选选择后的重复 `document.search` 已处理：如果已有 `documentId`，执行机跳过重复搜索，不再反复追问同一批候选。

本轮 Docker 内完整验证：

```powershell
docker exec -e BPAI_BASE_URL=http://localhost:3000 bpai-front-dev npm run smoke:bp-ask:document-chain
```

通过结果覆盖：

```text
bp-ask document.search ambiguous followup
bp-ask document candidate continuation
bp-ask document.write_content content followup
bp-ask document.write_content persistence
```

## 6. 当前还不能算完成的边界

### 6.1 表格单元格编辑还没做

当前 `document.write_content` 的实现是：

```text
overwriteAssetTextContent(kind, assetId, text)
```

也就是把资产文件内容整体覆盖为 UTF-8 文本。

这对 `.txt` 或测试文本类文档可以成立，但对 `.xlsx/.docx/.pptx` 这类 Office 二进制文件，不能等价于“改单元格”或“改文档段落”。所以目前不能让 BP问问可靠执行：

```text
把 sheet-new.xlsx 里 B2 改成长沙南
给异常跟踪表追加一行
把状态列里待补件改成已完成
按项目名查行并改负责人
```

后续应该新增专门 sheet capability：

- `sheet.read_range`
- `sheet.update_cells`
- `sheet.append_rows`
- `sheet.find_rows`

这部分需要基于 `.xlsx` 解析/写回库或 OnlyOffice 后端保存机制单独实现。

### 6.2 Longxia fallback 已有方向，但仍需闭环

当前已有：

- Longxia adapter
- handoff payload
- `ready_to_delegate` 终态
- AI宿舍侧展示和任务记录方向

但还需要继续打磨：

- Longxia 结果如何继续回流 BP问问下一轮判断。
- Longxia 是否可多轮追问。
- Longxia 产物、候选写回、确认项如何稳定进入同一套 execution result。
- 外部任务失败后，BP问问如何重新规划而不是直接结束。

### 6.3 模型不可用时仍会影响自然规划

当前脚本里有 deterministic smoke 绕开外部模型不稳定性，但真实用户自然语言规划仍依赖：

- `planAiCapabilityStepsWithModel`
- `planAiCapabilityWithModel`
- `dispatchBpAskPrompt`

如果模型 API fetch failed，系统会 fallback 到旧 dispatch 或模拟路径。因此：

- 基础工具本身可用。
- BP问问自然语言理解质量仍取决于模型服务可用性。
- 关键主链需要继续减少“模型没规划好就断掉”的情况。

## 7. 本 checkpoint 已验证命令

本轮已在 Docker `bpai-front-dev` 容器内跑过：

```powershell
docker exec bpai-front-dev npm run typecheck
docker exec -e BPAI_BASE_URL=http://localhost:3000 bpai-front-dev npm run smoke:ai-tools:registry
docker exec -e BPAI_BASE_URL=http://localhost:3000 bpai-front-dev npm run smoke:ai-tools:direct-mutation
docker exec -e BPAI_BASE_URL=http://localhost:3000 bpai-front-dev npm run smoke:bp-ask:document-chain
```

验证结果：

- `typecheck` 通过。
- `ai-tools:registry` 通过，当前 13 个 capability。
- `ai-tools:direct-mutation` 通过，覆盖文档基础工具和工单 create/search。
- `bp-ask:document-chain` 通过，覆盖文档搜索候选、候选选择、追问内容、写入持久化。

注意：`smoke:bp-ask:work-order-mutation` 本轮没有作为最后一步重跑；它是工单端到端主脚本，适合大改工单链路后单独跑。

## 8. 下一步建议

优先级从高到低：

1. 补 `sheet.*` capability，让 BP问问能真正改表格单元格和追加行。
2. 继续把 Longxia fallback 从 dry-run/handoff 做成完整回流闭环。
3. 给 BP问问补更多 deterministic smoke，减少测试对外部模型响应的依赖。
4. 梳理 `dispatch_plan` fallback，让模型不可用时也能覆盖更多常见工具场景。
5. 把 UI 上 toolRuns、changedObjects、followup 状态显示得更清楚，方便人类验收。

## 9. 一句话交接

如果下一位开发者接手，当前不要再从“BP问问会不会真的调用工具”开始怀疑；现在应该默认它已经具备工单/文档基础 Tool Calling 主链。后续主要问题是扩能力边界：表格精细编辑、Longxia 闭环、模型失败 fallback、以及更多端到端 smoke。
