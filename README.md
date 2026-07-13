# 3D Model Agent — AI潮玩DIY平台

> 文字生成3D模型 · AI驱动的潮玩创作工具

## 项目简介

用户只需输入文字描述（如"穿宇航服的柯基犬"），AI 自动生成可 360° 预览的 3D 模型，支持下载、分享、发起众筹生产。

## 版本

| 分支 | 内容 | 状态 |
|------|------|------|
| `main` | 当前主力开发分支 | 🚧 |
| `v0.1-trial` | 试水版（基础网页原型） | 📦 归档 |

## 技术栈

- 后端：Node.js (Express) + FastAPI (Python)
- AI：DeepSeek API（提示词优化）+ Meshy API（3D 生成）
- 前端：Three.js（3D 预览）
- 设计：小程序交互原型（HTML/CSS/JS）

## 快速开始

```bash
npm install
npm start
```

## 目录结构

```
├── archive/          # v0.1 试水版归档
├── server.js         # Express 代理服务器
├── index.html        # Web 前端
├── script.js         # 前端交互逻辑
└── style.css         # 样式
```
