# ⚾ 棒球规则知识问答系统 (baseballLLMWiki)

基于 **全 TypeScript + LangChain v1** 的局域网 RAG 知识问答系统：以《棒球规则 2022 版（中国棒球协会）》为内置知识源，支持上传 PDF / TXT / MD / DOCX 规则文件或案例扩充知识库；默认接入局域网 Ollama 的 `qwen3.5:9b`（生成）与 `qwen3-embedding:4b`（向量化），并可在设置页接入任意 OpenAI 兼容大模型（如 DeepSeek）。

## ✨ 功能特性

- **检索增强问答**：规则感知切分（按“规则 X.XX”条文与术语定义条目分块，保留章节/页码元数据）→ 向量检索（余弦相似度 + 相关度阈值 + 类型过滤）→ 流式回答（SSE），答案引用规则条号/页码/文档名，附来源卡片。
- **多轮追问**：基于对话历史自动改写问题（history-aware condensing）。
- **知识库管理**：上传（自动解析、向量化、索引）、删除、单文档重建、全部重建；同内容文件按 SHA-256 去重；索引进度实时可见。
- **多模型接入**：
  - Ollama 类型：连接局域网内任意 Ollama 服务（默认 `http://192.168.5.19:11434`），支持 `think` 思维链开关、`numCtx` 上下文长度等参数。
  - OpenAI 兼容类型：DeepSeek（`https://api.deepseek.com`）、通义、Moonshot 等，API Key 加密存储、UI 掩码显示。
- **历史会话**：消息持久化到 SQLite，刷新页面可恢复当前对话。

## 🧱 技术栈与版本

| 用途 | 包 | 版本 |
|---|---|---|
| 框架 | langchain / @langchain/core / @langchain/classic / @langchain/textsplitters | 1.5.9 / 1.2.8 / ^1 / 1.0.1 |
| Ollama | @langchain/ollama | 1.3.0 |
| OpenAI 兼容 | @langchain/openai | 1.5.8 |
| PDF / DOCX | pdf-parse / mammoth | 2.4.5 / 1.12.1 |
| 数据库 | better-sqlite3 | 12.11.1（须 <13，兼容 @langchain/community） |
| 服务端 | express / multer / cors / zod / dotenv | 5.2 / 2.2 / 2.8 / 3.25 / 16 |
| 前端 | react / antd / react-markdown / vite | 19 / 6 / 10 / 8 |

## 📁 目录结构

```
baseballLLMWiki/
├── docs/棒球规则2022版-中国棒球协会.pdf   # 内置知识源（首次启动自动索引）
├── src/shared/        # 前后端共享类型与提示词
├── src/server/
│   ├── db/            # SQLite 连接、建表、Repository、默认数据
│   ├── llm/           # Provider 抽象：Ollama / OpenAI 兼容 / 加密 / 工厂
│   ├── ingestion/     # 解析(parse) → 规则感知切分(split) → 嵌入(embed) → 索引(indexer)
│   ├── retrieval/     # SqliteVectorStore（LangChain VectorStore 子类）、retriever、RAG 流水线
│   └── routes/        # health / chat(SSE) / documents / providers / settings
├── src/client/        # Vite + React + antd 前端（问答 / 知识库 / 模型设置）
├── scripts/           # index-docs.ts（离线索引 CLI）、smoke.ts（端到端冒烟测试）
└── data/              # 运行时生成：wiki.db、uploads/、.secret（已 gitignore）
```

## 🚀 快速开始

### 环境要求

- Node.js ≥ 22（本机为 `/opt/homebrew/opt/node@24/bin/node`，v24）
- 局域网内 Ollama 服务（默认 `192.168.5.19:11434`）已拉取模型：
  - `qwen3.5:9b`（聊天，支持 thinking）
  - `qwen3-embedding:4b`（嵌入，2560 维）

### 安装

```bash
# 若本机 ~/.npm 权限异常（npm 报 EACCES/ERESOLVE），加 --cache 指定可写缓存
npm install --cache /tmp/npm-cache
```

### 配置

复制 `.env.example` 为 `.env` 并按需修改：

