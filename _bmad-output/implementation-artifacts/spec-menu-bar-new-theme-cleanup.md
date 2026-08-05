---
title: 'MenuBar New File Option, Top-level Theme Menu, and Menu Cleanup'
type: 'feature'
created: '2026-08-05'
status: 'done'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The current menu bar lacks a direct "New" (新建) file option under the File menu, Theme is nested as a submenu inside File instead of being a top-level menu item, and unused menu items (编辑, 帮助) clutter the menu bar.

**Approach:** 
1. Add a `新建 (New)` option as the very first item in the `文件` (File) dropdown menu that triggers creating a blank Markdown document.
2. Promote `Theme` from a submenu under `File` to a top-level menu item named `样式` (Theme), placed adjacent to `文件` on the menu bar.
3. Remove the unused `编辑` (Edit) and `帮助` (Help) menu items from the menu bar.

## Boundaries & Constraints

**Always:** Maintain keyboard accessibility (focus handling) and existing event emissions (`new-file`, `select-theme`).

**Ask First:** Any changes to other existing menu items (e.g. Save As, Export, Confluence).

**Never:** Break existing theme selection functionality or native file dialogs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Click New File | User clicks "新建 (New)" in File dropdown | Triggers `new-file` event; App initializes a new blank document (`get_blank_document`) | Fallback to blank title & content if invoke fails |
| Select Theme | User clicks a theme option under "样式" top-level menu | Triggers `select-theme` event and switches app theme | N/A |
| Menu Bar Rendering | App loads | Top menu bar shows "Markdown Cat", "文件", "样式"; "编辑" and "帮助" are gone | N/A |

</frozen-after-approval>

## Code Map

- `src/components/MenuBar.vue` -- Defines menu bar structure, dropdowns, keyboard navigation, and menu items.
- `src/App.vue` -- Mounts MenuBar, handles `@new-file="handleNewFile"` event to reset/create blank document via `get_blank_document`.
- `e2e/story-6-2.spec.ts` -- E2E test suite for Theme menu interaction (updated to reflect "样式" top-level menu selector).

## Tasks & Acceptance

**Execution:**
- [x] `src/components/MenuBar.vue` -- Add `新建 (New)` as first item in `文件` menu, move `Theme` to top-level menu bar named `样式`, remove `编辑` and `帮助` items.
- [x] `src/App.vue` -- Bind `@new-file="handleNewFile"` to reset editor state with a blank document.
- [x] `e2e/story-6-2.spec.ts` -- Update E2E test selectors from nested `.menu-dropdown .submenu-trigger` to top-level `.menu-item` with text `样式`.

**Acceptance Criteria:**
- Given user opens "文件" menu, when viewing the options, "新建 (New)" is the first selectable option at the top.
- Given user clicks "新建 (New)", when clicked, the editor clears current document and creates a new blank document.
- Given user looks at the top menu bar, when rendered, "样式" appears next to "文件", and "编辑" and "帮助" are completely removed.
- Given user opens "样式" menu, when clicking any theme option, the active theme updates correctly.

## Verification

**Commands:**
- `npx vue-tsc --noEmit` -- expected: SUCCESS with 0 type errors.
- `npx playwright test e2e/story-6-2.spec.ts` -- expected: All tests pass with updated selectors.
