---
title: '配置写入并发保护、主题反馈通道分离与启动配置读取去重（DW-36, DW-39, DW-41）'
type: 'chore'
created: '2026-08-02'
status: 'done'
baseline_revision: '4463941be742e2c8887688101a2f0d7334e14f05'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: 'be657c11fdd35666cac0a21b48f4b491e47f13e5'
context: []
warnings: ['multiple-goals', 'oversized']
---

<intent-contract>

## Intent

**Problem:** 三个既有的低严重度硬化缺口：(1) `set_config`/`update_last_opened_file` 各自独立执行“读配置 → 修改内存结构体 → 写回”而无同步机制，近乎同时的两次调用（如切换主题与更改保存路径）可能互相覆盖对方写入的字段；(2) `App.vue` 的 `handleThemeSelect` 复用全局 `saveStatus`/`saveMessage` 反馈通道，主题切换消息可能覆盖并掩盖用户尚未看到的文档保存成功/失败提示；(3) `main.ts` 的 `bootstrap()` 与 `App.vue` 的 `onMounted()` 启动时各自独立调用一次 `get_config`，造成冗余的 IPC/磁盘读取。

**Approach:** 在 `config.rs` 中新增一个进程级 `std::sync::Mutex<()>`，在 `set_config` 与 `update_last_opened_file` 的读-改-写临界区持锁执行，串行化并发写入；在 `App.vue` 中为主题切换新增独立的 `themeStatus`/`themeMessage` 状态，`handleThemeSelect` 只写入这两个新 ref，不再触碰 `saveStatus`/`saveMessage`，并通过 `StatusBar` 新增的可选 prop 展示，与文档保存消息互不覆盖；将 `main.ts` 中已有的、带超时保护的单次 `get_config` 调用结果以 prop 形式传给 `App` 组件，`App.vue` 的 `onMounted` 改为复用该结果（该 prop 缺失时才回退为自行调用，作为纯防御性分支，正常运行路径下不会触发），从而使启动期只发生一次 `get_config` 调用。

## Boundaries & Constraints

**Always:**
- `config.rs` 新增的 `Mutex<()>` 必须是模块级 `static`（`const fn` 构造，无需 `lazy_static`/`once_cell`），且仅覆盖 `set_config` 与 `update_last_opened_file` 内部从 `read_config` 到 `write_config` 完成的临界区；加锁需处理中毒（poisoned）场景（如用 `unwrap_or_else(|poisoned| poisoned.into_inner())`），不得因中毒而永久阻断后续配置写入。
- `App.vue` 新增的 `themeStatus`/`themeMessage` 类型须与既有 `SaveStatus`（`'unsaved' | 'success' | 'failure'`）保持一致的取值集合，`handleThemeSelect` 的三条分支（写入失败、异常、成功）都必须改写为使用新 refs，且不得再赋值给 `saveStatus`/`saveMessage`。
- `StatusBar.vue` 新增的主题反馈展示不得替换或覆盖现有 `message`/`status` prop 的渲染区域，两个反馈通道须在视觉上同时可见（各自独立的文本节点）。
- `main.ts` 中已有的 `CONFIG_PRELOAD_TIMEOUT_MS` 超时包装逻辑必须保留；`App.vue` 的 `onMounted` 必须消费同一次调用产生的结果（通过 prop 传入的 Promise 或已结算结果），不得在正常路径下再发起第二次 `get_config` invoke 调用。
- `onMounted` 中现有的 savePath/lastOpenedFile 恢复、`get_blank_document` 回退、`get_app_dir` 回退等既有行为链路必须保持不变（只替换配置来源，不改变后续处理逻辑与顺序）。

**Block If:** 无需人工决策的已知阻塞条件 —— 三处修改均为既有行为的内部硬化（加锁、拆分反馈通道、去重网络调用），不改变对外可观察的正常成功路径行为，无需暂停等待人工输入。

