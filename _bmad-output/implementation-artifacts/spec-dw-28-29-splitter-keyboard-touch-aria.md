---
title: 'Splitter 键盘/触屏交互与 ARIA 值语义（DW-28, DW-29）'
type: 'feature'
created: '2026-08-02'
status: 'done'
baseline_revision: '17803e8c5651b094980505e4ee2fc9906487d9aa'
final_revision: '544b5f4055d05fcf64bcfd5ae79ed461e6ea5cff'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** `src/App.vue` 的 splitter（`role="separator"`）当前仅支持鼠标拖拽（`@mousedown` + `window.mousemove`/`mouseup`），缺少触屏（`touchstart`/`touchmove`/`touchend`）与键盘（ArrowLeft/ArrowRight/Home/End）交互；同时仅有 `aria-label`，缺少 `aria-valuenow`/`aria-valuemin`/`aria-valuemax`，屏幕阅读器无法感知当前分栏比例。

**Approach:** 复用现有 `clampLeftWidth`/`scheduleWidthUpdate`/`stopDragging` 等宽度更新与约束逻辑，为 splitter 新增触屏事件处理器（单指拖拽，行为与鼠标拖拽等价）和键盘事件处理器（方向键步进调整、Home/End 跳到两端约束值），并让 splitter 元素声明 `tabindex="0"` 与随 `leftWidth` 实时更新的 `aria-valuenow`/固定的 `aria-valuemin`/`aria-valuemax`。

## Boundaries & Constraints

**Always:**
- 触屏与键盘产生的宽度必须经过与鼠标拖拽相同的 `clampLeftWidth(newWidth, containerWidth)` 约束，两栏最小宽度不得低于 200px（沿用 Story 5.1 既有规则）。
- `aria-valuenow` 表示左栏宽度占容器宽度（`containerRef` 宽度）的百分比，取整数（`Math.round`），随 `leftWidth` 变化同步更新；`aria-valuemin="0"`、`aria-valuemax="100"` 为固定值。
- 触屏拖拽必须在 `touchmove` 中调用 `e.preventDefault()`（配合非 passive 监听）以阻止页面滚动/缩放随手势联动，且必须在 `touchend`（含 `touchcancel`）时清理拖拽状态，语义与现有 `onWindowMouseUp`/`stopDragging` 对齐。
- 键盘方向键每次调整步进为容器宽度的 2%（`containerWidth * 0.02`，不足 1px 时至少 1px），Home 键调整为最小宽度（200px），End 键调整为最大宽度（`containerWidth - 200`）；调整后必须置 `isManuallyResized = true`，行为与鼠标拖拽结束后一致（不会被后续 window resize 的自动 50/50 逻辑覆盖）。
- 组件卸载（`onUnmounted`）时必须移除新增的 `touchmove`/`touchend`/`touchcancel` 全局监听，避免内存泄漏，对齐现有 mousemove/mouseup 清理模式。
- 保持所有现有鼠标交互（拖拽、双击重置）行为与既有 E2E 测试（`e2e/story-5-1.spec.ts`、`e2e/story-2-4.spec.ts`）不回归。

**Block If:** 无需人工决策的已知阻塞条件——本任务范围与既有拖拽逻辑清晰对应，无需暂停。

**Never:**
- 不引入第三方手势库（如 hammer.js）；触屏交互仅用原生 `TouchEvent` API 实现，与现有原生 `MouseEvent` 实现风格一致。
- 不改变 splitter 双击重置（`resetWidths`）、`role="separator"`、既有 `aria-label` 的既有行为与文本。
- 不为编辑栏（`.source-pane`）/预览栏本身新增可聚焦焦点陷阱；键盘支持仅作用于 splitter 元素自身的 `tabindex`。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 触屏单指拖拽 | `touchstart` 于 splitter，随后 `touchmove` 携带 1 个 `touches[0]` | 左栏宽度随手指水平位置实时更新，约束在 [200, containerWidth-200] | 若 `touches` 为空则忽略该次 `touchmove` |
| 触屏松开 | `touchend` 或 `touchcancel` | 停止拖拽，清理全局 touch 监听，`leftWidth` 保持最后位置 | 无异常抛出 |
| 键盘 ArrowLeft/ArrowRight | splitter 聚焦，按下方向键 | 左栏宽度按 2% 容器宽度步进增减，约束在 [200, containerWidth-200] | 到达边界时保持边界值，不报错 |
| 键盘 Home/End | splitter 聚焦，按下 Home 或 End | 左栏宽度分别跳变为 200px（Home）或 `containerWidth-200`（End） | 若容器不存在（`containerRef.value` 为空）则不执行 |
| 屏幕阅读器读取 | splitter 处于任意宽度状态 | `aria-valuenow` 与当前左栏宽度百分比一致（整数），`aria-valuemin=0`、`aria-valuemax=100` | 无 |

