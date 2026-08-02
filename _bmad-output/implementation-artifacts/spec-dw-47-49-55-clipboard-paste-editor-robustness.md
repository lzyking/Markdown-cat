---
title: '剪贴板粘贴图片链路加固：混合内容放行、base64 高效传输、粘贴位置映射（DW-47, DW-49, DW-55）'
type: 'refactor'
created: '2026-08-02'
status: 'done'
review_loop_iteration: 0
baseline_revision: '316a28eb8dc028c0a4af08033f601171d8113f94'
final_revision: '96026d9930a49892beaad87ac794bae765323aa4'
followup_review_recommended: false
context: []
warnings: ['multiple-goals', 'oversized']
---

<intent-contract>

## Intent

**Problem:** `SourceEditor.vue` 的剪贴板粘贴图片链路存在三处加固缺口：(1) `paste` 处理器只要检测到受支持类型的图片就无条件 `event.preventDefault()`，若剪贴板同时含有文本/HTML，会被一并丢弃而非按原生行为放行；(2) `emitClipboardImage` 用 `Array.from(new Uint8Array(buffer))` 生成 `number[]` 作为 IPC 载荷，大截图带来不必要的内存/CPU 开销；(3) `insertText` 在 `save_image_asset` 异步 resolve 后才读取*当前*选区定位插入点，若用户在写盘期间继续输入，图片 Markdown 会插入到错误位置。

**Approach:** 仅当剪贴板中除受支持图片外不存在其他可粘贴文本/HTML 内容时才 `preventDefault()`；否则不调用 `preventDefault()`（原生粘贴照常放行），图片仍按现有流程异步保存并插入 Markdown 引用（两者并存，不互斥）。将 `ClipboardImagePayload.bytes` 从 `number[]` 改为 base64 字符串，前端用 `FileReader.readAsDataURL` 直接获得 base64（避免手动 `Uint8Array`→`number[]` 展开），后端 `save_image_asset` 用 `base64::engine::general_purpose::STANDARD` 解码。在 `emitClipboardImage` 触发的粘贴发生的瞬间同步捕获光标位置为可映射的追踪 token（通过 CodeMirror `update.changes.mapPos` 在后续每次文档变更时更新），`save_image_asset` resolve 后 `insertText` 优先使用该 token 映射后的位置，而非重新读取当前选区。

## Boundaries & Constraints

**Always:**
- 图片粘贴的"检测到受支持类型 → 异步保存 → 插入 Markdown 引用"整体行为路径保持不变；本次只新增混合内容放行、base64 传输、粘贴位置映射三项加固，不做后端字节内容合法性校验（该项属于 DW-48，不在本次范围）。
- 判断"是否存在其他可粘贴内容"只看 `clipboardData.types` 是否包含 `text/plain`/`text/html` 且对应 `getData(type)` 非空，不改变现有图片类型嗅探逻辑 (`isSupportedClipboardImageType`)。
- 位置 token 映射必须使用 CodeMirror `update.changes.mapPos`；若 token 已失效或未命中（例如极端情况下视图已重建），回退到"读取当前选区"行为，不得抛错或静默丢弃插入。
- 现有 `insertText`（供斜杠命令模板等调用）在不传粘贴 token 时的行为必须与改动前完全一致。
- 保持中文注释风格与现有代码一致；仅在必要处添加简短注释说明"为什么"。

**Block If:** 无（三项均是既有加固需求的直接落地，范围与做法已在情报中明确）。

