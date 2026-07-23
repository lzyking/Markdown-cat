---
title: 'Story 2.4: 空状态提示与双栏响应式布局'
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
---

## Intent

**Problem:** Story 2.1-2.3 分别完成了源码编辑器集成、预览渲染和标题栏状态机。虽然 `PreviewPane.vue` 已具备基本空状态渲染，但空状态与响应式布局的整体验收要求（包括窗口 Resize 响应、双栏 1:1 比例硬锁不可拖拽、固定高度区域保护、清空与纯空白输入空状态判定等）尚未形成专门的自动化测试覆盖与细节闭环。本 Story 旨在沉淀空状态行为与双栏响应式布局契约，并补充独立的 E2E 测试。

**Approach:** 
1. 检查并确保 `PreviewPane.vue` 对空状态的判定严格包含全空白字符串（`content.trim() === ''`），显示符合 DESIGN.md 的 `text-muted` 居中文案「开始输入 Markdown，右侧将实时预览。」；
2. 检查 `App.vue` 布局防护：标题栏（38px）、菜单栏（28px）、状态栏（24px）高度绝对固定，主编辑区占用全部剩余垂直空间，左右两栏各占 50% 宽度，且不允许鼠标拖拽调整分隔线；
3. 新增 `e2e/story-2-4.spec.ts`，全量覆盖：空状态出现与消失/清空恢复、Resize 窗口后布局比例保持 1:1、三栏固定高度保持不变、滚动条稳定性等验收条件。

## Boundaries & Constraints

**Always:**
- 必须确保右栏空状态在 `content` 为空或纯空白字符串时显示提示文案「开始输入 Markdown，右侧将实时预览。」，样式居中且颜色为 `var(--color-text-muted)`。
- 用户一旦输入非空白字符，空状态必须立即消失并显示渲染后的 Markdown DOM；清空编辑器后空状态必须重新出现。
- 窗口 Resize 时，双栏必须同步缩放，两栏各占 50% 宽度（`flex: 1 1 50%`）。
- 标题栏（38px）、菜单栏（28px）、状态栏（24px）的高度在任何窗口尺寸下必须保持固定，不拉伸变高。
- 绝不允许提供拖拽改变双栏比例的分隔线，保持固定 1:1。
- 必须复用 `e2e/fixtures.ts` 编写 Playwright E2E 测试。

**Ask First:**
- 是否需要支持拖拽调整左右栏比例？——不需要，DESIGN.md 和 UX 规范明确约束 MVP 双栏固定 1:1，禁止拖拽改变比例。
- 是否需要支持收起左栏或右栏？——不需要，双栏始终并存不可隐藏。

**Never:**
- 不要引入拖拽调整比例的组件（如 `splitpanes` 或自定义 resizer）。
- 不要为标题栏/菜单栏/状态栏使用百分比或可变高度。
- 不要破坏已有的编辑器输入、Markdown 渲染、标题栏三态与状态栏响应。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 启动/空内容 | `content = ''` 或 `'   \n  '` | 右栏居中显示空状态提示 `text-muted` 颜色 | 无 |
| 输入字符 | `content = '# Hello'` | 空状态消失，渲染 `<h1>Hello</h1>` | 无 |
| 清空内容 | `content` 从有内容清空为 `''` | 渲染 DOM 销毁，空状态提示重新出现 | 无 |
| 调整窗口宽度 | 窗口宽度 1100px → 800px | 左右两栏宽度各从 550px 缩放为 400px，比例保持 1:1 | 无 |
| 调整窗口高度 | 窗口高度 700px → 500px | 标题栏 38px, 菜单栏 28px, 状态栏 24px 不变，编辑区高度缩小 200px | 无 |

## Code Map

- `src/components/PreviewPane.vue` — **检查/微调**：空状态判定（`isEmpty` 计算属性逻辑）及居中样式。
- `src/App.vue` — **检查/微调**：布局 CSS（`editor-workspace`、`editor-pane`、固定高度变量引用）。
- `e2e/story-2-4.spec.ts` — **新文件**：E2E 测试，覆盖空状态与双栏响应式布局全套 AC。

## Tasks & Acceptance Criteria

**Execution:**
- [x] 检查并确认 `src/components/PreviewPane.vue` 中空状态判定（`content.trim() === ''`）与样式符合 UX 规范。
- [x] 检查并确认 `src/App.vue` 布局样式：`editor-workspace` 填充剩余高度，`source-pane` 与 `preview-pane` 各占 50%，无拖拽分栏手柄。
- [x] 新增 `e2e/story-2-4.spec.ts`，覆盖空状态出现/消失/恢复、窗口 Resize 后 1:1 比例与固定栏高度断言。
- [x] 验证 `npm run build` TypeScript 类型检查与 Vue 编译。
- [x] 验证所有已完成 Story 的 E2E 回归测试全部通过。

**Acceptance Criteria:**
- [x] Given 应用主窗口已加载，When 源码编辑器为空，Then 右栏显示空状态提示“开始输入 Markdown，右侧将实时预览。”，样式为 text-muted 居中。
- [x] Given 右栏处于空状态，When 用户输入非空白字符，Then 空状态提示立即消失并渲染 Markdown HTML。
- [x] Given 预览区正在显示渲染内容，When 用户清空源码编辑器（或仅留空白），Then 空状态提示重新显示。
- [x] Given 应用窗口处于不同尺寸（如 1100x700 或 800x500），When 改变窗口大小，Then 左右两栏保持 1:1 等宽且同步缩放，标题栏（38px）、菜单栏（28px）、状态栏（24px）高度恒定。
- [x] Given 运行 `npm run build`，When 构建完成，Then 无 TypeScript 或 Vue 编译错误。
- [x] Given 运行所有 E2E 测试，When 测试完成，Then 全部通过，无回归。

## Verification

**Commands:**
- `npm run build` — ✅ TypeScript 类型检查无报错。
- `npx playwright test e2e/story-2-4.spec.ts` — ✅ 6 个测试用例全部通过。
- `npx playwright test` — ✅ 全量 40 个 E2E 测试全部通过。

## Dev Agent Record

### Agent Model Used

(to be filled by dev agent)

### Completion Notes

- 2026-07-23：完成 Story 2.4 实现与验收。验证并沉淀 PreviewPane 空状态与 App.vue 1:1 响应式双栏布局契约；新增 6 个 E2E 测试全量覆盖空状态切换、Resize 响应、固定栏高度防护与不可拖拽限制。
- 类型检查通过，40 个 E2E 测试（Epic 2 全套）全部通过。

### File List

- 新增：`e2e/story-2-4.spec.ts`（6 个测试用例）
- 检查/已验证：`src/components/PreviewPane.vue`（空状态判断逻辑 `content.trim() === ''` 与 `text-muted` 居中样式就绪）
- 检查/已验证：`src/App.vue`（双栏 flex: 1 1 50% 响应式与固定高度布局契约就绪）

## Change Log

- 2026-07-23: 创建 Story 2.4 故事文件。明确空状态交互与双栏响应式布局（1:1 等宽锁死、固定栏高度保护）的验收与 E2E 规范。
- 2026-07-23: 开发与测试完成，状态切换为 `review`。新增 6 个 E2E 测试用例，40 个测试全部通过。
- 2026-07-23: Code Review 通过（Clean review）。状态 `review` → `done`。


