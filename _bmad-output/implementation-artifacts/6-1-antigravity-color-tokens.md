---
id: 6-1-antigravity-color-tokens
title: Antigravity Inspired Light and Dark Theme Color Tokens
epic: epic-6
status: done
baseline_revision: 86e7f7a9610aa18e07b2b70efecb1a0b205c163d
final_revision: 20c2956
followup_review_recommended: false
---

# Story 6.1: Antigravity Inspired Light and Dark Theme Color Tokens

## Story Description
作为用户，我希望软件支持丰富的主题配色，包含 5 款浅色系主题和 5 款暗色系主题（参考 Antigravity IDE 调色板），满足不同光照环境下的视觉偏好。

## Acceptance Criteria
1. **10 种主题 Token 定义**: 在全局 CSS/Design Tokens 中定义 5 款浅色主题（如 `Paper Light`, `Cream Warm`, `Ice Cool`, `Sand Sandstone`, `Nord Light`）和 5 款暗色主题（如 `Cyberpunk Dark`, `Obsidian Black`, `Deep Void`, `Midnight Slate`, `Solarized Dark`）。
2. **完整 CSS 变量覆盖**: 每种主题包含背景色 (`--bg-primary`, `--bg-surface`), 边框色 (`--border-color`), 文本色 (`--text-primary`, `--text-secondary`), 高亮强调色 (`--accent-color`), 代码块背景色 (`--code-bg`)。
3. **数据驱动**: 主题列表可通过 JSON 配置读取注册，方便后续灵活扩充。

## Implementation Notes

- Added `src/lib/themes.json` (data-driven registry of 10 themes: id, name, mode) and `src/lib/themes.ts` (typed accessor with validation) for story 6.2 to consume.
- Added an additive token layer in `src/styles/app.css`: `:root` fallback values for `--bg-primary`, `--bg-surface`, `--border-color`, `--text-primary`, `--text-secondary`, `--accent-color`, `--code-bg`, plus 10 `[data-theme="<id>"]` blocks (one per theme id, matching `themes.json`). Existing `--color-*` tokens are now bridged from these new variables so current UI keeps rendering identically until story 6.2 wires up `data-theme` switching.
- `color-scheme` is now driven by `--app-color-scheme` (`light`/`dark` per theme) instead of a hardcoded `dark`, so native form controls/scrollbars will follow the active theme once 6.2 sets `data-theme`.

## Review Triage Log

### 2026-08-01 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2 (medium 1, low 1)
- defer: 4
- reject: 5
- addressed_findings:
  - `[medium]` `[patch]` Light-theme accent colors (`ice-cool`, `cream-warm`, `paper-light`, `sand-sandstone`, `nord-light`) had WCAG contrast ratios of 2.67–4.17:1 against their `--bg-surface`, too low for reliable text/icon legibility. Darkened each accent hex so all five now reach ≥4.5:1 (AA) against `--bg-surface`.
  - `[low]` `[patch]` `src/lib/themes.ts` blindly type-cast the parsed `themes.json` without validating shape. Replaced with a runtime filter (`isValidTheme`) that drops malformed entries and warns instead of trusting the cast.

Deferred (see `deferred-work.md`, not this story's scope to fix):
- Pre-existing hard-coded light-mode-unfriendly colors in `PreviewPane.vue`, `SlashMenu.vue`, and `SettingsModal.vue` will look inconsistent once story 6.2 enables light themes.
- Semantic tokens (`--color-success`, `--color-error`, `--color-warning`) and elevation tokens (`--shadow-dialog`, hard-coded black overlays) are not themed per-palette; out of this story's required AC scope but will look mismatched under light themes.
- No automated contrast/visual regression coverage exists for the 10 themes.
- Theme identity is split across two artifacts (CSS selectors and `themes.json`) with only client-side validation; no build-time check that every registry `id` has a matching CSS selector (or vice versa).

Rejected as noise / by design:
- "Reopens dark-only MVP decision" — this is exactly this story's intended scope (AC 1 requires multi-theme support), not a defect.
- "Theme system unreachable in this diff" — expected; story 6.2 (not started) owns wiring `data-theme` switching, menu, and persistence.
- "`themes.json` may not exist in the reviewed changeset" — false; the file is created and committed alongside `themes.ts`.
- "`midnight-slate` duplicates the default `:root` palette" — intentional, so the default theme is selectable/explicit and matches current shipped look.
- Edge Case Hunter's flagged invalid `'#'`/trailing-colon CSS lines — an artifact of a corrupted diff pasted into that subagent's prompt during this review pass, not present in the actual file (verified by direct inspection of `src/styles/app.css`).
## Auto Run Result

Status: done

_Appended by the bmad-loop orchestrator (missing-marker repair, #224): the session finalized this spec's frontmatter without its `## Auto Run Result` marker, so the orchestrator synthesized the result from the frontmatter and appended this section._

Synthesized by the bmad-loop orchestrator from frontmatter status `done` for story `6-1-antigravity-color-tokens` (session finalized the spec without appending its marker).
