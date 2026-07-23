---
title: 'Story 1.4: 应用启动时创建默认空白 Markdown 文档'
type: 'feature'
created: '2026-07-22'
status: 'done'
review_loop_iteration: 0
context:
  - /_bmad-output/planning-artifacts/epics.md
  - /_bmad-output/planning-artifacts/prds/prd-Markdown%20Cat-2026-07-21/prd.md
  - /_bmad-output/planning-artifacts/architecture/architecture-Markdown%20Cat-2026-07-21/ARCHITECTURE-SPINE.md
  - /_bmad-output/planning-artifacts/ux-designs/ux-Markdown%20Cat-2026-07-21/DESIGN.md
  - /_bmad-output/planning-artifacts/ux-designs/ux-Markdown%20Cat-2026-07-21/EXPERIENCE.md
  - /_bmad-output/implementation-artifacts/epic-1-context.md
  - /_bmad-output/implementation-artifacts/spec-1-3-config-module.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 应用启动后需要立即给用户一个可输入的空白 Markdown 文档，标题栏显示唯一文件名，且能处理保存路径不可写的边界情况。

**Approach:** 在 Rust 后端新增 `generate_document_name` 命令和 `create_blank_document` 能力，前端在应用启动后通过 `init_app` 或新命令获取默认文件名，并清空源码编辑器占位。文件名生成使用毫秒级时间戳，确保同一秒内多次启动不覆盖；若同一毫秒冲突则等待下一毫秒重试。保存路径检测复用 Story 1.3 的 `resolve_writable_dir` 和配置读取能力。

## Boundaries & Constraints

**Always:**
- 文件名格式必须为 `New_YYYYMMDD_HHMMSS_mmm.md`，其中 `mmm` 为毫秒（0-999）。
- 同一毫秒内检测到文件已存在时，必须等待下一毫秒后重新生成，确保最终文件名唯一。
- 文档内容初始为空字符串，编辑器必须可立即获得焦点并输入。
- 必须复用 Story 1.3 的 `resolve_writable_dir` 和配置读取逻辑，不重复实现可写目录检测。
- 所有后端命令返回统一结构 `{ ok: boolean, error?: string }`。
- 错误提示不硬编码中文，使用英文错误码或常量。

**Ask First:**
- 是否需要在前端也生成文件名（仅作为显示），还是完全由后端生成？—— 本次由后端生成，前端仅显示。
- 是否需要立即在磁盘上创建空白文件？—— MVP 不创建，仅生成文件名；实际文件在首次自动保存时创建（Story 3.1）。

**Never:**
- 不实现实际文件写入（由 Epic 3 自动保存处理）。
- 不实现源码编辑器（由 Epic 2 处理）。
- 不在启动时弹出任何对话框或阻塞窗口渲染。
- 不将文件名持久化到配置，除非用户明确保存。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 正常启动 | 应用启动 | 标题栏显示 `New_20260722_143052_123.md` 格式文件名；编辑器为空 | 无 |
| 同一秒内多次启动 | 时间戳相同 | 毫秒部分不同，文件名唯一 | 无 |
| 同一毫秒内检测到冲突 | 文件已存在 | 等待下一毫秒后重新生成，直到唯一 | 无 |
| 保存路径不可写 | 应用目录与回退目录均不可写 | 仍生成文件名并显示；编辑器为空可输入；状态栏提示由后续 Story 3.3 处理 | 本次不阻断启动 |
| 文件名生成异常 | 系统时间不可读 | 返回错误码 `ERR_DOC_NAME_FAILED` | 仍不阻断启动，前端使用占位文件名 |

## Code Map

- `src-tauri/src/doc.rs` — 新文件：文档名称生成逻辑、默认文档状态。
- `src-tauri/src/commands/doc.rs` — 新文件：Tauri 命令 `generate_document_name()`、`get_blank_document()`。
- `src-tauri/src/commands/mod.rs` — 导出新增 doc 命令模块。
- `src-tauri/src/lib.rs` — 将新命令注册到 `generate_handler!`。
- `src-tauri/src/config.rs` — 复用 `resolve_writable_dir` 与 `read_config`（不修改接口）。
- `src/App.vue` — 在启动时调用后端命令获取文件名，传递给 `TitleBar`；清空编辑器占位状态。
- `src/components/TitleBar.vue` — 接收 `filename` prop 显示（已有 `filename` prop，无需修改结构）。
- `src/components/StatusBar.vue` — 保持默认状态，暂不做保存路径不可写提示（由 Story 3.3 接管）。

## Tasks & Acceptance

