---
title: 'Story 4.2: 完成系统文件夹选择与配置写入'
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
  - /_bmad-output/implementation-artifacts/3-3-save-failure-handling.md
  - /_bmad-output/implementation-artifacts/4-1-save-path-dialog.md
---

## Intent

**Problem:** Story 4.1 完成了 `SettingsModal` 对话框的样式与打开退出逻辑，但点击 [选择...] 尚未调起文件夹选择指令，且点击 [确认] 尚未调用后端 `set_config` 将新路径持久化到 `config.json`，也未完成 Action Item A7（将新路径实时连通给 Epic 3 自动存盘流程）。

**Approach:** 
1. 在后端 Rust 中增加/确认可供调用的 `select_save_dir` 或使用 Tauri 2.x 指令能力，在 mock 与真机下返回被选中的目录路径。
2. 完善 `SettingsModal.vue`：
   - 点击 [选择...] 按钮时触发 `invoke('select_save_dir')`，获得选定的绝对路径并更新到 `selectedPath`，解除 [确认] 按钮禁用状态；
   - 点击 [确认] 按钮时调用 `invoke('set_config', { config: { savePath: selectedPath } })`；
   - 若 `set_config` 返回 `{ ok: true }`，触发父组件 `update-path`，更新全局 `currentSavePath` 并关闭 Modal；
   - 若 `set_config` 返回 `{ ok: false, error: '...' }`，在 Modal 内展示红色错误提示且不关闭 Modal。
3. 闭环 Action Item A7：
   - 在 `App.vue` 中，当 `currentSavePath` 更新后，后续的自动保存 `save_document`（包含自定义目录保存命令 `save_document_to_dir`）使用新指定的保存路径，若新路径不可写，无缝触发 Story 3.3 的失败处理。
4. 编写 `e2e/story-4-2.spec.ts`，全量覆盖选择路径、确认持久化写盘、错误阻断与后续保存生效。

## Boundaries & Constraints

**Always:**
- 点击 [确认] 必须调用既有 `set_config` 命令写入配置文件。
- 写入失败时，对话框不得关闭，并在对话框内部渲染明确错误提示。
- 写入成功后关闭对话框，后续存盘必须使用更新后的路径。
- 配置文件协议遵循 `{ ok: boolean, error?: string }`。
- 必须复用 `e2e/fixtures.ts` 编写 Playwright E2E 测试。

**Ask First:**
- 更改保存路径是否影响已有保存成功的文件？——不影响，新路径仅对后续保存的默认目录生效，不移动或修改已存在的磁盘文件。

**Never:**
- 不要在配置写入失败时强行关闭 Modal 对话框。
- 不要破坏已有的双栏编辑、Markdown 渲染、300ms 防抖与失败兜底机制。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 点击 [选择...] 按钮 | 用户点击 modal 中的 [选择...] | 调起文件夹选择器，选择路径回显到输入框，[确认] 按钮启用 | 若用户取消选择，保持原状态 |
| 点击 [确认] 成功 | 点击 [确认] 且 `set_config` 成功 | 新路径写入 `config.json`，Modal 关闭，`currentSavePath` 更新 | 无 |
| 点击 [确认] 失败 | 点击 [确认] 但 `set_config` 返回 error | Modal 不关闭，渲染红色错误文案 `配置保存失败：{reason}` | 留存 Modal 供重新选择 |
| 存盘连通 A7 | 新路径更新后触发 300ms 自动保存 | 文件写入新路径目录下；若新路径无写权限，触发 Story 3.3 红色失败状态 | 由 Story 3.3 接管 |

## Code Map

- `src-tauri/src/commands/config.rs` & `lib.rs` — **检查/补充**：`select_save_dir` 或类似指令支撑。
- `src/components/SettingsModal.vue` — **修改**：选择路径与确认调用 `set_config`，展示错误信息。
- `src/App.vue` — **修改**：响应新路径更新，连通 `save_document_to_dir`。
- `e2e/fixtures.ts` — **修改**：增加 `select_save_dir` Mock 支持。
- `e2e/story-4-2.spec.ts` — **新文件**：E2E 测试，覆盖选择路径、确认写盘、错误阻断与存盘生效。

