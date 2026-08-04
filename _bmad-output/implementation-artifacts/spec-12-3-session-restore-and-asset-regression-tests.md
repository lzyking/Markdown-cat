---
title: '会话恢复与资源操作链回归测试 (DW-78)'
type: 'chore'
created: '2026-08-04'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
context: []
warnings: []
baseline_revision: 'a8b974e644e62ef945bf60564e7b67656562dc18'
final_revision: '13fa374c3bdbf0d2b16c57ae5f45d4ffef18de22'
---

<intent-contract>

## Intent

**Problem:** 当前没有任何回归测试覆盖"应用启动恢复上次打开文件 → 粘贴图片 → 保存 → 导出"这条完整生命周期链路（DW-78）。更严重的是，`src/App.vue` 的 `onMounted` 启动恢复逻辑在 `window.__TAURI_MOCK__` 存在时被硬编码跳过（`if (configRes.data.lastOpenedFile && !(window as any).__TAURI_MOCK__)`），导致该路径在现有 Playwright E2E 测试基础设施下**根本无法被测试到**，掩盖了 `documentBaseDir`（由 `currentFilePath` 派生）驱动粘贴图片保存位置、自动保存/另存为目标解析、以及导出资源解析的潜在回归风险。

**Approach:** 为 `onMounted` 的启动恢复分支增加一个仅测试环境使用的显式 opt-in 开关 `window.__TAURI_MOCK_ENABLE_STARTUP_RESTORE__`，默认关闭（不影响任何现有测试的当前行为），仅当该开关被显式置为 `true` 时才允许 mock 环境下真正执行恢复逻辑。随后新增 `e2e/story-12-3.spec.ts`，驱动该开关并模拟 `lastOpenedFile` 配置与 `read_external_document` 响应，串联验证：启动恢复文档内容与路径 → 粘贴剪贴板图片保存到恢复文档同目录并插入相对路径 → 自动保存写回恢复路径 → 导出 HTML 时正确内联该图片。

## Boundaries & Constraints

**Always:**
- 新增的 opt-in 开关默认值必须为“禁用启动恢复”（即未设置或为假值时，行为与当前完全一致），确保现有 25 个 `e2e/story-*.spec.ts` 测试文件不受影响。
- 复用 `e2e/fixtures.ts` 现有的 `__TAURI_MOCK__` handler 注册机制与 `story-7-2.spec.ts`/`story-8-1.spec.ts` 中已验证的剪贴板粘贴与导出断言模式，不重复发明新的 mock 基础设施。
- 新测试文件命名遵循现有约定：`e2e/story-12-3.spec.ts`。
- 测试须覆盖真实的启动恢复路径（即真正执行 `src/App.vue` 第 1301 行附近的恢复分支代码），而非绕过它伪造状态。

**Block If:** 无需人工输入的决策点——若发现 `documentBaseDir` 计算逻辑或粘贴/保存/导出链路存在需要产品决策的行为分歧（例如恢复失败时的正确回退路径应为何），暂停并按 HALT 规则处理；预期本次调查不会触发此项。

**Never:**
- 不修改启动恢复失败处理逻辑（`resolveStartupRestoreOutcome`、`shouldClearStaleConfig` 等）的既有行为，只解除其测试盲区。
- 不引入真实文件系统 I/O 或启动完整 Tauri 桌面应用；继续使用 Vite dev server + Playwright 的既有 mock 策略。
- 不为其他未完成的 DW 条目（DW-76、DW-77、DW-79 等，均属 Story 12.1/12.2）编写测试。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 启动恢复成功 | `__TAURI_MOCK_CONFIG__.lastOpenedFile` 指向已存在路径，`read_external_document` mock 返回 `ok: true` | `currentFilePath` 与编辑器内容更新为恢复文档；`documentBaseDir` 等于该路径的父目录 | 无错误 |
| 恢复后粘贴图片 | 在已恢复文档中触发剪贴板图片粘贴事件 | `save_image_asset` 以恢复文档所在目录为 `targetDir` 被调用；Markdown 插入 `./img_...` 相对路径引用 | 无错误 |
| 恢复后自动保存 | 粘贴后文档内容变化，触发 300ms 防抖自动保存 | `save_document_as` 以恢复文档路径为 `targetPath`、含图片引用的内容被调用 | 无错误 |
| 恢复后导出 HTML | 触发"文件 → 导出为 HTML" | `read_image_asset` 以恢复文档目录下的图片绝对路径被调用；导出 HTML 内联 Base64 图片且不包含相对路径引用 | 无错误 |

</intent-contract>

## Code Map

