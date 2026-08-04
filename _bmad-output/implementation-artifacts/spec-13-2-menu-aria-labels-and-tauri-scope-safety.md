---
title: '菜单无障碍 Label 与 HTML 导出作用域安全'
type: 'refactor'
created: '2026-08-04'
status: 'done'
baseline_revision: 'c44a6ed2ca2e2fd7c25c2f12697a3573466c378c'
final_revision: 'ca5468c38eb7f274de3b9f459c34b331d21c1294'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** `MenuBar.vue` 中三个 `role="menu"` 容器（Markdown Cat 菜单、文件菜单、Theme 子菜单）缺少 `aria-label`/`aria-labelledby`，屏幕阅读器无法播报菜单名称 (DW-56)；HTML 导出 (`handleExportHtml` in `App.vue`) 复用了 `save_document_as` 后端命令写出导出文件，该命令会在写入成功后调用 `asset_protocol_scope().allow_directory()` 放宽 `asset://` 协议可访问范围——这对"另存为"文档是合理副作用，但对 HTML 导出目标目录（可能是任意目录，如 Desktop/Downloads）而言是无故的安全放宽 (DW-72)。

**Approach:** 为三个菜单容器补充 `aria-label`（复用触发器可见文本）；在 `src-tauri/src/commands/doc.rs` 新增一个不放宽 asset scope 的纯写文件命令（如 `write_export_file`），供 `handleExportHtml` 调用替代 `save_document_as`，并在 `lib.rs` 注册该命令。

## Boundaries & Constraints

**Always:** 保持三个 `role="menu"` 容器现有的 DOM 结构、类名、事件绑定、键盘交互不变，仅新增 `aria-label` 属性；新命令必须复用 `doc.rs` 现有的父目录创建 + 写入逻辑（与 `save_document_as` 一致的错误码语义：`ERR_DIR_CREATE_FAILED` / `ERR_SAVE_FAILED` 或等价前缀），但绝不调用 `asset_protocol_scope()`；`save_document_as` 自身以及其他调用方（"打开文件后另存为"、"发布前另存"等真实文档保存路径）保持不变，不移除其 scope 放宽行为。

**Block If:** 无（本故事范围内无需人工决策的分支）。

**Never:** 不改变 HTML 导出功能的用户可见行为（导出对话框、文件内容、成功/失败提示文案均不变，仅替换其底层写入所调用的后端命令）；不为 PDF 导出或 Confluence 发布路径新增/移除 scope 放宽（超出 DW-72 范围）；不引入新的 npm/cargo 依赖。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New command happy path | 合法 `target_path`（父目录已存在或可创建）+ `content` | 文件写入成功，返回 `SaveResult { filename, path }`，`ok: true` | 无错误 |
| New command scope isolation | 写入到此前从未被放行的临时目录 | 写入后 `app.asset_protocol_scope().is_allowed(&target_dir)` 为 `false`（对照 `save_document_as` 会返回 `true`） | 无错误 |
| Parent dir missing | `target_path` 的父目录不存在 | 自动创建父目录后写入成功 | 若创建失败，返回 `ok: false` 与 `ERR_DIR_CREATE_FAILED` 前缀错误 |
| Write failure | 目标路径不可写（如权限拒绝） | 返回 `ok: false` | 错误信息前缀 `ERR_SAVE_FAILED` |
| Menu aria-label present | 打开任一菜单/子菜单 | 对应 `role="menu"` 容器可在无障碍树中查得非空 `aria-label`，值与触发文本一致（"Markdown Cat" / "文件" / "Theme"） | 无错误 |

</intent-contract>

## Code Map

- `src/components/MenuBar.vue` -- 三个 `role="menu"` 容器（第 177、201、256 行附近）需分别补充 `aria-label="Markdown Cat"` / `aria-label="文件"` / `aria-label="Theme"`。
- `src-tauri/src/commands/doc.rs` -- 新增 `write_export_file` 命令（及其内部 impl 函数），复用 `save_document_as` 的父目录创建+写入逻辑，但不调用 `asset_protocol_scope()`；`SaveResult` 结构体可直接复用。
- `src-tauri/src/lib.rs` -- 在 `tauri::generate_handler!` 列表中注册新命令 `commands::doc::write_export_file`。
- `src/App.vue` -- `handleExportHtml`（约第 382-441 行）中第 419 行的 `invoke('save_document_as', ...)` 改为 `invoke('write_export_file', ...)`，其余逻辑（保存路径选择、渲染、成功/失败提示）不变。