**Never:**
- 不改变 `set_config`/`update_last_opened_file`/`get_config` 的 Tauri 命令签名、参数或返回值结构（`CmdResult<()>`/`CmdResult<AppConfig>` 保持不变）。
- 不引入新的 npm/cargo 依赖（不使用 `lazy_static`、`once_cell`、前端状态管理库等）。
- 不改变 `set_confluence_config` 的现有读-改-写实现（本次仅锁定 ledger 明确指出的 `set_config`/`update_last_opened_file` 两个函数）。
- 不移除或改变 `main.ts` 中 `withTimeout`/`CONFIG_PRELOAD_TIMEOUT_MS` 的超时时长与降级到默认主题的行为。
- 不改变 `MenuBar.vue` 中主题下拉的勾选标记（`✓`）逻辑；本次新增的反馈通道是对既有勾选反馈的补充，不是替代。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 并发配置写入 | 前端几乎同时触发一次 `set_config`（主题）与一次 `update_last_opened_file`（打开文件） | 两次调用串行执行各自完整的读-改-写周期，最终配置文件同时包含双方写入的字段 | 若某次写入本身失败，返回该次调用的 `CmdResult` 错误，不影响另一次已完成或后续调用 |
| 主题切换成功且存在未读的保存失败提示 | `saveStatus === 'failure'` 且 `saveMessage` 显示旧的保存失败信息，此时用户切换主题成功 | `themeStatus`/`themeMessage` 更新为成功态并展示切换结果；`saveStatus`/`saveMessage` 及其展示的保存失败信息保持不变、不被覆盖 | 无 |
| 主题保存失败或异常 | `set_config` 返回 `ok: false` 或抛出异常 | 仅 `themeStatus`/`themeMessage` 置为失败态并展示错误信息，`saveStatus`/`saveMessage` 不受影响 | 主题状态回退到切换前的 `previousThemeId`（既有行为保持不变） |
| 启动期配置读取 | 应用启动，`main.ts` 的 `bootstrap()` 发起唯一一次 `get_config` 调用 | 该次调用结果同时用于 `main.ts` 的主题预加载与 `App.vue` `onMounted` 的 savePath/lastOpenedFile 恢复；启动期只产生一次 `get_config` IPC 调用 | 若该次调用超时或失败，`main.ts` 沿用默认主题，`App.vue` 视为 `configRes` 不可用并回退到既有的“默认保存路径”分支，不再发起第二次调用 |

</intent-contract>

## Code Map

- `src-tauri/src/commands/config.rs` -- 新增模块级 `static CONFIG_WRITE_LOCK: std::sync::Mutex<()>`；在 `set_config`、`update_last_opened_file` 的读-改-写临界区持锁。
- `src/App.vue` -- 新增 `themeStatus`/`themeMessage` refs；`handleThemeSelect` 改用新 refs；新增 `defineProps` 接收 `main.ts` 传入的共享配置结果；`onMounted` 复用该结果而非重新 `invoke('get_config')`；`StatusBar` 使用处新增主题反馈 prop 绑定。
- `src/components/StatusBar.vue` -- 新增可选 `themeMessage`/`themeStatus` prop 与对应的独立展示节点。
- `src/main.ts` -- 保留现有超时包装的单次 `get_config` 调用，将其结果（作为 Promise）通过 `createApp(App, { configPromise })` 传给根组件。

## Tasks & Acceptance

