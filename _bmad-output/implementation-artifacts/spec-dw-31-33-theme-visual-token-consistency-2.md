---
title: '主题视觉 Token 一致性收尾（DW-31, DW-32, DW-33）第二次尝试'
type: 'refactor'
created: '2026-08-02'
status: 'done'
baseline_revision: '69b08b3aa47dcc404665a0127eef900d4a2d29f7'
final_revision: 'c19a93880d35138d35ae0b0e283f56774f13ab28'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** `src/lib/preview.ts` 的响应式预览字号（13px/13.5px/14px 及对应标题 16/17/18px）为字面量，未接入设计 token；`PreviewPane.vue`/`SlashMenu.vue`/`SettingsModal.vue` 存在未纳入 token 体系的硬编码颜色（表头/斑马纹/快捷键 chip 的 `rgba(255,255,255,...)` 叠加层，各自数值不同：0.05/0.02/0.06；未定义的 `--color-primary`/`--color-text-subtle` 变量 fallback）；`src/styles/app.css` 的语义色（`--color-success`/`--color-error`/`--color-warning`）与 `--shadow-dialog` 只在 `:root` 定义，未随 5 套浅色主题差异化，深色数值在浅色背景下可能显得突兀或不可见。

**Approach:** 在 `app.css` `:root` 新增互不合并、各自保留原始字面量的独立 token（3 个叠加层 token 分别对应表头/斑马纹/快捷键 chip 的原值，1 个 `--shadow-menu` 对应 SlashMenu 原阴影值，6 个 `--font-size-preview-*` 对应 preview.ts 三档正文/标题字号），把三个组件文件与 `preview.ts` 中的硬编码值替换为对这些 token（或既有 `--color-accent`/`--color-text-muted`）的引用；为 5 套浅色主题补充 `--color-success`/`--color-error`/`--color-warning`/`--shadow-dialog`/`--shadow-menu`/三个叠加层 token 的浅色覆盖值。

## Boundaries & Constraints

**Always:**
- 默认深色主题（`:root`，即 `midnight-slate` 视觉效果）与其余 4 套深色主题（`cyberpunk-dark`/`obsidian-black`/`deep-void`/`solarized-dark`）在本次改动后渲染必须与改动前逐像素一致——只允许把字面量替换为**取值相同**的 token 引用，绝不合并两个原始字面量不同的硬编码值到同一个 token。
- 叠加层 token 必须拆分为三个独立变量，禁止共用：`--color-overlay-header`（表头，`:root` 默认值 `rgba(255, 255, 255, 0.05)`，对应 `PreviewPane.vue` 原表头背景）、`--color-overlay-zebra`（斑马纹，`:root` 默认值 `rgba(255, 255, 255, 0.02)`，对应 `PreviewPane.vue` 原偶数行背景）、`--color-overlay-shortcut`（快捷键 chip，`:root` 默认值 `rgba(255, 255, 255, 0.06)`，对应 `SlashMenu.vue` 原 `.shortcut` 背景）。三者的 `:root` 默认值必须与被替换的字面量完全相等。
- 新增 `--shadow-menu`，`:root` 默认值为 `0 8px 24px rgba(0, 0, 0, 0.4)`（与 `SlashMenu.vue` 原 `.slash-menu` `box-shadow` 字面量完全相等），替换该处硬编码阴影。
- 新增 6 个字号 token：`--font-size-preview-compact: 13px`、`--font-size-preview-regular: 13.5px`、`--font-size-preview-wide: 14px`、`--font-size-preview-heading-compact: 16px`、`--font-size-preview-heading-regular: 17px`、`--font-size-preview-heading-wide: 18px`，值与 `src/lib/preview.ts` 中 `PREVIEW_LAYOUT_STYLES` 现有字面量一一对应且相等；`preview.ts` 中改为写入 `var(--font-size-preview-compact)` 等字符串（保留原有的 `--preview-body-font-size`/`--preview-heading-font-size` CSS 自定义属性名不变，只改变其取值来源）。
- `--color-primary` 与 `--color-text-subtle` 是 token 体系外的遗留变量名（仅有内联 fallback，未在 `app.css` 任何位置定义）：`SettingsModal.vue` 三处 `--color-primary` 引用改为体系内既有的 `--color-accent`（`.btn-primary` 的文字色 `#ffffff` 同步改为 `--color-accent-foreground`，以保证浅色主题下按钮文字对比度）；`SlashMenu.vue` 两处 `--color-text-subtle` 引用改为 `--color-text-muted`。替换后可以去掉内联 fallback（`--color-accent`/`--color-text-muted` 均已在 `:root` 全局定义，加载顺序早于任何组件渲染，仓库内同类 token 引用已普遍省略 fallback）。
- 为 5 套浅色主题（`paper-light`/`cream-warm`/`ice-cool`/`sand-sandstone`/`nord-light`）各自的 `[data-theme=...]` 块中新增覆盖：`--color-success`/`--color-error`/`--color-warning`（选用在该主题浅色背景上对比度合适、且尽量贴近原色相的色值）、`--shadow-dialog`/`--shadow-menu`（降低阴影不透明度，如 `rgba(0,0,0,0.12)`~`rgba(0,0,0,0.18)` 量级，避免浅色背景上阴影过重）、`--color-overlay-header`/`--color-overlay-zebra`/`--color-overlay-shortcut`（改为黑色基调叠加，如 `rgba(0,0,0,0.05)`/`rgba(0,0,0,0.02)`/`rgba(0,0,0,0.06)`，与深色主题的透明度数值保持一致，仅反转叠加色的明暗基调，使其在浅色背景上依然可辨识）。
- 改动后必须运行 `npm run build`（含 `check:theme-sync`、`check:theme-contrast`、`vue-tsc --noEmit`、`vite build`）确认无回归。

