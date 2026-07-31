---
id: 5-2-responsive-preview-auto-adapter
title: Responsive Preview Auto Layout Adaptation
epic: epic-5
status: done
baseline_revision: a28235c6ac814c672c2e9537e27db0e60c5a7053
followup_review_recommended: false
final_revision: ca8c44550e3367d140a8116087c09b3ab3bac466
---

# Story 5.2: Responsive Preview Auto Layout Adaptation

## Story Description
作为用户，当我拖动分割线或调整窗口大小时，预览区域能够根据其容器宽度的变化自动适配字号排版、代码块滚动与图片自适应大小，避免内容溢出或排版变形。

## Acceptance Criteria
1. **容器宽度适配**: 预览区使用 CSS `max-width: 100%` / flex 盒模型，内部图片 `max-width: 100%; height: auto` 保持比例。
2. **代码块与表格横向滚动**: 当预览区容器较窄时，代码块和表格提供 `overflow-x: auto` 自定义滚动条，不穿透破坏外部排版。
3. **Resize Observer 监听**: 使用 `ResizeObserver` 监听预览容器尺寸变化，动态更新 Preview 挂载点防抖重排。

## Tasks & Acceptance
- [x] 在 `src/components/PreviewPane.vue` 中为预览根容器补充 `max-width: 100%` / `min-width: 0` / flex 布局约束，确保内容在分栏与窗口缩放时跟随容器收缩。
- [x] 为预览图片补充 `max-width: 100%; height: auto;` 自适应样式，保证大图在窄容器内按比例缩放。
- [x] 为代码块 `pre` 增加独立 `overflow-x: auto` 横向滚动与细滚动条样式，避免长代码撑破外层预览栏。
- [x] 为 Markdown 表格增加横向滚动容器与细滚动条样式，确保窄容器下表格可滚动且不向外层溢出。
- [x] 使用 `ResizeObserver` 监听预览挂载容器宽度变化，并以 `requestAnimationFrame` 防抖更新响应式布局标记与 CSS 变量。
- [x] 新增 `e2e/story-5-2.spec.ts` 覆盖图片自适应、代码块/表格横向滚动与 ResizeObserver 响应式更新。
- [x] 运行 `npm run build` 与 `npx playwright test`，确认构建与全量 E2E 回归通过。

## Verification

- `npm run build` — ✅ 通过（`vue-tsc --noEmit && vite build`）。
- `npx playwright test` — ✅ 78/78 全量通过。

## File List

- 修改：`src/components/PreviewPane.vue`（增加响应式布局变量、图片/代码块/表格约束与 `ResizeObserver` 自适应逻辑）。
- 新增：`e2e/story-5-2.spec.ts`（3 个 E2E 用例覆盖 Story 5.2 全部 AC）。
- 修改：`_bmad-output/implementation-artifacts/5-2-responsive-preview-auto-adapter.md`（补充任务清单、验证记录与文件清单）。

## Review Triage Log

### 2026-07-31 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2 (low 2)
- defer: 2 (low 1, medium 1)
- reject: 9 (low 9)
- addressed_findings:
  - `[low] [patch]` `decorateRenderedHtml` 中 `table.parentNode?.insertBefore(...)` 使用可选链跳过后，紧随其后的 `wrapper.appendChild(table)` 仍无条件执行，若 `parentNode` 为 `null` 会导致表格从渲染树静默消失；已改为显式判空并提前 `return`。
  - `[low] [patch]` 表格包裹容器上设置了未被任何代码或测试读取的 `data-overflow-container="table"` 死属性；已移除。
- deferred_findings:
  - `[medium] [defer]` `e2e/story-5-2.spec.ts` 的响应式断点断言与 `dragSplitterTo` 像素目标值耦合当前默认 50/50 分栏与 1100x700 视口，后续默认分栏比例调整会导致测试脆弱失败；已记录到 deferred-work.md。
  - `[low] [defer]` 响应式断点字号（13/13.5/14px）以字面量硬编码在 `responsiveStyle` 中，未接入项目既有设计 token 体系；已记录到 deferred-work.md 供设计系统扩展时统一处理。