</intent-contract>

## Code Map

- `src/App.vue` -- splitter 模板与拖拽脚本逻辑；新增触屏/键盘事件处理器、`aria-valuenow` 计算属性，并挂载/卸载新增的全局监听。
- `e2e/story-5-1.spec.ts` -- 为 splitter 新增键盘、ARIA 值语义与编程式 touch 拖拽回归覆盖。

## Tasks & Acceptance

**Execution:**
- [x] `src/App.vue` -- 新增计算属性（如 `splitterAriaValueNow`），基于 `leftWidth.value` 与 `containerRef` 当前宽度计算整数百分比，容器宽度不可用时回退为 `50` -- 为 ARIA 值语义提供数据源
- [x] `src/App.vue` -- 在 splitter 元素上新增 `tabindex="0"`、`:aria-valuenow`、`aria-valuemin="0"`、`aria-valuemax="100"` 属性绑定 -- 补齐 ARIA 值语义（DW-29）
- [x] `src/App.vue` -- 新增 `onSplitterTouchStart(e: TouchEvent)`，读取 `e.touches[0]`，复用 `containerRef.value.getBoundingClientRect()` 缓存到 `dragContainerRect`，设置 `isDragging = true`、`isManuallyResized = true`，并绑定 `window` 上的 `touchmove`/`touchend`/`touchcancel` 监听（`touchmove` 用 `{ passive: false }`） -- 支持触屏拖拽起始（DW-28）
- [x] `src/App.vue` -- 新增 `onWindowTouchMove(e: TouchEvent)`，对 `e.touches[0]` 计算 `clampLeftWidth` 后的宽度并 `e.preventDefault()`、调用 `scheduleWidthUpdate`；新增 `onWindowTouchEnd()` 复用现有 `stopDragging()` 逻辑并移除 touch 监听 -- 支持触屏拖拽过程与结束（DW-28）
- [x] `src/App.vue` -- 在 splitter 元素上绑定 `@touchstart="onSplitterTouchStart"` -- 接入触屏事件入口
- [x] `src/App.vue` -- 新增 `onSplitterKeyDown(e: KeyboardEvent)`，处理 `ArrowLeft`/`ArrowRight`（步进 `Math.max(1, containerWidth * 0.02)`）、`Home`（跳到 200px）、`End`（跳到 `containerWidth-200`），每次调用 `e.preventDefault()`、`clampLeftWidth` 约束、直接写 `leftWidth.value`，并置 `isManuallyResized = true` -- 支持键盘交互（DW-28）
- [x] `src/App.vue` -- 在 splitter 元素上绑定 `@keydown="onSplitterKeyDown"` -- 接入键盘事件入口
- [x] `src/App.vue` -- 在 `onUnmounted` 中新增移除 `touchmove`/`touchend`/`touchcancel` 监听，与现有 mousemove/mouseup 清理并列 -- 防止卸载后残留监听
- [x] `e2e/story-5-1.spec.ts` -- 新增用例覆盖：键盘 ArrowLeft/ArrowRight/Home/End 调整宽度、splitter 具备 `aria-valuenow`/`aria-valuemin`/`aria-valuemax` 且值随宽度变化、（若 Playwright 可行）触屏 `dispatchEvent` 模拟拖拽 -- 验证本次新增交互与既有测试同风格回归覆盖
- [x] 运行 `npm run build` 验证无 TypeScript / 构建错误 -- 基本回归检查
- [x] 运行 `npx playwright test` 验证全量 E2E 无回归 -- 确认未破坏既有拖拽/双击/布局断言

