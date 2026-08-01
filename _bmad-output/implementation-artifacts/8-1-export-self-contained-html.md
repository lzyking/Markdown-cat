---
id: 8-1-export-self-contained-html
title: Export Self-Contained HTML with Embedded Base64 Images
epic: epic-8
status: done
baseline_revision: 895c98f0a61072333436452e54056c36b2d7b19c
review_loop_iteration: 0
followup_review_recommended: false
final_revision: ae6d95e6e74bbfa64469f3f9f996200c09055183
---

# Story 8.1: Export Self-Contained HTML with Embedded Base64 Images

## Story Description
作为用户，我可以通过 File > Export 将 Markdown 导出为单文件 HTML 格式。生成的 HTML 包含完整的 CSS 预览样式，并且 Markdown 引用的本地图片完全转换为 Base64 嵌入 HTML 内部，方便脱机或通过邮件分享。

## Acceptance Criteria
1. **菜单导出项**: 在 File > Export 菜单中添加 "Export as HTML..."，触发系统保存对话框。
2. **样式提取内嵌**: 将当前软件预览区应用的 CSS 样式（包括排版、代码高亮、表格、主题颜色）内联写入导出 HTML 的 `<style>` 标签中。
3. **本地图片 Base64 嵌入**: 扫描 HTML 中的图片 `<img>` 标签及 Markdown 本地相对/绝对图片路径，将图片读取并转为 `data:image/png;base64,...` 数据 URI 填入 `src`，确保导出的单文件 `.html` 不依赖任何外部文件资源。
4. **异步转换与超大图片容错**: Base64 图片提取及转换过程放在后台异步线程执行，在界面上弹出可取消的导出进度条；对超过 10MB 的超大图片给出防卡死提示。
5. **远程网络图片超时容错**: 遇到 `http(s)://` 远程图片时设置 3 秒 Fetch 超时，失败自动回退保持原网络 URL，不阻断整页 HTML 导出。

## Tasks & Acceptance

**Execution:**
- [x] `src/components/MenuBar.vue` -- add "导出为 HTML (Export as HTML)…" row emitting `export-html` -- AC1
- [x] `src/App.vue` -- wire `@export-html`, save dialog, export pipeline, progress/cancel overlay, status reporting -- AC1, AC4
- [x] `src/lib/export-html.ts` -- assemble self-contained HTML, inline styles, rewrite local/remote image `src` to base64 data URIs, remote fetch w/ 3s timeout fallback -- AC2, AC3, AC5
- [x] `src/lib/preview.ts`, `src/styles/preview-export.css` -- extracted/inlined preview CSS (typography, code highlighting, tables, theme colors) -- AC2
- [x] `src/lib/tauri-dialog.ts` -- testable save-dialog wrapper -- AC1
- [x] `src/lib/types.ts` -- `ReadImageAssetResult` type -- AC3
- [x] `src-tauri/src/commands/doc.rs` (`read_image_asset`) -- read local image, return mime/size/base64, skip+warn if > 10MB -- AC3, AC4
- [x] `src-tauri/src/lib.rs` -- register `read_image_asset` command
- [x] `e2e/story-8-1.spec.ts`, `e2e/fixtures.ts` -- e2e coverage of menu entry + exported HTML containing inlined style and base64 image data URI

**Acceptance Criteria:**
- Given a document open in the editor, when the user clicks File > "导出为 HTML (Export as HTML)…", then a save dialog opens filtered to `.html` (AC1).
- Given a document referencing a local relative/absolute image, when exported, then the produced HTML's `<style>` tag contains the preview's typography/code/table/theme CSS and the `<img src>` is a `data:` base64 URI, with no dependency on external files (AC2, AC3).
- Given an image larger than 10MB, when exported, then the pipeline does not block the UI, skips base64 conversion for that image, and surfaces a warning while completing export of the rest of the document (AC4).
- Given a document referencing a remote `http(s)://` image, when the fetch exceeds 3 seconds or fails, then the export falls back to the original remote URL without aborting the export (AC5).

## Verification

**Commands run (post-patch, final):**
- `npx tsc --noEmit` -- pass
- `npm run build` (`vue-tsc --noEmit && vite build`) -- pass
- `cd src-tauri && cargo check` -- pass
- `npx playwright test` (full suite, 90 tests) -- 90 passed, including `e2e/story-8-1.spec.ts`

