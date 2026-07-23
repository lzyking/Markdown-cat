---
title: 'Story 1.3: 定义应用可写目录与配置读写模块'
type: 'feature'
created: '2026-07-22'
status: 'done'
review_loop_iteration: 0
context:
  - /_bmad-output/planning-artifacts/epics.md
  - /_bmad-output/planning-artifacts/prds/prd-Markdown%20Cat-2026-07-21/prd.md
  - /_bmad-output/planning-artifacts/architecture/architecture-Markdown%20Cat-2026-07-21/ARCHITECTURE-SPINE.md
  - /_bmad-output/implementation-artifacts/epic-1-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 应用首次启动时需要一个可写位置来存储配置文件，但受控 Mac 上应用目录可能不可写；同时后续 Epic 依赖统一的配置读写能力来判断默认保存路径。

**Approach:** 在 Rust 后端实现一个可写目录检测与配置读写模块，通过 Tauri 命令暴露给前端；配置文件以 JSON 存储，错误统一返回 `{ ok: boolean, error?: string }`，错误提示使用英文错误码以方便后续接入 locale。

## Boundaries & Constraints

**Always:**
- 配置 JSON 必须包含 `savePath` 字段，类型为字符串或 null。
- 应用可写目录优先检测应用目录是否可写；不可写则回退到 `~/Documents/MarkdownCat`（不存在则创建）；若仍失败则返回错误。
- 配置损坏或缺失时返回默认回退，不阻断应用启动。
- 所有 Tauri 命令返回统一结构 `{ ok: boolean, error?: string }`。
- 错误提示不硬编码中文，使用英文错误码或常量。
- 不实现前端 UI 或保存路径对话框。

**Ask First:**
- 若需要调整 `capabilities/filesystem.json` 的 scope，必须先确认 Tauri 版本与路径变量映射。

**Never:**
- 不直接暴露原始 Rust `Result` 给前端。
- 不在命令中实现保存路径对话框或文件选择器逻辑。
- 不将配置写入系统注册表或 `/Applications` 等系统目录。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 首次启动且应用目录可写 | 无配置 | 使用应用目录作为可写目录；返回默认配置（savePath 为 null） | 无 |
| 应用目录不可写 | 无配置 | 创建并使用 `~/Documents/MarkdownCat`；返回默认配置 | 若创建失败，返回 `{ ok: false, error: "ERR_APP_DIR_NOT_WRITABLE" }` |
| 配置已存在且有效 | JSON 含 `savePath: "/some/path"` | 返回相同 savePath | 无 |
| 配置损坏 | 文件存在但非有效 JSON | 记录警告，返回默认配置（savePath 为 null） | 不阻断 |
| 写入配置 | 调用 `set_config(savePath)` | 将配置写入应用可写目录并返回 `{ ok: true }` | 写入失败返回 `{ ok: false, error: "ERR_CONFIG_WRITE_FAILED" }` |
| 路径可写性检测失败 | 应用目录与回退目录均不可写 | 返回错误，不写入配置 | 错误码 `ERR_APP_DIR_NOT_WRITABLE` |

</frozen-after-approval>

## Code Map

- `src-tauri/src/config.rs` -- 配置数据结构、可写目录解析、配置读写逻辑。
- `src-tauri/src/commands/config.rs` -- Tauri 命令 `get_app_dir`、`get_config`、`set_config` 的实现。
- `src-tauri/src/commands/mod.rs` -- 统一结果结构与命令导出。
- `src-tauri/src/lib.rs` -- 注册新增命令到 `invoke_handler`。
- `src-tauri/capabilities/filesystem.json` -- 确保应用可写目录在 fs:scope 覆盖范围内。

## Tasks & Acceptance

**Execution:**
- [x] `src-tauri/src/config.rs` -- 创建配置模块，定义 `AppConfig` 结构、默认配置、可写目录检测、配置读写函数。
- [x] `src-tauri/src/commands/config.rs` -- 创建命令模块，实现 `get_app_dir()`、`get_config()`、`set_config(savePath)` 三个 Tauri 命令。
- [x] `src-tauri/src/commands/mod.rs` -- 将新增命令模块导出，并在 `lib.rs` 中注册。
- [x] `src-tauri/src/lib.rs` -- 将 `get_app_dir`、`get_config`、`set_config` 加入 `generate_handler!`。
- [x] `src-tauri/capabilities/filesystem.json` -- 检查并调整 `fs:scope`，确保 `$APPDATA` 及 `~/Documents/MarkdownCat` 路径被覆盖。
- [x] `src-tauri/src/config.rs` -- 使用常量定义错误码，避免中文硬编码。

**Acceptance Criteria:**
- Given 应用首次启动，当后端检测应用目录可写时，then 使用应用目录作为可写目录，并返回默认配置（savePath 为 null）。
- Given 应用目录不可写，当后端回退到 `~/Documents/MarkdownCat` 时，then 自动创建该目录并返回默认配置；若创建失败则返回错误码，编辑器仍可输入。
- Given 配置读取命令被调用，when 配置存在且有效时，then 返回当前 savePath；配置损坏或缺失时，then 返回默认配置且不阻断应用启动。
- Given 写入配置命令被调用，when 保存路径有效时，then 将配置以 JSON 格式写入应用可写目录并返回 `{ ok: true }`；写入失败时返回 `{ ok: false, error: "ERR_CONFIG_WRITE_FAILED" }`。
- Given 配置文件位于应用可写目录，then `fs:scope` 覆盖该目录，Tauri 文件系统权限不阻止读写。

## Design Notes

- 可写目录检测函数返回 `Result<PathBuf, ConfigError>`，内部使用 `std::fs` 的 `metadata` 与 `write` 临时文件测试写权限。若应用目录不可写，则回退到用户文档目录下的 `MarkdownCat`。
- `AppConfig` 使用 `serde` 派生，新增未知字段默认忽略以保证向后兼容；`savePath` 使用 `Option<String>`。
- 配置读取函数尝试解析 JSON，失败时记录日志并返回 `AppConfig::default()`，确保应用可启动。
- 命令层统一使用 `CmdResult<T>` 包装业务结果，但 `get_config` 和 `get_app_dir` 在成功时返回数据，`set_config` 成功返回空数据 `{ ok: true }`。
- 错误码以 `ERR_` 前缀命名，集中定义在 `config.rs` 顶部常量，避免散落在业务逻辑中。

## Verification

**Commands:**
- `cd src-tauri && cargo check` -- expected: 无编译错误。
- `cd src-tauri && cargo test --lib` -- expected: 配置模块单元测试全部通过（若 Rust 单元测试不存在则跳过）。

**Manual checks:**
- 检查 `src-tauri/src/lib.rs` 的 `invoke_handler` 包含 `get_app_dir`、`get_config`、`set_config`。
- 检查 `capabilities/filesystem.json` 的 `fs:scope` 包含 `$APPDATA/**/*`（对应 `appDataDir()`）以及 `$DOCUMENT/MarkdownCat/**/*` 或 `$DOCUMENT/**/*`。
- 检查配置模块中没有硬编码中文错误提示。

## Spec Change Log

- 2026-07-22: Code review completed. Fixed P1/P2 findings (Chinese log message translated, `get_config` now returns default config on resolve/read failures, `set_config` returns `{ ok: true }` via `CmdResult::ok()`, `resolve_writable_dir` includes underlying IO error reason, formatted capabilities JSON). P3 logging and `.write_test` cleanup recorded in deferred-work.md as DW-6 and DW-7. Status remains `done`.
