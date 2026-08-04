---
title: 'Asset replace function edge cases (fenced blocks, lowercase percent-encoding, XHTML self-closing img)'
type: 'bugfix'
created: '2026-08-04'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
baseline_revision: 'd4282a662a4f1d244931673f73d5104f608a828e'
final_revision: '484244f'
---

<intent-contract>

## Intent

**Problem:** `replaceAssetReferenceFilename`/`replaceSiblingImageReferenceFilename` in `src/lib/image-assets.ts` rewrite raw, unstripped markdown (mutating filenames coincidentally reused inside fenced code examples), only match uppercase-hex percent-encoded variants (missing lowercase-percent-encoded references), and their unquoted `<img src=...>` capture (shared with the two extraction functions) swallows a trailing XHTML self-closing `/` into the filename, causing the reference to be silently dropped.

**Approach:** Add a fenced-code-block-aware wrapper so both replace functions only rewrite text outside fenced blocks (mirroring `stripFencedCodeBlocks`'s detection but preserving fenced content unchanged instead of blanking it). Extend the variant set in both replace functions with a lowercase-percent-encoded old/new pair. Exclude `/` from the unquoted-`src` character class in both extraction functions and adjust the unquoted-`src` match/lookahead in both replace functions so a trailing self-closing `/` before `>` no longer gets captured or blocks the match.

## Boundaries & Constraints

**Always:**
- Preserve all existing exported function signatures and existing passing behavior for already-covered forms (inline, reference-style, quoted/unquoted `<img>`, query/fragment suffixes).
- Fenced-block detection in the replace functions must reuse the same fence-open/fence-close semantics as `stripFencedCodeBlocks` (backtick or tilde fences, closing fence length >= opening, closing fence line may only contain trailing whitespace after the fence chars).
- Content inside a fenced block must pass through the replace functions completely unchanged (not blanked, not rewritten).
- The lowercase-percent-encoded variant must only lowercase the two hex digits after each `%`, never lowercase literal filename letters that are not percent-encoded.

**Block If:** none identified — this is a self-contained, deterministic fix to existing regex/matching logic.

**Never:**
- Do not change the public API surface (function names/params/return types) of `extractAssetReferences`, `extractSiblingImageReferences`, `replaceAssetReferenceFilename`, `replaceSiblingImageReferenceFilename`.
- Do not attempt to support subdirectory-containing filenames (paths with `/`) — the existing traversal rejection stays in place.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rename with same filename inside a fenced example | Markdown has a real `assets/pic.png` reference plus a fenced ` ```md ` block containing the literal text `assets/pic.png` | `replaceAssetReferenceFilename(md, 'pic.png', 'new.png')` rewrites only the real reference; the fenced block's text is untouched | N/A |
| Rename with same filename inside a fenced example (sibling) | Same as above but with a `./pic.png` sibling reference inside and outside a `~~~` fence | `replaceSiblingImageReferenceFilename` rewrites only the reference outside the fence | N/A |
| Lowercase-percent-encoded reference | Markdown contains `![alt](./assets/%e4%bd%a0.png)`, rename `你.png` -> `他.png` | Reference is located and rewritten to the lowercase-percent-encoded form of `他.png` | N/A |
| Uppercase-percent-encoded reference (regression) | Markdown contains `./assets/%E4%BD%A0.png`, rename `你.png` -> `他.png` | Still rewritten to uppercase-percent-encoded form (existing behavior preserved) | N/A |
| XHTML self-closing unquoted img src | `<img src=./assets/pic.png/>` | `extractAssetReferences` returns `['pic.png']`; `replaceAssetReferenceFilename(md, 'pic.png', 'new.png')` rewrites to `<img src=./assets/new.png/>` | N/A |
| XHTML self-closing unquoted img src (sibling) | `<img src=./pic.png/>` | `extractSiblingImageReferences` returns `['pic.png']`; `replaceSiblingImageReferenceFilename` rewrites to `<img src=./new.png/>` | N/A |

</intent-contract>

## Code Map

- `src/lib/image-assets.ts` -- contains `stripFencedCodeBlocks`, `getFenceInfo`, `extractAssetReferences`, `extractSiblingImageReferences`, `replaceAssetReferenceFilename`, `replaceSiblingImageReferenceFilename` — all edits land here.
- `src/lib/image-assets.test.ts` -- existing `node:test` suite for these functions; new edge-case tests are added here.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/image-assets.ts` -- add a `mapOutsideFencedCodeBlocks(markdown, transform)` helper that reuses `getFenceInfo`'s fence-open/fence-close detection (same semantics as `stripFencedCodeBlocks`) to split markdown into fenced/non-fenced line runs, applies `transform` only to non-fenced runs, and reassembles in original order -- fixes DW-100 by giving the replace functions a way to skip fenced regions without blanking them.
- [x] `src/lib/image-assets.ts` -- wrap the body of `replaceAssetReferenceFilename` and `replaceSiblingImageReferenceFilename` in `mapOutsideFencedCodeBlocks` so the existing variant-replacement loop runs only against non-fenced segments -- resolves DW-100.
- [x] `src/lib/image-assets.ts` -- in both replace functions, extend the old/new variant pairing to include a lowercase-percent-encoded pair (lowercase only the hex digits following each `%` in `encodeURIComponent(oldFilename)` / `encodeURIComponent(newFilename)`), deduplicating so the raw pair always wins when an encoded variant collides with it -- resolves DW-104.
- [x] `src/lib/image-assets.ts` -- in `extractAssetReferences` and `extractSiblingImageReferences`, exclude `/` from the unquoted-`src` character class (`[^\s"'=<>\`]+` -> `[^\s"'=<>\`/]+`) so a trailing self-closing slash is never swallowed into the captured filename -- resolves DW-105 for extraction.
- [x] `src/lib/image-assets.ts` -- in `replaceAssetReferenceFilename` and `replaceSiblingImageReferenceFilename`, relax the unquoted-`src` trailing lookahead from `(?=[\s>])` to also accept an optional self-closing slash immediately before `>` (e.g. `(?=\/?>|\s)`) so the rewrite matches XHTML self-closing unquoted references -- resolves DW-105 for replacement.
- [x] `src/lib/image-assets.test.ts` -- add tests for all six I/O Matrix scenarios above (fenced-block-safe rename x2, lowercase-percent-encoded rename + uppercase regression, XHTML self-closing unquoted `src` for both extraction and replacement, on both the `assets/` and sibling variants).

**Acceptance Criteria:**
- Given a document with a real asset reference and a fenced code block containing the same filename literal, when `replaceAssetReferenceFilename`/`replaceSiblingImageReferenceFilename` renames that filename, then only the real reference outside the fence changes and the fenced block's text is byte-for-byte identical to the input.
- Given a document referencing a filename via lowercase-percent-encoding, when the corresponding replace function is called with the decoded old/new filenames, then the lowercase-percent-encoded occurrence is found and rewritten (and existing uppercase-percent-encoded handling still passes).
- Given a document with an unquoted `<img src=...>` reference ending in a self-closing `/` before `>`, when extraction runs, then the filename is returned without a trailing slash; when the corresponding replace function runs, then the reference is rewritten and the self-closing `/>` is preserved verbatim.

## Spec Change Log

(none)

## Review Triage Log

### 2026-08-04 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 5: (high 0high, medium 3medium, low 2low)
- reject: 0
- addressed_findings:
  - none

Deferred (pre-existing, not caused by this story's diff; not written to the deferred-work ledger per explicit run instruction — recorded here for the orchestrator):
- `[medium]` Mixed-case percent-encoded references (e.g. `%E4%bd%A0.png`, mixing upper/lower hex digits) are still not located/rewritten; only the all-uppercase (`encodeURIComponent` default) and all-lowercase variants are tried. Location: `src/lib/image-assets.ts` `getReplacementVariantPairs`.
- `[low]` Filenames containing characters `encodeURIComponent` treats as unreserved (e.g. `(`, `)`, `'`) but that some external percent-encoders still escape (e.g. `%28x%29.png` for `(x).png`) are not located/rewritten. Location: `src/lib/image-assets.ts` `getReplacementVariantPairs`.
- `[medium]` `mapOutsideFencedCodeBlocks` (mirroring `getFenceInfo`/`stripFencedCodeBlocks`) does not recognize fenced code blocks inside blockquotes (e.g. `> \`\`\` ... \`\`\``), so asset references inside such quoted code samples are still rewritten. Same limitation pre-exists in `extractAssetReferences`/`extractSiblingImageReferences` via `stripFencedCodeBlocks`. Location: `src/lib/image-assets.ts` `getFenceInfo`.
- `[low]` `mapOutsideFencedCodeBlocks`/`stripFencedCodeBlocks` only recognize fences with 0-3 leading spaces, so a fence indented 4+ spaces under a list item is treated as an ordinary text line rather than a protected code block. Location: `src/lib/image-assets.ts` `getFenceInfo`.
- `[medium]` The `<img ... src=...>` regexes (`\bsrc\s*=`) match `data-src=` as if it were `src=`, because `\b` matches the word boundary right after the hyphen; this affects both extraction and replacement, predates this diff, and is unrelated to DW-100/DW-104/DW-105. Location: `src/lib/image-assets.ts` (all four `<img>` patterns).

## Verification

**Commands:**
- `node --experimental-strip-types --test src/lib/image-assets.test.ts` -- expected: all tests pass (12 existing + newly added edge-case tests), 0 failures.
## Auto Run Result

Status: done

_Appended by the bmad-loop orchestrator (missing-marker repair, #224): the session finalized this spec's frontmatter without its `## Auto Run Result` marker, so the orchestrator synthesized the result from the frontmatter and appended this section._

Synthesized by the bmad-loop orchestrator from frontmatter status `done` for story `dw-asset-replace-function-edge-cases` (session finalized the spec without appending its marker).
