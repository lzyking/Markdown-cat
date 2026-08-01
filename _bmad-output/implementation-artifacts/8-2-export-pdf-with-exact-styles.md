---
id: 8-2-export-pdf-with-exact-styles
title: Export High-Quality PDF Preserving Exact Preview Styles
epic: epic-8
status: done
baseline_revision: e68298ec26366fa3b0d853fe21d06cd30315e6cf
followup_review_recommended: false
final_revision: 7d4ecb30a36e9efe6370ad3e36e1550b4568eb66
review_loop_iteration: 0
---

# Story 8.2: Export High-Quality PDF Preserving Exact Preview Styles

## Story Description
作为用户，我可以通过 File > Export > Export as PDF... 将当前 Markdown 完美打印/导出为 PDF 文档，完全保留预览区的字体、颜色、代码块与图片排版布局。

## Acceptance Criteria
1. **PDF 导出菜单与对话框**: File > Export 菜单添加 "Export as PDF..." 选项。
2. **样式一致性与无截断**: 利用 WebView 打印引擎或 HTML-to-PDF 渲染库生成 PDF，确保页面边距、分页符（Page Break）、表格和代码块不被异常裁切截断。
3. **导出提示与反馈**: 生成过程提示进度，成功后在状态栏/弹窗提示保存绝对路径。

## Tasks & Acceptance

**Execution:**
- [x] `src/components/MenuBar.vue` -- add "导出为 PDF (Export as PDF)…" row emitting `export-pdf` from the File menu -- AC1
- [x] `src/App.vue` -- wire `@export-pdf`, derive `.pdf` default path, reuse HTML export pipeline/progress state, call `export_pdf`, and surface success/failure/cancel feedback -- AC1, AC3
- [x] `src/styles/preview-export.css` -- add print pagination safeguards for page margins, tables, code blocks, and images -- AC2
- [x] `src-tauri/src/commands/pdf_export.rs` -- render self-contained HTML to native PDF via hidden WebView + WKWebView `createPDFWithConfiguration_completionHandler`, validate save path, and return saved file metadata -- AC2, AC3
- [x] `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs` -- register the new `export_pdf` command
- [x] `src-tauri/Cargo.toml` -- add macOS-scoped native WebKit/Objective-C dependencies needed for PDF rendering
- [x] `src-tauri/capabilities/default.json` -- allow runtime webview-window creation needed by the hidden export renderer -- AC2
- [x] `e2e/story-8-2.spec.ts` -- cover menu entry, `.pdf` save dialog config, styled self-contained HTML payload, and PDF success feedback -- AC1, AC3

**Acceptance Criteria:**
- Given a document open in the editor, when the user clicks File > "导出为 PDF (Export as PDF)…", then a save dialog opens filtered to `.pdf` and proposes a `.pdf` default filename (AC1).
- Given the current preview content, when the user exports as PDF, then the frontend reuses the exact self-contained HTML/CSS export pipeline and the backend renders that HTML through the native WebView PDF engine with print-specific pagination rules to reduce table/code/image truncation (AC2).
- Given a PDF export request is running or completes, when the pipeline advances, then the UI shows export progress/cancel affordances and the final status bar message reports PDF export success/failure, including the saved absolute path on success (AC3).

## Verification

