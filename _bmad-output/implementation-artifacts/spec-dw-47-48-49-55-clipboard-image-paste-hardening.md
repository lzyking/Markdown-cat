---
title: '剪贴板粘贴图片链路加固：混合内容保留、后端内容校验、base64 传输、粘贴位置映射（DW-47, DW-48, DW-49, DW-55）'
type: 'refactor'
created: '2026-08-02'
status: 'blocked'
baseline_revision: '8d37acdb84a39772d9cd88851e368f65eeedea11'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** 剪贴板粘贴图片链路存在四处加固缺口：(1) `SourceEditor.vue` 的 `paste` 处理器只要检测到受支持类型的图片项就无条件 `preventDefault()`，若剪贴板同时含有文本/HTML，会被一并丢弃而非按原生行为一起粘贴；(2) 后端 `save_image_asset` 未校验写入字节确实是合法 PNG/JPEG，对上游数据来源零信任场景无防护；(3) 前端将图片二进制经 `ArrayBuffer → Uint8Array → number[]` 三次转换后经 IPC 传输，大截图有不必要的内存开销；(4) `insertText` 在 `save_image_asset` 异步返回后才读取*当前*选区来定位插入点，若用户在写盘期间继续输入，图片 Markdown 会插入到错误位置。

**Approach:** 在 `SourceEditor.vue` 的 `paste` 处理器中，仅在剪贴板不含其他可粘贴文本/HTML 内容时才 `preventDefault()` 图片粘贴；否则放行原生粘贴行为（图片仍照常异步保存并插入引用）。将 `ClipboardImagePayload.bytes: number[]` 改为 `bytes: string`（base64），前端用 base64 编码 `ArrayBuffer`，后端 `save_image_asset` 用 `base64::engine::general_purpose::STANDARD.decode` 解码为 `Vec<u8>`。在 `save_image_asset` 解码后、写盘前，复用既有的 `looks_like_image_content()` 魔数校验拒绝非法字节。在 `emitClipboardImage` 触发的粘贴发生的瞬间同步捕获光标位置为一个可映射的追踪 token（通过 CodeMirror 的 `ChangeSet.mapPos` 在后续每次文档变更时更新），`save_image_asset` resolve 后 `insertText` 优先使用该 token 映射后的位置作为插入点，而非重新读取当前选区。

## Boundaries & Constraints

**Always:**
- 图片粘贴的“检测到受支持类型 → 异步保存 → 插入 Markdown 引用”整体行为路径保持不变；仅新增混合内容放行、后端内容校验、base64 编码、粘贴位置映射四项加固。
- `paste` 处理器判断“是否存在其他可粘贴文本/HTML”时，只看 `clipboardData.types`（如 `text/plain`、`text/html`）是否存在非空对应数据，不改变现有图片类型嗅探逻辑（`isSupportedClipboardImageType`）。
- `save_image_asset` 的 base64 解码失败或魔数校验失败时，返回失败 `CmdResult`（沿用现有 `CmdResult::failure` 错误码风格），不写入任何文件、不 panic。
- 粘贴位置 token 的映射必须使用 CodeMirror `ChangeSet`/`update.changes.mapPos`，覆盖“写盘期间用户继续输入”的场景；若 token 已失效或找不到（例如极端情况下视图已重建），回退到现有“读取当前选区”行为，不得抛错或静默丢弃插入。
- 现有 `insertText`（供斜杠命令模板等调用）在不传粘贴 token 时的行为必须与改动前完全一致。
- 保持中文注释风格与现有代码一致；仅在必要处添加简短注释说明"为什么"。

**Block If:** 无（四项均是既有加固需求的直接落地，范围与做法在情报中已明确）。