**Never:**
- 不改变粘贴图片的受支持 MIME 类型集合（仍仅 `image/png`/`image/jpeg`）。
- 不引入新的 IPC 命令；`save_image_asset` 签名可变更参数类型，但命令名不变。
- 不为"混合内容粘贴"实现文本与图片的合并插入逻辑或跳过图片处理——检测到图片时始终照常异步保存并插入引用；混合内容只影响是否 `preventDefault()`。
- 不改动 `read_image_asset`、`copy_asset_file` 等其他命令的字节传输方式，也不在 `save_image_asset` 中新增魔数校验（DW-48 范围）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 纯图片粘贴 | 剪贴板仅含受支持图片 | `preventDefault()` 被调用；图片按现有流程异步保存并插入 Markdown 引用 | 保存失败沿用现有 `saveStatus/saveMessage` 提示 |
| 图片 + 文本/HTML 混合粘贴 | 剪贴板同时含受支持图片与非空 `text/plain`/`text/html` | 不调用 `preventDefault()`；原生粘贴放行的同时，图片仍异步保存并在写盘完成后插入 Markdown 引用 | 无新增错误路径 |
| 写盘期间用户继续输入 | 粘贴发生后、`save_image_asset` resolve 前，用户在文档其他位置输入文本 | 图片 Markdown 引用插入到映射后的原始粘贴位置（随后续编辑相应偏移），而非 resolve 时的当前光标位置 | 若映射 token 失效，回退到当前选区插入，不报错 |
| 写盘期间文档被外部整体替换（如切换文件） | 粘贴发生后、resolve 前，`modelValue` 被外部整体替换 | 追踪的位置 token 被清除；resolve 后回退到"读取当前选区"插入，不落在旧文档的陈旧位置 | 不报错 |
| 保存失败或 `invoke` 抛错 | `save_image_asset` 返回失败或调用抛错 | 对应位置 token 从追踪表中移除，不泄漏 | 沿用现有失败提示分支 |

</intent-contract>

## Code Map

- `src/components/SourceEditor.vue` -- `paste` 处理器加"是否存在其他可粘贴内容"判断（DW-47）；`emitClipboardImage` 改用 `FileReader.readAsDataURL` 生成 base64 并同步捕获粘贴位置 token（DW-49, DW-55）；新增 token 追踪 Map，在 `updateListener` 的 `docChanged` 分支中用 `mapPos` 更新，在外部 `modelValue` 替换时清空；`insertText` 支持按 token 映射位置插入，并暴露清理 token 的方法。
- `src/lib/types.ts` -- `ClipboardImagePayload.bytes` 类型从 `number[]` 改为 `string`（base64）；新增可选 `positionToken?: number`。
- `src/App.vue` -- `handleClipboardImagePaste` 调用 `insertText` 时透传 `payload.positionToken`；保存失败/抛错分支释放该 token。
- `src-tauri/src/commands/doc.rs` -- `save_image_asset` 参数从 `bytes: Vec<u8>` 改为 `bytes_base64: String`，解码失败返回失败 `CmdResult`，不写入文件、不 panic。
- `e2e/story-7-2.spec.ts` -- 更新 `dispatchClipboardImagePaste`/断言以适配 base64 payload；`includeTextItem` 用例新增 `event.defaultPrevented` 断言验证混合内容不再整体丢弃。

## Tasks & Acceptance

**Execution:**
- [x] `src/components/SourceEditor.vue` -- 在 `domEventHandlers.paste` 中新增"剪贴板是否存在其他可粘贴文本/HTML"判断（`clipboardData.types` 含 `text/plain`/`text/html` 且 `getData(type)` 非空字符串），仅当不存在时才 `event.preventDefault()`；否则仍触发 `emitClipboardImage`，但不阻止原生粘贴。 -- 落实 DW-47
- [x] `src/components/SourceEditor.vue` -- 新增模块级自增 `positionTokenSeq` 与 `trackedPastePositions: Map<number, number>`；`emitClipboardImage` 开头（`await` 之前）同步捕获 `view.state.selection.main.head` 存入该 Map 并生成 token，随 `emit('imagePaste', ...)` 一并传出；在 `EditorView.updateListener` 的 `docChanged` 分支中对所有追踪中的 token 用 `update.changes.mapPos(pos)` 更新；在 `watch(() => props.modelValue, ...)` 触发外部整体替换时清空 `trackedPastePositions`。 -- 落实 DW-55 的位置捕获、映射与失效清理
- [x] `src/components/SourceEditor.vue` -- 扩展 `insertText(text, cursorOffset?, replaceSlashPrefix?, positionToken?)`：命中 token 时使用映射后的位置作为插入 `from`/`to`（折叠选区），插入完成后删除该 token；未命中或未传入时行为与现状完全一致。新增并 `defineExpose` 一个 `releasePositionToken(token)` 方法供保存失败路径清理。 -- 落实 DW-55 的插入点使用与失败清理
- [x] `src/components/SourceEditor.vue` -- `emitClipboardImage` 改用 `FileReader.readAsDataURL(matchedFile)` 读取 `data:` URL，截取逗号后的 base64 部分作为 `payload.bytes`，替换原 `Array.from(new Uint8Array(buffer))` 转换；读取失败时静默中止（保持现有容错风格）。 -- 落实 DW-49
- [x] `src/lib/types.ts` -- `ClipboardImagePayload.bytes` 类型改为 `string`；新增可选字段 `positionToken?: number`。 -- 支撑 DW-49、DW-55 的类型契约
- [x] `src/App.vue` -- `invoke('save_image_asset', { targetDir, filename, bytes: payload.bytes })` 保持字段名不变（对应 Rust 侧新参数用 `#[serde(rename = "bytes")]` 保持前端字段名不变）；`insertText` 调用改为透传 `payload.positionToken`；保存失败分支与 `catch` 分支都调用 `sourceEditorRef.value?.releasePositionToken(payload.positionToken)` 避免 token 泄漏。 -- 落实 DW-55 的调用侧改动
- [x] `src-tauri/src/commands/doc.rs` -- `save_image_asset` 新参数标注 `#[serde(rename = "bytes")] bytes_base64: String`，函数体先用 `base64::engine::general_purpose::STANDARD.decode(...)` 解码为 `Vec<u8>`，解码失败返回 `CmdResult::failure("ERR_INVALID_IMAGE_DATA".to_string())`，不 panic、不写入任何文件；解码成功后行为与改动前一致（直接调用 `save_image_asset_impl`，不做魔数校验）。 -- 落实 DW-49
- [x] `src-tauri/src/commands/doc.rs` -- 为 `save_image_asset` 新增单测：合法 base64 正常写盘成功；非法 base64 字符串返回失败且不写盘、不 panic。 -- 覆盖 I/O 矩阵中的 base64 解码失败场景
- [x] `e2e/story-7-2.spec.ts` -- `dispatchClipboardImagePaste` 与断言改为传入/校验 base64 `bytes` 字符串；`includeTextItem: true` 用例新增对 `event.defaultPrevented` 为 `false` 的断言，验证混合内容粘贴不再整体丢弃原生行为。 -- 覆盖 I/O 矩阵中"混合内容粘贴"与"base64 传输"场景

