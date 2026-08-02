---
title: '为 save_image_asset/copy_asset_file 补充真实文件系统闭环的 Rust 单元测试（DW-54）'
type: 'chore'
created: '2026-08-02'
status: 'done'
baseline_revision: '0633e9bdab08fd390e36da62fc595e2f3cb6b6ae'
final_revision: '6b37eb275732907bcca0c2e51e3575f15c3aeb1c'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** `save_image_asset`/`copy_asset_file` 这两个 Tauri 命令的核心逻辑（真实文件写入、asset:// 协议作用域动态放宽、文件名冲突退避、跨目录迁移失败路径）目前只在 e2e 测试中通过 `window.__TAURI_MOCK__` 完全 mock 掉命令返回值来"验证"，而 Rust 侧单测（`src-tauri/src/doc.rs`）只覆盖了 `doc::save_binary_asset_to_dir`/`doc::copy_asset_between_dirs` 这两个不含 `AppHandle` 的纯函数，从未覆盖命令函数里"写入成功后调用 `asset_protocol_scope().allow_directory(...)`"这段协议作用域放宽逻辑，也没有对失败路径（迁移目标目录不可创建等）做断言。

**Approach:** 由于 `#[tauri::command]` 的 `AppHandle` 默认绑定具体的 `Wry` 运行时、无法在无显示环境的单测中构造，将 `save_image_asset`/`copy_asset_file` 的命令体逻辑抽取为对 `Runtime` 泛型、对 `tauri::Manager<R>` 泛型的 `*_impl` 辅助函数（不改变对外命令签名/行为），命令函数改为对 `_impl` 的薄封装；随后使用 `tauri::test::mock_app()`（`tauri` crate 的 `test` feature，仅作为 dev-dependency 引入）构造满足 `Manager<MockRuntime>` 的应用句柄，在 `src-tauri/src/commands/doc.rs` 内新增 `#[cfg(test)]` 单测，驱动真实临时目录上的文件系统写入、断言 `asset_protocol_scope().is_allowed(...)` 在成功路径为 true、覆盖命名冲突退避的命令级行为、以及目标目录不可创建导致的迁移失败路径。不改动、不重写现有 e2e mocked 套件。

## Boundaries & Constraints

**Always:**
- `save_image_asset`/`copy_asset_file` 对外的 `#[tauri::command]` 函数签名（参数名、参数类型、返回类型 `CmdResult<...>`）保持不变，前端调用方式不受影响。
- 抽取出的 `_impl` 辅助函数必须是新增的私有（`fn`，非 `pub`）辅助函数，位于同一文件 `src-tauri/src/commands/doc.rs` 内，命令函数体内只做参数转换后委托给 `_impl`，不重复业务逻辑。
- `_impl` 函数必须对 `R: tauri::Runtime` 和 `manager: &impl tauri::Manager<R>`（或等价的类型参数化写法）泛型化，以便测试用 `tauri::test::mock_app()` 返回的 `App<MockRuntime>`（实现 `Manager<MockRuntime>`）驱动。
- 新增的 `tauri` dev-dependency（`features = ["test"]`）只加入 `[dev-dependencies]`，不得影响 `[dependencies]` 中已有的 `tauri = { version = "2.1.1", features = ["protocol-asset"] }`（生产构建 feature 集不变）。
- 新增测试全部使用 `tempfile::tempdir()` 构造的真实临时目录做实际文件系统写入/读取验证，不使用纯内存 mock 掩盖被测行为。
- 新增测试须覆盖：(1) `save_image_asset` 对真实目录的写入结果与协议作用域放宽（写入成功后 `asset_protocol_scope().is_allowed(&directory)` 为 true）；(2) `save_image_asset` 命令级的文件名冲突退避（连续两次相同 `filename` 调用产生不同最终文件名，两文件内容均保持各自写入的字节）；(3) `copy_asset_file` 成功迁移时的真实文件复制与目标目录的协议作用域放宽；(4) `copy_asset_file` 源文件缺失时返回 `migrated: false` 且不触发协议作用域放宽；(5) `copy_asset_file` 迁移失败路径（目标目录路径被一个同名的已存在的普通文件占用，导致 `fs::create_dir_all` 失败）返回失败 `CmdResult`。
- 保持中文注释风格与现有代码一致；仅在必要处添加简短注释说明"为什么"。

