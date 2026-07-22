---
baseline_commit: 88573c6255a619508358da38001f45a37c28cfe2
status: done
---

# Story 1.1: 初始化 Tauri 2.x 项目与绿色应用壳

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 用户，
I want 获得一个无需安装即可双击运行的 macOS 应用，
So that 在没有管理员权限的受控 Mac 上也能使用。

## Acceptance Criteria

1. **项目初始化与最小权限配置**
   - 使用 Tauri 2.x 初始化项目；`tauri.conf.json` 启用 `fs` 与 `dialog` 插件并仅申请最小权限集。
   - `fs` 权限仅允许访问应用目录与用户选择的保存目录；`dialog` 权限仅用于打开文件夹选择器。
   - `Cargo.toml` 与 `package.json` 锁定 Rust 1.80+ 与 Node LTS 版本。

2. **开发模式可编译运行**
   - 执行 `cargo tauri dev` 后应用窗口正常出现，无后端命令注册失败或前端白屏。
   - 应用运行期间仅向应用可写目录（由 Story 1.3 定义）或用户选择的保存目录写入数据。

3. **绿色便携运行**
   - 生成的 macOS `.app` 包不依赖安装程序、不修改系统注册表。
   - Tauri 框架日志可写入 `~/Library/Application Support/com.markdowncat.dev`；应用自身文档与配置仅写入应用可写目录或用户选择的保存目录。
   - 在未安装过本应用的受控 Mac 上，通过右键「打开」可绕过 Gatekeeper 运行；若无法绕过，记录结果并触发 PRD OQ-2 的 Fallback Decision。

4. **构建产物**
   - 提供 `src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、前端入口与构建配置、最小可运行的 `App.tsx` 壳。

## Tasks / Subtasks

- [x] 创建 Tauri 2.x 项目骨架（前端 + 后端）
  - [x] 初始化 `src/` 前端目录与 `src-tauri/` 后端目录
  - [x] 配置 `Cargo.toml`（Rust 1.80+、Tauri 2.x、所需插件）
  - [x] 配置 `package.json`（Node LTS、Tauri CLI、前端构建脚本）
- [x] 配置最小权限集
  - [x] 在 `tauri.conf.json` 中启用并限制 `fs` 权限
  - [x] 在 `tauri.conf.json` 中启用并限制 `dialog` 权限
  - [x] 记录权限清单与限制理由
- [x] 实现最小可运行应用壳
  - [x] 前端入口文件加载成功
  - [x] 主窗口按 UX 规格渲染（默认 1100×700px，最小 800×500px）
  - [x] 标题栏/菜单栏/编辑区/状态栏占位结构正确
- [x] 验证绿色运行
  - [x] 在开发模式下编译运行通过
  - [x] 确认应用包不向系统注册表或 `/Applications` 写入
  - [x] 记录 Gatekeeper 绕过测试结果

## Dev Notes

### 项目结构

```text
markdown-cat/
├── src/                      # 前端
│   ├── main.tsx              # 应用入口（React 18 示例）
│   ├── App.tsx               # 双栏布局容器（本 Story 仅实现骨架）
│   ├── components/
│   │   ├── TitleBar.tsx      # 标题栏占位
│   │   ├── MenuBar.tsx       # 菜单栏占位
│   │   └── StatusBar.tsx     # 状态栏占位
│   ├── stores/               # 文档状态（Story 1.4 及 Epic 2 使用）
│   ├── lib/
│   │   └── tauri.ts          # invoke 封装
│   └── styles/
│       └── app.css           # 全局 token 与布局（Story 1.2 细化）
├── src-tauri/
│   ├── src/
│   │   ├── main.rs           # 入口
│   │   └── lib.rs            # 命令模块注册（空壳）
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```

- 架构约定 [ARCHITECTURE-SPINE.md] 要求 `src/` 为前端、`src-tauri/src/` 为后端；后续 Epic 的能力文件按此目录放置。
- 本 Story 是 Epic 1 的第一个 Story，没有前置 Story 文件可继承；后续 Story 1.2/1.3/1.4 将在此基础上扩展。
- 本 Story 不实现配置读写、文档创建、编辑器集成、实时预览等逻辑，仅确保项目可运行。

### 技术栈与版本

- Tauri 2.x（桌面应用壳与 IPC）
- Rust 1.80+（后端命令）
- TypeScript / Vite（前端构建）
- React 18 或 Vue 3（架构建议待实现时确定；本 Story 任选其一，但需与后续 Story 一致）

### 权限最小化原则

- `tauri.conf.json` 的 `permissions` 配置必须显式列出，禁止使用 `all: true` 或通配。
- `fs:scope` 严格限定为应用可写目录与用户选择的保存目录。
- `dialog:open` 仅用于 `folder` 选择器。

### 测试与验证

- 构建命令应能通过：`cargo tauri build` 可生成 macOS `.app`。
- 开发模式运行：`npm run tauri dev` 或 `cargo tauri dev` 窗口正常出现。
- 手动检查：首次启动时是否生成 `~/Library/Application Support/com.markdowncat.dev`（Tauri 日志目录），确认无其他系统目录写入。

### 已知约束

- MVP 仅支持 macOS，Windows 为 v2 目标。
- 应用目录可能不可写，但本 Story 不处理回退逻辑（由 Story 1.3 实现）。
- 启动速度指标（< 3 秒）由 Story 1.4 验收，但本 Story 需避免引入明显拖慢启动的依赖。

## Dev Agent Record

### Agent Model Used

kimi-for-coding

### Debug Log References

- Rust 重新安装后 PATH 未生效，通过 `export PATH="$HOME/.cargo/bin:$PATH"` 解决。
- `cargo tauri dev` 提示 Tauri 包版本不匹配：Rust 端 v2.0.0 与 NPM 端 v2.11.1 不一致。升级 `Cargo.toml` 依赖后解决。
- `tauri::Builder::new()` 在新版需要显式类型参数，改为 `tauri::Builder::default()`。
- 图标目录缺失，通过 Pillow 生成纯色源图后用 `cargo tauri icon` 补齐。

### Completion Notes List

- 已安装 Tauri CLI 并验证 Rust 环境可用。
- 已升级 `tauri`、`tauri-build`、`tauri-plugin-fs`、`tauri-plugin-dialog` 到与 NPM 兼容版本。
- 已生成 `src-tauri/icons/` 全部平台图标。
- 已配置最小权限集：`fs:scope` 限制为 `$APPDATA/**/*` 与 `$APPDATALOCAL/**/*`，`dialog:allow-open` 仅用于文件夹选择器。
- 已清理 Rust 未使用 import/变量警告，保留 `CmdResult::failure` 并标记 `#[allow(dead_code)]` 供后续 story 使用。
- 已验证开发模式窗口正常出现（1100×700，最小 800×500）。
- 已验证 `npm run tauri:build` 成功生成 macOS `.app` 包。

