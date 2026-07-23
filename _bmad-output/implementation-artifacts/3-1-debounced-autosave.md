---
title: 'Story 3.1: 接入 300ms 防抖自动保存流程'
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
---

## Intent

**Problem:** 前端编辑器在 Story 2.1 - 2.5 中已经实现了 Markdown 源码输入、只读预览渲染、响应式 1:1 双栏布局以及保存状态机 UI 管道；但编辑器的内容变更仅存在于内存中，尚未接入真正写入磁盘文件的自动化保存能力。当用户停止输入后，无法自动将文件存盘，这违背了 MVP 的“无按钮按键级自动保存”核心承诺。

**Approach:** 
1. 在 Rust 后端实现 `save_document(app_handle: AppHandle, filename: String, content: String) -> CmdResult<SaveResult>` 后端命令，根据解析得出的默认可写目录（调用 `config::resolve_writable_dir`）将 `content` 写入对应文件，遵循原子写入或安全的本地写盘流程，并遵循 `{ ok: boolean, data?: SaveResult, error?: string }` 通用数据结构；
2. 在前端 `App.vue` 中构建 300ms 防抖保存机制（Debounce Timeout = 300ms）：每当 `content` 发生变化，重置防抖定时器；当用户停止输入 300ms 倒计时结束后，发起一次 Tauri `invoke('save_document', { filename, content })` 命令；
3. 保存期间不阻塞 UI 和用户继续输入，若上一次防抖尚未完成用户又有了新输入，防抖定时器被清除重置，确保只有最后一次变更得到写盘，防范多版本覆盖与并发写冲突；
4. 编写 E2E 测试 `e2e/story-3-1.spec.ts`，利用 `e2e/fixtures.ts` 中导出的 `__FAKE_TIMERS__` 机制精准校验 300ms 防抖时序与调用次数。

## Boundaries & Constraints

**Always:**
- 防抖倒计时必须固定为 **300ms**，以 `content` 状态变化事件为单位触发，禁止用原始 `keydown` 事件防抖（防范输入法 IME 组合过程中的多余触发）。
- 连续快速输入时，防抖必须被重新重置（Reset），确保仅在最后一次停止输入 300ms 后才真正触发一次写盘 `invoke`。
- 保存操作必须在 Rust 后端异步执行，返回统一协议 `{ ok: boolean, data?: SaveResult, error?: string }`。
- 保存期间 UI 必须保持流畅，用户仍可正常输入、选中文本或滚动。
- 在 `e2e/fixtures.ts` 中注册 `save_document` 的 mock 处理器，并在 E2E 测试中通过 `__FAKE_TIMERS__.tick(300)` 精度验证防抖逻辑。

**Ask First:**
- 是否需要引入外部防抖库（如 `lodash.debounce`）？——不需要，使用简单的 `setTimeout` / `clearTimeout` 封装即可，保持体积最简。
- 是否需要在界面上加入显式的“保存”按钮？——不需要，MVP 采用无声防抖自动保存，无传统保存按钮。

**Never:**
- 不要在每次按键时直接调用 Rust 写盘命令。
- 不要在前端直接引入 Node `fs` 等不可用模块。
- 不要破坏已有的编辑器输入、Markdown 渲染、三态圆点显示与 1:1 双栏布局。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 用户连续快速键入 10 个字符 | `content` 在 100ms 内变动 10 次 | 内存 `content` 实时变动，无 Rust `save_document` 调用 | 无 |
| 用户停止输入达到 300ms | 停顿倒计时满 300ms | 前端向 Rust 发起一次 `save_document(filename, content)` 调用 | 后端处理写入结果 |
| 倒计时 200ms 时用户再次键入 | 在 200ms 处追加输入 | 旧倒计时被清除（clearTimeout），新 300ms 倒计时重新计算 | 无 |
| 保存后端成功 | `save_document` 返回 `{ ok: true, data: { filename, path } }` | 触发保存成功更新 | 供 Story 3.2 显示已保存提示 |
| 保存后端失败 (如目录不可写) | `save_document` 返回 `{ ok: false, error: 'ERR_DIR_NOT_WRITABLE' }` | 触发保存失败处理，编辑状态不丢失 | 供 Story 3.3 显示错误提示并保留内容 |

## Code Map

- `src-tauri/src/doc.rs` — **修改**：增加文档保存底层逻辑 `save_document_to_dir(save_dir, filename, content)`。
- `src-tauri/src/commands/doc.rs` — **修改**：暴露 Tauri 命令 `save_document(app_handle, filename, content)`。
- `src-tauri/src/commands/mod.rs` — **修改**：注册 `save_document` 命令。
- `src/App.vue` — **修改**：增加 300ms 防抖保存逻辑，监听 `content` 变化，计时结束后调用 `invoke('save_document', ...)`。
- `e2e/fixtures.ts` — **修改**：增加 `save_document` 命令的 Mock handler。
- `e2e/story-3-1.spec.ts` — **新文件**：E2E 测试，覆盖 300ms 防抖时序、防抖重置、并发/防过时覆盖。

## Design Notes

### 防抖保存实现逻辑 (App.vue)