**Never:**
- 不改变粘贴图片的受支持 MIME 类型集合（仍仅 `image/png`/`image/jpeg`）。
- 不引入新的 IPC 命令；`save_image_asset` 签名可变更参数类型，但命令名不变。
- 不为“混合内容粘贴”实现文本与图片的合并插入逻辑——检测到非图片可粘贴内容时，只需放行原生粘贴（图片粘贴逻辑本次不触发 `preventDefault`），不必同时手动模拟插入文本。
- 不改动 `read_image_asset`、`copy_asset_file` 等其他命令的字节传输方式。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 纯图片粘贴 | 剪贴板仅含受支持图片文件 | `preventDefault()` 被调用，图片按现有流程异步保存并插入 Markdown 引用 | 保存失败时沿用现有 `saveStatus/saveMessage` 提示 |
| 图片 + 文本混合粘贴 | 剪贴板同时含受支持图片文件与 `text/plain`/`text/html` | 不调用 `preventDefault()`；原生粘贴放行的同时，图片仍异步保存并在写盘完成后插入 Markdown 引用 | 无新增错误路径 |
| 后端字节非法图片 | `save_image_asset` 收到能被 base64 解码、但 `looks_like_image_content` 判定非 PNG/JPEG 的字节 | 命令返回失败 `CmdResult`，不写入文件 | 返回明确错误码（如 `ERR_UNSUPPORTED_IMAGE_TYPE`），前端沿用现有失败提示分支 |
| base64 解码失败 | `bytes` 字段不是合法 base64 | 命令返回失败 `CmdResult`，不 panic、不写入文件 | 返回明确错误码（如 `ERR_INVALID_IMAGE_DATA`） |
| 写盘期间用户继续输入 | 粘贴发生后、`save_image_asset` resolve 前，用户在文档其他位置输入文本（不跨越捕获点前的行边界即可，含跨行编辑） | 图片 Markdown 引用被插入到映射后的原始粘贴位置（随后续编辑相应偏移），而非 resolve 时的当前光标位置 | 若映射 token 失效，回退到当前选区插入，不报错 |

</intent-contract>

## Code Map

- `src/components/SourceEditor.vue` -- `paste` 处理器加"是否存在其他可粘贴内容"判断（DW-47）；`emitClipboardImage` 改为 base64 编码并同步捕获粘贴位置 token（DW-49, DW-55）；`insertText` 支持按 token 映射位置插入（DW-55）。
- `src/lib/types.ts` -- `ClipboardImagePayload.bytes` 类型从 `number[]` 改为 `string`（base64），新增可选 `positionToken?: number`。
- `src/App.vue` -- `handleClipboardImagePaste` 调用 `insertText` 时透传 `payload.positionToken`。
- `src-tauri/src/commands/doc.rs` -- `save_image_asset` 参数从 `bytes: Vec<u8>` 改为 `bytes_base64: String`，解码后复用 `looks_like_image_content()` 做魔数校验（DW-48, DW-49）。
- `src/lib/source-editor-diff.test.ts` 同级新增/追加测试 -- 覆盖粘贴混合内容不 `preventDefault`、位置 token 映射逻辑的纯函数部分（若可抽取为纯函数）。
- `src-tauri/src/doc.rs` / `src-tauri/src/commands/doc.rs` 测试 -- 覆盖 `save_image_asset` 拒绝非法字节内容与 base64 解码失败路径。

## Tasks & Acceptance

