# raccoon 架构核心

> 技术栈见 [spec/TECH_STACK.md](spec/TECH_STACK.md)

## 定位

Rust 多 Agent 编排器，通过 JSONL RPC 管理 Pi Agent 子进程，按任务动态装配模型与工具，低价优先、逐层升级。

## 核心决策

- Pi Agent 保留 TypeScript，作为子进程 RPC 调用，不移植
- 通信走 stdin/stdout JSONL
- 代码隔离用 Git worktree
- 验收用确定性检查（测试/lint/build/schema），非 LLM 自评

## 核心概念

- **Profile**：身份模板，定义模型、扩展、工具白名单、预算
- **Job**：用户目标，由 Coordinator 拆分为 DAG
- **Task**：DAG 工作节点，每个对应一个 Pi Session + Git worktree
- **Artifact**：产物（patch、截图、报告）

## 升级策略

低价 Worker → 失败 → 带证据重试 → Coordinator 指导(steer) → set_model 升级 → 新 Specialist 接管

## 角色

| 角色 | 模型 | 职责 |
|------|------|------|
| Coordinator | 高质量 | 拆 DAG、控制升级、汇总 |
| Worker | 低价 | 编码、检索、修复 |
| Reviewer | 中高质量 | 审 diff、验证据 |
| Browser | 低价/中价 | SPA 交互、截图 |
| Vision | 低价 | 图片理解 |

## MVP 阶段

1. **单会话监管**：启动 pi RPC，解析 JSONL，WebSocket 推送
2. **Agent Profile**：YAML 定义，按角色装配
3. **DAG 并发**：拓扑排序、依赖管理、worktree 分配
4. **升级策略**：验收失败 → 重试 → 指导 → set_model → 接管
5. **能力扩展**：Browser、Vision、搜索

## 安全

- 工具白名单 per Profile
- Git worktree 隔离并发任务
- Secrets 分域，生产凭据不下发 Worker
- Job/Task/Session 三级预算限制
- 高风险操作人工审批
- 审计：RPC 事件、模型切换、费用、artifacts

## 验收标准

1. 并行启动 ≥3 个 Pi RPC sessions，Web UI 实时展示
2. 每个 session 独立 Profile，参数可追溯
3. Coordinator 输出 JSON DAG（含依赖+验收条件）
4. 验收失败自动证据重试
5. 重复失败 Coordinator 指导 + steering
6. 支持 set_model 原会话升级
7. UI 按维度展示 token/cost
8. 代码任务独立 worktree，artifact 可下载