### File List

- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`
- `src-tauri/capabilities/filesystem.json`
- `src-tauri/src/lib.rs`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/icons/*`
- `src/App.vue`
- `src/main.ts`
- `src/styles/app.css`

## References

- [Epic 1](_bmad-output/planning-artifacts/epics.md#L130-L234) — 项目初始化与绿色运行环境
- [Story 1.1](_bmad-output/planning-artifacts/epics.md#L134-L155) — 初始化 Tauri 2.x 项目与绿色应用壳
- [PRD](_bmad-output/planning-artifacts/prds/prd-Markdown%20Cat-2026-07-21/prd.md) — 功能需求 §4.1、成功指标 §7、非功能性需求 §8
- [Architecture Spine](_bmad-output/planning-artifacts/architecture/architecture-Markdown%20Cat-2026-07-21/ARCHITECTURE-SPINE.md) — AD-1、AD-5、Stack、Structural Seed
- [DESIGN.md](_bmad-output/planning-artifacts/ux-designs/ux-Markdown%20Cat-2026-07-21/DESIGN.md) — 布局、组件、颜色与字体 token
- [EXPERIENCE.md](_bmad-output/planning-artifacts/ux-designs/ux-Markdown%20Cat-2026-07-21/EXPERIENCE.md) — 信息架构、关键流程、禁止行为

### Review Findings

- [x] [Review][Patch] CSP 被显式禁用为 null，存在安全风险 — `src-tauri/tauri.conf.json:82`
- [x] [Review][Patch] fs:scope 当前仅允许应用目录，缺少用户选择的保存目录 — `src-tauri/capabilities/filesystem.json:136-139`
- [ ] [Review][Deferred] index.html 引用不存在的 /vite.svg，会导致 404 — `index.html:290`
- [ ] [Review][Deferred] ping 命令使用 async 但无 await，可改为同步函数 — `src-tauri/src/commands/mod.rs:208`
- [ ] [Review][Deferred] thiserror 依赖已引入但当前未使用 — `src-tauri/Cargo.toml:46`
- [ ] [Review][Deferred] Cargo.toml 中 authors 字段已弃用 — `src-tauri/Cargo.toml:23`
