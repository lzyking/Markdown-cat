---
title: '启动恢复容错与会话隔离'
type: 'bugfix'
created: '2026-08-04'
status: 'done'
baseline_revision: 'ef5b85e92474bbfc3802dec6f1a7912ab46f7081'
final_revision: 'f545cfc'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** `src/App.vue` 的 `onMounted` 启动恢复逻辑存在三个缺陷（DW-76/77/79）：恢复上次打开文件失败时不清空 `lastOpenedFile` 配置，导致每次启动都重试同一个损坏路径；`read_external_document` 抛出异常时会中断整个 `onMounted`，跳过空白文档兜底、`currentSavePath` 兜底与 `resetWidths()`/resize 监听器初始化；启动恢复的 `read_external_document` await 挂起期间，若用户通过“打开文件”对话框打开了另一个文档，恢复结果落地时会用过期数据覆盖用户刚打开的新文档。

**Approach:** 抽取一个纯函数模块 `src/lib/session-restore.ts`，把“恢复结果 → 应用/清空配置”的判定逻辑（DW-76 对应分支）与“请求令牌是否仍是最新”的判定逻辑（DW-79 对应分支）做成可单测的纯函数；在 `App.vue` 中收紧 `onMounted` 里包裹 `read_external_document` 调用的 try/catch 范围（DW-77），并引入一个自增的 `openRequestToken` 守卫，在 `onMounted` 的恢复分支与 `loadFileFromPath`（供 `handleOpenFile` 使用）中共用，只有仍是最新请求时才写入 `currentFilePath`/`filename`/`content`。

## Boundaries & Constraints

**Always:** 恢复失败（`loadRes.ok === false`）时必须调用 `update_last_opened_file` 清空 `lastOpenedFile`（传 `null`）。`read_external_document` 的恢复调用异常必须被捕获且不能阻止后续的空白文档兜底、`currentSavePath` 兜底、`resetWidths()`、resize 监听器注册执行。当启动恢复与用户手动打开文件发生竞争时，只保留时间上更晚发起的那次操作的结果；被判定为过期的一方必须完全跳过对 `currentFilePath`/`filename`/`content`/`saveStatus` 的写入。

**Block If:** 无需人工输入的决策点；如发现该竞争场景已有其他专用锁机制与本方案冲突，暂停并说明冲突点。

**Never:** 不引入锁库或全局互斥锁模块；不修改 Rust 侧 `read_external_document`/`update_last_opened_file` 命令签名或行为；不改变现有 `__TAURI_MOCK__` 存在时跳过启动恢复分支的既有约定。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 恢复失败-显式错误 | `configRes.data.lastOpenedFile` 指向已删除文件，`read_external_document` 返回 `{ ok: false }` | 调用 `update_last_opened_file({ filePath: null })` 清空配置；继续走空白文档兜底 | 清空调用本身失败时仅 `console.warn`，不再次中断流程 |
| 恢复抛出异常 | `read_external_document` 的 invoke 本身 reject（IPC 层异常） | 捕获异常并 `console.error`；不清空 `lastOpenedFile`（视为瞬时故障，下次仍重试）；继续执行空白文档兜底、`currentSavePath` 兜底、`resetWidths()`、resize 监听器注册 | 不重新抛出 |
| 恢复成功 | `read_external_document` 返回 `{ ok: true, data }` 且未被更晚的手动打开请求超越 | 应用 `filename`/`content`/`currentFilePath`，`saveStatus = 'success'`，`lastFileLoaded = true` | 无 |
| 恢复被竞争覆盖 | 启动恢复 await 挂起期间，用户通过 `handleOpenFile` 成功打开了另一文档 | 启动恢复结果到达时其请求令牌已非最新，跳过写入；`lastFileLoaded` 视为 `true`（用户已有文档打开，不再触发空白文档兜底） | 无需报错，静默丢弃过期结果 |
| 手动打开被更新的手动打开覆盖 | 用户连续快速打开两个不同文件，先发起的请求后完成 | 先发起请求的结果因请求令牌过期被丢弃，仅保留后发起请求的结果 | 无需报错，静默丢弃过期结果 |

</intent-contract>

## Code Map