**Known limitation:** real Tauri desktop system save dialog was validated only via frontend mocks in the e2e run; the packaged desktop app was not manually launched to confirm the native OS dialog UX.

**Commands run (follow-up review pass, 2026-08-01):**
- `npx vue-tsc --noEmit` -- pass
- `npm run build` (`vue-tsc --noEmit && vite build`) -- pass
- `cd src-tauri && cargo check` -- pass
- `npx playwright test` (full suite, 90 tests) -- 90 passed, including `e2e/story-8-1.spec.ts`
- Manual Playwright script rendering the assembled export CSS in a real Chromium page, confirming the exported document was unscrollable before the fix (`maxScroll: 0`) and scrollable after (`maxScroll: 22635`).

## Review Triage Log

### 2026-08-01 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4 (high 1, medium 2, low 1)
- defer: 1 (medium 1)
- reject: 1 (low 1)
- addressed_findings:
  - `[high]` `[patch]` Local/absolute image reads in `read_image_asset` (`src-tauri/src/commands/doc.rs`) trusted the file extension alone, letting a crafted `![](/absolute/path)` reference exfiltrate the content of any local file disguised as an image. Added an extension allowlist plus magic-byte content sniffing (`is_supported_image_extension`, `looks_like_image_content`) that reject non-image files before base64-encoding.
  - `[medium]` `[patch]` Tauri CSP `connect-src` (`src-tauri/tauri.conf.json`) blocked all outbound `http(s)` requests, so AC5's remote-image fetch/timeout/fallback path could never actually attempt a network request in the packaged app (always fell back immediately). Widened `connect-src` to include `https:`/`http:` so the fetch attempt described in AC5 can run as specified.
  - `[medium]` `[patch]` Protocol-relative image URLs (e.g. `//cdn.example.com/x.png`) were misclassified as absolute filesystem paths (`isAbsoluteFilesystemPath` matched the leading `//`) and routed to `read_image_asset`, which would fail to find the "file" instead of fetching it remotely. Fixed `isAbsoluteFilesystemPath` to exclude `//`/`\\\\` prefixes and added explicit protocol-relative handling (resolved against `https:`) in `src/lib/export-html.ts`.
  - `[low]` `[patch]` Unsupported image URI schemes (`blob:`, `file://`, etc.) fell through both the remote and local branches silently, leaving an unusable `src` in the exported HTML with no warning surfaced to the user. Added an `else` branch in `src/lib/export-html.ts` that records a `local-read-failed` warning for these cases.
- Deferred:
  - `[medium]` App startup's "restore last opened file" branch (`src/App.vue` `onMounted`, `read_external_document` success path) never sets `currentFilePath`, so autosave/"Save As" default directory and this story's export default filename/relative-image resolution use the wrong base directory until the user manually opens/saves the file once. Pre-existing gap (autosave was already affected before this story); this story's export feature is a second consumer that surfaced it. Logged as a new entry in `deferred-work.md`.
- Rejected:
  - `[low]` E2E fixtures/spec use POSIX-only paths (no Windows path coverage). Consistent with all existing e2e specs in this macOS-only development environment; not a regression introduced by this story.

### 2026-08-01 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 1, medium 1, low 2)
- defer: 2: (medium 2)
- reject: 7: (low 5, medium 2)
- addressed_findings:
  - `[high]` `[patch]` The exported HTML inlined the app shell's `html, body, #app { height: 100%; overflow: hidden; }` rule from `app.css` unmodified. Once applied to a standalone `<html>`/`<body>` document (not the SPA shell it was designed for), this clips the page at one viewport tall and disables scrolling entirely — verified with a real Chromium page: before the fix a 500-paragraph export had `maxScroll: 0` (completely unscrollable), after the fix `maxScroll: 22635`. Fixed in `buildExportStyles()` (`src/lib/export-html.ts`) by appending an export-only override resetting `html, body` to `height: auto; overflow: visible`.
  - `[medium]` `[patch]` Remote (`http(s)://`) images had no size limit, unlike local images which are capped at 10MB (`LOCAL_IMAGE_EMBED_LIMIT_BYTES`) per AC4's oversized-image protection. An arbitrarily large remote image could still freeze the renderer/exhaust memory during download and base64 conversion. Added a `Content-Length` pre-check and a post-download byte-length check in `fetchRemoteImageAsDataUri()` (`src/lib/export-html.ts`), throwing a new `RemoteImageTooLargeError` that surfaces as a `remote-too-large` warning (mirrors the existing local `local-too-large` warning) instead of embedding or freezing.
  - `[low]` `[patch]` `inferMimeTypeFromUrl()` (`src/lib/export-html.ts`) was missing `.tif`/`.tiff` cases that the Rust-side `guess_image_mime_type()` (`src-tauri/src/commands/doc.rs`) already supports, so a remote TIFF without a reliable `Content-Type` header would be embedded as `application/octet-stream` instead of `image/tiff`. Added the missing cases for consistency with the local path.
  - `[low]` `[patch]` `deriveHtmlExportFilename()` (`src/App.vue`) stripped any trailing `\.[^.]+$` token as if it were a file extension, so a document literally named e.g. `Release 1.0` (no real extension) would export as `Release 1.html`, silently dropping the `.0`. Narrowed the strip pattern to only recognized document extensions (`.md`/`.markdown`/`.txt`, case-insensitive); anything else now gets `.html` appended rather than a suffix replaced.