**Execution:**
- [x] `src-tauri/src/commands/config.rs` -- 新增 `static CONFIG_WRITE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());`，并在 `set_config`、`update_last_opened_file` 函数体内、`resolve_writable_dir` 成功分支中获取该锁（`unwrap_or_else` 处理中毒）后再执行 `read_config` → 修改 → `write_config`，锁在临界区结束时随作用域释放 -- 解决 DW-36：串行化并发配置写入，避免字段互相覆盖
- [x] `src/App.vue` -- 新增 `const themeStatus = ref<SaveStatus>('unsaved')` 与 `const themeMessage = ref('')`；将 `handleThemeSelect` 内三处 `saveStatus.value =`/`saveMessage.value =` 赋值全部改为写入 `themeStatus`/`themeMessage` -- 解决 DW-39：主题反馈不再复用文档保存通道
- [x] `src/components/StatusBar.vue` -- 新增 `themeMessage?: string` 与 `themeStatus?: 'unsaved' | 'success' | 'failure'` props，在 `.right` 区域新增一个独立 `<span>`（仅当 `themeMessage` 非空时渲染，按 `themeStatus` 应用既有的 `success`/`failure` 颜色类）展示主题反馈 -- 使主题反馈可见但与文档保存消息视觉隔离
- [x] `src/App.vue` -- 在 `<StatusBar ... />` 使用处新增 `:theme-message="themeMessage"` 与 `:theme-status="themeStatus"` 绑定 -- 接通新反馈通道到界面
- [x] `src/main.ts` -- 将现有 `withTimeout(invoke<CmdResult<AppConfig>>('get_config'), CONFIG_PRELOAD_TIMEOUT_MS)` 的结果保存为 `configPromise` 常量（不再仅在 `try` 块局部使用），在其基础上分支处理主题预加载后，调用 `createApp(App, { configPromise }).mount('#app')` -- 使该唯一一次调用的结果可被 `App.vue` 复用
- [x] `src/App.vue` -- 新增 `const props = defineProps<{ configPromise?: Promise<CmdResult<AppConfig>> }>()`；`onMounted` 中把原先的 `await invoke<CmdResult<AppConfig>>('get_config')` 替换为：若 `props.configPromise` 存在则 `await props.configPromise`（用 `try/catch` 包裹，捕获后视为 `configRes` 未定义，走既有失败分支），否则回退为原直接 `invoke` 调用（防御性分支） -- 解决 DW-41：启动期只发生一次 `get_config` 调用，同时保留原有 savePath/lastOpenedFile/回退链路不变

**Acceptance Criteria:**
- Given 应用正常启动且 `get_config` 在超时时间内成功返回，when `main.ts` 的 `bootstrap()` 与 `App.vue` 的 `onMounted()` 都执行完毕，then 全程只发生一次 `get_config` invoke 调用，且 `App.vue` 中 savePath/lastOpenedFile 的恢复行为与改动前一致。
- Given 用户在文档保存失败提示尚未处理时切换主题且切换成功，when `handleThemeSelect` 执行完毕，then `saveStatus`/`saveMessage`（及其在 `StatusBar` 上呈现的保存失败信息）保持不变，`themeStatus`/`themeMessage` 呈现主题切换成功的独立提示。
- Given 前端几乎同时发起一次 `set_config`（切换主题）与一次 `update_last_opened_file`（打开新文件）请求，when 两次调用先后完成，then 最终写入的 `config.json` 同时包含新的 `theme_id` 与新的 `last_opened_file`，任一字段都不会被对方的读-改-写周期覆盖丢失。

## Verification

**Commands:**
- `cargo check` (在 `src-tauri` 目录下) -- expected: 编译通过，无新增警告
- `npx vue-tsc --noEmit` -- expected: 类型检查通过，无新增类型错误
- `npx playwright test e2e/story-6-2.spec.ts` -- expected: 既有主题切换 E2E 用例全部通过，未因反馈通道拆分而回归

**Manual checks (if no CLI):**
- 在 `set_config` 与 `update_last_opened_file` 中临时插入短暂 `std::thread::sleep`（仅用于本地验证，不提交），从前端几乎同时触发主题切换与打开文件，确认最终 `config.json` 同时包含两次写入的字段后撤销该临时改动。

## Review Triage Log

### 2026-08-02 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2 (medium 1, low 1)
- defer: 3 (low 3)
- reject: 8
- addressed_findings:
  - `[medium]` `[patch]` `src/App.vue` `onMounted`：共享 `configPromise` 拒绝/超时时静默吞掉错误且不再重试，导致罕见的慢 IPC 场景下 savePath/lastOpenedFile 恢复能力永久丢失（较改动前的独立调用更脆弱）。已改为：捕获失败原因并 `console.warn` 记录，随后做一次有界的直接 `get_config` 重试（仅发生在失败路径，不违反“正常路径只调用一次”的约束），重试仍失败则维持既有的“回退到默认保存路径”分支。
  - `[low]` `[patch]` `src/components/StatusBar.vue` `.theme-feedback`：新增的主题反馈文本没有溢出处理，窗口较窄或错误信息较长时可能挤占/裁切光标位置与文档类型显示。已新增 `overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 12rem;`。

