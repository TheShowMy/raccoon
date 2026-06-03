# 详细实现计划：项目持久化 + Pi 模型配置

## 一、Pi Agent 配置体系调研结果

### 1.1 配置文件结构

```
~/.pi/agent/
├── settings.json       # 默认模型设置
├── auth.json           # 认证凭据
└── sessions/           # 会话存储
```

### 1.2 settings.json

```json
{
  "lastChangelogVersion": "0.78.0",
  "defaultProvider": "kimi-coding",
  "defaultModel": "kimi-for-coding",
  "defaultThinkingLevel": "high"
}
```

**可配置字段：**
| 字段 | 类型 | 说明 |
|------|------|------|
| `defaultProvider` | string | 默认提供商 ID |
| `defaultModel` | string | 默认模型 ID |
| `defaultThinkingLevel` | string | 思考级别：off/minimal/low/medium/high/xhigh |

### 1.3 auth.json

```json
{
  "deepseek": {
    "type": "api_key",
    "key": "sk-..."
  },
  "kimi-coding": {
    "type": "api_key",
    "key": "sk-..."
  }
}
```

**认证类型：**
| 类型 | 说明 | 存储位置 |
|------|------|----------|
| `api_key` | API Key 认证 | auth.json |
| OAuth token | 订阅型认证（自动刷新） | auth.json |

### 1.4 Provider 分类

**API Key 型（20+ 个）：**
anthropic, openai, deepseek, google, mistral, groq, cerebras, xai, fireworks, together, openrouter, nvidia, cloudflare-workers-ai, cloudflare-ai-gateway, zai, zai-coding-cn, opencode, opencode-go, xiaomi, xiaomi-token-plan-cn, xiaomi-token-plan-ams, xiaomi-token-plan-sgp, minimax, minimax-cn, huggingface, kimi-coding, ant-ling

**OAuth 订阅型（3 个）：**
openai-codex（ChatGPT Plus/Pro）, claude-pro, github-copilot

**云服务特殊型：**
azure-openai, amazon-bedrock, google-vertex-ai

### 1.5 Pi 配置方式对照

| 配置项 | Pi CLI 方式 | raccoon UI 方式 |
|--------|------------|-----------------|
| Provider + Model | `pi --provider x --model y` | 下拉选择 + 输入 |
| API Key | 环境变量 / auth.json | 表单输入写入 auth.json |
| OAuth | `pi /login` | 提示终端执行 |
| Thinking Level | `--thinking high` | 下拉选择 |

---

## 二、需求 1：项目选中状态持久化

### 2.1 方案

使用 `localStorage` 存储 `raccoon:currentProjectId`。

**加载逻辑：**
1. 页面加载，获取项目列表
2. 从 localStorage 读取 `currentProjectId`
3. 如果该 ID 存在于当前列表 → 选中它
4. 如果不存在 → 选中第一个项目（如果有项目）
5. 如果列表为空 → 不选中

**切换逻辑：**
- 用户点击项目时，同步更新 localStorage

### 2.2 修改文件

- `frontend/src/stores/useAppStore.ts`

---

## 三、需求 2：Pi 模型配置页面

### 3.1 设计原则

参考 Pi CLI 的 `/login` 和 `pi config` 交互：
1. **已配置 provider 列表**：展示当前有认证的 provider
2. **添加 provider**：选择 → 输入 api key → 测试 → 保存
3. **默认模型设置**：选择默认 provider + model + thinking level
4. **OAuth 类型**：UI 提示用户在终端执行 `pi /login`，不提供表单

### 3.2 后端 API（新增）

#### GET /api/pi-config
读取 Pi 的完整配置（settings + auth）。

```json
{
  "success": true,
  "data": {
    "settings": {
      "defaultProvider": "kimi-coding",
      "defaultModel": "kimi-for-coding",
      "defaultThinkingLevel": "high"
    },
    "auth": {
      "kimi-coding": { "type": "api_key" },
      "deepseek": { "type": "api_key" }
    }
  }
}
```

**注意：** auth 中不返回 key 值，只返回 provider 和 type，避免泄露密钥。

#### POST /api/pi-config/settings
更新默认模型设置。

```json
// Request
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-6",
  "defaultThinkingLevel": "medium"
}

// Response
{ "success": true }
```

#### POST /api/pi-config/auth
添加/更新 provider 认证。

```json
// Request
{
  "provider": "anthropic",
  "type": "api_key",
  "key": "sk-..."
}

// Response
{ "success": true }
```

#### DELETE /api/pi-config/auth/:provider
删除 provider 认证。

```json
// Response
{ "success": true }
```

