---
title: 'Confluence dirty-guard synchronicity regression test'
type: 'chore'
created: '2026-08-04'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
baseline_revision: 'f6c4970a0a1aa8803d796b858ad1dd942643e7e6'
final_revision: 'aa0313a'
---

<intent-contract>

## Intent

**Problem:** `SettingsModal.vue`'s `confluenceFormDirty` guard relies on toggling `suppressConfluenceDirtyTracking` around synchronous field writes to a `flush: 'sync'` deep watcher; if a future refactor ever splits that toggling across an `await` (e.g. inside `applyConfluenceConfig`), the guard would silently stop working and nothing today would catch it.

**Approach:** Extract the "toggle suppress flag around a mutation" pattern into a small, independently testable helper in `src/lib/`, route `SettingsModal.vue`'s existing suppress/mutate/un-suppress call sites through it unchanged in behavior, and add `node:test` unit tests (using Vue's `reactive`/`ref`/`watch` directly, no component mounting needed) that exercise the helper with both a synchronous mutation and an async/Promise-returning mutation, asserting the guard's synchronicity requirement is enforced at runtime and by tests rather than by comment alone.

## Boundaries & Constraints

**Always:**
- Preserve the exact current runtime behavior of `resetConfluenceMessages` and `applyConfluenceConfig`: same suppress-on/mutate/suppress-off timing, same final values, same `confluenceFormDirty.value = false` reset after the call.
- The new helper must be a plain, framework-agnostic TypeScript function importable by `node:test` without SFC compilation (mirrors the existing `src/lib/source-editor-diff.ts` extraction precedent).
- If the helper's `mutate` callback is (or turns out to be) asynchronous — i.e. it returns a thenable — the helper must close the suppression window immediately (reset the flag) and then throw synchronously, so a future accidental `await`-split inside a call site fails loudly instead of silently defeating the guard.
- Add regression tests in a new `*.test.ts` file (`node:test`, `node:assert/strict`, matching existing repo test style) that cover: (1) a fully synchronous mutation leaves the dirty flag false and the suppress flag reset to false, (2) a real user edit made outside the helper's suppression window still marks the form dirty (guard doesn't over-suppress), and (3) passing a Promise-returning/async mutation throws instead of leaving the suppression window open, with the suppress flag still reset to false afterward.

**Block If:** N/A — no undecidable design choice exists for this scoped extraction.

**Never:**
- Do not add `vitest`, `@vue/test-utils`, or any new test-runner dependency; use the existing `node:test` convention already used by `src/lib/source-editor-diff.test.ts`.
- Do not change any other Confluence settings behavior (validation, save/test-connection flows, token handling) — scope is limited to the dirty-guard mechanism.
- Do not mount `SettingsModal.vue` as a component in tests; no component-test tooling exists in this repo yet, and introducing it is out of scope for this deferred-work item.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Synchronous suppressed mutation | `mutate` writes reactive fields synchronously, no return value | Dirty flag stays `false`; suppress flag is `false` after the call | No error expected |
| User edit outside suppression | A reactive field is written directly (not via the helper) | Dirty flag becomes `true` | No error expected |
| Async/Promise-returning mutation | `mutate` returns a thenable (simulating a future `await`-split refactor) | Suppress flag is reset to `false` immediately; helper throws a `TypeError` | Caller must handle/see the thrown error — this is the intended loud failure replacing the previous silent one |

</intent-contract>

## Code Map

