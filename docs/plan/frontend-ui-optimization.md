# 前端 UI 优化方案

## 问题诊断

### 1. 项目 Item 显示不完全（核心问题）
- **Git URL 截断**：`https://github.com/TheShowMy/rac...` 用户无法识别仓库
- **侧边栏过窄**：固定 `w-64` (256px)，长名称/URL 空间不足
- **信息密度低**：只显示名称+URL，没有利用空间展示更多信息
- **缺少交互**：hover 无 tooltip，无法查看完整信息

### 2. 整体 UI 不够美观
- **配色单调**：全灰色调 (`gray-50` ~ `gray-900`)，缺乏品牌色
- **主内容区域空旷**：选中项目后只显示一个灰色 logo 和项目名，无实质功能
- **空状态简陋**："暂无项目" 提示过于简单，缺少引导
- **排版平淡**：无字号层次，无字重对比
- **交互反馈弱**：过渡动画单一，缺少微交互

### 3. 布局与体验问题
- **项目列表区域**：`overflow-hidden` + `overflow-y-auto` 嵌套复杂
- **删除按钮**：仅 hover 显示，移动端不可见
- **无响应式**：小屏幕无适配
- **加载状态**：仅一个简单的 pulse 动画

---

## 优化方案

### Phase 1: 项目列表显示优化（核心问题）

#### 1.1 侧边栏加宽 + 结构调整
```
w-64 (256px) → w-80 (320px)
```
- 增加项目卡片的水平空间
- 重新分配内部 padding，减少边缘浪费

#### 1.2 项目卡片重新设计
- **Git URL 智能显示**：将 `https://github.com/user/repo.git` 解析为 `user/repo`
- **增加信息维度**：
  - 项目创建时间（相对时间，如"3天前"）
  - 项目图标/类型标识
- **hover 展开**：鼠标悬停时卡片略微展开或显示 tooltip
- **删除按钮常驻**：改为常驻但弱化显示（灰色），hover 时高亮

#### 1.3 项目详情面板（主内容区改造）
当前主内容区选中项目后仅显示：
```
[raccoon logo]  raccoon
当前项目：测试项目
```

改造为项目详情面板：
- 项目标题区：名称 + Git 链接（完整可点击）+ 创建时间
- 操作区：打开项目、删除项目按钮
- 状态区：项目状态标签（开发中/已完成等，预留）
- 任务预览区：最近任务列表（预留）
- 空项目引导：未选中时显示友好的引导插画+文案

### Phase 2: 视觉设计升级

#### 2.1 引入品牌色彩系统
```
Primary:    amber-500  (#f59e0b) - 活力、温暖
Secondary:  slate-600  (#475569) - 稳重
Accent:     emerald-500 (#10b981) - 成功状态
Danger:     rose-500   (#f43f5e) - 删除/错误
Background: slate-50   (#f8fafc) - 背景
Surface:    white      (#ffffff) - 卡片
```

#### 2.2 组件级视觉改进
- **Sidebar**：
  - Header 增加底部阴影区分层次
  - "添加项目"按钮改为品牌色（amber）
  - 项目列表标题增加图标+分隔线

- **ProjectList Item**：
  - 选中态从深灰改为品牌色左侧边框 + 浅色背景
  - 增加项目类型图标（Git 图标）
  - 增加创建时间小标签

- **MainContent**：
  - 未选中：插画 + 引导文案 + 快捷操作按钮
  - 选中后：详情面板（见 1.3）

- **Modal**：
  - 增加 overlay 模糊效果
  - 增加进入/退出动画

#### 2.3 字体排版层次
```
页面标题:   text-2xl font-bold
card 标题:  text-lg font-semibold
正文:       text-sm font-normal
caption:    text-xs font-medium text-gray-400
```

### Phase 3: 交互与体验优化

#### 3.1 微交互
- 按钮点击：scale(0.98) 反馈
- 卡片 hover：轻微上浮 shadow-md
- 列表项 hover：背景色过渡 + 左侧边框
- 加载状态：骨架屏替代简单 pulse

#### 3.2 工具提示
- 项目名称 hover → tooltip 显示完整名称
- Git URL hover → tooltip 显示完整 URL
- 按钮 hover → 功能说明

#### 3.3 键盘快捷键
- `Cmd/Ctrl + N`：新建项目
- `Esc`：关闭 Modal
- `Delete`：删除选中项目（需确认）

### Phase 4: 空状态与引导

#### 4.1 无项目空状态
当前：
```
暂无项目
点击上方按钮添加
```

优化：
- 增加 raccoon 插画（或用 icon 组合）
- 文案："还没有项目" + "添加第一个项目开始使用 raccoon"
- 快捷按钮：直接显示"添加项目"按钮

#### 4.2 未选中项目空状态
当前：灰色 logo + raccoon 文字

优化：
- 插画/图标组合
- 文案："选择一个项目查看详情" 或 "创建或选择一个项目开始工作"
- 快捷操作：最近项目快捷入口

---

## 文件变更计划

### 修改文件
1. `frontend/src/index.css` - 增加自定义 CSS 变量/动画
2. `frontend/src/components/Sidebar.tsx` - 加宽 + 品牌色
3. `frontend/src/components/ProjectList.tsx` - 卡片重新设计
4. `frontend/src/components/MainContent.tsx` - 详情面板 + 空状态
5. `frontend/src/components/AddProjectModal.tsx` - 动画 + 视觉优化
6. `frontend/src/components/SettingsPanel.tsx` - 视觉统一
7. `frontend/src/components/PiAgentInstallBlocker.tsx` - 视觉统一
8. `frontend/src/stores/useAppStore.ts` - 可能需要增加选中项目缓存

### 新增文件
1. `frontend/src/components/EmptyState.tsx` - 空状态组件
2. `frontend/src/components/ProjectDetail.tsx` - 项目详情面板
3. `frontend/src/components/Tooltip.tsx` - 工具提示组件
4. `frontend/src/utils/format.ts` - URL 解析、时间格式化工具

---

## 优先级

| 优先级 | 内容 | 影响 |
|-------|------|------|
| P0 | 侧边栏加宽 + URL 智能截断 | 解决核心显示问题 |
| P0 | 项目详情面板 | 解决主内容区空旷问题 |
| P1 | 品牌色引入 + 视觉统一 | 整体美观度提升 |
| P1 | 空状态组件 | 体验提升 |
| P2 | 微交互 + Tooltip | 细节打磨 |
| P2 | 键盘快捷键 | 效率提升 |

---

## 技术方案

- **继续使用 Tailwind CSS**：当前已配置，无需引入新依赖
- **继续使用 lucide-react**：图标库已满足需求
- **不引入新 UI 库**：保持轻量，手写组件更灵活
- **CSS 动画**：使用 Tailwind 的 transition + 自定义 keyframes

---

## 验收标准

- [ ] 项目 Git URL 能清晰识别（显示为 `user/repo` 格式）
- [ ] 完整 URL 可通过 hover tooltip 查看
- [ ] 侧边栏宽度能容纳 30 个字符的项目名不截断
- [ ] 主内容区选中项目后显示有意义的详情信息
- [ ] 空状态有友好的引导 UI
- [ ] 整体配色不再单调，有品牌色点缀
- [ ] 所有交互有视觉反馈（hover、click）
- [ ] 代码通过 TypeScript 类型检查