- `src/App.vue` -- `onMounted` 启动恢复分支（约第 1301 行）当前对 `__TAURI_MOCK__` 无条件跳过，需要增加 opt-in 测试开关。
- `e2e/fixtures.ts` -- 提供 `__TAURI_MOCK__.invoke`/`__registerHandler`/`dialog` mock 与 fake timers，新测试复用其现有 handler（`get_config`、`save_image_asset`、`save_document_as`、`read_image_asset`）。
- `e2e/story-7-2.spec.ts` -- 剪贴板粘贴图片测试的既有实现范式（`dispatchClipboardImagePaste` 辅助函数），新测试参考其结构复制精简版辅助函数。
- `e2e/story-8-1.spec.ts` -- 导出 HTML 测试的既有实现范式（菜单交互、`read_image_asset` mock、导出内容断言）。
- `_bmad-output/implementation-artifacts/deferred-work.md` -- DW-78 条目，完成后需标记状态。

## Tasks & Acceptance

**Execution:**
- [x] `src/App.vue` -- 将第 1301 行 `if (configRes.data.lastOpenedFile && !(window as any).__TAURI_MOCK__)` 改为 `if (configRes.data.lastOpenedFile && (!(window as any).__TAURI_MOCK__ || (window as any).__TAURI_MOCK_ENABLE_STARTUP_RESTORE__))`，使测试可通过设置 `window.__TAURI_MOCK_ENABLE_STARTUP_RESTORE__ = true` 显式启用 mock 环境下的真实恢复路径，默认行为不变 -- 解除该路径在现有测试基础设施下无法被覆盖的根本限制。
- [x] `e2e/story-12-3.spec.ts` (新建) -- 编写完整生命周期回归测试：`page.addInitScript` 设置 `__TAURI_MOCK_ENABLE_STARTUP_RESTORE__`、`__TAURI_MOCK_CONFIG__.lastOpenedFile` 与 `read_external_document` handler → `page.goto('/')` 验证恢复内容 → 派发剪贴板图片粘贴事件验证 `save_image_asset` 调用目录与 Markdown 插入结果 → 触发自动保存防抖计时器验证 `save_document_as` 写回恢复路径 → 触发导出 HTML 菜单项验证 `read_image_asset` 调用与导出内容内联图片 -- 覆盖 DW-78 描述的完整回归缺口。
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- 将 DW-78 的 `resolution` 行改写为明确注明"仅覆盖 restore → paste → autosave → **HTML 导出** 链路"（明确排除 Save As 迁移、PDF 导出、Confluence 发布），避免清理台账过度声称覆盖范围 -- 保持台账准确性，防止误导后续审计认为 PDF/Confluence/Save-As 回归已被覆盖。
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- 新增三条 `open` 状态的 deferred-work 条目（`DW-83`：Save As 迁移场景下 `documentBaseDir`/资源迁移回归测试缺失；`DW-84`：PDF 导出时 `documentBaseDir` 驱动的图片解析回归测试缺失；`DW-85`：Confluence 发布时 `documentBaseDir` 驱动的本地图片解析回归测试缺失），格式与 DW-78 一致（`origin`/`location`/`reason`/`status`）-- 将本次 Review 发现的真实覆盖缺口转化为可追踪的台账条目，而非静默丢弃。

**Acceptance Criteria:**
- Given `__TAURI_MOCK_ENABLE_STARTUP_RESTORE__` 为 `true` 且配置含 `lastOpenedFile`，when 应用挂载，then 编辑器加载恢复文档内容且 `currentFilePath` 等于该路径。
- Given 恢复文档已加载，when 用户粘贴剪贴板图片，then `save_image_asset` 的 `targetDir` 等于恢复文档的父目录，且编辑器内容包含匹配 `./img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png` 的相对路径引用。
- Given 恢复文档粘贴图片后内容变化，when 300ms 防抖计时器触发，then `save_document_as` 以恢复文档路径为 `targetPath` 被调用，且内容包含图片引用。
- Given 恢复文档含粘贴图片引用，when 用户执行"导出为 HTML"，then `read_image_asset` 以恢复文档目录下的图片绝对路径被调用，导出 HTML 包含该图片的 Base64 内联数据且不包含原始相对路径。
- Given 未设置 `__TAURI_MOCK_ENABLE_STARTUP_RESTORE__`（现有 25 个测试文件的默认状态），when 应用挂载且配置含 `lastOpenedFile`，then 启动恢复分支仍被跳过（行为与变更前完全一致）。

## Spec Change Log

### 2026-08-04 — Review pass 1 (bad_spec repair)
- **Triggering finding:** Task 3 instructed marking DW-78 fully `resolved` while the actual new coverage only exercises restore → paste → autosave → **HTML export**. DW-78's own `reason` text explicitly names Save-As migration, PDF export, and Confluence export as depending on `documentBaseDir`, none of which this story's test touches. Declaring DW-78 fully resolved therefore overstates coverage and could mislead future deferred-work audits into believing PDF/Confluence/Save-As regressions are now guarded.
- **Amendment:** Task 3 rewritten to make the DW-78 `resolution` note explicitly scope-limited to the restore→paste→autosave→HTML-export chain. Added a new Task 4 requiring three new `open` deferred-work entries (DW-83 Save-As migration, DW-84 PDF export image resolution, DW-85 Confluence publish image resolution) so the untested surfaces are tracked rather than silently closed.
- **Known-bad state avoided:** A deferred-work ledger that falsely claims full closure of a documentBaseDir-dependent regression risk, causing the three untested export/save surfaces to silently regress with no tracked follow-up.
- **KEEP:** `src/App.vue`'s `__TAURI_MOCK_ENABLE_STARTUP_RESTORE__` opt-in guard and `e2e/story-12-3.spec.ts`'s full restore→paste→autosave→HTML-export test (both tests passing, 124/124 full-suite pass) are correct and must survive re-derivation unchanged — only the deferred-work.md bookkeeping needs amendment, no code or test logic changes.

