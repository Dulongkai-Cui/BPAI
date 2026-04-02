# Docker 前端使用说明

当前项目前端已拆成两套 Docker 运行模式：

## 1. prod 模式
用于稳定预览 / 验收。

- 地址：`http://localhost:3000`
- 特点：接近正式部署效果
- 启动命令：

```bash
docker compose up --build -d
```

## 2. dev 模式
用于日常前端开发，支持热更新。

- 地址：`http://localhost:3001`
- 特点：改 `frontend/` 代码后通常会自动刷新
- 启动命令：

```bash
docker compose -f docker-compose.dev.yml up -d
```

## 常用页面

- 文档列表：`http://localhost:3000/docs/documents`
- 表格列表：`http://localhost:3000/docs/sheets`
- 文档列表（dev）：`http://localhost:3001/docs/documents`
- 表格列表（dev）：`http://localhost:3001/docs/sheets`

## 常用命令

查看 dev 日志：

```bash
docker logs -f bpai-front-dev
```

查看 prod 日志：

```bash
docker logs -f bpai-front-static
```

停止 dev：

```bash
docker compose -f docker-compose.dev.yml down
```

停止 prod：

```bash
docker compose down
```
