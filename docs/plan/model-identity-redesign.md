# 模型身份管理重构计划

## 需求理解

用户要的不是简单的 Pi settings.json 编辑，而是一个**模型身份（Model Identity）管理系统**：

1. **显示已配置模型列表** - 从 `pi --list-models` 获取可用模型
2. **同一供应商多模型单独展示** - 每个模型一行
3. **每个模型可配置多个身份** - 如 "快速模式"、"深度模式"
4. **每个身份包含**：thinking level、启用状态、自定义名称
5. **用于 raccoon 路由** - 启动 Pi Agent 时选择对应身份参数

## 数据模型

### Model Identity（模型身份）
```
id: INTEGER PRIMARY KEY
name: TEXT              -- 身份名称，如"编码助手"
provider: TEXT          -- Pi provider ID
model: TEXT             -- Pi model ID
thinking_level: TEXT    -- off/minimal/low/medium/high/xhigh
enabled: BOOLEAN        -- 是否启用
sort_order: INTEGER     -- 排序
created_at: TEXT
```

### Pi 可用模型（运行时获取）
从 `pi --list-models` 解析：
```
provider     model              context  max-out  thinking  images
deepseek     deepseek-v4-flash  1M       384K     yes       no
deepseek     deepseek-v4-pro    1M       384K     yes       no
kimi-coding  kimi-for-coding    262.1K   32.8K    yes       yes
```

## 后端 API

### GET /api/models
获取 Pi 可用模型列表（执行 `pi --list-models` 解析）。

```json
{
  "success": true,
  "data": [
    {
      "provider": "deepseek",
      "model": "deepseek-v4-flash",
      "context": "1M",
      "max_out": "384K",
      "thinking": true,
      "images": false
    }
  ]
}
```

### GET /api/model-identities
获取已配置的模型身份列表。

### POST /api/model-identities
创建新身份。

```json
{
  "name": "深度模式",
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "thinking_level": "high",
  "enabled": true
}
```

### PUT /api/model-identities/:id
更新身份。

### DELETE /api/model-identities/:id
删除身份。

## 前端设计

### 模型设置 Tab（重新设计）

```
┌─────────────────────────────────────────────────────────┐
│ 可用模型                                                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🤖 deepseek-v4-flash        身份: 2  启用: 1        │ │
│ │    上下文: 1M  支持思考  不支持图片                   │ │
│ │    [+ 添加身份]                                       │ │
│ │                                                     │ │
│ │    ┌───────────────────────────────────────────┐   │ │
│ │    │ ⚡ 快速模式                                │   │ │
│ │    │ Thinking: low   已启用 ✓  [编辑] [删除]   │   │ │
│ │    └───────────────────────────────────────────┘   │ │
│ │    ┌───────────────────────────────────────────┐   │ │
│ │    │ 🔍 深度模式                                │   │ │
│ │    │ Thinking: high  已启用 ✓  [编辑] [删除]    │   │ │
│ │    └───────────────────────────────────────────┘   │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🤖 kimi-for-coding            身份: 1  启用: 1      │ │
│ │    上下文: 262.1K  支持思考  支持图片                 │ │
│ │    [+ 添加身份]                                       │ │
│ │                                                     │ │
│ │    ┌───────────────────────────────────────────┐   │ │
│ │    │ 📝 编码助手                                │   │ │
│ │    │ Thinking: medium  已启用 ✓  [编辑] [删除]  │   │ │
│ │    └───────────────────────────────────────────┘   │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 添加/编辑身份弹窗

```
┌─────────────────────────────┐
│ 添加身份                     │
├─────────────────────────────┤
│ Provider: deepseek          │
│ Model: deepseek-v4-flash    │
│                             │
│ 身份名称: [快速模式         ]│
│ Thinking Level: [low ▼]     │
│ 启用: [✓]                   │
│                             │
│ [取消] [保存]               │
└─────────────────────────────┘
```

## 实现步骤

1. **后端**：
   - 新增 `model_identities` SQLite 表
   - 新增 `GET /api/models`（执行 `pi --list-models` 并解析）
   - 新增 `GET/POST/PUT/DELETE /api/model-identities`

2. **前端**：
   - 重写 SettingsPanel 的「模型设置」Tab
   - 显示可用模型列表 + 身份卡片
   - 添加/编辑/删除身份弹窗

3. **启动 Pi 时**：
   - 根据选中的身份构造 `--provider`、`--model`、`--thinking` 参数
