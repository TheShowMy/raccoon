# 🦝 raccoon

Rust 多 Agent 编排器，前后端分离架构。

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Axum + SQLx + Tokio + SQLite |
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS |

## 开发启动

```bash
npm run dev
```

同时启动：
- 后端 Axum 服务：`http://0.0.0.0:3003`
- 前端 Vite 开发服务器：`http://localhost:5133`

## 打包

```bash
npm run package
```

输出到 `dist/` 目录，包含各平台启动入口：

| 平台 | 启动方式 |
|------|---------|
| macOS | 双击 `dist/start.command` |
| Linux | `./dist/start.sh` |
| Windows | 双击 `dist/start.bat` 或运行 `dist/start.ps1` |

## 目录结构

```
raccoon/
├── Cargo.toml              # Rust 后端配置
├── package.json            # 根目录脚本
├── raccoon-icon.png        # 应用图标
├── src/                    # Rust 后端源码
│   ├── main.rs             # Axum 服务 + 静态文件托管
│   └── db.rs               # SQLite 数据库
├── frontend/               # Vite 前端
│   ├── vite.config.ts      # Vite 配置（端口 5133，API 代理）
│   └── src/App.tsx         # 主界面
└── scripts/
    └── package.js          # 打包脚本
```

## API

- `GET /api/health` — 健康检查
