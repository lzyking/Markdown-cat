---
id: 6-2-file-menu-theme-selector
title: File Menu Theme Submenu Selector and Config Persistence
epic: epic-6
status: done
baseline_revision: 07e19a7c7021f8d40f726b4e01f6ea362c3a9729
final_revision: 4f5ed08896cc2b4d0164878590a35f5f45292074
followup_review_recommended: false
review_loop_iteration: 0
---

# Story 6.2: File Menu Theme Submenu Selector and Config Persistence

## Story Description
作为用户，我可以在 File 菜单下的 "Theme" 中清晰地选择浅色或暗色主题，选择后界面主题即刻无缝切换，并且重新打开软件后保持上一次的选择。

## Acceptance Criteria
1. **File 菜单集成了 Theme 子菜单**: 菜单划分 "Light Themes" 和 "Dark Themes" 两个清晰的小节，各自展示 5 种主题名称。
2. **选中标记与实时生效**: 当前激活的主题项左侧显示对勾勾选状态，点击任意主题项立即切换根节点的 CSS `data-theme` 属性。
3. **配置持久化**: 将选中的 `themeId` 写入本地 JSON 配置文件 (`config.json`)，应用重启时自动加载应用该主题。

## Implementation Notes

- `src/components/MenuBar.vue` — added a "Theme" submenu under File, with "Light Themes"/"Dark Themes" sections (5 items each, sourced from `src/lib/themes.ts`) and a checkmark on the active theme.
- `src/App.vue` — tracks `activeThemeId`, applies `data-theme` immediately on selection, and persists the choice via the `set_config` command.
- `src/main.ts` — preloads and applies the persisted theme (falling back to the default) before the app mounts, avoiding a flash of the wrong theme.
- `src/lib/theme.ts` (new) — shared helpers to apply/read the active `data-theme` on `document.documentElement`.
- `src/lib/themes.ts` — added `defaultThemeId` / `getResolvedThemeId` helpers to resolve unknown/missing theme ids to a valid default.
- `src/lib/types.ts` — added `AppConfig.themeId` to the frontend config type.
- `src-tauri/src/config.rs` — added a `themeId` field (serde default `midnight-slate`) to `AppConfig`, replacing the old `with_save_path` constructor.
- `src-tauri/src/commands/config.rs` — `set_config` now accepts optional `save_path`/`theme_id` and merges whichever is provided into the persisted config.

**Verification:**
- `npm run build` (runs `vue-tsc --noEmit && vite build`) — passed.
- `cargo check --manifest-path src-tauri/Cargo.toml` — passed.
- AC1: submenu with both sections and 5 items each — `src/components/MenuBar.vue`.
- AC2: checkmark + immediate `data-theme` switch — `src/components/MenuBar.vue`, `src/App.vue`, `src/lib/theme.ts`.
- AC3: `themeId` persisted and reloaded on startup — `src-tauri/src/config.rs`, `src-tauri/src/commands/config.rs`, `src/main.ts`, `src/App.vue`.
- `e2e/story-6-2.spec.ts` (new) — Playwright coverage for all 3 ACs (submenu structure, immediate switch + checkmark, persistence via `set_config` and simulated-restart reload).

## Review Triage Log

### 2026-08-01 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4 (medium 3, low 1)
- defer: 2
- reject: 4
- addressed_findings:
  - `[medium]` `[patch]` `src/main.ts` and `src/App.vue`'s `onMounted` both independently called `get_config` and re-applied the theme; if the second (App.vue) call transiently failed while the first succeeded, `activeThemeId` was force-reset to the default, silently discarding a correctly loaded persisted theme. Removed the redundant theme (re)application from `App.vue`'s `onMounted` — `main.ts` already loads and applies the persisted theme before mount, and `activeThemeId`'s initial value already reflects the live `data-theme` via `getActiveThemeId()`.
  - `[medium]` `[patch]` `handleThemeSelect` in `src/App.vue` applied the theme optimistically with no rollback if `set_config` failed or threw, leaving the UI showing an unsaved theme that would silently revert on next restart. Added rollback: on failure, `activeThemeId` and `data-theme` are restored to the previous value.
  - `[medium]` `[patch]` No automated test coverage existed for this story's UI despite the repo's consistent `e2e/story-*.spec.ts` convention and test hooks (`__SET_THEME__`, `__GET_ACTIVE_THEME_ID__`) added specifically for this purpose. Added `e2e/story-6-2.spec.ts` covering all 3 ACs; full suite (81 tests) passes.
  - `[low]` `[patch]` `set_config` in `src-tauri/src/commands/config.rs` persisted any `theme_id` string with no validation, relying solely on frontend-side checks for defense against invalid values. Added `config::VALID_THEME_IDS` / `is_valid_theme_id` and reject unknown ids with `ERR_INVALID_THEME_ID`.