## Tasks & Acceptance

**Execution:**
- [x] `src/components/MenuBar.vue` -- 为第 177、201、256 行的三个 `class="menu-dropdown"`/`class="submenu-dropdown"` 且 `role="menu"` 的 `<div>` 分别添加 `aria-label="Markdown Cat"`、`aria-label="文件"`、`aria-label="Theme"` -- 使屏幕阅读器能播报菜单名称 (DW-56)
- [x] `src-tauri/src/commands/doc.rs` -- 新增 `write_export_file(target_path: String, content: String) -> CmdResult<SaveResult>` 命令：创建父目录（失败返回 `ERR_DIR_CREATE_FAILED`）、写入文件（失败返回 `ERR_SAVE_FAILED`）、成功返回 `SaveResult`，全程不触碰 `asset_protocol_scope` -- 提供导出场景专用的"纯写入"命令，避免复用 `save_document_as` 带来的隐式 scope 放宽 (DW-72)
- [x] `src-tauri/src/lib.rs` -- 在 `invoke_handler` 的 `generate_handler!` 列表中加入 `commands::doc::write_export_file` -- 使前端可调用新命令
- [x] `src/App.vue` -- 将 `handleExportHtml` 中第 419 行的 `invoke('save_document_as', ...)` 替换为 `invoke('write_export_file', ...)`（参数 `targetPath`/`content` 不变） -- 切断 HTML 导出路径对 `save_document_as` 的复用
- [x] `src-tauri/src/commands/doc.rs` (tests mod) -- 新增测试验证 `write_export_file` 对应的 impl 函数写入内容正确，且**不**放宽目标目录的 asset scope（对照现有 `save_image_asset_impl_writes_file_and_allows_asset_directory` 测试模式，断言方向相反） -- 覆盖 I/O 矩阵中的 scope isolation 场景

**Acceptance Criteria:**
- Given 打开 Markdown Cat / 文件 / Theme 任一菜单，when 使用屏幕阅读器或无障碍树检查工具查看对应 `role="menu"` 容器，then 该容器具有非空 `aria-label`，值分别为 "Markdown Cat"、"文件"、"Theme"。
- Given 用户执行"导出为 HTML"并选择此前未被 `asset://` 协议放行过的目标目录，when 导出成功完成，then 该目标目录**不会**被加入 `asset_protocol_scope` 的放行范围（区别于"另存为"文档场景）。
- Given 用户执行"另存为"文档（非 HTML 导出），when 保存成功，then `save_document_as` 现有的 scope 放宽行为保持不变（回归验证，不应被本故事破坏）。

## Verification

**Commands:**
- `cd src-tauri && cargo test doc::` -- expected: 新增的 `write_export_file` 相关测试与全部既有 `doc.rs` 测试通过
- `cd src-tauri && cargo build` -- expected: 编译成功，无报错（新命令类型/注册无误）
- `npm run build` -- expected: 前端构建成功（`vue-tsc --noEmit` 通过，`MenuBar.vue`/`App.vue` 无类型错误）
- `grep -n "aria-label" src/components/MenuBar.vue` -- expected: 命中三处新增的 `aria-label`（Markdown Cat / 文件 / Theme）
- `grep -n "write_export_file" src/App.vue src-tauri/src/lib.rs src-tauri/src/commands/doc.rs` -- expected: 三个文件均命中，确认命令已定义、注册且被前端调用

## Review Triage Log

### 2026-08-04 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1 (high 1, medium 0, low 0)
- defer: 1 (low 1)
- reject: 8
- addressed_findings:
  - `[high]` `[patch]` HTML 导出后端命令从 `save_document_as` 改为 `write_export_file` 后，`e2e/fixtures.ts` 的 mock IPC 层未注册 `write_export_file` 处理器（会对未知命令抛错），且 `e2e/story-8-1.spec.ts`（4 处）与 `e2e/story-12-3.spec.ts`（2 处）仍断言 HTML 导出场景触发 `save_document_as`；已在 `e2e/fixtures.ts` 新增 `write_export_file` mock handler，并将上述两个 spec 文件中 HTML 导出相关的断言由 `save_document_as` 改为 `write_export_file`（`story-12-3.spec.ts` 中与 `restored.md` 另存为相关的 `save_document_as` 断言保持不变，因为该路径未被本故事改动）。修复后完整 e2e 套件（124 用例）与 `cargo test`（46 用例）全部通过。