**Block If:** 无（本轮范围与做法已在情报/前置探查中明确；若 `tauri::test::mock_app()` 在本仓库 Tauri 版本下无法满足 `asset_protocol_scope()` 所需的托管状态而导致 panic 且无法通过合理配置规避，则视为环境限制，HALT 并说明具体报错）。

**Never:**
- 不修改、不重写 `e2e/story-7-2.spec.ts`、`e2e/fixtures.ts` 或任何 e2e 测试文件；e2e 套件继续保留对 Tauri 命令的 mock 方式不变。
- 不改变 `save_image_asset`/`copy_asset_file` 现有的对外行为、错误码或返回结构。
- 不引入新的 IPC 命令，不修改前端任何文件。
- 不将 `tauri` 的 `test` feature 加入生产 `[dependencies]` 或默认 `[features] default` 列表。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 真实写入 + 作用域放宽 | 临时目录不存在，调用 `save_image_asset_impl` 写入合法字节 | 文件被真实写入临时目录；返回 `CmdResult::success`；`asset_protocol_scope().is_allowed(&directory)` 为 true | 无错误 |
| 命名冲突退避（命令级） | 相同 `filename` 对同一目录连续调用两次 `save_image_asset_impl` | 两次均返回 `CmdResult::success`，`filename` 字段不同，磁盘上两份文件各自内容正确 | 无错误 |
| 迁移成功 + 作用域放宽 | 源目录内存在待迁移文件，调用 `copy_asset_file_impl` | 返回 `migrated: true`；目标目录出现内容一致的文件；`asset_protocol_scope().is_allowed(&to_dir)` 为 true | 无错误 |
| 源文件缺失 | 源目录中不存在该文件名，调用 `copy_asset_file_impl` | 返回 `migrated: false`，不写入任何文件，作用域未被放宽（无需断言必然未放宽，但目标目录未被创建） | 无错误（视为正常跳过） |
| 迁移目标不可创建 | 目标路径被一个同名的已存在普通文件占用（而非目录），调用 `copy_asset_file_impl` | 返回失败 `CmdResult`（`ok: false`），不产生 panic | 错误信息为既有 `ERR_SAVE_FAILED` |

</intent-contract>

## Code Map

- `src-tauri/Cargo.toml` -- 新增 `[dev-dependencies]` 段，加入 `tauri = { version = "2.1.1", features = ["test"] }` 以获得 `tauri::test::mock_app()`。
- `src-tauri/src/commands/doc.rs` -- 将 `save_image_asset`/`copy_asset_file` 的命令体抽取为泛型 `save_image_asset_impl`/`copy_asset_file_impl` 私有函数；命令函数改为薄封装；新增 `#[cfg(test)] mod tests` 覆盖 I/O 矩阵中的 5 个场景。

## Tasks & Acceptance

**Execution:**
- [x] `src-tauri/Cargo.toml` -- 新增 `[dev-dependencies]` 段并加入 `tauri = { version = "2.1.1", features = ["test"] }` -- 为单测提供 `tauri::test::mock_app()`/`MockRuntime`，不影响生产依赖 feature 集
- [x] `src-tauri/src/commands/doc.rs` -- 抽取 `fn save_image_asset_impl<R: tauri::Runtime>(manager: &impl tauri::Manager<R>, target_dir: &str, filename: &str, bytes: &[u8]) -> CmdResult<ImageSaveResult>`，把现有 `save_image_asset` 命令体（含 `doc::save_binary_asset_to_dir` 调用与 `asset_protocol_scope().allow_directory` 放宽逻辑）原样迁入；`save_image_asset` 命令函数改为调用 `save_image_asset_impl(&app_handle, &target_dir, &filename, &bytes)` -- 使核心逻辑可用 `MockRuntime` 单测，不改变对外行为
- [x] `src-tauri/src/commands/doc.rs` -- 同样抽取 `fn copy_asset_file_impl<R: tauri::Runtime>(manager: &impl tauri::Manager<R>, from_dir: &str, to_dir: &str, filename: &str) -> CmdResult<AssetMigrationResult>`，`copy_asset_file` 命令函数改为薄封装 -- 使迁移与作用域放宽逻辑可单测
- [x] `src-tauri/src/commands/doc.rs` -- 新增 `#[cfg(test)] mod tests`，使用 `tempfile::tempdir()` 构造真实目录、`tauri::test::mock_app()` 构造 `Manager<MockRuntime>`，覆盖 I/O 矩阵中的 5 个场景（真实写入+作用域放宽、命名冲突退避、迁移成功+作用域放宽、源文件缺失、迁移目标不可创建的失败路径） -- 关闭 DW-54 描述的真实文件系统/协议作用域/命名冲突/迁移失败覆盖缺口

