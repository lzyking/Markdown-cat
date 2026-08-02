---
title: '主题视觉 Token 一致性收尾（DW-31, DW-32, DW-33）'
type: 'refactor'
created: '2026-08-02'
status: 'blocked'
baseline_revision: 'c520401afdff776e77549f2b374140cfdd826e4f'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** `src/lib/preview.ts` 的响应式预览字号（13px/13.5px/14px）为字面量，未接入设计 token；`PreviewPane.vue`/`SlashMenu.vue`/`SettingsModal.vue` 存在未纳入 token 体系的硬编码颜色（`rgba(255,255,255,...)` 叠加层、未定义的 `--color-primary`/`--color-text-subtle`）；`src/styles/app.css` 的语义色（`--color-success`/`--color-error`/`--color-warning`）与 `--shadow-dialog` 未随 5 套浅色主题差异化，深色数值在浅色背景下会显得突兀或不可见。

**Approach:** 在 `src/styles/app.css` `:root` 新增覆盖层与阴影 token（`--color-overlay-strong`、`--color-overlay-subtle`、`--shadow-menu`），把上述三个文件中的硬编码值替换为对既有/新增 token 的引用；为 5 套浅色主题（`paper-light`/`cream-warm`/`ice-cool`/`sand-sandstone`/`nord-light`）补充 `--color-success`/`--color-error`/`--color-warning`/`--shadow-dialog`/`--shadow-menu`/`--color-overlay-strong`/`--color-overlay-subtle` 覆盖值。

## Boundaries & Constraints

**Always:**
- 深色主题（默认 `:root` 及 `cyberpunk-dark`/`obsidian-black`/`deep-void`/`midnight-slate`/`solarized-dark`）的最终渲染效果必须与改动前逐像素一致 —— 只允许把字面量替换为等值的 token 引用，不允许改变默认值本身。
- 新增 token 一律加入 `:root`，并只在 5 套浅色主题块（`paper-light`/`cream-warm`/`ice-cool`/`sand-sandstone`/`nord-light`）中按需覆盖；不得新建 `[data-theme=...]` 块之外的选择器。
- `--color-primary` 与 `--color-text-subtle` 是未在 token 体系中定义的遗留变量名（只有内联 fallback），必须替换为体系内既有的等价 token：`--color-primary` → `--color-accent`（含 `.btn-primary` 的白色文字需同步替换为 `--color-accent-foreground` 以保证浅色主题下的对比度）；`--color-text-subtle` → `--color-text-muted`。
- `src/lib/preview.ts` 中 `PREVIEW_LAYOUT_STYLES` 的字号必须改为引用 `app.css` 新增的 `--font-size-preview-{compact,regular,wide}` / `--font-size-preview-heading-{compact,regular,wide}` token（值保持 13px/13.5px/14px 与 16px/17px/18px 不变），通过在样式对象中写入 `var(--font-size-preview-compact)` 等字符串实现。
- `PreviewPane.vue` 表头 `rgba(255, 255, 255, 0.05)` 与斑马纹 `rgba(255, 255, 255, 0.02)`、`SlashMenu.vue` 快捷键背景 `rgba(255, 255, 255, 0.06)` 分别替换为 `var(--color-overlay-strong)`（表头、快捷键背景两处共用同一强度）与 `var(--color-overlay-subtle)`（斑马纹）；浅色主题下这两个 token 必须改为黑色基调叠加（如 `rgba(0,0,0,0.05)` / `rgba(0,0,0,0.02)`），使叠加效果在浅色背景下依然可见而不是趋于透明。
- `SlashMenu.vue` 的 `box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4)` 替换为新增 token `var(--shadow-menu)`，`:root` 默认值与替换前的字面量一致；5 套浅色主题下 `--shadow-menu` 与既有 `--shadow-dialog` 一样降低阴影不透明度（如 `rgba(0,0,0,0.15)` 量级），避免在浅色背景上出现过重的深色投影。
- 修改后必须运行前端已有的构建/检查命令确认无回归（见 Verification）。

