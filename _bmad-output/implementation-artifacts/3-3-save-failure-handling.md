---
title: 'Story 3.3: 实现保存失败提示与保底编辑体验'
type: 'feature'
created: '2026-07-23'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'NO_VCS'
context:
  - /_bmad-output/planning-artifacts/epics.md
  - /_bmad-output/planning-artifacts/prds/prd-Markdown%20Cat-2026-07-21/prd.md
  - /_bmad-output/planning-artifacts/architecture/architecture-Markdown%20Cat-2026-07-21/ARCHITECTURE-SPINE.md
  - /_bmad-output/planning-artifacts/ux-designs/ux-Markdown%20Cat-2026-07-21/DESIGN.md
  - /_bmad-output/planning-artifacts/ux-designs/ux-Markdown%20Cat-2026-07-21/EXPERIENCE.md
  - /_bmad-output/implementation-artifacts/epic-1-context.md
  - /_bmad-output/implementation-artifacts/2-1-source-editor-state-channel.md
  - /_bmad-output/implementation-artifacts/2-2-readonly-preview-markdown-rendering.md
  - /_bmad-output/implementation-artifacts/2-3-title-bar-state-display.md
  - /_bmad-output/implementation-artifacts/2-4-empty-state-responsive-layout.md
  - /_bmad-output/implementation-artifacts/2-5-window-dpi-adaptation.md
  - /_bmad-output/implementation-artifacts/3-1-debounced-autosave.md
  - /_bmad-output/implementation-artifacts/3-2-save-success-feedback.md
---

## Intent

**Problem:** 当由于目标保存目录不可写、磁盘满或文件被占用导致文件保存失败时，如果在 UI 层没有醒目明确的警告（标题栏红色圆点与明确原因状态栏提示），或者保存失败中断了前端编辑器导致内容丢失、截断，会导致严重的数据安全事故。系统需要在失败时提供明确可读的错误归因、零损坏的内存编辑器保护以及持续重试拯救机制。

**Approach:** 
1. 在前端 `App.vue` / 提示格式化模块中建立错误码到友好提示的解析字典：
   - `ERR_SAVE_FAILED` / `ERR_DIR_NOT_WRITABLE` 等统一格式化为 `保存失败：{reason}`（如 `保存失败：保存目录不可写`）。
   - 不在 Rust 中硬编码中文，保持通用错误码返回，前端统一处理。
2. 确保在保存失败时：
   - 标题栏 `saveStatus = 'failure'` 驱动呈现红色圆点（`--color-error` = `#F85149` = `rgb(248, 81, 73)`）。
   - 状态栏显示失败文案与 error 红色。
   - 编辑器 `content` 绝对不受任何负面影响，用户可继续无缝输入或修改内容。
3. 允许用户在修改路径或恢复权限后，后续的 300ms 防抖保存自动重新发起尝试；一旦某次尝试成功，错误状态与红色圆点立即被清空并恢复为成功绿色。
4. 编写 `e2e/story-3-3.spec.ts`，覆盖保存失败提示渲染、错误码解析、文本保护与后续重试恢复场景。

## Boundaries & Constraints

**Always:**
- 失败提示格式必须为 `保存失败：{reason}`（错误原因必须清晰具体，避免模糊提示）。
- 失败状态下标题栏圆点与状态栏提示颜色必须为 error 规范（`var(--color-error)`）。
- 无论写盘尝试发生任何后端错误，内存中的 `content` 绝不能被部分清空、截断或丢弃。
- 保存失败后，用户继续在编辑器打字时，系统仍需允许后续防抖存盘重试。
- 必须复用 `e2e/fixtures.ts` 编写 Playwright E2E 测试。

**Ask First:**
- 是否需要弹出强烈的系统 Modal 弹窗或模态阻断？——不需要，EXPERIENCE.md 规范约束由状态栏和标题栏承载保存反馈，不使用打扰式 Modal 弹窗。

