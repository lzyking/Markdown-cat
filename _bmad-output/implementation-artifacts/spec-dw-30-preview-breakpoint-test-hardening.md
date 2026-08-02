---
title: 'e2e story-5-2 响应式断点测试应从 preview.ts 派生阈值，而非硬编码像素目标（DW-30）'
type: 'refactor'
created: '2026-08-02'
status: 'done'
baseline_revision: 'f5ca4916f4a0db70f40225aedf68e14f5d0c8646'
final_revision: '2520a8e999514cc63cf088e4f987c256a937d5ea'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** `e2e/story-5-2.spec.ts` 的第三个用例（`S5.2-E2E-003`）通过 `dragSplitterTo(page, 900)` 拖动到固定像素位置来断言 `data-preview-layout` 变为 `compact`，同时硬编码假设初始状态为 `regular`、`600px` 视口切换后为 `wide`。这些判断隐含复刻了 `src/lib/preview.ts` 中 `resolveResponsiveLayout` 使用的 `420px`/`640px` 阈值常量，但测试里并未引用该常量或函数——一旦默认分栏比例或断点阈值调整，测试会脆弱失败，且失败信息无法说明"是断点逻辑变了"还是"只是拖拽目标凑巧没跨过阈值"。

**Approach:** 从 `src/lib/preview.ts` 导出断点阈值常量（`PREVIEW_COMPACT_MAX_WIDTH`、`PREVIEW_REGULAR_MAX_WIDTH`），并让 `resolveResponsiveLayout` 内部改用这两个常量（行为不变）。在 `e2e/story-5-2.spec.ts` 中导入 `resolveResponsiveLayout` 及这两个常量作为唯一真源：断言 `data-preview-layout` 时，不再写死字符串字面量作为"预期答案"，而是先读取 `.preview-pane-inner` 的**真实渲染宽度**（`boundingBox().width`，独立于组件内部状态，避免同源验证的重言式风险），用导入的 `resolveResponsiveLayout(实际宽度)` 计算预期布局并与 `data-preview-layout` 比较；同时用导入的阈值常量断言实际宽度确实落在预期分区内（例如 compact 阶段 `actualWidth <= PREVIEW_COMPACT_MAX_WIDTH`），这样如果默认分栏比例变化导致拖拽不再跨越断点，测试会因"宽度未落入预期分区"而给出明确失败原因，而不是静默使用错误标签通过。

## Boundaries & Constraints

**Always:**
- `resolveResponsiveLayout` 导出签名、参数、返回值类型（`PreviewLayout`）与三分类行为（`<= 420` compact / `<= 640` regular / 否则 wide）必须保持不变；仅将内部魔法数字替换为具名导出常量，不改变任何阈值数值。
- 新导出的 `PREVIEW_COMPACT_MAX_WIDTH`、`PREVIEW_REGULAR_MAX_WIDTH` 常量值分别为 `420`、`640`，与当前行为完全一致。
- 只修改 `e2e/story-5-2.spec.ts` 中 `S5.2-E2E-003`（响应式布局断点）用例；`S5.2-E2E-001`、`S5.2-E2E-002` 用例的 `dragSplitterTo` 调用（860px、880px）与其断言逻辑保持不变，因为它们验证的是图片缩放/横向滚动行为，不涉及断点契约。
- 每处 `dragSplitterTo` 调用旁必须补充简短注释，说明该拖拽像素位置与预览面板列宽/断点分区之间的映射关系（例如："拖到 x=900 会把预览面板宽度压缩到远小于 compact 阈值（420px），足以在当前 1100px 视口默认分栏比例下稳定触发 compact 分区"）。
- 断点相关断言必须通过 `import` 引用 `../src/lib/preview` 中的 `resolveResponsiveLayout` 与阈值常量，不得在测试文件中重新书写 `420`/`640` 字面量。
- 保留现有 `initialWidth`/`compactWidth`/`wideWidth` 之间"依次变化"的相对性断言（如 `compactWidth < initialWidth`、`wideWidth > compactWidth`），因为它们验证 resize 后数值确实更新，与断点契约互补。