**Block If:** 无需人工决策的已知阻塞条件——本任务所有替换都有明确的一一对应关系，无需暂停。

**Never:**
- 不改变除 `PreviewPane.vue`、`SlashMenu.vue`、`SettingsModal.vue`、`src/lib/preview.ts`、`src/styles/app.css` 之外的任何文件（例如 `App.vue`、`MenuBar.vue`、`PublishConfluenceModal.vue` 中引用 `--shadow-dialog` 的地方，以及它们各自可能存在的硬编码 `rgba` 值，均不在本次范围内，只需确保它们引用的 `--shadow-dialog` 值本身在浅色主题下被正确覆盖）。
- 不新增或调整任何主题已有的 `--bg-*`/`--text-*`/`--accent-color` 等基础配色 token。
- 不引入新的 `[data-theme=...]` 主题块（10 套主题数量保持不变）。
- 不合并任何两个原始字面量不同的硬编码值到同一共享 token（这是本次修复的核心约束，避免重蹈上一次尝试因合并 0.05 与 0.06 导致的像素级回归）。
- 不改变三个组件文件现有的 DOM 结构、类名或交互逻辑，仅替换 CSS 数值来源。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 默认深色主题下渲染预览响应式字号与叠加层 | `data-theme` 未设置，预览区宽度分别落入 compact/regular/wide 断点，含表格 | 字号计算结果与改动前逐字节一致（13px/13.5px/14px，标题 16/17/18px）；表头/斑马纹背景仍为 `rgba(255,255,255,0.05)`/`rgba(255,255,255,0.02)` | 无 |
| 默认深色主题下打开 SlashMenu | `data-theme` 未设置，触发 `/` | 快捷键 chip 背景仍为 `rgba(255,255,255,0.06)`，菜单阴影仍为 `0 8px 24px rgba(0,0,0,0.4)`，文案颜色引用 `--color-text-muted` 渲染结果与原 fallback `#8a909e` 视觉一致 | 无 |
| 切换到浅色主题查看 PreviewPane 表格 | `data-theme="paper-light"`，预览内容包含表格 | 表头与斑马纹改为黑色基调叠加，在浅色背景上依然可辨识（不趋于透明） | 无 |
| 切换到浅色主题打开 SettingsModal | `data-theme="sand-sandstone"` | Tab 激活下划线、输入框聚焦边框、主按钮背景均使用该主题 `--color-accent`，主按钮文字使用 `--color-accent-foreground` 保持可读对比度 | 无 |
| 浅色主题下触发成功/错误/警告状态色与对话框阴影 | `data-theme="nord-light"`，展示成功/失败提示或打开弹窗 | `--color-success`/`--color-error`/`--color-warning`/`--shadow-dialog` 使用该浅色主题覆盖值而非深色方案原始数值 | 无 |

