---
title: 'Markdown 图片解析器边界扩展'
type: 'bugfix'
created: '2026-08-04'
status: 'done'
baseline_revision: 'e7fe7c2bfe9c9cc55661c8e0dbe4688da5ba7ae2'
final_revision: 'f47092a12daacae5bbb53988340c65fe8d03a18b'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** `src/lib/image-assets.ts` 中的 `extractSiblingImageReferences`（及 `src/App.vue` 中与之配对的 `replaceSiblingImageReferenceFilename`）只识别纯内联 `![alt](./filename)` 形式，未覆盖 `extractAssetReferences` 已支持的 HTML `<img>`、引用式链接、带标题内联链接形式（DW-80）；同时 `extractAssetReferences` 会把 URL 的 Query String/Fragment（如 `?raw=1`、`#frag`）当作文件名的一部分，导致迁移时找不到真实文件（DW-81）；并且会误匹配 Fenced Code Block 内部仅作示例展示的图片语法，把它当作真实资源依赖（DW-82）。

**Approach:** 在 `image-assets.ts` 中新增两个共享的内部辅助函数——一个在正则匹配前把 Fenced Code Block（```` ``` ```` / `~~~`）内容替换为空白行，另一个从候选文件名中剥离 `?`/`#` 之后的后缀——并在 `extractAssetReferences` 与重写后的 `extractSiblingImageReferences` 中复用；`extractSiblingImageReferences` 的正则集合按 `extractAssetReferences` 的模式（内联/带标题/引用式/`<img>`）改写为仅匹配 `./filename`（无子目录）形式。`App.vue` 的 `replaceSiblingImageReferenceFilename` 同步扩展匹配形式，保持“抽取到的引用”与“重写时能定位的引用”一致，避免抽取到但重命名后留下失效链接。

## Boundaries & Constraints

