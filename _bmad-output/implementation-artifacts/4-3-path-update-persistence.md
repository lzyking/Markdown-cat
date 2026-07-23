---
title: 'Story 4.3: 实现路径更新后的即时反馈与重启持久化验证'
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
  - /_bmad-output/implementation-artifacts/4-2-folder-config-write.md
---

## Intent

**Problem:** 虽然 Story 4.2 实现了设置保存路径的写盘与连通，但在对话框关闭后缺乏明确的状态栏成功反馈（用户不确定是否保存成功），且在应用启动时需要建立从 `config.json` 自动读取 `savePath` 的启动加载逻辑与配置文件损毁安全回退保障。

**Approach:** 
1. 当用户在 `SettingsModal` 中保存新路径成功并触发 `update-path` 时：
   - 更新 `currentSavePath`，同时将状态栏消息设置为 `保存路径已更新`，并将 `saveStatus` 设为 `'success'`（显示绿色提示与 success 样式），直到下一轮保存事件或键入更新。
2. 在 `App.vue` 的 `onMounted` 生命周期中：
   - 增加调用 `invoke('get_config')`；
   - 若 `get_config` 返回 `{ ok: true, data: { savePath: "..." } }` 且 `savePath` 非空，将 `currentSavePath` 初始化为该自定义路径；
   - 若 `get_config` 返回配置文件坏损或回退，则安全回退使用 `get_app_dir` 的默认路径，并在状态栏提示 `已回退到默认保存路径`。
3. 编写 `e2e/story-4-3.spec.ts`，覆盖修改路径成功后的状态栏即时反馈、重启/启动从配置读取持久化路径以及配置文件坏损回退机制。

## Boundaries & Constraints

**Always:**
- 保存路径更新成功对话框关闭后，状态栏必须显示“保存路径已更新”成功提示，保持可见直到下一次保存事件更新状态。
- 应用启动时必须优先读取 JSON 配置文件中的自定义保存路径。
- 若配置文件损坏或丢失，应用绝不崩溃崩溃阻断，必须优雅回退到默认保存路径，并在状态栏提示“已回退到默认保存路径”。
- 必须复用 `e2e/fixtures.ts` 编写 Playwright E2E 测试。

**Ask First:**
- 回退提示是否需要长期留存？——按照 AC 约定，在启动阶段若发生坏损回退，状态栏展示回退提示，直到后续用户重新设置或保存。

**Never:**
- 绝不能因配置文件读取失败或 JSON 格式错误导致应用界面崩溃打不开。
- 不要在用户未更改路径时无故在状态栏覆盖展示“保存路径已更新”。
- 不要破坏已有的双栏布局、只读预览、按键级自动保存与设置对话框 Modal。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 保存路径更新成功 | 用户在 Modal 点击确认写入成功 | Modal 关闭，状态栏显示 `保存路径已更新`（绿色 success 样式） | 无 |
| 应用启动加载配置 | 应用启动，`get_config` 返回 `{ savePath: '/custom/dir' }` | `currentSavePath` 自动设为 `/custom/dir`，新建保存使用该路径 | 无 |
| 配置文件损坏启动 | 应用启动，`get_config` 返回配置坏损/使用默认 | `currentSavePath` 使用 `get_app_dir` 默认目录，状态栏提示 `已回退到默认保存路径` | 优雅回退 |

## Code Map

- `src/App.vue` — **修改**：处理 `update-path` 设置 `保存路径已更新` 反馈，在 `onMounted` 中增加 `get_config` 持久化加载与坏损回退。
- `e2e/story-4-3.spec.ts` — **新文件**：E2E 测试，覆盖更新反馈、配置重启持久化及坏损回退断言。

## Tasks & Acceptance Criteria

**Execution:**
- [x] 修改 `src/App.vue`：在路径更新成功时设置状态栏消息 `保存路径已更新` 与 `saveStatus = 'success'`。
- [x] 修改 `src/App.vue`：在 `onMounted` 钩子中增加 `get_config` 逻辑，处理启动时的持久化路径恢复与坏损回退提示。
- [x] 新增 `e2e/story-4-3.spec.ts`：测试保存路径已更新即时反馈、重启从配置读取路径及坏损安全回退。
- [x] 验证 `cargo check` / `cargo build` 无报错。
- [x] 验证 `npm run build` TypeScript 类型检查通过。
- [x] 验证全量 E2E 回归测试全部通过。

**Acceptance Criteria:**
- [x] Given 保存路径写入成功，When 对话框关闭，Then 状态栏显示“保存路径已更新”成功提示，符合 success 样式规范。
- [x] Given 应用已完成保存路径更新，When 用户关闭并重新启动应用，Then 应用从配置文件中读取新的默认保存路径，首次新建文档使用更新后的路径。
- [x] Given 配置读取失败或配置文件损坏，When 应用启动，Then 应用安全回退到默认保存路径，并在状态栏提示“已回退到默认保存路径”，用户仍可通过菜单重新设置保存路径而不被阻断。
- [x] Given 运行 `npm run build`，When 构建完成，Then 无 TypeScript 或 Vue 编译错误。
- [x] Given 运行所有 E2E 测试，When 测试完成，Then 全部通过，无回归。

## Verification

**Commands:**
- `cargo check` — ✅ 零错误。
- `npx vue-tsc --noEmit` — ✅ 类型检查通过。
- `npx playwright test e2e/story-4-3.spec.ts` — ✅ 3 个反馈与持久化测试全过。
- `npx playwright test` — ✅ 65 个全量 E2E 测试全过。

## Dev Agent Record

### Agent Model Used

(to be filled by dev agent)

### Completion Notes

- 2026-07-23：完成 Story 4.3 实现与验证。实现保存路径更新后的状态栏 `保存路径已更新` 即时反馈，在 `App.vue` 的 `onMounted` 钩子中增加 `get_config` 持久化 `savePath` 加载与坏损优雅回退（显示 `已回退到默认保存路径`）。
- 新增 3 个 E2E 测试用例，65 个全量 E2E 测试 100% 通过。

### File List

- 修改：`src/App.vue`（路径更新反馈、`onMounted` 增加 `get_config` 读取与坏损回退提示）
- 优化：`e2e/fixtures.ts`（增强 `get_config` mock 支撑自定义路径与异常回退测试）
- 新增：`e2e/story-4-3.spec.ts`（3 个 E2E 测试用例）

## Change Log

- 2026-07-23: 创建 Story 4.3 故事文件。规范保存路径更新即时反馈、重启配置读取持久化与坏损回退体验。
- 2026-07-23: 开发与测试完成，状态切换为 `review`。新增 3 个 E2E 测试用例，65 个全量测试全部通过。
- 2026-07-23: Code Review 通过（Clean review）。状态 `review` → `done`。


