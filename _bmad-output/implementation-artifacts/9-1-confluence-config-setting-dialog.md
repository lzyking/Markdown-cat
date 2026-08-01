---
id: 9-1-confluence-config-setting-dialog
title: Confluence REST API Configuration Setting Modal
epic: epic-9
status: done
baseline_revision: d8aaa4747c9847b0db07b0ba1aa2c686cf132376
review_loop_iteration: 0
followup_review_recommended: false
final_revision: 2939144
---

# Story 9.1: Confluence REST API Configuration Setting Modal

## Story Description
作为用户，我可以在软件设置中配置 Confluence REST API 连接凭证（Base URL, Username, API Token, Space Key, Parent Page ID），并测试网络连通性，为文档发布做准备。

## Acceptance Criteria
1. **设置配置界面**: 在设置面板/对话框中增加 Confluence 标签页，提供输入字段：Confluence Server URL, Username/Email, API Token / Personal Access Token, Space Key, Parent Page ID。
2. **测试连接 (Test Connection)**: 点击按钮调用 Confluence REST API `/rest/api/space/{spaceKey}` 进行连通性与权限校验，返回成功或明确报错信息。
3. **安全存储**: API Token 安全保存在配置中，防止明文暴露。
4. **自签名 SSL 支持与工具校验**: 设置界面提供“允许自签名证书 (Ignore SSL Verification)”开关；测试连接时自动检测系统 `md2cf` 依赖状态或提供 REST API 直连模式选项。
5. **输入正则前端校验**: 对 Space Key（字母数字下划线）与 Parent Page ID（纯数字字符串）进行即时正则表达式格式校验与失焦提示。

## Tasks & Acceptance

**Execution:**
- [x] `src-tauri/src/config.rs` -- 新增 `ConfluenceConfig` 结构与 Space Key / Parent Page ID 校验函数 -- 承载非敏感 Confluence 配置字段
- [x] `src-tauri/src/commands/config.rs` -- 新增 `set_confluence_config`、`get/set/clear_confluence_token`（基于 `keyring` 安全存储）、`check_md2cf_installed`、`test_confluence_connection` 命令 -- 实现 AC2/AC3/AC4 的后端能力
- [x] `src-tauri/src/lib.rs` -- 注册新增 Tauri 命令 -- 使前端可调用
- [x] `src-tauri/Cargo.toml` -- 新增 `keyring`、`reqwest` 依赖 -- 支撑安全存储与 REST API 调用
- [x] `src/components/SettingsModal.vue` -- 新增 Confluence 标签页、5 个输入字段、SSL 开关、测试连接面板、失焦正则校验 -- 实现 AC1/AC4/AC5 的前端交互
- [x] `src/lib/types.ts` -- 新增 `ConfluenceConfig`/`ConfluenceTokenStatus`/`Md2cfCheckResult`/`ConfluenceTestResult` 类型 -- 保持前后端类型一致
- [x] `e2e/fixtures.ts`, `e2e/utils/tauri-mock.ts` -- 补充 Confluence 相关命令 mock -- 保证既有与新增 E2E 用例可运行
- [x] `e2e/story-9-1.spec.ts` -- 新增覆盖 AC1/AC2/AC3/AC4/AC5 的 E2E 用例 -- 回归保护
- [x] `e2e/story-4-1.spec.ts` -- 更新弹窗标题断言（`设置` 取代 `设置保存路径`，因弹窗改为通用设置对话框） -- 修复因本story引入的标题变更导致的既有用例失败

**Acceptance Criteria:**
- Given 设置弹窗已打开, when 用户切换到 Confluence 标签页, then 展示 Server URL / 用户名 / API Token / Space Key / Parent Page ID 五个输入字段（`SettingsModal.vue:388-457`）
- Given 已填写 Base URL/用户名/Space Key, when 点击“测试连接”, then 前端调用 `test_confluence_connection` 命令请求 `/rest/api/space/{spaceKey}`，并展示成功或明确错误信息（`SettingsModal.vue:269-317`；`commands/config.rs:282-360`）
- Given 用户输入 API Token 并保存, when 配置写入完成, then Token 通过 `keyring` 存入系统安全凭据库，配置文件 JSON 中不包含明文 Token（`commands/config.rs:154-172`；`config.rs:58-85`）
- Given 用户勾选“忽略 SSL 校验”, when 执行测试连接, then 请求使用 `danger_accept_invalid_certs` 且附带 10 秒超时；同时检测 `md2cf` 是否安装并给出直连模式提示（`commands/config.rs:206-243,282-286`）
- Given Space Key 或 Parent Page ID 输入非法字符并失焦, when 触发 blur 事件, then 对应字段下方显示格式错误提示（`SettingsModal.vue:13-14,55-67,433-456`）

## Spec Change Log

(空 — 本轮评审未触发 bad_spec 修订)

## Review Triage Log

