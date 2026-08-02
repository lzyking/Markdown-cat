---
title: '配置模块结构化错误与日志（DW-20, DW-23）'
type: 'refactor'
created: '2026-08-02'
status: 'done'
baseline_revision: '431cda7327a41026d4af0f33f124ecca6272089c'
final_revision: '755a2f912aee1ac6d1ed8d05e811408417e60416'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** `src-tauri/src/config.rs` 与 `src-tauri/src/commands/config.rs` 使用 `eprintln!` 输出警告/错误，日志散落到 stderr 且不可结构化过滤；同时 `thiserror` 依赖计划用于错误处理但当前未在代码中使用，是死权重。

**Approach:** 在 config 模块内新增基于 `thiserror` 的 `ConfigError` 枚举，包装现有 `ERR_*` 错误码文本；用 `tracing` 宏（`tracing::warn!` / `tracing::error!`）替换这两个文件中的 `eprintln!`，并在 `lib.rs::run()` 中一次性初始化 `tracing_subscriber` 输出到 stderr，使日志具备级别与字段结构。

## Boundaries & Constraints

**Always:**
- 保持所有 `pub fn` 对外签名不变（仍返回 `Result<T, String>` / `CmdResult<T>`），因为架构约束要求错误统一为 `{ ok: boolean, error?: string }`（见 ARCHITECTURE-SPINE.md 状态与跨切面行）；`ConfigError` 仅作为内部构造错误字符串的手段（`.to_string()` 或 `From<ConfigError> for String`）。
- `ConfigError` 各 variant 的 `Display` 输出必须保持与现有 `format!("{}: {}", ERR_X, e)` 完全一致的文本，避免破坏依赖该错误码前缀的前端 locale 映射。
- `thiserror` 必须加入 `src-tauri/Cargo.toml` 的 `[dependencies]` 并在 `config.rs` 中实际使用（`#[derive(thiserror::Error)]`），不得只声明不使用。
- 仅替换 `config.rs` 与 `commands/config.rs` 中的 `eprintln!` 调用；其余文件（如 `doc.rs`、`pdf_export.rs`）中的 `eprintln!` 不在本次范围内，保持不变。

**Block If:** 无需人工决策的已知阻塞条件——本任务范围明确、无需暂停。

**Never:**
- 不引入 `tauri_plugin_log` 插件注册（超出 config 模块范围，改动面过大）；选择更轻量的 `tracing` + `tracing-subscriber` 方案。
- 不修改任何错误码常量（`ERR_APP_DIR_NOT_WRITABLE` 等）的字符串值。
- 不改变 `resolve_writable_dir` / `read_config` / `write_config` / `resolve_save_dir` 的调用方（`commands/doc.rs` 等）的调用方式。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| app_data_dir 解析失败 | `path().app_data_dir()` 返回 Err | `resolve_writable_dir` 返回 `Err(String)`，文本以 `ERR_APP_DIR_NOT_WRITABLE:` 开头 | 由 `ConfigError::AppDirNotWritable` 构造，`.to_string()` 转为 String |
| 配置解析失败（损坏 JSON） | `read_config` 遇到无效 JSON | 记录一条 `tracing::warn!` 结构化日志，返回默认 `AppConfig`，不阻断启动 | 不返回 Err，仅日志 |
| 配置写入失败 | 目标目录不可写 | `write_config` 返回 `Err(String)`，文本以 `ERR_CONFIG_WRITE_FAILED:` 开头 | 由 `ConfigError::ConfigWriteFailed` 构造 |
| get_config 命令回退 | `resolve_writable_dir` 或 `read_config` 失败 | 记录 `tracing::warn!`，`get_config` 仍返回默认配置的 `CmdResult::success` | 不向前端暴露错误，仅日志 |

</intent-contract>

## Code Map