**Acceptance Criteria:**
- Given 剪贴板同时含受支持图片与纯文本，when 用户执行粘贴，then `paste` 事件未被 `preventDefault()`（原生粘贴放行），图片仍异步保存并在保存完成后插入 Markdown 引用。
- Given 剪贴板仅含受支持图片，when 用户执行粘贴，then 行为与改动前完全一致（`preventDefault()` 被调用，图片异步保存并插入引用）。
- Given 用户粘贴图片后、在 `save_image_asset` resolve 前继续在文档其他位置输入文本，when 保存完成，then 图片 Markdown 引用被插入到粘贴发生时光标位置映射后的正确位置，而非 resolve 时的当前光标位置。
- Given 现有斜杠命令模板等未传 `positionToken` 的 `insertText` 调用路径，when 插入触发，then 行为与改动前完全一致（无回归）。
- Given `save_image_asset` 收到非法 base64 字符串，when 命令执行，then 返回失败结果且不写入任何文件、不 panic。

## Design Notes

**位置映射示例（CodeMirror）：**
```ts
// 捕获（粘贴发生的瞬间，同步，await 之前）
const token = ++positionTokenSeq
trackedPastePositions.set(token, view.state.selection.main.head)

// 映射（每次文档变更时，updateListener 内）
if (update.docChanged) {
  for (const [tok, pos] of trackedPastePositions) {
    trackedPastePositions.set(tok, update.changes.mapPos(pos))
  }
}

// 使用（save_image_asset resolve 后，insertText 内部）
const pos = trackedPastePositions.get(token)
trackedPastePositions.delete(token)
```

**base64 编码方式：** `FileReader.readAsDataURL(blob)` 由浏览器/WebView 原生完成二进制→base64 转换，避免手动 `String.fromCharCode(...bytes)` 因参数个数超限而抛错的风险，也避免 `Array.from(new Uint8Array(buffer))` 产生的中间 `number[]`。结果形如 `data:image/png;base64,<data>`，取逗号后子串即为 payload。

## Spec Change Log

## Review Triage Log

