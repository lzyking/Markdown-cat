---
title: '实现全局设计 token 与基础双栏布局'
type: 'feature'
created: '2026-07-22'
status: 'done'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/prds/prd-Markdown Cat-2026-07-21/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-Markdown Cat-2026-07-21/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Markdown Cat-2026-07-21/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Markdown Cat-2026-07-21/EXPERIENCE.md
  - _bmad-output/planning-artifacts/epics.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 当前应用壳已运行，但设计 token 散落在硬编码的 CSS 中，部分组件仍直接写死颜色和尺寸，缺少统一 token 体系；基础布局虽已双栏，但缺少明确的分栏高度与边界规格。

**Approach:** 在全局 CSS 中建立完整、可扩展的 kebab-case 设计 token 系统；更新所有现有 UI 组件，使其引用 token 而非硬编码值；在 App.vue 中显式实现标题栏 38px + 菜单栏 28px + 主编辑区 1:1 双栏 + 状态栏 24px 的骨架布局。

## Boundaries & Constraints

**Always:**
- 所有颜色、字体、间距、圆角必须使用 CSS 变量并在 `src/styles/app.css` 中集中定义。
- 命名采用 kebab-case，格式如 `--color-background-surface`、`--spacing-md`。
- 所有现有 UI 元素（TitleBar、MenuBar、StatusBar、App.vue）必须引用 token 而非硬编码颜色或尺寸。
- 主编辑区为 1:1 等宽双栏，双栏不可隐藏、不可调整比例。
- 保持深色主题为唯一主题；收到浅色/深色切换事件时保持深色不变。
- 最小窗口 800×500px、默认启动 1100×700px 已在 `tauri.conf.json` 中配置，本次不修改后端配置。

**Ask First:**
- 是否需要扩展 token 范围（如 shadows、transitions、z-index）—— MVP 不扩展，但如本次需要应提前确认。
- 是否接受源码编辑区/预览区使用独立占位组件而非 `App.vue` 内联占位。

**Never:**
- 不实现实际源码编辑器、Markdown 渲染、菜单交互、保存逻辑。
- 不引入外部主题或浅色模式切换逻辑。
- 不修改 `tauri.conf.json` 中已配置的窗口尺寸。
- 不将 token 定义分散到多个 CSS 文件中。

</frozen-after-approval>

## Code Map

- `src/styles/app.css` — 全局设计 token（colors / typography / spacing / rounded）与基础样式重置、滚动条样式。
- `src/App.vue` — 应用根布局：标题栏 + 菜单栏 + 1:1 双栏主编辑区 + 状态栏；左栏为源码编辑占位，右栏为预览占位。
- `src/components/TitleBar.vue` — 标题栏占位组件，引用 design token。
- `src/components/MenuBar.vue` — 菜单栏占位组件，引用 design token。
- `src/components/StatusBar.vue` — 状态栏占位组件，引用 design token。
- `src/main.ts` — 确认全局样式 `app.css` 被正确导入。

## Tasks & Acceptance

**Execution:**
- [ ] `src/styles/app.css` — 补充完整 design token 系统，包含所有 colors、typography、spacing、rounded 变量，并保留现有基础样式；新增变量名保持 kebab-case 并分类排列。
- [ ] `src/App.vue` — 更新布局尺寸与边界样式，使用 token 变量替代硬编码值，明确主编辑区 1:1 等宽双栏；保持占位内容。
- [ ] `src/components/TitleBar.vue` — 将高度、内边距、字体、边框、颜色等全部替换为对应 token 变量；保留窗口拖拽区与状态点占位。
- [ ] `src/components/MenuBar.vue` — 将高度、内边距、字体、边框、颜色、圆角、阴影等全部替换为对应 token 变量；保留菜单占位结构。
- [ ] `src/components/StatusBar.vue` — 将高度、内边距、字体、边框、颜色等全部替换为对应 token 变量；保留状态与行列号占位。
- [ ] `src/main.ts` — 验证并确认 `import './styles/app.css'` 存在，无需额外修改。

**Acceptance Criteria:**
- Given 应用已编译并运行，When 主窗口渲染，Then 标题栏高度为 38px、菜单栏高度为 28px、主编辑区为 1:1 等宽双栏、状态栏高度为 24px，且所有区域均使用 design token 中的颜色与尺寸变量。
- Given 检查 `src/styles/app.css`，When 查看 CSS 变量定义，Then 包含完整的 colors、typography、spacing、rounded 四类 token，且全部以 kebab-case 命名并在 `:root` 作用域下定义。
- Given 查看 TitleBar、MenuBar、StatusBar、App.vue 的样式，When 搜索硬编码颜色或尺寸，Then 不存在与 design token 语义对应的颜色/尺寸硬编码值（如 #161B22、38px、28px 等仅在 token 定义处出现）。
- Given 系统切换浅色模式，When 应用收到主题切换事件，Then 界面仍保持深色主题，且相关限制在 Story 文档中记录为 MVP 非目标。
- Given 运行 `npm run dev` 或 `cargo tauri dev`，When 应用窗口出现，Then 无白屏、无样式缺失、布局比例正确。

## Spec Change Log

<!--  review loop 期间追加，初始为空 -->

## Design Notes

### Token 命名约定

- 颜色：`--color-{语义}`，如 `--color-background-surface`。
- 字体：`--font-{用途}`，如 `--font-body-mono`。
- 间距：`--spacing-{尺寸}`，如 `--spacing-md`。
- 圆角：`--rounded-{尺寸}`，如 `--rounded-md`。
- 后续需要尺寸 token（如 `--size-title-bar-height`）时，统一在此文件追加，避免零散定义。

### 布局尺寸映射

| UI 区域 | 硬编码尺寸 | 使用 token |
|---|---|---|
| 标题栏高度 | 38px | 保留为组件内 `height: 38px`，视为 UX 强约束（非视觉 token），但颜色/间距使用 token |
| 菜单栏高度 | 28px | 同上 |
| 状态栏高度 | 24px | 同上 |
| 主编辑区 | 剩余空间 | 由 flex 分配，颜色与边框使用 token |

> 说明：高度 38px/28px/24px 是 UX 规范中的精确尺寸，属于布局契约而非视觉装饰 token，允许在组件内直接写高度值；但内边距、边框、颜色、字体、圆角必须全部使用 token。

### 浅色模式非目标

MVP 明确仅提供深色主题。本次不监听 `prefers-color-scheme`，也不准备浅色 token；即使收到系统主题切换事件，仍保持深色。该限制在 spec 的 Boundaries 中记录。

## Verification

**Commands:**
- `npm run dev` — expected: 开发服务器正常启动，页面在浏览器/Tauri 窗口中可见，布局无异常。
- `cargo tauri dev` — expected: Tauri 桌面窗口出现，标题栏/菜单栏/双栏/状态栏比例正确，无白屏或样式缺失。
- `npm run build` — expected: 前端生产构建成功，无 CSS 或 Vue 编译错误。

**Manual checks:**
- 打开开发者工具，检查 `src/styles/app.css` 中定义的 CSS 变量是否全部在 `:root` 下出现。
- 在 Elements 面板中检查 TitleBar/MenuBar/StatusBar/App.vue 的样式，确认颜色与间距来自 CSS 变量。
- 调整窗口大小，确认双栏始终等宽，标题栏/菜单栏/状态栏高度不变。
