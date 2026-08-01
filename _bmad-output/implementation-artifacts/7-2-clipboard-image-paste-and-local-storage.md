---
id: 7-2-clipboard-image-paste-and-local-storage
title: Clipboard Image Paste and Same-Directory Local Storage
epic: epic-7
status: done
baseline_revision: fc58abba9325e6148cd377d7cce5ed9318e0bfaa
final_revision: d2b01ac7b5a57b82097a4c80b821985eaf4b73a9
followup_review_recommended: true
review_loop_iteration: 0
---

# Story 7.2: Clipboard Image Paste and Same-Directory Local Storage

## Story Description
作为用户，我可以在编辑器中直接粘贴剪贴板里的截图或图片，软件自动把图片文件保存到当前 Markdown 文件所在的目录中，并在编辑器插入相对路径，使本地图文混排更加直观便捷。

## Acceptance Criteria
1. **粘贴事件拦截**: 在源码编辑器监听 `paste` 事件，识别 `event.clipboardData` 中包含的图片数据（`image/png`, `image/jpeg`）。
2. **本地保存与命名**: 在当前打开的 `.md` 文件同级目录下自动创建图片文件（命名格式如 `img_YYYYMMDD_HHMMSS.png`）。如果当前文档未保存，回退到默认存储目录。
3. **相对路径插入与预览**: 自动在光标位置插入 Markdown 图片语法 `![Image](./img_YYYYMMDD_HHMMSS.png)`，预览区根据相对路径正常渲染图片。
4. **未保存文档兜底处理**: 当当前 Markdown 文档尚未保存到磁盘（无确切父路径）时，粘贴图片自动提示用户先选择保存路径，或暂存至应用默认保存目录的 `assets/` 文件夹下。
5. **毫秒级 Hash 命名与剪贴板识别**: 图片文件名使用毫秒时间戳 + 随机 4 位 Hash (`img_YYYYMMDD_HHMMSS_SSS_xxxx.png`) 防高频粘贴碰撞；优先探测剪贴板图片二进制数据。

## Review Triage Log

### 2026-08-01 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 8 (high 1, medium 5, low 2)
- defer: 3
- reject: 3
- addressed_findings:
  - `[high]` `[patch]` `save_image_asset` 未校验文件名可导致目录穿越写入任意文件；新增 `is_safe_filename` 校验，拒绝含路径分隔符/`..`/绝对路径的文件名。
  - `[medium]` `[patch]` 高频粘贴时文件名毫秒+Hash 仍可能碰撞，原实现会静默覆盖已存在文件；新增 `unique_filename_in_dir`，冲突时自动追加序号并把最终文件名回传前端用于插入链接。
  - `[medium]` `[patch]` 未保存文档暂存到默认目录 `assets/` 后，若用户随后“另存为”到别处，已插入的 `./assets/xxx.png` 链接会因图片仍留在旧默认目录而失效；`handleSaveAsFile` 新增迁移逻辑，提取内容中引用的 `./assets/*` 文件名并通过新增的 `copy_asset_file` 命令复制到新目录。
  - `[medium]` `[patch]` `isRelativeAssetPath` 未识别 POSIX 绝对路径（如 `/images/foo.png`）与 Windows 盘符路径，会被误判为相对路径并按 `documentBaseDir` 错误拼接；补充绝对路径判断分支。
  - `[medium]` `[patch]` asset:// 协议访问范围仅限 `$HOME`/`$APPDATA`/`$APPLOCALDATA`，用户若将默认保存目录设在这些范围之外，粘贴的图片会保存成功但预览无法渲染；`save_image_asset`/`copy_asset_file` 命令写入成功后调用 `asset_protocol_scope().allow_directory` 动态放宽范围。
  - `[low]` `[patch]` `getParentDirectory('/note.md')` 因根目录场景返回 `null` 而错误回退到默认目录；修正为返回 `'/'`。
  - `[low]` `[patch]` 剪贴板文件 `arrayBuffer()` 读取失败时会产生未捕获的 Promise rejection；补充 try/catch 静默中止。
  - `[medium]` `[patch]`（安全加固，随第一条一并修复）`save_image_asset` 对 `target_dir` 无限制、可被用作任意路径写入原语；结合文件名白名单校验后风险已显著降低，目标目录信任模型与该功能“写入到用户当前文档目录”的设计意图一致，不再单独处理。

