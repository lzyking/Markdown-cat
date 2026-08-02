---
id: 10-1-windows-noconsole-gui-attribute
title: Windows Subsystem GUI No-Console Launcher Attribute Configuration
epic: epic-10
status: done
baseline_revision: 2ab39d7b2ff9cdb3690fe2b1a31306bcff05e674
final_revision: e588aeefe3845a2af74b9dc015bdbaa1985e5546
review_loop_iteration: 0
followup_review_recommended: false
operator_actions:
  - "在 Windows 机器上执行 Release 打包（例如 `cargo tauri build` 或 CI 的 Windows 构建产物），双击生成的 `.exe` 或桌面快捷方式启动应用，确认不出现命令提示符/终端黑窗口。"
  - "在同一 Release 版本运行状态下，点击关闭应用主窗口，确认进程在任务管理器中随之退出，不留下常驻后台进程。"
  - "对比 Debug 构建（例如 `cargo tauri dev` 或本地 debug 二进制）启动，确认控制台窗口仍然可见，用于确认 Debug/Release 条件隔离按预期生效。"
  - "在 Windows 上人为触发一次应用崩溃（或使用调试手段引发 panic），确认 `%APPDATA%/com.markdowncat.dev/logs/app.log`（或应用实际 app_data_dir 下的 `logs/app.log`）中生成了包含时间戳、线程、panic 消息、代码位置与堆栈回溯的记录。"
  - "检查 `src-tauri/Cargo.toml` 与 `tauri.conf.json` 生成的 Windows 安装包（MSI/NSIS）在真实 Windows 环境下的行为是否符合预期（例如安装/卸载、快捷方式创建），确认无需额外的 Windows bundle 配置项。"
---

# Story 10.1: Windows Subsystem GUI No-Console Launcher Attribute Configuration

## Story Description
作为 Windows 用户，当我双击打开 Markdown Cat 软件时，期望应用直接打开 GUI 界面，而不弹出或保留额外的命令提示符黑窗口（cmd / terminal window），改善使用体验。

## Acceptance Criteria
1. **Rust Main 属性定义**: 在 `src-tauri/src/main.rs` 顶部声明 `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`。
2. **Tauri Windows 打包支持**: 检查并更新 `src-tauri/Cargo.toml` 与 `tauri.conf.json` 中的 Windows bundle 属性。
3. **独立无控制台运行**: 在 Windows 生产版本（Release Build）下双击可执行文件或快捷方式启动时，不出现控制台黑框；关闭软件主窗口时程序安全退出。
4. **崩溃日志文件记录 (App Log)**: 配置底层日志 logger（如将 panic 堆栈与未捕获异常写入应用数据目录下的 `logs/app.log`），确保在隐藏终端控制台的情况下，软件若发生异常崩溃仍能留存详细日志。
5. **Debug/Release 模式条件隔离**: 使用 `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` 确保仅生产发布版 (Release) 隐藏黑窗口，Debug 模式下保留控制台方便调试日志查看。

## Tasks & Acceptance

**Execution:**
- [x] `src-tauri/src/main.rs` -- 在文件顶部添加 `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` -- 实现 AC1/AC5
- [x] `src-tauri/src/lib.rs` -- 在 `run()` 开始处安装 panic hook（`install_panic_logger`），捕获 panic 消息/位置/线程/回溯并写入日志文件，同时保留原始 hook 行为 -- 实现 AC4
- [x] `src-tauri/src/config.rs` -- 新增 `panic_log_file_path()` / `resolve_app_data_dir()`，按平台约定解析应用数据目录（Windows: `%APPDATA%`；macOS: `~/Library/Application Support`；Linux: `XDG_DATA_HOME`/`~/.local/share`），拼接 `com.markdowncat.dev/logs/app.log` -- 支撑 AC4 的日志落盘路径
- [x] `src-tauri/Cargo.toml`／`src-tauri/tauri.conf.json` -- 检查确认现有 Windows bundle 配置无需改动（未发现冲突的 `windows_subsystem` 覆盖或缺失的 Windows bundle 设置）-- 核实 AC2

**Acceptance Criteria:**
- Given `src-tauri/src/main.rs` 顶部, when 检查源码, then 存在 `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` 声明（`src-tauri/src/main.rs:1`）
- Given `src-tauri/Cargo.toml` 与 `tauri.conf.json`, when 检查 Windows 打包相关配置, then 未发现需要变更或修复的冲突项
- Given Release 构建产物在 Windows 上双击运行, when 观察窗口行为, then 不出现控制台黑框，关闭主窗口后进程正常退出 —— **无法在当前 macOS 沙箱环境中直接验证，需操作员在真实 Windows 环境验证**
- Given 应用运行时发生 panic, when panic hook 触发, then panic 消息/位置/回溯被追加写入 `<app_data_dir>/logs/app.log`（`src-tauri/src/lib.rs` 中 `log_panic_to_file`；`src-tauri/src/config.rs` 中 `panic_log_file_path`）——已通过代码走查与编译验证，未在真实崩溃场景下运行时验证
- Given Debug 构建 (`cargo tauri dev` / `debug_assertions` 为真), when 启动应用, then `windows_subsystem` 属性不生效，控制台保留可见（`cfg_attr(not(debug_assertions), ...)` 条件保证）

## Spec Change Log

（空 — 本轮实现未触发规格层面的矛盾或缺口，无需修订验收标准）

## Review Triage Log

