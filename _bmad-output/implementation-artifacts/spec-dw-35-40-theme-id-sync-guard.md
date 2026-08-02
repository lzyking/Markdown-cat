---
title: '主题 ID 三方同步构建期校验（DW-35, DW-40）'
type: 'chore'
created: '2026-08-02'
status: 'done'
baseline_revision: 'bf41687c632399428ee4fe1da83b393056ba0974'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: 'b8e257a3fbc1a69c826799bf629885992b644097'
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** 主题标识分别独立维护在三处 —— `src/lib/themes.json` 的 `id` 字段、`src/styles/app.css` 的 `[data-theme='...']` 选择器、`src-tauri/src/config.rs` 的 `VALID_THEME_IDS`/`DEFAULT_THEME_ID`（以及前端 `src/lib/themes.ts` 的 `defaultThemeId`）—— 没有任何机制校验三者一一对应，未来新增/重命名主题时容易因拼写不一致导致某个主题在前端静默失效或被后端拒绝。

**Approach:** 新增一个零依赖的 Node 校验脚本 `scripts/check-theme-sync.mjs`，解析 `themes.json`（id 列表）、`app.css`（`[data-theme=...]` 选择器 id 列表）、`themes.ts`（`defaultThemeId` 字面量）与 `config.rs`（`VALID_THEME_IDS` 数组字面量、`DEFAULT_THEME_ID` 字面量），比对四者是否完全一致；不一致时以非零退出码和清晰的差异清单失败，并将其接入 `package.json` 的 `build` 脚本，使漂移在构建期被拦截而不是静默出现。

## Boundaries & Constraints

**Always:**
- 脚本必须仅使用 Node.js 内置模块（`node:fs`、`node:path`），不得引入新的 npm 依赖。
- 脚本必须以退出码 `0` 表示全部一致、非零退出码表示存在任意不一致，供 `npm run build` 据此判定成功/失败。
- 脚本必须能被独立调用（如 `node scripts/check-theme-sync.mjs`），且新增一个 `package.json` script（如 `check:theme-sync`）供单独运行；同时把它接到现有 `build` script 的最前面（如 `"build": "node scripts/check-theme-sync.mjs && vue-tsc --noEmit && vite build"`），使 `npm run build` 自动包含该校验。
- 校验内容覆盖：(a) `themes.json` 中每个主题 `id` 与 `app.css` 中每个 `[data-theme='...']` 选择器的 id 集合必须完全相等（无缺失、无多余）；(b) 上述 id 集合必须与 `config.rs` 中 `VALID_THEME_IDS` 数组的字符串字面量集合完全相等；(c) `themes.ts` 中 `defaultThemeId` 字面量必须与 `config.rs` 中 `DEFAULT_THEME_ID` 字面量完全相等，且该值必须属于上述 id 集合。
- 任一校验失败时，脚本必须在 stderr/stdout 输出具体缺失/多余的 id 列表与来源文件路径，帮助定位问题，而不是仅打印一句笼统的失败信息。
- 在当前代码库状态（10 个主题，三处 id 完全一致，`defaultThemeId`/`DEFAULT_THEME_ID` 均为 `midnight-slate`）下运行该脚本必须以退出码 `0` 成功。

**Block If:** 无需人工决策的已知阻塞条件 —— 当前三处主题定义已一致，脚本只是新增只读校验，无需暂停等待人工输入。

**Never:**
- 不修改 `src/lib/themes.json`、`src/lib/themes.ts`、`src/styles/app.css`、`src-tauri/src/config.rs` 中现有的主题数据或校验逻辑（`is_valid_theme_id`、`isThemeId` 等运行时函数保持不变）——本次只新增构建期静态校验脚本。
- 不引入构建工具链之外的新依赖（如 yaml/toml 解析库、正则库等），保持脚本可在裸 Node 环境下运行。
- 不改变 `vite.config.ts`、`vue-tsc` 相关配置。
- 不新增或删除任何主题；不改变 `defaultThemeId`/`DEFAULT_THEME_ID` 的当前值。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 三方一致（当前状态） | `themes.json`/`app.css`/`themes.ts`/`config.rs` 的主题 id 与默认值完全一致 | 脚本打印成功摘要（如一致的 id 数量），以退出码 `0` 结束 | 无 |
| CSS 缺失某主题选择器 | `themes.json` 含 id `X`，但 `app.css` 无对应 `[data-theme='X']` | 脚本以非零退出码失败，输出信息标明 `X` 存在于 `themes.json` 但缺失于 `app.css` | 阻断 `npm run build` |
| Rust 侧多出未知 id | `config.rs` 的 `VALID_THEME_IDS` 含 `themes.json` 中不存在的 id `Y` | 脚本以非零退出码失败，输出信息标明 `Y` 存在于 `config.rs` 但缺失于 `themes.json`/`app.css` | 阻断 `npm run build` |
| 默认主题不一致 | `themes.ts` 的 `defaultThemeId` 与 `config.rs` 的 `DEFAULT_THEME_ID` 字面量不同 | 脚本以非零退出码失败，输出两侧具体取值 | 阻断 `npm run build` |