- `src/App.vue` (`onMounted`, `loadFileFromPath`, `handleOpenFile`) -- 启动恢复与手动打开文件的核心逻辑，三个缺陷均在此文件
- `src/lib/session-restore.ts` (新建) -- 抽取的纯函数：恢复结果判定（DW-76）与请求令牌新鲜度判定（DW-79），供 `App.vue` 调用并可单测
- `src/lib/session-restore.test.ts` (新建) -- 覆盖上表 I/O 矩阵的 node:test 单测
- `src/lib/types.ts` -- `CmdResult`、`DocumentState` 类型定义，供新模块引用
- `src-tauri/src/commands/config.rs` (`update_last_opened_file`) -- 已支持 `Option<String>`，传 `null` 即可清空，无需改动

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/session-restore.ts` -- 新增 `resolveStartupRestoreOutcome(loadRes: CmdResult<DocumentState> | null): { applied: boolean; shouldClearStaleConfig: boolean; filename?: string; content?: string; message?: string }` 与 `isLatestOpenRequest(requestToken: number, latestToken: number): boolean` 两个纯函数 -- 把判定逻辑从 Vue 组件中抽出以便单测（对应 DW-76、DW-79 的核心决策）
- [x] `src/lib/session-restore.test.ts` -- 用 node:test 覆盖恢复成功/显式失败(`ok:false`)/异常(`null` 输入)三种 `resolveStartupRestoreOutcome` 场景，以及 `isLatestOpenRequest` 令牌相同/不同两种场景 -- 固化 I/O 矩阵中的判定行为
- [x] `src/App.vue` -- 新增 `const openRequestToken = ref(0)` 于 `activeDocumentId` 声明附近 -- 作为跨 `onMounted` 恢复与 `loadFileFromPath` 共享的“最新请求”守卫
- [x] `src/App.vue` (`onMounted`) -- 将 `read_external_document` 恢复调用包在独立 try/catch 中（而非依赖外层大 try），捕获后调用 `resolveStartupRestoreOutcome` 决定是否应用结果/清空配置；应用前用 `isLatestOpenRequest` 校验令牌未过期；异常分支不清空配置，仅 `console.error` 并继续执行外层剩余逻辑 -- 修复 DW-76（清空过期配置）与 DW-77（异常不再中断兜底逻辑）
- [x] `src/App.vue` (`loadFileFromPath`) -- 在发起 `read_external_document` 前捕获 `const requestToken = ++openRequestToken.value`，resolve 后用 `isLatestOpenRequest` 校验，过期则静默 return，不写入 `currentFilePath`/`filename`/`content`/`saveStatus` -- 修复 DW-79（防止过期数据覆盖用户新打开的文档）

**Acceptance Criteria:**
- Given 配置中 `lastOpenedFile` 指向的文件已被删除, when 应用启动, then 调用一次 `update_last_opened_file` 且参数 `filePath` 为 `null`，且随后走空白文档兜底而不留在错误态
- Given `read_external_document` 在恢复阶段抛出异常, when 应用启动, then `resetWidths()` 与 `window.addEventListener('resize', onWindowResize)` 仍被执行（不被异常跳过），且不清空 `lastOpenedFile`
- Given 启动恢复的 `read_external_document` 仍在等待中, when 用户通过“打开文件”对话框成功打开了另一文档, then 最终 `filename`/`content`/`currentFilePath` 保持为用户手动打开的文档，不被恢复流程的过期数据覆盖

## Spec Change Log

## Review Triage Log

### 2026-08-04 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 1, medium 0, low 1)
- defer: 3: (high 0, medium 0, low 3)
- reject: 5: (high 0, medium 0, low 5)
- addressed_findings:
  - `[high]` `[patch]` Blank-document fallback was not guarded against being superseded by a newer manual open when the stale startup restore itself failed/threw — `lastFileLoaded` stayed `false` in that case, so `get_blank_document()` could still run and clobber a document the user had already opened via `loadFileFromPath`/`handleOpenFile`. Fixed by adding `shouldSkipBlankDocumentFallback(outcome, isRestoreStillLatest)` in `src/lib/session-restore.ts` and using it in `src/App.vue`'s `onMounted` to set `lastFileLoaded = true` whenever the restore applied its own document OR a newer request has since superseded it. Added regression unit tests in `src/lib/session-restore.test.ts`.
  - `[low]` `[patch]` `StartupRestoreOutcome` was a loose interface with optional fields, forcing non-null assertions (`outcome.filename!`, `outcome.content!`, `outcome.message!`) in `src/App.vue` with no compiler protection against a future edit breaking the applied/fields contract. Converted to a discriminated union (`{ applied: true; ... }` | `{ applied: false; ... }`) in `src/lib/session-restore.ts` so TypeScript narrows the fields correctly without assertions.

### 2026-08-04 — Follow-up review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1: (high 1, medium 0, low 0)
- defer: 3: (high 0, medium 0, low 3)
- reject: 7: (high 0, medium 0, low 7)
- addressed_findings:
  - `[high]` `[patch]` `shouldSkipBlankDocumentFallback` treated any superseding-but-stale restore as "a document is now owned by someone else", including when the superseding manual open request itself failed to load a document. In that case `lastFileLoaded` was still set `true`, so `get_blank_document()` was skipped, leaving the app with the unresolved default placeholder filename (`New_*.md`, a literal, non-unique, potentially invalid filename) and empty content instead of a properly generated blank document. Fixed by adding a `hasNewerDocumentLoaded` parameter to `shouldSkipBlankDocumentFallback` (`src/lib/session-restore.ts`), passed as `activeDocumentId.value > 0` from `src/App.vue`'s `onMounted`, so the fallback only skips when the winning request (this restore or a newer one) actually loaded a document. Updated/added regression unit tests in `src/lib/session-restore.test.ts`.
- Findings rejected as re-litigating deliberate, spec-mandated design choices already covered by the intent contract or a prior review pass: clearing `lastOpenedFile` on any explicit `ok:false` (not just "file deleted"); treating thrown restore errors as retry-later (never clearing config); discarding a request purely by start-time even if the later request itself fails; the existing `__TAURI_MOCK__` skip convention; and a stylistic preference for a single centralized state machine over the module split mandated by the intent contract's approach. Also rejected as out-of-scope test-coverage requests already acknowledged/owned by Story 12.3 (App.vue-level race/E2E integration coverage) per the prior review pass.
- Deferred (pre-existing, not caused by this story, surfaced incidentally): `onFileDrop`'s no-native-path fallback branch (`file.text()`) does not participate in the `openRequestToken` guard protocol; the persisted `lastOpenedFile` config write in `loadFileFromPath` has no freshness re-check immediately before the persist call, so overlapping opens can persist out of order; and the stale-config clear call in `onMounted` has the same persisted-config ordering gap. All appended to `deferred-work.md`.

## Design Notes

守卫变量沿用仓库已有的 `resolveThemeSelectionOutcome`（`src/lib/theme-select.ts`）风格：把“网络/IPC 结果 → UI 状态”的判定抽成纯函数，Vue 组件只负责编排调用顺序与写入 ref。`openRequestToken` 是一个简单的自增计数器：每次发起“加载文档”类异步操作（启动恢复、手动打开）时先 `++openRequestToken.value` 并本地捕获该值，await 结束后仅当捕获值仍等于 `openRequestToken.value` 时才写入共享状态,否则视为过期请求直接丢弃，不产生副作用。

## Verification

**Commands:**
- `node --test src/lib/session-restore.test.ts` -- expected: 全部用例通过
- `node --test src/lib/theme-select.test.ts src/lib/markdown.test.ts` -- expected: 确认未破坏相邻纯函数模块的既有测试（回归探测）
- `npx vue-tsc --noEmit` -- expected: 无类型错误

**Manual checks (if no CLI):**
- 走读 `onMounted` 修改后的控制流，确认恢复分支的 try/catch 边界不再包裹 `resetWidths()`/resize 监听器注册等无关逻辑


## Auto Run Result

**Summary:** Follow-up review pass on the already-shipped startup-restore fault-tolerance fix (DW-76/77/79 + prior review's race-superseding-blank-fallback patch). Two independent reviewers (Blind Hunter, Edge Case Hunter) found one genuine high-severity gap in the previous pass's own fix, which is now patched, plus several pre-existing/out-of-scope observations that were deferred or rejected.

**Files changed (this pass):**
- `src/lib/session-restore.ts` -- `shouldSkipBlankDocumentFallback` gained a `hasNewerDocumentLoaded` parameter; now only skips the blank-document fallback when the winning request (this restore, or a newer superseding request) actually loaded a document, not merely because a newer request started.
- `src/App.vue` -- passes `activeDocumentId.value > 0` as `hasNewerDocumentLoaded` at the `onMounted` call site.
- `src/lib/session-restore.test.ts` -- updated/added regression tests covering: newer request superseded and loaded a document (skip fallback); newer request superseded but itself failed to load a document (must NOT skip fallback).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- appended two new deferred findings (see below).

**Review findings breakdown:**
- patch (1, applied, high): blank-document fallback could be wrongly skipped when a superseding manual "Open File" request itself failed to load a document, leaving the app with an unresolved placeholder filename (`New_*.md`) and empty content instead of a properly generated blank document.
- defer (3, low): (1) `onFileDrop`'s no-native-`File.path` fallback branch bypasses the `openRequestToken` guard protocol entirely; (2) the persisted `lastOpenedFile` config write in `loadFileFromPath` has no freshness re-check immediately before the persist call, so overlapping opens can persist out of order; (3) the stale-config clear call in `onMounted` has the same persisted-config ordering gap. All pre-existing/out of this story's protected-field scope, appended to `deferred-work.md`.
- reject (7): re-litigations of deliberate spec-mandated design (unconditional config-clear on `ok:false`; retry-later semantics for thrown restore errors; discard-by-start-time race resolution even if the later request fails; the `__TAURI_MOCK__` skip convention; preference for a single centralized state machine over the module split the intent contract mandates) and out-of-scope test-coverage requests already acknowledged/owned by Story 12.3 (App.vue-level race/E2E integration coverage).

**Verification performed:**
- `node --test src/lib/session-restore.test.ts` -- 9/9 passed
- `node --test src/lib/theme-select.test.ts` -- 3/3 passed (regression check)
- `npx vue-tsc --noEmit` -- no type errors

**Residual risks:**
- The three newly deferred findings (drag-drop race gap, two persisted-config ordering races) remain open in `deferred-work.md`.
- `followup_review_recommended: false` -- this pass's single patched finding was narrow, fully covered by new regression tests, and verified clean by `vue-tsc`; volume and blast radius do not warrant another independent review round.