**Commands run (post-patch, final):**
- `npx vue-tsc --noEmit` -- pass
- `npm run build` (`vue-tsc --noEmit && vite build`) -- pass
- `cd src-tauri && cargo check` -- pass
- `cd .. && npx playwright test` (full suite, 91 tests) -- 91 passed, including `e2e/story-8-2.spec.ts` and `e2e/story-8-1.spec.ts`
- **Real native PDF generation smoke test:** the initial implementation navigated the hidden `WebviewWindow` to a `file://` URL via Tauri's normal `WebviewUrl` path, which was found to silently fail to load real content (WKWebView's `loadRequest:`/plain navigation does not grant filesystem read access to `file://` URLs -- this is an Apple-documented WKWebView security restriction; only `loadFileURL:allowingReadAccessToURL:` does). Fixed by building the hidden window on an inert `about:blank` placeholder, then explicitly re-navigating it on the main thread to the temp HTML file via `WKWebView.loadFileURL(_:allowingReadAccessToURL:)`, and filtering the `on_page_load` "Finished" signal to only fire for that specific `file://` navigation (ignoring the placeholder's own load event). This fix was verified empirically, not just by compilation: a throwaway standalone example binary (temporarily making `commands` `pub` in `lib.rs`, added as `src-tauri/examples/pdf_smoke_test.rs`, then reverted/deleted after the test) invoked the exact production `export_pdf` command against sample HTML containing a heading, a table, and a fenced code block. `cargo run --example pdf_smoke_test` produced `/tmp/pdf-smoke-test-output.pdf`, confirmed via `file`/`strings` to be a genuine 1-page PDF v1.3 document (23KB) with embedded Helvetica fonts, i.e. real WebKit-rendered content -- not an empty/blank page. This validates the native rendering pipeline actually works end-to-end on macOS, beyond what `cargo check` alone or the browser-mocked Playwright suite can prove.

**Known limitation:** the packaged desktop app was not manually launched via its full UI (File > Export as PDF... click-through) to visually inspect the generated PDF's fidelity/pagination in the real app shell -- verification instead used the standalone example above, which exercises the identical `export_pdf` command code path. Windows/Linux currently return `ERR_PDF_EXPORT_UNSUPPORTED_PLATFORM: 当前平台暂不支持 PDF 导出` because this sandbox cannot build or verify those native paths, so cross-platform native support remains a deferred engineering follow-up rather than a human-only operator action.

**Review-pass re-verification:** after the review-driven patches below (directory-scoped `loadFileURL` read access, atomic PDF write, bumped timeouts, removed `core:webview:allow-create-webview-window` capability), the same throwaway-example smoke-test technique was repeated twice more (`pdf_smoke_test2.rs`, `pdf_final_smoke.rs`, both created, run, and deleted within this pass) against sample HTML with a heading/table/code block. Both runs produced valid multi-KB PDF v1.3 documents with real embedded Helvetica fonts (confirmed via `file`/`strings`), including one run performed *after* removing the `core:webview:allow-create-webview-window` capability -- confirming that permission was unnecessary (the hidden window is created via the Rust API directly, not through the IPC/ACL layer) and safe to drop. `cargo check`, `npx vue-tsc --noEmit`, `npm run build`, and the full `npx playwright test` suite (91 tests) were all re-run clean after every patch in this pass.

**Review-pass re-verification (2026-08-01, second pass):** after this pass's two patches (propagating `dispatch_load_file_url`'s `with_webview` failure through the load channel instead of silently swallowing it; cleaning up the hidden window and temp HTML file if scheduling the PDF-creation closure on the main thread fails), re-ran `cargo check` (clean), `npx vue-tsc --noEmit` (clean), `npm run build` (clean), and the full `npx playwright test` suite (91 tests, all passed, including `e2e/story-8-2.spec.ts`). Both patches only affect error/cleanup branches (webview-access-dispatch failure and main-thread-scheduling failure) that are not exercised by the happy-path native smoke test from the prior pass, so no new throwaway `cargo run --example` smoke test was created this pass -- the change is a straightforward, low-risk error-propagation/resource-cleanup fix reviewed by inspection alongside the passing `cargo check`.

## Review Triage Log

