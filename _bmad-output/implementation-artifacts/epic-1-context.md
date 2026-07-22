# Epic 1 Context: 项目初始化与绿色运行环境

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

本 Epic 奠定 Markdown Cat 在受控 macOS 环境下的零安装运行基础：构建 Tauri 2.x 应用壳、实现绿色便携的目录与配置读写能力、建立全局设计 token 与基础双栏布局，并确保应用启动时能正确解析默认保存路径与已有配置。同时定义前后端交互的技术契约，为后续 Epic 的双栏编辑、实时预览与自动保存提供稳定底座。

## Stories

- Story 1.1: 初始化 Tauri 2.x 项目与绿色应用壳
- Story 1.2: 实现全局设计 token 与基础双栏布局
- Story 1.3: 定义应用可写目录与配置读写模块
- Story 1.4: 应用启动时创建默认空白 Markdown 文档

## Requirements & Constraints

- 应用以单个 `.app` 形式分发，无需安装，不写入系统注册表，不依赖管理员权限。
- 后端使用 Rust 实现命令；前端通过 Tauri `invoke` 调用后端能力，禁止前端直接写盘。
- `tauri.conf.json` 必须启用 `fs` 与 `dialog` 权限，且仅申请最小权限集。
- 文档、配置均以文件系统为唯一数据源，不引入数据库或云同步。
- 错误统一返回 `{ ok: boolean, error?: string }` 结构；所有文件操作必须处理失败。
- 配置以 JSON 格式存储于应用可写目录；损坏或缺失时回退到默认规则，不阻断应用启动。
- 启动到可输入时间不超过 3 秒。
- 应用可写目录优先使用应用目录；不可写时回退到 `~/Documents/MarkdownCat`（不存在则自动创建）；若回退目录也创建失败，返回错误。
- 配置字段 `savePath` 为字符串或 null，新增字段需向后兼容。
- MVP 状态栏提示仅中文，但代码中不硬编码中文，错误提示字符串使用常量或英文错误码，后续接入 locale。

## Technical Decisions

- **架构范式**：分层桌面应用，Tauri 2.x + Web 前端（Vue 3 + TypeScript + Vite）。后端无状态，每次 `invoke` 独立执行。
- **项目结构**：`src/` 为前端；`src-tauri/src/` 为后端；后端命令按功能分文件存放于 `src-tauri/src/commands/`。
- **配置模块位置**：`src-tauri/src/config.rs` 负责配置数据结构与可写目录解析；`src-tauri/src/commands/config.rs` 负责 Tauri 命令暴露。
- **文件系统权限**：`src-tauri/capabilities/filesystem.json` 已覆盖 `$APPDATA/**/*`、`$APPDATALOCAL/**/*`、`$DESKTOP/**/*`、`$DOCUMENT/**/*`、`$DOWNLOAD/**/*`。由于 `appDataDir()` 对应 `$APPDATA`，应用可写目录若使用 `appDataDir()` 已满足权限。若默认使用应用目录或 `~/Documents/MarkdownCat`，需要额外确认 capability 是否覆盖，必要时调整 scope。
- **命名规范**：Tauri 命令在 JS 侧使用 camelCase；Rust 侧文件名按功能命名（如 `config.rs`）。
- **配置回退规则**：首次启动时优先应用目录；若不可写则使用 `~/Documents/MarkdownCat`；配置缺失时返回默认配置（savePath 为 null）。
- **MVP 状态机**：错误码仅英文，不在 Rust 中硬编码中文，后续由前端 locale 渲染。

## UX & Interaction Patterns

- 应用启动后呈现深色界面骨架：标题栏 + 菜单栏 + 主编辑区 + 状态栏。
- 标题栏显示文件名与保存状态；状态栏显示保存结果与原因。
- 设置保存路径的 UI 与系统对话框属于 Epic 4，不在本 Epic 实现。
- 应用可写目录不可写时，状态栏应提示用户，但编辑器仍可输入。

## Cross-Story Dependencies

- Story 1.4 依赖 Story 1.3 完成，需要调用配置模块判断默认保存路径。
- Story 1.2 与 Story 1.3 可并行开发。
- Epic 3 的自动保存依赖 Story 1.3 的目录检测与配置读取能力。
- Epic 4 的设置保存路径依赖 Story 1.3 的配置写入能力。
