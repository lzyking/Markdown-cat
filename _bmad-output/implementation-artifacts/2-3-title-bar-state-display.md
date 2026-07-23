---
title: 'Story 2.3: 标题栏文件状态与三态显示'
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
---

## Intent

**Problem:** Story 2.1 建立了编辑器与 `content` 状态通道，Story 2.2 完成了只读预览渲染。但标题栏的保存状态仍然是静态占位——App.vue 只传递了 `filename`，尚未传递 `saveStatus` prop；而 `TitleBar.vue` 虽已定义了 `saveStatus` prop 和三态圆点样式（`unsaved`/`success`/`failure`），但从未被实际驱动。Epic 3 的自动保存需要一个完整的前端状态机来管理保存流程并驱动标题栏和状态栏显示。本 Story 在 App.vue 中建立 `saveStatus` 响应式状态，将标题栏三态接通，同时在状态栏增加保存提示消息传递，为 Epic 3 的自动保存提供就绪的 UI 反馈通道。

**Approach:** 在 App.vue 中新增 `saveStatus` ref（类型 `'unsaved' | 'success' | 'failure'`，初始值 `'unsaved'`）和 `saveMessage` ref（类型 `string`，初始值空串），将 `saveStatus` 传递给 `TitleBar` 和 `StatusBar`，将 `saveMessage` 传递给 `StatusBar` 的 `message` prop。本次不实现实际保存逻辑，仅为 Epic 3 的自动保存提供可测试的 UI 管道。通过 E2E 测试验证：三态圆点正确显示/隐藏、颜色符合 token 规范、状态栏消息正确传递。

## Boundaries & Constraints

**Always:**
- 必须在 App.vue 中新增 `saveStatus` 和 `saveMessage` 两个响应式状态，并传递给 `TitleBar` 和 `StatusBar`。
- `saveStatus` 类型必须为 `'unsaved' | 'success' | 'failure'`，与 TitleBar.vue 已有的 `saveStatus` prop 定义一致。
- 标题栏三态显示必须与 DESIGN.md / EXPERIENCE.md 一致：unsaved 无圆点、success 绿色圆点（`--color-success`）、failure 红色圆点（`--color-error`）。
- 状态栏必须正确接收 `saveMessage` 并在左侧显示；`status` prop 必须与 `saveStatus` 联动（`'unsaved'` → `'normal'`，`'success'` → `'success'`，`'failure'` → `'failure'`）。
- 初始状态为 `unsaved`，标题栏无圆点，状态栏显示默认文案（`'准备就绪'`）。
- 不修改 TitleBar.vue 和 StatusBar.vue 的内部逻辑或样式——它们的三态渲染能力已在 Story 1.2 实现就绪，本次只负责从 App.vue 传递正确的 prop。
- 所有新增文案不硬编码中文，使用常量或英文 key，后续接入 locale。
- 必须复用 Story 2.1/2.2 建立的 E2E fixtures（`e2e/fixtures.ts`）。
- 不引入新的 npm 依赖或 Rust 后端命令。

**Ask First:**
- 是否需要在 `content` 变化时自动将 `saveStatus` 切换为 `unsaved`？——是的，这是核心交互：用户修改文档后标题栏应从 success/failure 态回到 unsaved 态。Epic 3 的保存完成后再更新为 success/failure。
- 是否需要导出 `saveStatus` 状态以供外部消费？——不需要，App.vue 作为状态源，保存逻辑在 Epic 3 中直接在 App.vue 内操作此状态。

**Never:**
- 不要实现实际的文件保存逻辑（属于 Epic 3 Story 3.1）。
- 不要修改 `TitleBar.vue` 或 `StatusBar.vue` 的内部实现、样式或 prop 签名。
- 不要新增 Rust 后端命令或修改 `tauri.conf.json`。
- 不要破坏 Story 2.1/2.2 已实现的编辑器、预览、状态栏行列号、E2E 测试。
- 不要修改 `content` 状态通道的管理方式（保持 App.vue 单一状态源）。
- 不要硬编码保存成功/失败的中文文案到组件中。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 应用启动 | `saveStatus = 'unsaved'` | 标题栏无状态圆点；状态栏显示默认文案 | 无 |
| 用户编辑文档（content 变化） | `saveStatus` 从任意值 → `'unsaved'` | 标题栏状态圆点消失；状态栏保持上次消息或切换回默认 | 无 |
| 保存成功（Epic 3 触发） | `saveStatus` → `'success'`, `saveMessage` → `'已保存至 {filename}'` | 标题栏显示绿色圆点；状态栏显示成功消息（绿色） | 无 |
| 保存失败（Epic 3 触发） | `saveStatus` → `'failure'`, `saveMessage` → `'保存失败：{reason}'` | 标题栏显示红色圆点；状态栏显示失败消息（红色） | 无 |
| 连续编辑后保存成功再编辑 | success → unsaved（content 变化） | 圆点消失，状态栏可保留成功消息直到下次保存结果 | 无 |