- rejected_findings (noise, no action):
  - `decorateRenderedHtml` 对每次内容变化都用 `DOMParser` 重新解析全量 HTML 的增量性能开销（`renderMarkdown` 本身已在每次按键时重新解析，属既有开销量级的增量，非新增问题类别）。
  - 响应式断点阈值（420px/640px）为硬编码数值，AC 未要求具体断点值，纯风格偏好。
  - `onMounted` 中立即调用 `applyResponsiveLayout` 与后续 resize 走 `requestAnimationFrame` 防抖路径不一致，结果等价、无用户可见影响。
  - `ResizeObserver.observe()` 常在多数浏览器中会立即触发一次初始回调，导致挂载时 `applyResponsiveLayout` 可能被调用两次；调用幂等、无副作用，性能影响可忽略。
  - 响应式状态通过 `data-preview-layout`/`data-preview-width` 暴露在 `aria-live="off"` 区域上；`data-*` 属性不会被屏幕阅读器读出，非无障碍问题。
  - 滚动条样式仅覆盖 WebKit 与 Firefox 引擎写法；Tauri 使用系统 WebView（macOS 为 WebKit），当前目标平台已覆盖。
  - `decorateRenderedHtml` 解析失败时静默回退返回原始 HTML，无日志；`DOMParser.parseFromString` 对合法字符串输入基本不会抛出此路径的失败场景。
  - `onMounted` 中 `previewPaneRef.value` 判空提前返回但无重试；模板中该 ref 对应元素无条件渲染（无 `v-if`），实际不会为 `null`。
  - 嵌套表格（table 中嵌套 table）可能导致 `querySelectorAll('table')` 重复包裹；标准 Markdown 语法不支持在单元格内嵌套表格，无可达路径。

## Auto Run Result

Status: done
Summary: 为 `PreviewPane.vue` 实现了响应式布局自适应：预览容器与内部内容使用 flex/max-width:100% 约束防止溢出；图片补充 `max-width:100%; height:auto`；代码块与表格分别独立 `overflow-x:auto` 横向滚动并附带细滚动条样式，不再撑破外层容器；使用 `ResizeObserver` 监听预览容器宽度变化，通过 `requestAnimationFrame` 防抖更新响应式布局标记（compact/regular/wide）与对应字号/间距 CSS 变量。
Files changed:
- `src/components/PreviewPane.vue`：新增响应式布局状态、`ResizeObserver` 监听与防抖更新、图片/代码块/表格的宽度约束与横向滚动样式、表格 DOM 包裹逻辑。
- `e2e/story-5-2.spec.ts`：新增 3 个 E2E 用例，覆盖图片自适应、代码块/表格横向滚动、ResizeObserver 响应式布局更新三条 AC。
- `_bmad-output/implementation-artifacts/deferred-work.md`：记录 2 项延后事项（e2e 断点/像素耦合脆弱性、响应式字号未接入设计 token 体系）。
Review findings: patch 2（均已修复：表格包裹时 parentNode 判空防止内容静默丢失、移除未使用的 data-overflow-container 死属性）；defer 2（e2e 测试与默认分栏比例/断点耦合、响应式字号硬编码未接入设计 token）；reject 9（性能增量、无障碍误报、浏览器兼容性、防御性冗余等低置信度或无实际影响项）。
Follow-up review recommended: false
Verification:
- `npm run build` — ✅ 通过（`vue-tsc --noEmit && vite build`）。
- `npx playwright test` — ✅ 78/78 全量通过（含新增 `e2e/story-5-2.spec.ts` 3 个用例）。
Residual risks: 无高风险项。已识别的低/中风险延后项见上方 deferred_findings 及 deferred-work.md。