**Always:**
- Fenced code block 的开合围栏识别遵循 CommonMark 基本规则：围栏行前最多 3 个空格缩进，使用 ` ``` ` 或 `~~~`（3 个及以上同种字符），闭合围栏字符数需 ≥ 开启围栏；块内的所有行（含开合围栏行本身）在被扫描前替换为等长的空白行，以保留原有行号供 `^...$`（`m` 标志）引用式正则继续按行匹配文档其余部分。
- Query String（`?...`）与 Fragment（`#...`）的剥离发生在 `decodeURIComponent` 之前，且只依据候选原始（尚未解码）字符串中第一次出现的字面 `?` 或 `#`；被百分号编码的 `%3F`/`%23` 视为文件名字符的一部分，不参与剥离判断。
- `extractSiblingImageReferences` 新增的 `<img>`、引用式、带标题内联表单只接受不含 `/`、`\` 的裸文件名（即同级目录直接子项），与既有内联表单的“仅同级、无子目录”约束保持一致。
- `extractAssetReferences` 与 `extractSiblingImageReferences` 现有的路径穿越拒绝逻辑（拒绝 `..`、含 `/`、含 `\` 的候选）与百分号解码失败时跳过该候选的行为保持不变。
- `replaceSiblingImageReferenceFilename` 新增的匹配形式需覆盖原始文件名与 `encodeURIComponent` 编码后两种拼写，与 `replaceAssetReferenceFilename` 现有写法一致。

**Block If:** 无——所有改动都是可由代理独立完成的纯函数级解析器修复，不涉及需要人类决策的产品/合同/凭据事项。

**Never:**
- 不实现完整的 CommonMark 解析器；缩进代码块（4 空格）、HTML 注释块等其它排除示例的写法不在本故事范围内。
- 不改变 `extractAssetReferences`/`extractSiblingImageReferences` 的导出签名或返回值类型（仍返回 `string[]` 文件名数组）。
- 不修改 `resolveRelativeAssetPath`、`joinFilePath`、剪贴板文件名生成等与本故事无关的函数。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sibling `<img>` tag | `<img src="./pic.png" alt="x">` | `extractSiblingImageReferences` returns `['pic.png']` | No error expected |
| Sibling reference-style link | `![alt][shot]\n\n[shot]: ./pic.png` | `extractSiblingImageReferences` returns `['pic.png']` | No error expected |
| Sibling titled inline link | `![alt](./pic.png "标题")` | `extractSiblingImageReferences` returns `['pic.png']` | No error expected |
| Asset ref with query string | `![alt](./assets/pic.png?raw=1)` | `extractAssetReferences` returns `['pic.png']` | No error expected |
| Asset ref with fragment | `<img src="./assets/pic.png#frag">` | `extractAssetReferences` returns `['pic.png']` | No error expected |
| Asset ref inside fenced code block | ` ```\n![alt](./assets/pic.png)\n``` ` (示例文档片段) | `extractAssetReferences` returns `[]` | No error expected |
| Sibling ref inside fenced code block | ` ```\n![alt](./pic.png)\n``` ` | `extractSiblingImageReferences` returns `[]` | No error expected |
| Fenced block followed by real reference | fenced block containing an image example, followed on a later line by `![alt](./assets/real.png)` outside the fence | `extractAssetReferences` returns `['real.png']` only (fenced example excluded) | No error expected |
| Sibling rename after new-form extraction | `replaceSiblingImageReferenceFilename` invoked with an `<img src="./old.png">` sibling reference and `oldFilename='old.png'`, `newFilename='new.png'` | Returns markdown with `src="./new.png"` | No error expected |

</intent-contract>

## Code Map

- `src/lib/image-assets.ts` -- home of `extractAssetReferences`, `extractSiblingImageReferences`; add shared `stripFencedCodeBlocks` and query/fragment-stripping helpers here; also the target home for the relocated, exported `escapeRegExp`, `replaceAssetReferenceFilename`, `replaceSiblingImageReferenceFilename` (moved from `src/App.vue` per the 2026-08-04 Spec Change Log entry below, so the rename/rewrite behavior is unit-testable).
- `src/lib/image-assets.test.ts` -- existing unit tests for `extractAssetReferences`; add new tests here, plus test suites for `extractSiblingImageReferences`, `replaceAssetReferenceFilename`, and `replaceSiblingImageReferenceFilename`.
- `src/App.vue` (lines ~182-240 in the pre-amendment revision) -- currently defines `escapeRegExp`, `replaceAssetReferenceFilename`, `replaceSiblingImageReferenceFilename` locally; after this amendment these three are deleted from `App.vue` and imported from `./lib/image-assets` instead. Call sites at lines ~961-988 (passed as the `replaceFilename` callback into `migrateAsset` during "Save As" asset migration) are unchanged in behavior, only the import source changes.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/image-assets.ts` -- add internal `stripFencedCodeBlocks(markdown: string): string` helper that blanks out fenced ` ``` `/`~~~` block interiors (and the fence lines themselves) line-by-line, preserving line count and non-fenced content verbatim -- fixes DW-82 for both extraction functions.
- [x] `src/lib/image-assets.ts` -- add internal `stripQueryAndFragment(rawCandidate: string): string` helper that truncates at the first literal `?` or `#` in the raw (undecoded) candidate before `decodeURIComponent` is applied -- fixes DW-81.
- [x] `src/lib/image-assets.ts` -- update `extractAssetReferences` to run `stripFencedCodeBlocks` on the input markdown before pattern matching, and apply `stripQueryAndFragment` to each raw candidate before decoding -- closes DW-81/DW-82 for asset refs.
- [x] `src/lib/image-assets.ts` -- rewrite `extractSiblingImageReferences` to (a) run `stripFencedCodeBlocks` first, (b) match inline/titled, reference-style, and `<img>` (quoted + unquoted `src`) forms restricted to a bare `./filename` (no `/`/`\` in the captured name), and (c) apply `stripQueryAndFragment` before decoding -- closes DW-80/81/82 for sibling refs.
- [x] `src/lib/image-assets.ts` -- move `escapeRegExp`, `replaceAssetReferenceFilename`, and `replaceSiblingImageReferenceFilename` here from `src/App.vue` (export all three); extend `replaceSiblingImageReferenceFilename` with reference-style and `<img>` (quoted + unquoted) replacement patterns mirroring `replaceAssetReferenceFilename`'s structure, keeping the existing raw + `encodeURIComponent` variant handling -- keeps rename coverage in sync with the newly extended extraction, avoiding stale links after "Save As" (DW-80), and makes the rename behavior directly unit-testable (resolves the 2026-08-04 Spec Change Log finding).
- [x] `src/lib/image-assets.ts` -- extend every pattern inside both `replaceAssetReferenceFilename` and `replaceSiblingImageReferenceFilename` (all four forms: plain/titled inline, reference-style, `<img>` quoted, `<img>` unquoted) to tolerate an optional literal `?query` and/or `#fragment` suffix immediately after the matched filename, and preserve that suffix verbatim in the rewritten output -- without this, a query/fragment-suffixed reference that `extractAssetReferences`/`extractSiblingImageReferences` now correctly recognizes still cannot be located and rewritten during a collision-driven rename, silently leaving a stale reference after "Save As" (bad_spec finding from the 2026-08-04 review pass).
- [x] `src/App.vue` -- delete the local `escapeRegExp`, `replaceAssetReferenceFilename`, `replaceSiblingImageReferenceFilename` definitions and import all three from `./lib/image-assets` instead; call sites (lines ~961-988) pass them into `migrateAsset` unchanged.
- [x] `src/lib/image-assets.test.ts` -- add tests for every row of the I/O & Edge-Case Matrix above (fenced-block exclusion, query/fragment stripping, and each new sibling reference form), plus a regression test that a non-fenced reference on a later line still extracts correctly when preceded by a fenced block containing a lookalike reference. Additionally add tests for `replaceAssetReferenceFilename` and `replaceSiblingImageReferenceFilename` covering: each of the four reference forms rewritten correctly; the raw + `encodeURIComponent`-encoded filename variants both rewritten; a query-suffixed reference rewritten with the suffix preserved; a fragment-suffixed reference rewritten with the suffix preserved.

**Acceptance Criteria:**
- Given a markdown document with a sibling image referenced via `<img>`, reference-style, or titled-inline syntax, when `extractSiblingImageReferences` runs, then the filename is returned exactly as it is for the existing plain-inline form.
- Given an asset or sibling image reference whose URL carries a `?query` and/or `#fragment` suffix, when either extraction function runs, then the returned filename excludes the suffix.
- Given a fenced code block (```` ``` ```` or `~~~`) containing example image markup, when either extraction function runs on the surrounding document, then no filename from inside the fence is returned, while any real reference outside the fence is still returned.
- Given a "Save As" migration where a sibling image is referenced via a newly-supported form (`<img>` or reference-style), when the document directory changes and the migrated file is renamed, then `replaceSiblingImageReferenceFilename` rewrites that reference to the new filename instead of leaving it stale.
- Given an asset or sibling image reference with a `?query`/`#fragment` suffix, when `replaceAssetReferenceFilename`/`replaceSiblingImageReferenceFilename` is invoked with the resolved base filename as `oldFilename`, then the rewritten markdown contains the new filename with the original suffix preserved unchanged.

## Verification

**Commands:**
- `node --test src/lib/image-assets.test.ts` -- expected: all `image-assets.test.ts` cases pass, including newly added ones. (Note: `npm run test` is not a defined script in `package.json`; use `node --test` directly, matching how this test file was actually run and verified.)
- `npm run build` -- expected: TypeScript compiles with no new errors (Vue app + `image-assets.ts` type-check cleanly).

**Manual checks (if no CLI):**
- After the relocation, confirm `src/App.vue` no longer defines `escapeRegExp`/`replaceAssetReferenceFilename`/`replaceSiblingImageReferenceFilename` locally and instead imports all three from `./lib/image-assets`, and that the "Save As" migration call sites (~lines 961-988 pre-amendment) still compile and behave identically (verified by `npm run build` succeeding with no type errors).

## Spec Change Log

### 2026-08-04 — Review pass 1 bad_spec amendment

- **Triggering findings:** (1) `replaceAssetReferenceFilename`/`replaceSiblingImageReferenceFilename` could not rewrite references whose URL carries a `?query` or `#fragment` suffix, even though `extractAssetReferences`/`extractSiblingImageReferences` (this story's own changes) now correctly recognize and extract the base filename from such references — a collision-driven rename during "Save As" would silently leave the on-disk-renamed file's markdown reference stale. (2) Task 6's requirement to test every I/O Matrix row (including the "Sibling rename after new-form extraction" row, which exercises `replaceSiblingImageReferenceFilename`) directly contradicted the original Verification section's statement that `replaceSiblingImageReferenceFilename` "is not directly unit-testable in isolation" because it was a private, unexported function inside the `src/App.vue` SFC.
- **Amendment:** Relocated `escapeRegExp`, `replaceAssetReferenceFilename`, and `replaceSiblingImageReferenceFilename` from `src/App.vue` into `src/lib/image-assets.ts` as exported functions, imported back into `App.vue` at their existing call sites. Extended all four matched forms in both replace functions to tolerate an optional `?query`/`#fragment` suffix, preserving it verbatim in the rewritten output. Updated Code Map, Tasks & Acceptance, and Verification accordingly; removed the "not directly unit-testable" caveat since the functions are now exported and testable like the rest of the module.
- **Known-bad state avoided:** A shipped regression where "Save As" migrations involving query/fragment-suffixed image references (which this very story taught the extractor to recognize) would copy the file under its new name but leave the markdown pointing at the old, now-missing filename — a strictly worse outcome than before this story (previously the reference was simply never migrated at all; now it is migrated but silently desynced from the document text on rename).
- **KEEP:** The `stripFencedCodeBlocks` and `stripQueryAndFragment` helpers, and the extraction-side changes to `extractAssetReferences`/`extractSiblingImageReferences`, were correct as originally implemented and must be re-derived unchanged (same behavior, same helper names/signatures). Do not re-litigate the intentional design choice — shared with the pre-existing `extractAssetReferences` reference-style pattern — of matching any `[label]: ./path` definition line without confirming the label is actually referenced by image syntax elsewhere in the document; this is accepted existing behavior, not a defect to fix in this story.

## Review Triage Log

### 2026-08-04 — Review pass
- intent_gap: 0
- bad_spec: 5 (medium 4, low 1)
- patch: 0
- defer: 5 (medium 1, low 4)
- reject: 2 (low 2)
- addressed_findings:
  - `[medium]` `[bad_spec]` `replaceAssetReferenceFilename` could not rewrite `?query`-suffixed asset references even though extraction now recognizes them — fixed by extending the pattern to tolerate and preserve an optional query suffix.
  - `[medium]` `[bad_spec]` `replaceAssetReferenceFilename` could not rewrite `#fragment`-suffixed asset references even though extraction now recognizes them — fixed the same way.
  - `[medium]` `[bad_spec]` `replaceSiblingImageReferenceFilename` could not rewrite `?query`-suffixed sibling references even though extraction now recognizes them — fixed by extending the pattern to tolerate and preserve an optional query suffix.
  - `[medium]` `[bad_spec]` `replaceSiblingImageReferenceFilename` could not rewrite `#fragment`-suffixed sibling references even though extraction now recognizes them — fixed the same way.
  - `[low]` `[bad_spec]` Task 6 required an automated test for `replaceSiblingImageReferenceFilename`'s rename behavior while the original Verification section conceded that function was not unit-testable in isolation — resolved by relocating the replace functions into `src/lib/image-assets.ts` as exported, directly testable functions.

Non-blocking findings deferred to `deferred-work.md` (pre-existing, not caused by this story): (1) `[medium]` neither replace function respects fenced code blocks during rewrite, so a filename coincidentally reused inside a documentation code example could be mutated by an unrelated real rename; (2) `[low]` inline (single-backtick) code spans are still treated as live references by both extraction functions; (3) `[low]` the reference-style pattern in both extraction functions matches any `[label]: ./path` definition line without confirming the label is used by image syntax; (4) `[low]` CommonMark angle-bracket destinations (`![alt](<./assets/pic.png>)`) are not recognized by either extraction function; (5) `[low]` both replace functions only probe the raw filename and the uppercase-hex `encodeURIComponent` variant, missing lowercase-percent-encoded spellings of the same filename.

Rejected as noise / already-declared out of scope: fence markers nested inside blockquote/list containers are not recognized by `stripFencedCodeBlocks` (explicitly excluded by this spec's own "Never — not implementing a full CommonMark parser" boundary); and `stripFencedCodeBlocks`'s Boundaries wording ("等长的空白行") vs. its Task wording ("empty string") is a cosmetic spec-text mismatch with zero behavioral difference (regex matching is line-anchored, not length-sensitive).

### 2026-08-04 — Review pass 3
- intent_gap: 0
- bad_spec: 0
- patch: 1 (low)
- defer: 1 new (low), plus numerous duplicate re-surfacings of pass-1/pass-2 defer and reject items (not re-logged)
- reject: 0 new (all non-duplicate findings were patch or defer; duplicates dropped silently)
- addressed_findings:
  - `[low]` `[patch]` The Verification section's stated command `npm run test -- image-assets` cannot run because `package.json` defines no `test` script (confirmed: `npm run test` fails with "Missing script: test"); fixed by correcting the Verification section to `node --test src/lib/image-assets.test.ts`, which was confirmed to pass all 12 cases including this story's new tests.

This pass's findings were overwhelmingly re-surfacings of items already triaged in pass 1/pass 2: replace-function fenced-code corruption, blockquote-nested fences, indented code blocks, inline code spans, reference-style definitions not confirming image usage, angle-bracket destinations, unquoted self-closing `<img/>` tags, and lowercase percent-encoding variants (already deferred or already rejected as explicitly out of scope). One genuinely new finding — `getFenceInfo` accepts a backtick-fence opener even when its info string itself contains a backtick, which CommonMark disallows — was appended to `deferred-work.md` as a new low-severity edge case. A second genuinely new finding — the spec's own Verification command (`npm run test -- image-assets`) does not work because no `test` npm script exists — was a trivially auto-fixable spec-text patch, applied directly (Verification section now points to the command actually used to confirm all tests pass). No intent_gap or bad_spec findings this pass. Review converges; finalizing.

### 2026-08-04 — Review pass 2
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 1 new (low), plus 4 duplicate re-surfacings of pass-1 defer items (not re-logged)
- reject: 2 (low 2)
- addressed_findings:
  - none

This pass's findings were dominated by re-surfacings of items already triaged in pass 1: fenced code blocks not respected during rename (already deferred), inline code spans still treated as live references (already deferred), lowercase/mixed percent-encoding variants missed by the replace functions for both asset and sibling forms (already deferred, including a "mixed encoded/raw spelling" variant of the same root cause), and blockquote-nested fences (already rejected as explicitly out of scope per this spec's own "Never" boundary). One genuinely new finding — unquoted self-closing `<img .../>` tags are neither extracted nor renamed because the trailing `/` gets folded into the captured filename and then fails the no-slash validation — was appended to `deferred-work.md` (pre-existing characteristic of the unquoted-`<img>` pattern, inherited by the newly mirrored sibling pattern). Indented (4-space) code blocks being treated as live references is rejected here as already explicitly out of scope per this spec's own `<intent-contract>` "Never" clause ("缩进代码块（4 空格）...不在本故事范围内"), which is read-only and cannot be revisited in this pass. No intent_gap or bad_spec findings this pass — the query/fragment-suffix rename fix and the function-relocation-for-testability fix from pass 1 both hold up under this second review pass. Review converges; proceeding to finalize.


## Auto Run Result

**Summary:** Follow-up (pass 3) independent review of the already-`done` "Markdown 图片解析器边界扩展" story. No code changes were required this pass — all substantive reviewer findings were duplicate re-surfacings of items already triaged and either deferred or rejected in pass 1/pass 2. One low-severity spec-text patch was applied (Verification section) and one new low-severity edge case was deferred.

**Files changed this pass:**
- `_bmad-output/implementation-artifacts/spec-12-2-markdown-asset-parser-edge-cases.md` -- corrected Verification section's stated test command from the non-functional `npm run test -- image-assets` to the working `node --test src/lib/image-assets.test.ts`; appended pass-3 Review Triage Log entry; frontmatter updated (`status: done`, `review_loop_iteration: 0`, `followup_review_recommended: false`).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- appended one new entry (backtick-fence info-string edge case in `getFenceInfo`).

**Review findings breakdown (pass 3):**
- patch: 1 low (Verification command fix, applied)
- defer: 1 new low (`getFenceInfo` accepts a backtick-fence opener whose info string itself contains a backtick, violating CommonMark's rule for backtick fences)
- reject: remaining findings were duplicates of pass-1/pass-2 defer or reject entries (fenced-code corruption during rename, blockquote-nested fences, indented code blocks, inline code spans, reference-style definitions not confirming image usage, angle-bracket destinations, unquoted self-closing `<img/>` tags, lowercase percent-encoding variants) — dropped silently per workflow rules
- intent_gap: 0, bad_spec: 0

**Verification performed:** `node --test src/lib/image-assets.test.ts` -- all 12 tests pass (confirms the actual test suite is green; the prior stated `npm run test` command was unusable since no such npm script exists). No source code was modified this pass, so `npm run build` was not re-run.

**Residual risks:** None new beyond what's already tracked in `deferred-work.md` for this story (pre-existing/inherited parser limitations: fenced-code rename corruption, blockquote-nested fences, indented code blocks, inline code spans, unconfirmed reference-style image usage, angle-bracket destinations, unquoted self-closing `<img/>`, lowercase percent-encoding, and now the new backtick-fence-info-string edge case). Review has converged across two independent follow-up passes with no code-level findings; no further follow-up review is recommended.
