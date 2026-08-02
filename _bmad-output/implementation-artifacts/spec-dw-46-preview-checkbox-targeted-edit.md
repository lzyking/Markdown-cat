---
title: '预览区 checkbox 切换应使用行级局部编辑事务而非全量替换（DW-46）'
type: 'refactor'
created: '2026-08-02'
status: 'done'
baseline_revision: 'a0a884194a6197880852e45626cc8fbcfe989a34'
final_revision: '649268687274c209f7a402997c11b83d41f5db7e'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** 预览区任务 checkbox 被点击后，`App.vue` 的 `onToggleTask` 通过整体重写 `content.value`（`lines.join('\n')`）驱动 `SourceEditor.vue`；该组件 `watch(() => props.modelValue, ...)` 对任何外部内容变化都统一走 `view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } })` 的全量替换事务，导致 checkbox 这种本应是单行、单字符级别的编辑，产生不必要的撤销历史条目与滚动位置扰动。

**Approach:** 在 `SourceEditor.vue` 的外部 `modelValue` watcher 中，通过比较 `current`（编辑器当前文档）与 `next`（传入的新值）计算“最小公共差异区间”；若该差异区间被包含在单一行内，则派发一个仅覆盖该行内差异范围的局部 `changes` 事务；若差异跨越多行（或无法判定为单行差异），则保留现有 `from: 0, to: doc.length` 的全量替换路径作为兜底，行为不变。

## Boundaries & Constraints

**Always:**
- 必须保留现有全量替换路径（`from: 0, to: view.state.doc.length`）作为其他外部更新场景（如加载新文件、多行修改等）的兜底行为，触发条件不变、结果不变。
- 局部编辑判定与计算必须完全在 `SourceEditor.vue` 内部完成（比较 `current` 与 `next` 两个字符串），不得新增或修改 `props`/`emits` 签名，不得要求调用方（`App.vue`/`onToggleTask`）传入额外的行号或补丁信息。
- 判定逻辑：从字符串首尾双向比较 `current` 与 `next` 找出最小差异区间（首个不同字符的位置、以及从末尾向前数的最后一个不同字符的位置）；仅当该差异区间的起止位置落在 `current` 文档的同一行内（用 `view.state.doc.lineAt` 判定）时，才视为“单行局部编辑”，否则一律回退全量替换。
- 单行局部编辑必须使用单次 `view.dispatch({ changes: { from, to, insert } })`，`from`/`to` 为差异区间在 `current` 文档中的精确偏移，`insert` 为 `next` 中对应差异区间的子串；不得扩大到整行范围（无需替换整行文本，只替换实际变化的子串）。
- 现有 `isApplyingExternalUpdate` 标志的设置/复位时机与作用（抑制 `cursorChange` 事件）必须在局部编辑路径和全量替换路径中都保持一致。
- `next === current`（无变化）时的提前返回逻辑保持不变。
- 不改变 `insertText`/`insertTemplate` 等其他既有函数的行为。

**Block If:** 无需人工决策的已知阻塞条件——本次仅涉及 `SourceEditor.vue` 内部 watcher 对"单行差异"场景的局部化处理，判定规则明确（同一行内的最小差异区间），无歧义需要暂停。

**Never:**
- 不修改预览区 checkbox 点击 → `PreviewPane.vue` 的 `toggle-task` emit → `App.vue` 的 `onToggleTask` 这条既有调用链路的行为、事件签名或参数（`onToggleTask` 仍然整体重写 `content.value`，本次只优化 `SourceEditor.vue` 消费该值时的编辑器事务粒度）。
- 不引入第三方 diff 库或新的依赖；差异计算使用简单的双指针字符串比较即可。
- 不处理"差异区间跨多行"的局部化优化——这类情况直接回退全量替换，不在本次范围内。
- 不改变 CodeMirror 扩展配置（`history`、`keymap` 等）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 单个 checkbox 从未勾选切换为已勾选 | 编辑器当前文档含一行 `- [ ] task`，外部传入 `next` 将该行改为 `- [x] task`，其余行不变 | 仅对该行内 `[ ]` → `[x]` 对应的差异区间派发局部 `changes` 事务（`from`/`to` 精确覆盖变化的字符范围），文档其余部分与撤销历史不受影响 | 无 |
| 单个 checkbox 从已勾选切换为未勾选 | 同上，反向切换 `[x]` → `[ ]` | 同上，局部事务覆盖对应字符 | 无 |
| 多行同时变化（如加载新文件、外部替换整篇内容） | `current` 与 `next` 在多行范围内存在差异（首尾比较后差异区间跨越换行符） | 回退为现有全量替换事务（`from: 0, to: doc.length`），行为与修改前一致 | 无 |
| `next` 与 `current` 完全相同 | 外部触发 watcher 但内容未变 | 提前返回，不派发任何事务（现有行为不变） | 无 |
| `next` 为空字符串（清空文档) 且 `current` 非空 | 极端情况：差异区间等于整个文档 | 差异跨越换行符或等价于整文档替换，判定为非单行，回退全量替换 | 无 |

