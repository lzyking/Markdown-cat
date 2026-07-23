# Deferred Work

## DW-1: index.html 引用不存在的 /vite.svg 导致 404

origin: code review of 1-1-init-tauri-2-x-project.md, 2026-07-22
location: index.html:5
severity: low
reason: 移除或替换不存在的 favicon 资源，避免启动时 404 噪声。属于 polish 项，不影响功能，可延后处理。
status: resolved
resolution: 2026-07-22，删除 index.html 中的 favicon 链接，避免 404。

## DW-2: ping 命令使用 async 但无 await，可改为同步函数

origin: code review of 1-1-init-tauri-2-x-project.md, 2026-07-22
location: src-tauri/src/commands/mod.rs:32
severity: low
reason: ping 命令无异步操作，改为同步函数可减少不必要的运行时开销。属于代码质量优化，不影响当前运行，可延后处理。
status: resolved
resolution: 2026-07-22，将 `ping` 命令由 `async fn` 改为同步 `fn`。

## DW-3: thiserror 依赖已引入但当前未使用

origin: code review of 1-1-init-tauri-2-x-project.md, 2026-07-22
location: src-tauri/Cargo.toml:28
severity: low
reason: thiserror 计划用于后续 Story 的错误处理，当前未使用。为避免误删后重复添加，保持现状，延后到实现错误处理层时统一使用或移除。
status: resolved
resolution: 2026-07-22，当前代码未使用 thiserror，已将其从 Cargo.toml 中移除，避免无用依赖。后续需要结构化错误时再行引入。

## DW-4: Cargo.toml 中 authors 字段已弃用

origin: code review of 1-1-init-tauri-2-x-project.md, 2026-07-22
location: src-tauri/Cargo.toml:5
severity: low
reason: Cargo 的 `authors` 字段已标记为弃用，应移除或改用 `package.authors` 以外的元数据方式。属于维护性清理，不影响构建与运行，可延后处理。
status: resolved
resolution: 2026-07-22，从 Cargo.toml 中移除 `authors` 字段。

## DW-5: Story 1.2 浅色模式防御未在代码层显式说明

origin: code review of 1-2-global-design-tokens-layout, 2026-07-22
location: src/styles/app.css, src/main.ts
severity: low
reason: spec 要求收到浅色/深色切换事件时保持深色不变。当前实现为“不监听 prefers-color-scheme”，这本身符合 MVP 约束，但缺少显式注释或代码说明，容易让未来开发者误认为遗漏了浅色模式支持。后续在实现主题系统时，应显式注释或增加 `color-scheme: dark` 强制深色，避免误加浅色模式。
status: resolved
resolution: 2026-07-22，在 `src/styles/app.css` 的 `html, body, #app` 选择器中显式声明 `color-scheme: dark;` 并补充注释，明确 MVP 阶段仅支持深色模式。

## DW-6: Story 1.3 日志与错误处理可进一步结构化

origin: code review of 1-3-global-design-tokens-layout, 2026-07-22
location: src-tauri/src/config.rs, src-tauri/src/commands/config.rs
severity: low
reason: 当前配置模块使用 `eprintln!` 输出警告与错误，后续 Epic 实现持久化错误处理与日志时，应统一替换为结构化日志（如 `tauri_plugin_log` 或 `tracing`），避免日志散落到 stderr；同时可将 `ERR_APP_DIR_NOT_WRITABLE` 等错误码封装为自定义错误类型，与 locale 错误消息映射解耦。
status: resolved
resolution: 2026-07-22，评估后认为当前仍为 MVP 阶段，结构化日志层应在后续 Epic 统一引入。本次仅记录决策：保留 `eprintln!` 作为过渡，后续由日志 Epic 统一替换为 `tauri_plugin_log` 或 `tracing`。

## DW-7: Story 1.3 `.write_test` 临时文件残留风险

origin: code review of 1-3-global-design-tokens-layout, 2026-07-22
location: src-tauri/src/config.rs
severity: low
reason: `is_dir_writable` 通过写入 `.write_test` 文件验证写权限，删除失败时静默忽略。极端情况下可能留下临时文件。后续可改用 `tempfile` crate 或系统临时目录避免污染应用目录，同时确保清理。
status: resolved
resolution: 2026-07-22，在 `is_dir_writable` 中改用 `tempfile::NamedTempFile::new_in(dir)` 验证目录可写性，验证后自动关闭清理；已在 Cargo.toml 添加 `tempfile = "3.0"`。

## DW-8: Story 1.4 前端错误降级占位不明确

origin: code review of 1-4-create-default-markdown-doc, 2026-07-22
location: src/App.vue:19-32
severity: minor
reason: 当 `get_blank_document` 失败或命令不可用时，`filename` 保持初始值 `New_*.md`，用户可见不真实的占位文件名。当前仅通过 `console.error` 输出日志，未在 UI 上给出可见的错误状态或降级文件名。后续可在状态栏或标题栏显示通用错误状态，或提供 `New_Untitled.md` 等安全降级名称。
status: resolved
resolution: 2026-07-23，在 App.vue 的 onMounted 中增加初始化失败逻辑降级，当 get_blank_document 返回错误时将 filename 设为 New_Untitled.md 并给出 UI 可见反馈。

## DW-9: App.vue 中 .placeholder 样式未清理

origin: code review of 2-2-readonly-preview-markdown-rendering, 2026-07-23
location: src/App.vue:95-103
severity: low
reason: Story 2.1 和 2.2 已用实际组件替换所有占位，但 scoped CSS 中仍保留 `.placeholder` 样式块。Dead code，不影响功能。
status: resolved
resolution: 2026-07-23，清理 App.vue scoped CSS 中残留未使用的 .placeholder 占位样式块。

## DW-10: PreviewPane onPreviewClick 危险协议分支 stopPropagation 冗余

origin: code review of 2-2-readonly-preview-markdown-rendering, 2026-07-23
location: src/components/PreviewPane.vue:21-29
severity: low
reason: 对危险协议的 `stopPropagation` 在当前组件树中无实际效果（无父级响应），属于防御性冗余代码。不影响功能。
status: resolved
resolution: 2026-07-23，重构 PreviewPane.vue 中的 onPreviewClick 函数，统一所有 <a> 标签的 preventDefault，移除了冗余的 stopPropagation 及 dangerousProtocols 分支。
