# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指引。

## 常用命令

- `npm start` — 启动 Express 服务器（默认端口 3000，可通过 `.env` 配置）
- `npm install` — 安装依赖

项目未配置测试框架或代码检查工具。

## 架构

这是一个单页 Web 应用，通过外部 AI API 从文字或图片生成 3D 模型。服务端作为浏览器与第三方服务之间的 API 代理。

**文字生成 3D 的请求流程：**
1. 浏览器将用户描述 POST 到 `/api/generate-text`
2. `server.js` 调用 DeepSeek API 将描述优化为英文 3D 提示词
3. `server.js` 调用 Meshy API 创建 text-to-3d 任务，返回任务 ID
4. 浏览器每 3 秒轮询 `/api/task/:id`，直到状态为 `SUCCEEDED`
5. `script.js` 将 GLB 模型 URL 加载到 Three.js 查看器中

**图片生成 3D 的请求流程：** 流程相同，但通过 multipart 表单将图片上传到 `/api/generate-image`，服务端将其转为 base64 发送到 Meshy 的 image-to-3d 接口。

**关键设计细节：**
- `server.js` 在内存中维护 `taskTypes` 映射表，用于将任务状态轮询路由到正确的 Meshy 接口（text-to-3d 或 image-to-3d）
- Three.js 查看器（r128）在首次加载模型时懒初始化，通过 CDN script 标签引入（未使用打包工具）
- `script.js` 中的 `loadModel()` 通过包围盒计算自动居中并归一化模型缩放
- 前端代码全部使用全局 `THREE.*` 命名空间（非模块化模式）

## 外部 API

- **DeepSeek** (`https://api.deepseek.com/chat/completions`) — 提示词优化，模型 `deepseek-chat`
- **Meshy** (`https://api.meshy.ai/openapi/v2/`) — 3D 生成。任务状态：`PENDING`、`IN_PROGRESS`、`SUCCEEDED`、`FAILED`、`EXPIRED`

API 密钥存储在 `.env` 中，变量名为 `DEEPSEEK_API_KEY` 和 `MESHY_API_KEY`。
