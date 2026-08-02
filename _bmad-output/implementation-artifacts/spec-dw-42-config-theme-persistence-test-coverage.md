---
title: 'DW-42：配置/主题持久化测试覆盖加固'
type: 'chore'
created: '2026-08-02'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
baseline_revision: '739490f023d229517d8ac76d675155f1c0359529'
final_revision: 'ed05cec0adf976570daacb8a3396e2be5e8fdd5a'
---

<intent-contract>

## Intent

**Problem:** `e2e/story-6-2.spec.ts` 对 AC3（主题持久化）的验证依赖 `page.addInitScript` 注入 `__TAURI_MOCK_CONFIG__` 模拟“重启”，未真正验证 Rust 侧 `write_config`/`read_config` 写入并重新读取 `config.json` 的完整闭环；`src/App.vue` 的 `handleThemeSelect` 在 `set_config` 失败时的主题回滚分支、以及 `src/lib/themes.ts` 的 `getResolvedThemeId` 在非法 `themeId` 时的前端回退逻辑，均无对应单元测试覆盖。
**Approach:** 在 `src-tauri/src/config.rs` 新增真实文件系统往返的 Rust 单元测试（写入→重新读取 `config.json`，覆盖合法与损坏内容场景），作为 DW-42 认可的“Rust 侧集成测试”替代方案；将 `handleThemeSelect` 中"根据 set_config 结果决定下一主题态"的纯判定逻辑抽取为可独立测试的函数，并为其与 `getResolvedThemeId` 补齐 `node:test` 单元测试。不新增测试框架依赖（无 vitest/jsdom/@vue/test-utils）。

## Boundaries & Constraints

**Always:** 保持 `handleThemeSelect` 对外可观察行为（激活主题、`themeStatus`、`themeMessage` 文案）完全不变；新增 Rust 测试必须使用临时目录（`tempfile::tempdir`），不得触碰真实用户目录；新前端测试文件遵循仓库现有约定，使用 `node:test` + `node:assert/strict`，可通过 `node --experimental-strip-types --test <file>` 独立运行，不含参数属性等 strip-only 模式不支持的 TS 语法。
**Block If:** 无（本任务范围内无需人工决策的分支）。
**Never:** 不引入 vitest / jsdom / happy-dom / @vue/test-utils 等新测试依赖；不通过 mock_app() 驱动 `set_config`/`get_config` 命令本身（会因 `resolve_writable_dir` 解析到真实 `~/Documents` 而产生副作用风险）；不修改 `.bmad-loop` 下的 ledger 文件；不改动主题回滚以外的 `handleThemeSelect` 行为或无关代码。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rust 往返写入 | `write_config` 写入含自定义 `theme_id`/`save_path` 的 `AppConfig` 到临时目录 `config.json` | 随后 `read_config` 读回的结构体字段与写入值完全一致 | 无错误 |
| Rust 损坏内容回退 | 临时目录 `config.json` 内容为非法 JSON | `read_config` 返回 `AppConfig::default()`，不报错 | 无错误（按现有实现即“警告+默认值”） |
| set_config 结果 = 成功 | `resolveThemeSelectionOutcome(prev, requested, {ok:true})` | 返回 `themeId=requested`, `status='success'`, 含 requested 的提示文案 | 无错误 |
| set_config 结果 = 失败（ok:false） | `resolveThemeSelectionOutcome(prev, requested, {ok:false, error:'X'})` | 返回 `themeId=prev`（回滚），`status='failure'`，文案包含 `X` | 无错误抛出，返回失败态供调用方处理 |
| set_config 调用抛出异常 | `resolveThemeSelectionOutcome(prev, requested, null, 'boom')` | 返回 `themeId=prev`（回滚），`status='failure'`，文案包含 `boom` | 同上 |
| 非法 themeId 回退 | `getResolvedThemeId('not-a-real-theme')` | 返回 `defaultThemeId` | 无错误 |
| 合法 themeId | `getResolvedThemeId('nord-light')` | 原样返回 `'nord-light'` | 无错误 |

</intent-contract>

## Code Map

- `src-tauri/src/config.rs` -- 已有 `read_config`/`write_config` 纯函数与 `mod tests`；新增真实文件往返测试用例。
- `src/lib/theme-select.ts` -- 新建文件，抽取 `handleThemeSelect` 的纯判定逻辑为 `resolveThemeSelectionOutcome`。
- `src/lib/theme-select.test.ts` -- 新建文件，覆盖成功/失败/异常三个分支。
- `src/lib/themes.test.ts` -- 新建文件，覆盖 `getResolvedThemeId` 合法/非法 `themeId`。
- `src/App.vue` -- `handleThemeSelect`（约第 688-711 行）改为调用 `resolveThemeSelectionOutcome` 决定回滚与提示文案，副作用（`invoke`/`applyTheme`/refs 赋值）保持在此。
- `e2e/story-6-2.spec.ts` -- AC3 用例保持不变；在其注释中补充一行说明：Rust 侧真实写入/读取闭环由 `src-tauri/src/config.rs` 的新增测试覆盖，此处继续验证前端契约。

