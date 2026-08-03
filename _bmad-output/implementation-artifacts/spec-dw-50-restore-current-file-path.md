---
title: 'Set currentFilePath during last-opened-file session restore'
type: 'bugfix'
created: '2026-08-03'
status: 'done'
baseline_revision: 'ee53003694d23b16eb23aa41f77d7d297c338091'
final_revision: 'f2da74aea85ddc8a7d8504eedfeea924bcf03736'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** In `src/App.vue`'s `onMounted` last-opened-file recovery path, after `read_external_document` succeeds only `filename.value` and `content.value` are set; `currentFilePath.value` is never assigned. This causes auto-restored documents to be treated as unsaved/unknown-path, so the paste-image feature falls back to the default `assets/` directory instead of saving beside the actual document (mirrors what `loadFileFromPath` already does correctly at line ~716).

**Approach:** In the `onMounted` block, when `loadRes.ok && loadRes.data` is true, also set `currentFilePath.value = configRes.data.lastOpenedFile` alongside the existing `filename.value`/`content.value` assignments, matching `loadFileFromPath`'s behavior.

## Boundaries & Constraints

**Always:** Set `currentFilePath.value` only when the restore actually succeeds (`loadRes.ok && loadRes.data` true). Do not alter behavior when restore fails or `lastOpenedFile` is absent (must still fall through to `get_blank_document` with `currentFilePath` left `null`, unchanged from current behavior).

**Block If:** N/A — this is a confirmed, isolated one-line fix with a known-correct reference implementation (`loadFileFromPath`) in the same file.

**Never:** Do not change `loadFileFromPath`, the save/save-as flows, or the paste-image directory resolution logic (`documentBaseDir`, `getParentDirectory` usage) — those already correctly consume `currentFilePath` once it is set.

</intent-contract>

## Code Map

- `src/App.vue` -- `onMounted` (around line 1143-1154): last-opened-file restore path missing `currentFilePath.value` assignment; `loadFileFromPath` (around line 712-723) is the reference implementation that already sets it correctly.

## Tasks & Acceptance

**Execution:**
- [x] `src/App.vue` -- In `onMounted`, inside `if (loadRes.ok && loadRes.data) { ... }`, add `currentFilePath.value = configRes.data.lastOpenedFile` alongside `filename.value`/`content.value` -- fixes DW-50 so auto-restored documents are treated as saved/known-path, consistent with `loadFileFromPath`.

**Acceptance Criteria:**
- Given a config with a valid `lastOpenedFile` and a successful `read_external_document` response during `onMounted`, when the app finishes mounting, then `currentFilePath.value` equals `configRes.data.lastOpenedFile` (not `null`).
- Given a config with a valid `lastOpenedFile` but `read_external_document` fails (`loadRes.ok` false or no data), when the app finishes mounting, then `currentFilePath.value` remains unset/`null` and the existing blank-document fallback behavior is unchanged.

## Spec Change Log

## Review Triage Log

### 2026-08-03 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 4 (high 0, medium 0, low 4)
- reject: 6 (high 0, medium 0, low 6)
- addressed_findings:
  - none

## Verification

**Commands:**
- `npx vue-tsc --noEmit` -- expected: no new type errors introduced by the change.

**Manual checks (if no CLI):**
- Inspect the diff in `src/App.vue` to confirm the single added line is placed inside the `loadRes.ok && loadRes.data` branch of `onMounted`, mirroring `loadFileFromPath`'s `currentFilePath.value = filePath` assignment.

## Auto Run Result

**Status:** done

**Summary:** Fixed DW-50 — `App.vue`'s `onMounted` last-opened-file session-restore path now sets `currentFilePath.value` (alongside `filename.value`/`content.value`) after a successful `read_external_document` call, mirroring `loadFileFromPath`. Auto-restored documents are now correctly treated as saved/known-path, so pasted images save beside the actual document instead of falling back to the default `assets/` directory.

**Files changed:**
- `src/App.vue` -- one-line addition inside `onMounted`'s `if (loadRes.ok && loadRes.data)` branch: `currentFilePath.value = configRes.data.lastOpenedFile`.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- appended 4 new deferred findings surfaced during review (see below).

**Review findings breakdown:**
- patch: 0
- defer: 4 (all low severity) -- pre-existing issues surfaced but not caused by this change: (1) failed restore doesn't clear `lastOpenedFile`, causing repeated retries of a broken path; (2) an exception (vs. `ok:false`) from `read_external_document` during restore would abort the rest of `onMounted`, skipping fallback logic; (3) no regression test exists for restore + paste-image/save/export flows; (4) a narrow startup race where opening another document while the restore await is pending could overwrite it with stale data.
- reject: 6 -- noise/pre-existing-and-unrelated observations (duplication vs. `loadFileFromPath`, unvalidated/uncanonicalized path consistent with existing sibling function, no restore-specific failure warning, Save As dialog defaulting from `currentSavePath` rather than `currentFilePath`'s directory, no absolute-path validation) -- none introduced or worsened by this diff.

**Verification performed:** `npx vue-tsc --noEmit` passed with no new type errors. Diff manually inspected and confirmed as the single targeted line inside the correct branch, matching the reference implementation `loadFileFromPath`.

**Residual risks:** Low. The four deferred findings are pre-existing conditions unrelated to or only tangentially touched by this fix; none affect the correctness of the DW-50 fix itself.
