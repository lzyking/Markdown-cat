# Story 11.1: Confluence 表单校验与 Token 安全提示

## Story Header

- **Story Key:** `11-1-confluence-form-validation-and-token-security`
- **Epic:** Epic 11 (Confluence 模块健壮性与体验巩固)
- **Status:** `done`
- **Clears DW Items:** `DW-57`, `DW-61`, `DW-62`, `DW-64`
- **Generated At:** 2026-08-04

---

## User Story

**As a** Markdown Cat 用户  
**I want** 应用在配置 Confluence 连接时对 Base URL、用户名、Space Key 等必填项与 URL 格式进行严格校验，并在变更 Base URL/用户名而未重新输入 Token 时给出明确的安全复用提示，且弹窗关闭后清除失效残留数据  
**So that** 我不会因输入不合法的 URL 或遗漏必填字段而得到不明确的报错，也不会在切换服务器地址时误用陈旧的账号凭据。

---

## Acceptance Criteria (BDD)

### AC1: 必填字段与 Base URL 格式校验
- **Given** 用户在 Confluence 设置弹窗中填写配置
- **When** 用户留空 Base URL、用户名或 Space Key，或者输入的 Base URL 不是合法的 HTTP/HTTPS URL（例如缺少协议头 `http://` 或 `https://`，或者域名包含非法字符）
- **Then** 前端表单在提交（点击“保存”或“测试连接”）前及时显示红字校验提示（如 `"Base URL 必须为有效的 http:// 或 https:// 地址"`、`"Base URL 为必填项"`、`"用户名为必填项"`、`"Space Key 为必填项"`），并阻断提交。
- **And** 后端命令 `set_confluence_config` 亦具备双重防御，若收到空值或非法 Base URL 格式，返回明确的错误码（如 `ERR_CONFLUENCE_URL_INVALID` / `ERR_CONFLUENCE_FIELD_MISSING`）。

### AC2: 切换服务器地址/账号时的 Token 复用安全提示
- **Given** 系统已保存了针对之前 Confluence 服务器的 API Token
- **When** 用户在弹窗中修改了 `baseUrl` 或 `username`，但 `tokenInput` 字段保持留空（不重新输入新 Token）
- **Then** 界面应显示清晰的提示消息（如 `"已修改 Base URL/用户名，保存后将继续复用已保存的 Token；若更换了服务器或账号，请更新 Token"`），避免用户在不知道凭据是否匹配的情况下静默保存。

### AC3: 弹窗状态彻底重置与清空
- **Given** 用户在 Confluence 标签页中输入了未保存的改动或产生了报错/测试连接反馈
- **When** 用户关闭设置弹窗（点击关闭按钮或按 Esc 键）
- **Then** 弹窗再次打开时，应彻底清空未保存的草稿输入、校验提示及历史测试状态，并重新从后端拉取已保存的真实配置与 Token 状态，不会残留上一次的草稿或过期值。

---

## Tasks / Subtasks

- [x] **Task 1: 后端 Confluence 参数与 Base URL 格式校验** (`src-tauri/src/config.rs`, `src-tauri/src/commands/config.rs`)
  - [x] 1.1 在 `src-tauri/src/config.rs` 定义 `ERR_INVALID_CONFLUENCE_BASE_URL` 和 `ERR_CONFLUENCE_REQUIRED_FIELD_MISSING` 错误码以及 `is_valid_confluence_base_url` 校验函数
  - [x] 1.2 在 `src-tauri/src/commands/config.rs` 的 `set_confluence_config` 与 `test_confluence_connection` 中加入必填字段与 URL 格式阻断与归一化逻辑
- [x] **Task 2: 前端 SettingsModal 表单响应式校验** (`src/components/SettingsModal.vue`)
  - [x] 2.1 增加 `baseUrlError` 与 `usernameError` 校验，并在 `spaceKeyError` / `parentPageIdError` 中加入必填判断
  - [x] 2.2 在 `onConfirmConfluence` 与 `onTestConnection` 触发表单校验阻断
- [x] **Task 3: Token 复用安全提示与弹窗重置防护** (`src/components/SettingsModal.vue`)
  - [x] 3.1 增加 `isCredentialsServerChanged` 计算属性，提示 Server/Username 变更时的 Token 复用提醒 Alert Banner
  - [x] 3.2 完善 `onClose()` 与 `resetConfluenceMessages()`，在关闭弹窗或重新打开时彻底清除草稿与未保存状态
- [x] **Task 4: 编写自动化 E2E 测试并验证** (`e2e/story-11-1.spec.ts`)
  - [x] 4.1 编写 `e2e/story-11-1.spec.ts` 测试用例（校验必填与 URL 格式阻断、Token 复用 Banner 显示、弹窗重置）
  - [x] 4.2 运行全量 E2E 测试与代码构建验证