</intent-contract>

## Code Map

- `src/styles/app.css` -- `:root` 新增 `--color-overlay-header`/`--color-overlay-zebra`/`--color-overlay-shortcut`/`--shadow-menu`/6 个 `--font-size-preview-*` token；为 5 套浅色主题块补充 `--color-success`/`--color-error`/`--color-warning`/`--shadow-dialog`/`--shadow-menu`/三个叠加层 token 覆盖值（DW-33 主战场）。
- `src/lib/preview.ts` -- `PREVIEW_LAYOUT_STYLES` 三档字号字面量改为引用新增字号 token（DW-31）。
- `src/components/PreviewPane.vue` -- 表头/斑马纹背景改为引用 `--color-overlay-header`/`--color-overlay-zebra`（DW-32）。
- `src/components/SlashMenu.vue` -- `--color-text-subtle` 改为 `--color-text-muted`；快捷键背景改为 `--color-overlay-shortcut`；菜单阴影改为 `--shadow-menu`（DW-32）。
- `src/components/SettingsModal.vue` -- 三处 `--color-primary` 引用改为 `--color-accent`；`.btn-primary` 文字色改为 `--color-accent-foreground`（DW-32）。

## Tasks & Acceptance

**Execution:**
- [x] `src/styles/app.css` -- 在 `:root` 内新增 `--color-overlay-header: rgba(255, 255, 255, 0.05)`、`--color-overlay-zebra: rgba(255, 255, 255, 0.02)`、`--color-overlay-shortcut: rgba(255, 255, 255, 0.06)`、`--shadow-menu: 0 8px 24px rgba(0, 0, 0, 0.4)`、`--font-size-preview-compact: 13px`、`--font-size-preview-regular: 13.5px`、`--font-size-preview-wide: 14px`、`--font-size-preview-heading-compact: 16px`、`--font-size-preview-heading-regular: 17px`、`--font-size-preview-heading-wide: 18px` -- 为 DW-31/DW-32 提供互不合并的 token 落点，默认值与原字面量一一相等
- [x] `src/styles/app.css` -- 在 `paper-light`/`cream-warm`/`ice-cool`/`sand-sandstone`/`nord-light` 5 个 `[data-theme]` 块中分别覆盖 `--color-success`/`--color-error`/`--color-warning`/`--shadow-dialog`/`--shadow-menu`/`--color-overlay-header`/`--color-overlay-zebra`/`--color-overlay-shortcut` -- 解决 DW-33 浅色主题下语义色与阴影/叠加层突兀问题
- [x] `src/lib/preview.ts` -- 将 `PREVIEW_LAYOUT_STYLES` 中 `--preview-body-font-size`/`--preview-heading-font-size` 的字面量值替换为 `var(--font-size-preview-compact)` 等对新增 token 的引用 -- 解决 DW-31
- [x] `src/components/PreviewPane.vue` -- 将 `.preview-content :deep(th)` 的 `background: rgba(255, 255, 255, 0.05)` 替换为 `var(--color-overlay-header)`，`.preview-content :deep(tr:nth-child(even))` 的 `background: rgba(255, 255, 255, 0.02)` 替换为 `var(--color-overlay-zebra)` -- 解决 DW-32 中 PreviewPane 部分
- [x] `src/components/SlashMenu.vue` -- 将两处 `color: var(--color-text-subtle, #8a909e)` 替换为 `color: var(--color-text-muted)`；将 `.shortcut` 的 `background: rgba(255, 255, 255, 0.06)` 替换为 `var(--color-overlay-shortcut)`；将 `.slash-menu` 的 `box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4)` 替换为 `var(--shadow-menu)` -- 解决 DW-32 中 SlashMenu 部分
- [x] `src/components/SettingsModal.vue` -- 将 `.tab-btn.active` 的 `border-bottom-color: var(--color-primary, #58a6ff)`、`.path-input:focus`/`.text-input:focus` 的 `border-color: var(--color-primary)`、`.btn-primary` 的 `background: var(--color-primary, #58a6ff)` 三处替换为 `var(--color-accent)`；将 `.btn-primary` 的 `color: #ffffff` 替换为 `color: var(--color-accent-foreground)` -- 解决 DW-32 中 SettingsModal 部分

