---
title: 'Markdown fence-info and angle-bracket link-destination parsing fixes'
type: 'bugfix'
created: '2026-08-04'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
context: []
warnings: []
baseline_revision: 'a74a4b0c1c3d1c9eeed6cf4c9a5549a633ee660a'
final_revision: '0d7392b06cf04f9b086294a942b0dae2271a3dc6'
---

<intent-contract>

## Intent

**Problem:** In `src/lib/image-assets.ts`, `extractAssetReferences`/`extractSiblingImageReferences` don't recognize CommonMark's angle-bracket link destination form (e.g. `![alt](<./assets/pic.png>)`), silently skipping such references during "Save As" asset migration; and `getFenceInfo` accepts a backtick-run line as a valid fence opener even when its info string contains a backtick, which CommonMark forbids, causing incorrect blanking/mismatching of subsequent content in `stripFencedCodeBlocks`/`mapOutsideFencedCodeBlocks`.

**Approach:** Extend the regex patterns in both extraction functions to also match the `<...>`-wrapped destination form for inline (`![alt](<dest>)`) and reference-style (`[label]: <dest>`) links. Fix `getFenceInfo` to return `null` when `char === '`'` and `rest` contains a backtick, per the CommonMark fenced-code-block spec.

## Boundaries & Constraints

