# 实现计划：项目选中持久化 + Pi 模型配置

## Pi Agent 模型配置调研结果

### Pi 配置文件
- 路径：`~/.pi/agent/settings.json`
- 格式：
  ```json
  {
    "lastChangelogVersion": "0.78.0",
    "defaultProvider": "kimi-coding",
    "defaultModel": "kimi-for-coding",
    "defaultThinkingLevel": "high"
  }
  ```
- 可配置字段：`defaultProvider`, `defaultModel`, `defaultThinkingLevel`

### RPC 动态模型切换
- `set_model`：切换模型
- `get_available_models`：列出可用模型
- `set_thinking_level`：设置思考级别

---

## 需求 1：项目选中状态持久化

### 方案
- 使用 `localStorage` 存储 `raccoon:currentProjectId`
- 页面加载时：
  1. 先从 localStorage 读取上次选中的项目 ID
  2. 如果该 ID 在当前项目列表中存在，则选中它
  3. 如果不存在（或被删除），则选中第一个项目（如果有）
- 用户点击切换项目时，同步写入 localStorage

### 修改文件
- `frontend/src/stores/useAppStore.ts` — 添加持久化逻辑

---

## 需求 2：Pi 模型配置页面

### 后端 API（新增）

```rust
// GET /api/settings — 读取 Pi 配置
Response: {
  "success": true,
  "data": {
    "defaultProvider": "kimi-coding",
    "defaultModel": "kimi-for-coding",
    "defaultThinkingLevel": "high"
  }
}

// POST /api/settings — 更新 Pi 配置
Body: {
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-6",
  "defaultThinkingLevel": "medium"
}
```

- 读取 `~/.pi/agent/settings.json`
- 写入时保留其他字段（如 `lastChangelogVersion`），只更新模型相关字段

### 前端设置弹窗改造

#### 弹窗尺寸
- `max-w-lg` (512px) → `max-w-2xl` (672px) 或 `max-w-3xl` (768px)

#### 模型配置表单
| 字段 | 类型 | 说明 |
|------|------|------|
| Provider | 下拉选择 | anthropic, openai, google, kimi-coding 等 |
| Model | 下拉选择/输入 | 根据 provider 动态变化，也支持自定义输入 |
| Thinking Level | 下拉选择 | off, minimal, low, medium, high, xhigh |

#### 交互逻辑
1. 打开设置弹窗时，调用 GET /api/settings 加载当前配置
2. 用户修改后点击保存，调用 POST /api/settings
3. 保存成功后显示成功提示
4. 错误时显示错误提示

### 修改/新增文件
- `src/main.rs` — 新增 settings handler
- `frontend/src/api/client.ts` — 新增 settings API 函数
- `frontend/src/components/SettingsPanel.tsx` — 改造为模型配置页面

---

## 优先级

| 优先级 | 内容 |
|--------|------|
| P0 | 项目选中状态持久化（localStorage） |
| P0 | 后端 API：读取/写入 Pi settings.json |
| P1 | 前端设置弹窗改大 + 模型配置表单 |
| P1 | 设置弹窗加载/保存交互 |

---

## 验收标准

- [ ] 刷新页面后保持之前选中的项目
- [ ] 首次进入有项目时自动选中第一个
- [ ] 设置弹窗显示当前 Pi 模型配置
- [ ] 可以修改 provider/model/thinking level 并保存
- [ ] 设置弹窗尺寸足够容纳配置表单