**Block If:** 无需人工决策的已知阻塞条件 —— 本任务范围内所有替换都有明确的一一对应关系，无需暂停。

**Never:**
- 不改变除本次列出的 3 个组件文件（`PreviewPane.vue`、`SlashMenu.vue`、`SettingsModal.vue`）、`src/lib/preview.ts`、`src/styles/app.css` 之外的任何文件（例如 `App.vue`、`PublishConfluenceModal.vue` 中的遮罩层/阴影不在本次范围内，即便它们也含有硬编码 `rgba` 值）。
- 不新增或调整任何主题的 `--bg-*`/`--text-*`/`--accent-color` 等既有已主题化的基础配色。
- 不引入新的主题（`[data-theme=...]` 块数量保持 10 套不变）。
- 不改变 `SlashMenu.vue`/`PreviewPane.vue`/`SettingsModal.vue` 现有的 DOM 结构、类名或交互逻辑，仅替换 CSS 数值来源。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 默认深色主题下渲染预览响应式字号 | `data-theme` 未设置（默认深色），预览区宽度分别落入 compact/regular/wide 断点 | 计算出的字号与改动前一致：13px/13.5px/14px（标题 16px/17px/18px） | 无 |
| 切换到浅色主题查看预览表格 | `data-theme="paper-light"`，预览内容包含表格 | 表头与斑马纹使用黑色基调叠加，在浅色背景上依然可辨识（不趋于透明） | 无 |
| 切换到浅色主题打开 Slash 菜单 | `data-theme="ice-cool"`，触发 `/` 唤起 SlashMenu | 快捷键 chip 背景、菜单阴影随主题变浅，文案颜色使用 `--color-text-muted` 而非未定义变量 fallback | 无 |
| 浅色主题下查看设置弹窗主按钮/激活 Tab | `data-theme="sand-sandstone"`，打开 SettingsModal | Tab 激活下划线、输入框聚焦边框、主按钮背景均使用该主题的 `--color-accent`，主按钮文字使用 `--color-accent-foreground` 保持可读对比度 | 无 |
| 浅色主题下触发成功/错误/警告状态色 | `data-theme="nord-light"`，`TitleBar`/`StatusBar` 显示成功或失败状态 | `--color-success`/`--color-error`/`--color-warning` 使用该浅色主题覆盖值，而不是深色方案原始数值 | 无 |

</intent-contract>

## Code Map

- `src/styles/app.css` -- `:root` 新增 `--color-overlay-strong`/`--color-overlay-subtle`/`--shadow-menu`/`--font-size-preview-*` token；为 5 套浅色主题块补充 `--color-success`/`--color-error`/`--color-warning`/`--shadow-dialog`/`--shadow-menu`/`--color-overlay-strong`/`--color-overlay-subtle` 覆盖值（DW-33 主战场）。
- `src/lib/preview.ts` -- `PREVIEW_LAYOUT_STYLES` 三档字号字面量改为引用新增字号 token（DW-31）。
- `src/components/PreviewPane.vue` -- 表头/斑马纹 `rgba(255,255,255,...)` 改为引用 `--color-overlay-strong`/`--color-overlay-subtle`（DW-32）。
- `src/components/SlashMenu.vue` -- `--color-text-subtle` 改为 `--color-text-muted`；快捷键背景与菜单阴影改为引用新增 token（DW-32）。
- `src/components/SettingsModal.vue` -- 三处 `--color-primary` 引用改为 `--color-accent`；`.btn-primary` 文字色改为 `--color-accent-foreground`（DW-32）。

## Tasks & Acceptance