### 2026-08-01 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3 (medium 1, low 2)
- defer: 0
- reject: 9 (low)
- addressed_findings:
  - `[medium]` `[patch]` Blind Hunter：panic 日志路径与应用真实使用的 `app_handle.path().app_data_dir()`（`resolve_writable_dir` 的兜底逻辑）不一致，可能与其余应用状态目录分叉 — 修复：在 `.setup()` 中通过 `AppHandle` 重新解析并覆盖为 `app_data_dir()/logs/app.log`，pre-init 阶段的猜测路径仅作为兜底（`src-tauri/src/lib.rs`）
  - `[low]` `[patch]` Edge Case Hunter：`HOME`/`XDG_DATA_HOME` 为空或非绝对路径时会产生错误的相对路径 — 修复：新增 `is_absolute()` 校验，非绝对路径时视为不可用（`src-tauri/src/config.rs`）
  - `[low]` `[patch]` Edge Case Hunter：多线程并发 panic 时日志写入可能交叉、难以阅读 — 修复：将路径解析与写入统一置于同一把 `Mutex` 锁内，序列化并发写入（`src-tauri/src/lib.rs`）

## Auto Run Result

Status: awaiting-operator

**Summary**：Story 10.1（Windows 下双击启动隐藏控制台黑窗口 + 崩溃日志留存）中所有 Agent 可独立完成的工作已实现、编译通过，并已提交到版本库：`main.rs` 顶部声明了 `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`（AC1/AC5），`lib.rs`/`config.rs` 实现了 panic 钩子与跨平台应用数据目录解析（AC4），并核实 `Cargo.toml`/`tauri.conf.json` 现有 Windows 打包配置无需改动（AC2）。由于当前沙箱环境为 macOS，且没有可用的 Windows 机器/CI 来构建 Release 版本并物理验证"双击运行不出现控制台黑框、关闭主窗口后进程安全退出"（AC3）这一行为，本 story 依据本轮运行的显式指示，将状态置为 `awaiting-operator` 而非 `blocked`（`blocked` 会中止整条运行；本 story 在 Agent 能力范围内已完成到位）。已委托的 operator 动作详见 frontmatter 中的 `operator_actions` 列表。

**Files changed this pass**：
- `src-tauri/src/main.rs` -- 新增 `windows_subsystem` cfg_attr 声明
- `src-tauri/src/lib.rs` -- 新增 panic 钩子安装与日志写入逻辑，`.setup()` 中重新对齐日志路径
- `src-tauri/src/config.rs` -- 新增 `panic_log_file_path()`/`resolve_app_data_dir()` 跨平台路径解析辅助函数

**Review findings breakdown**：patch 3（medium 1, low 2，已全部自动修复）；defer 0；reject 9（均为低严重度或超出本 story 范围的建议，如日志轮转、panic payload 脱敏、mobile 路径支持等，已记录为下方 residual risks，未创建独立 deferred-work 条目，因为它们是本次新增代码引入的问题而非既有缺陷）。

**Verification performed**：
- `cd src-tauri && cargo build --quiet` — 通过，无编译错误或警告。
- `cd src-tauri && cargo build --release --quiet` — 通过（确认 `windows_subsystem` 属性在 macOS 目标上编译无害）。
- 代码走查确认 panic hook 在 `run()` 顶部、Tauri Builder 构建前安装。
- 未运行前端相关校验（本 story 无前端改动）。

**Residual risks / caveats**：
- AC3（Windows Release 下双击不出现控制台黑框、关闭主窗口后进程安全退出）无法在当前 macOS 沙箱中直接验证，需要真实 Windows 环境；已列入 `operator_actions`。
- `app.log` 目前无大小上限/轮转策略，长期崩溃循环可能导致日志文件无限增长；如需要可作为后续增强单独跟踪。
- panic 消息与完整 backtrace 会原样写入日志文件，理论上可能包含文件路径等信息；日志仅落盘于本机应用数据目录，未上传或外发，风险可控。
- `APP_IDENTIFIER` 常量在 Rust 侧硬编码为 `com.markdowncat.dev`，与 `tauri.conf.json` 的 `identifier` 字段重复维护；如后续该标识变更需同步修改两处。

## Operator Confirmation

Confirmed 2026-08-02: the external actions this story owed were carried out.

- 在 Windows 机器上执行 Release 打包（例如 `cargo tauri build` 或 CI 的 Windows 构建产物），双击生成的 `.exe` 或桌面快捷方式启动应用，确认不出现命令提示符/终端黑窗口。
- 在同一 Release 版本运行状态下，点击关闭应用主窗口，确认进程在任务管理器中随之退出，不留下常驻后台进程。
- 对比 Debug 构建（例如 `cargo tauri dev` 或本地 debug 二进制）启动，确认控制台窗口仍然可见，用于确认 Debug/Release 条件隔离按预期生效。
- 在 Windows 上人为触发一次应用崩溃（或使用调试手段引发 panic），确认 `%APPDATA%/com.markdowncat.dev/logs/app.log`（或应用实际 app_data_dir 下的 `logs/app.log`）中生成了包含时间戳、线程、panic 消息、代码位置与堆栈回溯的记录。
- 检查 `src-tauri/Cargo.toml` 与 `tauri.conf.json` 生成的 Windows 安装包（MSI/NSIS）在真实 Windows 环境下的行为是否符合预期（例如安装/卸载、快捷方式创建），确认无需额外的 Windows bundle 配置项。

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