**Execution:**
- [ ] `src-tauri/src/doc.rs` — 实现 `generate_unique_name()`：按格式生成文件名，检测冲突时重试。
- [ ] `src-tauri/src/doc.rs` — 实现 `BlankDocument` 结构或默认状态，内容为空字符串。
- [ ] `src-tauri/src/commands/doc.rs` — 实现 `generate_document_name()` 命令，返回 `CmdResult<String>`。
- [ ] `src-tauri/src/commands/doc.rs` — 实现 `get_blank_document()` 命令，返回默认文档状态（包含文件名与空内容）。
- [ ] `src-tauri/src/commands/mod.rs` — 导出 `pub mod doc;`。
- [ ] `src-tauri/src/lib.rs` — 将 `commands::doc::generate_document_name` 与 `commands::doc::get_blank_document` 注册到 handler。
- [ ] `src/App.vue` — 在 `onMounted` 中调用 `get_blank_document`，初始化文件名并清空文档状态。
- [ ] `src/App.vue` — 将文件名传递给 `TitleBar` 组件。
- [ ] `src/App.vue` — 保留源码编辑器占位区域，将默认内容置为空字符串（为 Story 2.1 替换编辑器做准备）。

**Acceptance Criteria:**
- Given 应用已启动，When 主窗口完成渲染，Then 标题栏显示形如 `New_20260722_143052_123.md` 的文件名。
- Given 文件名生成时同一毫秒内存在同名文件，When 后端生成文件名，Then 等待下一毫秒后重新生成，确保唯一。
- Given 应用启动后，When 检查源码编辑器区域，Then 内容为空字符串，且可立即获得焦点输入。
- Given 默认保存路径与回退路径均不可写，When 应用启动完成，Then 标题栏仍显示生成的文件名，编辑器为空且可输入，不阻断启动。
- Given 运行 `cd src-tauri && cargo check`，When 编译完成，Then 无错误。
- Given 运行 `cargo tauri dev`，When 应用窗口出现，Then 标题栏文件名格式正确，无白屏或报错。

## Design Notes

### 文件名生成算法

```rust
pub fn generate_unique_name() -> Result<String, String> {
    let mut last_timestamp: u64 = 0;
    loop {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| ERR_DOC_NAME_FAILED.to_string())?;
        let millis = now.as_millis() as u64;
        if millis > last_timestamp {
            last_timestamp = millis;
            let dt = chrono::DateTime::from_timestamp_millis(millis as i64)
                .ok_or_else(|| ERR_DOC_NAME_FAILED.to_string())?;
            let formatted = dt.format("%Y%m%d_%H%M%S_%3f").to_string();
            return Ok(format!("New_{}.md", formatted));
        }
        // 同一毫秒冲突，等待下一毫秒
        std::thread::sleep(std::time::Duration::from_millis(1));
    }
}
```

> 注意：由于 Tauri 命令是无状态的，无法真正持有 `last_timestamp` 跨调用。因此实际实现中不依赖上一次调用，而是检测文件是否存在。MVP 阶段仅生成文件名，不立即创建文件，因此理论上不会冲突。为保险起见，仍按时间重新生成并检查，但冲突概率极低。

### 文件名字段说明

- `New_`：固定前缀。
- `YYYYMMDD`：年月日。
- `HHMMSS`：时分秒。
- `mmm`：毫秒，3 位数字，不足前补零。
- `.md`：扩展名。

### 默认文档状态

前端默认文档状态：
- `filename: String` — 后端生成的文件名。
- `content: String` — 空字符串。
- `saveStatus: 'unsaved' | 'success' | 'failure'` — 初始为 `unsaved`。

### 保存路径不可写

- 本次 Story 不负责在状态栏提示保存路径错误。
- 文件名生成不依赖保存路径可写性。
- 保存路径不可写仅在后续自动保存触发时由 Story 3.3 处理。

## Verification

**Commands:**
- `cd src-tauri && cargo check` — expected: 无编译错误。
- `cargo tauri dev` — expected: 应用窗口出现，标题栏文件名格式正确，无白屏。
- `npm run build` — expected: 前端生产构建成功。

**Manual checks:**
- 启动应用，观察标题栏文件名是否符合 `New_YYYYMMDD_HHMMSS_mmm.md` 格式。
- 关闭并快速重新启动应用，观察文件名是否变化且不重复。
- 检查源码编辑器区域内容为空。
- 检查开发者工具 Console 中无后端命令错误。

## Spec Change Log

- 2026-07-22: 实现完成并通过 code review。
  - `src-tauri/src/doc.rs`：新增 `generate_unique_name`（带可写目录冲突检测与毫秒级重试）与 `generate_name_without_conflict_check`（降级方案）。
  - `src-tauri/src/commands/doc.rs`：命令接收 `AppHandle`，复用 `config::resolve_writable_dir`；目录不可写时不阻断启动。
  - `src-tauri/src/lib.rs`：注册 `generate_document_name` 与 `get_blank_document`。
  - `src/App.vue`：启动时调用 `get_blank_document` 初始化文件名与空内容。
  - code review 中发现的 minor 问题（前端降级占位不明确）已记录为 DW-8，延后处理。
  - 验证：`cargo check` 与 `npm run build` 均通过。