**Acceptance Criteria:**
- Given 默认深色主题（无 `data-theme` 或 `midnight-slate`），when 渲染预览响应式字号、PreviewPane 表格、SlashMenu、SettingsModal，then 视觉输出（字号数值、叠加层颜色、阴影）与改动前逐像素一致。
- Given 任一浅色主题（`paper-light`/`cream-warm`/`ice-cool`/`sand-sandstone`/`nord-light`）被设置为 `data-theme`，when 渲染 PreviewPane 表格叠加层、SlashMenu 阴影与 chip 背景、SettingsModal 激活态/主按钮、成功/错误/警告状态色，then 全部通过 CSS 变量取自该主题的浅色覆盖值，不出现白色叠加层在浅色背景上不可见、或深色阴影/语义色过于突兀的情况。
- Given 代码库中不再存在未定义的 `--color-primary`/`--color-text-subtle` 变量引用，when 搜索 `src` 目录，then 仅剩 `--color-accent`/`--color-accent-foreground`/`--color-text-muted` 等 token 体系内变量名。

## Design Notes

上一轮尝试（`spec-dw-31-33-theme-visual-token-consistency.md`）因把 `PreviewPane.vue` 表头（原值 0.05）与 `SlashMenu.vue` 快捷键 chip（原值 0.06）合并进同一个 `--color-overlay-strong` token 而产生了不可调和的矛盾：合并后二者只能取其一的默认值，必然打破"默认主题逐像素一致"的约束。本次方案改为三个完全独立的 token（`--color-overlay-header`/`--color-overlay-zebra`/`--color-overlay-shortcut`），每个 token 的 `:root` 默认值都精确等于其对应调用点的原始字面量，因此不存在合并冲突；浅色主题下三者各自独立覆盖为对应强度的黑色基调值即可。

## Verification

**Commands:**
- `npm run build` -- expected: 依次通过 `check:theme-sync`、`check:theme-contrast`、`vue-tsc --noEmit`、`vite build`，无报错

**Manual checks (if no CLI):**
- 在浏览器/应用中依次将 `data-theme` 切换为 5 套浅色主题，检查 PreviewPane 表格、SlashMenu、SettingsModal、成功/错误/警告状态色的视觉表现是否协调（人工目视确认无违和感）。

## Spec Change Log

## Review Triage Log

### 2026-08-02 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 3: (low 3)
- reject: 8: (low 8)
- addressed_findings:
  - none

Findings detail:
- `[low]` `defer` — Blind Hunter found `src/styles/preview-export.css` still hard-codes the old `rgba(255, 255, 255, 0.05)`/`rgba(255, 255, 255, 0.02)` table overlay literals, so exported HTML tables won't match `PreviewPane.vue`'s new theme-aware overlays under a light theme. Real, pre-existing, and outside this spec's explicit file scope. Deferred.
- `[low]` `defer` — Blind Hunter found `src/components/SettingsModal.vue` hard-codes `color: #3fb950` for a success indicator instead of `var(--color-success)`, so it won't pick up the new per-theme light-mode success color. Real, pre-existing, outside this spec's task list. Deferred.
- `[low]` `defer` — Blind Hunter found `src/components/PublishConfluenceModal.vue` hard-codes `color: white` on a confirm button and references an undefined `--color-danger` fallback instead of `--color-error`. Real, pre-existing, explicitly out of scope for this spec. Deferred.
- `[low]` `reject` — Blind Hunter flagged that `SlashMenu.vue` now uses `--shadow-menu` while `MenuBar.vue` still uses `--shadow-dialog`, calling this a loss of "elevation token sharing." Rejected: the spec never required unifying menu/dialog shadow tokens, and `MenuBar.vue` was explicitly out of scope; both tokens still resolve correctly (including now-differentiated light-theme values) so there is no visual defect.
- `[low]` `reject` (x2) — Blind Hunter flagged that `SettingsModal.vue`'s `.tab-btn.active`/`.path-input:focus`/`.text-input:focus`/`.btn-primary` dropped their `#58a6ff` inline fallback when migrating to `var(--color-accent)`. Rejected: this is exactly what the spec's `<intent-contract>` Boundaries & Constraints mandated, with explicit justification that `--color-accent` is a globally defined `:root` token loaded before any component renders, matching the established pattern already used elsewhere in the same file (e.g. `--color-background` has no fallback).
- `[low]` `reject` (x4) — Blind Hunter flagged that `cyberpunk-dark`/`obsidian-black`/`deep-void`/`solarized-dark` do not define overrides for the new overlay/shadow/semantic-color tokens and so inherit `:root` defaults. Rejected: the spec's Always constraints explicitly require the 5 non-default dark themes to remain pixel-identical to their pre-change rendering and explicitly restrict new-token overrides to only the 5 light themes (`paper-light`/`cream-warm`/`ice-cool`/`sand-sandstone`/`nord-light`); inheriting `:root` is the correct, spec-mandated behavior for dark themes, not a gap.
## Auto Run Result