```bash
PORT=3000
HOST=0.0.0.0                  # 0.0.0.0 允许局域网访问
DATA_DIR=data
OLLAMA_BASE_URL=http://192.168.5.19:11434
EMBEDDING_MODEL=qwen3-embedding:4b
EMBEDDING_DIMENSIONS=2560
DEFAULT_CHAT_MODEL=qwen3.5:9b
SECRET=                        # 留空则自动生成（用于加密 API Key）
```

### 启动

```bash
npm start        # 生产运行（tsx 直接运行，端口 3000）
# 或
npm run dev      # 开发模式：Express(3000) + Vite(5173，代理 /api)
```

首次启动会自动把 `docs/` 下的规则 PDF 解析、切分、向量化入库（约 1–2 分钟，日志可见）。之后浏览器访问：

- 本机：`http://localhost:3000`
- 局域网：`http://<运行本服务机器的IP>:3000`

## 🎯 使用说明

### 问答页
输入问题回车发送（Shift+Enter 换行）。回答流式显示，下方为来源卡片（规则条号/章节/页码/文档名/相关度，可展开原文摘录）。右上角可切换当前模型；多轮追问自动结合历史。

### 知识库页
- 拖拽或点击上传 PDF/TXT/MD/DOCX（≤50MB），可选“自动判断 / 规则文件 / 案例”类型。
- 每行可“重建”或“删除”；“全部重建索引”用于更换嵌入模型后重新向量化。
- 索引进度实时刷新；失败的文档会显示原因（如“扫描版 PDF 无法提取文字”）。

### 模型设置页
- **添加模型**：Ollama（baseUrl + 模型名 + think/numCtx 等）或 OpenAI 兼容（baseUrl + API Key + 模型名），保存后可“测试连接”。
- 示例：DeepSeek → 类型 `OpenAI 兼容`，Base URL `https://api.deepseek.com`，模型 `deepseek-chat` 或 `deepseek-reasoner`。
- 检索参数：TopK、相关度阈值、是否检索案例、历史轮数、系统提示词。

## 🔌 HTTP API 一览

| 方法/路径 | 说明 |
|---|---|
| GET /api/health | 服务与 Ollama 状态、模型列表、索引统计 |
| POST /api/chat/stream | SSE 聊天：`{question, conversationId?, providerId?, topK?, threshold?}` |
| GET /api/documents | 文档列表（状态/块数/错误） |
| POST /api/documents | 多文件上传（multipart，字段 `files`，可选 `type`） |
| DELETE /api/documents/:id | 删除文档与分块 |
| POST /api/documents/:id/reindex | 单文档重建 |
| POST /api/documents/reindex-all | 全部重建 |
| GET/POST/PUT/DELETE /api/providers | Provider CRUD；POST /:id/test 连通测试 |
| GET/PUT /api/settings | 检索/嵌入/提示词设置 |
| GET /api/conversations/:id/messages | 会话消息 |

SSE 事件：`status`（condensing/retrieving/generating）→ `sources` → 多个 `delta` → `done` 或 `error`。

## 🧪 测试

```bash
npm test          # 单元 + API 测试（vitest，14 个用例，无需外部依赖）
npm run smoke     # 端到端冒烟测试（需真实 Ollama）：索引 → 3 个代表性问题 → 断言引用
npm run index:docs # 离线（重）索引 docs/ 目录（--force 强制重建）
```

## ❓ 常见问题

- **Ollama 不可达 / 顶栏显示“离线”**：检查 `192.168.5.19:11434` 连通性与 .env 配置；服务端直连 Ollama，无需浏览器直连。
- **上传的 PDF 索引失败**：多为扫描件/图片型 PDF，请上传可复制文字的版本。
- **更换了嵌入模型**：到“知识库”页执行“全部重建索引”（旧向量与新模型维度/分布不兼容）。
- **回答不确定/找不到依据**：适当调高 TopK、调低相关度阈值，或检查“检索包含案例”开关；系统会在低置信时明确提示。
- **端口被占用**：修改 .env 的 PORT；清残留进程：`lsof -ti:3000 | xargs kill -9`。

## 📄 License

内部工具，无账号体系；如需公网暴露请自行加鉴权（如反向代理 Basic Auth）。