**Execution:**
- [ ] `src/styles/app.css` -- 在 `:root` 内新增 `--color-overlay-strong: rgba(255, 255, 255, 0.06)`、`--color-overlay-subtle: rgba(255, 255, 255, 0.02)`、`--shadow-menu: 0 8px 24px rgba(0, 0, 0, 0.4)`、`--font-size-preview-compact: 13px`、`--font-size-preview-regular: 13.5px`、`--font-size-preview-wide: 14px`、`--font-size-preview-heading-compact: 16px`、`--font-size-preview-heading-regular: 17px`、`--font-size-preview-heading-wide: 18px` -- 为 DW-31/DW-32 提供 token 落点，保持默认值与替换前字面量一致
- [ ] `src/styles/app.css` -- 在 `paper-light`/`cream-warm`/`ice-cool`/`sand-sandstone`/`nord-light` 5 个 `[data-theme]` 块中分别覆盖 `--color-success`/`--color-error`/`--color-warning`/`--shadow-dialog`/`--shadow-menu`/`--color-overlay-strong`/`--color-overlay-subtle`，语义色调整为浅色背景下对比度合适的色值，`--shadow-*` 降低阴影不透明度，`--color-overlay-*` 改为黑色基调叠加 -- 解决 DW-33 浅色主题下语义色与阴影/遮罩突兀问题
- [ ] `src/lib/preview.ts` -- 将 `PREVIEW_LAYOUT_STYLES` 中 `--preview-body-font-size`/`--preview-heading-font-size` 的字面量值替换为 `var(--font-size-preview-compact)` 等对新增 token 的引用 -- 解决 DW-31
- [ ] `src/components/PreviewPane.vue` -- 将 `.preview-content :deep(th)` 的 `background: rgba(255, 255, 255, 0.05)` 与 `.preview-content :deep(tr:nth-child(even))` 的 `background: rgba(255, 255, 255, 0.02)` 分别替换为 `var(--color-overlay-strong)`/`var(--color-overlay-subtle)` -- 解决 DW-32 中 PreviewPane 部分
- [ ] `src/components/SlashMenu.vue` -- 将两处 `color: var(--color-text-subtle, #8a909e)` 替换为 `color: var(--color-text-muted)`；将 `.shortcut` 的 `background: rgba(255, 255, 255, 0.06)` 替换为 `var(--color-overlay-strong)`；将 `.slash-menu` 的 `box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4)` 替换为 `var(--shadow-menu)` -- 解决 DW-32 中 SlashMenu 部分
- [ ] `src/components/SettingsModal.vue` -- 将 `.tab-btn.active` 的 `border-bottom-color: var(--color-primary, #58a6ff)`、`.path-input:focus`/`.text-input:focus` 的 `border-color: var(--color-primary)`、`.btn-primary` 的 `background: var(--color-primary, #58a6ff)` 三处替换为 `var(--color-accent)`；将 `.btn-primary` 的 `color: #ffffff` 替换为 `color: var(--color-accent-foreground)` -- 解决 DW-32 中 SettingsModal 部分

**Acceptance Criteria:**
- Given 默认深色主题（无 `data-theme` 或 `midnight-slate`），when 渲染预览响应式字号、PreviewPane 表格、SlashMenu、SettingsModal，then 视觉输出（字号数值、叠加层颜色、阴影）与改动前逐像素一致。
- Given 任一浅色主题（`paper-light`/`cream-warm`/`ice-cool`/`sand-sandstone`/`nord-light`）被设置为 `data-theme`，when 渲染 PreviewPane 表格叠加层、SlashMenu 阴影与 chip 背景、SettingsModal 激活态/主按钮、TitleBar/StatusBar 语义色，then 全部通过 CSS 变量取自该主题的浅色覆盖值，不出现白色叠加层在浅色背景上不可见、或深色阴影/语义色过于突兀的情况。
- Given 代码库中不再存在未定义的 `--color-primary`/`--color-text-subtle` 变量引用，when 搜索 `src` 目录，then 仅剩 `--color-accent`/`--color-accent-foreground`/`--color-text-muted` 等 token 体系内变量名。

## Verification

**Commands:**
- `npm run build` -- expected: 无 TypeScript/Vite 构建错误
- `npx vue-tsc --noEmit` (若 package.json 中存在等效脚本，如 `npm run type-check`) -- expected: 无类型错误