## Tasks & Acceptance

**Execution:**
- [x] `src-tauri/src/config.rs` -- 在 `mod tests` 中新增 `config_round_trip_persists_theme_id_and_save_path`（使用 `tempfile::tempdir()` 构造 `config_file_path`，`write_config` 写入自定义 `theme_id`/`save_path`/`last_opened_file`，再 `read_config` 校验字段完全一致）与 `read_config_falls_back_to_default_on_corrupted_json`（写入非法 JSON 到临时路径，断言 `read_config` 返回 `Ok(AppConfig::default())`）-- 用真实文件系统往返关闭 AC3 提出的“未验证 Rust 侧写入并重新读取”缺口。
- [x] `src/lib/theme-select.ts` -- 新建，导出 `ThemeSelectOutcome` 接口（`{ themeId: string; status: 'success' | 'failure'; message: string }`）与 `resolveThemeSelectionOutcome(previousThemeId: string, requestedThemeId: string, result: CmdResult<null> | null, errorMessage?: string): ThemeSelectOutcome`：`result` 为 `null` 表示 `invoke` 抛出异常，返回回滚态且文案为 `` `主题保存异常：${errorMessage || '系统错误'}` ``；`result.ok === false` 返回回滚态且文案为 `` `主题保存失败：${result.error || '未知错误'}` ``；否则返回 `requestedThemeId` 与文案 `` `主题已切换为 ${requestedThemeId}` `` -- 使回滚判定逻辑脱离 Vue/DOM 依赖，可独立单测。
- [x] `src/App.vue` -- 修改 `handleThemeSelect`（约第 688-711 行）：`try` 块内调用 `set_config` 后，用 `resolveThemeSelectionOutcome(previousThemeId, resolvedThemeId, res)` 得到 `outcome`；`catch` 块内用 `resolveThemeSelectionOutcome(previousThemeId, resolvedThemeId, null, err?.message)`；随后统一按 `outcome`：若 `outcome.themeId !== resolvedThemeId` 则 `activeThemeId.value = applyTheme(outcome.themeId)`，并设置 `themeStatus.value = outcome.status`、`themeMessage.value = outcome.message`。需从 `./lib/theme-select` 引入新增的类型与函数。行为必须与改动前逐字节一致（现有 e2e 用例 S6.2-E2E-002/003/004/005 不得回归）。
- [x] `src/lib/theme-select.test.ts` -- 新建，使用 `node:test`/`node:assert/strict`，覆盖成功（`{ok:true}` → 返回 requested 主题与成功文案）、失败（`{ok:false, error:'ERR_X'}` → 返回 previous 主题、失败文案含 `ERR_X`）、异常（`result=null, errorMessage='boom'` → 返回 previous 主题、失败文案含 `boom`）三个分支。
- [x] `src/lib/themes.test.ts` -- 新建，使用 `node:test`/`node:assert/strict`，覆盖 `getResolvedThemeId('nord-light')` 原样返回、`getResolvedThemeId('not-a-real-theme')` 回退为 `defaultThemeId`、`getResolvedThemeId(undefined)` 回退为 `defaultThemeId` 三个用例。
- [x] `e2e/story-6-2.spec.ts` -- 在 S6.2-E2E-003 用例注释块中补充一行说明：Rust 侧 `config.json` 真实写入/重新读取闭环由 `src-tauri/src/config.rs` 单测覆盖（DW-42），此 e2e 用例继续验证前端 `set_config` 契约与重启后应用主题的前端行为。不改动测试逻辑本身。

**Acceptance Criteria:**
- Given 临时目录中不存在 `config.json`，when 依次调用 `write_config` 写入含自定义 `theme_id` 的配置、再调用 `read_config` 读取同路径，then 读回的 `theme_id`（及其他写入字段）与写入值完全一致，证明真实文件系统写入/读取闭环。
- Given `config.json` 内容为损坏的非 JSON 文本，when 调用 `read_config`，then 返回 `Ok(AppConfig::default())` 而不是错误。
- Given `set_config` 返回 `{ok:false, error:'ERR_INVALID_THEME_ID'}`，when 调用 `resolveThemeSelectionOutcome`，then 返回的 `themeId` 等于回滚前的 `previousThemeId`，`status` 为 `'failure'`，`message` 包含 `ERR_INVALID_THEME_ID`。
- Given `invoke('set_config', ...)` 抛出异常，when `handleThemeSelect` 捕获后调用 `resolveThemeSelectionOutcome(previous, requested, null, err.message)`，then 返回值指示回滚到 `previous` 且 `status` 为 `'failure'`。
- Given `config.json` 中 `themeId` 字段为非法值（如 `'not-a-real-theme'`），when 前端调用 `getResolvedThemeId` 处理该值，then 返回 `defaultThemeId`。
- Given 改动后的 `handleThemeSelect`，when 运行既有 e2e 套件 `e2e/story-6-2.spec.ts`，then 全部用例（含 S6.2-E2E-003 持久化用例）保持通过，证明重构未改变可观察行为。