**Block If:** 无需人工决策的已知阻塞条件——本次仅涉及测试文件与 `preview.ts` 常量导出的重构，阈值数值、组件行为均不改变，无歧义需要暂停。

**Never:**
- 不修改 `src/components/PreviewPane.vue` 中 `applyResponsiveLayout`/`scheduleResponsiveLayout` 的 ResizeObserver 逻辑或 `data-preview-width`/`data-preview-layout` 的赋值时机。
- 不改变 `PREVIEW_LAYOUT_STYLES`（`compact`/`regular`/`wide` 对应的字体大小、内边距等视觉样式表）。
- 不新增第三方断点/响应式工具依赖；直接复用项目现有的 `resolveResponsiveLayout` 函数与新导出常量。
- 不改动 `dragSplitterTo` 辅助函数本身的拖拽实现（鼠标 hover/down/move/up 序列），只在调用处添加注释、按需读取真实宽度。
- 不为了"完全消除拖拽像素数字"而改用无关的技术方案（如直接操纵组件内部状态/props 绕过真实拖拽交互）——测试仍需通过真实鼠标拖拽产生尺寸变化，只是断言侧不再硬编码断点结果。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 初始视口下预览面板宽度处于 wide 或 regular 分区 | 1100x700 视口，默认分栏比例下预览面板初始宽度 `w0` | 读取 `.preview-pane-inner` 真实 `boundingBox().width` 作为 `w0`，断言 `data-preview-layout` 等于 `resolveResponsiveLayout(w0)`（导入函数计算得出，而非硬编码 `'regular'`） | 若属性值与计算值不一致，测试失败并暴露实际宽度与断点函数的分歧 |
| 拖动 splitter 到 x=900，压缩预览面板 | 预览面板真实宽度 `w1 < w0` | 断言 `w1 <= PREVIEW_COMPACT_MAX_WIDTH`（导入常量，确认已进入 compact 分区），且 `data-preview-layout` 等于 `resolveResponsiveLayout(w1)`（应为 `'compact'`） | 若 `w1` 未落入 compact 分区（如默认分栏比例改变导致拖拽不足），断言在"宽度分区检查"处即失败，明确提示拖拽目标需要调整，而非断点逻辑本身有误 |
| 视口切换为 1600x700，预览面板变宽 | 预览面板真实宽度 `w2 > w1` | 断言 `w2 > PREVIEW_REGULAR_MAX_WIDTH`（导入常量，确认进入 wide 分区），且 `data-preview-layout` 等于 `resolveResponsiveLayout(w2)`（应为 `'wide'`） | 同上，失败信息可区分"宽度未达标"与"标签计算错误" |

</intent-contract>

## Code Map