**Execution:**
- [ ] `src/components/SourceEditor.vue` -- 在 `domEventHandlers.paste` 中新增"剪贴板是否存在其他可粘贴文本/HTML"判断（检查 `clipboardData.types` 是否包含 `text/plain`/`text/html` 且对应 `getData(...)` 非空），仅当不存在时才 `event.preventDefault()`；否则仍触发 `emitClipboardImage` 保存图片，但不阻止原生粘贴。 -- 落实 DW-47，避免混合内容被整体丢弃
- [ ] `src/components/SourceEditor.vue` -- 新增 token 化的粘贴位置追踪：在 `emitClipboardImage` 开头同步捕获 `view.state.selection.main.head` 存入内部 `Map<number, number>`（自增 token），在 `EditorView.updateListener` 的 `docChanged` 分支中对所有追踪中的 token 用 `update.changes.mapPos(pos)` 更新；`emit('imagePaste', ...)` payload 附带该 token。 -- 落实 DW-55 的位置捕获与映射
- [ ] `src/components/SourceEditor.vue` -- 扩展 `insertText(text, cursorOffset?, replaceSlashPrefix?, positionToken?)`：当传入 `positionToken` 且在追踪 Map 中命中时，使用映射后的位置作为插入 `from`/`to`（折叠选区），插入完成后从 Map 中删除该 token；未命中或未传入时行为与现状完全一致（读取当前选区）。 -- 落实 DW-55 的插入点使用
- [ ] `src/components/SourceEditor.vue` -- `emitClipboardImage` 将 `bytes: Array.from(new Uint8Array(buffer))` 改为对 `buffer` 做分块 base64 编码（避免超大 `Uint8Array` 展开成 arguments 触发 `btoa`/调用栈限制），赋值给 `payload.bytes: string`。 -- 落实 DW-49
- [ ] `src/lib/types.ts` -- `ClipboardImagePayload.bytes` 类型改为 `string`；新增可选字段 `positionToken?: number`。 -- 支撑 DW-49、DW-55 的类型契约
- [ ] `src/App.vue` -- `handleClipboardImagePaste` 中 `invoke('save_image_asset', { targetDir, filename: filenameForAsset, bytes: payload.bytes })` 的调用保持字段名一致（前端 camelCase `bytes` 映射到 Rust 侧 `bytes_base64`，通过 Tauri 的 `#[serde(rename)]` 或显式重命名保持前端字段名不变）；`insertText` 调用改为 `sourceEditorRef.value?.insertText(..., undefined, false, payload.positionToken)`。 -- 落实 DW-55 的调用侧改动，同时不破坏 DW-49 的 IPC 字段命名
- [ ] `src-tauri/src/commands/doc.rs` -- `save_image_asset` 新增/调整参数为 base64 字符串，函数体内先用 `base64::engine::general_purpose::STANDARD.decode(...)` 解码，解码失败返回 `CmdResult::failure("ERR_INVALID_IMAGE_DATA".to_string())`；解码成功后，用 `looks_like_image_content(std::path::Path::new(&filename), &bytes)` 校验，失败返回 `CmdResult::failure("ERR_UNSUPPORTED_IMAGE_TYPE".to_string())`；校验通过后再调用 `doc::save_binary_asset_to_dir`。 -- 落实 DW-48、DW-49
- [ ] `src-tauri/src/commands/doc.rs` -- 为 `save_image_asset` 新增单测：合法 PNG 字节的 base64 通过并写盘成功；非法字节（魔数不匹配）的合法 base64 被拒绝且不写盘；非法 base64 字符串被拒绝且不 panic。 -- 覆盖 I/O 矩阵中的后端校验场景
- [ ] `src/lib/source-editor-diff.test.ts` 同目录新增测试文件（如适用，抽取粘贴混合内容判断为可单测的纯函数） -- 覆盖 I/O 矩阵中"图片+文本混合粘贴不应 preventDefault"的判定逻辑

**Acceptance Criteria:**
- Given 剪贴板同时含受支持图片与纯文本，when 用户执行粘贴，then `paste` 事件未被 `preventDefault()`，图片仍异步保存并在保存完成后插入 Markdown 引用。
- Given `save_image_asset` 收到能通过 base64 解码但字节内容不是合法 PNG/JPEG 魔数的数据，when 命令执行，then 返回失败结果且目标目录中未生成任何新文件。
- Given 用户粘贴图片后、在 `save_image_asset` resolve 前继续在文档其他位置输入文本，when 保存完成，then 图片 Markdown 引用被插入到粘贴发生时光标所在位置映射后的正确位置，而非 resolve 时的当前光标位置。
- Given 现有斜杠命令模板插入等未传 `positionToken` 的 `insertText` 调用路径，when 插入触发，then 行为与改动前完全一致（无回归）。