</intent-contract>

## Code Map

- `src/components/SourceEditor.vue` -- 外部 `modelValue` watcher（约第 191-208 行）：新增单行局部差异计算与局部 `dispatch` 分支，保留全量替换作为兜底。
- `src/components/PreviewPane.vue` -- checkbox 点击处理与 `toggle-task` emit（约第 67-92 行）：仅作为背景参考，本次不修改。
- `src/App.vue` -- `onToggleTask`（约第 927-955 行）：仅作为背景参考，本次不修改，其对 `content.value` 的整体重写行为保持不变。

## Tasks & Acceptance

**Execution:**
- [x] `src/components/SourceEditor.vue` -- 在 `<script setup>` 中新增一个纯函数（如 `computeMinimalLineChange(current, next)`），通过双指针从首尾比较 `current` 与 `next` 找出最小差异区间 `[from, to)`（`from`/`to` 基于 `current` 的偏移）与对应的 `insert` 子串（取自 `next`）；若差异区间起止都落在 `current` 中的同一行（用 `view.state.doc.lineAt` 判定，`view` 存在时），返回 `{ from, to, insert }`，否则返回 `null` -- 提供不依赖第三方库、内部自洽的单行局部差异判定
- [x] `src/components/SourceEditor.vue` -- 修改外部 `modelValue` watcher：在 `next !== current` 分支中，先调用新函数尝试计算局部编辑；若返回非 `null`，派发 `view.dispatch({ changes: { from, to, insert } })`；若返回 `null`，保留现有 `from: 0, to: view.state.doc.length` 全量替换派发；两条路径都维持 `isApplyingExternalUpdate` 标志的设置与复位时机不变 -- 解决 DW-46，为单行编辑（如 checkbox 切换）保留撤销历史与滚动位置
- [x] 新增自动化测试（`node:test` 单测或 e2e，任选合适位置）覆盖 I/O 矩阵中"单个 checkbox 切换触发局部事务"与"多行变化回退全量替换"两个场景 -- 验证 DW-46 修复后的行为边界

**Acceptance Criteria:**
- Given 预览区某个任务 checkbox 从未勾选状态被点击，when `onToggleTask` 重写 `content.value` 触发 `SourceEditor` 的外部 `modelValue` watcher，then 编辑器仅对该行对应的差异字符范围派发局部编辑事务（`from`/`to` 不等于 `0`/`doc.length`，除非该行恰好是整篇文档唯一内容）。
- Given 外部传入的新内容与编辑器当前内容相比存在跨越多行的差异（例如打开新文件），when watcher 被触发，then 编辑器仍使用 `from: 0, to: doc.length` 的全量替换事务，行为与修改前一致。
- Given 外部传入的新内容与编辑器当前内容完全相同，when watcher 被触发，then 不派发任何事务（沿用现有提前返回行为）。

## Spec Change Log

<!-- Append-only. Populated by step-04 during review loops. Do not modify or delete existing entries.
     Each entry records: what finding triggered the change, what was amended, what known-bad state
     the amendment avoids, and any KEEP instructions (what worked well and must survive re-derivation).
     Empty until the first bad_spec loopback. -->

## Review Triage Log

<!-- Append-only. Populated by step-04 on EVERY review pass, including loopbacks and blocked exits.
     Each entry records triage decision counts for intent_gap, bad_spec, patch, defer, and reject,
     with per-category severity breakdowns using low/medium/high, plus the findings addressed in
     that pass. Empty until the first review pass. -->