其余发现的处理：`write_export_file` 作为通用文件写入原语缺少导出场景专属护栏（如扩展名校验）— 记为 defer（超出本故事范围，已追加至 `deferred-work.md`）；"新增命令与复用现有 save 流程相比造成重复维护面"、"缺少 command 层（而非 impl 层）回归测试"、"`write_export_file_impl_does_not_allow_asset_directory` 测试未真正传入 app 到被测命令"、"`aria-label="Theme"` 使用英文与其余中文标签不一致"、"补丁使描述 HTML 导出为 `save_document_as` 的其余文档/规范产生矛盾"（已通过上面的 patch 一并解决）— 均为 reject（前者为设计偏好非缺陷；"Theme" 本身是触发器可见文本本身即为英文，`aria-label` 忠实镜像可见文本符合 spec 要求，非缺陷；测试有效性论据经核实不成立，因 `write_export_file_impl` 本身不接收 app/manager 参数，无 scope 可越权）。Edge Case Hunter 唯一发现（导出 HTML 若含相对路径本地图片，重新打开时可能因未放宽 scope 而渲染失败）— 经核实为 reject：`export-html.ts` 对本地图片始终内嵌为 `data:` base64 或改写为绝对 `file://` URL（`pathToUrl`），从不依赖 `asset://` 协议渲染导出后的独立 HTML 文件，因此该场景不适用。

## Auto Run Result

**Summary:** 为 `MenuBar.vue` 中三个 `role="menu"` 容器补充 `aria-label`（"Markdown Cat"/"文件"/"Theme"），修复屏幕阅读器无法播报菜单名称的问题 (DW-56)；新增 Rust 后端命令 `write_export_file`，供 HTML 导出路径调用，使其不再复用会放宽 `asset://` 协议作用域的 `save_document_as`，消除无故的安全放宽 (DW-72)。

**Files changed:**
- `src/components/MenuBar.vue` -- 为三个 `role="menu"` 容器新增 `aria-label`
- `src-tauri/src/commands/doc.rs` -- 新增 `write_export_file`（及 `write_export_file_impl`）命令；`save_document_as` 重构为委托 `save_document_as_impl`（复用写入逻辑，保留 scope 放宽）；新增 5 个测试
- `src-tauri/src/lib.rs` -- 注册 `commands::doc::write_export_file`
- `src/App.vue` -- `handleExportHtml` 改为调用 `write_export_file`
- `e2e/fixtures.ts` -- 新增 `write_export_file` mock handler（审查中发现的回归修复）
- `e2e/story-8-1.spec.ts`、`e2e/story-12-3.spec.ts` -- HTML 导出相关断言由 `save_document_as` 改为 `write_export_file`（审查中发现的回归修复）
- `_bmad-output/implementation-artifacts/deferred-work.md` -- 追加 1 条 defer 条目

**Review findings breakdown:** 1 patch (high，已修复：e2e mock/断言与新命令脱节导致的测试回归)；1 defer (low，`write_export_file` 缺少导出场景专属护栏，已记录)；8 reject (设计偏好、经核实不成立的论据、或不适用场景)。

**Verification performed:**
- `cd src-tauri && cargo test` -- 46 passed
- `cd src-tauri && cargo build` -- 编译成功
- `npm run build` -- 构建成功
- `npx playwright test` -- 124 passed（含修复后的 story-8-1、story-12-3 用例）
- `grep` 静态检查：`aria-label` 三处命中；`write_export_file` 在 `App.vue`/`lib.rs`/`doc.rs` 均命中

**Residual risks:** `write_export_file` 是通用文件写入原语，缺少导出场景专属护栏（如扩展名/路径校验），已记录为 deferred work，不阻塞本故事收尾。
