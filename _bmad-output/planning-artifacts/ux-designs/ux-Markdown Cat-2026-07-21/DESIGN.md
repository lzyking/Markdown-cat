---
name: Markdown Cat
purpose: visual-identity
altitude: product
scope: MVP 深色主题桌面 Markdown 编辑器（macOS），双栏布局
status: final
sources:
  - /_bmad-output/planning-artifacts/prds/prd-Markdown Cat-2026-07-21/prd.md
  - /_bmad-output/planning-artifacts/architecture/architecture-Markdown Cat-2026-07-21/ARCHITECTURE-SPINE.md
created: 2026-07-21
updated: 2026-07-21
colors:
  background: '#0D1117'
  background-surface: '#161B22'
  background-elevated: '#1C2128'
  border: '#30363D'
  border-subtle: '#21262D'
  text-primary: '#E6EDF3'
  text-secondary: '#8B949E'
  text-muted: '#6E7681'
  text-disabled: '#484F58'
  accent: '#7DD3FC'
  accent-foreground: '#0D1117'
  success: '#3FB950'
  error: '#F85149'
  warning: '#D29922'
  code-background: '#1C2128'
  selection: '#264F78'
typography:
  display:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    fontSize: 22px
    fontWeight: '600'
    lineHeight: '1.3'
  heading:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.6'
  body-mono:
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.6'
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
  status:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 4px
  md: 6px
  lg: 8px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  xxl: 24px
---

# DESIGN.md — Markdown Cat

## Brand & Style

Markdown Cat 是一款面向受控 Mac 环境、无需安装的绿色 Markdown 编辑器。品牌基调为**温暖、友好、专注**，参考 Obsidian 的深色沉浸感，但保持更轻量、更克制的工具气质。我们不追求复杂的工作空间或知识图谱，而是让用户三秒内进入写作状态。因此，视觉语言的核心是：**低对比、低打扰、高可读**。

设计原则：

1. **深色即默认**：MVP 只提供深色主题，所有颜色以此为基准构建。
2. **双栏为骨架**：源码与预览永远并存，界面围绕这一结构展开。
3. **状态优先于装饰**：色彩主要用于状态反馈（保存成功、保存失败、选中），而非品牌装饰。
4. **系统字体优先**：使用 macOS 系统字体与等宽字体，减少字体加载，提升启动速度。
5. **无边框干扰**：去除多余阴影与渐变，使用 1px 细线分隔区域。

## Colors

色彩系统基于 GitHub Dark Dimmed 的柔和深色，但简化为少量语义化 token。所有颜色使用十六进制表示，便于前端实现。

- **Background (`#0D1117`)** — 应用底色，源码编辑区与主容器背景。
- **Background Surface (`#161B22`)** — 预览区、标题栏、状态栏、对话框等次级表面。
- **Background Elevated (`#1C2128`)** — 悬浮层、菜单、按钮、代码块背景。
- **Border (`#30363D`)** — 主要分隔线，用于双栏分隔、标题栏底部、状态栏顶部。
- **Border Subtle (`#21262D`)** — 更轻的分隔线，如菜单栏底部、输入框边框。
- **Text Primary (`#E6EDF3`)** — 正文、标题、文件名、菜单文字。
- **Text Secondary (`#8B949E`)** — 辅助文字、预览区引用文字、菜单未选中项。
- **Text Muted (`#6E7681`)** — 状态栏信息、行列号、提示文字。
- **Text Disabled (`#484F58`)** — 禁用状态文字。
- **Accent (`#7DD3FC`)** — 品牌强调色，用于链接、焦点环、选中高亮、保存成功提示图标。温暖但不刺眼。
- **Accent Foreground (`#0D1117`)** — 在 Accent 色上的文字/图标色。
- **Success (`#3FB950`)** — 保存成功状态提示。
- **Error (`#F85149`)** — 保存失败状态提示。
- **Warning (`#D29922`)** — 可选，用于未来警告场景（MVP 不使用）。
- **Code Background (`#1C2128`)** — 代码块与行内代码背景。
- **Selection (`#264F78`)** — 文本选中背景色。

## Typography

字体选择完全基于系统字体，避免额外字体资源加载，符合「快速启动」目标。

- **Display**：系统无衬线字体，22px，600。用于空状态标题、对话框标题。
- **Heading**：系统无衬线字体，18px，600。用于预览区大标题、设置面板标题。
- **Body**：系统无衬线字体，14px，400，行高 1.6。用于 UI 标签、菜单、按钮、状态栏。
- **Body Mono**：系统等宽字体，14px，400，行高 1.6。用于源码编辑器、行内代码、代码块。
- **Label**：系统无衬线字体，12px，500。用于小标签、快捷键提示。
- **Status**：系统无衬线字体，12px，400。用于状态栏、保存提示。

## Layout & Spacing

界面采用经典桌面三行布局：标题栏 + 菜单栏 + 主编辑区 + 状态栏。主编辑区为 1:1 双栏。

