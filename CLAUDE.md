# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指引。

## 常用命令

- `npm start` — 启动 Express 服务器（默认端口 3000，可通过 `.env` 配置）
- `npm install` — 安装依赖

项目未配置测试框架或代码检查工具。

## 架构

这是一个单页 Web 应用，通过外部 AI API 从文字或图片生成 3D 模型，以及从文字生成图片。服务端作为浏览器与第三方服务之间的 API 代理。

**文字生成 3D 的请求流程：**
1. 浏览器将用户描述 POST 到 `/api/generate-text`
2. `server.js` 调用 DeepSeek API 将描述优化为英文 3D 提示词（`optimizePrompt()`）
3. `server.js` 调用 Meshy API 创建 text-to-3d 任务，返回任务 ID
4. 浏览器每 3 秒轮询 `/api/task/:id`，直到状态为 `SUCCEEDED`
5. `script.js` 通过 `/api/proxy-model` 代理加载 GLB 模型到 Three.js 查看器中

**图片生成 3D 的请求流程：** 流程相同，但通过 multipart 表单将图片上传到 `/api/generate-image`，服务端将其转为 base64 发送到 Meshy 的 image-to-3d v1 接口。

**文字生成图片的请求流程：**
1. 浏览器将描述、模型名称（`nano-banana` / `nano-banana-pro`）和宽高比 POST 到 `/api/generate-text-to-image`
2. `server.js` 调用 DeepSeek API 将描述优化为英文图片提示词（`optimizeImagePrompt()`）
3. `server.js` 调用 Meshy text-to-image v1 API 创建任务，返回任务 ID
4. 浏览器每 3 秒轮询 `/api/task/:id`，直到状态为 `SUCCEEDED`
5. `script.js` 将返回的 `image_urls` 展示在图片预览面板中

**关键设计细节：**
- `server.js` 在内存中维护 `taskTypes` 映射表，用于将任务状态轮询路由到正确的 Meshy 接口（`text-to-3d`、`image-to-3d` 或 `text-to-image`）
- `/api/proxy-model` 端点代理获取 GLB 文件，解决 CORS 跨域问题
- Three.js 查看器（r128）在首次加载模型时懒初始化，使用 `requestAnimationFrame` 确保布局完成后再初始化，通过 CDN script 标签引入（未使用打包工具）
- 渲染器使用 ACES 色调映射（`ACESFilmicToneMapping`），曝光度 1.2
- `script.js` 中的 `loadModel()` 通过缩放后重新计算包围盒实现精确居中，底部对齐地面
- 轮询结果根据 `task_type` 字段区分处理：3D 任务加载模型查看器，图片任务展示图片预览
- 前端代码全部使用全局 `THREE.*` 命名空间（非模块化模式）

## 外部 API

- **DeepSeek** (`https://api.deepseek.com/chat/completions`) — 提示词优化，模型 `deepseek-chat`
- **Meshy text-to-3d** (`https://api.meshy.ai/openapi/v2/text-to-3d`) — 文字生成 3D
- **Meshy image-to-3d** (`https://api.meshy.ai/openapi/v1/image-to-3d`) — 图片生成 3D
- **Meshy text-to-image** (`https://api.meshy.ai/openapi/v1/text-to-image`) — 文字生成图片，支持 `nano-banana` 和 `nano-banana-pro` 模型

任务状态：`PENDING`、`IN_PROGRESS`、`SUCCEEDED`、`FAILED`、`EXPIRED`

API 密钥存储在 `.env` 中，变量名为 `DEEPSEEK_API_KEY` 和 `MESHY_API_KEY`。