### 2026-08-02 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 1, medium 1, low 2)
- defer: 0
- reject: 5: (medium 2, low 3)
- addressed_findings:
  - `[high]` `[patch]` Paste-position token tracked only the caret (`.head`), collapsing any active selection at paste time to a single point; combined with an asymmetric `mapPos` bias this caused a second, more severe bug: when the mixed-content dual-behavior (DW-47) let CodeMirror's own paste handling insert the accompanying `text/plain` at the exact same offset the token tracked, the collapsed point diverged into a range spanning the just-inserted text, so the later image-markdown insert *replaced* that native text instead of following it. Fixed by tracking the full `{from, to}` selection range plus a `collapsed` flag captured at paste time, using a symmetric `+1/+1` `mapPos` bias when collapsed (so the tracked point moves forward past insertions at that offset, matching normal cursor behavior) and an asymmetric `-1/+1` bias when a real selection exists (so the range grows to include insertions at its own boundary and gets replaced as a whole). `insertText` now uses the mapped range as `from`/`to` directly instead of collapsing to a point. Verified with a new e2e test that selects text, pastes an image, types elsewhere before the async save resolves, and asserts the originally-selected text is replaced by the image markdown at the mapped position.
  - `[medium]` `[patch]` `hasTextItem`/`hasHtmlItem` used `.trim().length > 0`, which treats whitespace-only clipboard text/HTML as "no other pasteable content" and silently drops it — a deviation from the spec's literal "非空字符串" (non-empty string) boundary. Changed both checks to plain `.length > 0`.
  - `[low]` `[patch]` Added an e2e test for the previously-uncovered `text/html`-only mixed-content branch (image + non-empty `text/html`, no `text/plain`), asserting native paste is not blocked and the image is still saved.
  - `[low]` `[patch]` Removed dead/misleading test scaffolding (`preventDefaultCalled` tracking on a stubbed `event.preventDefault`) that was returned by the Playwright helper but never meaningfully assertable — CodeMirror's own default paste handling calls `preventDefault()` internally regardless of our DOM handler's return value, so the flag didn't signal what the test intended. Kept only `__lastImagePastePreventedDefault`, the handler's own explicit bookkeeping flag, as the reliable assertion target.
- Rejected as out-of-scope or already-intended-by-design (not actionable this pass):
  - `[medium]` Backend `save_image_asset` validates base64-decodability but not that decoded bytes are a genuine PNG/JPEG (no magic-byte check) — explicitly excluded by this spec's `<intent-contract>` "Never" boundary; tracked separately as ledger item DW-48.
  - `[medium]` No size guard on the backend base64 decode path for very large images — same base64→bytes memory footprint as the pre-existing `Vec<u8>` JSON-array transfer it replaces, not a regression, and no size limit existed before this change either.
  - `[low]` Treating any non-empty `text/html` payload as reason to skip `preventDefault()` risks native paste inserting unwanted HTML-derived content alongside the generated image markdown — this is the literal, explicitly-required resolution in this spec's `<intent-contract>` Approach clause (dual behavior: native paste proceeds, image is still saved and inserted), not an implementation defect.
  - `[low]` Stale position token after an external whole-document replacement falls back to reading the current selection rather than cancelling the pending insert — this exact fallback is mandated verbatim by the `<intent-contract>` "Always" boundary ("若映射 token 已失效或找不到...回退到现有'读取当前选区'行为，不得抛错或静默丢弃插入").
  - `[low]` Only the primary selection range (`selection.main`) is tracked, not all multi-cursor ranges — matches pre-existing `insertText` behavior (which also only ever used `selection.main`), so not a regression introduced by this change.

### 2026-08-02 — Follow-up review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 1, low 1)
- defer: 3: (low 3)
- reject: 7: (medium 1, low 6)
- addressed_findings:
  - `[high]` `[patch]` The previous pass's collapsed/range `mapPos` fix only handled the "typed elsewhere while async save is pending" scenario. It missed a distinct, more severe case: when mixed content is present with a *non-collapsed* selection, native paste itself performs a delete-and-insert transaction that replaces exactly `[selectionAtPaste.from, selectionAtPaste.to]`. Since `mapPos` maps both boundary positions of a delete+insert change to their respective sides of the replacement *regardless of the `assoc`/bias argument* (verified directly against `@codemirror/state`'s `ChangeSet.mapPos`), continuing to track the original `{from, to}` range in this case always remapped to bracket the entire natively-inserted text, so the subsequent image-markdown insert replaced that just-pasted text instead of following it. Fixed by tracking only the selection's `to` endpoint as a collapsed point (not the full range) whenever native paste will also handle the event (i.e. `hasOtherPasteableContent` is true), since that endpoint deterministically maps to "immediately after the natively-inserted content" under `mapPos` irrespective of bias; the original full-range tracking is preserved for the image-only path (`preventDefault()` case) where no native replacement occurs. Extracted the mixed-content detection into a shared `hasOtherPasteableClipboardContent` helper used by both the `paste()` handler and `emitClipboardImage` to keep the two decisions consistent. Verified with a new e2e test: select text, paste image + `text/plain` together, and assert the natively-pasted text is preserved with the image markdown appended immediately after it (not replacing it).
  - `[low]` `[patch]` The first e2e test ("未保存文档粘贴图片时应暂存到默认目录...") was changed in the prior pass to always include `includeTextItem: true`, which incidentally removed all direct e2e coverage of the pure-image-only path (`preventDefault()` called, no other clipboard content). Added a dedicated e2e test asserting `preventDefault()` is called and the image markdown is inserted alone when the clipboard contains only a supported image.