### Review Findings

- [x] [Review][Patch] SettingsModal.vue 中的 Space Key 输入框缺失 @blur 触碰标志设置 [`src/components/SettingsModal.vue:500`]
- [x] [Review][Patch] normalize_confluence_config 未剔除 Base URL 末尾斜杠 / [`src-tauri/src/commands/config.rs:345`]

---

## Technical Requirements & Developer Context

### Files to Update

#### 1. `src/components/SettingsModal.vue`
- **必填项与 Base URL 响应式校验**:
  - 新增 `baseUrlError` computed 属性，校验 `confluenceForm.baseUrl` 是否非空以及是否匹配 `^https?:\/\/[^\s/$.?#].[^\s]*$`（或通过 `try { new URL(val) }` 结合协议校验）。
  - 新增 `usernameError` computed 属性，校验 `confluenceForm.username.trim()` 是否非空。
  - 更新 `spaceKeyError`，在触碰（touched）或提交时若为空则提示必填。
- **Token 复用安全提示**:
  - 新增 computed 属性 `isCredentialsServerChanged`，对比当前 `confluenceForm.baseUrl` / `confluenceForm.username` 与已加载的原始配置 `loadedConfluenceConfig`。
  - 当 `isCredentialsServerChanged` 为 `true` 且 `hasStoredToken.value` 为 `true` 且 `tokenInput.value` 为空时，在表单区呈现 Alert/Notice 提示框。
- **弹窗关闭与重置逻辑**:
  - 增强 `resetConfluenceMessages()` / `watch(() => props.isOpen)`，在弹窗关闭时调用 `resetConfluenceForm()`，清空 `confluenceForm` 草稿，确保下次打开或加载失败时不残留历史表单值。

#### 2. `src-tauri/src/commands/config.rs`
- **后端双重校验防御**:
  - 更新 `set_confluence_config` 与 `test_confluence_connection` 中的 `normalize_confluence_config`。
  - 新增 `is_valid_confluence_base_url(url: &str) -> bool`，校验 `base_url` 是否以 `http://` 或 `https://` 开头，且可以通过 `url::Url::parse` 解析。
  - 在 `set_confluence_config` 中增加非空与 Base URL 格式判断，若校验失败直接返回 `CmdResult::failure(...)`。

#### 3. `src-tauri/src/config.rs`
- **新增错误常量**:
  - `pub const ERR_INVALID_CONFLUENCE_BASE_URL: &str = "ERR_INVALID_CONFLUENCE_BASE_URL: Confluence Base URL 格式不正确，必须为 http:// 或 https:// 开头的合法地址";`
  - `pub const ERR_CONFLUENCE_REQUIRED_FIELD_MISSING: &str = "ERR_CONFLUENCE_REQUIRED_FIELD_MISSING: Base URL、用户名和 Space Key 为必填项";`

---

## Architectural Compliance & Guidelines

1. **组合式 API (Vue 3 Composition API)**:
   - 必须使用 `computed` 与 `reactive`/`ref` 实现校验提示，保持数据驱动与响应式。
   - 所有 IPC 调用使用 `invoke<CmdResult<T>>` 统一错误处理模式。
2. **零退化原则**:
   - 保持既有的 `get_config` 与 `get_confluence_token_status` 接口兼容性。
   - 不影响 General 配置页签的行为。

---

## Verification & Testing Plan

### Automated E2E Test Suite (`e2e/story-11-1.spec.ts`)
- **TID-11-1-01 (P1)**: 验证 Base URL 留空或输入 `invalid-url` 时，阻断保存并显示红色校验信息。
- **TID-11-1-02 (P1)**: 验证修改 Base URL 且已存有 Token 时，界面显示“修改了 Base URL/用户名，保存将复用旧 Token”提示。
- **TID-11-1-03 (P2)**: 验证弹窗编辑一半关闭后重新打开，数据恢复为数据库/配置文件中保存的原始值，无草稿残留。
- **TID-11-1-04 (P2)**: 验证 Rust 后端在收到非法 Base URL 时返回 `ERR_INVALID_CONFLUENCE_BASE_URL`。

---

## File List

- `src-tauri/Cargo.toml`
- `src-tauri/src/config.rs`
- `src-tauri/src/commands/config.rs`
- `src/components/SettingsModal.vue`
- `e2e/story-11-1.spec.ts`

---

## Story Completion Status

- **Status:** `done`
- **Note:** Implementation & Code Review complete. All tasks, code review findings, unit tests, and E2E tests verified.