**Always:** Preserve all existing supported forms and their current behavior (plain `assets/...`/`./...`, `<img>` tags, reference-style, titled links, query/fragment stripping, path-traversal rejection). Angle-bracket destinations must go through the same decode/validation path (`decodeURIComponent`, `stripQueryAndFragment`, plain-filename check) as other forms. The backtick-in-info-string rejection applies only to backtick fences (`` ` ``); tilde fences (`~`) are unaffected by this rule and keep their current behavior.

**Block If:** N/A — both fixes are fully specified by CommonMark and the ledger entries; no ambiguity to resolve with a human.

**Never:** Do not add angle-bracket destination support to `<img src=...>` (HTML attribute syntax has no such form). Do not change fence-matching behavior for tilde (`~~~`) fences. Do not touch `replaceAssetReferenceFilename`/`replaceSiblingImageReferenceFilename` beyond what's needed for the new angle-bracket form to round-trip through existing rewrite logic (only if directly required to keep extraction and replacement consistent — otherwise leave replacement untouched).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Angle-bracket asset ref | `![alt](<./assets/pic.png>)` | `extractAssetReferences` returns `['pic.png']` | — |
| Angle-bracket asset ref, no dot-slash | `![alt](<assets/pic.png>)` | `extractAssetReferences` returns `['pic.png']` | — |
| Angle-bracket sibling ref | `![alt](<./pic.png>)` | `extractSiblingImageReferences` returns `['pic.png']` | — |
| Angle-bracket reference-style | `[shot]: <./assets/pic.png>` | `extractAssetReferences` returns `['pic.png']` | — |
| Angle-bracket with title | `![alt](<./assets/pic.png> "标题")` | `extractAssetReferences` returns `['pic.png']` | — |
| Angle-bracket path traversal | `![alt](<./assets/../secret.png>)` | Rejected — not included in output | Silently skipped, same as unbracketed form |
| Angle-bracket inside fenced code | fenced block containing `![alt](<./assets/example.png>)`, followed by real `![alt](./assets/real.png)` | Only `real.png` extracted | Fenced content ignored as before |
| Backtick fence with backtick in info string | `` ```bad`info `` followed by real content and no matching closer | `getFenceInfo` returns `null` for that line; line is treated as ordinary text, not a fence opener | Subsequent real asset references on later lines are still extracted (not blanked) |
| Backtick fence, valid info string | `` ```md `` | `getFenceInfo` still returns fence info as before (unaffected) | — |
| Tilde fence with backtick in info string | `` ~~~info`with`backtick `` | `getFenceInfo` still returns fence info as before (tilde fences unaffected by this rule) | — |

</intent-contract>

## Code Map

- `src/lib/image-assets.ts` -- `getFenceInfo` (fence-opener validation), `extractAssetReferences`/`extractSiblingImageReferences` (regex-based reference extraction), `replaceAssetReferenceFilename`/`replaceSiblingImageReferenceFilename` (regex-based reference rewriting, must recognize the same new syntax the extractors recognize so migrated/renamed assets don't leave stale references)
- `src/lib/image-assets.test.ts` -- existing coverage for extraction, rewriting, and fence-stripping behavior; add new cases here

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/image-assets.ts` -- in `getFenceInfo`, after computing `rest`, return `null` when `char === '`'` and `rest.includes('`')` -- implements CommonMark's rule that a backtick-fence info string must not contain a backtick (DW-106)
- [x] `src/lib/image-assets.ts` -- add an angle-bracket-destination pattern to `extractAssetReferences`'s `patterns` array covering `![alt](<(./)?assets/NAME>)` (optional title after `>`) and `[label]: <(./)?assets/NAME>` reference-style form (DW-103)
- [x] `src/lib/image-assets.ts` -- add the equivalent angle-bracket-destination pattern to `extractSiblingImageReferences`'s `patterns` array covering `![alt](<./NAME>)` and `[label]: <./NAME>` (DW-103)
- [x] `src/lib/image-assets.ts` -- extend `replaceAssetReferenceFilename` to also match and rewrite the angle-bracket inline (`![alt](<(./)?assets/OLD>)`) and reference-style (`[label]: <(./)?assets/OLD>`) forms, so a filename rename triggered after "Save As" migration correctly updates angle-bracket references instead of leaving them pointing at the pre-rename filename (closes the gap: extraction now recognizes this syntax, so the file gets migrated, but without this task the rewritten doc could silently point at a filename that no longer exists)
- [x] `src/lib/image-assets.ts` -- extend `replaceSiblingImageReferenceFilename` with the equivalent angle-bracket inline (`![alt](<./OLD>)`) and reference-style (`[label]: <./OLD>`) rewrite support, for the same reason as above
- [x] `src/lib/image-assets.test.ts` -- add tests for the I/O Matrix scenarios (angle-bracket inline/reference-style extraction for both functions, path-traversal rejection, fenced-code interaction, and the backtick-in-fence-info regression), PLUS: angle-bracket rewrite coverage for both `replaceAssetReferenceFilename` and `replaceSiblingImageReferenceFilename` (inline and reference-style forms), query-string/fragment handling on an angle-bracket reference, percent-encoded filename handling on an angle-bracket reference, and a backtick-in-fence-info case where a real closing fence appears later in the document (verify the bad opener line is not mistaken for degenerate blank-fence state and the later real fence still round-trips correctly)

**Acceptance Criteria:**
- Given markdown containing `![alt](<./assets/pic.png>)`, when `extractAssetReferences` runs, then `pic.png` is in the result.
- Given markdown containing `![alt](<./pic.png>)`, when `extractSiblingImageReferences` runs, then `pic.png` is in the result.
- Given markdown containing `![alt](<./assets/old.png>)`, when `replaceAssetReferenceFilename(markdown, 'old.png', 'new.png')` runs, then the result contains `![alt](<./assets/new.png>)` (or an equivalent valid angle-bracket rewrite) and no longer contains `old.png`.
- Given markdown containing `![alt](<./old.png>)`, when `replaceSiblingImageReferenceFilename(markdown, 'old.png', 'new.png')` runs, then the result contains `![alt](<./new.png>)` and no longer contains `old.png`.
- Given a line `` ```bad`info `` with no matching closing fence, when `stripFencedCodeBlocks` (via `extractAssetReferences`/`extractSiblingImageReferences`) processes markdown containing that line followed by a real asset reference, then the real reference is still extracted (not blanked out as if inside a fenced block).
- Given the existing test suite, when run after these changes, then all previously passing tests still pass unmodified.

## Spec Change Log

### 2026-08-04 — Review pass 1 (bad_spec)
- Trigger: Blind Hunter found that extending `extractAssetReferences`/`extractSiblingImageReferences` to recognize angle-bracket destinations, without a matching extension to `replaceAssetReferenceFilename`/`replaceSiblingImageReferenceFilename`, creates a new silent-breakage path: an angle-bracket-referenced asset now gets included in "Save As" migration (good, fixes DW-103), but if the migration renames the file on a collision, the rewrite step can't find/update the angle-bracket reference text, leaving the document pointing at a filename that no longer exists.
- Amendment: Added explicit tasks to extend both replace functions with angle-bracket-aware regex (inline + reference-style), and broadened the test task to cover rewrite behavior, query/fragment handling, percent-encoding, and a fence case with a later real closing fence.
- Known-bad state avoided: extraction/replacement asymmetry that silently corrupts asset references after a Save-As rename collision.
- KEEP: the original `getFenceInfo` backtick-rejection fix and the extraction regex approach (angle-bracket capture up to `>`, routed through the existing decode/strip-query-fragment/path-traversal validation) were correct and are unchanged by this amendment — re-derive them as-is.

## Review Triage Log

### 2026-08-04 — Review pass
- intent_gap: 0
- bad_spec: 1 (high 1, medium 0, low 0)
- patch: 5 (high 0, medium 2, low 3)
- defer: 1 (high 0, medium 0, low 1)
- reject: 1 (high 0, medium 0, low 1)
- addressed_findings:
  - `[high]` `[bad_spec]` Extraction now recognizes angle-bracket asset/sibling references but the replace functions don't, risking silent broken links after a rename-on-collision during "Save As" migration — spec amended to add explicit rewrite tasks and re-derivation triggered.

### 2026-08-04 — Review pass 2
- intent_gap: 0
- bad_spec: 0
- patch: 4 (high 0, medium 2, low 2)
- defer: 1 (high 0, medium 0, low 1)
- reject: 6 (high 0, medium 0, low 6)
- addressed_findings:
  - `[medium]` `[patch]` Edge Case Hunter found the new angle-bracket capture groups (`[^>]+?`/`[^>]+`) didn't exclude `\r`/`\n`, so a malformed multi-line `<...>` destination could swallow intervening document content as part of the "filename" — fixed by changing all four new capture groups to `[^>\r\n]`, and added a regression test confirming a broken multi-line angle-bracket link is ignored while a real reference on the next line is still extracted.
  - `[medium]` `[patch]` Blind Hunter found no test coverage for uppercase/lowercase percent-encoded filenames on the new angle-bracket rewrite path (the most error-prone new branch) — added a dedicated test confirming both cases rewrite correctly.
  - `[low]` `[patch]` Blind Hunter found the malformed-backtick-fence fix was only exercised through the asset-extraction helper, with no regression coverage via the sibling-extraction helper (which shares the same `getFenceInfo` logic) — added a sibling-specific test.
  - `[low]` `[patch]` Blind Hunter found no coverage for titled angle-bracket reference-style definitions (`[id]: <...> "title"`) on the rewrite path, even though the new regexes are written to support a trailing title — added a test covering both the asset and sibling rewrite functions.
- deferred:
  - `[low]` Angle-bracket destinations don't support CommonMark's backslash-escaped `>` (e.g. `<./assets/foo\>.png>` for a literal `>` in a filename) on either extraction or rewrite; a real but narrow gap (filenames containing a literal `>` are extremely rare) beyond this story's explicit DW-103/DW-106 scope. Logged to the deferred-work ledger.
- rejected (working as designed / not a regression, dropped silently):
  - Angle-bracket destinations preserve raw (non-percent-encoded) spaces on rewrite, e.g. `<./assets/new name.png>` — consistent with this codebase's existing convention for the *unbracketed* form (`./assets/old name.png` is already rewritten with a raw space, not percent-encoded, in the pre-existing test suite), not a new regression.
  - A destination like `<./assets/pic.png title>` (no separating title syntax) is captured as the literal filename `pic.png title` — this is correct per CommonMark's definition of the `<...>` destination (no line endings or unescaped `<`/`>`, but spaces are allowed), just an unlikely-in-practice filename.
  - Trailing whitespace before `>` (e.g. `<./assets/pic.png >`) is captured literally — same reasoning as above, correct-per-spec parsing of an unusual input.
  - Extractor/replacer "inconsistency" for the two malformed-destination cases above — moot once those are confirmed to be correct-per-spec behavior rather than bugs.
  - Sibling helpers require the `./` prefix even inside angle brackets (no bare `<foo.png>` sibling support) while asset helpers accept bare `<assets/foo.png>` — intentional and already documented in this spec's Code Map/Tasks (mirrors the pre-existing asymmetry between the non-bracket asset and sibling patterns).

## Verification

**Commands:**
- `node --test src/lib/image-assets.test.ts` -- expected: all tests pass, including new cases
- `npx vue-tsc --noEmit` -- expected: no new type errors
## Auto Run Result

Status: done

_Appended by the bmad-loop orchestrator (missing-marker repair, #224): the session finalized this spec's frontmatter without its `## Auto Run Result` marker, so the orchestrator synthesized the result from the frontmatter and appended this section._

Synthesized by the bmad-loop orchestrator from frontmatter status `done` for story `dw-markdown-fence-linkdest-fixes` (session finalized the spec without appending its marker).
