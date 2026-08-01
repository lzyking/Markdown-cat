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

## DW-11: Story 5.1 Splitter 缺少键盘与触屏交互

origin: code review of 5-1-resizable-splitter-component.md, 2026-07-30
location: src/App.vue
severity: medium
reason: 当前 splitter 仅通过鼠标事件 `@mousedown`/`window.mousemove`/`window.mouseup` 实现拖拽，桌面端 MVP 满足 AC。后续若支持触屏设备或无障碍键盘操作，需补充 `@touchstart`/`@touchmove`/`@touchend` 及键盘 ArrowLeft/ArrowRight/Home/End 处理。
status: open

## DW-12: Story 5.1 Splitter 缺少 ARIA 值语义

origin: code review of 5-1-resizable-splitter-component.md, 2026-07-30
location: src/App.vue:410-417
severity: medium
reason: splitter 已设置 `role="separator"` 与 `aria-label`，但缺少 `aria-valuenow`/`aria-valuemin`/`aria-valuemax`，屏幕阅读器无法感知当前分栏比例。建议在补充键盘支持时一并添加。
status: open

- source_spec: `_bmad-output/implementation-artifacts/5-2-responsive-preview-auto-adapter.md`
  summary: e2e story-5-2 测试用例假设默认分栏比例与固定像素拖拽目标（如 860/880/900px）能产生 regular/compact/wide 断点，未来若默认分栏比例或断点阈值调整，测试会脆弱失败。
  evidence: `e2e/story-5-2.spec.ts` 的 `dragSplitterTo` 调用与 `data-preview-layout` 初始值断言直接耦合当前 1100x700 视口下的默认 50/50 分栏与 420/640px 断点常量。
- source_spec: `_bmad-output/implementation-artifacts/5-2-responsive-preview-auto-adapter.md`
  summary: PreviewPane 响应式断点下的字号（13px/13.5px/14px）以硬编码 CSS 变量覆盖形式实现，未接入项目既有的设计 token 体系。
  evidence: `src/components/PreviewPane.vue` 的 `responsiveStyle` computed 中三档字号为字面量，未引用 `DESIGN.md`/`--font-size-*` token，后续设计系统扩展断点字号时需要手动同步维护。
- source_spec: `_bmad-output/implementation-artifacts/6-1-antigravity-color-tokens.md`
  summary: PreviewPane.vue、SlashMenu.vue、SettingsModal.vue 中存在硬编码的深色偏向颜色（如 `rgba(255,255,255,...)` 叠加层、`--color-primary`/`--color-text-subtle` 等未纳入新 token 体系的变量），一旦 6.2 启用浅色主题切换，这些组件在浅色主题下会显示不一致。
  evidence: 代码审查发现 `src/components/PreviewPane.vue`、`src/components/SlashMenu.vue` 使用硬编码浅色叠加层颜色值，`src/components/SettingsModal.vue` 引用了本次未纳入统一 token 体系的旧变量名。
- source_spec: `_bmad-output/implementation-artifacts/6-1-antigravity-color-tokens.md`
  summary: 语义色 token（`--color-success`/`--color-error`/`--color-warning`）与层级阴影/遮罩 token（`--shadow-dialog`、硬编码黑色遮罩）未随 10 套主题做差异化配色，浅色主题下可能显得突兀。
  evidence: `src/styles/app.css` 中 success/error/warning 与 `--shadow-dialog` 仍固定为原深色方案数值，未在任何 `[data-theme=...]` 块中覆盖，AC 未强制要求但会影响浅色主题下的视觉一致性。
- source_spec: `_bmad-output/implementation-artifacts/6-1-antigravity-color-tokens.md`
  summary: 新增的 10 套主题色板缺少自动化对比度/视觉回归测试，后续调色或新增主题时容易再次引入低对比度问题。
  evidence: 本轮 review 人工发现 5 个浅色主题强调色对比度低于 WCAG AA（已修复），但当前无任何测试用例覆盖对比度或视觉快照，回归依赖人工审查。
