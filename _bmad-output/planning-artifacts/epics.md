---
stepsCompleted:
  - step-01-requirements-extraction
  - step-02-design-epics
inputDocuments:
  - /_bmad-output/planning-artifacts/prds/prd-Markdown Cat-2026-07-21/prd.md
  - /_bmad-output/planning-artifacts/architecture/architecture-Markdown Cat-2026-07-21/ARCHITECTURE-SPINE.md
  - /_bmad-output/planning-artifacts/ux-designs/ux-Markdown Cat-2026-07-21/DESIGN.md
  - /_bmad-output/planning-artifacts/ux-designs/ux-Markdown Cat-2026-07-21/EXPERIENCE.md
---

# Markdown Cat - Epic Breakdown

## Overview

本文档将 PRD、架构决策和 UX 设计合约拆解为可实现的 Epic 和 User Story，用于指导开发执行与验收。

## Requirements Inventory

### Functional Requirements

FR-1: 启动时创建新文档。应用启动后 1 秒内呈现空白文档，文件名按 `New_YYYYMMDD_HHMMSS_mmm.md`（毫秒时间戳）生成，同一秒内多次启动不覆盖已有文件。

FR-2: 默认保存位置。新文档默认保存到应用目录；应用目录不可写时回退到 `~/Documents/MarkdownCat`（不存在则自动创建）。用户可通过设置更改保存路径。

FR-3: 源码编辑。用户可在左栏源码编辑器中输入和编辑 Markdown 源码；支持标题、段落、列表、代码块、行内代码、加粗、斜体、链接、引用、分隔线；支持撤销/重做/复制/粘贴/全选；编辑器区域不可隐藏或关闭。

FR-4: 实时预览。用户输入时右栏预览区在 100ms 内同步更新渲染结果；预览区只读，用户无法直接修改渲染内容；预览区滚动位置不因输入跳动。

FR-5: 防抖自动保存。用户停止输入 300ms 后自动将当前文档写入文件；保存成功后状态栏显示「已保存至 {filename}」；保存失败时显示「保存失败：{reason}」并保持可见，直到下一次成功保存或用户关闭提示。

FR-6: 保存失败处理。保存失败时系统明确提示用户并保留编辑状态；原因包括目录不可写、磁盘已满、文件被占用；UI 提示包含「保存失败」和具体原因。

FR-7: 设置保存路径。用户可通过菜单「Markdown Cat > 设置保存路径…」打开系统文件夹选择器，选择已存在的目录作为新的默认保存路径；选择后新路径写入配置并立即生效，仅影响后续新建文档。

FR-8: 配置持久化。保存路径在应用重启后保持不变；配置文件以 JSON 格式存储于应用可写目录；配置损坏或缺失时回退到默认保存路径规则；读取失败不阻断用户编辑。

### NonFunctional Requirements

NFR-1（性能）：启动到可输入 < 3 秒；预览更新延迟 < 100ms；防抖保存间隔 300ms。

NFR-2（可靠性）：保存失败必须保留编辑状态并提示，禁止静默丢失数据。

NFR-3（可移植性）：应用包为单 `.app`，无需安装；运行时配置写入应用可写目录，不修改系统注册表或 `/Applications` 等系统目录。

NFR-4（兼容性）：生成的 `.md` 文件使用 UTF-8 编码，文件名使用 ASCII 安全字符（`New_` 前缀），路径使用相对路径或用户配置的标准绝对路径，确保在其他编辑器中可读。

NFR-5（可访问性）：状态栏提示文字清晰可读，错误状态使用对比色或图标区分，但不强制达到 WCAG 2.1 AA。

### Additional Requirements

- 基于 Tauri 2.x 构建桌面应用（AD-1）。
- 后端命令使用 Rust 实现；`tauri.conf.json` 必须启用 `fs` 和 `dialog` 权限，且仅申请最小权限集（AD-1）。
- 前端通过 Tauri `invoke` 调用后端能力；禁止前端直接写盘（AD-2）。
- 文档、图片、配置均以文件系统为唯一数据源，不引入数据库或云同步（AD-2）。
- 左栏源码、右栏预览共享同一份字符串状态；禁止预览区直接修改内容（AD-3）。
- 编辑器状态变化后触发 300ms 防抖保存；保存操作在 Rust 后端执行并返回成功/失败状态（AD-4）。
- 应用以单个 `.app` 形式分发，无需安装，不写入系统注册表，不依赖管理员权限（AD-5）。
- 错误统一返回 `{ ok: boolean, error?: string }` 结构；所有文件操作必须处理失败。
- 项目结构区分 `src/`（前端）与 `src-tauri/src/`（后端）。
- 推荐前端框架 Vue 3 或 React 18，在初始化阶段确定。
- 推荐 Markdown 渲染库 marked 或 markdown-it，在实现阶段确定。