**Never:**
- 绝不能在保存失败时覆盖清空或修改用户在编辑器中已输入的 `content` 字符串。
- 不要在保存失败后将防抖自动保存机制永久锁死。
- 不要破坏已有的编辑器输入、Markdown 渲染与 1:1 双栏布局。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 保存命令返回失败 | `save_document` 返回 `{ ok: false, error: 'ERR_SAVE_FAILED' }` | 标题栏红色圆点，状态栏显示 `保存失败：保存文件失败`（红色） | 内容完好，可继续编辑 |
| 目录不可写报错 | `save_document` 返回 `{ ok: false, error: 'ERR_DIR_NOT_WRITABLE' }` | 状态栏显示 `保存失败：保存目录不可写` | 内容完好 |
| 保存失败后用户继续键入 | 用户在编辑器追加文本 | `content` 正常更新，打字时标题栏归 unsaved，防抖计时重置准备下次重试 | 无 |
| 再次重试成功 | 下一次 `save_document` 返回 `{ ok: true }` | 失败状态清空，标题栏切为绿色圆点，状态栏显示 `已保存至 {filename}` | 恢复成功态 |

## Code Map

- `src/App.vue` — **修改/补充**：错误码映射函数 `formatSaveError(errCode)` 以及失败反馈逻辑。
- `e2e/story-3-3.spec.ts` — **新文件**：E2E 测试，覆盖保存失败显示、错误原因解析、编辑器保护与重试恢复。

## Tasks & Acceptance Criteria

**Execution:**
- [x] 修改 `src/App.vue`：添加 `formatSaveError(errCode: string)` 错误文案转换逻辑。
- [x] 检查并确保在 `save_document` 返回失败时，设置 `saveStatus = 'failure'`，并将 `formatSaveError` 格式化后的提示赋给 `saveMessage`。
- [x] 新增 `e2e/story-3-3.spec.ts`，测试失败显示、错误原因对齐、编辑器内容零破坏、打字重试与恢复成功场景。
- [x] 验证 `cargo check` / `cargo build` 无报错。
- [x] 验证 `npm run build` TypeScript 类型检查通过。
- [x] 验证全量 E2E 回归测试全部通过。

**Acceptance Criteria:**
- [x] Given 保存目标目录不可写、磁盘已满或文件被占用，When 后端保存命令返回失败，Then 状态栏显示“保存失败：{reason}”，标题栏状态切换到保存失败态（红色圆点），错误原因清晰可读。
- [x] Given 一次保存失败发生，When 用户继续在编辑器中输入，Then 编辑器内容保持原状，系统允许后续继续触发新的自动保存尝试，保存失败不导致已打开文件被部分写入或截断。
- [x] Given 保存失败提示已显示，When 后续某次自动保存成功，Then 失败提示被成功提示完全替换，标题栏与状态栏恢复成功绿色一致态。
- [x] Given 运行 `npm run build`，When 构建完成，Then 无 TypeScript 或 Vue 编译错误。
- [x] Given 运行所有 E2E 测试，When 测试完成，Then 全部通过，无回归。

## Verification

**Commands:**
- `cargo check` — ✅ 零错误。
- `npm run build` — ✅ 类型检查通过。
- `npx playwright test e2e/story-3-3.spec.ts` — ✅ 3 个保存失败处理用例全过。
- `npx playwright test` — ✅ 55 个全量 E2E 回归测试全过。

## Dev Agent Record

### Agent Model Used

(to be filled by dev agent)

### Completion Notes

- 2026-07-23：完成 Story 3.3 实现与验证。实现 `formatSaveError` 错误码解析与友好格式化；验证保存失败时标题栏红色圆点、状态栏 `保存失败：{reason}`（红色）、内存 `content` 零损伤以及打字重新触发防抖重试与恢复成功能力。
- 新增 3 个 E2E 测试用例，55 个全量 E2E 测试 100% 通过。

### File List

- 修改：`src/App.vue`（新增 `formatSaveError` 错误转换与失败逻辑集成）
- 新增：`e2e/story-3-3.spec.ts`（3 个保存失败处理 E2E 测试用例）

## Change Log

- 2026-07-23: 创建 Story 3.3 故事文件。明确保存失败提示与保底编辑体验（红色圆点、错误归因格式化、内容零破坏与重试恢复）的验收与 E2E 规范。
- 2026-07-23: 开发与测试完成，状态切换为 `review`。新增 3 个 E2E 测试用例，55 个全量测试全部通过。
- 2026-07-23: Code Review 通过（Clean review）。状态 `review` → `done`。