- source_spec: `_bmad-output/implementation-artifacts/6-1-antigravity-color-tokens.md`
  summary: 主题标识分别维护在 `src/styles/app.css` 的 CSS 选择器与 `src/lib/themes.json` 两处，缺少构建期校验确保两者一一对应，未来新增/重命名主题时容易出现拼写不一致导致主题静默失效。
  evidence: `themes.ts` 现已对运行时字段做基本校验，但没有机制校验 `themes.json` 的每个 `id` 都存在对应的 `[data-theme="id"]` CSS 规则，反之亦然。
- source_spec: `_bmad-output/implementation-artifacts/6-2-file-menu-theme-selector.md`
  summary: `set_config` 的读-改-写模式没有加锁，近乎同时的两次调用（例如切换主题与更改保存路径）可能互相覆盖对方写入的字段。
  evidence: `src-tauri/src/commands/config.rs` 中 `set_config`/`update_last_opened_file` 各自独立 `read_config` → 修改内存结构体 → `write_config`，无文件锁或原子合并，属于 4.x 系列引入的既有模式，本次仅新增 `theme_id` 字段沿用了该模式。
- source_spec: `_bmad-output/implementation-artifacts/6-2-file-menu-theme-selector.md`
  summary: File 菜单及其新增的 Theme 子菜单仅能通过鼠标 `:hover`/`:focus-within` 展开，纯键盘用户无法聚焦并展开该子菜单或其中任一主题项。
  evidence: `src/components/MenuBar.vue` 中 `.menu-dropdown`/`.submenu-dropdown` 的展开逻辑完全依赖 CSS `:hover`/`:focus-within`，子菜单触发器与主题按钮之间没有可达的键盘聚焦路径；这是延续自更早期 story 的既有菜单交互模式，本次仅新增了第二层子菜单。
- source_spec: `_bmad-output/implementation-artifacts/6-2-file-menu-theme-selector.md`
  summary: Theme 子菜单触发器（`.submenu-trigger`）与主题选项完全依赖鼠标 `:hover`/`:focus-within` 展开，纯键盘用户仍无法聚焦并展开该子菜单选择主题。
  evidence: `src/components/MenuBar.vue` 中 `.submenu-trigger` 及其兄弟顶层菜单项均未设置 `tabindex`，也没有 `keydown` 处理逻辑，Tab 键无法到达 Theme 子菜单或其内部的主题按钮。
- source_spec: `_bmad-output/implementation-artifacts/6-2-file-menu-theme-selector.md`
  summary: 主题切换复用了全局 `saveStatus`/`saveMessage` 通道用于反馈，可能覆盖并掩盖真实的文档保存成功/失败提示。
  evidence: `src/App.vue` 的 `handleThemeSelect` 直接写入与自动保存、打开文件、另存为共用的 `saveStatus.value`/`saveMessage.value`，若用户在保存失败提示尚未处理时切换主题，失败提示会被主题切换消息静默覆盖；该单通道通知模式为既有设计，本次仅新增了一个写入者。
- source_spec: `_bmad-output/implementation-artifacts/6-2-file-menu-theme-selector.md`
  summary: 主题 ID 与默认主题 ID 分别在 `src/lib/themes.ts`/`themes.json`（前端）与 `src-tauri/src/config.rs`（后端 `VALID_THEME_IDS`/`DEFAULT_THEME_ID`）两处独立维护，缺少构建期或运行期校验保证一致。
  evidence: `src-tauri/src/config.rs` 新增的 `VALID_THEME_IDS` 常量数组与 `DEFAULT_THEME_ID` 字面量需要手工与 `src/lib/themes.json` 的 10 个主题 id 及 `defaultThemeId` 保持同步，未来新增/重命名主题时容易遗漏一侧导致后端拒绝合法主题或默认值不一致。