### UX Design Requirements

UX-DR-1: 实现深色主题设计 token 系统。在全局 CSS 中定义 colors（background、background-surface、background-elevated、border、text-primary、text-secondary、accent、success、error、selection、code-background 等）、typography（display、heading、body、body-mono、label、status）、spacing（xs–xxl）、rounded（sm–lg）token，并确保所有组件引用 token 而非硬编码。

UX-DR-2: 实现标题栏（Title Bar）组件。高度 38px，背景 background-surface，底部 1px border；左侧显示 16px 圆角 4px 应用图标与文件名；右侧显示保存状态（小圆点 + 文字），成功绿色、失败红色、无圆点表示未保存/保存中。

UX-DR-3: 实现菜单栏（Menu Bar）组件。高度 28px，背景 background，底部 1px border-subtle；菜单项：Markdown Cat、文件、编辑、视图、帮助；MVP 仅「Markdown Cat > 设置保存路径…」有效，其余可禁用或提供标准占位；菜单项悬停使用 background-elevated，圆角 4px。

UX-DR-4: 实现源码编辑器（Source Editor）组件。始终位于左栏，不可关闭；背景 background，文字 text-primary，字体 body-mono；无边框、使用系统默认滚动条；支持撤销/重做/复制/粘贴/全选；文本选中背景 selection；光标颜色 text-primary；按键触发防抖保存。

UX-DR-5: 实现预览区（Preview Pane）组件。始终位于右栏，只读；背景 background-surface，文字 text-primary，字体 body；渲染标题、段落、列表、代码块、引用、链接等标准 Markdown 元素；标题下方使用 1px border 分隔；代码块背景 code-background，圆角 6px，内边距 12px；行内代码背景 code-background，圆角 4px；引用左侧 3px accent 边框，左侧内边距 14px，文字 text-secondary；链接颜色 accent，无下划线，悬停显示下划线；空状态显示提示文案。

UX-DR-6: 实现状态栏（Status Bar）组件。高度 24px，背景 background-elevated，顶部 1px border-subtle；左侧显示保存状态文字（成功绿色、失败红色、普通 text-muted），右侧显示行列号与文档类型（Markdown）；文字 12px；保存失败提示保持可见，直到下一次成功保存或用户关闭。

UX-DR-7: 实现设置保存路径对话框（Save Path Dialog）组件。居中浮层，宽度 420px，背景 background-elevated，边框 border，圆角 8px；标题「设置保存路径」，正文说明当前设置用途；输入框显示当前路径（默认只读），右侧「选择…」按钮打开系统文件夹选择器；底部「取消」与「确认」按钮，确认按钮使用 accent 背景；按 Esc 关闭对话框；Tab/Shift+Tab 在按钮间切换焦点；Enter 确认当前按钮。

UX-DR-8: 实现双栏固定布局。主窗口包含标题栏（38px）+ 菜单栏（28px）+ 主编辑区（剩余空间，1:1 等宽双栏）+ 状态栏（24px）；最小窗口尺寸 800×500px；默认启动尺寸 1100×700px；双栏不可隐藏、不可调整比例、不支持三栏；窗口高度变化时主编辑区垂直扩展，标题栏/菜单栏/状态栏高度不变。

UX-DR-9: 实现基础键盘与对话框交互。源码编辑器支持 ⌘Z/⌘ShiftZ 撤销重做、⌘C/⌘V/⌘X/⌘A 标准编辑；对话框支持 Esc 关闭、Tab/Shift+Tab 切换焦点、Enter 确认；菜单项悬停与激活状态符合 macOS 标准行为。

UX-DR-10: 实现可访问性底线。所有文字对比度符合 WCAG 2.2 AA；菜单项和对话框按钮支持键盘操作；保存失败提示除颜色外明确说明原因；源码编辑器支持标准 macOS VoiceOver 辅助功能。

### FR Coverage Map