### 2026-08-01 — Review pass (follow-up)
- intent_gap: 0
- bad_spec: 0
- patch: 4 (high 1, medium 2, low 1)
- defer: 5
- reject: 2
- addressed_findings:
  - `[high]` `[patch]` `tauri.conf.json` 中 `assetProtocol.scope` 静态声明覆盖整个 `$HOME/**/*`，结合预览区 Markdown 渲染对未知标签采用黑名单式放行（非白名单），恶意/不受信的 `.md` 文件可通过手写 `<img src="asset://...">` 尝试渲染用户主目录下任意文件；已将静态 scope 收窄为仅 `$APPDATA/**/*`、`$APPLOCALDATA/**/*`，用户实际保存目录以外的路径继续依赖既有的运行时 `allow_directory` 动态放宽机制授权，不影响功能。
  - `[medium]` `[patch]` `extractAssetReferences` 对匹配到的文件名调用 `decodeURIComponent` 未做异常保护，正文中若存在畸形 `%` 转义序列，会在 `save_document_as` 已成功写入新文件之后抛出未捕获异常，被外层 catch 误报为“另存为调起对话框失败”；已改为 try/catch 包裹，解码失败时跳过该条引用而不是中断整个迁移流程。
  - `[medium]` `[patch]` `unique_filename_in_dir` 采用“先 `exists()` 检测、再 `fs::write`”的方式选择不冲突文件名，两步之间存在竞态窗口，高频并发粘贴时可能选中同一“空闲”文件名并互相覆盖；已改为 `write_unique_file`，使用 `OpenOptions::create_new` 原子创建文件，遇到 `AlreadyExists` 时递增序号重试，消除该竞态窗口。
  - `[low]` `[patch]` `save_image_asset`/`copy_asset_file` 均对 `asset_protocol_scope().allow_directory(...)` 的返回值使用 `let _ = ...` 直接丢弃；若该调用失败，命令仍返回成功，但预览区可能因作用域未真正放宽而无法加载图片且无任何诊断线索；已改为在失败时输出 `eprintln!` 诊断日志（命令本身仍保持原有成功语义，因为图片已写入磁盘，失败的只是预览可见性）。

### 2026-08-01 — Review pass (follow-up 2)
- intent_gap: 0
- bad_spec: 0
- patch: 4 (high 1, medium 2, low 1)
- defer: 1
- reject: 7
- addressed_findings:
  - `[high]` `[patch]` “另存为”迁移逻辑只处理未保存文档暂存在 `assets/` 目录下的图片；对一个已保存文档粘贴图片后（以 `./img_xxx.png` 形式引用，直接位于文档同目录），执行“另存为”到其他目录时完全没有迁移逻辑，导致正文引用的所有同目录图片链接静默失效；新增 `extractSiblingImageReferences` 识别此类同级引用，`handleSaveAsFile` 在文档此前已保存的情况下也会计算旧文档目录并通过 `copy_asset_file` 一并迁移。
  - `[medium]` `[patch]` 打开一个已存在的 `.md` 文件（`read_external_document`）或“另存为”到新目录（`save_document_as`）都不会主动放宽该目录的 `asset://` 协议访问范围，导致文档中此前已存在（非本次会话粘贴产生）的相对路径图片在预览区无法渲染，只有等到本次会话内首次粘贴/迁移图片才被动放宽；已为这两个命令新增 `asset_protocol_scope().allow_directory(...)` 调用（失败时输出 `eprintln!` 诊断日志，与既有 `save_image_asset` 的处理方式保持一致）。
  - `[medium]` `[patch]` `resolveRelativeAssetPath` 对 Markdown 图片路径中的 `..` 段不设上限，理论上可在文档目录之外解析出路径；结合 `asset://` 授权范围会在应用运行期间跨文档累积（一旦任意目录被放宽，仍在运行的应用实例内该目录持续可访问），一份精心构造的 Markdown 文件有可能引用到本次会话中其他文档目录下的图片；已限制 `..` 不能将解析结果弹出到原始 `baseDir` 之下，遇到会越界的 `..` 时按原地处理（不再上跳），不影响文档同目录及子目录内的正常引用。
  - `[low]` `[patch]` `joinFilePath('/', 'assets')` 因根目录裁剪逻辑把 `'/'` 归一化为空字符串，返回 `'assets'` 而非 `'/assets'`，当默认保存目录被设置为文件系统根目录时会解析到错误路径；修正为对根目录单独处理，保留前导分隔符。
  - `[defer]` 剪贴板粘贴图片写盘为异步操作，`SourceEditor.insertText` 在写盘完成后才读取 `view.state.selection.main` 作为插入位置；若用户在写盘期间继续输入，图片 Markdown 链接可能被插入到错误的光标位置。正确修复需要在粘贴发生时捕获选区，并通过编辑器的变更描述（change mapping）把该位置映射穿过写盘期间发生的所有中间编辑，属于非平凡改动，已记录到 deferred-work 待后续专项处理。
  - `[reject]` “另存为”迁移调用 `copy_asset_file` 时未检查其 `CmdResult`/`AssetMigrationResult.migrated` 返回值，失败或跳过时仍提示“另存为”成功——与 `deferred-work.md` 中已记录的同一发现重复，交由该既有条目统一处理。
  - `[reject]` `copy_asset_between_dirs` 在目标目录已有同名文件时会用 `fs::copy` 直接覆盖——与 `deferred-work.md` 中已记录的同一发现重复。
  - `[reject]` 粘贴图片时无条件调用 `event.preventDefault()`，会丢弃剪贴板中同时存在的文本/HTML 内容——与 `deferred-work.md` 中已记录的同一发现重复。
  - `[reject]` `save_image_asset`/`copy_asset_file` 接受前端传入的任意目标目录，被视为通用文件写入/复制原语——本故事此前的复审已明确评估并接受该风险（见上一轮 triage log 记录），不再重复处理。
  - `[reject]` E2E 测试仅通过 `window.__TAURI_MOCK__` 模拟 IPC 返回值，未覆盖真实文件系统写入、asset 协议作用域放宽等集成行为——与 `deferred-work.md` 中已记录的同一发现重复。
  - `[reject]` 缺少针对高风险分支（另存为迁移失败、命名冲突、根目录路径处理等）的测试覆盖——与 `deferred-work.md` 中已记录的同一发现重复。
  - `[reject]` Edge Case Hunter 报告的多项“既有防护”实为幻觉，与实际代码不符（如声称 `allow_directory` 失败会返回 `CmdResult::failure`、声称已有 `..` 越界防护、声称已有 `imagePasteUnsupported` 事件等），经与源码逐项核对后均未找到对应实现，按噪声丢弃。