## Tasks & Acceptance Criteria

**Execution:**
- [x] 在 `src-tauri/src/commands/config.rs` 或相关模块增加 `select_save_dir` Tauri 指令。
- [x] 在 `e2e/fixtures.ts` 中注册 `select_save_dir` Mock。
- [x] 修改 `src/components/SettingsModal.vue`：处理选择与确认逻辑，渲染写入失败提示。
- [x] 修改 `src/App.vue`：连通新保存路径至 `save_document_to_dir` 存盘命令。
- [x] 新增 `e2e/story-4-2.spec.ts`：测试路径选择、`set_config` 持久化、失败留存 Modal 及后续存盘生效。
- [x] 验证 `cargo check` / `cargo build` 无报错。
- [x] 验证 `npm run build` TypeScript 类型检查通过。
- [x] 验证全量 E2E 回归测试全部通过。

**Acceptance Criteria:**
- [x] Given 保存路径对话框已打开，When 用户点击“选择...”，Then 打开系统文件夹选择器，仅允许选择已存在目录。
- [x] Given 用户在系统选择器中确认了一个目录，When 返回对话框并点击“确认”，Then 新路径通过 `set_config` 保存到 JSON 配置文件；若写入失败，对话框不关闭并显示明确错误。
- [x] Given 用户选择路径后完成确认，When 新配置写入成功，Then 后续自动保存默认使用新的保存路径，当前已打开文档的实际路径不被自动破坏。
- [x] Given 用户选择的新路径不可写，When 自动保存触发，Then 由 Story 3.3 的失败处理接管（状态栏红字 + 标题栏红点）。
- [x] Given 运行 `npm run build`，When 构建完成，Then 无 TypeScript 或 Vue 编译错误。
- [x] Given 运行所有 E2E 测试，When 测试完成，Then 全部通过，无回归。

## Verification

**Commands:**
- `cargo check` — ✅ 零错误。
- `npx vue-tsc --noEmit` — ✅ 类型检查通过。
- `npx playwright test e2e/story-4-2.spec.ts` — ✅ 4 个系统文件夹选择与写入测试全过。
- `npx playwright test` — ✅ 62 个全量 E2E 测试全过。

## Dev Agent Record

### Agent Model Used

(to be filled by dev agent)

### Completion Notes

- 2026-07-23：完成 Story 4.2 实现与验证。增加 Rust `select_save_dir` 指令并在 Mock 下透传；更新 `SettingsModal.vue` 处理文件夹选择、调用 `set_config` 持久化，以及在保存失败时不关闭 Modal 渲染明确错误；在 `App.vue` 中连通 **Action Item A7**，让后续自动存盘指令使用更新后的路径。
- 新增 4 个 E2E 测试用例，62 个全量 E2E 测试 100% 通过。

### File List

- 修改：`src-tauri/src/commands/config.rs` & `lib.rs`（增加与注册 `select_save_dir`）
- 修改：`e2e/fixtures.ts`（注册 `select_save_dir` mock）
- 修改：`src/components/SettingsModal.vue`（系统选择、`set_config` 持久化、失败保留 Modal）
- 修改：`src/App.vue`（响应路径更新与存盘链路 A7 连通）
- 新增：`e2e/story-4-2.spec.ts`（4 个 E2E 测试用例）

## Change Log

- 2026-07-23: 创建 Story 4.2 故事文件。规范系统文件夹选择、`set_config` 配置写入、失败留存与存盘连通 (Action Item A7)。
- 2026-07-23: 开发与测试完成，状态切换为 `review`。新增 4 个 E2E 测试用例，62 个全量测试全部通过。
- 2026-07-23: Code Review 通过（Clean review）。状态 `review` → `done`。