FR-1: Epic 1 — 应用启动时创建新的空白 Markdown 文档

FR-2: Epic 1 — 确定默认保存位置并处理不可写回退

FR-3: Epic 2 — 提供左栏 Markdown 源码编辑能力

FR-4: Epic 2 — 提供右栏实时预览渲染能力

FR-5: Epic 3 — 实现按键级防抖自动保存

FR-6: Epic 3 — 保存失败时明确提示并保留编辑状态

FR-7: Epic 4 — 通过菜单和系统对话框设置默认保存路径

FR-8: Epic 1（读取） + Epic 4（写入） — 保存路径持久化

## Epic List

### Epic 1: 项目初始化与绿色运行环境
用户能在受控 Mac 上直接双击运行应用，无需安装；启动后自动获得一个空白 Markdown 文档，并正确解析默认保存路径与已有配置。本 Epic 还需奠定后续 Epic 的技术契约：建立全局设计 token 与基础布局、定义前端文档状态模型、约定后端错误返回协议、实现配置读写模块（内部能力）。
**FRs covered:** FR-1, FR-2, FR-8（读取部分）
**Implementation Notes:** 设计 token 系统（UX-DR-1）与双栏基础布局（UX-DR-8）优先实现，以避免后续 Epic 硬编码样式；配置读写能力一次性完整实现，供 Epic 4 直接调用。Story 1.2 与 Story 1.3 无互相依赖，可并行开发；Story 1.4 依赖 Story 1.3 完成。

### Epic 2: 双栏编辑与实时预览
用户能在左栏编辑 Markdown 源码，右栏在 100ms 内实时渲染出一致的预览效果。Story 层面拆分为源码编辑器集成与 Markdown 实时渲染两个独立技术点，前者产出输入事件通道，后者消费该通道更新预览。
**FRs covered:** FR-3, FR-4
**Implementation Notes:** 源码编辑器集成优先完成并稳定事件/状态接口，Epic 3 的防抖保存将直接复用该接口；Markdown 渲染仅依赖同一文档状态字符串，无需等待保存逻辑。Story 2.2 的 100ms 预览延迟验收保持通用场景，不限制输入内容；性能测试需在单元层（fake timer）与集成层（Playwright）分别覆盖。

### Epic 3: 按键级自动保存与失败处理
用户停止输入 300ms 后内容自动写入文件；保存成功或失败都在状态栏明确反馈，且失败时保留编辑状态不丢数据。本 Epic 依赖 Epic 2 建立的编辑器输入事件通道，通过同一文档状态模型触发后端保存命令。
**FRs covered:** FR-5, FR-6
**Implementation Notes:** 保存失败处理需与 Epic 2 的状态栏组件（UX-DR-6）和错误文案（EXPERIENCE.md）保持一致；后端保存命令统一返回 `{ ok: boolean, error?: string }` 协议。标题栏状态机统一为「未保存 / 保存成功 / 保存失败」三态：
- **未保存**：用户已修改文档且距离上次保存结果尚未完成新的保存，标题栏无状态圆点，文件名保持默认颜色。
- **保存成功**：最近一次自动保存成功，标题栏显示绿色圆点。
- **保存失败**：最近一次自动保存失败，标题栏显示红色圆点，失败原因持续显示在状态栏直至下一次成功保存或用户手动关闭。
上述三态在 Story 2.3、3.2、3.3 中分别验收。

### Epic 4: 保存路径设置与持久化
用户可通过菜单设置默认 Markdown 保存路径，选择后立即生效，并在应用重启后保持。本 Epic 主要提供 UI 入口与调用 Epic 1 已实现的配置写入能力，不重复开发底层配置模块。
**FRs covered:** FR-7, FR-8（写入部分）
**Implementation Notes:** 系统文件夹选择器通过 Tauri dialog 权限实现；保存路径变更仅影响后续新建文档，当前已打开文档路径不变。

## Epic 1: 项目初始化与绿色运行环境

用户能在受控 Mac 上直接双击运行应用，无需安装；启动后自动获得一个空白 Markdown 文档，并正确解析默认保存路径与已有配置。本 Epic 还需奠定后续 Epic 的技术契约：建立全局设计 token 与基础布局、定义前端文档状态模型、约定后端错误返回协议、实现配置读写模块（内部能力）。

### Story 1.1: 初始化 Tauri 2.x 项目与绿色应用壳