**Acceptance Criteria:**
- Given 一个不存在的真实临时目录，when 调用 `save_image_asset_impl` 写入合法图片字节，then 磁盘上生成对应文件且 `asset_protocol_scope().is_allowed` 对该目录返回 true。
- Given 目标路径已被一个同名普通文件占用，when 调用 `copy_asset_file_impl` 尝试迁移，then 返回的 `CmdResult.ok` 为 false 且不 panic。
- Given 现有 `cargo test`（或等价的针对 `commands::doc` 模块的定向测试）执行，when 运行新增与既有测试，then 全部通过，且 `save_image_asset`/`copy_asset_file` 对外命令行为与改动前一致（无回归）。

## Spec Change Log

## Review Triage Log

### 2026-08-02 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1 (low 1)
- defer: 2 (low 2)
- reject: 12 (low 12)
- addressed_findings:
  - `[low]` `[patch]` Scope-widening tests (`save_image_asset_impl_writes_file_and_allows_asset_directory`, `copy_asset_file_impl_copies_file_and_allows_target_directory`) lacked a pre-state assertion proving the directory was NOT allowed before the call, weakening proof that `allow_directory` actually caused the widening. Added `assert!(!app.asset_protocol_scope().is_allowed(&dir))` immediately before each call in both tests; verified `cargo test --lib` (14/14 passed) and `cargo build` (production) still succeed after the change.

## Design Notes

`tauri::AppHandle`（命令签名中裸写的 `AppHandle`）通过 `#[default_runtime(crate::Wry, wry)]` 宏展开固定为 `AppHandle<Wry>`，而 `Wry` 运行时依赖真实窗口系统，无法在无显示环境的单测进程中构造，这正是现有测试从未覆盖命令层"作用域放宽"逻辑的根因。`tauri::test::mock_app()` 返回 `App<MockRuntime>`，`MockRuntime` 同样实现 `tauri::Runtime` trait 且 `App<R>` 实现 `Manager<R>`（`asset_protocol_scope()` 定义在 `Manager` trait 上，依赖的 `Scopes` 托管状态在任意 runtime 的 `App::build` 过程中都会注册），因此将命令体改写为对 `R`/`Manager<R>` 泛型的写法后，测试可以传入 `&mock_app()` 驱动同一套业务逻辑，无需真实窗口环境，也无需改变对外命令签名。

## Verification

**Commands:**
- `cd src-tauri && cargo test --lib commands::doc` -- expected: 新增与既有的 `commands::doc` 模块测试全部通过
- `cd src-tauri && cargo test --lib doc::tests` -- expected: 既有 `doc.rs` 单测保持全部通过（无回归）
- `cd src-tauri && cargo build` -- expected: 生产构建（不含 `test` feature）编译通过，确认 dev-dependency 未泄漏进生产依赖图
## Auto Run Result

Status: done

_Appended by the bmad-loop orchestrator (missing-marker repair, #224): the session finalized this spec's frontmatter without its `## Auto Run Result` marker, so the orchestrator synthesized the result from the frontmatter and appended this section._

Synthesized by the bmad-loop orchestrator from frontmatter status `done` for story `dw-clipboard-paste-backend-test-coverage` (session finalized the spec without appending its marker).