Deferred (see `deferred-work.md`, not this story's scope to fix):
- `set_config`'s read-modify-write (read config, mutate in memory, write back) has no locking; two near-simultaneous calls (e.g. theme change and save-path change) can race and clobber each other. Pre-existing pattern from story 4.x, now also carried by the new `theme_id` field.
- The File menu (and its new Theme submenu) is only reachable via `:hover`/`:focus-within` CSS with no keyboard focus path into the dropdown items; this is the pre-existing hover-only menu pattern from earlier stories, now extended one level deeper by the Theme submenu.

Rejected as noise / by design:
- "Duplicated default theme id constant (`midnight-slate`) between Rust and TypeScript" — acceptable duplication for two independent runtimes with no shared build-time codegen in this project; both sides already fall back safely if out of sync.
- "`AppConfig.theme_id` breaks forward/backward compatibility silently" — false; `#[serde(default = "default_theme_id")]` is exactly the existing "unknown/missing fields default" convention already documented in this struct's own comment.
- "`with_save_path` removal is an unreviewed breaking change" — verified by repo-wide grep: no other call sites referenced `AppConfig::with_save_path`; `cargo check` passes.
- "Theme submenu dropdown could render off-screen in a very narrow window" — real but extremely low-probability edge case not covered by any AC; existing menus in this codebase have no viewport-overflow handling either.

### 2026-08-01 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1 (medium 1)
- defer: 6 (medium 2, low 4)
- reject: 1 (low 1)
- addressed_findings:
  - `[medium]` `[patch]` `src/main.ts`'s `bootstrap()` awaited `get_config` with no timeout; a hung/never-resolving IPC call would block `createApp(App).mount('#app')` forever, leaving a permanently blank window. Wrapped the `get_config` call in a `withTimeout` helper (2s) so bootstrap always proceeds to mount even if config preload stalls.

Deferred (see `deferred-work.md`, not this story's scope to fix):
- Theme submenu (and its trigger) still has no keyboard focus path — same pre-existing hover-only menu pattern already logged in the prior pass, re-surfaced by both reviewers this pass.
- `set_config`'s unsynchronized read-modify-write race — same pre-existing pattern already logged in the prior pass, re-surfaced by both reviewers this pass.
- Theme switching reuses the app-wide `saveStatus`/`saveMessage` channel, which can mask a real save failure/success message if the user switches themes at the wrong moment; this is the existing single-channel notification pattern already used by open/save-as/drag-drop, not unique to this story.
- Theme id list and default theme id are independently maintained in `src/lib/themes.ts`/`themes.json` and `src-tauri/src/config.rs` with no build-time sync check.
- `main.ts` and `App.vue`'s `onMounted` each independently call `get_config` once at startup, a harmless but redundant double IPC/disk read.
- `e2e/story-6-2.spec.ts`'s AC3 case simulates "restart" via an injected mock rather than a real `config.json` round trip through the Rust backend, and there is no test coverage for the `set_config` failure rollback path or for a malformed persisted `themeId` falling back correctly.

Rejected as noise / by design:
- "`read_config` doesn't validate a persisted `themeId`" — not an actual defect: both consumption points (`main.ts` bootstrap and `App.vue`'s `getActiveThemeId()`/`applyTheme()`) already resolve unknown/invalid ids to the default via `getResolvedThemeId`, so an invalid stored value can never reach the UI unresolved.


## Auto Run Result

Status: done

Summary: Ran a fresh follow-up review pass over the already-implemented Story 6.2 (File menu Theme submenu + config persistence). No intent gaps or spec-level bugs found. One trivially-fixable robustness gap was patched; the rest were either pre-existing patterns extended (not caused) by this story, or noise already mitigated elsewhere.

Files changed this pass:
- `src/main.ts` — wrapped the startup `get_config` preload call in a 2s timeout guard so `createApp(App).mount('#app')` can never be blocked indefinitely by a hung IPC call.
- `_bmad-output/implementation-artifacts/deferred-work.md` — appended 5 new deferred findings from this pass (see below).
- `_bmad-output/implementation-artifacts/6-2-file-menu-theme-selector.md` — this file: status/frontmatter update and new Review Triage Log entry.

Review findings breakdown (this pass): patch 1 (medium), defer 6 (medium 2, low 4), reject 1 (low). See `## Review Triage Log` above for the full addressed/deferred/rejected list.

Verification performed:
- `npm run build` (`vue-tsc --noEmit && vite build`) — passed.
- `cargo check --manifest-path src-tauri/Cargo.toml` — passed.
- `npx playwright test` (full suite) — 81/81 passed, including all 3 `e2e/story-6-2.spec.ts` cases.

Residual risks: the 6 deferred items (keyboard-unreachable Theme submenu, unsynchronized `set_config` read-modify-write, duplicated theme-id source of truth, shared save-status notification channel, redundant double config read at startup, and shallow e2e mock-based persistence coverage) remain open in `deferred-work.md` for future focused attention; none are blocking for this story's ACs.