As a 用户，
I want 获得一个无需安装即可双击运行的 macOS 应用，
So that 在没有管理员权限的受控 Mac 上也能使用。

**Acceptance Criteria:**

**Given** 项目仓库已创建
**When** 使用 Tauri 2.x 初始化项目并配置最小权限集（`fs` 与 `dialog`）
**Then** 应用可以在开发模式下编译运行
**And** 生成的 macOS `.app` 包不依赖安装程序、不修改系统注册表
**And** `tauri.conf.json` 中的 `fs` 权限仅允许访问应用目录与用户选择的保存目录，`dialog` 权限仅用于打开文件夹选择器
**And** `Cargo.toml` 与 `package.json` 锁定 Rust 1.80+ 与 Node LTS 版本
**And** 应用运行期间仅向应用可写目录（Story 1.3 定义）或用户选择的保存目录写入数据；Tauri 框架日志可写入 `~/Library/Application Support/com.markdowncat.dev`，不向系统注册表、`/Applications` 或用户 Library 的偏好目录等其他系统位置写入文件

**Given** 应用包被复制到未安装过本应用的受控 Mac
**When** 用户通过右键「打开」绕过 Gatekeeper 运行
**Then** 应用窗口正常出现
**And** 全程无需输入管理员密码
**And** 若 Gatekeeper 无法绕过，则记录该结果并触发 PRD OQ-2 的 Fallback Decision（在 README/下载页提供说明）

### Story 1.2: 实现全局设计 token 与基础双栏布局

As a 用户，
I want 应用启动后看到符合设计规范的深色界面骨架，
So that 后续功能组件有一致的视觉基础。

**Acceptance Criteria:**

**Given** 应用已运行
**When** 主窗口渲染
**Then** 窗口包含标题栏（38px）、菜单栏（28px）、主编辑区（1:1 等宽双栏）、状态栏（24px）
**And** 最小窗口尺寸为 800×500px，默认启动尺寸为 1100×700px

**Given** 设计 token 文件已定义
**When** 检查 CSS 变量
**Then** 包含 colors、typography、spacing、rounded 全部 token
**And** 所有现有 UI 元素引用 token 而非硬编码颜色
**And** token 命名采用 kebab-case（如 `--color-background-surface`）并在前端统一导入
**And** 新增 token 时遵循同一命名规则与分类文件，避免零散定义

**Given** 系统或用户切换浅色模式
**When** 应用运行期间收到主题切换事件
**Then** MVP 保持深色主题不变，不响应浅色模式切换
**And** 该限制在文档中明确记录为 MVP 非目标

### Story 1.3: 定义应用可写目录与配置读写模块

As a 用户，
I want 应用能自动找到可写的配置目录，
So that 即使应用目录不可写，设置也能被持久化。

**Acceptance Criteria:**

**Given** 应用首次启动
**When** 后端检测应用目录是否可写
**Then** 若可写，则使用应用目录作为可写目录；否则自动创建并使用 `~/Documents/MarkdownCat`
**And** 若 `~/Documents/MarkdownCat` 创建也失败，则后端返回错误并让前端在状态栏提示用户设置保存路径，但编辑器仍可输入

**Given** 配置读写模块已实现
**When** 调用读取配置命令
**Then** 返回当前保存路径（若配置存在）或返回默认规则结果
**And** 配置损坏或缺失时返回默认回退，不阻断应用启动
**And** 配置 JSON schema 包含字段 `savePath`，类型为字符串或 null；新增字段需向后兼容

**Given** 配置读写模块已实现
**When** 调用写入配置命令（含保存路径）
**Then** 配置以 JSON 格式写入应用可写目录
**And** 返回 `{ ok: boolean, error?: string }` 统一结构
**And** 错误提示字符串统一从 locale 文件读取，MVP 仅中文，但代码中不硬编码中文

### Story 1.4: 应用启动时创建默认空白 Markdown 文档

As a 用户，
I want 应用启动后立即获得一个空白 Markdown 文档，
So that 我可以三秒内开始记录。

**Acceptance Criteria:**

**Given** 应用已启动
**When** 主窗口完成渲染
**Then** 标题栏显示形如 `New_20260721_143052.md` 的文件名
**And** 文件名中的毫秒时间戳确保同一秒内多次启动不覆盖
**And** 若同一毫秒已存在同名文件，则等待下一毫秒后重新生成文件名，确保文件唯一性

