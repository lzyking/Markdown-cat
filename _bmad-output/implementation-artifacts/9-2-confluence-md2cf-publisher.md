---
id: 9-2-confluence-md2cf-publisher
title: Publish Markdown to Confluence using md2cf and REST API
epic: epic-9
status: awaiting-operator
baseline_revision: 5a8801763b33e88f6423ea0603f626a0e5387979
operator_actions:
  - "在设置 (Settings) 的 Confluence 标签页中填写真实的 Base URL、Username、API Token、Space Key 与 Parent Page ID，并保存令牌。"
  - "在真实 Confluence 空间中确认该账号/API Token 拥有目标 Space 的页面创建、更新与附件上传权限（部分 Confluence Server/Data Center 需管理员额外授权）。"
  - "使用一份包含标题、段落、代码块、表格与本地图片的示例 Markdown 文档，执行菜单“文件 -> 发布到 Confluence…”，端到端验证：页面创建/更新是否成功、代码块是否正确渲染为 code 宏、表格是否正确渲染、本地图片是否作为附件上传并在页面中正确显示。"
  - "若使用自签名证书或内网 Confluence Server，验证“忽略 SSL 校验”开关在真实网络环境下的行为，并确认证书链或代理配置符合预期。"
  - "（可选）如需启用真实的 Python `md2cf` 命令行工具而非内置转换引擎，在目标机器上执行 `pip install md2cf`（或 `pipx install md2cf`），再次打开设置的“测试连接”面板确认 `md2cf` 检测为已安装。当前实现在未检测到 `md2cf` 时会给出友好提示，但始终使用内置转换引擎完成发布，不会因此阻塞。"
  - "重新执行一次发布到已存在同名页面的场景，确认“更新已存在页面”（而非重复创建）的分支在真实 Confluence 版本号递增机制下按预期工作。"
---

# Story 9.2: Publish Markdown to Confluence using md2cf and REST API

## Story Description
作为用户，我可以通过“发布到 Confluence”功能，利用 Python `md2cf` 方案将当前 Markdown 文档（自动处理本地图片、表格、代码块等转为 Confluence 原生 Macro 宏）发布或更新至 Confluence 页面。

## Acceptance Criteria
1. **发布菜单/按钮**: 在 File / 工具栏中增加“Publish to Confluence...”功能。
2. **`md2cf` 转换与 API 调用**: 使用 Python `md2cf` 命令行/库（或内置转换机制）封装 REST API，将 Markdown 转为 Confluence Storage Format XHTML 结构，自动上传 Markdown 中引用的图片附件，处理代码高亮与表格 Macro。
3. **成功反馈与页面链接**: 发布完成后，状态栏/弹窗提示发布成功，并提供可直接点击打开对应 Confluence 页面 URL 的链接。
4. **异步发布进度与优雅错误容错**: 发布过程在后台异步线程执行，界面弹窗显示分步日志（环境检测 -> 附件上传 -> 页面发布）；若缺失 `md2cf` 命令行依赖，弹出友好安装引导指引。

## Tasks & Acceptance

**Execution:**
- [x] `src-tauri/src/commands/confluence.rs` -- 新增 `publish_confluence` 异步命令：环境检测（校验配置/解析 Token/构建 HTTP 客户端）-> 页面发布（按标题查找已有页面，存在则递增版本号 `PUT` 更新，否则 `POST` 创建，支持 `ancestors` Parent Page）-> 附件上传（对每张本地图片 multipart `POST` 到 `/rest/api/content/{id}/child/attachment`，单张失败不阻断整体发布），并通过 `confluence-publish-progress` 事件持续上报三个阶段的分步日志 -- 实现 AC2/AC3/AC4 后端能力
- [x] `src-tauri/src/commands/config.rs` -- 将 Token 解析 helper 开放为 crate 内可复用函数，供发布命令复用，避免重复实现 -- 保持与 9.1 一致的 Token 解析语义
- [x] `src-tauri/src/commands/mod.rs`、`src-tauri/src/lib.rs` -- 注册 `confluence` 命令模块、`publish_confluence` 指令与 `tauri-plugin-opener` 插件 -- 使前端可调用发布指令并打开外部链接
- [x] `src-tauri/Cargo.toml`／`Cargo.lock` -- 为 `reqwest` 增加 `multipart`/`query` feature，新增 `tauri-plugin-opener` 依赖 -- 支撑附件上传与打开页面链接
- [x] `src-tauri/capabilities/default.json`（及 `src-tauri/gen/schemas/*`）-- 增加 `opener:default` 权限 -- 允许受限地打开外部 URL
- [x] `src/lib/confluence-publish.ts` -- 新增基于 `marked.lexer` 的内置 Markdown → Confluence Storage Format XHTML 转换器：标题/段落/加粗斜体/行内代码/链接/列表/引用块/表格（原生 `<table>`）/代码块（`ac:structured-macro` code 宏 + CDATA 转义）/本地图片（`ac:image` + `ri:attachment`，远程图片保留原始 `<img>`） -- 实现 AC2 的转换机制（"内置转换机制"分支）
- [x] `src/lib/types.ts` -- 新增 `ConfluencePublishPayload`/`ConfluencePublishResult`/`ConfluencePublishProgress`/`ConfluenceImageUpload` 类型 -- 保持前后端类型一致
- [x] `src/components/MenuBar.vue` -- 在“文件”菜单新增“发布到 Confluence…”入口，emit `publish-confluence` -- 实现 AC1
- [x] `src/components/PublishConfluenceModal.vue` -- 新增发布进度/结果弹窗：展示环境检测/附件上传/页面发布三步日志、成功后展示可点击的页面链接（通过 `@tauri-apps/plugin-opener` 的 `openUrl` 用系统默认浏览器打开）、失败时展示错误信息 -- 实现 AC3/AC4 前端交互
- [x] `src/App.vue` -- 接入 `handlePublishConfluence`：读取 Confluence 配置校验必填项 -> 内置转换 Markdown -> 读取本地图片字节并 Base64 编码 -> 调用 `check_md2cf_installed` 展示未安装时的友好提示（不阻断）-> 监听 `confluence-publish-progress` 事件驱动进度弹窗 -> 调用 `publish_confluence` 并处理成功/失败结果 -- 串联 AC1-AC4 全流程
- [x] `e2e/fixtures.ts`、`e2e/utils/tauri-mock.ts` -- 扩展 mock 支持事件广播（`emitEvent`）与 `openUrl` 拦截记录（`openedUrls`），并补充 `publish_confluence`/`check_md2cf_installed` 命令 mock 能力 -- 支撑新增与既有 E2E 用例
- [x] `e2e/story-9-2.spec.ts` -- 新增覆盖 AC1（菜单入口与成功链接展示与打开）、AC2（发布请求携带 Storage XHTML 中的 `ac:structured-macro`/`ac:image` 标记与图片附件负载）、AC4（未安装 md2cf 时的友好提示且不阻断发布、进度步骤固定顺序展示）的 E2E 用例 -- 回归保护

