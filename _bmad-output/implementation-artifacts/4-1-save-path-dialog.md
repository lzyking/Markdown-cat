---
title: 'Story 4.1: 接入菜单入口与保存路径对话框'
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
  - /_bmad-output/implementation-artifacts/2-5-window-dpi-adaptation.md
  - /_bmad-output/implementation-artifacts/3-1-debounced-autosave.md
  - /_bmad-output/implementation-artifacts/3-2-save-success-feedback.md
  - /_bmad-output/implementation-artifacts/3-3-save-failure-handling.md
---

## Intent

**Problem:** 尽管后端配置读写（Story 1.3）与 Epic 3 的自动存盘均已就绪，但用户缺乏一个可视化的入口与模态对话框来查看和修改当前文件的保存路径。需要接入 `MenuBar` 的设置菜单项，弹出一个符合设计规范的设置对话框 Modal，并管理遮罩拦截与键盘 Esc/取消退出逻辑。

**Approach:** 
1. 新建 `src/components/SettingsModal.vue` 组件：
   - 包含居中 Modal 弹窗结构、蒙层 Backdrop（`rgba(0, 0, 0, 0.5)` 阻断底层操作）、当前路径显示只读 Input、[选择...]、[取消] 与 [确认] 按钮；
   - 支持按 `Esc` 键或点击 [取消] 关闭 Modal；
   - 遵循 DESIGN.md 样式 tokens（`--color-background-surface`、`--color-border`、圆角与阴影）。
2. 在 `MenuBar.vue` 中绑定“Markdown Cat > 设置保存路径…”菜单项，点击触发弹窗打开事件 `@open-settings`。
3. 在 `App.vue` 中挂载 `SettingsModal`，控制 `isSettingsOpen` 响应式变量，并管理 Modal 展开期间与关闭后的焦点管理。
4. 编写 E2E 测试 `e2e/story-4-1.spec.ts`，覆盖菜单触发弹窗、Modal 渲染元素对齐、Esc/取消按钮退出、遮罩防护等。

## Boundaries & Constraints

**Always:**
- 弹窗必须居中，背后有 Backdrop 半透明蒙层遮挡，弹窗打开时主窗口编辑区等其他控件不可被鼠标直接触发点击。
- 按下 `Esc` 键或点击“取消”按钮必须立即关闭弹窗，且当前配置不发生改变。
- 弹窗关闭后，焦点恢复回到编辑器或原位置。
- Modal 组件样式必须使用全局设计 token 变量。
- 必须复用 `e2e/fixtures.ts` 编写 Playwright E2E 测试。

**Ask First:**
- 是否允许点击蒙层空白区域关闭 Modal？——允许，作为常见的弹窗取消交互，点击背景蒙层或“取消”按钮效果一致。

**Never:**
- 不要在 Modal 打开时允许编辑区文字接收输入键盘流。
- 不要破坏已有的双栏布局、只读预览、标题栏与防抖自动保存机制。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 点击菜单项 | 用户点击 `MenuBar` 的“设置保存路径…” | 居中弹出 Modal 对话框，主视图蒙层高亮阻断 | 无 |
| 按下 `Esc` 键 | Modal 打开状态下按 `Esc` | Modal 关闭，主视图解锁，编辑器重新可交互 | 无 |
| 点击“取消”按钮 | 点击 Modal 中的 [取消] | Modal 关闭，保存路径未被修改 | 无 |
| 未选择新路径 | 只读框显示当前路径 | [确认] 按钮可用或保持已有路径不误写 | 无 |

## Code Map

- `src/components/SettingsModal.vue` — **新文件**：保存路径设置 Modal 组件。
- `src/components/MenuBar.vue` — **修改**：菜单项绑定事件触发。
- `src/App.vue` — **修改**：挂载 `SettingsModal` 组件并响应菜单触发。
- `e2e/story-4-1.spec.ts` — **新文件**：E2E 测试，覆盖 Story 4.1 对话框交互。

## Tasks & Acceptance Criteria

**Execution:**
- [x] 创建 `src/components/SettingsModal.vue` 组件，包含 Modal 结构、样式 token 绑定、只读输入框与按钮事件。
- [x] 修改 `src/components/MenuBar.vue`：向“设置保存路径…”添加点击处理函数，向父组件 emit `open-settings` 事件。
- [x] 修改 `src/App.vue`：挂载 `SettingsModal`，管理 `isSettingsOpen` 状态以及键盘 Esc 监听。
- [x] 新增 `e2e/story-4-1.spec.ts`：覆盖菜单触发 Modal 打开、只读路径展示、取消/Esc 退出、遮罩阻断等断言。
- [x] 验证 `npm run build` TypeScript 类型检查与 Vue 编译。
- [x] 验证全量 E2E 回归测试全部通过。

**Acceptance Criteria:**
- [x] Given 应用主窗口已启动，When 用户点击菜单“设置保存路径…”，Then 居中弹出保存路径对话框，主窗口其他区域在对话框关闭前不可交互。
- [x] Given 保存路径对话框已打开，When 查看内容，Then 显示标题、当前路径只读输入框、“选择...”、“取消”和“确认”按钮，样式符合 design token 规范。
- [x] Given 对话框处于打开状态，When 用户按下 `Esc` 或点击“取消”/蒙层，Then 对话框立即关闭，当前保存路径配置不发生变化。
- [x] Given 运行 `npm run build`，When 构建完成，Then 无 TypeScript 或 Vue 编译错误。
- [x] Given 运行所有 E2E 测试，When 测试完成，Then 全部通过，无回归。

## Verification

**Commands:**
- `npx vue-tsc --noEmit` — ✅ 类型检查通过。
- `npx playwright test e2e/story-4-1.spec.ts` — ✅ 3 个 Modal 交互与菜单触发测试全过。
- `npx playwright test` — ✅ 58 个全量 E2E 测试全过。

## Dev Agent Record

### Agent Model Used

(to be filled by dev agent)

### Completion Notes

- 2026-07-23：完成 Story 4.1 实现与验证。实现 `SettingsModal.vue` 保存路径设置弹窗，接入 `MenuBar` 菜单项与 `Esc`/取消按键关闭机制，优化 `e2e/fixtures.ts` 中 fakeTimers `delay===0` 过滤。
- 新增 3 个 E2E 测试用例，58 个全量 E2E 测试 100% 通过。

### File List

- 新增：`src/components/SettingsModal.vue`（设置保存路径 Modal 组件）
- 修改：`src/components/MenuBar.vue`（触发 `open-settings` 事件）
- 修改：`src/App.vue`（挂载 Modal 与控制 `isSettingsOpen`）
- 优化：`e2e/fixtures.ts`（支持 `delay===0` 原生事件解包）
- 新增：`e2e/story-4-1.spec.ts`（3 个 E2E 测试用例）

## Change Log

- 2026-07-23: 创建 Story 4.1 故事文件。规范保存路径设置对话框 Modal、菜单触发、Esc/取消退出与遮罩防护机制。
- 2026-07-23: 开发与测试完成，状态切换为 `review`。新增 3 个 E2E 测试用例，58 个全量测试全部通过。
- 2026-07-23: Code Review 通过（Clean review）。状态 `review` → `done`。


