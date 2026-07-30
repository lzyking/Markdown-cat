---
id: 5-1-resizable-splitter-component
title: Resizable Splitter Component between Editor and Preview
epic: epic-5
status: done
followup_review_recommended: false
final_revision: e3ad5699c79a8d7af1790f119b56c83501604138
baseline_revision: 1671f72d725ec6d44066b4ea36869751cf1a3a04
---

# Story 5.1: Resizable Splitter Component between Editor and Preview

## Story Description
作为用户，我希望能够按住编辑栏与预览栏之间的分割线左右拖动，以灵活调整代码编辑器与预览区域的宽窄占比，提升在不同屏宽下的书写与阅读体验。

## Acceptance Criteria
1. **拖动交互**: 在左侧源码编辑栏和右侧预览栏之间增加可拖动的 Splitter 元素，鼠标悬停时光标变为 `col-resize`。
2. **最小与最大范围限制**: 拖动时左右两栏均限制最小宽度（例如 200px），避免某一边被完全压死消失。
3. **双击重置**: 双击 Splitter 时自动重置两栏宽度为平分的 50% / 50% 布局。
4. **流畅反馈**: 拖动过程中使用 `requestAnimationFrame` 或原生事件调优，保证拖拽流畅无卡顿、掉帧。
5. **全局拖拽绑定与硬性边界约束**: 拖拽事件在全局 `window` 监听（防止鼠标划出分界线或移出窗口时状态挂起）；通过 `Math.max(200, Math.min(newWidth, containerWidth - 200))` 强制约束双栏最小宽度不低于 200px。

## Tasks & Acceptance
- [x] 在 `src/App.vue` 中替换原有固定 50%/50% 布局，引入可拖动的 Splitter 元素分隔源码编辑栏与预览栏。
- [x] 实现鼠标悬停 Splitter 时光标变为 `col-resize`。
- [x] 实现拖拽逻辑：在 `window` 上监听 `mousemove`/`mouseup`，用 `Math.max(200, Math.min(newWidth, containerWidth - 200))` 限制最小宽度 200px。
- [x] 实现双击 Splitter 将左右栏重置为 50% / 50%。
- [x] 使用 `requestAnimationFrame` 优化拖拽时的宽度更新，避免掉帧。
- [x] 运行 `npm run build` 验证无 TypeScript 与构建错误。
- [x] 新增/更新 E2E 测试覆盖 Story 5.1 与受影响的 Story 2.4 断言，全量回归通过。

## Verification

- `npm run build` — ✅ 通过（`vue-tsc --noEmit && vite build`）。
- `npx playwright test e2e/story-5-1.spec.ts` — ✅ 5/5 通过。
- `npx playwright test e2e/story-2-4.spec.ts` — ✅ 6/6 通过（已更新受 splitter 影响的 1:1 与 separator 断言）。
- `npx playwright test` — ✅ 75/75 全量通过。

## File List

- 修改：`src/App.vue`（添加 splitter 状态、拖拽/双击/resize 逻辑、样式）。
- 修改：`e2e/story-2-4.spec.ts`（调整 1:1 容差、将「无手柄」断言改为「存在 separator」断言）。
- 新增：`e2e/story-5-1.spec.ts`（5 个 E2E 用例覆盖 splitter 全部 AC）。

## Auto Run Result

Status: done
Summary: 在 `src/App.vue` 的源码编辑器与预览栏之间实现了可拖动垂直 Splitter，支持全局鼠标拖拽、200px 最小宽度约束、双击重置 50%/50%、requestAnimationFrame 流畅更新，并补充/更新了 E2E 测试。
Files changed:
- `src/App.vue`: 新增 splitter 状态、拖拽/双击/resize 逻辑与样式。
- `e2e/story-2-4.spec.ts`: 调整 1:1 容差、将「无手柄」断言改为「存在 separator」断言。
- `e2e/story-5-1.spec.ts`: 新增 5 个 E2E 用例覆盖 splitter 全部 AC。
- `_bmad-output/implementation-artifacts/deferred-work.md`: 记录键盘/触屏/ARIA 语义延后项。
Review findings:
- 已修复 patch: resetWidths 未扣除 splitter 宽度、初始布局可能溢出、mousemove 中重复 getBoundingClientRect、卸载时未恢复 userSelect。
- 已推迟 defer: 键盘/触屏交互与 ARIA 值语义（MVP 未在 AC 中要求）。
Follow-up review recommended: false
Verification:
- `npm run build` — ✅ 通过。
- `npx playwright test` — ✅ 75/75 通过。
Residual risks: 无。延后项已记录在 deferred-work.md。

## Review Triage Log

### 2026-07-30 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4 (medium 2, low 2)
- defer: 2 (medium 2)
- reject: 0
- addressed_findings:
  - `[medium] [patch]` 重置为 50%/50% 时未扣除 splitter 宽度，导致右栏少 4px；已修复 `resetWidths`/`onWindowResize`，扣除 splitter 后再平分并调用 `clampLeftWidth`。
  - `[medium] [patch]` 初始 `leftWidth = 0` 时两栏均回退到 50%，加上 splitter 会导致短暂横向溢出；已将 CSS 回退改为 `calc(50% - 2px)`。
  - `[low] [patch]` `mousemove` 每次调用 `getBoundingClientRect()` 可能引起布局抖动；已在 `mousedown` 时缓存 `dragContainerRect`。
  - `[low] [patch]` 组件卸载时若处于拖拽中，`userSelect: none` 可能残留；已在 `onUnmounted` 中恢复。
- deferred_findings:
  - `[medium] [defer]` Splitter 当前仅支持鼠标拖拽，缺少键盘（ArrowLeft/ArrowRight）与触屏交互；桌面端 MVP 未在 AC 中要求，记录到 deferred-work 供后续迭代评估。
  - `[medium] [defer]` Separator 未设置 `aria-valuenow/min/max` 等辅助属性；当前 AC 未要求，后续可随键盘支持一并补充。