**Acceptance Criteria:**
- Given 文件菜单已打开, when 用户查看菜单项, then 展示“发布到 Confluence…”入口（`MenuBar.vue` 新增 `menu-row`；`e2e/story-9-2.spec.ts:53-56`）
- Given 当前文档包含标题/代码块/表格/本地图片, when 触发发布, then 前端调用 `convertMarkdownToConfluenceStorage` 生成含 `ac:structured-macro`（代码块）与 `ac:image`/`ri:attachment`（本地图片）的 Confluence Storage XHTML，并通过 `publish_confluence` 命令发起附件上传与页面创建/更新（`confluence-publish.ts`；`commands/confluence.rs:206-338`；`e2e/story-9-2.spec.ts:116-119`）
- Given 发布成功, when 弹窗展示结果, then 显示成功提示与可点击打开的 Confluence 页面 URL 链接，点击后通过 `openUrl` 用系统浏览器打开（`PublishConfluenceModal.vue`；`App.vue` 中 `openPublishedPage`；`e2e/story-9-2.spec.ts:58-65`）
- Given 发布正在进行, when 后端逐步执行, then 弹窗按“环境检测 -> 附件上传 -> 页面发布”固定顺序展示分步状态；若 `check_md2cf_installed` 报告未安装，展示友好提示但仍使用内置转换引擎完成发布，不中断流程（`commands/confluence.rs` 中 `emit_progress` 调用序列；`e2e/story-9-2.spec.ts:132-186`）

## Spec Change Log

（空 — 本轮实现未触发规格层面的矛盾或缺口，无需修订验收标准）

## Auto Run Result

Status: awaiting-operator

**Summary**：Story 9.2（使用 md2cf/REST API 发布 Markdown 到 Confluence）的全部可由 Agent 独立完成的工作已实现、构建通过并通过自动化测试，已提交到版本库。由于本 story 的核心价值（真实发布到用户自己的 Confluence 服务器并验证渲染效果）依赖用户提供的真实 Confluence 环境凭据与网络访问，这部分无法在当前沙箱环境中被 Agent 验证，因此依据本轮运行的显式指示，将本 story 状态置为 `awaiting-operator` 而非 `blocked`（`blocked` 会中止整条 bmad-loop 运行，而本 story 在 Agent 可控范围内已经完成到位）。已委托的 operator 动作详见 frontmatter 中的 `operator_actions` 列表。

**Files changed this pass**：见上方“Execution”任务列表逐条对应的文件路径。

**Verification performed**：
- `npx vue-tsc --noEmit` — 通过，无类型错误。
- `cd src-tauri && cargo build --quiet` — 编译通过，无错误。
- `npx playwright test` — 全量 98 个用例（含新增 `story-9-2.spec.ts` 3 个用例）全部通过。

**Residual risks / caveats**：
- AC2 的 Confluence Storage Format 转换与附件上传逻辑仅通过单元级 E2E mock 验证，尚未在真实 Confluence 服务器上联调（无可用的真实凭据/服务器）；已列入 `operator_actions`。
- 当前设计选择“内置转换引擎”作为默认发布路径（`md2cf` 命令行工具仅用于设置面板中的能力检测提示），若用户期望完全依赖 Python `md2cf` CLI 本身的转换实现，需额外沟通确认是否需要切换实现路径。
- 附件上传采用简单 `POST` 而非按文件名检测已存在附件走 `POST /child/attachment/{id}/data` 更新版本；多数 Confluence Server/Cloud 版本会将同名附件自动创建为新版本，但个别旧版本 API 行为可能不同，建议在真实环境验证（已列入 `operator_actions`）。
