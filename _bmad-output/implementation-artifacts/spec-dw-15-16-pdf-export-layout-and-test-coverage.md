---
title: 'PDF Export: Post-Load Layout Stabilization Wait + Failure-Branch E2E Coverage'
type: 'bugfix'
created: '2026-08-03'
status: 'done'
baseline_revision: bff877263608faacece5d46e819b141fe41cc3fb
review_loop_iteration: 0
final_revision: 01e1f53fd2b6040bc9a9173e04da27136e058557
followup_review_recommended: false
context: []
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** `export_pdf_macos` calls `createPDFWithConfiguration_completionHandler` immediately after the WKWebView `Finished` page-load event, with no margin for any residual async reflow on complex documents (DW-15). Separately, `e2e/story-8-2.spec.ts` only exercises the `export_pdf` happy path, leaving the load-timeout, render-timeout, user-cancellation, and non-macOS unsupported-platform branches unverified by any automated test (DW-16).

**Approach:** Add a short fixed stabilization delay between the `Finished` load signal and the PDF-creation dispatch in `export_pdf_macos`. Extend `e2e/story-8-2.spec.ts` with new test cases that mock `export_pdf` (and `pdf_export_supported`) to drive each currently-untested frontend branch, asserting the exact user-facing status-bar message and side effects (no save dialog, no `export_pdf` call) for each.

## Boundaries & Constraints

**Always:**
- The stabilization wait must sit between confirming the `Finished` load signal and invoking `createPDFWithConfiguration_completionHandler` in `export_pdf_macos`.
- Follow the existing codebase pattern for blocking waits inside this async fn (`tauri::async_runtime::spawn_blocking` + `std::thread::sleep`, as already used by `recv_with_timeout`) rather than adding a new dependency (e.g. `tokio` as a direct crate) for this.
- New e2e tests must reuse the existing `e2e/utils/tauri-mock.ts` `__registerHandler`/`dialogInvocations`/`invocations` mock surface and existing per-story spec conventions (see `e2e/story-8-1.spec.ts`, current `e2e/story-8-2.spec.ts`), not introduce new mocking infrastructure.
- Each new test must assert on the exact `formatPdfExportError`-mapped Chinese status-bar text (from `src/App.vue`), not merely "an error is shown".
- Preserve all currently-passing behavior and tests; the delay must not make any existing test flaky or change other IPC command signatures.

**Block If:** N/A — the stabilization-wait duration and test approach are both fully determined by the ledger entries and existing code conventions; no undetermined human decision blocks this work.