- Deferred:
  - `[medium]` App startup's "restore last opened file" branch (`src/App.vue` `onMounted`) still does not set `currentFilePath` after a successful `read_external_document`, so autosave/"Save As"/export default-path resolution remain wrong until the user manually opens or resaves the file. Same pre-existing gap already logged for story 7-2 and the prior 8-1 review pass; still unresolved, re-logged as a new `deferred-work.md` entry per this workflow's append-only rule.
  - `[medium]` HTML export reuses the `save_document_as` Tauri command (`src-tauri/src/commands/doc.rs`) to write the exported file, which as a side effect widens the `asset://` protocol scope to the chosen export directory — an unneeded permission-surface expansion for a feature that produces a self-contained file with no `asset://` dependency. The command is shared with the unrelated "Save As Markdown" flow, so narrowing it is not a safe isolated patch for this story; logged for focused follow-up.
- Rejected:
  - `[medium]` Concern that `read_image_asset` accepts `.svg` without content sniffing, allowing a crafted local SVG with an embedded `<script>` to be inlined. Rejected: the exported markup only ever embeds it via `<img src="data:image/svg+xml;...">`, and browsers render `<img>`-sourced SVGs in a script-disabled, external-reference-blocked context, so the described script-execution/exfiltration path is not actually reachable through this feature.
  - `[medium]` Concern that `fetchRemoteImageAsDataUri()` blindly trusts whatever `fetch()` returns (e.g. a captive-portal or error page served with an image URL) and embeds it as a data URI. Rejected: same `<img>`-only embedding context as above caps the worst case at a broken/garbled image render, not code execution; not worth the added complexity of content sniffing for this story.
  - `[low]` Concern that `bytesToBase64()`'s chunked string concatenation is inefficient for very large images. Rejected as moot now that remote images are capped at `LOCAL_IMAGE_EMBED_LIMIT_BYTES` (10MB) by this pass's size-limit patch, matching the pre-existing local-image bound the function already operated within.
  - `[low]` Concern that protocol-relative image URLs (`//host/x.png`) are force-resolved against `https:`. Rejected: this is deliberate, already-commented behavior (`export-html.ts`), and defaulting to `https:` is the standard, safer choice; not a bug.
  - `[low]` Concern that export progress warnings are cleared (`resetExportProgress()` in the `finally` block) once the export finishes, leaving only a warning count in the final status message. Rejected: AC4 only requires a warning to be surfaced for oversized images, which the live progress panel (last 3 warnings, `visibleExportWarnings`) already does during processing; a persistent post-export detail list is an enhancement, not a defect against the AC.
  - `[low]` Concern that export cancellation reuses the shared `'failure'` save-status kind, visually resembling a real error. Rejected: the accompanying message text ("HTML 导出已取消") already clearly distinguishes cancellation from failure; cosmetic only.
  - `[medium]` Concern that the new Playwright coverage doesn't open the generated export HTML in a real, unmocked browser context and so wouldn't have caught the overflow/scrolling regression. Rejected as a test-process observation rather than an actionable defect in the diff itself; the regression it describes was independently found and fixed in this same pass via manual Chromium verification.
## Auto Run Result

Status: done

_Appended by the bmad-loop orchestrator (missing-marker repair, #224): the session finalized this spec's frontmatter without its `## Auto Run Result` marker, so the orchestrator synthesized the result from the frontmatter and appended this section._

Synthesized by the bmad-loop orchestrator from frontmatter status `done` for story `8-1-export-self-contained-html` (session finalized the spec without appending its marker).