**Manual checks (if no CLI):**
- 在浏览器/应用中依次将 `data-theme` 切换为 5 套浅色主题，检查 PreviewPane 表格、SlashMenu、SettingsModal、TitleBar/StatusBar 状态色的视觉表现是否协调（无需像素级对比，人工目视确认无违和感）。

## Review Triage Log

### 2026-08-02 — Review pass
- intent_gap: 1: (low 1)
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 1: (low 1)
- addressed_findings:
  - none

Findings detail:
- `[low]` `intent_gap` — Edge Case Hunter found that consolidating `PreviewPane.vue`'s `:deep(th)` background and `SlashMenu.vue`'s `.shortcut` background into one shared `--color-overlay-strong` token changes the table-header overlay's default/dark-theme opacity from its original literal `rgba(255, 255, 255, 0.05)` to the shared token's `rgba(255, 255, 255, 0.06)` (taken from the shortcut chip's original literal). Root cause traced to this spec's own `<intent-contract>` Boundaries & Constraints → Always section, which contains two bullets in direct contradiction: one mandates that dark-theme rendering must remain pixel-identical to before, while another explicitly instructs merging the table-header and shortcut-chip overlays into one shared-intensity token — despite their original literals differing (0.05 vs 0.06). Following the merge instruction necessarily breaks the pixel-identical invariant. Per workflow triage rules, since the root cause is inside `<intent-contract>`, this is classified `intent_gap` regardless of its low/cosmetic real-world severity (a ~1% alpha difference, imperceptible to users). Code changes reverted; blocking condition is `intent gap in intent contract`. Resolution requires amending the intent-contract to split the shared token into two (e.g. keep `--color-overlay-strong` for the shortcut chip at 0.06, and add a distinct token such as `--color-overlay-medium` at 0.05 for the table header), both preserving their original literal default values, before implementation can be re-derived.
- `[low]` `reject` — Edge Case Hunter (low confidence) flagged that `SettingsModal.vue`'s `border-bottom-color`/`border-color` now reference `var(--color-accent)` without an inline fallback, whereas the previous `var(--color-primary, #58a6ff)` had one. Rejected: `--color-accent` is defined in `app.css` `:root`, loaded globally before any component renders, and other already-migrated properties in the same file (e.g. `.path-input`'s `var(--color-background)`) already omit fallbacks by the same established pattern. No realistic isolated-rendering scenario in this single-page Tauri app would leave `--color-accent` unresolved.

## Auto Run Result

Status: blocked
Blocking condition: intent gap in intent contract

Detail: The `<intent-contract>` Boundaries & Constraints → Always section contains an internal contradiction. One bullet requires dark/default-theme rendering to remain pixel-identical to the pre-change state. Another bullet instructs merging `PreviewPane.vue`'s table-header overlay (`rgba(255, 255, 255, 0.05)`) and `SlashMenu.vue`'s shortcut-chip overlay (`rgba(255, 255, 255, 0.06)`) into one shared token (`--color-overlay-strong`), even though their original literal values differ. Implementing the merge as specified necessarily changes the table header's default opacity from 0.05 to 0.06, violating the pixel-identical invariant. This was surfaced by the Edge Case Hunter review pass on the first implementation attempt (see `## Review Triage Log`).

Implementation code changes for this pass were reverted (working tree is clean except for this spec file). No commit was made.

Resolution needed before re-attempting: split the shared `--color-overlay-strong` token into two distinct tokens preserving each call site's original literal — e.g. keep `--color-overlay-strong: rgba(255, 255, 255, 0.06)` for `SlashMenu.vue`'s shortcut chip, and add a new `--color-overlay-medium: rgba(255, 255, 255, 0.05)` (with a corresponding light-theme override) for `PreviewPane.vue`'s table header — then amend the `<intent-contract>` Always section and `## Tasks & Acceptance` accordingly.