```typescript
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

function triggerDebouncedAutoSave(newContent: string) {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }

  // 防抖 300ms
  autoSaveTimer = setTimeout(async () => {
    try {
      const res = await invoke<CmdResult<SaveResult>>('save_document', {
        filename: filename.value,
        content: newContent,
      })
      if (res.ok) {
        saveStatus.value = 'success'
        saveMessage.value = `已保存至 ${filename.value}`
      } else {
        saveStatus.value = 'failure'
        saveMessage.value = `保存失败：${res.error || '未知错误'}`
      }
    } catch (err: any) {
      saveStatus.value = 'failure'
      saveMessage.value = `保存失败：${err?.message || '网络或系统异常'}`
    }
  }, 300)
}
```

### Rust 命令实现 (src-tauri/src/commands/doc.rs)

```rust
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct SaveResult {
    pub filename: String,
    pub path: String,
}

#[tauri::command]
pub fn save_document(
    app_handle: tauri::AppHandle,
    filename: String,
    content: String,
) -> CmdResult<SaveResult> {
    match config::resolve_writable_dir(&app_handle) {
        Ok(save_dir) => match doc::save_document_to_dir(&save_dir, &filename, &content) {
            Ok(full_path) => CmdResult::success(SaveResult {
                filename,
                path: full_path,
            }),
            Err(e) => CmdResult::failure(e),
        },
        Err(e) => CmdResult::failure(e),
    }
}
```

## Tasks & Acceptance Criteria

**Execution:**
- [x] 修改 `src-tauri/src/doc.rs`：增加 `save_document_to_dir` 函数，支持安全的文档写盘。
- [x] 修改 `src-tauri/src/commands/doc.rs`：增加并导出 `save_document` 后端命令。
- [x] 修改 `src-tauri/src/commands/mod.rs` 与 `src-tauri/src/lib.rs`：注册 `save_document` 命令。
- [x] 修改 `e2e/fixtures.ts`：向 mock 环境中注册 `save_document` 指令响应及 `w.__TAURI_INTERNALS__` 依赖。
- [x] 修改 `src/App.vue`：引入 300ms 防抖保存逻辑，监听 `content` 变化，计时结束后调用 `invoke('save_document', ...)`。
- [x] 新增 `e2e/story-3-1.spec.ts`：精准测试 300ms 防抖时序、防抖重置、仅最后一次变更写盘、连续键入无过频 IPC 触发。
- [x] 验证 `cargo check` / `cargo build` 无 Rust 编译错误。
- [x] 验证 `npm run build` TypeScript 类型检查无报错。
- [x] 验证所有已完成 Story 的 E2E 回归测试全部通过。

**Acceptance Criteria:**
- [x] Given 用户在源码编辑器中连续输入，When 内容持续变化，Then 系统只更新内存中的文档状态，不会在每次按键时触发文件写入与后端命令调用。
- [x] Given 用户停止输入至少 300ms，When 防抖倒计时结束，Then 前端触发一次 `save_document` 命令到 Rust 后端，保存当前最新文档内容。
- [x] Given 用户在 300ms 防抖倒计时结束前继续输入，When 防抖计时被重置，Then 仅最后一次停止输入 300ms 后的保存会真正执行，不存在并发写冲突或版本倒退。
- [x] Given 运行 `cargo check` 与 `npm run build`，When 编译完成，Then 无任何错误。
- [x] Given 运行所有 E2E 测试，When 测试完成，Then 全部通过，无回归。

## Verification

**Commands:**
- `cd src-tauri && cargo check` — ✅ 零错误通过。
- `npm run build` — ✅ TypeScript 类型检查无报错。
- `npx playwright test e2e/story-3-1.spec.ts` — ✅ 3 个防抖与存盘反馈用例全过。
- `npx playwright test` — ✅ 49 个全量 E2E 回归测试全部通过。

## Dev Agent Record

### Agent Model Used

(to be filled by dev agent)

### Completion Notes

- 2026-07-23：完成 Story 3.1 实现与验证。Rust 后端添加 `save_document_to_dir` 与 `save_document` Tauri 指令；前端 `App.vue` 实现 300ms 防抖框架（`window.setTimeout` / `window.clearTimeout`）；`e2e/fixtures.ts` 中注册 `save_document` mock 并补全 `w.__TAURI_INTERNALS__`。
- 新增 3 个 E2E 测试用例，49 个全量 E2E 测试（Epic 1、2 & 3.1）100% 通过。

### File List

- 修改：`src-tauri/src/doc.rs`（新增 `save_document_to_dir` & `ERR_SAVE_FAILED`）
- 修改：`src-tauri/src/commands/doc.rs`（新增 `SaveResult` & `save_document` 指令）
- 修改：`src-tauri/src/lib.rs`（注册 `commands::doc::save_document`）
- 修改：`src/lib/types.ts`（导出 `SaveResult` 接口）
- 修改：`src/App.vue`（实现 300ms 防抖保存 `triggerDebouncedAutoSave` 与 `watch(content)` 触发）
- 修改：`e2e/fixtures.ts`（增加 `save_document` mock 处理器 & `w.__TAURI_INTERNALS__` 补全）
- 新增：`e2e/story-3-1.spec.ts`（3 个防抖与自动保存测试用例）

## Change Log

- 2026-07-23: 创建 Story 3.1 故事文件。明确 Rust 后端文档保存命令 `save_document` 以及前端 300ms 防抖自动保存规范。
- 2026-07-23: 开发与测试完成，状态切换为 `review`。实现 Rust 保存指令与前端 300ms 防抖逻辑，新增 3 个 E2E 测试，49 个全量 E2E 测试全部通过。
- 2026-07-23: Code Review 通过（Clean review）。状态 `review` → `done`。


