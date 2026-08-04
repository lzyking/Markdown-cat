---
title: 'CSS 与组件硬编码颜色 Token 化'
type: 'refactor'
created: '2026-08-04'
status: 'done'
baseline_revision: '15074738779a2c4d0a3ff16e47967f915831214c'
final_revision: '11d1466b0d67fe8c42247540c7573853cba294b1'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** `preview-export.css`、`SettingsModal.vue`、`PublishConfluenceModal.vue` 中仍残留硬编码颜色字面量（表格 overlay 的 `rgba(255,255,255,*)`、成功色 `#3fb950`、确认按钮 `color: white`、未定义的 `--color-danger` 回退变量），导致浅色主题下导出/组件渲染与设计系统脱节 (DW-69, DW-70, DW-71)。

**Approach:** 将这些硬编码值替换为项目已在 `src/styles/app.css` 中定义的设计 token（`--color-overlay-header`、`--color-overlay-zebra`、`--color-success`、`--color-accent-foreground`、`--color-error`），不改变视觉默认表现（深色主题下数值应保持一致）。

## Boundaries & Constraints

**Always:** 仅替换指定的硬编码颜色声明为等价的已存在 CSS 自定义属性；保持深色主题（`:root` 默认值）下的渲染结果像素级不变；不引入新 token，只复用 `app.css` 中已定义的 token。

**Block If:** 若目标 token（`--color-overlay-header`/`--color-overlay-zebra`/`--color-success`/`--color-accent-foreground`/`--color-error`）在 `src/styles/app.css` 中缺失或值与硬编码不匹配导致视觉回归无法避免 — 但已确认三者均存在且深色主题值完全匹配，因此本条件不会触发。

**Never:** 不修改与本清理无关的样式、不新增组件逻辑、不改动 `PublishConfluenceModal.vue`/`SettingsModal.vue` 之外的颜色声明、不引入运行时 JS 变更。

</intent-contract>

## Code Map

- `src/styles/preview-export.css` -- 表格 `th`/`tr:nth-child(even)` 背景使用硬编码 `rgba(255,255,255,0.05)`/`rgba(255,255,255,0.02)`，需替换为 `var(--color-overlay-header)`/`var(--color-overlay-zebra)` (DW-69)
- `src/components/SettingsModal.vue` -- `.status-text.success, .success-text` 选择器硬编码 `color: #3fb950`，需替换为 `var(--color-success)` (DW-70)
- `src/components/PublishConfluenceModal.vue` -- `.confirm-btn` 硬编码 `color: white`，`.error-text` 引用未定义的 `--color-danger` 回退变量，需分别替换为 `var(--color-accent-foreground)` 与 `var(--color-error)` (DW-71)
- `src/styles/app.css` -- token 定义来源，仅供参考，不修改

## Tasks & Acceptance

**Execution:**
- [x] `src/styles/preview-export.css` -- 将第 178 行 `background: rgba(255, 255, 255, 0.05);` 改为 `background: var(--color-overlay-header);`，第 184 行 `background: rgba(255, 255, 255, 0.02);` 改为 `background: var(--color-overlay-zebra);` -- 使导出 HTML 表格 overlay 与实时预览及主题系统保持一致
- [x] `src/components/SettingsModal.vue` -- 将第 875 行 `color: #3fb950;` 改为 `color: var(--color-success);` -- 使成功态文本颜色随主题切换
- [x] `src/components/PublishConfluenceModal.vue` -- 将第 263 行 `color: white;` 改为 `color: var(--color-accent-foreground);`；将第 272 行 `color: var(--color-danger, #d25a5a);` 改为 `color: var(--color-error);` -- 消除未定义变量回退并采用 token 系统的错误色

**Acceptance Criteria:**
- Given `src/styles/preview-export.css` 编译后的 HTML 导出，when 在默认（深色）主题下渲染表格，then 表头与斑马纹背景色与替换前的 `rgba(255,255,255,0.05)`/`rgba(255,255,255,0.02)` 视觉一致（因 `--color-overlay-header`/`--color-overlay-zebra` 深色主题值与原硬编码值相同）
- Given `SettingsModal.vue` 显示 Confluence 保存成功状态，when 组件渲染 `.success-text`，then 文本颜色取自 `--color-success` token 而非硬编码十六进制值
- Given `PublishConfluenceModal.vue` 渲染确认按钮与错误提示，when 组件挂载，then 按钮文本色取自 `--color-accent-foreground`，错误提示文本色取自 `--color-error`，且不再引用未定义的 `--color-danger`
- Given 项目构建流程，when 运行 `npm run build`，then 构建成功且无 CSS/TS 编译错误

## Spec Change Log

## Review Triage Log

### 2026-08-04 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 3: (high 0, medium 1, low 2)
- reject: 9: (high 0, medium 0, low 9)
- addressed_findings:
  - none

## Design Notes

无重大设计决策：本任务为一对一的硬编码值 → 已存在 token 的替换，token 均已在 `src/styles/app.css` 的所有主题块中定义且深色主题下数值与原硬编码值一致，因此不会引起视觉回归。

## Verification

**Commands:**
- `npm run build` -- expected: 构建成功，无报错
- `grep -rn "rgba(255, 255, 255, 0.0[25])" src/styles/preview-export.css` -- expected: 无匹配（硬编码已清除）
- `grep -n "#3fb950" src/components/SettingsModal.vue` -- expected: 无匹配
- `grep -n "color: white\|color-danger" src/components/PublishConfluenceModal.vue` -- expected: 无匹配

## Auto Run Result

Status: done

**Summary:** Replaced hardcoded CSS colors with existing design tokens in three files to close DW-69/70/71, with no visual change under the default (dark) theme since token values match the prior literals.

**Files changed:**
- `src/styles/preview-export.css` -- exported-HTML table header/zebra overlay backgrounds now use `--color-overlay-header`/`--color-overlay-zebra` instead of literal `rgba(255,255,255,*)`.
- `src/components/SettingsModal.vue` -- success-state text color now uses `--color-success` instead of literal `#3fb950`.
- `src/components/PublishConfluenceModal.vue` -- confirm-button text color now uses `--color-accent-foreground` instead of literal `white`; error text now uses `--color-error` instead of an undefined `--color-danger` fallback.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- 3 new deferred-work entries appended (see Review findings below).

**Review findings breakdown:**
- patches applied: 0
- deferred: 3 (medium: 1 -- five dark themes in `app.css` don't override `--color-success`/`--color-error`/`--color-overlay-*`, so they silently inherit `:root` defaults; low: 2 -- stale `#3ba55d` fallback in `PublishConfluenceModal.vue`'s untouched `.success-text` rule, and no automated test coverage for the newly tokenized colors across themes/export path)
- rejected: 9 (speculative/unconfirmed contrast claims, and fallback-removal "risks" that are consistent with the codebase's existing no-fallback `var()` convention and cannot occur since every theme inherits token defaults from `:root`)

**Verification performed:**
- `npm run build` -- succeeded, no errors.
- `grep -rn "rgba(255, 255, 255, 0.0[25])" src/styles/preview-export.css` -- no matches.
- `grep -n "#3fb950" src/components/SettingsModal.vue` -- no matches.
- `grep -n "color: white\|color-danger" src/components/PublishConfluenceModal.vue` -- no matches.

**Residual risks:** Low. The three deferred items are pre-existing gaps outside this story's scope (five themes missing token overrides in `app.css`; a stale fallback literal in an untouched rule; missing theme-matrix test coverage) and do not affect the default theme's rendering.