- `src/lib/preview.ts` -- 导出 `PREVIEW_COMPACT_MAX_WIDTH`（420）、`PREVIEW_REGULAR_MAX_WIDTH`（640）两个常量，并让 `resolveResponsiveLayout`（约第 80-90 行）内部引用这两个常量替代裸露的 `420`/`640` 字面量，行为不变。
- `e2e/story-5-2.spec.ts` -- 在文件顶部新增 `import { resolveResponsiveLayout, PREVIEW_COMPACT_MAX_WIDTH, PREVIEW_REGULAR_MAX_WIDTH } from '../src/lib/preview'`；重写 `S5.2-E2E-003` 用例（约第 143-166 行），改为读取真实 `boundingBox().width` 并用导入的函数/常量计算预期值；在三处 `dragSplitterTo` 调用旁补充映射关系注释。
- `src/components/PreviewPane.vue` -- `data-preview-layout`/`data-preview-width` 的赋值来源（约第 39-53 行），仅作为背景参考确认属性语义，本次不修改。

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/preview.ts` -- 导出 `PREVIEW_COMPACT_MAX_WIDTH = 420` 与 `PREVIEW_REGULAR_MAX_WIDTH = 640` 常量，`resolveResponsiveLayout` 改为引用这两个常量 -- 为测试提供可导入的单一真源，消除测试与实现之间的魔法数字重复
- [x] `e2e/story-5-2.spec.ts` -- 导入 `resolveResponsiveLayout` 与新导出的两个阈值常量 -- 使测试断言可以引用真源而非重写字面量
- [x] `e2e/story-5-2.spec.ts` -- 重写 `S5.2-E2E-003` 用例：三处状态（初始、拖拽后、视口切换后）均改为读取 `.preview-pane-inner` 的 `boundingBox().width` 作为真实宽度，用导入的 `resolveResponsiveLayout` 计算预期 `data-preview-layout` 值并断言相等；并用导入的阈值常量分别断言各阶段真实宽度落在预期分区内（如 `w1 <= PREVIEW_COMPACT_MAX_WIDTH`、`w2 > PREVIEW_REGULAR_MAX_WIDTH`） -- 使测试失败时能明确区分"宽度未跨越阈值"与"断点计算逻辑本身错误"，让测试只在响应式行为真正变化时才有意义地失败
- [x] `e2e/story-5-2.spec.ts` -- 在 `dragSplitterTo(page, 860)`、`dragSplitterTo(page, 880)`、`dragSplitterTo(page, 900)` 三处调用旁添加简短注释，说明该像素拖拽目标与预览面板宽度/断点分区的映射关系 -- 让像素数字与列宽的耦合从隐式变为显式，便于未来维护者理解

**Acceptance Criteria:**
- Given 1100x700 视口下的默认分栏状态，when 读取 `.preview-pane-inner` 的真实宽度并代入导入的 `resolveResponsiveLayout`，then 计算结果与当前 `data-preview-layout` 属性值一致（不再依赖硬编码的 `'regular'` 字面量）
- Given 拖动 splitter 到 x=900 后，when 读取真实预览宽度，then 该宽度小于等于导入的 `PREVIEW_COMPACT_MAX_WIDTH` 常量，且 `data-preview-layout` 等于 `'compact'`
- Given 视口切换为 1600x700 后，when 读取真实预览宽度，then 该宽度大于导入的 `PREVIEW_REGULAR_MAX_WIDTH` 常量，且 `data-preview-layout` 等于 `'wide'`
- Given `src/lib/preview.ts` 的 `resolveResponsiveLayout` 函数，when 使用与此前相同的输入宽度调用，then 返回值与重构前完全一致（未改变任何阈值判断行为）
- Given 完整 `npx playwright test e2e/story-5-2.spec.ts` 运行，when 所有三个用例执行，then 全部通过

## Spec Change Log

## Review Triage Log

### 2026-08-02 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 0, medium 2, low 3)
- defer: 0
- reject: 5: (high 0, medium 0, low 5)
- addressed_findings:
  - `[medium]` `[patch]` Test's `S5.2-E2E-003` had entirely stopped reading the `data-preview-width` attribute after the refactor, losing coverage of that component-exposed contract — restored a self-consistency check (`data-preview-width` is a finite positive number and `resolveResponsiveLayout(reportedWidth)` matches the layout attribute) at all three states, without reintroducing a fragile exact-width comparison (discovered mid-fix that `data-preview-width`/`contentRect` is content-box while `boundingBox()` is border-box, so an exact-match comparison would itself be flaky due to CSS padding differing per layout).
  - `[medium]` `[patch]` Direct `getAttribute('data-preview-layout')` + `toBe()` comparisons lost Playwright's built-in auto-retry/polling that the original `expect(locator).toHaveAttribute()` pattern had — replaced with `await expect(preview).toHaveAttribute(...)` using the dynamically computed expected value, restoring retry-safety while still deriving the expected value from `resolveResponsiveLayout`.
  - `[low]` `[patch]` Error messages for the compact/wide zone assertions were written in English while the rest of the file is Chinese — translated to Chinese for consistency.
  - `[low]` `[patch]` Comments added at the 860px/880px `dragSplitterTo` call sites made unverified behavioral claims (e.g. "仍保留足够宽度用于验证图片按容器缩放") that no assertion in those tests actually checks — reworded to purely describe the pixel-to-width mapping without asserting untested effects.
  - `[low]` `[patch]` Initial-state layout comparison inlined `resolveResponsiveLayout(initialWidth)` directly while compact/wide branches assigned to a named `*ExpectedLayout` variable first — renamed to `initialExpectedLayout` for consistency across all three states.

## Verification

**Commands:**
- `npm run build` -- expected: TypeScript 编译通过，无类型错误（确认 `preview.ts` 新导出常量与 e2e 测试导入路径均类型正确）
- `npx playwright test e2e/story-5-2.spec.ts` -- expected: Story 5.2 的三个 e2e 用例全部通过

## Auto Run Result

**Summary:** `src/lib/preview.ts` 导出 `PREVIEW_COMPACT_MAX_WIDTH`/`PREVIEW_REGULAR_MAX_WIDTH` 两个断点常量作为唯一真源，`resolveResponsiveLayout` 改为引用它们（行为不变）。`e2e/story-5-2.spec.ts` 的 `S5.2-E2E-003` 用例重写为：读取 `.preview-pane-inner` 的真实 `boundingBox().width`，用导入的 `resolveResponsiveLayout` 计算预期布局并通过 `expect(locator).toHaveAttribute()`（保留自动重试）与真实属性比较，同时用导入的阈值常量断言实际宽度确实落入预期分区，使测试只在响应式行为真正变化时才有意义地失败。`S5.2-E2E-001`/`S5.2-E2E-002` 的拖拽像素目标未变，仅补充了映射关系注释。

**Files changed:**
- `src/lib/preview.ts` -- 导出两个断点常量，`resolveResponsiveLayout` 内部改用常量替代裸露字面量
- `e2e/story-5-2.spec.ts` -- 导入断点常量与函数；重写 `S5.2-E2E-003` 的断言逻辑；三处 `dragSplitterTo` 调用旁新增映射关系注释
- `_bmad-output/implementation-artifacts/spec-dw-30-preview-breakpoint-test-hardening.md` -- 新增本次 spec 文件

**Review findings breakdown:**
- Patches applied: 5（均为 low/medium 严重性，详见 Review Triage Log）—— 恢复 `data-preview-width` 属性的覆盖率、恢复 Playwright 内置重试轮询、统一中英文错误信息、修正未经验证的注释表述、统一变量命名
- Deferred: 0
- Rejected: 5（初始状态不再断言固定 `'regular'` 标签、保留的相对性断言、拖拽像素目标未做几何推导、断点常量与 `export-html.ts` 的一致性、`getAttribute` 空值兜底判断）—— 均判定为符合本次 spec 设计意图或非真实缺陷，予以丢弃

**Verification performed:**
- `npm run build`（含主题一致性/对比度校验 + `vue-tsc --noEmit` + `vite build`）：通过
- `npx playwright test e2e/story-5-2.spec.ts`：3/3 通过
- `npx playwright test`（全量 e2e 回归）：105/105 通过

**Residual risks:**
- 初始视口状态（`S5.2-E2E-003` 起始断言）不再验证具体落在 `'regular'` 分区，而是仅验证 `data-preview-layout` 与 `resolveResponsiveLayout(真实宽度)` 自洽——这是本次 spec 的既定设计取舍（避免复刻会随默认分栏比例变化的硬编码假设），但意味着默认分栏比例大幅偏移导致初始即进入 `compact`/`wide` 分区时，此测试不会报错。
- `S5.2-E2E-001`/`S5.2-E2E-002` 仍使用固定像素拖拽目标（860px/880px），因其验证的是图片缩放/横向滚动而非断点契约，按 spec 范围本次不处理；若未来这两个用例也出现类似脆弱性问题，需另开新的 deferred-work 条目处理。