## Design Notes

**混合内容判断依据：** `ClipboardEvent.clipboardData.types` 是浏览器/WebView 提供的剪贴板 MIME 类型列表；判断"是否存在其他可粘贴内容"用 `types.includes('text/plain') || types.includes('text/html')` 且对应 `getData(type)` 非空字符串即可，无需解析具体内容。

**位置映射示例（CodeMirror）：**
```ts
// 捕获（粘贴发生的瞬间，同步）
const token = ++positionTokenSeq
trackedPositions.set(token, view.state.selection.main.head)

// 映射（每次文档变更时，在 updateListener 内）
if (update.docChanged) {
  for (const [tok, pos] of trackedPositions) {
    trackedPositions.set(tok, update.changes.mapPos(pos))
  }
}

// 使用（save_image_asset resolve 后）
const pos = trackedPositions.get(token)
trackedPositions.delete(token)
```

**base64 分块编码：** 避免 `String.fromCharCode(...largeArray)` 因参数个数超限而抛错，按固定块大小（如 0x8000）迭代拼接后再 `btoa`。

## Spec Change Log

- 2026-08-02：完成前端混合内容放行、粘贴位置 token 映射、base64 传输、后端 base64 解码与图片内容校验，并补充前后端单元测试。

## Review Triage Log

### 2026-08-02 — Review pass
- intent_gap: 1: (high 1)
- bad_spec: 0
- patch: 2: (high 1, low 1)
- defer: 0
- reject: 0
- addressed_findings:
  - none

Findings this pass (Blind Hunter + Edge Case Hunter, deduplicated):

1. **[high] intent_gap** — The `<intent-contract>` Approach clause explicitly commits to: when the clipboard carries a supported image *plus* other pasteable `text/plain`/`text/html`, do not `preventDefault()`, and "图片仍照常异步保存并插入引用" (the image is still saved asynchronously as usual and its Markdown reference still inserted). Implemented literally, this produces duplicated/garbage content for the extremely common real-world clipboard shape of "image + accompanying URL/HTML" (e.g. copying an image from a browser, Word, Excel, Slack): the browser's native paste inserts the raw text/HTML/URL representation into the document, **and** the async flow separately inserts `![Image](...)` afterward — both land in the document. Re-reading the original bundle intent verbatim ("only preventDefault/consume the image portion of a clipboard payload when no other pasteable text/HTML content is present") supports a different, arguably more correct resolution: when other pasteable content is present, do not *consume* the image portion at all (skip `emitClipboardImage` entirely, let native paste alone proceed) — i.e. the opposite of what this spec's Approach clause committed to. This is a genuine intent resolution baked into the read-only `<intent-contract>` block itself (not merely a downstream elaboration), so it cannot be corrected without human input on which behavior is actually wanted for the mixed-content case (skip image entirely vs. keep dual-insert vs. some third resolution such as suppressing native paste of the text/HTML mime types specifically while still inserting the image). All code changes for this pass have been reverted; per workflow rules, no code fix is applied while an intent_gap exists.
2. **[high] patch (moot this pass — cascaded under intent_gap)** — Paste-position tracking (`trackedPastePositions`, mapped via `update.changes.mapPos` on every `docChanged`) was not cleared when the editor's `modelValue` is externally replaced wholesale (e.g. opening a different file while a clipboard-image save is still in flight). `mapPos` clamps into the new document's bounds rather than rejecting the stale token, so a pending image insertion could land at an arbitrary, unrelated position in a newly opened, unrelated document. Would need an explicit `trackedPastePositions.clear()` on external full-document replacement, in addition to the existing `onUnmounted` clear.
3. **[low] patch (moot this pass — cascaded under intent_gap)** — `trackedPastePositions` entries were never removed when `save_image_asset` failed or the `invoke` call threw (only the happy path in `insertText` deletes the token), leaking a stale map entry that is remapped on every future document change indefinitely.