- `src-tauri/Cargo.toml` -- 新增 `thiserror` 直接依赖（当前仅为间接依赖，见 Cargo.lock）
- `src-tauri/src/config.rs` -- 新增 `ConfigError` 枚举（`thiserror::Error` 派生），改造 `read_config`/`write_config`/`resolve_writable_dir` 内部错误构造方式，替换 1 处 `eprintln!`
- `src-tauri/src/commands/config.rs` -- 替换 2 处 `eprintln!`（`get_config` 中）为 `tracing::warn!`
- `src-tauri/src/lib.rs` -- 在 `run()` 中新增一次性 `tracing_subscriber` 初始化（放在 `install_panic_logger()` 之后即可）

## Tasks & Acceptance

**Execution:**
- [x] `src-tauri/Cargo.toml` -- 在 `[dependencies]` 增加 `thiserror = "2"` 与 `tracing = "0.1"`、`tracing-subscriber = "0.3"` -- 提供结构化错误类型与日志基础设施
- [x] `src-tauri/src/config.rs` -- 定义 `pub enum ConfigError { AppDirNotWritable(std::io::Error), ConfigWriteFailed(std::io::Error), ConfigReadFailed(std::io::Error) }`，`#[error(...)]` 文本分别为 `"ERR_APP_DIR_NOT_WRITABLE: {0}"` / `"ERR_CONFIG_WRITE_FAILED: {0}"` / `"ERR_CONFIG_READ_FAILED: {0}"`；将 `resolve_writable_dir`、`read_config`、`write_config` 中原先 `format!("{}: {}", ERR_X, e)` 的构造替换为 `ConfigError::Variant(e).to_string()`，函数对外签名不变 -- 让死权重依赖 `thiserror` 真正被使用，同时保持错误文本兼容
- [x] `src-tauri/src/config.rs` -- 将 `read_config` 中第 169 行的 `eprintln!("Config parse failed, using defaults: {}", e)` 替换为 `tracing::warn!(error = %e, "config parse failed, using defaults")` -- 结构化日志替代 stderr 散落输出
- [x] `src-tauri/src/commands/config.rs` -- 将 `get_config` 中两处 `eprintln!` 替换为 `tracing::warn!(error = %e, ...)`，字段名分别反映"config read failed"和"writable dir resolve failed"语境 -- 与 config.rs 保持一致的结构化日志风格
- [x] `src-tauri/src/lib.rs` -- 在 `run()` 函数体顶部、`install_panic_logger()` 调用之后，新增一次 `tracing_subscriber::fmt::try_init().ok();`（忽略重复初始化错误，避免测试环境下 panic）-- 使 tracing 日志实际有输出目的地
- [x] `src-tauri/src/config.rs` -- 在文件末尾新增 `#[cfg(test)] mod tests` 覆盖 `ConfigError` 三个 variant 的 `Display` 输出与原错误码文本前缀一致 -- 验证错误文本兼容性回归

**Acceptance Criteria:**
- Given `app_data_dir` 解析失败, when 调用 `resolve_writable_dir`, then 返回的 `Err(String)` 内容以 `"ERR_APP_DIR_NOT_WRITABLE: "` 开头，与改造前文本一致
- Given 配置文件写入失败, when 调用 `write_config`, then 返回的 `Err(String)` 内容以 `"ERR_CONFIG_WRITE_FAILED: "` 开头
- Given `cargo build` 编译整个 `src-tauri` crate, when 构建完成, then 无 unused-dependency 相关警告涉及 `thiserror`（该依赖被 `config.rs` 实际引用）
- Given 全局搜索 `config.rs` 与 `commands/config.rs`, when 检查 `eprintln!` 调用, then 结果为 0 处（已全部替换为 `tracing::warn!`/`tracing::error!`）

## Design Notes

`ConfigError` 只在 `config.rs` 内部使用，不对外导出为公共错误类型契约的一部分（对外仍是 `Result<T, String>`），这样可以在不触碰 `commands/doc.rs` 等下游调用方的前提下满足"使用 thiserror"的诉求。示例：

```rust
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("ERR_APP_DIR_NOT_WRITABLE: {0}")]
    AppDirNotWritable(std::io::Error),
    #[error("ERR_CONFIG_WRITE_FAILED: {0}")]
    ConfigWriteFailed(std::io::Error),
    #[error("ERR_CONFIG_READ_FAILED: {0}")]
    ConfigReadFailed(std::io::Error),
}
```