### 2026-08-02 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1 (high 0, medium 1, low 0)
- defer: 2 (low 2, medium 0, high 0)
- reject: 2
- addressed_findings:
  - `medium` `patch` — `computeMinimalLineChange`'s "no diff found" guard (`from === 0 && currentEnd === current.length && nextEnd === next.length`) incorrectly treated a whole-string mismatch with zero shared prefix/suffix (e.g. `current: 'a'`, `next: 'b'`, or any single-line document whose entire content changes) as "no scoped edit possible", silently falling back to the full-document replace in exactly the single-line case the feature targets. Replaced the guard with an explicit `current === next` equality check at the top of the function, and added regression tests for a checkbox un-toggle (reverse direction) and a whole single-line-document replacement, both now returning the correct scoped `{ from, to, insert }`. Re-verified with `node --test src/lib/source-editor-diff.test.ts` (4/4 pass), `npx vue-tsc --noEmit` (clean), and `npm run test:e2e -- e2e/story-7-1.spec.ts` (7/7 pass).

**Deferred (for orchestrator ledger append — not written to `deferred-work.md` directly per run instruction not to edit the ledger):**
- `low` `defer` — `isApplyingExternalUpdate` in `SourceEditor.vue`'s external `modelValue` watcher is set to `true` then `false` around `view.dispatch(...)` without a `try/finally`; if `computeMinimalLineChange` or `dispatch` ever throws, the flag stays stuck `true` and later `cursorChange` emissions would be silently suppressed. This pattern (manual set/reset without try/finally) already existed in the pre-change code for the same watcher and in `insertText`'s bracketing of the same flag, so it is a pre-existing gap incidentally re-surfaced by this review, not a regression introduced by this diff. `src/components/SourceEditor.vue`.
- `low` `defer` — Neither the new unit tests nor the existing e2e suite exercise the watcher/dispatch path directly (i.e. mount `SourceEditor`, trigger an external `modelValue` change, and assert the actual CodeMirror transaction/undo-depth), so there is no automated regression coverage proving checkbox toggles produce a single scoped undo step or preserve scroll position end-to-end — only the pure `computeMinimalLineChange` helper is unit-tested. The spec's own I/O matrix and Tasks only required covering "single checkbox toggle -> scoped change" and "multi-line -> fallback" at the level the new tests do cover; deeper end-to-end undo/scroll verification is a valuable but separate test-infrastructure investment (would need CodeMirror-aware component test tooling not yet present in this repo) beyond this story's scope. `src/components/SourceEditor.vue`, `src/lib/source-editor-diff.test.ts`.

**Rejected (noise, dropped):**
- Extracting `computeMinimalLineChange` into `src/lib/source-editor-diff.ts` as an exported function broadens the module's public surface beyond `SourceEditor.vue` even though no other code currently imports it — this is a reasonable, testability-driven extraction consistent with the spec's intent (a pure, independently testable helper) and not a functional defect.
- The helper bails out (`insert.includes('\n')`) whenever the replacement text itself contains a newline, which is stricter than the spec's literal "same current-document line" rule — but the checkbox-toggle scenario this story targets never inserts a newline (`[ ]` ↔ `[x]`), so this conservative extra guard has no observable effect on the feature's behavior and is not worth loosening speculatively.
- Native `node --test` execution of `.test.ts` files depends on Node's TypeScript type-stripping support and isn't wired into any CI workflow in this repo — true, but this is the same pre-existing convention already used by `src/lib/markdown.test.ts` and `src/lib/preview.test.ts`, unrelated to this diff.
- Edge-case coverage for non-`\n` line separators (`\r`, U+2028/U+2029) in `computeMinimalLineChange` was flagged as missing — but this project's CodeMirror `EditorState` uses the default line-separator handling (`\n` only, no `EditorState.lineSeparator` facet configured), so such separators are never treated as line breaks by the real `lineAt` passed into this function; the theoretical gap has no reachable real-world impact here.

## Design Notes