### 2026-08-01 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 10 (high 1, medium 6, low 3)
- defer: 2 (medium 1, low 1)
- reject: 1
- addressed_findings:
  - `[high]` `[patch]` Wide tables/code blocks under `@media print` relied on `overflow-x: auto` scrollbars, which don't exist in print output -- content past the page margin was silently clipped, directly violating AC2's "no truncation" requirement. Fixed in `src/styles/preview-export.css` by making code wrap (`white-space: pre-wrap`) and tables shrink to the printable width (`table-layout: fixed`) under `@media print`.
  - `[medium]` `[patch]` Clicking "取消导出" once native PDF rendering started had no effect (the `AbortController` only ever covered the earlier HTML-embedding phase), yet the button remained visible, falsely implying cancellation was still possible. Fixed in `src/App.vue` by hiding the cancel action (`exportCancelable`) once the native render phase begins.
  - `[medium]` `[patch]` Non-macOS builds ran the full markdown-render + image-embedding pipeline before learning PDF export is unsupported. Added a cheap `pdf_export_supported` Tauri command (`src-tauri/src/commands/pdf_export.rs`) and an early frontend check in `handleExportPdf` to fail fast.
  - `[medium]` `[patch]` `loadFileURL:allowingReadAccessToURL:` scoped read access to only the temp HTML file itself; local images that failed base64 inlining (kept as a relative `src` with a warning, per `export-html.ts`) would silently fail to load in the PDF. Widened the granted read access to the temp file's parent directory in `dispatch_load_file_url`.
  - `[medium]` `[patch]` Print output could drop non-text styling (theme background, code-block fills, table striping) because WebKit's print renderer omits background colors/fills by default. Added `print-color-adjust: exact` / `-webkit-print-color-adjust: exact` under `@media print` in `preview-export.css`.
  - `[medium]` `[patch]` `core:webview:allow-create-webview-window` was granted to the app's default capability even though the hidden export window is created entirely from Rust code (bypassing the IPC/ACL layer), unnecessarily expanding what a compromised frontend could invoke via `@tauri-apps/api`. Removed the permission from `capabilities/default.json` and re-verified PDF export still works via a native smoke test.
  - `[medium]` `[patch]` The final PDF write used `std::fs::write` directly against the destination path, so a mid-write failure (disk full, permission revoked) could leave a previously-good destination file empty or truncated. Changed to write-to-temp-file-then-rename in the same directory (`write_pdf_atomically`).
  - `[low]` `[patch]` Load/render timeouts were hardcoded at 15s, risking spurious failures on larger documents or slower machines. Bumped both to 60s in `pdf_export.rs`.
  - `[low]` `[patch]` The e2e test only asserted the save dialog's default path ended in `.pdf`, not the exact derived basename. Added an assertion for the full expected default filename in `e2e/story-8-2.spec.ts`.
  - `[low]` `[patch]` Failure paths surfaced raw backend error codes (e.g. `ERR_PDF_EXPORT_LOAD_TIMEOUT`) directly in the status bar. Added `formatPdfExportError()` in `src/App.vue`, mirroring the existing `formatSaveError()` pattern, to map known error codes to user-facing Chinese messages.
  - Deferred to `deferred-work.md`: DW-15 (no explicit paint/layout-settle wait before `createPDFWithConfiguration`, beyond the `Finished` event -- low severity, unreproduced in this pass's manual smoke tests) and DW-16 (e2e coverage is limited to the frontend/IPC boundary like the rest of the repo's Tauri command tests; failure/timeout/cancel/unsupported-platform branches and the real native WebKit path are exercised only by this pass's throwaway smoke tests, not by committed automated tests -- medium severity).
  - Rejected: the claim that the hidden window isn't sized to the on-screen preview width and this undermines fidelity -- verified false: `exportSelfContainedHtml` bakes a fixed responsive layout (computed once from the live preview pane's width at export time) directly into the exported HTML's inline `<style>`, so the rendering window's actual size has no effect on content layout.