</intent-contract>

## Code Map

- `scripts/check-theme-sync.mjs` -- 新增。解析 `themes.json`/`app.css`/`themes.ts`/`config.rs` 并比对主题 id 集合与默认主题 id，不一致时非零退出。
- `package.json` -- 新增 `check:theme-sync` script，并在 `build` script 最前面串联该校验命令。

## Tasks & Acceptance

**Execution:**
- [x] `scripts/check-theme-sync.mjs` -- 新建脚本：用 `fs.readFileSync` 读取 `src/lib/themes.json` 并 `JSON.parse` 取出 `themes[].id` 集合；用正则 `/\[data-theme=['"]([^'"]+)['"]\]/g` 从 `src/styles/app.css` 提取选择器 id 集合；用正则从 `src/lib/themes.ts` 提取 `defaultThemeId = '...'` 字面量；用正则从 `src-tauri/src/config.rs` 提取 `VALID_THEME_IDS` 数组内的字符串字面量集合与 `DEFAULT_THEME_ID: &str = "...";` 字面量；执行四项比对（见 Boundaries & Constraints 的 Always 第三条），任一失败时打印具体差异并 `process.exit(1)`，全部通过时打印成功摘要并 `process.exit(0)` -- 解决 DW-35（CSS/JSON 两处漂移）与 DW-40（前后端两处漂移）
- [x] `package.json` -- 新增 `"check:theme-sync": "node scripts/check-theme-sync.mjs"`，并把 `build` script 改为 `"node scripts/check-theme-sync.mjs && vue-tsc --noEmit && vite build"` -- 使漂移在 `npm run build` 时构建期失败，而不是静默出现

**Acceptance Criteria:**
- Given 当前仓库主题定义（三处一致，10 个主题），when 运行 `node scripts/check-theme-sync.mjs`，then 脚本以退出码 `0` 结束并打印成功摘要。
- Given 人为在 `app.css` 中临时删除某个 `[data-theme='...']` 块（不提交，仅用于验证），when 运行该脚本，then 脚本以非零退出码结束，且输出中明确指出哪个 id 缺失于 `app.css`。
- Given 执行 `npm run build`，when `check-theme-sync.mjs` 校验通过，then 构建继续执行 `vue-tsc --noEmit && vite build` 且不改变其原有行为与产物。

## Verification

**Commands:**
- `node scripts/check-theme-sync.mjs` -- expected: 退出码 `0`，打印成功摘要
- `npm run build` -- expected: 校验脚本先运行且通过，随后 `vue-tsc --noEmit && vite build` 正常完成，无回归

**Manual checks (if no CLI):**
- 临时在 `app.css`/`config.rs` 中制造一个 id 不一致（如删除一行 `[data-theme=...]` 或从 `VALID_THEME_IDS` 中删掉一项），确认脚本能捕获并清晰报告，然后撤销该临时改动。

## Review Triage Log