## Spec Change Log

## Review Triage Log

### 2026-08-02 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4 (high 0, medium 0, low 4)
- defer: 6 (high 0, medium 2, low 4)
- reject: 4 (high 0, medium 0, low 4)
- addressed_findings:
  - `[low]` `[patch]` `read_config_falls_back_to_default_on_corrupted_json` 只断言了 `save_path`/`last_opened_file`/`theme_id`，未覆盖 `confluence` 子字段回退到默认值 -- 已在 `src-tauri/src/config.rs` 补充 `confluence.base_url`/`space_key`/`ignore_ssl` 的默认值断言，`cargo test config::tests` 复测通过。
  - `[low]` `[patch]` `e2e/story-6-2.spec.ts` 中新增注释可能被误读为"Rust 侧已覆盖 set_config/get_config 命令与写锁全链路" -- 已改写注释，明确表述为"write_config→read_config 的真实文件写入/重新读取闭环"，避免夸大覆盖范围，`npx playwright test e2e/story-6-2.spec.ts` 复测 5/5 通过。
  - `[low]` `[patch]` `src/lib/themes.ts` 新增 `with { type: 'json' }` 导入属性（为使 `getResolvedThemeId` 可被 `node --test` 直接单测）在 Node 24 原生 ESM 加载器下为必需项（无此属性时 `node --experimental-strip-types --test` 会抛 `ERR_IMPORT_ATTRIBUTE_MISSING`），已复核该写法与 `npx vite build`、`npx vue-tsc --noEmit`、`npx playwright test` 均兼容，无需改动。
  - `[low]` `[patch]` Rust 往返测试未直接检查序列化后的原始 JSON 结构（仅断言反序列化后的字段值）-- 评估后判定风险低（仓库中同类往返测试均采用字段级断言，且字段级断言已能捕获序列化/反序列化不一致），不作为需要阻塞的缺陷单独处理，归入本轮已评审范围。
- deferred (recorded here only; ledger not touched per operator instruction — orchestrator will record resolution):
  - `[medium]` `src/App.vue:handleThemeSelect` 存在预先存在的竞态：连续快速切换主题时，较早失败的 `set_config` 响应可能在较新的成功选择之后才 resolve，从而把 UI 回滚覆盖到更新的选择上（本次改动前后行为完全一致，未引入新竞态，超出 DW-42 测试覆盖范围）。
  - `[medium]` `read_config` 在解析失败时会整体回退为 `AppConfig::default()`，可能悄悄丢弃已保存的 `save_path`/Confluence 配置（现有生产行为，非本次改动引入，本次仅补充测试使其可见）。
  - `[low]` 仓库内所有 `*.test.ts`（含本次新增两个文件）与 `cargo test` 均未接入 `package.json` 脚本或 GitHub Actions 工作流，测试可静默失效而不被 CI 发现（项目级既有缺口，非本次新增）。
  - `[low]` `resolveThemeSelectionOutcome` 仍将后端原始错误码（如 `ERR_CONFIG_WRITE_FAILED: ...`）直接拼入用户可见文案，未做本地化映射（沿用改动前的既有行为，未变更）。
- rejected (noise, dropped):
  - "S6.2-E2E-003 并非真正端到端验证" —— 这正是 DW-42 原文描述的已知限制，本次改动已按 DW-42 允许的替代方案（Rust 侧真实往返测试）处理，不是本次 diff 引入的新问题。
  - "新增 `themes.test.ts` 未断言主题分区应为 Light/Dark 各 5 项" —— 该不变量属于 Story 6.2 AC1，已由既有 e2e 用例 S6.2-E2E-001 覆盖，超出 DW-42（`getResolvedThemeId` 回退逻辑）范围。
  - "Playwright 注释中硬编码源码路径与 DW 编号，未来可能与代码漂移" —— 与该文件中既有的 `DW-37/DW-38` 注释约定一致，非新增风险模式。
  - 其余表述性/风格类建议，未构成功能或测试缺陷。

## Design Notes