## Review Triage Log

### 2026-08-04 — Review pass
- intent_gap: 0
- bad_spec: 1: (high 0, medium 1, low 0)
- patch: 1: (high 0, medium 0, low 1)
- defer: 4: (high 0, medium 0, low 4)
- reject: 3: (high 0, medium 0, low 3)
- addressed_findings:
  - none

### 2026-08-04 — Review pass 2
- intent_gap: 0
- bad_spec: 0
- patch: 1: (high 0, medium 0, low 1)
- defer: 2: (high 0, medium 0, low 2)
- reject: 13: (high 0, medium 0, low 13)
- addressed_findings:
  - `[low]` `[patch]` `__TAURI_MOCK_ENABLE_STARTUP_RESTORE__` opt-in check in `src/App.vue` widened from truthy to strict `=== true`, preventing a stray truthy value from silently flipping startup-restore behavior under mock.

## Verification

**Commands:**
- `npx playwright test e2e/story-12-3.spec.ts` -- expected: 全部新增测试通过。
- `npx playwright test` -- expected: 全部 E2E 测试套件（含既有 25 个文件）通过，确认无回归。

## Auto Run Result

**Summary:** Added a Playwright E2E regression test (`e2e/story-12-3.spec.ts`) covering the "restore last-opened file on startup → paste clipboard image → autosave → export HTML" lifecycle (DW-78). This path was previously untestable because `src/App.vue`'s `onMounted` startup-restore branch unconditionally skipped itself under the Playwright Tauri-API mock; a minimal opt-in test hook (`window.__TAURI_MOCK_ENABLE_STARTUP_RESTORE__ === true`) now allows the real restore logic to run under mock without changing default behavior for any of the existing 25 spec files.

**Files changed:**
- `src/App.vue` -- one-line guard change: startup-restore branch now also runs under mock when `window.__TAURI_MOCK_ENABLE_STARTUP_RESTORE__ === true` (default unset/false preserves prior behavior exactly).
- `e2e/story-12-3.spec.ts` (new) -- two tests: (1) full restore → paste-image → autosave → export-HTML lifecycle, asserting `documentBaseDir`-derived paths at each stage; (2) regression guard proving the restore branch stays skipped without the opt-in flag.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- DW-78 marked `resolved`, scoped precisely to the restore→paste→autosave→HTML-export chain actually covered; three new `open` entries added (DW-83 Save-As migration, DW-84 PDF export, DW-85 Confluence publish) for the `documentBaseDir`-dependent surfaces DW-78's original reason named but this story does not cover; two additional `defer` entries recorded for the untested stale-config-cleanup failure path and the now-testable `openRequestToken` race (already tracked as DW-79).

**Review findings breakdown:**
- Pass 1: 1 bad_spec (medium) — DW-78 was about to be marked fully resolved while only HTML-export coverage existed, misrepresenting the ledger; spec amended to scope the resolution precisely and require filing DW-83/84/85. 1 patch, 4 defer, 3 reject (all mooted by the bad_spec loopback).
- Pass 2 (post-repair): 0 intent_gap, 0 bad_spec. 1 patch applied (opt-in flag check widened from truthy to strict `=== true`). 2 defer items recorded (stale-config cleanup path untested; `openRequestToken` race now testable but not yet tested, tracked under existing DW-79). 13 reject (all either matched established codebase/test conventions already used across the other 25 spec files, or were misreadings of the diff).

**Follow-up review recommendation:** `false` — the only code change is a single-line, narrowly-scoped opt-in guard with a strict equality check, verified against the full 124-test suite with zero regressions; the review loop's only structural fix was ledger-scoping text, not application logic.

**Verification performed:**
- `npx playwright test e2e/story-12-3.spec.ts` -- 2 passed, 0 failed.
- `npx playwright test` (full suite) -- 124 passed, 0 failed.

**Residual risks:** Save-As migration, PDF export, and Confluence publish image-resolution for a restored session remain untested (tracked as DW-83/84/85); the mock-restore failure/stale-config-cleanup path and the `openRequestToken` race remain untested under the new opt-in hook (tracked as deferred-work entries and existing DW-79). None of these block DW-78's original claim as now precisely scoped.