### 3.3 后端实现细节

**文件操作：**
- 读取 `~/.pi/agent/settings.json`
- 读取/写入 `~/.pi/agent/auth.json`
- 写入时保留其他字段（如 `lastChangelogVersion`）

**关键逻辑：**
- 修改 settings 时验证 provider 是否已在 auth 中配置（或是否有环境变量）
- 添加 auth 时验证 key 格式（前缀检查）
- 删除 auth 时如果该 provider 是 defaultProvider，需要同步更新或拒绝

### 3.4 前端设置弹窗改造

#### 弹窗尺寸
- `max-w-lg` (512px) → `max-w-3xl` (768px) 或 `max-w-4xl` (896px)
- 高度自适应，最大不超过 80vh，内容多时滚动

#### 页面结构（标签页）

```
┌─────────────────────────────────────────────────────┐
│  ⚙️ 设置                                    [X]     │
├─────────────────────────────────────────────────────┤
│  [模型设置]  [Provider 认证]                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Tab 1: 模型设置                                    │
│  ┌─────────────────────────────────────────────┐   │
│  │ 默认 Provider        [kimi-coding  ▼]       │   │
│  │                                              │   │
│  │ 默认 Model           [kimi-for-coding ▼]    │   │
│  │                                              │   │
│  │ Thinking Level       [high ▼]               │   │
│  │                                              │   │
│  │ [保存设置]                                    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Tab 2: Provider 认证                               │
│  ┌─────────────────────────────────────────────┐   │
│  │ 已配置 Providers                             │   │
│  │ ┌─────────────────────────────────────────┐ │   │
│  │ │ 🟢 kimi-coding    [修改] [删除]        │ │   │
│  │ │ 🟢 deepseek       [修改] [删除]        │ │   │
│  │ └─────────────────────────────────────────┘ │   │
│  │                                              │   │
│  │ [+ 添加 Provider]                             │   │
│  │                                              │   │
│  │ 添加 Provider:                               │   │
│  │ Provider: [anthropic ▼]                      │   │
│  │ Auth Type: API Key                           │   │
│  │ API Key: [sk-...                    ]        │   │
│  │ [保存]                                       │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Tab 1 - 模型设置：**
- 默认 Provider：下拉选择（已配置的 provider 列表）
- 默认 Model：输入框（带常用模型建议）
- Thinking Level：下拉选择（off/minimal/low/medium/high/xhigh）
- 保存按钮

**Tab 2 - Provider 认证：**
- 已配置列表：显示 provider 名称、认证类型、操作按钮（修改/删除）
- 添加新 Provider：
  - Provider 下拉（所有支持的 provider）
  - 选择后自动判断认证类型：
    - API Key 型：显示 API Key 输入框
    - OAuth 型：显示提示"请在终端运行 `pi /login` 配置"
    - 云服务型：显示额外字段（如 Azure 的 base URL）

### 3.5 修改/新增文件

**后端：**
- `src/main.rs` — 新增 pi-config handler（读取/写入）

**前端：**
- `frontend/src/api/client.ts` — 新增 pi-config API 函数
- `frontend/src/components/SettingsPanel.tsx` — 重做为模型配置弹窗
- `frontend/src/stores/useAppStore.ts` — 可能新增 piConfig 状态

---

## 四、优先级与阶段

### Phase 1：项目持久化（P0）
- [ ] useAppStore 添加 localStorage 读写
- [ ] 加载时自动恢复/默认选中第一个

### Phase 2：后端 Pi Config API（P0）
- [ ] GET /api/pi-config（读取 settings + auth）
- [ ] POST /api/pi-config/settings（更新默认模型）
- [ ] POST /api/pi-config/auth（添加/更新认证）
- [ ] DELETE /api/pi-config/auth/:provider（删除认证）

### Phase 3：前端设置弹窗改造（P1）
- [ ] 弹窗尺寸改大
- [ ] 模型设置 Tab（Provider/Model/Thinking Level）
- [ ] Provider 认证 Tab（列表 + 添加/修改/删除）
- [ ] OAuth 类型提示文案

---

## 五、验收标准

- [ ] 刷新页面后保持之前选中的项目
- [ ] 首次进入有项目时自动选中第一个
- [ ] 设置弹窗显示当前 Pi 默认模型配置
- [ ] 可以修改 defaultProvider/defaultModel/defaultThinkingLevel
- [ ] 可以查看已配置的 Provider 列表
- [ ] 可以为 API Key 型 Provider 添加/修改/删除认证
- [ ] OAuth 型 Provider 显示正确的引导文案
- [ ] 设置弹窗尺寸足够容纳所有内容