Status: done

Summary: Migrated the last hardcoded, pre-token-system presentation values in the light-theme rollout scope. Added independent design tokens in `src/styles/app.css` (`--color-overlay-header`/`--color-overlay-zebra`/`--color-overlay-shortcut`, `--shadow-menu`, 6 `--font-size-preview-*` tokens) each defaulting to exactly the literal it replaces, then wired them through `src/lib/preview.ts` and the three components. Replaced the undefined legacy `--color-primary`/`--color-text-subtle` variable references with the token-system `--color-accent`/`--color-accent-foreground`/`--color-text-muted`. Added light-theme overrides for `--color-success`/`--color-error`/`--color-warning`/`--shadow-dialog`/`--shadow-menu`/the three overlay tokens across all 5 light themes (`paper-light`/`cream-warm`/`ice-cool`/`sand-sandstone`/`nord-light`), while intentionally leaving all 5 dark themes unmodified to preserve pixel-identical rendering per the spec's Always constraints.

Files changed:
- `src/styles/app.css` -- added 3 overlay tokens, `--shadow-menu`, 6 preview font-size tokens to `:root`; added light-theme overrides for semantic colors, shadows, and overlays across 5 light `[data-theme]` blocks.
- `src/lib/preview.ts` -- `PREVIEW_LAYOUT_STYLES` literal font sizes replaced with `var(--font-size-preview-*)` references (values unchanged).
- `src/components/PreviewPane.vue` -- table header/zebra-stripe backgrounds now reference `--color-overlay-header`/`--color-overlay-zebra`.
- `src/components/SlashMenu.vue` -- `--color-text-subtle` refs replaced with `--color-text-muted`; shortcut chip background now `--color-overlay-shortcut`; menu shadow now `--shadow-menu`.
- `src/components/SettingsModal.vue` -- three `--color-primary` refs replaced with `--color-accent`; `.btn-primary` text color now `--color-accent-foreground`.

Review findings breakdown: 0 patches (nothing trivially fixable in scope), 3 deferred (pre-existing, out-of-scope hardcodes in `preview-export.css`, `SettingsModal.vue` success color, and `PublishConfluenceModal.vue` confirm-button/error-color), 8 rejected (menu/dialog shadow-token separation, intentional fallback removal per spec, and intentional non-override of the 4 non-default dark themes — all spec-mandated behavior, not defects). Edge Case Hunter reported zero findings.

Verification performed: `npm run build` passed cleanly (theme-sync check, theme-contrast check, `vue-tsc --noEmit`, `vite build`, all green). Manual diff review confirmed every task's replacement token default value is byte-identical to the literal it replaced, and confirmed the 5 light-theme override blocks contain all 8 required token overrides each. `grep -rn "color-primary\|color-text-subtle" src` returned zero matches.

Residual risks: none within scope. The 3 deferred items (export CSS parity, and two other components' unrelated hardcodes) are pre-existing and now logged in `deferred-work.md` for future attention.