## Code Map

- `src/App.vue` — **修改**：新增 `saveStatus` ref 和 `saveMessage` ref；将 `saveStatus` 传递给 `TitleBar` 和 `StatusBar`（映射为 StatusBar 的 `status` prop）；将 `saveMessage` 传递给 `StatusBar` 的 `message` prop；watch `content` 变化将 `saveStatus` 重置为 `'unsaved'`。
- `src/components/TitleBar.vue` — **不修改**：已定义 `saveStatus` prop 和三态样式。
- `src/components/StatusBar.vue` — **不修改**：已定义 `message`、`status` prop 和对应样式。
- `src/components/PreviewPane.vue` — **不修改**。
- `src/components/SourceEditor.vue` — **不修改**。
- `e2e/story-2-3.spec.ts` — **新文件**：E2E 测试，覆盖三态显示、content 变化触发 unsaved 重置、样式 token 验证。
- Rust 后端 — **不修改**。

## Design Notes

### 状态机定义

```
unsaved ──(save success)──→ success
unsaved ──(save failure)──→ failure
success ──(content change)──→ unsaved
failure ──(content change)──→ unsaved
success ──(save failure)──→ failure
failure ──(save success)──→ success
```

Epic 3 负责触发保存事件和更新 `saveStatus`/`saveMessage`。本 Story 负责建立状态变量、content 变化时的自动重置、以及 prop 传递管道。

### App.vue 修改要点

```typescript
// 新增的响应式状态
type SaveStatus = 'unsaved' | 'success' | 'failure'
const saveStatus = ref<SaveStatus>('unsaved')
const saveMessage = ref('')

// 将 StatusBar 的 status prop 映射：saveStatus → StatusBar.status
// 'unsaved' → 'normal'，'success' → 'success'，'failure' → 'failure'
const statusBarStatus = computed(() =>
  saveStatus.value === 'unsaved' ? 'normal' : saveStatus.value
)

// content 变化时重置 saveStatus 为 unsaved
watch(content, () => {
  saveStatus.value = 'unsaved'
})
```

### 模板绑定

```vue
<TitleBar :filename="filename" :save-status="saveStatus" />
<StatusBar
  :line="cursorPosition.line"
  :column="cursorPosition.column"
  :message="saveMessage"
  :status="statusBarStatus"
/>
```

### TitleBar.vue 现有 prop 签名（不修改）

```typescript
defineProps<{
  filename?: string
  saveStatus?: 'unsaved' | 'success' | 'failure'
}>()
```

TitleBar 内部已有三态渲染逻辑：
- `saveStatus === 'success'` → 显示 `.status-dot.success`（绿色）
- `saveStatus === 'failure'` → 显示 `.status-dot.failure`（红色）
- 其他（含 undefined/unsaved）→ 不渲染圆点

### StatusBar.vue 现有 prop 签名（不修改）

```typescript
defineProps<{
  message?: string
  status?: 'normal' | 'success' | 'failure'
  line?: number
  column?: number
}>()
```

StatusBar 内部逻辑：
- `message` 显示在左侧，默认 `'准备就绪'`
- `status === 'success'` → 左侧文字绿色
- `status === 'failure'` → 左侧文字红色
- `status === 'normal'` 或 undefined → 默认 muted 色

### E2E 测试策略

测试通过 `page.evaluate()` 修改 Vue 组件的 `saveStatus` 和 `saveMessage` 来模拟保存状态变化，不需要实际后端。由于 App.vue 使用 `ref`，可通过 Vite dev server 的 HMR 或直接操作 DOM/Vue devtools API 来验证。

更优的策略：本次 E2E 主要验证初始状态（unsaved）、content 变化后的状态重置。对于 success/failure 态的验证，可通过在 `window` 上暴露状态更新函数（仅在测试模式），或者验证 TitleBar 组件已有的条件渲染逻辑。

实际实施建议：在 App.vue 中检测 `window.__TAURI_MOCK__`（E2E 环境标志），在该环境下向 `window` 暴露 `setSaveStatus` 和 `setSaveMessage` 函数，供 E2E 测试调用。这与 Story 2.1/2.2 的 mock 策略一致。

## Tasks & Acceptance Criteria