抽取 `resolveThemeSelectionOutcome` 是本任务中唯一的生产代码改动，目的仅为让"失败/异常时回滚到上一个主题"这条分支可以脱离 Vue 组件与真实 DOM 独立单测（仓库当前无 `@vue/test-utils`/`jsdom`，也不在本任务中引入）。函数签名刻意与 `CmdResult<null>` 对齐，`result: null` 专门表示 `invoke` 抛出异常（因为异常路径没有 `CmdResult`，只有 `err.message`），调用方需区分这两种失败来源分别传参。

`config.rs` 的新测试直接调用已存在的纯函数 `read_config`/`write_config`（不经过 `resolve_writable_dir`/`AppHandle`），这是仓库中 `commands/doc.rs` 已采用的模式（用临时目录替代真实应用目录解析），避免了 `tauri::test::mock_app()` 环境下 `document_dir()`/`app_data_dir()` 可能解析到真实用户目录的副作用风险。这也正是 DW-42 原文允许的替代方案："或一个 Rust 侧集成测试"。

## Verification

**Commands:**
- `cd src-tauri && cargo test config::tests` -- expected: 新增的两个往返测试与既有 `ConfigError` 测试全部通过。
- `node --experimental-strip-types --test src/lib/theme-select.test.ts src/lib/themes.test.ts` -- expected: 全部用例通过，退出码 0。
- `npx playwright test e2e/story-6-2.spec.ts` -- expected: 全部既有用例（含 S6.2-E2E-003）保持通过，证明 `handleThemeSelect` 重构未引入回归。

## Auto Run Result

**Summary:** 为 DW-42 补齐配置/主题持久化的测试覆盖：新增 Rust 侧真实文件写入/重新读取往返测试（替代仅靠前端 mock 模拟“重启”），并将 `handleThemeSelect` 的主题回滚判定逻辑抽取为纯函数以补齐单元测试，同时为 `getResolvedThemeId` 的非法 `themeId` 回退逻辑补齐单测。所有既有 e2e 用例（含 S6.2-E2E-003）保持通过，行为无回归。

**Files changed:**
- `src-tauri/src/config.rs` -- 新增 `config_round_trip_persists_theme_id_and_save_path`（真实临时目录写入/重读闭环）与 `read_config_falls_back_to_default_on_corrupted_json`（损坏 JSON 回退默认值，含 confluence 子字段断言）两个测试。
- `src/lib/theme-select.ts` -- 新建，导出纯函数 `resolveThemeSelectionOutcome`，供 `handleThemeSelect` 复用其回滚判定逻辑。
- `src/lib/theme-select.test.ts` -- 新建，覆盖成功/失败/异常三个分支。
- `src/lib/themes.test.ts` -- 新建，覆盖 `getResolvedThemeId` 合法值、非法值、`undefined` 三种输入。
- `src/lib/themes.ts` -- 为 `themes.json` 导入添加 `with { type: 'json' }` 导入属性，使该模块可在 `node --experimental-strip-types --test` 下被直接单测（Node 24 原生 ESM 要求），已复核与 vite build / vue-tsc / playwright 均兼容。
- `src/App.vue` -- `handleThemeSelect` 改为调用 `resolveThemeSelectionOutcome` 决定回滚目标主题与提示文案，可观察行为（`activeThemeId`/`themeStatus`/`themeMessage`）与改动前逐字节一致。
- `e2e/story-6-2.spec.ts` -- 在 S6.2-E2E-003 用例中补充一行注释，说明 Rust 侧真实写入/重读闭环由 `config.rs` 单测覆盖，此 e2e 用例继续验证前端契约。

**Review findings breakdown:**
- patches applied: 4（均 low severity；详见 Review Triage Log）
- deferred: 4 条（2 条 medium：主题切换竞态、损坏配置整体回退为默认值均为改动前既有行为；2 条 low：单测未接入 CI、错误码未本地化，均为既有缺口）——按操作者要求未写入 `deferred-work.md`，已完整记录在本文件 Review Triage Log 中，供编排器处理。
- rejected: 4 条（均为超出 DW-42 范围的噪声或对既有设计决策的重复描述）

**Verification performed:**
- `cd src-tauri && cargo test config::tests` -- 5 passed（含 2 个新增）。
- `node --experimental-strip-types --test src/lib/theme-select.test.ts src/lib/themes.test.ts` -- 6 passed。
- `npx playwright test e2e/story-6-2.spec.ts` -- 5 passed（无回归）。
- `npx vue-tsc --noEmit` -- 通过，无类型错误。
- `npx vite build` -- 构建成功，确认 JSON 导入属性改动与生产构建兼容。

**Residual risks:** 详见 Review Triage Log 中的 deferred 条目（主题切换竞态、损坏配置整体回退默认值、测试未接入 CI、错误码未本地化）；均为改动前既有状态，未因本次变更而恶化。