**Given** 文档已创建
**When** 检查源码编辑器
**Then** 内容为空字符串
**And** 光标可在源码编辑器中 focus 并输入

**Given** 默认保存路径不可写且回退路径 `~/Documents/MarkdownCat` 也无法创建
**When** 应用启动完成
**Then** 标题栏仍显示生成的文件名
**And** 编辑器为空且可输入
**And** 状态栏提示用户保存失败并引导设置保存路径（与 Story 3.3 的失败处理保持一致）

**Given** 从双击应用到窗口出现
**When** 连续测量 5 次
**Then** 平均启动到可输入时间小于 3 秒
**And** 5 次中无一次 ≥ 4 秒

## Epic 2: 双栏编辑与实时预览

用户能在左栏编辑 Markdown 源码，右栏在 100ms 内实时渲染出一致的预览效果。Story 层面拆分为源码编辑器集成与 Markdown 实时渲染两个独立技术点，前者产出输入事件通道，后者消费该通道更新预览。

### Story 2.1: 集成源码编辑器与文档状态通道

As a 用户，
I want 在左栏直接输入和编辑 Markdown 源码，
So that 我可以用熟悉的纯文本方式开始记录内容。

**Acceptance Criteria:**

**Given** 应用主窗口已加载
**When** 用户进入主编辑区
**Then** 左栏显示可输入的源码编辑器
**And** 编辑器默认获得焦点或可立即点击获得焦点

**Given** 用户在源码编辑器内输入文本
**When** 执行键入、删除、移动光标、选择文本
**Then** 编辑器正确更新文档状态字符串
**And** 支持撤销、重做、复制、粘贴、剪切、全选等标准操作
**And** 撤销/重做历史仅在当前会话内有效，不跨会话保留
**And** 单次粘贴大段文本（如 10,000 字符）时编辑器不卡顿

**Given** 编辑器已集成
**When** 检查界面行为
**Then** 编辑器始终位于左栏且不可隐藏或关闭
**And** 文本选中样式、字体与光标样式符合 UX token 规范
**And** CodeMirror 主题与 keymap 配置与 design token 一致，避免独立硬编码颜色

### Story 2.2: 实现只读预览区与 Markdown 渲染

As a 用户，
I want 在右栏实时看到 Markdown 渲染结果，
So that 我能即时确认标题、列表、代码块和引用等格式是否正确。

**Acceptance Criteria:**

**Given** 左栏已有 Markdown 内容
**When** 文档状态发生变化
**Then** 右栏预览区在 100ms 内更新渲染结果
**And** 渲染结果与当前源码状态一致
**And** 100ms 延迟通过测量从源码状态变化到预览 DOM 更新完成的耗时来验证，取连续 10 次输入的最大值

**Given** 预览区已渲染内容
**When** 用户尝试在预览区输入或编辑
**Then** 预览区保持只读
**And** 不会直接修改文档状态
**And** 预览区禁用 contentEditable，防止用户通过开发者工具绕过只读限制

**Given** Markdown 内容包含标题、段落、列表、代码块、行内代码、链接、引用、分隔线
**When** 预览区渲染
**Then** 上述元素按设计规范显示
**And** 代码块、引用、链接、空状态样式符合 UX 设计要求
**And** 渲染过程对 HTML 标签和脚本进行转义或过滤，防止 XSS

**Given** 用户输入包含未知 Markdown 扩展语法
**When** 预览区渲染
**Then** 不支持的语法按纯文本显示，不报错也不阻断输入

### Story 2.3: 标题栏文件状态与三态显示

As a 用户，
I want 在编辑时清楚看到当前文件名和保存状态，
So that 我能确认正在编辑哪个文档以及当前是否已安全保存。

**Acceptance Criteria:**

**Given** 当前文档已加载
**When** 主窗口显示标题栏与编辑区
**Then** 标题栏显示当前文件名
**And** 标题栏在文档未保存、保存成功、保存失败三态间切换
**And** 状态圆点颜色语义清晰，不误导用户认为已保存成功

### Story 2.4: 空状态提示与双栏响应式布局

As a 用户，
I want 在编辑时看到清晰的空状态提示并稳定使用双栏界面，
So that 我能确认开始输入的位置并获得一致的布局体验。

**Acceptance Criteria:**