### 2026-08-01 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5 (high 0, medium 3, low 2)
- defer: 4 (medium 1, low 3)
- reject: 5 (low 5)
- addressed_findings:
  - `[medium]` `[patch]` REST API 测试连接 `reqwest` 客户端未设置超时，可能无限挂起 —— 已添加 `.timeout(Duration::from_secs(10))`（`commands/config.rs`）
  - `[medium]` `[patch]` `check_md2cf_installed` 无论子进程退出码如何均报告 `installed: true` —— 已改为依据 `output.status.success()` 判定，并更新友好提示文案（`commands/config.rs`）
  - `[medium]` `[patch]` Confluence 配置保存成功但令牌保存失败时，错误提示未说明部分已保存 —— 已更新提示文案为“配置已保存，但安全令牌保存失败”（`SettingsModal.vue`）
  - `[low]` `[patch]` 保存/清除令牌/测试连接三个操作按钮未互斥禁用，存在并发触发风险 —— 新增 `confluenceBusy` 计算属性并应用到三个按钮的 `disabled` 绑定（`SettingsModal.vue`）
  - `[low]` `[patch]` 新增功能缺少自动化回归测试 —— 新增 `e2e/story-9-1.spec.ts` 覆盖标签渲染、正则校验、测试连接反馈、Token 占位符四个场景，并修复因本 story 标题变更导致失败的既有 `story-4-1` 用例

### 2026-08-01 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1 (medium 1)
- defer: 6 (low 6)
- reject: 5 (low 5)
- addressed_findings:
  - `[medium]` `[patch]` `loadConfluenceSettings` 使用 `Promise.all` 并发拉取配置与令牌状态；若令牌状态请求 reject，会连同已成功读取的配置一起被 catch 块清空为空白表单 —— 改用 `Promise.allSettled` 并分别处理两个结果，任一失败不再清空另一个已成功加载的数据（`src/components/SettingsModal.vue`）；顺带将 `token_entry()` 的错误码从固定的 `ERR_CONFLUENCE_TOKEN_READ_FAILED` 改为语义正确的 `ERR_CONFLUENCE_TOKEN_ENTRY_FAILED`（新增常量于 `src-tauri/src/config.rs`），因为该函数同时被写入/删除路径复用，原错误码在写入/删除失败时具有误导性

## Auto Run Result

Status: done

**Summary**: 对 Story 9.1（Confluence REST API 配置设置对话框）进行了一轮独立的跟进评审（Blind Hunter + Edge Case Hunter 并行审阅自 `d8aaa474` 以来的全部 diff）。评审未发现 intent_gap 或 bad_spec 级别问题，代码无需回退重派生；仅命中一处可自动修复的 medium 级问题，其余为已记录追踪的低优先级项或噪音。

**Files changed this pass**:
- `src/components/SettingsModal.vue` — 将 `loadConfluenceSettings` 中的 `Promise.all` 改为 `Promise.allSettled`，避免令牌状态请求失败时连带清空已成功加载的 Confluence 配置表单。
- `src-tauri/src/config.rs` — 新增 `ERR_CONFLUENCE_TOKEN_ENTRY_FAILED` 错误码常量。
- `src-tauri/src/commands/config.rs` — `token_entry()` 改用新错误码，避免写入/删除令牌失败时误报为“读取失败”。
- `_bmad-output/implementation-artifacts/deferred-work.md` — 追加 6 条本轮评审识别的延后事项（均为已核实但非本轮阻断性的低优先级发现，编号由台账所有者后续分配）。
- `_bmad-output/implementation-artifacts/9-1-confluence-config-setting-dialog.md` — 追加本轮 Review Triage Log 与 Auto Run Result。

**Review findings breakdown**:
- patch: 1 (medium) — 已修复并验证。
- defer: 6 (low) — 已追加到延后工作台账（token 变更时旧凭据静默复用无提示；设置弹窗关闭后表单未清空；测试连接校验失败时 md2cf 状态消息未清除；Base URL 未做格式校验/归一化；`check_md2cf_installed` 无超时可能挂起；e2e 用例全 mock 后端命令，Rust 侧逻辑缺乏真实回归覆盖）。
- reject: 5 (low) — 静默丢弃，包括：Token 采用全局 keyring 条目而非按站点隔离（与当前单配置架构一致，非缺陷）；`loadConfluenceSettings` 初次挂载的加载竞态（与既有 DW-21 重复）；标签页无障碍 ARIA 属性缺失（与既有 DW-20 重复）；测试连接未校验 Parent Page ID（与 AC2 规格描述完全一致，非缺陷）；`doc.rs`/`pdf_export.rs` 中出现的改动仅为 `rustfmt` 格式化，无功能影响。

**Verification performed**:
- `npx vue-tsc --noEmit` — 通过，无类型错误。
- `cargo build --quiet`（`src-tauri`）— 编译通过，无警告/错误。
- `npx playwright test`（全量 95 个用例，含 `story-9-1.spec.ts` 4 个用例）— 全部通过。

**Residual risks**: 6 条已延后的低优先级问题保留在 `deferred-work.md` 中，均不影响本 story 核心验收标准（AC1-AC5）的功能正确性，留待后续统一处理。

