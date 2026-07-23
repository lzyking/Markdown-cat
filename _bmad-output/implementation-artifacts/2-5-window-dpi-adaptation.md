---
title: 'Story 2.5: 窗口缩放与显示器 DPI 适配'
type: 'feature'
created: '2026-07-23'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'NO_VCS'
context:
  - /_bmad-output/planning-artifacts/epics.md
  - /_bmad-output/planning-artifacts/prds/prd-Markdown%20Cat-2026-07-21/prd.md
  - /_bmad-output/planning-artifacts/architecture/architecture-Markdown%20Cat-2026-07-21/ARCHITECTURE-SPINE.md
  - /_bmad-output/planning-artifacts/ux-designs/ux-Markdown%20Cat-2026-07-21/DESIGN.md
  - /_bmad-output/planning-artifacts/ux-designs/ux-Markdown%20Cat-2026-07-21/EXPERIENCE.md
  - /_bmad-output/implementation-artifacts/epic-1-context.md
  - /_bmad-output/implementation-artifacts/2-1-source-editor-state-channel.md
  - /_bmad-output/implementation-artifacts/2-2-readonly-preview-markdown-rendering.md
  - /_bmad-output/implementation-artifacts/2-3-title-bar-state-display.md
  - /_bmad-output/implementation-artifacts/2-4-empty-state-responsive-layout.md
---

## Intent

**Problem:** 用户在不同桌面工作环境（如 macOS Retina 内置屏与外接 1080p/4K 屏幕跨屏移动，或者调整窗口最小化/最大化）下使用 Markdown Cat 时，如果响应式与字体/像素防模糊机制不够健全，可能会出现布局崩塌、单栏撑破、系统 DPI 缩放错位或滚动条跳跃等问题。本 Story 明确并沉淀 DPI 适配与窗口恢复状态契约，并补充覆盖多 DPR (devicePixelRatio) 与动态 Viewport 的 E2E 测试。

**Approach:** 
1. 在全局 CSS/App 层验证基础视口与抗锯齿保护（`-webkit-font-smoothing: antialiased`、`-moz-osx-font-smoothing: grayscale`、全 CSS 变量尺寸规范）；
2. 确保在不同 `devicePixelRatio` (1.0, 1.25, 1.5, 2.0, 3.0) 模拟环境下，双栏物理渲染宽度保持 1:1 比例，固定高度栏（38px / 28px / 24px）无亚像素塌陷或变形；
3. 确保在窗口从 800x500 恢复至最大尺寸或切换 DPR 时，源码编辑器（CodeMirror）与只读预览区（PreviewPane）的滚动位置（`scrollTop`）保持稳定无跳跃；
4. 新增 `e2e/story-2-5.spec.ts`，全量覆盖 DPI 跨屏适配与窗口极值响应测试。

## Boundaries & Constraints

**Always:**
- 布局必须严格使用系统 DPI 透明的 CSS 逻辑像素与 token 变量，避免依赖 window innerWidth 纯绝对像素演算引起的错位。
- 在切换 `devicePixelRatio`（例如从 1.0 标准屏切换至 2.0 Retina 屏）时，布局契约保持稳定：标题栏 38px、菜单栏 28px、状态栏 24px、双栏 1:1 等宽。
- 窗口最小化恢复或最大化/还原时，编辑器与预览区的 `scrollTop` 滚动位置不发生重置跳跃。
- 必须复用 `e2e/fixtures.ts` 编写 Playwright E2E 测试。

**Ask First:**
- 是否需要监听 Window `resize` 事件手工重绘 DOM？——不需要，纯 CSS flex 响应式与百分比约束比 JS resize 监听器性能更高且不会引发闪烁。
- 是否需要支持 Windows 特有的 High-DPI 选项配置？——不需要，MVP 以 macOS 和系统 WebView 原生 DPR 适配为主。