**Given** 预览区暂无内容
**When** 用户首次打开空白文档
**Then** 右栏显示空状态提示“开始输入 Markdown，右侧将实时预览。”
**And** 提示样式符合 text-muted 与居中规范
**And** 用户开始输入后空状态提示消失，清空内容后重新显示

**Given** 用户调整窗口尺寸
**When** 窗口宽高变化
**Then** 双栏随窗口同步缩放
**And** 标题栏、菜单栏、状态栏高度保持不变，双栏比例不允许被拖拽修改
**And** 编辑器与预览区的当前可见内容首行仍保持在可视区域内，不出现滚动跳变

### Story 2.5: 窗口缩放与显示器 DPI 适配

As a 用户，
I want 在窗口最小化、恢复或跨显示器切换时界面保持可用，
So that 在不同工作环境下都能稳定编辑。

**Acceptance Criteria:**

**Given** 用户调整窗口尺寸或最小化后恢复
**When** 窗口从最小化或最大化恢复
**Then** 双栏布局与标题栏/菜单栏/状态栏高度保持一致
**And** 双栏比例仍为 1:1 且不可拖拽修改

**Given** 用户在 Retina 与外接显示器之间切换 DPI
**When** 应用窗口跨越或移动到不同 DPI 屏幕
**Then** 布局与字体无错位或模糊
**And** 编辑器与预览区的滚动位置不因 DPI 切换发生跳跃

## Epic 3: 按键级自动保存与失败处理

用户停止输入 300ms 后内容自动写入文件；保存成功或失败都在状态栏明确反馈，且失败时保留编辑状态不丢数据。本 Epic 依赖 Epic 2 建立的编辑器输入事件通道，通过同一文档状态模型触发后端保存命令。

### Story 3.1: 接入 300ms 防抖自动保存流程

As a 用户，
I want 在停止输入后由系统自动保存当前文档，
So that 我不需要手动点击保存也能保住内容。

**Acceptance Criteria:**

**Given** 用户正在源码编辑器中连续输入
**When** 文档内容持续变化
**Then** 系统只更新内存中的文档状态
**And** 不会在每次按键时立即触发文件写入
**And** 防抖以文档内容变化（change event）为触发单位，而非每次按键（key event），避免输入法组合输入时产生多余保存

**Given** 用户停止输入至少 300ms
**When** 防抖计时结束
**Then** 前端触发一次保存命令到 Rust 后端
**And** 本次保存使用当前最新的文档内容与当前目标路径
**And** 保存期间 UI 不阻塞用户继续输入
**And** 保存命令在后台完成，成功或失败均通过回调更新标题栏与状态栏

**Given** 用户在上一次防抖结束前继续输入
**When** 防抖计时被重置
**Then** 仅最后一次停止输入后的保存会真正执行
**And** 不会产生过时内容覆盖新内容的情况
**And** 不存在保存队列堆积或并发保存导致文件损坏的风险

### Story 3.2: 实现保存成功状态反馈

As a 用户，
I want 在自动保存成功后看到明确反馈，
So that 我知道内容已经安全写入文件。

**Acceptance Criteria:**

**Given** 一次自动保存成功完成
**When** 后端返回成功结果
**Then** 状态栏显示“已保存至 {filename}”
**And** 标题栏状态切换到保存成功态（绿色圆点）
**And** 上一次失败提示被替换为成功提示

**Given** 当前文档已有文件名
**When** 保存成功提示渲染
**Then** 提示中展示当前文件名
**And** 成功状态样式使用 UX 规定的 success 颜色语义

**Given** 用户继续编辑文档
**When** 下一轮保存尚未完成
**Then** 标题栏状态切换到未保存态（无圆点，文件名保持默认颜色）
**And** UI 不应错误显示失败状态
**And** 上一次成功状态可保留，直到被新的保存结果更新
**And** 成功提示不自动消失，避免用户错过反馈

### Story 3.3: 实现保存失败提示与保底编辑体验

As a 用户，
I want 在保存失败时得到明确原因且继续编辑，
So that 即使磁盘或路径有问题也不会丢失正在输入的内容。

**Acceptance Criteria:**

**Given** 保存目标目录不可写、磁盘已满或文件被占用
**When** 后端保存命令返回失败
**Then** 状态栏显示“保存失败：{reason}”
**And** 标题栏状态切换到保存失败态（红色圆点）
**And** 错误原因对用户可读且不是模糊提示
**And** 原因字符串来自 locale 文件，不硬编码

