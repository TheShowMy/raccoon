# 技术栈

前后端分离，Rust 为主。

## 后端

| 技术 | 用途 |
|------|------|
| Axum | Web 框架（REST / WebSocket / SSE） |
| SQLx | 数据库访问，编译期检查 SQL |
| Tokio | 异步运行时，子进程监管 |
| Serde | JSONL / YAML 序列化 |
| git2 / 命令行 | Git worktree 管理 |
| SQLite | Job、Task、Session 索引和费用 |

## 前端

| 技术 | 用途 |
|------|------|
| React 19 + TypeScript | UI 框架 |
| Vite | 构建工具 |
| shadcn/ui + Tailwind CSS | UI 组件 |
| Zustand | 状态管理 |
| React Flow | DAG 可视化 |
| Monaco Editor | 代码 Diff |

## 实时通信

WebSocket（控制）+ SSE（状态流）