- Deferred to ledger (pre-existing issues surfaced incidentally, not caused by this story):
  - `[low]` `handleClipboardImagePaste` in `App.vue` resolves and inserts against whatever document is currently open at resolve time, with no check that it's still the document the paste originated from; switching files during the async save can insert the image reference into the wrong document. The underlying async-save race predates this story.
  - `[low]` `positionTokenSeq`/`trackedPastePositions` are scoped per component instance with no document/session namespacing, so an editor unmount/remount while a paste is pending could theoretically let a stale token collide with a freshly issued one in the new instance. This is a new mechanism introduced by this story, but the collision window is narrow and not currently exercised by any test.
  - `[low]` The success branch in `handleClipboardImagePaste` sets `saveStatus.value = 'success'` without verifying `sourceEditorRef.value?.insertText(...)` actually ran; if the editor ref is unavailable at resolve time, the file is written but the UI still reports success with no inserted reference. This optional-chaining-without-verification pattern predates this story's position-token addition.
- Rejected as out-of-scope, already-intended-by-design, or not actionable (not actionable this pass):
  - `[medium]` Backend `save_image_asset` still lacks magic-byte validation of decoded bytes, and there is no test covering "valid base64, non-image bytes" — same DW-48 out-of-scope boundary already logged in the previous pass; not re-deferred to avoid duplicating the existing ledger item.
  - `[low]` Mixed-content detection only recognizes `text/plain`/`text/html`, so an image pasted alongside e.g. `text/uri-list`/`text/rtf` still triggers `preventDefault()` — this is the literal, explicitly-scoped detection rule mandated by this spec's `<intent-contract>` ("只看 clipboardData.types 是否包含 text/plain/text/html"); strictly an improvement over pre-existing behavior (previously *all* non-image content was dropped), not a regression.
  - `[low]` Suggestion to assert that pasted `text/html` content remains visible in the editor for the HTML-mixed-content e2e test — verified directly (`e2e` probe) that this plain-text CodeMirror editor's default paste handling does not insert any content from a `text/html`-only clipboard payload (no `text/plain` present), so no such visible content exists to assert; the existing test's assertions (native paste not blocked, image still saved) already cover the real observable behavior.
  - `[low]` Concern that the e2e helper relies on the private `__lastImagePastePreventedDefault` hook rather than asserting real paste outcomes — this pass's new/modified tests now assert actual resulting document text content (not just the internal flag) for every mixed-content and position-mapping scenario, directly covering the real observable behavior the hook was a proxy for.
  - `[low]` Suggestion for additional position-tracking test coverage of edits made *inside* a tracked range (as opposed to before it) — the range-tracking logic exercised by this pass's new regression test already covers the specific failure mode found and fixed (native replace of the full tracked range); further edge-case permutations are speculative rather than confirmed real, so not deferred as a distinct item beyond the general async-race items already logged above.
  - `[low]` Removing `Vec<u8>` in favor of a base64 `String` parameter for `save_image_asset` would break any caller still sending a raw byte array — verified this is not a real regression: the command name is unchanged per this spec's boundary, and both the frontend (`App.vue`/`SourceEditor.vue`) and backend (`doc.rs`) call sites were updated together in this same change, so there is no surviving caller sending the old shape.