**Given** 一次保存失败发生
**When** 用户继续在编辑器中输入
**Then** 编辑器内容保持原状
**And** 系统允许后续继续触发新的自动保存尝试
**And** 保存失败不会导致已打开文件被部分写入或截断为空文件

**Given** 保存失败提示已显示
**When** 后续某次保存成功
**Then** 失败提示被成功提示替换
**And** 标题栏与状态栏状态恢复一致
**And** 失败提示保持可见直到下一次成功保存，若用户点击状态栏可手动关闭（可选）

## Epic 4: 保存路径设置与持久化

用户可通过菜单设置默认 Markdown 保存路径，选择后立即生效，并在应用重启后保持。本 Epic 主要提供 UI 入口与调用 Epic 1 已实现的配置写入能力，不重复开发底层配置模块。

### Story 4.1: 接入菜单入口与保存路径对话框

As a 用户，
I want 从菜单打开“设置保存路径”对话框，
So that 我可以显式修改后续 Markdown 文件的默认保存目录。

**Acceptance Criteria:**

**Given** 应用主窗口已启动
**When** 用户点击菜单“Markdown Cat > 设置保存路径…”
**Then** 居中弹出保存路径对话框
**And** 主窗口其他区域在对话框关闭前不可交互
**And** 源码编辑器在对话框打开时失去焦点，关闭后恢复焦点

**Given** 保存路径对话框已打开
**When** 用户查看对话框内容
**Then** 对话框显示标题、说明文案、当前路径只读输入框、“选择...”按钮、“取消”按钮和“确认”按钮
**And** 对话框样式符合 UX 设计稿中的尺寸、圆角、边框和颜色 token
**And** 当用户尚未选择新路径时，“确认”按钮禁用或点击无效果

**Given** 对话框处于打开状态
**When** 用户按下 `Esc` 或点击“取消”
**Then** 对话框关闭
**And** 当前保存路径配置不发生变化
**And** 焦点回到触发菜单前的原位置

### Story 4.2: 完成系统文件夹选择与配置写入

> **前置条件：** 依赖 Story 1.3（配置读写模块）已实现并通过测试。

As a 用户，
I want 通过系统文件夹选择器选择已存在目录并保存，
So that 后续新建文档可以保存到我指定的位置。

**Acceptance Criteria:**

**Given** 保存路径对话框已打开
**When** 用户点击“选择...”
**Then** 打开系统文件夹选择器
**And** 仅允许选择已存在的目录
**And** 不允许选择应用包内目录或系统根目录等受保护位置

**Given** 用户在系统选择器中确认了一个目录
**When** 返回对话框并点击“确认”
**Then** 新路径通过既有配置写入命令保存到 JSON 配置文件
**And** 写入结果遵循 `{ ok: boolean, error?: string }` 协议
**And** 若配置写入失败，对话框不关闭并显示明确错误

**Given** 用户选择路径后完成确认
**When** 新配置写入成功
**Then** 后续新建文档默认使用新的保存路径
**And** 当前已打开文档的实际路径不被自动修改
**And** 用户选择的新路径不可写时，在保存触发时由 Story 3.3 的失败处理接管

### Story 4.3: 实现路径更新后的即时反馈与重启持久化验证

As a 用户，
I want 在修改保存路径后立即知道是否成功，并在重启后继续生效，
So that 我不用反复检查设置有没有保存下来。

**Acceptance Criteria:**

**Given** 保存路径写入成功
**When** 对话框关闭
**Then** 状态栏显示“保存路径已更新”或等效成功提示
**And** 提示文案清晰、可读并符合状态样式规范
**And** 提示保持可见至少 3 秒或直到下一次保存事件更新状态

**Given** 应用已完成一次保存路径更新
**When** 用户关闭并重新启动应用
**Then** 应用从配置文件中读取新的默认保存路径
**And** 首次新建文档使用更新后的路径规则
**And** 若配置文件在重启前被手动删除或损坏，则回退到默认规则并显示回退提示

**Given** 配置读取失败或配置文件损坏
**When** 应用启动
**Then** 应用回退到默认保存路径规则
**And** 用户仍可通过菜单重新设置保存路径而不被阻断
**And** 回退状态在状态栏中提示“已回退到默认保存路径”