### 2026-08-02 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 1, medium 1, low 1)
- defer: 0
- reject: 4: (low 4)
- addressed_findings:
  - `[high]` `patch` — Blind Hunter/Edge Case Hunter both found `scripts/check-theme-sync.mjs` resolved its own directory via `decodeURIComponent(new URL(import.meta.url).pathname)`, which produces an incorrect path (leading slash before a drive letter, e.g. `\C:\Users\...`) on Windows and would break `npm run build` on Windows checkouts. Fixed by switching to `path.dirname(fileURLToPath(import.meta.url))` using `node:url`'s `fileURLToPath`. Verified `npm run build` still passes on this platform after the change.
  - `[medium]` `patch` — Both reviewers found the CSS/Rust/TS extraction regexes were comment-blind: a commented-out `[data-theme='...']` block in `app.css`, a commented-out quoted string inside `VALID_THEME_IDS` in `config.rs`, or a commented-out `defaultThemeId` line in `themes.ts` would be read as a real id, letting the guard silently mask real drift or fabricate false failures. Fixed by stripping `//` and `/* */` comments from the Rust/TS source before regex extraction (`stripCLikeComments`) and `/* */` comments from the CSS source before regex extraction (`stripCssComments`). Verified with a manual test: a commented-out `// "ghost-comment",` entry inserted into `config.rs`'s `VALID_THEME_IDS` block no longer affects the result (script still reports success), then the temporary edit was reverted.
  - `[low]` `patch` — Edge Case Hunter found that duplicate ids within `themes.json`, duplicate `[data-theme=...]` selectors within `app.css`, or duplicate entries within `config.rs`'s `VALID_THEME_IDS` were silently collapsed by `Set` construction, hiding a real registry-integrity problem the guard is meant to catch. Added `requireNoDuplicates()` checks for all three sources that fail loudly with the specific duplicate id(s) and source file. Verified with a manual test: a duplicated `"paper-light"` entry inserted into `config.rs`'s `VALID_THEME_IDS` array causes the script to fail with `Duplicate VALID_THEME_IDS entries in src-tauri/src/config.rs: paper-light.`, then the temporary edit was reverted.
  - `[low]` `reject` — Edge Case Hunter (and Blind Hunter, lower confidence) flagged that the Rust/TS extraction regexes only match the current exact declaration shapes (`pub const VALID_THEME_IDS: &[&str] = &[...]`, `export const defaultThemeId = '...'`) and would fail to extract from hypothetical future refactors such as a type alias, an explicit-length array (`&[&str; 10]`), or an added type annotation (`defaultThemeId: Theme['id'] = ...`). Rejected: none of these alternate forms exist in the current codebase; this is speculative future-proofing against refactors that have not happened, not a defect in the current diff. If such a refactor is made later, the extraction regex would need updating alongside it, same as any other codebase-shape-coupled tooling.
  - `[low]` `reject` — Blind Hunter flagged that the CSS selector regex would not match alternate-but-valid attribute selector syntax such as `[data-theme = 'x']` (spaces) or `[data-theme='x' i]` (case-insensitive flag). Rejected: neither form is used anywhere in the current `app.css`; this is speculative and not an actual defect against the current file.
  - `[low]` `reject` — Blind Hunter flagged that `loadThemeIds()` only validates `theme.id` is a non-empty string, not the full `Theme` shape (`name`/`mode`) that the runtime loader in `src/lib/themes.ts` also validates, so a hypothetical entry with a valid `id` but invalid `name`/`mode` would pass the build guard yet be silently dropped at runtime. Rejected: this is out of scope for the intent-contract, which only requires id-set equality across the three sources; the current `themes.json` has no such malformed entries. Replicating full `Theme` validation is a separate concern from cross-file id-sync.
  - `[low]` `reject` — Blind Hunter noted the guard is wired only into `npm run build`, not into `npm run dev`/`tauri dev`, so drift during local editing is only caught at build time. Rejected: this matches the intent-contract's explicit scope ("build-time... validation step" wired into `build`), and the reviewer itself acknowledged this meets the spec's minimum requirement.

## Auto Run Result

Status: done

**Summary:** Added a build-time guard (DW-35, DW-40) that cross-checks theme ids between `src/lib/themes.json`, the `[data-theme=...]` selectors in `src/styles/app.css`, and `VALID_THEME_IDS`/`DEFAULT_THEME_ID` in `src-tauri/src/config.rs` (plus `defaultThemeId` in `src/lib/themes.ts`), failing loudly with a specific diff on drift instead of letting a theme silently break.

**Files changed:**
- `scripts/check-theme-sync.mjs` (new) -- cross-file theme id/default-id sync validator; zero dependencies, Windows-safe path resolution, comment-aware regex extraction, duplicate-id detection.
- `package.json` -- added `check:theme-sync` script and prefixed `build` with the new check.

**Review findings breakdown:** 3 patches applied (1 high: Windows-unsafe path resolution via `fileURLToPath`; 1 medium: comment-blind regex extraction across CSS/Rust/TS; 1 low: silently-collapsed duplicate ids), 0 deferred, 4 rejected (all low-confidence/speculative, out of the intent-contract's scope or not reproducible against the current codebase — see Review Triage Log for detail). No intent gaps, no bad-spec loopbacks.

**Verification performed:**
- `node scripts/check-theme-sync.mjs` -- exit 0, reports all 10 themes in sync, default `midnight-slate`, both before and after the review patches.
- Manual drift injection and revert: renamed a CSS `[data-theme=...]` selector (caught, reported missing/extra ids, reverted), inserted a commented-out id into `config.rs`'s `VALID_THEME_IDS` (correctly ignored after the comment-stripping patch, reverted), duplicated `"paper-light"` in `VALID_THEME_IDS` (caught by the new duplicate check, reverted).
- `npm run build` -- theme-sync check passes, then `vue-tsc --noEmit && vite build` complete successfully with no regression, both before and after the review patches.
- Working tree confirmed clean after each temporary drift test.

**Residual risks:** Low. The extraction regexes are coupled to the current exact declaration shapes in `config.rs`/`themes.ts` (documented and consciously rejected as out-of-scope future-proofing in the Review Triage Log); a future syntax refactor to those declarations would need the script's regex updated alongside it. The guard runs at build time only, not at `dev`/`tauri dev` time, matching the intent-contract's explicit scope.

Committed at `b8e257a3fbc1a69c826799bf629885992b644097` (not pushed).