**Acceptance Criteria:**
- Given splitter 处于默认焦点外, when 用户 Tab 聚焦到 splitter 并按下 ArrowRight, then 左栏宽度增加约 2% 容器宽度且不超过 `containerWidth-200`
- Given splitter 已获得焦点, when 用户按下 Home, then 左栏宽度变为 200px（不再小于该值）
- Given splitter 已获得焦点, when 用户按下 End, then 左栏宽度变为 `containerWidth-200`（不再大于该值）
- Given 触屏设备用户在 splitter 上按下并水平滑动, when 手指移动经过 `touchmove`, then 左栏宽度实时跟随并保持 [200, containerWidth-200] 约束，页面不发生滚动
- Given 任意宽度状态, when 检查 splitter DOM 属性, then `role="separator"`、`aria-label` 保持不变，且新增 `aria-valuenow`（当前百分比整数）、`aria-valuemin="0"`、`aria-valuemax="100"` 均存在

## Spec Change Log

## Review Triage Log

### 2026-08-02 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5 (medium 4, low 1)
- defer: 1 (medium 1)
- reject: 5 (low 5)
- addressed_findings:
  - `[low]` `[patch]` splitter 缺少 `aria-orientation="vertical"`；已补充该属性，与其视觉/交互方向保持一致。
  - `[medium]` `[patch]` splitter 获得 `tabindex="0"` 后无可见焦点样式；已新增 `:focus-visible` outline 样式。
  - `[medium]` `[patch]` `onSplitterTouchStart` 未调用 `e.preventDefault()`，可能触发浏览器兼容鼠标事件/幽灵点击；已补充 `preventDefault()`。
  - `[medium]` `[patch]` 触屏拖拽未处理多指场景，直接取 `touches[0]`；已改为记录 `activeTouchId` 并在 `touchmove`/`touchend` 中按该 identifier 匹配对应触点，忽略其余触点，且 `touchstart` 时多于 1 个触点直接忽略。
  - `[medium]` `[patch]` 键盘调整未考虑正在进行的拖拽，理论上可能被后续 `finalizeDragging()` 用陈旧 `pendingWidth` 覆盖；已在 `onSplitterKeyDown` 增加 `isDragging` 早退保护。
- deferred_findings:
  - `[medium]` `[defer]` `End`/触屏拖到最右侧时把左栏上限设为 `containerWidth - 200`，但预览栏还需再扣除 4px splitter 占位宽度，实际右栏最小可用宽度约 196px；此为 Story 5.1 遗留的既有边界计算问题，非本次改动引入，记录到 deferred-work 供后续统一修正（与鼠标拖拽共享同一 `clampLeftWidth` 逻辑）。
- rejected_findings（noise / 与 intent-contract 明确设计一致，不构成缺陷）:
  - `aria-valuemin/valuemax` 采用固定 0–100 表示百分比而非真实像素范围 —— 与 intent-contract 中"aria-valuenow 表示...百分比...aria-valuemin=0、aria-valuemax=100 为固定值"的明确设计一致。
  - `touchcancel` 被当作 `touchend` 一样提交当前宽度 —— 与 intent-contract 中"在 touchend（含 touchcancel）时清理拖拽状态，语义与现有 onWindowMouseUp/stopDragging 对齐"的明确要求一致。
  - E2E 使用手工构造的 `TouchEvent`/`page.evaluate` 模拟触屏，而非真实设备输入 —— 与 spec Verification 部分"若 Playwright 环境不支持模拟真实触屏手势，退化为对 dispatchEvent(new TouchEvent(...)) 的编程式验证"的既定 fallback 一致。
  - 触屏 E2E 仅断言合成事件 `defaultPrevented`，未验证真实页面滚动 —— 同属上述已知测试保真度限制，非本次新增缺陷。
  - 新增测试大量使用 `waitForTimeout(50/100)` —— 与文件内既有测试风格一致，非本次改动独有问题。

## Design Notes

触屏交互刻意复用鼠标拖拽已有的 `clampLeftWidth`/`scheduleWidthUpdate`/`stopDragging` 辅助函数，仅新增事件适配层（`onSplitterTouchStart`/`onWindowTouchMove`/`onWindowTouchEnd`），避免重复实现宽度约束与 rAF 节流逻辑。键盘步进选用容器宽度的百分比（而非固定像素）以便在不同窗口尺寸下都有合理的可感知调整幅度，示例：容器 1000px 时每次 ArrowRight 约调整 20px。审查后追加：触屏交互通过 `activeTouchId` 跟踪单一触点 identifier，避免多指触摸时拖拽源不稳定；键盘处理器在检测到鼠标/触屏拖拽进行中时直接忽略按键，避免状态竞争。