调用处：`app_handle.path().app_data_dir().map_err(|e| ConfigError::AppDirNotWritable(std::io::Error::new(std::io::ErrorKind::Other, e)).to_string())?`（`app_data_dir()` 原始错误类型不是 `io::Error`，需要用 `io::Error::new(io::ErrorKind::Other, e)` 包装后再传入 variant）。

## Verification

**Commands:**
- `cd src-tauri && cargo build` -- expected: 编译成功，无错误
- `cd src-tauri && cargo test config::tests` -- expected: 新增的 `ConfigError` Display 测试全部通过
- `cd src-tauri && cargo clippy --all-targets -- -D warnings` -- expected: 无新增 clippy 警告（可选，若已有基线警告则不阻塞）

## Spec Change Log

## Review Triage Log

### 2026-08-02 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4 (high 0, medium 0, low 4)
- defer: 4 (high 0, medium 0, low 4)
- reject: 2 (high 0, medium 0, low 2)
- addressed_findings:
  - `[low]` `[patch]` `ConfigError` was declared `pub`, needlessly widening crate API for an internal-only type; changed to `pub(crate)`.
  - `[low]` `[patch]` Redundant `debug_assert!` tautologies (comparing a string to the literal it was derived from) added noise without protection; removed by restructuring `ConfigError` into a single struct with a runtime `code: &'static str` field driven directly by the existing `ERR_*` constants, so the constants are genuinely referenced in production code (fixing a `dead_code` warning this removal introduced) and the unit tests now assert against the constants themselves instead of duplicated literals.
  - `[low]` `[patch]` `tracing::warn!` calls for config parse/read failures omitted the file path, making diagnostics vague; added `path = %config_path.display()` field to both call sites in `config.rs` and `commands/config.rs`.
  - `[low]` `[patch]` `tracing-subscriber = "0.3"` pulled in unused default features (ansi color, env-filter, etc.) for a minimal `fmt`-only use; scoped to `default-features = false, features = ["fmt", "std"]`.
  - `[low]` `[defer]` `resolve_writable_dir` drops the underlying `is_dir_writable` error cause when returning `ERR_APP_DIR_NOT_WRITABLE` (pre-existing behavior, not introduced by this change).
  - `[low]` `[defer]` `ConfigError` wraps non-I/O errors (Tauri path-resolution error, `serde_json` serialization error) via `io::Error::other(..)`, which is a type-modeling compromise to keep a single `io::Error`-sourced struct; functionally correct (output text unchanged and covered by tests) but worth revisiting if the error type is ever exposed further.
  - `[low]` `[defer]` No dedicated tests for `read_config`/`write_config`/`resolve_writable_dir` behavior (only `ConfigError::Display` is unit-tested); pre-existing gap in this module, not introduced by this change.
  - `[low]` `[defer]` Structured logging in this change is scoped to `config.rs`/`commands/config.rs` only; `doc.rs` and `pdf_export.rs` still use `eprintln!` (explicitly out of scope per this bundle's intent).
  - `[low]` `[reject]` `tracing_subscriber::fmt::try_init().ok()` silently ignores initialization failure — this is the spec-mandated behavior (Design Notes explicitly call for ignoring re-init errors to avoid test-environment panics); not a defect.
  - `[low]` `[reject]` `tracing`/`fmt` defaults route to stderr rather than the existing custom panic-log file — this matches the intent contract's "Never" boundary (no `tauri_plugin_log` plugin registration) and was an explicit design choice, not a bug.
## Auto Run Result

Status: done

_Appended by the bmad-loop orchestrator (missing-marker repair, #224): the session finalized this spec's frontmatter without its `## Auto Run Result` marker, so the orchestrator synthesized the result from the frontmatter and appended this section._

Synthesized by the bmad-loop orchestrator from frontmatter status `done` for story `dw-backend-structured-error-logging` (session finalized the spec without appending its marker).