**Never:**
- Do not attempt to drive the real native WKWebView/`createPDFWithConfiguration` path from Playwright — DW-16 explicitly scopes new coverage to the existing frontend/IPC-boundary mock, not a native integration test.
- Do not implement a JS-injected "wait for two animation frames" style re-check inside the WKWebView (out of scope / unverifiable without a native harness); a fixed short delay satisfies the ledger's "brief... stabilization wait" wording.
- Do not change `ERR_PDF_EXPORT_*` error code strings or `formatPdfExportError` mappings — only add tests that exercise the existing ones.
- Do not modify `deferred-work.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Load timeout | `export_pdf` mock returns `{ ok: false, error: 'ERR_PDF_EXPORT_LOAD_TIMEOUT: ...' }` | Status bar shows "导出 PDF 失败：内容加载超时，请重试" | Handled by existing `formatPdfExportError` |
| Render timeout | `export_pdf` mock returns `{ ok: false, error: 'ERR_PDF_EXPORT_RENDER_TIMEOUT: ...' }` | Status bar shows "导出 PDF 失败：PDF 渲染超时，请重试" | Handled by existing `formatPdfExportError` |
| User cancellation | Local image in doc; slow `read_image_asset` mock; user clicks "取消导出" during the progress overlay before native PDF call | Status bar shows "PDF 导出已取消"; `export_pdf` command never invoked | `HtmlExportCancelledError` caught in `handleExportPdf`'s catch block |
| Non-macOS unsupported platform | `pdf_export_supported` mock returns `false` | Save dialog never opens (`dialogInvocations` count unchanged); status bar shows "导出 PDF 失败：当前平台暂不支持 PDF 导出" fast, before any markdown render/HTML embedding | Fast-fail branch in `handleExportPdf`, no `export_pdf` invocation |

</intent-contract>

## Code Map

- `src-tauri/src/commands/pdf_export.rs` -- `export_pdf_macos`: add the stabilization wait right after the load-`Finished` signal is confirmed and before `createPDFWithConfiguration_completionHandler` is dispatched.
- `e2e/story-8-2.spec.ts` -- add four new `test(...)` cases covering load timeout, render timeout, user cancellation, and non-macOS fast-fail, following the existing describe block's mocking conventions.
- `src/App.vue` -- reference only (`formatPdfExportError`, `handleExportPdf`, `exportCancelable`); no changes expected here.
- `e2e/utils/tauri-mock.ts`, `e2e/fixtures.ts` -- reference only for mock API shape (`__registerHandler`, `dialogInvocations`, `pdf_export_supported` default `true`); no changes expected here.

## Tasks & Acceptance

**Execution:**
- [x] `src-tauri/src/commands/pdf_export.rs` -- after `recv_with_timeout(load_rx, ...)` resolves `Ok(Ok(()))`, insert a `tauri::async_runtime::spawn_blocking(|| std::thread::sleep(Duration::from_millis(150)))` (mapped to `ERR_PDF_EXPORT_RUNTIME_FAILED` on join failure, mirroring `recv_with_timeout`'s error mapping) before building the `pdf_tx`/`pdf_rx` channel and scheduling the PDF-creation closure -- reduces the theoretical risk of capturing an unstable layout for complex documents (DW-15).
- [x] `e2e/story-8-2.spec.ts` -- add a test asserting the load-timeout error message via a mocked `export_pdf` failure response -- covers DW-16's load-timeout branch.
- [x] `e2e/story-8-2.spec.ts` -- add a test asserting the render-timeout error message via a mocked `export_pdf` failure response -- covers DW-16's render-timeout branch.
- [x] `e2e/story-8-2.spec.ts` -- add a test that inserts a local image, delays the `read_image_asset` mock response, clicks "取消导出" during the progress overlay, and asserts the cancellation status message plus that `export_pdf` was never invoked -- covers DW-16's cancellation branch.
- [x] `e2e/story-8-2.spec.ts` -- add a test that mocks `pdf_export_supported` to return `false` and asserts no save dialog opens, `export_pdf` is never invoked, and the unsupported-platform status message appears -- covers DW-16's non-macOS fast-fail branch.

**Acceptance Criteria:**
- Given the hidden WKWebView's `Finished` load event has fired for the expected navigation, when `export_pdf_macos` proceeds to render the PDF, then a brief fixed delay elapses between the load signal and the `createPDFWithConfiguration_completionHandler` call, and the existing native smoke-test-verified happy path continues to succeed.
- Given each of the four new `e2e/story-8-2.spec.ts` test cases, when run via `npx playwright test story-8-2`, then all pass deterministically without flakiness, exercising only the existing `window.__TAURI_MOCK__` surface (no new native/WKWebView harness).

## Spec Change Log

## Review Triage Log

### 2026-08-03 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2 (low 2)
- defer: 0
- reject: 11 (medium 1, low 10)
- addressed_findings:
  - `[low]` `[patch]` The 150ms stabilization sleep in `export_pdf_macos` had no explanatory comment, leaving a magic number in a sensitive cross-thread rendering path. Added a comment explaining the WKWebView `Finished`-event rationale and referencing DW-15.
  - `[low]` `[patch]` The new cancellation e2e test's name ("取消导出 PDF 时不应调用 export_pdf") overclaimed scope — cancellation is only reachable during the HTML/asset-inlining phase since the cancel button is hidden once native PDF rendering begins. Renamed the test to "取消导出 PDF（HTML 内嵌阶段）时不应调用 export_pdf" and added a clarifying comment.
  - Rejected (11, no ledger entry needed): (1) the fixed 150ms delay adds latency to every export and doesn't *prove* readiness — this is the explicit, spec-mandated approach (intent-contract `Never` clause forbids the alternative JS re-check/wait_until approach as out of scope), and DW-15 itself frames this as a "reduce risk," not "eliminate risk," mitigation; (2) the delay is a "brittle heuristic" that may not cover arbitrarily slow documents — same rationale, already an accepted low-severity theoretical risk per DW-15's own text, not newly introduced; (3) `spawn_blocking(|| sleep(...))` "burns a blocking-runtime worker" — trivial (150ms, once per export) and is the exact idiom the spec's `Boundaries & Constraints` mandated to avoid adding a `tokio` dependency, consistent with the file's existing `recv_with_timeout` pattern; (4) no test exercises the new Rust sleep path directly — infeasible without a native WKWebView harness, explicitly out of scope per the intent-contract's `Never` clause and DW-16's own origin note; (5) the timeout tests only validate frontend string mapping, not real backend timeout behavior — this is the explicit, ledger-scoped boundary (DW-16 origin note: "extend coverage via the existing Tauri mock", not a native integration test); (6) the unsupported-platform test only checks the mocked frontend probe, not real non-macOS backend wiring — same explicit scope boundary; (7) no test asserts the progress overlay is reset/hidden after the new failure paths — a reasonable idea for *additional* coverage but out of scope of the four DW-16 branches this pass was scoped to add; (8) `[medium]` new tests reuse the existing test's hardcoded absolute path convention (e.g. `/Users/max/Project/Markdown Cat/test-artifacts/...`) — pre-existing convention already present in the untouched original test in this file (not introduced by this diff's design) and inert here since `export_pdf` is fully mocked in every new test (the literal path string never touches a real filesystem); (9) the unsupported-platform test doesn't additionally assert that markdown-rendering/HTML-embedding work was skipped — the existing assertion (no save-dialog call) already proves the fast-fail happens before any further work, since `saveDialog()` is the very next step in `handleExportPdf` after the platform check; (10) the cancellation test was flagged as "timing-fragile" for asserting `export_pdf` call count immediately after advancing fake timers — false: the preceding `await expect(...).toContainText(...)` already blocks (via Playwright's built-in polling) until the async catch branch has run and set the cancellation message, by which point the code path has already provably skipped the `export_pdf` invoke (cancellation is thrown before that call site is reached), so no race exists; (11) the edge-case reviewer's suggestion to replace the fixed delay with a `wait_until(|| webview_assets_complete(...))`-style readiness poll — this is the exact native re-entrant readiness-check approach the intent-contract's `Never` clause explicitly rules out as out of scope for this pass.

## Design Notes

The 150ms delay is a fixed, intentionally simple stabilization margin (not a polling/re-check loop) consistent with the ledger's "brief... stabilization wait" framing and DW-15's low severity/theoretical-risk classification -- it does not attempt to detect or wait for a specific layout-settled signal, which would require a native re-entrant JS bridge out of scope for this pass. It reuses the same `tauri::async_runtime::spawn_blocking` + `std::thread::sleep` + timeout-style error-mapping idiom already established by `recv_with_timeout` in the same file, keeping the change idiomatically consistent rather than introducing a new async-sleep dependency.

## Verification

**Commands:**
- `cd src-tauri && cargo check` -- expected: clean compile, no warnings introduced.
- `npx playwright test story-8-2` -- expected: all tests in `e2e/story-8-2.spec.ts` (existing + 4 new) pass.
- `npx vue-tsc --noEmit` -- expected: clean (no frontend changes expected, but run as a regression guard since spec/test files are TypeScript).

**Manual checks (if no CLI):**
- Not applicable to macOS-only native rendering path verification for this pass (no code changes to the native call itself, only inserting a delay before it) -- covered by `cargo check` for compilation correctness; DW-15's own text already notes the risk is theoretical/unreproduced, and this pass's fix is a conservative mitigation rather than a newly-discovered regression to re-smoke-test.

**Results (2026-08-03, post-review-patch):**
- ✅ `cd src-tauri && cargo check`
- ✅ `npx playwright test story-8-2` (`5 passed`)
- ✅ `npx vue-tsc --noEmit`

## Auto Run Result

Status: done

**Summary:** Resolved deferred-work bundle `pdf-export-layout-and-test-coverage` (DW-15, DW-16) from the `20260803-195209-7547` bmad-loop run. Added a brief post-load stabilization wait before native PDF rendering in `export_pdf_macos`, and extended `e2e/story-8-2.spec.ts` with four new tests covering the load-timeout, render-timeout, user-cancellation, and non-macOS unsupported-platform branches that were previously only covered by the happy path.

**Files changed:**
- `src-tauri/src/commands/pdf_export.rs` — inserted a 150ms `spawn_blocking(sleep)` stabilization wait (with `ERR_PDF_EXPORT_RUNTIME_FAILED` error mapping and existing cleanup pattern) between the WKWebView `Finished` load signal and dispatching `createPDFWithConfiguration_completionHandler`, plus an explanatory comment referencing DW-15.
- `e2e/story-8-2.spec.ts` — added 4 new tests: load-timeout status message, render-timeout status message, cancellation during the HTML/asset-inlining phase (no `export_pdf` call), and non-macOS fast-fail (no save dialog, no `export_pdf` call).

**Review findings breakdown:** 2 reviewer subagents (Blind Hunter via `bmad-review-adversarial-general`, Edge Case Hunter via `bmad-review-edge-case-hunter`) run in parallel against the diff. 13 total findings after dedup: 2 patched (low severity: missing explanatory comment on the delay; a test name that overclaimed cancellation-phase coverage), 11 rejected (1 medium: pre-existing hardcoded-absolute-test-path convention, inert since `export_pdf` is fully mocked; 10 low: mostly restatements of scope boundaries the spec's `<intent-contract>` explicitly ruled out — e.g. requests for a native readiness-check instead of a fixed delay, or for real-backend-exercising tests instead of frontend/IPC-mock tests — both of which DW-15/DW-16 and the spec's `Never` clause explicitly scope out). 0 intent_gap, 0 bad_spec, 0 defer (no new pre-existing issues were surfaced that warrant a deferred-work entry; ledger itself untouched per instruction).

**Verification performed:**
- `cd src-tauri && cargo check` — clean, both before and after review patches.
- `npx playwright test story-8-2` — 5/5 passed (1 existing + 4 new), both before and after review patches.
- `npx vue-tsc --noEmit` — clean.
- `npx playwright test` (full suite) — 116/116 passed, confirming no regression from the added stabilization delay or new tests.

**Follow-up review recommendation:** false — the review pass made only two small, localized, low-severity cosmetic patches (a code comment and a test name/comment clarification); no behavioral, API, security, or data-impacting changes resulted from review.

**Residual risks:** DW-15's underlying theoretical risk (unstable layout on extremely complex documents, e.g. very large inlined images or deeply nested async-reflow-triggering content) is mitigated but not eliminated by a fixed 150ms delay — a genuine native readiness check would require WKWebView-side instrumentation out of scope for this pass, as already noted in the original story's ledger entry. DW-16's new tests validate only the frontend/IPC-mock boundary, consistent with the rest of this repo's Tauri command test conventions; the real native WKWebView failure/timeout/cancel paths remain unverified by automation (this limitation is inherent to the Playwright/browser test environment, not newly introduced).