### 2026-08-01 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2 (medium 2)
- defer: 1 (high 1)
- reject: 10 (high 1, medium 4, low 5)
- addressed_findings:
  - `[medium]` `[patch]` `dispatch_load_file_url`'s `with_webview` failure (e.g. native webview access unavailable) was silently swallowed (`let _ = window_for_load.with_webview(...)`), so a genuine navigation-dispatch failure would masquerade as a generic 60-second `ERR_PDF_EXPORT_LOAD_TIMEOUT` instead of surfacing its real cause. Changed the load-signal channel in `pdf_export.rs` to carry `Result<(), String>` and propagate the `with_webview` error immediately via `load_error_tx`/`load_rx`, so the failure now returns right away with an accurate `ERR_PDF_EXPORT_WEBVIEW_ACCESS_FAILED` message instead of after a needless 60s wait.
  - `[medium]` `[patch]` If scheduling the PDF-creation closure via `hidden_window.run_on_main_thread(...)` itself failed (before this pass, the immediate `?` short-circuited the function), the hidden window and temp HTML file were never cleaned up, leaking a visible-in-Activity-Monitor window and a stray temp file on disk. Fixed in `pdf_export.rs` by matching on that error and calling `cleanup_hidden_window`/`temp_html.close()` before returning, consistent with every other error branch in `export_pdf_macos`.
  - Deferred to `deferred-work.md`: DW-17 (local images that fail to inline as base64 -- oversized or unresolvable path -- keep their original relative `src`; if the export destination directory differs from the document's directory, that relative path resolves against the wrong base in both HTML and PDF export output, silently breaking the image. Pre-existing from 8-1's `exportSelfContainedHtml`/`documentBaseDir` design, re-surfaced by this pass's review of the PDF diff -- high severity but not caused by this story).
  - Rejected (10, no ledger entry needed): (1) hidden WKWebView window not explicitly sized to match the live preview pane's pixel width -- re-confirmed false, same as the prior pass's rejection: the exported HTML bakes a fixed responsive layout inline regardless of the rendering viewport's actual size; (2) fixed 60s load/render timeouts being brittle for very large documents -- already deliberately tuned in the prior pass (bumped from 15s), tolerable for expected document sizes; (3) full in-memory copies of the HTML/PDF payload across the IPC and file-write boundary -- an inherent, tolerable trade-off of the architecture reused from 8-1, not a functional defect; (4) e2e tests only mocking `export_pdf` and not exercising the real native WebKit path -- duplicate of already-tracked DW-16; (5) print CSS forcing `table-layout: fixed`/`width: 100%` on tables, diverging from the on-screen `max-content` layout -- this is the prior pass's deliberate anti-truncation fix for AC2, not a new regression; (6) the PDF export menu item being visible/clickable on non-macOS platforms -- degrades gracefully via `pdf_export_supported` producing a clear Chinese error message rather than a silent dead end, so not intolerable; (7) the temp HTML being written into the export destination directory (rather than a neutral OS temp dir), risking a stray file on crash -- a deliberate, already-reviewed trade-off needed to grant WKWebView sibling-image read access; (8) a hypothetical missing `.pdf` extension normalization on the save-dialog result -- no such code path exists in `App.vue`, and the cited "guard snippet" does not match any code in the diff; (9) a theoretical cancel-button race between HTML export completion and the native PDF `invoke` call -- inspected the actual control flow and found no yield point (await) between the last cancellation check and `exportCancelable.value = false`, so the race is not reachable in practice; (10) the native PDF API being unavailable on old macOS versions -- the project's `MACOSX_DEPLOYMENT_TARGET` is already 11.0, matching the API's minimum required OS version.

## Design Notes / Spec Change Log

- Implemented full native PDF export only for macOS (the verified target in this environment) using a hidden Tauri `WebviewWindow` + WKWebView PDF generation. Windows/Linux are intentionally cfg-gated to a clear runtime unsupported-platform error until a future story can design, build, and test those platform-specific implementations.
- The hidden export window must load local HTML via `WKWebView.loadFileURL(_:allowingReadAccessToURL:)` rather than Tauri's standard `WebviewUrl` navigation, because WKWebView does not grant filesystem read access to plain `file://` navigations. See Verification above for how this was discovered and fixed.
## Auto Run Result

Status: done

_Appended by the bmad-loop orchestrator (missing-marker repair, #224): the session finalized this spec's frontmatter without its `## Auto Run Result` marker, so the orchestrator synthesized the result from the frontmatter and appended this section._

Synthesized by the bmad-loop orchestrator from frontmatter status `done` for story `8-2-export-pdf-with-exact-styles` (session finalized the spec without appending its marker).