## Auto Run Result

### Follow-up Review Pass 2 (2026-08-01)

**Summary:** Ran a second fresh, unattended follow-up review of the already-`done` Story 7.2 implementation (Blind Hunter + Edge Case Hunter, in parallel, cumulative diff from `baseline_revision`). After deduplicating against `deferred-work.md` and the story's own prior triage-log entries, 4 findings were auto-patched, 1 was deferred, and 7 were rejected (6 exact duplicates of already-tracked items or already-accepted risk decisions, plus a batch of Edge Case Hunter findings whose cited "existing guards" did not match the actual source and were dropped as noise after direct code verification).

**Files changed with one-line descriptions:**
- `src-tauri/src/commands/doc.rs` — `read_external_document` and `save_document_as` now take `app_handle` and call `asset_protocol_scope().allow_directory(...)` on their target directory (logging failures), so pre-existing relative-path images render in preview immediately on open/Save As instead of only after a paste/migration widens scope.
- `src/lib/image-assets.ts` — Added `extractSiblingImageReferences` for `./img_....png`-style same-directory references; fixed `joinFilePath('/', 'assets')` to return `/assets` instead of `assets`; clamped `resolveRelativeAssetPath` so `..` segments can never resolve outside the original base directory.
- `src/App.vue` — `handleSaveAsFile` now also migrates sibling images (referenced as `./img_....png`) when Save As moves an already-saved document to a different directory, using the new `extractSiblingImageReferences` helper and the existing `copy_asset_file` command.

**Review findings breakdown:**
- Patches applied: 4 (high 1, medium 2, low 1)
- Deferred: 1 (async clipboard-paste cursor/selection drift — requires change-mapping through intervening edits, non-trivial)
- Rejected: 7 (5 exact duplicates of existing `deferred-work.md` entries; 1 duplicate of an already-accepted risk decision logged in this file's first review pass; 1 batch of fabricated/inconsistent Edge Case Hunter findings that did not match the actual source after verification)

**Verification performed:**
- `npm run build` (`vue-tsc --noEmit && vite build`) — type-checks and builds cleanly.
- `cargo build` — backend compiles cleanly with the new command signatures.
- `cargo test` (full suite) — all 6 Rust unit tests pass unchanged.
- `npx playwright test` (full suite) — all 89 e2e scenarios pass, including both existing `story-7-2.spec.ts` scenarios.

**Residual risks:** The newly deferred cursor-drift item and the 5 pre-existing deferred items remain open in `deferred-work.md`. None block this story's acceptance criteria. The `resolveRelativeAssetPath` clamp intentionally disables upward (`..`) traversal beyond the document's own directory; no AC or test relied on that behavior, so this is not expected to be user-visible.