- `src/components/SettingsModal.vue` -- owns `confluenceFormDirty`, `suppressConfluenceDirtyTracking`, the `flush: 'sync'` deep watcher (lines ~47-72), `resetConfluenceMessages` (lines ~154-175), and `applyConfluenceConfig` (lines ~177-193) whose suppress/mutate/un-suppress blocks must be routed through the new helper.
- `src/lib/confluence-dirty-guard.ts` -- NEW pure helper module exporting `withDirtyTrackingSuppressed(suppressFlag, mutate)`, following the extraction precedent of `src/lib/source-editor-diff.ts`.
- `src/lib/confluence-dirty-guard.test.ts` -- NEW `node:test` regression tests for the helper, importing `reactive`/`ref`/`watch` from `vue` directly (no SFC compilation needed, verified working standalone in this repo).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/confluence-dirty-guard.ts` -- create and export `withDirtyTrackingSuppressed(suppressFlag: Ref<boolean>, mutate: () => void): void` that sets `suppressFlag.value = true`, calls `mutate()`, resets `suppressFlag.value = false` in a `finally`, and — if `mutate()`'s return value is thenable — throws a descriptive `TypeError` after the flag has been reset -- provides the enforceable, testable core of the dirty-guard synchronicity invariant
- [x] `src/components/SettingsModal.vue` -- import `withDirtyTrackingSuppressed` and use it to wrap the five `confluenceForm.*` assignments in both `resetConfluenceMessages` and `applyConfluenceConfig`, removing the manual `suppressConfluenceDirtyTracking.value = true/false` bracketing (the helper now owns that toggling) while keeping the trailing `confluenceFormDirty.value = false` and (for `applyConfluenceConfig`) the `loadedConfluenceConfig` update exactly as before -- centralizes the suppress-toggle pattern so it can only be bypassed by explicitly not using the helper, and keeps both call sites behaviorally identical
- [x] `src/lib/confluence-dirty-guard.test.ts` -- add `node:test` cases covering all three I/O matrix scenarios (sync mutation keeps dirty false, unsuppressed edit marks dirty true, async/thenable mutation throws `TypeError` and still resets the suppress flag) -- turns the guard's synchronicity requirement into an enforced, automatically-checked regression instead of a comment-only convention

**Acceptance Criteria:**
- Given `withDirtyTrackingSuppressed` is called with a synchronous `mutate` that writes to a `flush: 'sync'`-watched reactive object, when the call returns, then the associated dirty flag remains `false` and the suppress flag is `false`.
- Given a reactive field guarded by the same watcher is written directly outside of `withDirtyTrackingSuppressed`, when the write happens, then the dirty flag becomes `true` (confirming the helper does not over-suppress unrelated edits).
- Given `withDirtyTrackingSuppressed` is called with a `mutate` that returns a thenable (simulating a future refactor that splits the suppress/mutate/un-suppress block across an `await`), when the call executes, then the suppress flag is reset to `false` and the helper throws a `TypeError`, instead of silently leaving the guard defeated.
- Given `SettingsModal.vue` after the refactor, when `resetConfluenceMessages` or `applyConfluenceConfig` runs with its normal synchronous field assignments, then `confluenceFormDirty` behaves identically to before the refactor (stays `false` immediately after the call).

## Spec Change Log

## Review Triage Log

### 2026-08-04 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4 (medium 2, low 2)
- defer: 1 (low)
- reject: 6 (low)
- addressed_findings:
  - `medium` `patch` — `withDirtyTrackingSuppressed`'s `finally` block hard-reset `suppressFlag.value = false`, so a nested/re-entrant call would prematurely re-enable dirty tracking for an outer suppressed scope. Fixed by capturing and restoring the previous suppression value instead of hardcoding `false`; added a regression test for nested-call suppression.
  - `medium` `patch` — The thenable check (`typeof result === 'object'`) missed callable thenables (a function with a `.then` property), letting that edge case bypass the synchronicity guard. Fixed by also accepting `typeof result === 'function'` in the check.
  - `low` `patch` — No regression test proved the `finally` block still resets `suppressFlag` to `false` when `mutate()` throws an ordinary synchronous error (not just the thenable-return path). Added a test covering that case.
  - `low` `patch` — No regression test covered the nested-suppression scenario now fixed above. Added alongside the nested-suppression fix.

## Design Notes

The helper intentionally does not try to detect "was this called from an `async` context" statically (TypeScript's `void`-returning parameter types accept `Promise<void>`-returning arguments without a compile error, so a compile-time-only guard would not catch it). Instead it checks the *runtime* return value of `mutate()` for a `.then` method, which is exactly what an `async function` or a function returning a `Promise` produces. This turns "someone made the mutate callback async" into an immediate, loud `TypeError` — closing the suppression window first (via `finally`) so the failure is safe (no permanently-stuck suppression) and observable, rather than silently letting later, unrelated edits go untracked.

## Verification

**Commands:**
- `node --test src/lib/confluence-dirty-guard.test.ts` -- expected: all new regression tests pass.
- `npx vue-tsc --noEmit` -- expected: no new type errors introduced by the `SettingsModal.vue` refactor.

## Auto Run Result

**Summary:** Added a `node:test` regression suite that turns the `confluenceFormDirty` guard's `flush: 'sync'` synchronicity requirement into an enforced, tested runtime invariant instead of only a code comment. Extracted the guard's suppress/mutate/un-suppress pattern from `SettingsModal.vue` into a small, framework-agnostic helper (`withDirtyTrackingSuppressed`) that throws if the mutation callback ever turns out to be asynchronous (e.g. from a future refactor that splits `applyConfluenceConfig` across an `await`), and wired both existing call sites (`resetConfluenceMessages`, `applyConfluenceConfig`) through it with identical runtime behavior.

**Files changed:**
- `src/lib/confluence-dirty-guard.ts` (new) -- `withDirtyTrackingSuppressed(suppressFlag, mutate)`: toggles suppression around a synchronous mutation, restores the prior suppression state (nested-call safe), and throws a `TypeError` if `mutate()`'s return value is thenable.
- `src/lib/confluence-dirty-guard.test.ts` (new) -- 5 `node:test` cases: sync-suppressed mutation stays non-dirty, unsuppressed edit still marks dirty, thenable-returning mutation throws and resets suppression, nested suppression is preserved, and a synchronous throw inside `mutate` still resets suppression via `finally`.
- `src/components/SettingsModal.vue` -- `resetConfluenceMessages` and `applyConfluenceConfig` now route their five `confluenceForm.*` assignments through `withDirtyTrackingSuppressed` instead of manually toggling `suppressConfluenceDirtyTracking`; behavior is unchanged.

**Review findings breakdown:** 4 patches applied (2 medium: a nested-suppression state bug in the new helper that would have re-enabled dirty tracking early for an outer suppressed scope, and an incomplete thenable check that missed callable thenables; 2 low: missing regression tests for the synchronous-throw-inside-`mutate` path and the nested-suppression fix — both now covered). 1 deferred (low: the guard only detects async escape via a returned thenable, so a "fire-and-forget" async call inside an otherwise-synchronous `mutate` — e.g. `void someAsync()` with no return — would still bypass detection; this is a broader limitation of the runtime-thenable-check approach, distinct from the ledger's specific "splitting across an await" scenario which the guard does catch). 6 rejected (pre-existing lack of unit-test CI wiring in this repo, unrelated to this diff and previously accepted as such in earlier reviews; the intentional design choice to throw only after suppression is safely reset rather than mid-mutation; a very-low-likelihood false-positive for a legitimate sync return value that happens to expose a `.then` method, given `mutate`'s `() => void` signature; an out-of-scope request for `SettingsModal`-level integration/component-mount tests, explicitly excluded by this spec's `Never` boundary since no component-test tooling exists in this repo; and a hostile-getter `.then` access edge case requiring a deliberately adversarial object no real call site could produce).

**Follow-up review recommendation:** false — the two medium-severity patches were narrowly scoped to one small new helper file, fully covered by new regression tests, with no behavior/API/security impact beyond that module; the two low-severity patches were test-coverage additions only.

**Verification performed:**
- `node --test src/lib/confluence-dirty-guard.test.ts` -- 5/5 passed after the patch fixes (3 originally + 2 added during review).
- `npx vue-tsc --noEmit` -- clean, no type errors, both before and after the patch fixes.

**Residual risks:** The guard only catches async escape when `mutate` returns a thenable (covers the ledger's literal "split across an await" scenario); a fire-and-forget async call inside a still-synchronous-returning `mutate` would not be detected (deferred, see above, per instruction not to edit `deferred-work.md` directly — this run does not touch that ledger). No integration/component-level test exercises the real `SettingsModal.vue` call sites end-to-end; coverage is at the extracted-helper unit level, consistent with this repo's existing test-tooling constraints.