## Auto Run Result

Status: done

**Summary:** 解决 DW-36（`set_config`/`update_last_opened_file` 读-改-写并发覆盖）、DW-39（主题切换反馈复用文档保存通道导致提示互相掩盖）、DW-41（启动期 `main.ts` 与 `App.vue` 各自独立调用 `get_config` 造成重复读取）三个既有低严重度硬化缺口。

**Files changed:**
- `src-tauri/src/commands/config.rs` -- 新增模块级 `static CONFIG_WRITE_LOCK: std::sync::Mutex<()>`，在 `set_config`、`update_last_opened_file` 的读-改-写临界区持锁（含中毒处理），串行化并发写入。
- `src/App.vue` -- 新增独立的 `themeStatus`/`themeMessage` refs，`handleThemeSelect` 不再复用 `saveStatus`/`saveMessage`；新增 `configPromise` prop，`onMounted` 复用 `main.ts` 传入的共享配置结果而非重新发起 `get_config`（评审后加固：共享结果失败时记录日志并做一次有界重试）；`StatusBar` 使用处新增主题反馈绑定。
- `src/components/StatusBar.vue` -- 新增可选 `themeMessage`/`themeStatus` prop 与独立展示节点（评审后加固：新增溢出省略号处理，避免挤占光标位置/文档类型显示）。
- `src/main.ts` -- 保留既有超时包装的单次 `get_config` 调用，将其 Promise 通过 `createApp(App, { configPromise })` 传给根组件，避免启动期重复读取配置。

**Review findings breakdown:**
- 0 intent_gap，0 bad_spec。
- 2 patch 已自动修复（1 medium：共享配置 Promise 失败时补充有界重试与日志；1 low：主题反馈文本溢出省略号处理）。
- 3 defer（不属于本次故事范围，未写入 deferred-work 台账，随本报告移交编排器记录）：
  1. `set_confluence_config` 仍是独立的读-改-写且未加锁，与本次已加锁的 `set_config`/`update_last_opened_file` 并发时仍可能互相覆盖字段（ledger 明确只要求覆盖后两者，故未纳入本次范围）。
  2. `get_config`/`read_config` 的读取路径与 `write_config` 的写入路径之间没有协调机制，写入过程中的读取理论上仍可能读到不完整内容（本次新增的 Mutex 只串行化了写者之间，未覆盖读者）。
  3. `StatusBar` 的 `role="status"` 区域同时包含光标位置、文档类型与（新增的）主题反馈等多个动态内容源，单一 live region 在内容变化时可能导致屏幕阅读器噪声较大的重复播报；该问题在光标位置显示引入时已预先存在，本次新增的主题反馈只是又增加了一个触发源。
- 8 reject（噪音或与本次范围无关，已丢弃）：`read_config` 失败时静默回退默认配置属既有行为；`themeMessage` 不会被后续操作自动清除（与既有 `saveMessage` 从不自动清除的既定约定一致，非本次引入的缺陷）；三条关于缺少新增自动化测试覆盖的建议（新增测试基础设施不在本次任务范围内）；关于跨进程文件锁的建议（ledger 原文明确要求的是“进程级互斥锁”，跨进程文件锁超出本次既定范围）。

**Verification performed:**
- `cargo check`（`src-tauri` 目录）：通过，无新增警告。
- `npx vue-tsc --noEmit`：通过，无类型错误。
- `npx playwright test`（全量 104 个用例）：全部通过，无回归；补丁后针对性重跑 `story-6-2`/`story-3-2`/`story-3-3`/`story-4-3`/`story-2-3` 共 22 个用例：全部通过。

**Residual risks:**
- 上述 3 项 defer 为已知、低严重度的残留风险，均超出本次三个 DW 条目的既定范围，建议后续单独排期处理。
- `set_config`/`update_last_opened_file` 的互斥锁仅在同一进程内生效；若用户在同一时间以多进程方式打开同一份配置文件（本应用当前架构下极少发生），仍可能出现覆盖，此为 ledger 原始意图明确接受的范围边界。