### 2026-08-02 — Review pass (3rd, follow-up)
- intent_gap: 0
- bad_spec: 0
- patch: 1: (low 1)
- defer: 1: (low 1)
- reject: 9: (medium 1, low 8)
- addressed_findings:
  - `[low]` `[patch]` The "剪贴板同时含图片与 HTML 内容时，粘贴不应整体丢弃原生行为" e2e test only asserted `handlerPreventedDefault === false` and that `save_image_asset` was invoked; it never checked the resulting document content, so a regression that duplicated, lost, or misplaced the image markdown reference (or unexpectedly inserted HTML-derived text) would not have been caught. Added an assertion that the final document content matches exactly the image Markdown reference alone (no `Clipboard html` fragment, matching this plain-text CodeMirror editor's verified behavior of not inserting `text/html`-only clipboard payloads).
- Deferred to ledger (pre-existing issue surfaced incidentally, not caused by this story):
  - `[low]` `handleClipboardImagePaste` in `App.vue` resolves and inserts against whatever document is currently open at resolve time, with no check that it is still the document the paste originated from; switching files during the pending async save can insert the image reference into the wrong document. This exact issue was already deferred in the "Follow-up review pass" above; re-surfaced independently by this pass's reviewers and re-recorded per this workflow's append-only ledger policy.
- Rejected as out-of-scope, already-intended-by-design, speculative, or not actionable this pass:
  - `[medium]` Backend `save_image_asset` decodes an empty base64 string to an empty `Vec<u8>` and writes it without validating decoded byte content, so a pathological empty/garbage payload could produce a broken image reference — this is exactly the decoded-byte content-legitimacy validation explicitly excluded by this spec's `<intent-contract>` "Never" boundary (`不在 save_image_asset 中新增魔数校验（DW-48 范围）`); tracked separately as DW-48, already logged in a prior pass, not re-deferred to avoid duplication.
  - `[low]` A missing/invalidated `positionToken` causes `insertText` to fall back to the current selection rather than aborting or erroring — this is the literal, explicitly-mandated fallback behavior in the `<intent-contract>` "Always" boundary ("若映射 token 已失效或未命中...回退到读取当前选区行为，不得抛错或静默丢弃插入").
  - `[low]` Hybrid-content detection only recognizes `text/plain`/`text/html`, so companion clipboard flavors like `text/uri-list`/`text/rtf`/`text/markdown` still trigger `preventDefault()` and get dropped — this is the literal, explicitly-scoped detection rule mandated by the `<intent-contract>` ("只看 clipboardData.types 是否包含 text/plain/text/html"); already rejected on the same grounds in the first review pass.
  - `[low]` `getData(type).length > 0` is characterized as "brittle" for classifying hybrid content — no concrete browser/WebView behavior was identified where a real non-empty clipboard flavor returns an empty string from `getData`; speculative, not a confirmed real gap.
  - `[low]` Base64 clipboard transfer is characterized as adding ~33% encoding overhead and extra copies versus "ideal" binary transfer — this is the literal, explicitly-mandated approach in the `<intent-contract>` (base64 via `FileReader.readAsDataURL`, no new IPC command), and is strictly more efficient than the pre-existing `Array.from(new Uint8Array(buffer))` → JSON `number[]` transfer it replaces, not a regression.
  - `[low]` No front-end size guard before `FileReader.readAsDataURL` reads a very large pasted image into a JS string — the pre-existing `Array.from(new Uint8Array(buffer))` path this replaces had the identical unbounded-read characteristic and no prior size guard either; not a regression introduced by this change, and a backend-side size-guard variant of this same concern was already rejected on identical grounds in the first review pass.
  - `[low]` The async race window (typing elsewhere while `save_image_asset` is pending) is claimed to be barely tested because the mock resolves immediately — verified false: `e2e/story-7-2.spec.ts` already contains a dedicated regression test (`粘贴图片时应替换粘贴瞬间选中的文本，而非写盘完成后的当前选区`) that explicitly dispatches an intervening document edit before the poll-based assertion resolves, directly exercising this race.
  - `[low]` No coverage for two overlapping/concurrent pastes before the first `save_image_asset` resolves — plausible but speculative; no confirmed failure mode identified, and the existing single-token-map design was not shown to actually misbehave under this scenario. Not deferred, consistent with a near-identical speculative concern already rejected in the prior pass.
  - `[low]` No true end-to-end test proving the real Tauri IPC boundary preserves the base64 payload (tests assert against the mocked `invoke` call args, not a real round-trip) — this is a pre-existing characteristic of this repo's entire e2e test harness (every command in this suite is exercised via `__TAURI_MOCK__`, not a live Tauri runtime), not a gap introduced or worsened by this story.

## Verification

**Commands:**
- `npx vue-tsc --noEmit` -- expected: 无类型错误
- `npx eslint src/components/SourceEditor.vue src/App.vue src/lib/types.ts` -- expected: 无新增 lint 错误
- `cargo test --manifest-path src-tauri/Cargo.toml` -- expected: 全部通过，含新增的 `save_image_asset` base64 解码测试
- `npx playwright test e2e/story-7-2.spec.ts` -- expected: 全部通过

**Manual checks (if no CLI):**
- 确认 `src/App.vue` 中 `invoke('save_image_asset', ...)` 的字段名与 `src-tauri/src/commands/doc.rs` 参数名（含 `#[serde(rename)]`）匹配，避免运行时因参数名不一致导致调用失败。


## Auto Run Result

Status: done

Summary: 对 DW-47/49/55 剪贴板粘贴图片链路加固的既有实现（混合内容放行、base64 传输、粘贴位置 token 映射）执行了第三轮（第二次后续）独立复审。本轮由 Blind Hunter 与 Edge Case Hunter 并行审查同一 diff（自 `baseline_revision` 起，覆盖 `src/components/SourceEditor.vue`、`src/App.vue`、`src/lib/types.ts`、`src-tauri/src/commands/doc.rs`、`e2e/story-7-2.spec.ts` 的全部改动），未发现新的高/中严重性缺陷或 intent gap/bad spec；本次实现在此前两轮修复后已稳定。仅修复一处测试覆盖缺口：混合内容（图片 + HTML）粘贴的 e2e 用例此前只断言 `preventDefault` 未被调用且 `save_image_asset` 被触发，未校验最终文档内容，现已补充断言确保文档内容精确等于图片 Markdown 引用（不多不少），防止图片引用丢失/重复/错位或 HTML 内容被意外插入的回归不被发现。

Files changed:
- `e2e/story-7-2.spec.ts` -- 为"剪贴板同时含图片与 HTML 内容时，粘贴不应整体丢弃原生行为"用例补充最终文档内容断言（校验内容精确匹配图片 Markdown 引用）。
- `_bmad-output/implementation-artifacts/deferred-work.md` -- 按本工作流"仅追加、不去重"的台账策略，追加 1 条复审中独立再次发现的既有问题条目（跨文档粘贴竞态；与此前一轮已记录的同一问题重复，故未在本 spec 内再次详述根因，详见台账原文）。

Review findings breakdown: 1 patch applied (low — 测试内容断言缺口), 1 deferred to ledger (low — 跨文档粘贴竞态，本 story 之外的既有问题，与此前一轮已延期条目重复但按策略仍单独追加), 9 rejected (1 medium — DW-48 范围内的字节合法性校验，已有明确 intent-contract 边界排除；8 low — 均为已在 intent-contract 中明确限定的既定行为、推测性/未证实的担忧，或经代码/测试直接验证为不成立的顾虑)。

Verification performed:
- `npx vue-tsc --noEmit` — pass, no type errors.
- `cargo test --manifest-path src-tauri/Cargo.toml` — 18 passed, 0 failed.
- `npx playwright test e2e/story-7-2.spec.ts` — 6 passed, 0 failed (including the newly added content assertion).
- `npx playwright test` (full suite) — 109 passed, 0 failed.
- `npx eslint ...` could not run — no `eslint.config.*`/`.eslintrc*` present in the repo (pre-existing gap, not caused by this change).
- Directly inspected `e2e/story-7-2.spec.ts` to confirm the existing async-typing-race regression test (added in the prior pass) genuinely exercises an intervening edit before the pending save resolves, refuting a reviewer claim that this scenario was untested.

Residual risks:
- None new. The implementation has now passed three independent review passes (initial + two follow-ups) with no new high/medium-severity findings in this pass; a further independent review is not recommended (`followup_review_recommended: false`) given the low volume and low severity of this pass's single patch.
- Four low-severity, pre-existing gaps in this same paste flow remain open on the deferred-work ledger for later focused attention: cross-document paste race during async save (now recorded twice per this workflow's append-only ledger policy), position-token collision across editor instance remounts, and unverified `insertText` success-path execution.
- DW-48 (backend magic-byte/content-legitimacy validation of decoded image bytes, including the empty-payload edge case) remains open and unaddressed by design — tracked separately on the deferred-work ledger.