**Execution:**
- [x] 修改 `src/App.vue`：新增 `saveStatus` ref（类型 `'unsaved' | 'success' | 'failure'`，初始值 `'unsaved'`）和 `saveMessage` ref（初始值空串）。
- [x] 修改 `src/App.vue`：新增 `statusBarStatus` computed 属性，将 `saveStatus` 映射为 StatusBar 的 `status` prop 格式。
- [x] 修改 `src/App.vue`：watch `content` 变化时将 `saveStatus` 重置为 `'unsaved'`。
- [x] 修改 `src/App.vue`：将 `saveStatus` 传递给 `TitleBar` 的 `save-status` prop。
- [x] 修改 `src/App.vue`：将 `saveMessage` 传递给 `StatusBar` 的 `message` prop，将 `statusBarStatus` 传递给 `StatusBar` 的 `status` prop。
- [x] 修改 `src/App.vue`：在 E2E 环境（`window.__TAURI_MOCK__` 存在时）向 `window` 暴露 `__SET_SAVE_STATUS__` 和 `__SET_SAVE_MESSAGE__` 函数，供测试驱动状态变化。
- [x] 新增 `e2e/story-2-3.spec.ts`：覆盖初始 unsaved 状态、三态圆点显示/颜色、content 变化触发重置、状态栏消息与颜色。使用 `e2e/fixtures.ts` 中导出的 `test` 和 `expect`。
- [x] 验证 `npm run build` 通过 TypeScript 类型检查且无 Vue 编译错误。
- [x] 验证 Story 2.1 和 2.2 的 E2E 回归测试全部通过。

**Acceptance Criteria:**
- [x] Given 应用主窗口已加载，When 初始状态，Then 标题栏无状态圆点（`saveStatus` 为 `'unsaved'`）。
- [x] Given 应用主窗口已加载，When `saveStatus` 被设为 `'success'`，Then 标题栏右侧显示绿色圆点（颜色为 `--color-success` = `#3FB950`）。
- [x] Given 应用主窗口已加载，When `saveStatus` 被设为 `'failure'`，Then 标题栏右侧显示红色圆点（颜色为 `--color-error` = `#F85149`）。
- [x] Given 标题栏处于 success 或 failure 状态，When 用户修改 `content`（在编辑器中输入），Then `saveStatus` 自动重置为 `'unsaved'`，标题栏圆点消失。
- [x] Given `saveMessage` 被设为保存成功/失败消息，When 状态栏渲染，Then 状态栏左侧显示该消息，且颜色与 `saveStatus` 一致（success 绿色、failure 红色、unsaved 默认 muted 色）。
- [x] Given 运行 `npm run build`，When 构建完成，Then 无 TypeScript 或 Vue 编译错误。
- [x] Given 运行 Story 2.1 和 2.2 的 E2E 测试，When 测试完成，Then 全部通过，无回归。

## Verification

**Commands:**
- `npm run build` — ✅ 无错误。
- `npm run test:e2e -- e2e/story-2-3.spec.ts` — ✅ 8 个测试全部通过。
- `npm run test:e2e -- e2e/story-2-1.spec.ts e2e/story-2-2.spec.ts` — ✅ 26 个回归测试全部通过。

**Manual checks:**
- 启动应用，标题栏无状态圆点。
- 通过 DevTools 或暴露的测试函数设置 `saveStatus = 'success'`，标题栏显示绿色圆点。
- 设置 `saveStatus = 'failure'`，标题栏显示红色圆点。
- 在编辑器输入内容，圆点消失（回到 unsaved）。

## Dev Agent Record

### Agent Model Used

(to be filled by dev agent)

### Completion Notes

- 2026-07-23：完成 Story 2.3 实现。修改 `src/App.vue`，新增 `saveStatus`/`saveMessage` 响应式状态，接通 TitleBar 三态圆点与 StatusBar 消息传递。新增 8 个 E2E 测试。
- `npm run build` 通过；Story 2.3 的8 个 E2E 测试全部通过；Story 2.1/2.2 的26 个回归测试全部通过，共 34 个测试通过。

### File List

- 修改：`src/App.vue`（新增 saveStatus/saveMessage 状态、computed 映射、content watcher、prop 传递、E2E 测试辅助函数）
- 新增：`e2e/story-2-3.spec.ts`（8 个测试）
- 未修改：`src/components/TitleBar.vue`、`src/components/StatusBar.vue`、`src/components/SourceEditor.vue`、`src/components/PreviewPane.vue`、`src/components/MenuBar.vue`
- 未修改：Rust 后端

## Change Log

- 2026-07-23: 创建 Story 2.3 故事文件。在 App.vue 中建立 saveStatus/saveMessage 状态管道，接通 TitleBar 三态圆点与 StatusBar 消息传递，为 Epic 3 自动保存提供就绪的 UI 反馈通道。
- 2026-07-23: 实现完成。状态 `ready-for-dev` → `review`。修改 App.vue，新增 8 个 E2E 测试；34 个测试全部通过，无回归。
- 2026-07-23: Code Review 通过（Clean review）。状态 `review` → `done`。