- source_spec: `_bmad-output/implementation-artifacts/6-2-file-menu-theme-selector.md`
  summary: `main.ts` 的 `bootstrap()` 与 `App.vue` 的 `onMounted()` 在启动时各自独立调用一次 `get_config`，造成重复 IPC/磁盘读取。
  evidence: `src/main.ts` 为预加载主题调用一次 `get_config`，`src/App.vue` 的 `onMounted` 又为读取 `savePath`/`lastOpenedFile` 再次调用同一命令，二者互不感知，属于冗余但非破坏性的重复初始化调用。
- source_spec: `_bmad-output/implementation-artifacts/6-2-file-menu-theme-selector.md`
  summary: `e2e/story-6-2.spec.ts` 对 AC3 的持久化验证依赖前端 Tauri mock 注入的 `get_config` 返回值模拟“重启”，并未真正验证 Rust 侧写入并重新读取 `config.json` 的完整闭环；同时缺少对 `set_config` 失败时主题回滚路径、以及配置中存有非法 `themeId` 时前端回退逻辑的测试覆盖。
  evidence: `e2e/story-6-2.spec.ts` 的持久化用例通过 `page.addInitScript` 注入 `__TAURI_MOCK_CONFIG__` 模拟重启后的配置，而不是驱动真实的 Tauri 后端往返；`src/App.vue` 的 `handleThemeSelect` 失败回滚逻辑与 `src/lib/themes.ts` 的 `getResolvedThemeId` 回退逻辑均无对应测试用例。
- source_spec: `_bmad-output/implementation-artifacts/7-1-slash-command-task-list.md`
  summary: `SourceEditor.insertTemplate` 仅替换触发用的 `/` 字符，并非真正在“行首”插入；若光标在行中间触发 slash 菜单，插入内容会拼接在光标处而非行首。
  evidence: `src/components/SourceEditor.vue` 的 `insertTemplate` 只在光标前一个字符是 `/` 时把它连同后续内容替换为模板，不会主动定位到行首；这是 ul/ol/quote 等既有菜单项共享的历史行为（本故事的 task-list 项复用同一机制），非本故事新引入，需要单独的规格决策后统一修复。
- source_spec: `_bmad-output/implementation-artifacts/7-1-slash-command-task-list.md`
  summary: 预览区渲染出的任务列表 checkbox 缺少可访问的 label/name，只有小方框本身可点击，点击任务文字本身无效果。
  evidence: `src/lib/markdown.ts` 的 `TaskAwareRenderer.checkbox()` 仅输出裸 `<input type="checkbox">`，未关联同一 `<li>` 内的文本作为可点击标签，也未设置 `aria-label`；不影响本故事 AC 的达成，但存在可访问性提升空间。
- source_spec: `_bmad-output/implementation-artifacts/7-1-slash-command-task-list.md`
  summary: 预览区新增的可交互 checkbox 会加入原生 Tab 焦点顺序，使原本作为被动展示区域的预览面板新增多个可聚焦停靠点，可能影响整体键盘导航体验。
  evidence: `src/components/PreviewPane.vue` 渲染的 `<input type="checkbox">` 未设置 `tabindex="-1"` 或其他方式移出默认 Tab 顺序，长文档中含多个任务项时会显著增加预览区的 Tab 停靠次数。
- source_spec: `_bmad-output/implementation-artifacts/7-1-slash-command-task-list.md`
  summary: 预览区任务 checkbox 点击后通过 `content.value` 整体重写驱动 `SourceEditor`，触发编辑器 `from:0 to:doc.length` 的全量替换事务，而非仅针对被切换那一行的局部编辑事务。
  evidence: `src/components/SourceEditor.vue` 中 `watch(() => props.modelValue, ...)` 对任何外部内容变化统一走 `view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } })` 的全量替换路径；这是应用既有的、跨多个既有菜单项共享的内容同步机制（非本故事引入），但预览区勾选交互作为一种更细粒度的编辑操作，会因此对大文档产生不必要的撤销历史/滚动位置扰动，值得单独评估是否需要改为局部 change 事务。
