# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目

raccoon：Rust 多 Agent 编排器，通过 JSONL RPC 管理 Pi Agent 子进程。

## 启动项目

npm run dev

## 文档

- 架构核心：[docs/ARCHITECTURE_CORE.md](docs/ARCHITECTURE_CORE.md)
- 技术栈：[docs/spec/TECH_STACK.md](docs/spec/TECH_STACK.md)

> **何时读取技术栈文档**：初始化项目、引入新依赖、技术选型变更前，先读 `docs/spec/TECH_STACK.md` 确认选型。

## 做什么

- 用 Rust 写编排器，不碰 Pi Agent 本身
- **所有与 Pi Agent 的交互必须通过持久 RPC 子进程进行**：`pi --mode rpc`，stdin/stdout JSONL 通信
- 每个 Task 用独立 Git worktree 隔离代码
- 默认用低价模型，失败时按状态机升级（重试 → Coordinator 指导 → set_model → 新 Specialist）
- 确定性验收：测试、lint、build、schema 验证通过才算完成
- Agent 身份用 YAML Profile 定义（模型、工具白名单、扩展、预算）

## 不做什么

- 不要把 Pi Agent 移植成 Rust
- 不要用 gRPC，只走 stdin/stdout JSONL
- 不要用 Docker 隔离代码，只用 Git worktree
- 不要让 LLM 自我评估任务完成
- 不要把浏览器能力默认注入所有 coding worker
- 不要把高价模型设为默认 worker
- 不要把项目私有数据硬编码进共享 skill
- **禁止直接执行 `pi --list-models` 等一次性命令获取数据** — 必须通过 RPC 子进程调用对应命令（如 `get_available_models`）

## 绝对规则

- **所有新增代码必须通过 pre-commit 规则检查。** 提交代码时禁止绕过或忽略 pre-commit 钩子（如 `git commit --no-verify`）。如果 pre-commit 失败，必须先修复问题再提交。
- **测试截图必须保存到 `/tmp` 目录，不得提交到仓库。** 每次开始新的 UI 测试任务前，先清空 `/tmp` 中的旧截图（`rm -f /tmp/raccoon-test-*.png`），避免文件无限膨胀。
- **web测试使用chrome-devtools mcp。**- ** web测试请使用chrome-devtools mcp。