## Verification

**Commands:**
- `npx vue-tsc --noEmit` -- expected: 无类型错误
- `node --test src/lib/source-editor-diff.test.ts` (以及本次新增的相关 `.test.ts` 文件) -- expected: 全部通过
- `cargo test --manifest-path src-tauri/Cargo.toml` -- expected: 全部通过，含新增的 `save_image_asset` 校验测试
- `npm run test:e2e -- e2e/story-7-1.spec.ts`（若存在覆盖粘贴图片流程的 e2e 用例） -- expected: 全部通过

**Manual checks (if no CLI):**
- 检查 `src/App.vue` 中 `invoke('save_image_asset', ...)` 调用的字段名与 `src-tauri/src/commands/doc.rs` 的参数名（含 Tauri 自动 camelCase 转换）是否匹配，避免运行时因参数名不一致而调用失败。

## Auto Run Result

Status: blocked

Blocking condition: intent gap in intent contract

Details:
- All four sub-fixes (DW-47 mixed-content paste, DW-48 backend magic-byte validation, DW-49 base64 IPC payload, DW-55 paste-position mapping) were implemented and verified passing (`npx vue-tsc --noEmit`, `node --test` for the new/updated `.test.ts` files, `cargo test --manifest-path src-tauri/Cargo.toml`) before the review pass surfaced a genuine intent gap in the DW-47 resolution baked into this spec's read-only `<intent-contract>` Approach clause.
- The `<intent-contract>` commits to: when the clipboard has an image plus other pasteable text/HTML, skip `preventDefault()` **and still** asynchronously save the image and insert its Markdown reference. Independent review (Blind Hunter + Edge Case Hunter) found this produces duplicated/garbage content for the common real-world case of "image + accompanying URL/HTML" clipboard payloads (browser/Office/Slack "copy image" clipboards typically carry both). Re-reading the original bundle intent verbatim — "only preventDefault/consume the image portion of a clipboard payload when no other pasteable text/HTML content is present" — supports a different resolution: skip consuming/inserting the image entirely when other pasteable content is present, rather than doing both. Because this resolution is inside `<intent-contract>` (not a downstream elaboration), workflow rules require HALTing rather than silently re-resolving it.
- All code changes for this pass have been reverted to the baseline revision (`8d37acdb84a39772d9cd88851e368f65eeedea11`); the working tree contains no implementation diff besides this spec file itself. Tasks & Acceptance checkboxes have been reset to unchecked.
- Two additional lower/related findings were surfaced but are moot this pass per the intent_gap cascade (not fixed, not deferred to the ledger — they will need re-evaluation once the intent gap is resolved and implementation is re-derived):
  - Paste-position tracking (`trackedPastePositions`) was not cleared when the editor's document is externally replaced wholesale (e.g. opening a different file while a clipboard-image save is in flight), risking the mapped position landing in an unrelated document (high severity).
  - Paste-position tokens were not released when `save_image_asset` failed or `invoke` threw, leaking map entries (low severity).
- **Human decision needed:** which of the following should the mixed-content (image + other pasteable text/HTML) case actually do?
  1. Skip image handling entirely (do not call `emitClipboardImage`, do not insert Markdown reference) — let native paste alone proceed, matching the literal original bundle wording most closely.
  2. Keep the current dual-behavior (native text/HTML paste + async image Markdown insertion), accepting the duplication as a known trade-off.
  3. Some other explicit resolution (e.g. suppress only the text/html mime types that would visually duplicate, or only skip when the pasted text looks like a raw data URL/base64 image marker).
- No commit was made; the working tree matches baseline aside from this spec document.