单行局部差异判定采用简单的双指针算法：从两个字符串的开头同步向后扫描直到出现不同字符，记为 `firstDiff`；再从两个字符串的结尾同步向前扫描直到出现不同字符，记为 `lastDiff`（分别对应 `current`/`next` 中各自的尾部索引）。若 `current` 中 `firstDiff` 与 `lastDiff` 两个位置（用 `view.state.doc.lineAt` 取行号）属于同一行，则认为是单行局部编辑，`from = firstDiff`，`to = lastDiff(current 侧) + 1`，`insert = next.slice(firstDiff, lastDiff(next 侧) + 1)`；否则返回 `null` 交由调用方回退全量替换。此算法无需引入 diff 库，且天然覆盖"仅一个字符变化"（如 checkbox 的 ` ` ↔ `x`）这一最常见场景。

## Verification

**Commands:**
- `npx vue-tsc --noEmit` -- expected: 无新增类型错误
- `npm run test:e2e -- <本次新增测试文件>` 或 `node --test <本次新增单测文件>` -- expected: 新增用例全部通过

**Manual checks (if no CLI):**
- 手动在预览区点击一个任务 checkbox，通过编辑器暴露的 `__codemirrorView`（或撤销命令 `__codemirrorCommands.undo`）确认一次撤销即可还原该次切换，且未产生额外的全量替换撤销条目。

## Auto Run Result

**Summary:** Fixed DW-46 by giving `SourceEditor.vue`'s external `modelValue` watcher a minimal single-line change path: a new pure helper `computeMinimalLineChange` (in `src/lib/source-editor-diff.ts`) computes the smallest common diff region between the editor's current doc and the incoming value via a double-pointer scan, and returns a scoped `{ from, to, insert }` only when that region falls within one line (checked via CodeMirror's `view.state.doc.lineAt`). The watcher now dispatches that scoped change when available, falling back to the pre-existing full `from: 0, to: doc.length` replace for multi-line diffs, keeping undo history and scroll position intact for single-line edits like preview-pane checkbox toggles.

**Files changed:**
- `src/components/SourceEditor.vue` -- external `modelValue` watcher now calls `computeMinimalLineChange` and dispatches its scoped result when non-null, otherwise keeps the original full-replace dispatch; `isApplyingExternalUpdate` bracketing unchanged.
- `src/lib/source-editor-diff.ts` -- new pure helper `computeMinimalLineChange` implementing the double-pointer smallest-common-diff-region algorithm, scoped to single-line changes.
- `src/lib/source-editor-diff.test.ts` -- `node:test` unit coverage: single-line checkbox toggle (both directions), multi-line fallback, and whole single-line-document replacement.

**Review findings breakdown:** 1 patch applied (medium severity — a logic bug in the new helper's "no diff" guard incorrectly fell back to full replace for whole single-line-document replacements, fixed by replacing it with an explicit `current === next` equality check, plus two new regression tests), 2 deferred (both low severity — a pre-existing missing-`try/finally` pattern around `isApplyingExternalUpdate` predating this change, and a test-coverage gap around asserting the actual watcher/dispatch behavior end-to-end rather than just the pure helper), 2 rejected (public-API-surface style observation, and a stricter-than-required newline guard with no observable effect on the checkbox-toggle use case; plus a pre-existing `node --test`-on-`.ts` CI-wiring observation and a non-reachable line-separator edge case, both unrelated to this diff).

**Follow-up review recommendation:** false — only one medium-severity, narrowly-scoped logic bug was patched (an edge case unreachable by the actual checkbox-toggle flow, now covered by regression tests), and the two deferrals are low-severity, pre-existing/out-of-scope observations; no broad or high-risk changes were made in response to review.

**Verification performed:**
- `npx vue-tsc --noEmit` -- no type errors (both before and after the patch fix).
- `node --test src/lib/source-editor-diff.test.ts` -- 4/4 passed after the patch fix (2 originally + 2 added during review).
- `npx playwright test e2e/story-7-1.spec.ts` -- 7/7 passed (both before and after the patch fix), confirming no regression to existing checkbox/slash-menu behavior.

**Residual risks:** The two deferred low-severity items remain open: (1) `isApplyingExternalUpdate` in `SourceEditor.vue` is still set/reset without `try/finally` (pre-existing pattern, not introduced here), and (2) there is no end-to-end test mounting `SourceEditor` and asserting the real CodeMirror transaction/undo-depth for a checkbox toggle — only the pure diff helper is unit-tested, though the multi-line-fallback and single-line-scoped paths are both covered at that level and the existing e2e suite confirms no functional regression.