## Verification

**Commands:**
- `npm run build` -- expected: 无 TypeScript / 构建错误
- `npx playwright test` -- expected: 全量用例通过，无回归

**Manual checks (if no CLI):**
- 若 Playwright 环境不支持模拟真实触屏手势，退化为对 `dispatchEvent(new TouchEvent(...))` 的编程式验证，或在实现说明中记录该项为手动/受限验证并解释原因。

## Auto Run Result

Status: done
Summary: 为 `src/App.vue` 中的编辑栏/预览栏 splitter（`role="separator"`）补充了触屏（touchstart/touchmove/touchend/touchcancel）与键盘（ArrowLeft/ArrowRight/Home/End）交互，并新增 `aria-orientation`/`aria-valuenow`/`aria-valuemin`/`aria-valuemax` ARIA 值语义，解决 DW-28（键盘与触屏交互缺失）与 DW-29（ARIA 值语义缺失）。触屏与键盘调整均复用既有 `clampLeftWidth`/`scheduleWidthUpdate`/`stopDragging` 逻辑，保持与鼠标拖拽一致的 200px 最小宽度约束；审查阶段进一步补充了单指触点追踪（`activeTouchId`）、触屏 `preventDefault()`、聚焦可见样式与拖拽期间键盘操作的互斥保护。
Files changed:
- `src/App.vue`: 新增 `splitterAriaValueNow` 计算属性、`onSplitterTouchStart`/`onWindowTouchMove`/`onWindowTouchEnd`/`onSplitterKeyDown` 事件处理器、`finalizeDragging`/`removeTouchListeners` 辅助函数、splitter 上的 `tabindex`/ARIA 属性绑定与 `:focus-visible` 样式，并在 `onUnmounted` 中清理新增的 touch 监听。
- `e2e/story-5-1.spec.ts`: 新增 4 个用例（S5.1-E2E-006~009）覆盖键盘步进/边界、ARIA 值语义随宽度更新、触屏拖拽约束与默认行为阻止。
- `_bmad-output/implementation-artifacts/spec-dw-28-29-splitter-keyboard-touch-aria.md`: 新建本次工作的 spec 文件（含 Review Triage Log）。
Review findings:
- 已修复 patch（5 项，medium 4 / low 1）：补充 `aria-orientation="vertical"`；新增 splitter `:focus-visible` 焦点样式；`onSplitterTouchStart` 补充 `preventDefault()` 防止幽灵鼠标事件；触屏交互改为按 `activeTouchId` 跟踪单一触点，避免多指干扰；键盘处理器在拖拽进行中直接忽略，避免与 `finalizeDragging()` 的状态竞争。
- 已推迟 defer（1 项，medium）：`End`/触屏拖到最右侧的上限计算未扣除 4px splitter 占位宽度，导致右栏实际最小宽度约 196px 而非 200px——此为 Story 5.1 遗留的既有边界计算问题，非本次改动引入，已记录到本 spec 的 Review Triage Log（未写入 deferred-work.md，由编排器统一记录）。
- 已拒绝 reject（5 项）：ARIA 百分比值域设计、`touchcancel` 提交语义、测试用合成 `TouchEvent`、测试未验证真实滚动、`waitForTimeout` 用法——均与 intent-contract 明确设计或既有测试风格一致，非缺陷。
Follow-up review recommendation: false（本轮修复均为局部、低风险的健壮性/无障碍性补丁，未涉及行为范围扩大或架构性变更，全量测试保持绿灯）。
Verification performed:
- `npm run build` — ✅ 通过（`vue-tsc --noEmit && vite build`，实现阶段与审查补丁后各验证一次）。
- `npx playwright test` — ✅ 102/102 通过（实现阶段与审查补丁后各全量运行一次，无回归）。
Residual risks: Story 5.1 遗留的 4px splitter 占位导致右栏最小宽度约 196px（非 200px）的边界计算问题仍未修正，已作为 defer 项记录在本 spec 中，供编排器决定是否/何时统一处理。