**Never:**
- 不要在 JavaScript 中硬编码具体屏幕分辨率数值。
- 不要使用 `zoom` 或 `transform: scale()` 来做 DPI 适配，防止字体模糊与鼠标光标计算偏移。
- 不要破坏 Story 2.1-2.4 已完成的编辑器、渲染、状态机与空状态逻辑。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| DPR 切换 (Retina 屏) | `devicePixelRatio = 2.0` | 字体清晰无模糊，双栏保持 1:1 比例，固定栏高度保持 38/28/24px | 无 |
| DPR 切换 (外接 4K 屏 150% 缩放) | `devicePixelRatio = 1.5` | 界面无错位，逻辑像素正常计算，滚动位置不变 | 无 |
| 窗口最大化/恢复 | 从 800x500 变更为 1920x1080 | 界面平滑缩放，编辑区高为 1010px，无滚动跳变 | 无 |
| 长文档滚动后 Resize/DPI 变动 | `scrollTop = 300px` 变动 DPR | `scrollTop` 保持在 300px，不重置回 0 | 无 |

## Code Map

- `src/styles/app.css` — **检查**：`-webkit-font-smoothing`、`color-scheme` 以及高 DPI 文字抗锯齿保护。
- `e2e/story-2-5.spec.ts` — **新文件**：E2E 测试，覆盖多 DPR 模拟、高 DPI 布局稳固、滚动位置稳定性。

## Tasks & Acceptance Criteria

**Execution:**
- [x] 检查并确认 `src/styles/app.css` 中对高 DPI 显示的抗锯齿与字体渲染配置完整。
- [x] 新增 `e2e/story-2-5.spec.ts`，测试多 DPR 场景（dpr = 1.0, 1.5, 2.0, 3.0）下双栏比例、固定栏高度、文本抗锯齿与滚动位置稳定。
- [x] 验证 `npm run build` TypeScript 类型检查与 Vue 编译。
- [x] 验证所有完成 Story 的 E2E 回归测试全部通过。

**Acceptance Criteria:**
- [x] Given 用户在 Retina 与外接显示器之间切换（模拟 DPR 为 1.0, 1.5, 2.0），When 改变 devicePixelRatio，Then 双栏比例仍为 1:1，标题栏（38px）、菜单栏（28px）、状态栏（24px）逻辑高度保持一致，无布局重排错位。
- [x] Given 源码编辑器与预览区已装载长文档并滚动至特定位置（`scrollTop > 0`），When 调整窗口尺寸或切换 DPR，Then 滚动位置不归零，保持稳定。
- [x] Given 运行 `npm run build`，When 构建完成，Then 无 TypeScript 或 Vue 编译错误。
- [x] Given 运行所有 E2E 测试，When 测试完成，Then 全部通过，无回归。

## Verification

**Commands:**
- `npm run build` — ✅ 类型检查与构建全过。
- `npx playwright test e2e/story-2-5.spec.ts` — ✅ 6 个 DPR 适配测试通过。
- `npx playwright test` — ✅ 46 个全量 E2E 回归测试通过。

## Dev Agent Record

### Agent Model Used

(to be filled by dev agent)

### Completion Notes

- 2026-07-23：完成 Story 2.5 实现与验证。沉淀与验证多 DPR (devicePixelRatio = 1.0, 1.5, 2.0, 3.0) 以及视口 Resizing 环境下的双栏 1:1 稳定度、固定栏高度防护与 `scrollTop` 稳定性；验证全局 `-webkit-font-smoothing`。新增 6 个 E2E 测试用例。
- 46 个 E2E 测试（Epic 2 完整集合）100% 通过。

### File List

- 新增：`e2e/story-2-5.spec.ts`（6 个测试用例）
- 检查/已验证：`src/styles/app.css`（抗锯齿与字体平滑规则保留）

## Change Log

- 2026-07-23: 创建 Story 2.5 故事文件。明确 DPI 适配（多 DPR 支持）、窗口极值恢复与滚动条稳定性的验收与 E2E 测试规范。
- 2026-07-23: 开发与测试完成，状态切换为 `review`。新增 6 个 E2E 测试用例，46 个测试全部通过。
- 2026-07-23: Code Review 通过（Clean review）。状态 `review` → `done`。