| 区域 | 高度 / 宽度 | 说明 |
|------|-------------|------|
| 标题栏 | 38px | 包含应用图标、文件名、保存状态。左侧为窗口拖拽区。 |
| 菜单栏 | 28px | macOS 标准菜单占位，仅含最简菜单项。 |
| 主编辑区 | 剩余空间 | 左右两栏各 50%，等宽。 |
| 状态栏 | 24px | 底部信息栏，显示保存状态、行列、文档类型。 |

间距系统使用 4px 基准：

- `xs` 4px — 图标内边距、紧密间隔
- `sm` 8px — 按钮内边距、菜单项间距
- `md` 12px — 对话框内边距、卡片间距
- `lg` 16px — 标题栏内边距
- `xl` 20px — 编辑器区域内边距
- `xxl` 24px — 对话框/浮层外边距

## Elevation & Depth

不使用阴影作为层级主要手段。层级通过背景色差异和边框表达：

- 基底层：Background `#0D1117`
- 表面层：Background Surface `#161B22`
- 提升层：Background Elevated `#1C2128`
- 悬浮层（对话框、菜单）：Background Elevated + 1px Border

对话框使用一层柔和阴影（`0 12px 40px rgba(0,0,0,0.4)`）以在深色背景中建立焦点，其他界面元素无阴影。

## Shapes

圆角统一克制：

- `sm` 4px — 按钮、标签、图标、输入框
- `md` 6px — 代码块、菜单项、对话框
- `lg` 8px — 对话框容器、浮层卡片

不使用全圆角（pill）或大圆角，保持工具感。

## Components

### 标题栏 (Title Bar)

- 高度 38px，背景 Background Surface，底部 1px Border。
- 左侧：16px 圆角 4px 的应用图标（Accent 背景，M 字母），右侧文件名（14px，Text Primary）。
- 右侧：保存状态（小圆点 + 文字）。成功为绿色圆点，失败为红色圆点，无圆点表示未保存。

### 菜单栏 (Menu Bar)

- 高度 28px，背景 Background，底部 1px Border Subtle。
- 菜单项：「Markdown Cat」「文件」「编辑」「视图」「帮助」。
- MVP 只有「Markdown Cat > 设置保存路径…」一个有效设置项，其他菜单项保持标准占位（可禁用或提供基本功能）。
- 菜单项悬停：Background Elevated，圆角 4px。

### 源码编辑器 (Source Editor)

- 背景 Background，文字 Text Primary，字体 Body Mono。
- 无边框、无滚动条美化（使用系统默认滚动条）。
- 支持撤销、重做、复制、粘贴、全选等标准编辑操作。
- 文本选中背景：Selection `#264F78`。
- 光标颜色：Text Primary。
- 区域不可隐藏或关闭，始终占据左栏。

### 预览区 (Preview Pane)

- 背景 Background Surface，文字 Text Primary，字体 Body。
- 渲染标题、段落、列表、代码块、引用、链接等标准 Markdown 元素。
- 标题下方使用 1px Border 分隔。
- 代码块背景 Code Background，圆角 6px，内边距 12px。
- 行内代码背景 Code Background，圆角 4px，内边距 2px 5px。
- 引用左侧 3px Accent 色边框，左侧内边距 14px，文字 Text Secondary。
- 链接颜色 Accent，无下划线，悬停显示下划线。
- 预览区只读，不响应输入。

### 状态栏 (Status Bar)

- 高度 24px，背景 Background Elevated，顶部 1px Border Subtle。
- 左侧：保存状态文字（成功绿色，失败红色，普通 Text Muted）。
- 右侧：行列号、文档类型（Markdown）。
- 文字 12px。

### 设置保存路径对话框 (Save Path Dialog)

- 居中浮层，宽度 420px，背景 Background Elevated，边框 Border，圆角 8px。
- 标题「设置保存路径」，正文说明当前设置用途。
- 输入框显示当前路径（默认只读），右侧「选择…」按钮打开系统文件选择器。
- 底部：「取消」与「确认」按钮。确认按钮使用 Accent 背景。

### 空状态 / 初始状态

- 启动后源码编辑器为空白，光标闪烁。
- 预览区显示空状态提示：「开始输入 Markdown，右侧将实时预览。」（Text Muted，居中）。

## Do's and Don'ts

| Do | Don't |
|---|---|
| 使用系统字体，避免加载外部字体 | 引入自定义字体或图标字体 |
| 用颜色表达状态（成功/失败/焦点） | 用颜色做装饰或渐变背景 |
| 保持深色主题一致，避免浅色弹层 | 在深色界面中引入高对比白色弹层 |
| 用 1px 细边框和背景色差异表达层级 | 使用大面积阴影或投影 |
| 双栏始终等宽，不可隐藏 | 提供隐藏单栏或三栏布局 |
| 状态栏文字清晰、无歧义 | 使用「OK」「完成」等模糊状态词 |
| 菜单项使用 macOS 标准命名 | 发明新的菜单分类 |

## 参考

- 主界面 HTML mockup：`.working/main-screen.html`
