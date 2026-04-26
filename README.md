# BPAI

BPAI 是一套面向工程型组织的 AI 原生工作平台，用来把“需求理解、任务调度、工单推进、文档协作、AI 执行、过程留痕”收束到同一个系统里。

它不是单独的聊天工具，也不是单独的工单系统或资料库，而是围绕真实业务协同链路设计的一体化工作台。当前仓库已经形成 `BP问问`、`工单`、`文档档案室`、`工程队`、`AI宿舍`、`总览` 六个主模块，并以 `Next.js + PostgreSQL + OnlyOffice + OpenClaw` 为主干持续演进。

## 项目定位

- 统一入口：用户优先从自然语言需求进入系统，而不是先判断该去哪个后台页面。
- 状态闭环：任务应当落到工单、执行记录、协作对象上，而不是停留在聊天结果里。
- 内容协作：文档、表格、CAD、附件不是“附件区”，而是业务过程的一部分。
- 受控 AI：AI 默认参与理解、整理、起草、执行，但不默认无边界直写正式对象。

## 当前模块

| 模块 | 作用 | 主要路由 |
| --- | --- | --- |
| BP问问 | 统一入口、意图理解、任务调度 | `/bp-ask` |
| 总览 | 观察全局状态、预警与设置 | `/dashboard` |
| 工程队 | 承接组织化执行与成员编队 | `/engineering` |
| 工单 | 承接状态、责任、阶段推进 | `/work-orders` |
| 文档档案室 | 承接文档、表格、CAD 与协作资产 | `/docs` |
| AI宿舍 | 承接 AI 任务、工作流、Skills、AI 员工与 OpenClaw 发射入口 | `/ai-dorm` |

## 界面预览

### 文档与协作

<p align="center">
  <img src="./项目图片/我的文档空间.png" alt="我的文档空间" width="49%" />
  <img src="./项目图片/空间内编辑器.png" alt="空间内编辑器" width="49%" />
</p>
<p align="center">
  <img src="./项目图片/CAD看图.png" alt="CAD看图" width="49%" />
</p>

### 调度与执行

<p align="center">
  <img src="./项目图片/工单管理.png" alt="工单管理" width="49%" />
  <img src="./项目图片/协同地图.png" alt="协同地图" width="49%" />
</p>
<p align="center">
  <img src="./项目图片/工程队管理面板.png" alt="工程队管理面板" width="49%" />
</p>

### AI 能力

<p align="center">
  <img src="./项目图片/BP问问.png" alt="BP问问" width="49%" />
  <img src="./项目图片/AI宿舍.png" alt="AI宿舍" width="49%" />
</p>
<p align="center">
  <img src="./项目图片/AI员工.png" alt="AI员工" width="49%" />
</p>

## 技术栈

- Web：Next.js 16、React 19、TypeScript、Tailwind CSS 4
- 数据：PostgreSQL / PostGIS、Drizzle ORM
- 文档协作：OnlyOffice Document Server
- AI 执行侧：OpenClaw 网关、多 agent 状态目录、任务调度接口
- CAD 实验区：Vite、Vue 3、Element Plus、Three.js、mlightcad
- 开发环境：Docker Compose、Node.js 20+

## 仓库结构

```text
BPAI/
|-- frontend/                   # 主应用；当前主要开发都在这里
|   |-- src/app/                # 页面与 API 路由
|   |-- src/lib/                # 业务域能力、数据访问、服务封装
|   |-- cad-lab/                # CAD 实验区
|   `-- scripts/                # 数据库与 smoke scripts
|-- docker/
|   `-- openclaw/               # OpenClaw 共享配置与多实例状态目录
|-- explanatory_memorandum/     # 产品说明手册与架构使用文档
|-- AI_Dev_Memo/                # 开发过程记录与产品骨架资料
|-- Construction_ Specification/# 建设规范与过程材料
|-- docker-compose.dev.yml      # 本地开发编排
|-- docker-compose.yml          # 基础前端镜像编排
`-- README.md
```

当前运行主路径以 `frontend/` 和 `docker-compose.dev.yml` 为主，仓库里也保留了一些原型、过程文档和参考目录。

## 快速开始

### 方式一：推荐使用 Docker 开发环境

1. 复制环境变量模板。

```powershell
Copy-Item frontend/.env.local.example frontend/.env.local
```

2. 启动开发环境。

```powershell
docker compose -f docker-compose.dev.yml up --build
```

3. 打开服务。

- 前端：`http://localhost:3001`
- OnlyOffice：`http://localhost:8080`
- PostgreSQL：`localhost:5433`

如果你需要把 OpenClaw 一起拉起来，可以使用：

```powershell
docker compose -f docker-compose.dev.yml --profile openclaw up --build
```

### 方式二：直接在前端目录运行

适合只改前端或脚本逻辑时使用，但前提是你已经准备好数据库等依赖。

```powershell
cd frontend
Copy-Item .env.local.example .env.local
npm install
npm run db:migrate
npm run dev
```

运行要求：

- Node.js `>= 20.9.0`
- 可用的 PostgreSQL 数据库
- 需要 BP问问“大总管”AI 能力时，优先补充 `DEEPSEEK_API_KEY` 等环境变量；Kimi / Moonshot 仍保留为 BP问问回退与 AI员工侧配置。

## 核心环境变量

`frontend/.env.local.example` 当前提供了最基础的一组变量：

```env
NEXT_PUBLIC_APP_NAME=BPAI
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
DATABASE_URL=postgresql://bpai:bpai@localhost:5433/bpai_dev
BPASK_MODEL_PROVIDER=deepseek
DEEPSEEK_API_KEY=your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
KIMI_API_KEY=your-kimi-api-key
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODEL=kimi-k2.5
```

`BPASK_MODEL_PROVIDER` 只控制 BP问问；AI宿舍里的龙虾员工继续走 OpenClaw/Moonshot 配置，启用时还需要配合 `docker-compose.dev.yml` 中的 `OPENCLAW_*` 网关变量。

## 常用命令

在 `frontend/` 目录下：

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run db:check
npm run db:migrate
npm run db:seed:work-orders
npm run smoke:bp-ask
npm run smoke:bp-ask:dispatch
npm run smoke:engineering
npm run smoke:work-orders
npm run cad:lab:dev
npm run cad:lab:build
```

## 文档

- 产品说明手册：[explanatory_memorandum/BPAI_产品说明手册_架构设计与使用指南_2026-04-16.md](explanatory_memorandum/BPAI_产品说明手册_架构设计与使用指南_2026-04-16.md)

如果你把这个仓库当作品集展示，建议先看产品说明手册，再结合 `frontend/src/app/` 和 `frontend/src/lib/` 阅读主链实现。
