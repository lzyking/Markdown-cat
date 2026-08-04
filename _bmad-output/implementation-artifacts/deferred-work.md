# Deferred Work

### DW-18: index.html 引用不存在的 /vite.svg 导致 404

origin: migrated from legacy ledger ("## DW-1"), 2026-08-02
location: index.html:5
severity: low
reason: 移除或替换不存在的 favicon 资源，避免启动时 404 噪声。属于 polish 项，不影响功能，可延后处理。
status: done 2026-08-02
resolution: already resolved: commit 61e7aa4 removed the <link rel="icon" href="/vite.svg"> tag from index.html; current index.html has no reference to /vite.svg.

### DW-19: ping 命令使用 async 但无 await，可改为同步函数

origin: migrated from legacy ledger ("## DW-2"), 2026-08-02
location: src-tauri/src/commands/mod.rs:32
severity: low
reason: ping 命令无异步操作，改为同步函数可减少不必要的运行时开销。属于代码质量优化，不影响当前运行，可延后处理。
status: done 2026-08-02
resolution: already resolved: commit 61e7aa4 changed `pub async fn ping()` to `pub fn ping()` in src-tauri/src/commands/mod.rs; the command is now synchronous.

### DW-20: thiserror 依赖已引入但当前未使用

origin: migrated from legacy ledger ("## DW-3"), 2026-08-02
location: src-tauri/Cargo.toml:28
severity: low
reason: thiserror 计划用于后续 Story 的错误处理，当前未使用。为避免误删后重复添加，保持现状，延后到实现错误处理层时统一使用或移除。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-backend-structured-error-logging

### DW-21: Cargo.toml 中 authors 字段已弃用

origin: migrated from legacy ledger ("## DW-4"), 2026-08-02
location: src-tauri/Cargo.toml:5
severity: low
reason: Cargo 的 `authors` 字段已标记为弃用，应移除或改用 `package.authors` 以外的元数据方式。属于维护性清理，不影响构建与运行，可延后处理。
status: done 2026-08-02
resolution: already resolved: commit 61e7aa46bf7d388bfd48e8d1176a4f34c3e20c57 (git log --follow -p -- src-tauri/Cargo.toml) removed the deprecated `authors = ["Max"]` line; current src-tauri/Cargo.toml:1-8 contains no authors field.

### DW-22: Story 1.2 浅色模式防御未在代码层显式说明

origin: migrated from legacy ledger ("## DW-5"), 2026-08-02
location: src/styles/app.css, src/main.ts
severity: low
reason: spec 要求收到浅色/深色切换事件时保持深色不变。当前实现为“不监听 prefers-color-scheme”，这本身符合 MVP 约束，但缺少显式注释或代码说明，容易让未来开发者误认为遗漏了浅色模式支持。后续在实现主题系统时，应显式注释或增加 `color-scheme: dark` 强制深色，避免误加浅色模式。
status: done 2026-08-02
resolution: already resolved: src/styles/app.css and src/main.ts still register no prefers-color-scheme listener, but Story 6.2 (commit dcbeb86) introduced the full theme system (src/lib/themes.ts, themes.json, data-theme attribute) that explicitly and deliberately governs light/dark behavior, superseding the original 'undocumented dark-only default' concern.

### DW-23: Story 1.3 日志与错误处理可进一步结构化

origin: migrated from legacy ledger ("## DW-6"), 2026-08-02
location: src-tauri/src/config.rs, src-tauri/src/commands/config.rs
severity: low
reason: 当前配置模块使用 `eprintln!` 输出警告与错误，后续 Epic 实现持久化错误处理与日志时，应统一替换为结构化日志（如 `tauri_plugin_log` 或 `tracing`），避免日志散落到 stderr；同时可将 `ERR_APP_DIR_NOT_WRITABLE` 等错误码封装为自定义错误类型，与 locale 错误消息映射解耦。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-backend-structured-error-logging

### DW-24: Story 1.3 `.write_test` 临时文件残留风险

origin: migrated from legacy ledger ("## DW-7"), 2026-08-02
location: src-tauri/src/config.rs
severity: low
reason: `is_dir_writable` 通过写入 `.write_test` 文件验证写权限，删除失败时静默忽略。极端情况下可能留下临时文件。后续可改用 `tempfile` crate 或系统临时目录避免污染应用目录，同时确保清理。
status: done 2026-08-02
resolution: already resolved: src-tauri/src/config.rs:107-112 now uses tempfile::NamedTempFile::new_in(dir) with an explicit .close() call for guaranteed cleanup, replacing the old manual .write_test file approach.

### DW-25: Story 1.4 前端错误降级占位不明确

origin: migrated from legacy ledger ("## DW-8"), 2026-08-02
location: src/App.vue:19-32
severity: minor
reason: 当 `get_blank_document` 失败或命令不可用时，`filename` 保持初始值 `New_*.md`，用户可见不真实的占位文件名。当前仅通过 `console.error` 输出日志，未在 UI 上给出可见的错误状态或降级文件名。后续可在状态栏或标题栏显示通用错误状态，或提供 `New_Untitled.md` 等安全降级名称。
status: done 2026-08-02
resolution: already resolved: src/App.vue:1055-1065 now sets filename to the safe fallback 'New_Untitled.md' and surfaces the failure via saveMessage when get_blank_document fails, instead of silently keeping an unreal placeholder name.

### DW-26: App.vue 中 .placeholder 样式未清理

origin: migrated from legacy ledger ("## DW-9"), 2026-08-02
location: src/App.vue:95-103
severity: low
reason: Story 2.1 和 2.2 已用实际组件替换所有占位，但 scoped CSS 中仍保留 `.placeholder` 样式块。Dead code，不影响功能。
status: done 2026-08-02
resolution: already resolved: grep for '.placeholder' in src/App.vue returns no matches; the dead CSS block described in the entry has already been removed.

### DW-27: PreviewPane onPreviewClick 危险协议分支 stopPropagation 冗余

origin: migrated from legacy ledger ("## DW-10"), 2026-08-02
location: src/components/PreviewPane.vue:21-29
severity: low
reason: 对危险协议的 `stopPropagation` 在当前组件树中无实际效果（无父级响应），属于防御性冗余代码。不影响功能。
status: done 2026-08-02
resolution: already resolved: src/components/PreviewPane.vue:65-90 contains no stopPropagation call in the dangerous-protocol click handler (only preventDefault), and `git log -p` for the file shows no historical stopPropagation usage to remove either — the described redundant code is not present.

### DW-28: Story 5.1 Splitter 缺少键盘与触屏交互

origin: migrated from legacy ledger ("## DW-11"), 2026-08-02
location: src/App.vue
severity: medium
reason: 当前 splitter 仅通过鼠标事件 `@mousedown`/`window.mousemove`/`window.mouseup` 实现拖拽，桌面端 MVP 满足 AC。后续若支持触屏设备或无障碍键盘操作，需补充 `@touchstart`/`@touchmove`/`@touchend` 及键盘 ArrowLeft/ArrowRight/Home/End 处理。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-splitter-keyboard-touch-and-aria

### DW-29: Story 5.1 Splitter 缺少 ARIA 值语义

origin: migrated from legacy ledger ("## DW-12"), 2026-08-02
location: src/App.vue:410-417
severity: medium
reason: splitter 已设置 `role="separator"` 与 `aria-label`，但缺少 `aria-valuenow`/`aria-valuemin`/`aria-valuemax`，屏幕阅读器无法感知当前分栏比例。建议在补充键盘支持时一并添加。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-splitter-keyboard-touch-and-aria

### DW-30: e2e story-5-2 测试用例假设默认分栏比例与固定像素拖拽目标（如 860/880/900px）能产生 regular/compact/wide 断点，未来若默认分栏比例或断点阈值调整，测试会脆弱失败。

origin: migrated from legacy ledger ("## DW-22"), 2026-08-02
location: `e2e/story-5-2.spec.ts` 的 `dragSplitterTo` 调用与 `data-preview-layout` 初始值断言直接耦合当前 1100x700 视口下的默认 50/50 分栏与 420/640px 断点常量。
severity: low
reason: e2e story-5-2 测试用例假设默认分栏比例与固定像素拖拽目标（如 860/880/900px）能产生 regular/compact/wide 断点，未来若默认分栏比例或断点阈值调整，测试会脆弱失败。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-preview-breakpoint-test-hardening

### DW-31: PreviewPane 响应式断点下的字号（13px/13.5px/14px）以硬编码 CSS 变量覆盖形式实现，未接入项目既有的设计 token 体系。

origin: migrated from legacy ledger ("## DW-23"), 2026-08-02
location: `src/components/PreviewPane.vue` 的 `responsiveStyle` computed 中三档字号为字面量，未引用 `DESIGN.md`/`--font-size-*` token，后续设计系统扩展断点字号时需要手动同步维护。
severity: low
reason: PreviewPane 响应式断点下的字号（13px/13.5px/14px）以硬编码 CSS 变量覆盖形式实现，未接入项目既有的设计 token 体系。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-design-token-light-theme-migration

### DW-32: PreviewPane.vue、SlashMenu.vue、SettingsModal.vue 中存在硬编码的深色偏向颜色（如 `rgba(255,255,255,...)` 叠加层、`--color-primary`/`--color-text-subtle` 等未纳入新 token 体系的变量），一旦 6.2 启用浅色主题切换，这些组件在浅色主题下会显示不一致。

origin: migrated from legacy ledger ("## DW-24"), 2026-08-02
location: 代码审查发现 `src/components/PreviewPane.vue`、`src/components/SlashMenu.vue` 使用硬编码浅色叠加层颜色值，`src/components/SettingsModal.vue` 引用了本次未纳入统一 token 体系的旧变量名。
severity: low
reason: PreviewPane.vue、SlashMenu.vue、SettingsModal.vue 中存在硬编码的深色偏向颜色（如 `rgba(255,255,255,...)` 叠加层、`--color-primary`/`--color-text-subtle` 等未纳入新 token 体系的变量），一旦 6.2 启用浅色主题切换，这些组件在浅色主题下会显示不一致。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-design-token-light-theme-migration

### DW-33: 语义色 token（`--color-success`/`--color-error`/`--color-warning`）与层级阴影/遮罩 token（`--shadow-dialog`、硬编码黑色遮罩）未随 10 套主题做差异化配色，浅色主题下可能显得突兀。

origin: migrated from legacy ledger ("## DW-25"), 2026-08-02
location: `src/styles/app.css` 中 success/error/warning 与 `--shadow-dialog` 仍固定为原深色方案数值，未在任何 `[data-theme=...]` 块中覆盖，AC 未强制要求但会影响浅色主题下的视觉一致性。
severity: low
reason: 语义色 token（`--color-success`/`--color-error`/`--color-warning`）与层级阴影/遮罩 token（`--shadow-dialog`、硬编码黑色遮罩）未随 10 套主题做差异化配色，浅色主题下可能显得突兀。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-design-token-light-theme-migration

### DW-34: 新增的 10 套主题色板缺少自动化对比度/视觉回归测试，后续调色或新增主题时容易再次引入低对比度问题。

origin: migrated from legacy ledger ("## DW-26"), 2026-08-02
location: 本轮 review 人工发现 5 个浅色主题强调色对比度低于 WCAG AA（已修复），但当前无任何测试用例覆盖对比度或视觉快照，回归依赖人工审查。
severity: low
reason: 新增的 10 套主题色板缺少自动化对比度/视觉回归测试，后续调色或新增主题时容易再次引入低对比度问题。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-theme-contrast-regression-tests

### DW-35: 主题标识分别维护在 `src/styles/app.css` 的 CSS 选择器与 `src/lib/themes.json` 两处，缺少构建期校验确保两者一一对应，未来新增/重命名主题时容易出现拼写不一致导致主题静默失效。

origin: migrated from legacy ledger ("## DW-27"), 2026-08-02
location: `themes.ts` 现已对运行时字段做基本校验，但没有机制校验 `themes.json` 的每个 `id` 都存在对应的 `[data-theme="id"]` CSS 规则，反之亦然。
severity: low
reason: 主题标识分别维护在 `src/styles/app.css` 的 CSS 选择器与 `src/lib/themes.json` 两处，缺少构建期校验确保两者一一对应，未来新增/重命名主题时容易出现拼写不一致导致主题静默失效。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-theme-id-sync-guard

### DW-36: `set_config` 的读-改-写模式没有加锁，近乎同时的两次调用（例如切换主题与更改保存路径）可能互相覆盖对方写入的字段。

origin: migrated from legacy ledger ("## DW-28"), 2026-08-02
location: `src-tauri/src/commands/config.rs` 中 `set_config`/`update_last_opened_file` 各自独立 `read_config` → 修改内存结构体 → `write_config`，无文件锁或原子合并，属于 4.x 系列引入的既有模式，本次仅新增 `theme_id` 字段沿用了该模式。
severity: low
reason: `set_config` 的读-改-写模式没有加锁，近乎同时的两次调用（例如切换主题与更改保存路径）可能互相覆盖对方写入的字段。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-config-theme-init-hardening

### DW-37: File 菜单及其新增的 Theme 子菜单仅能通过鼠标 `:hover`/`:focus-within` 展开，纯键盘用户无法聚焦并展开该子菜单或其中任一主题项。

origin: migrated from legacy ledger ("## DW-29"), 2026-08-02
location: `src/components/MenuBar.vue` 中 `.menu-dropdown`/`.submenu-dropdown` 的展开逻辑完全依赖 CSS `:hover`/`:focus-within`，子菜单触发器与主题按钮之间没有可达的键盘聚焦路径；这是延续自更早期 story 的既有菜单交互模式，本次仅新增了第二层子菜单。
severity: low
reason: File 菜单及其新增的 Theme 子菜单仅能通过鼠标 `:hover`/`:focus-within` 展开，纯键盘用户无法聚焦并展开该子菜单或其中任一主题项。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-menu-keyboard-accessibility

### DW-38: Theme 子菜单触发器（`.submenu-trigger`）与主题选项完全依赖鼠标 `:hover`/`:focus-within` 展开，纯键盘用户仍无法聚焦并展开该子菜单选择主题。

origin: migrated from legacy ledger ("## DW-30"), 2026-08-02
location: `src/components/MenuBar.vue` 中 `.submenu-trigger` 及其兄弟顶层菜单项均未设置 `tabindex`，也没有 `keydown` 处理逻辑，Tab 键无法到达 Theme 子菜单或其内部的主题按钮。
severity: low
reason: Theme 子菜单触发器（`.submenu-trigger`）与主题选项完全依赖鼠标 `:hover`/`:focus-within` 展开，纯键盘用户仍无法聚焦并展开该子菜单选择主题。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-menu-keyboard-accessibility

### DW-39: 主题切换复用了全局 `saveStatus`/`saveMessage` 通道用于反馈，可能覆盖并掩盖真实的文档保存成功/失败提示。

origin: migrated from legacy ledger ("## DW-31"), 2026-08-02
location: `src/App.vue` 的 `handleThemeSelect` 直接写入与自动保存、打开文件、另存为共用的 `saveStatus.value`/`saveMessage.value`，若用户在保存失败提示尚未处理时切换主题，失败提示会被主题切换消息静默覆盖；该单通道通知模式为既有设计，本次仅新增了一个写入者。
severity: low
reason: 主题切换复用了全局 `saveStatus`/`saveMessage` 通道用于反馈，可能覆盖并掩盖真实的文档保存成功/失败提示。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-config-theme-init-hardening

### DW-40: 主题 ID 与默认主题 ID 分别在 `src/lib/themes.ts`/`themes.json`（前端）与 `src-tauri/src/config.rs`（后端 `VALID_THEME_IDS`/`DEFAULT_THEME_ID`）两处独立维护，缺少构建期或运行期校验保证一致。

origin: migrated from legacy ledger ("## DW-32"), 2026-08-02
location: `src-tauri/src/config.rs` 新增的 `VALID_THEME_IDS` 常量数组与 `DEFAULT_THEME_ID` 字面量需要手工与 `src/lib/themes.json` 的 10 个主题 id 及 `defaultThemeId` 保持同步，未来新增/重命名主题时容易遗漏一侧导致后端拒绝合法主题或默认值不一致。
severity: low
reason: 主题 ID 与默认主题 ID 分别在 `src/lib/themes.ts`/`themes.json`（前端）与 `src-tauri/src/config.rs`（后端 `VALID_THEME_IDS`/`DEFAULT_THEME_ID`）两处独立维护，缺少构建期或运行期校验保证一致。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-theme-id-sync-guard

### DW-41: `main.ts` 的 `bootstrap()` 与 `App.vue` 的 `onMounted()` 在启动时各自独立调用一次 `get_config`，造成重复 IPC/磁盘读取。

origin: migrated from legacy ledger ("## DW-33"), 2026-08-02
location: `src/main.ts` 为预加载主题调用一次 `get_config`，`src/App.vue` 的 `onMounted` 又为读取 `savePath`/`lastOpenedFile` 再次调用同一命令，二者互不感知，属于冗余但非破坏性的重复初始化调用。
severity: low
reason: `main.ts` 的 `bootstrap()` 与 `App.vue` 的 `onMounted()` 在启动时各自独立调用一次 `get_config`，造成重复 IPC/磁盘读取。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-config-theme-init-hardening

### DW-42: `e2e/story-6-2.spec.ts` 对 AC3 的持久化验证依赖前端 Tauri mock 注入的 `get_config` 返回值模拟“重启”，并未真正验证 Rust 侧写入并重新读取 `config.json` 的完整闭环；同时缺少对 `set_config` 失败时主题回滚路径、以及配置中存有非法 `themeId` 时前端回退逻辑的测试覆盖。

origin: migrated from legacy ledger ("## DW-34"), 2026-08-02
location: `e2e/story-6-2.spec.ts` 的持久化用例通过 `page.addInitScript` 注入 `__TAURI_MOCK_CONFIG__` 模拟重启后的配置，而不是驱动真实的 Tauri 后端往返；`src/App.vue` 的 `handleThemeSelect` 失败回滚逻辑与 `src/lib/themes.ts` 的 `getResolvedThemeId` 回退逻辑均无对应测试用例。
severity: low
reason: `e2e/story-6-2.spec.ts` 对 AC3 的持久化验证依赖前端 Tauri mock 注入的 `get_config` 返回值模拟“重启”，并未真正验证 Rust 侧写入并重新读取 `config.json` 的完整闭环；同时缺少对 `set_config` 失败时主题回滚路径、以及配置中存有非法 `themeId` 时前端回退逻辑的测试覆盖。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-config-theme-persistence-test-coverage

### DW-43: `SourceEditor.insertTemplate` 仅替换触发用的 `/` 字符，并非真正在“行首”插入；若光标在行中间触发 slash 菜单，插入内容会拼接在光标处而非行首。

origin: migrated from legacy ledger ("## DW-35"), 2026-08-02
location: `src/components/SourceEditor.vue` 的 `insertTemplate` 只在光标前一个字符是 `/` 时把它连同后续内容替换为模板，不会主动定位到行首；这是 ul/ol/quote 等既有菜单项共享的历史行为（本故事的 task-list 项复用同一机制），非本故事新引入，需要单独的规格决策后统一修复。
severity: low
reason: `SourceEditor.insertTemplate` 仅替换触发用的 `/` 字符，并非真正在“行首”插入；若光标在行中间触发 slash 菜单，插入内容会拼接在光标处而非行首。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-slash-template-line-start-fix

### DW-44: 预览区渲染出的任务列表 checkbox 缺少可访问的 label/name，只有小方框本身可点击，点击任务文字本身无效果。

origin: migrated from legacy ledger ("## DW-36"), 2026-08-02
location: `src/lib/markdown.ts` 的 `TaskAwareRenderer.checkbox()` 仅输出裸 `<input type="checkbox">`，未关联同一 `<li>` 内的文本作为可点击标签，也未设置 `aria-label`；不影响本故事 AC 的达成，但存在可访问性提升空间。
severity: low
reason: 预览区渲染出的任务列表 checkbox 缺少可访问的 label/name，只有小方框本身可点击，点击任务文字本身无效果。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-task-checkbox-accessibility

### DW-45: 预览区新增的可交互 checkbox 会加入原生 Tab 焦点顺序，使原本作为被动展示区域的预览面板新增多个可聚焦停靠点，可能影响整体键盘导航体验。

origin: migrated from legacy ledger ("## DW-37"), 2026-08-02
location: `src/components/PreviewPane.vue` 渲染的 `<input type="checkbox">` 未设置 `tabindex="-1"` 或其他方式移出默认 Tab 顺序，长文档中含多个任务项时会显著增加预览区的 Tab 停靠次数。
severity: low
reason: 预览区新增的可交互 checkbox 会加入原生 Tab 焦点顺序，使原本作为被动展示区域的预览面板新增多个可聚焦停靠点，可能影响整体键盘导航体验。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-task-checkbox-accessibility

### DW-46: 预览区任务 checkbox 点击后通过 `content.value` 整体重写驱动 `SourceEditor`，触发编辑器 `from:0 to:doc.length` 的全量替换事务，而非仅针对被切换那一行的局部编辑事务。

origin: migrated from legacy ledger ("## DW-38"), 2026-08-02
location: `src/components/SourceEditor.vue` 中 `watch(() => props.modelValue, ...)` 对任何外部内容变化统一走 `view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } })` 的全量替换路径；这是应用既有的、跨多个既有菜单项共享的内容同步机制（非本故事引入），但预览区勾选交互作为一种更细粒度的编辑操作，会因此对大文档产生不必要的撤销历史/滚动位置扰动，值得单独评估是否需要改为局部 change 事务。
severity: low
reason: 预览区任务 checkbox 点击后通过 `content.value` 整体重写驱动 `SourceEditor`，触发编辑器 `from:0 to:doc.length` 的全量替换事务，而非仅针对被切换那一行的局部编辑事务。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-preview-checkbox-targeted-edit

### DW-47: 剪贴板粘贴图片会无条件调用 `event.preventDefault()`，若剪贴板中同时含有图片以外的文本/HTML 内容，会被一并丢弃而非按原生行为一起粘贴。

origin: migrated from legacy ledger ("## DW-39"), 2026-08-02
location: `src/components/SourceEditor.vue` 的 `paste` 处理器只要检测到 `clipboardData` 中存在受支持类型的图片项，即调用 `event.preventDefault()` 并只处理图片，不会保留同一次粘贴中可能存在的富文本/纯文本内容。
severity: low
reason: 剪贴板粘贴图片会无条件调用 `event.preventDefault()`，若剪贴板中同时含有图片以外的文本/HTML 内容，会被一并丢弃而非按原生行为一起粘贴。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-clipboard-paste-editor-robustness

### DW-48: `save_image_asset` 后端命令未校验写入的字节内容确实是合法的 PNG/JPEG 图片，理论上可被用于写入任意二进制内容到受信目录中的任意合法文件名。

origin: migrated from legacy ledger ("## DW-40"), 2026-08-02
location: `src-tauri/src/commands/doc.rs` 的 `save_image_asset` 仅校验文件名合法性（无路径穿越），未对 `bytes` 做图片文件头/内容校验；前端已限制仅 `image/png`/`image/jpeg` 触发调用，但命令本身对上游数据来源零信任场景无防护。
severity: low
reason: `save_image_asset` 后端命令未校验写入的字节内容确实是合法的 PNG/JPEG 图片，理论上可被用于写入任意二进制内容到受信目录中的任意合法文件名。
status: done 2026-08-03
resolution: resolved by sweep bundle dw-image-asset-content-validation

### DW-49: 前端将粘贴的图片二进制经 `ArrayBuffer` → `Uint8Array` → 普通 `number[]` 三次转换后再通过 IPC 传给后端，大尺寸截图会带来不必要的内存开销与潜在 UI 卡顿。

origin: migrated from legacy ledger ("## DW-41"), 2026-08-02
location: `src/components/SourceEditor.vue` 的 `emitClipboardImage` 使用 `Array.from(new Uint8Array(buffer))` 生成 `number[]` 作为 `ClipboardImagePayload.bytes`，未评估改用更高效的二进制传输方式（如 base64 或 Tauri 的 raw bytes 支持）对大图片粘贴性能的影响。
severity: low
reason: 前端将粘贴的图片二进制经 `ArrayBuffer` → `Uint8Array` → 普通 `number[]` 三次转换后再通过 IPC 传给后端，大尺寸截图会带来不必要的内存开销与潜在 UI 卡顿。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-clipboard-paste-editor-robustness

### DW-50: 通过“上次打开文件”自动恢复会话时，`App.vue` 的 `onMounted` 只恢复了 `filename`/`content`，未同步设置 `currentFilePath`，导致自动恢复后的文档被当作“未保存”处理。

origin: migrated from legacy ledger ("## DW-42"), 2026-08-02
location: `src/App.vue` 的 `onMounted` 在 `read_external_document` 成功后仅赋值 `filename.value`/`content.value`，未对 `currentFilePath.value` 赋值（对比 `loadFileFromPath` 中会显式设置）；这是 `lastOpenedFile` 会话恢复机制的既有行为（本故事之前已存在），本故事新增的粘贴图片功能依赖 `currentFilePath` 判断保存目录，因而放大了该问题的可观察影响（自动恢复的文档粘贴图片会被存入回退 `assets/` 目录而非文档同目录）。
severity: low
reason: 通过“上次打开文件”自动恢复会话时，`App.vue` 的 `onMounted` 只恢复了 `filename`/`content`，未同步设置 `currentFilePath`，导致自动恢复后的文档被当作“未保存”处理。
status: done 2026-08-03
resolution: resolved by sweep bundle dw-restore-session-current-file-path-fix
seen-again: review of 8-1-export-self-contained-html.md (re-discovered independently, ex-DW-48)
seen-again: review of 8-1-export-self-contained-html.md (re-confirmed still unresolved, ex-DW-49)

### DW-51: `copy_asset_between_dirs`（“另存为”资源迁移）在目标目录已存在同名文件时会用 `fs::copy` 直接覆盖，而非像粘贴保存那样做唯一化处理。

origin: migrated from legacy ledger ("## DW-43"), 2026-08-02
location: `src-tauri/src/doc.rs` 的 `copy_asset_between_dirs` 对 `dest` 路径直接调用 `fs::copy(&source, &dest)`，未检测 `dest` 是否已存在；若新文档目录中恰好已有一个同名（含相同时间戳+Hash）图片文件，迁移会静默覆盖它。触发概率极低（需要文件名完全一致），但修复需要同时更新 Markdown 正文中对应的图片引用路径，非本轮可安全自动完成的最小改动，故记录以待后续统一处理。
severity: low
reason: `copy_asset_between_dirs`（“另存为”资源迁移）在目标目录已存在同名文件时会用 `fs::copy` 直接覆盖，而非像粘贴保存那样做唯一化处理。
status: done 2026-08-03
resolution: resolved by sweep bundle dw-save-as-asset-migration-hardening

### DW-52: “另存为”资源迁移失败或跳过（`migrated: false`，例如源文件已被外部删除）时，前端仅 `console.error` 记录，UI 仍提示“已另存为 …”成功，用户无法察觉正文中引用的图片实际未随文档迁移。

origin: migrated from legacy ledger ("## DW-44"), 2026-08-02
location: `src/App.vue` 的 `handleSaveAsFile` 对 `copy_asset_file` 的返回结果（含 `AssetMigrationResult.migrated`）未做任何检查，也未在迁移失败/跳过时更新 `saveMessage`；用户保存后仍会看到成功提示，直到重新打开文档发现图片链接失效才会察觉。
severity: low
reason: “另存为”资源迁移失败或跳过（`migrated: false`，例如源文件已被外部删除）时，前端仅 `console.error` 记录，UI 仍提示“已另存为 …”成功，用户无法察觉正文中引用的图片实际未随文档迁移。
status: done 2026-08-03
resolution: resolved by sweep bundle dw-save-as-asset-migration-hardening

### DW-53: `extractAssetReferences` 仅识别 `![alt](./assets/filename)` 这一种内联 Markdown 图片写法，无法识别 HTML `<img>`、引用式链接、带标题的链接，或不带 `./` 前缀的 `assets/filename` 路径，这些引用在“另存为”迁移时会被漏迁移。

origin: migrated from legacy ledger ("## DW-45"), 2026-08-02
location: `src/lib/image-assets.ts` 的 `extractAssetReferences` 使用固定正则 `/!\[[^\]]*\]\(\.\/assets\/([^)\s]+)\)/g` 匹配，无法覆盖用户手写或从其他工具粘贴进来的其它合法 Markdown/HTML 图片引用写法，导致这些引用对应的图片文件在目录迁移后失效。
severity: low
reason: `extractAssetReferences` 仅识别 `![alt](./assets/filename)` 这一种内联 Markdown 图片写法，无法识别 HTML `<img>`、引用式链接、带标题的链接，或不带 `./` 前缀的 `assets/filename` 路径，这些引用在“另存为”迁移时会被漏迁移。
status: done 2026-08-03
resolution: resolved by sweep bundle dw-save-as-asset-migration-hardening

### DW-54: 现有测试大量依赖对 `save_image_asset`/`copy_asset_file`/`convertFileSrc` 等 Tauri 命令的 mock，未覆盖真实文件系统写入、asset 协议作用域动态放宽、命名冲突退避、以及迁移失败等路径的端到端行为。

origin: migrated from legacy ledger ("## DW-46"), 2026-08-02
location: `e2e/story-7-2.spec.ts`、`e2e/fixtures.ts` 中对粘贴图片相关命令均通过 `window.__TAURI_MOCK__` 注入返回值模拟，未驱动真实 Tauri 后端往返；这些集成层面的行为目前仅由 `src-tauri/src/doc.rs` 内的 Rust 单元测试局部覆盖，缺少跨前后端的真实闭环验证。
severity: low
reason: 现有测试大量依赖对 `save_image_asset`/`copy_asset_file`/`convertFileSrc` 等 Tauri 命令的 mock，未覆盖真实文件系统写入、asset 协议作用域动态放宽、命名冲突退避、以及迁移失败等路径的端到端行为。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-clipboard-paste-backend-test-coverage

### DW-55: 剪贴板粘贴图片写盘为异步操作，`SourceEditor.insertText` 在后端保存返回后才读取当前选区来定位插入点，若用户在写盘期间继续输入会导致图片 Markdown 链接插入到错误的光标位置。

origin: migrated from legacy ledger ("## DW-47"), 2026-08-02
location: `src/components/SourceEditor.vue` 的 `emitClipboardImage`/`insertText` 只在 `invoke('save_image_asset', ...)` resolve 之后调用 `view.state.selection.main` 取当前选区作为插入位置，未在粘贴发生的瞬间捕获选区、也未通过编辑器的变更描述（change mapping）把该位置映射穿过写盘期间发生的中间编辑；修复需要引入位置映射逻辑，非本轮可安全自动完成的最小改动，故记录以待后续统一处理。
severity: low
reason: 剪贴板粘贴图片写盘为异步操作，`SourceEditor.insertText` 在后端保存返回后才读取当前选区来定位插入点，若用户在写盘期间继续输入会导致图片 Markdown 链接插入到错误的光标位置。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-clipboard-paste-editor-robustness

### DW-13: Follow-up review still recommended for 7-2-clipboard-image-paste-and-local-storage after the damping cap was spent
origin: review-budget-followup
location: n/a
source_spec: `7-2-clipboard-image-paste-and-local-storage.md`
severity: low
reason: The follow-up-review damping cap (limits.max_followup_reviews = 1) was spent with the story finalized (status: done, verify green) while the review pass still recommended an independent follow-up. The work was committed by bmad-loop run 20260801-121843-460e; this entry preserves the lingering recommendation for a deliberate later review.
status: done 2026-08-02
resolution: already resolved: _bmad-output/implementation-artifacts/7-2-clipboard-image-paste-and-local-storage.md lines 42-97 record two completed follow-up review passes on 2026-08-01 (Review pass follow-up, Review pass follow-up 2), fulfilling the deferred recommendation.
### DW-56: HTML 导出复用 `save_document_as` 命令写入导出文件，该命令写入成功后会顺带放宽导出目标目录的 `asset://` 协议可访问范围，而导出的独立 HTML 文件本身并不依赖该协议渲染图片，属于非预期的权限面扩大副作用。

origin: migrated from legacy ledger ("## DW-50"), 2026-08-02
location: `src-tauri/src/commands/doc.rs` 的 `save_document_as` 在写入成功后无条件调用 `app_handle.asset_protocol_scope().allow_directory(parent, true)`；`handleExportHtml()`（`src/App.vue`）为写出导出的 HTML 复用了这一命令，导致用户选择的任意导出目录都会被动加入 asset 协议白名单，即使该目录内没有、也不需要通过 `asset://` 访问的图片资源，扩大了运行时文件访问面且未在 AC 中被要求。
severity: low
reason: HTML 导出复用 `save_document_as` 命令写入导出文件，该命令写入成功后会顺带放宽导出目标目录的 `asset://` 协议可访问范围，而导出的独立 HTML 文件本身并不依赖该协议渲染图片，属于非预期的权限面扩大副作用。
status: done 2026-08-04
resolution: already resolved: src/App.vue:419 now invokes write_export_file (not save_document_as) for HTML export, and write_export_file_impl in src-tauri/src/commands/doc.rs:222-242 never calls asset_protocol_scope().allow_directory(), unlike save_document_as_impl at doc.rs:244-265 which does; resolved by story 13-2, commit 7f2a0fe.

### DW-14: PDF 导出（Story 8.2）仅实现 macOS 原生渲染，Windows/Linux 未实现

origin: dev of 8-2-export-pdf-with-exact-styles, 2026-08-01
location: src-tauri/src/commands/pdf_export.rs
severity: medium
reason: "Export as PDF..." 的原生 PDF 生成通过 macOS 专属的 WKWebView `createPDFWithConfiguration:completionHandler:` + `loadFileURL:allowingReadAccessToURL:` 实现，并在本沙盒环境中通过独立示例程序实测生成了有效 PDF（含真实渲染的表格/代码块内容）。Windows（WebView2 `PrintToPdf`）与 Linux（webkit2gtk）分别需要不同的原生 API，且本沙盒仅安装了 `aarch64-apple-darwin` target，无法交叉编译或运行验证，因此这两个平台当前直接返回 `ERR_PDF_EXPORT_UNSUPPORTED_PLATFORM: 当前平台暂不支持 PDF 导出`。这是工程能力缺口（而非需要人工操作的外部依赖），应作为独立故事补齐 Windows/Linux 原生 PDF 渲染，并在对应平台上实际构建验证后再关闭。
status: done 2026-08-04
resolution: resolved by implementing export_pdf_windows (WebView2) and export_pdf_linux (webkit2gtk) in src-tauri/src/commands/pdf_export.rs, updating pdf_export_supported() to enable probes on all desktop platforms, and adding target dependencies to Cargo.toml.
decision: 2026-08-02 Scope a new story for Windows/Linux native PDF export — Implement WebView2 PrintToPdf for Windows and a webkit2gtk print-to-file path for Linux behind the existing export_pdf command, to be written and verified on real Windows/Linux build environments outside this sandbox (not achievable as an automated bundle here).

### DW-15: PDF 渲染在 `on_page_load` Finished 事件后立即调用 `createPDFWithConfiguration`，未额外等待布局稳定

origin: review (Blind Hunter) of 8-2-export-pdf-with-exact-styles, 2026-08-01
location: src-tauri/src/commands/pdf_export.rs (export_pdf_macos)
severity: low
reason: WKWebView 的 `Finished` 事件在文档与资源加载完成后触发，本轮针对含标题/表格/代码块的示例文档做了两次真实 PDF 生成验证，输出内容正确、字体真实渲染，未观察到布局未稳定的问题。但对更复杂/大型文档（如包含大量内联 base64 图片或深层嵌套内容触发额外异步重排的场景）是否总能在该事件后立即达到最终稳定布局，本轮未做压力测试验证，理论上仍存在极端情况下过早截图的风险，故记录以待后续更充分的真实场景测试。
status: done 2026-08-03
resolution: resolved by sweep bundle dw-pdf-export-layout-and-test-coverage

### DW-16: Story 8.2 的 e2e 测试仅覆盖前端到 `export_pdf` 命令调用边界，未覆盖失败/超时/取消/不支持平台等分支，也未在真实打包应用中通过原生 WebKit 路径验证

origin: review (Blind Hunter) of 8-2-export-pdf-with-exact-styles, 2026-08-01
location: e2e/story-8-2.spec.ts; src-tauri/src/commands/pdf_export.rs
severity: medium
reason: 与仓库中其他 story（如 8-1）一致，`e2e/story-8-2.spec.ts` 通过 mock `window.__TAURI_MOCK__.invoke` 来验证前端到 IPC 边界的行为，无法在 Playwright 浏览器环境中驱动真实的 Rust/WKWebView 原生渲染路径，也未新增覆盖 `export_pdf` 失败、`ERR_PDF_EXPORT_LOAD_TIMEOUT`/`ERR_PDF_EXPORT_RENDER_TIMEOUT`、用户取消、以及非 macOS 平台快速失败等分支的测试用例。本轮开发通过一次性独立 `cargo run --example` 冒烟测试脚本手动验证了成功路径的真实原生渲染（生成含真实字体的有效 PDF），但失败/超时/取消分支仍只有代码走查、未经自动化或人工验证，建议后续设计专门的原生集成测试或桌面自动化测试来补齐。
status: done 2026-08-03
resolution: resolved by sweep bundle dw-pdf-export-layout-and-test-coverage

### DW-17: 内联失败的本地图片在导出目录与文档目录不同时会引用错误的相对路径

origin: review (Blind Hunter / Edge Case Hunter) of 8-2-export-pdf-with-exact-styles, 2026-08-01
location: src/lib/export-html.ts (exportSelfContainedHtml); src-tauri/src/commands/pdf_export.rs (dispatch_load_file_url)
severity: high
reason: 当本地图片因体积超过 10MB（`LOCAL_IMAGE_EMBED_LIMIT_BYTES`）或路径无法解析而未被内嵌为 base64 时，`exportSelfContainedHtml` 会保留原始相对 `src` 并仅附加一条警告（`src/lib/export-html.ts` 约第 268-278 行）。无论是 HTML 导出（`save_document_as` 写入用户选择的任意目标目录）还是 PDF 导出（`pdf_export.rs` 将自包含 HTML 写入以导出目标路径的父目录为基准的临时文件），后续相对路径解析都以导出目标目录、而非原始文档所在目录（`documentBaseDir`）为基准，一旦两者不同，这些未内嵌的图片在导出产物中会直接失效/无法显示。该缺口源自 8-1 引入的 `exportSelfContainedHtml`/`documentBaseDir` 设计，并非 8-2 新增，但本轮针对 PDF 导出 diff 的评审重新验证并确认其依然存在，故记录以待后续统一修复（例如导出前将超限图片也内嵌，或在导出产物中改写为绝对路径/文档目录相对路径）。
status: done 2026-08-04
resolution: resolved by updating exportSelfContainedHtml in src/lib/export-html.ts to convert unembeddable local image paths to absolute file:// URLs derived from documentBaseDir, and verified by E2E test in e2e/story-8-1.spec.ts.
decision: 2026-08-02 Rewrite unembeddable image src to absolute paths (or copy files alongside export) at export time — In exportSelfContainedHtml, when a local image can't be embedded as base64, rewrite its src to an absolute path derived from documentBaseDir, or copy the referenced file into the export target directory next to the output and rewrite src to the new relative path, for both the HTML export path and the temporary HTML written by pdf_export.rs, so the reference resolves correctly regardless of where the export lands.

### DW-57: Confluence 配置允许保存空的 Base URL / 用户名 / Space Key

origin: migrated from legacy ledger ("## DW-18"), 2026-08-02
location: src/components/SettingsModal.vue (onConfirmConfluence); src-tauri/src/commands/config.rs (set_confluence_config)
severity: medium
reason: `set_confluence_config` 仅对 Space Key / Parent Page ID 做格式校验，`onConfirmConfluence` 未强制要求 Base URL / 用户名 / Space Key 非空即可提示"保存成功"，可能让用户误以为已配置完整可用的 Confluence 连接。规格（AC1/AC5）未明确要求必填校验，故本轮未实现，建议后续补充必填字段校验或保存前的完整性提示。
status: done 2026-08-04
resolution: resolved by Story 11.1: added frontend & backend mandatory field validation for Base URL, Username, and Space Key.

### DW-58: Confluence 连接测试对任意 2xx 响应即判定成功，未校验响应内容类型/结构

origin: migrated from legacy ledger ("## DW-19"), 2026-08-02
location: src-tauri/src/commands/config.rs (build_confluence_test_result)
severity: low
reason: 若网络存在 SSO/代理拦截并返回 2xx 状态码的 HTML 登录页而非真实 Confluence API JSON，当前实现会误判为连接成功。建议后续增加对响应 Content-Type 或 JSON 结构（如 `key`/`name` 字段）的校验。
status: done 2026-08-04
resolution: already resolved: src-tauri/src/commands/config.rs:554-593 build_confluence_test_result now requires JSON parsing to succeed and a matching key field, rejecting 2xx HTML/non-JSON responses, with 11 unit tests at lines 665-782; resolved by story 11.2, commit 7d4c061.

### DW-59: Confluence 设置弹窗缺少完整无障碍 Tab 模式（aria-controls / tabpanel / 键盘左右切换）

origin: migrated from legacy ledger ("## DW-20"), 2026-08-02
location: src/components/SettingsModal.vue (tab-bar)
severity: low
reason: 新增的“常规/Confluence”标签使用了 role="tab"，但未补充 aria-controls、role="tabpanel" 关联及方向键切换焦点等完整 WAI-ARIA Tabs 模式，属于无障碍体验的持续改进项，不影响核心功能。
status: done 2026-08-04
resolution: already resolved: src/components/SettingsModal.vue:500-536 implements full WAI-ARIA tabs (role=tablist/tab/tabpanel, aria-selected, aria-controls, roving tabindex) with arrow-key navigation in onTabKeydown() at lines 255-286; resolved by story 11-3, commit 810a8c2.

### DW-60: 设置弹窗异步加载 Confluence 配置存在竞态：加载完成前用户开始编辑可能被静默覆盖

origin: migrated from legacy ledger ("## DW-21"), 2026-08-02
location: src/components/SettingsModal.vue (loadConfluenceSettings)
severity: low
reason: `loadConfluenceSettings` 异步返回后会直接覆盖表单字段；若用户在极短时间窗口内（网络/IPC 延迟较大时）已开始输入，理论上存在被静默覆盖的竞态风险。当前 Tauri IPC 调用在实际环境中通常极快，实测未触发，属于理论边界场景，记录以待后续增加"脏表单"保护。
status: done 2026-08-04
resolution: already resolved: src/components/SettingsModal.vue:47-48,64-72 add a confluenceFormDirty guard with a flush:'sync' watcher; loadConfluenceSettings() at lines 205-211 checks !confluenceFormDirty.value before applying loaded config; resolved by story 11.2, commit 7d4c061.

### DW-61: 修改 Confluence Base URL/用户名但不重新输入 Token 时会静默复用旧的全局 Token，且无提示。

origin: migrated from legacy ledger ("## DW-51"), 2026-08-02
location: `onConfirmConfluence`（`SettingsModal.vue:208-252`）在 `set_confluence_config` 成功后仅在 `tokenInput` 非空时才调用 `set_confluence_token`；Token 通过固定的 `Entry::new(CONFLUENCE_TOKEN_SERVICE, CONFLUENCE_TOKEN_ACCOUNT)`（`commands/config.rs:8-9,332-334`）全局存取，与 Base URL/Space Key 无绑定关系。用户切换服务器地址但留空 Token 字段时，保存会成功且不给出任何"仍将使用旧凭据"的提示，可能导致后续测试连接/发布使用错误账号凭据却难以察觉。
severity: low
reason: 修改 Confluence Base URL/用户名但不重新输入 Token 时会静默复用旧的全局 Token，且无提示。
status: done 2026-08-04
resolution: resolved by Story 11.1: added isCredentialsServerChanged computed notice banner warning users when Base URL/Username is modified while reusing stored Token.

### DW-62: 设置弹窗关闭后 Confluence 表单字段未清空，短暂重开或异步加载失败时可能残留上一次的过期显示值。

origin: migrated from legacy ledger ("## DW-52"), 2026-08-02
location: `watch(() => props.isOpen, ...)`（`SettingsModal.vue:73-88`）在 `open` 分支才调用 `resetConfluenceMessages()`/`loadConfluenceSettings()`，关闭分支未清空 `confluenceForm`；若下一次打开时 `loadConfluenceSettings` 尚未返回或失败，用户会短暂看到上一次会话遗留的字段值。
severity: low
reason: 设置弹窗关闭后 Confluence 表单字段未清空，短暂重开或异步加载失败时可能残留上一次的过期显示值。
status: done 2026-08-04
resolution: resolved by Story 11.1: added form reset in resetConfluenceMessages and watch(isOpen) false branch to clear draft values.

### DW-63: 点击"测试连接"因格式校验失败而提前返回时，上一次遗留的 md2cf 检测状态消息不会被清除，与当前错误提示同时展示造成误导。

origin: migrated from legacy ledger ("## DW-53"), 2026-08-02
location: `onTestConnection`（`SettingsModal.vue:273-281`）在 `spaceKeyError`/`parentPageIdError` 校验失败时提前 `return`，而 `resetConfluenceFeedback`（`SettingsModal.vue:328-333`）不重置 `md2cfMessage`/`md2cfInstalled`，导致界面同时显示"请先修正格式错误"与陈旧的 md2cf 检测结果。
severity: low
reason: 点击"测试连接"因格式校验失败而提前返回时，上一次遗留的 md2cf 检测状态消息不会被清除，与当前错误提示同时展示造成误导。
status: done 2026-08-04
resolution: already resolved: src/components/SettingsModal.vue:477-484 resetConfluenceFeedback() now clears md2cfMessage/md2cfInstalled and is called at the start of onTestConnection() (line 422) before validation-failure early returns; resolved by story 11.2, commit 7d4c061.

### DW-64: `test_confluence_connection` 仅对 Base URL 做去空格与去除末尾斜杠处理，未做格式校验或归一化，粘贴错误的 Confluence 页面 URL 或带错误 context path 的地址会导致请求地址拼接错误、报错信息不明确。

origin: migrated from legacy ledger ("## DW-54"), 2026-08-02
location: `commands/config.rs:251,283`：`base_url` 仅经 `trim()`/`trim_end_matches('/')`，随后直接拼接为 `{base_url}/rest/api/space/{space_key}`；未校验协议、路径或域名合法性，异常输入只会得到通用网络错误而非明确的地址格式提示。
severity: low
reason: `test_confluence_connection` 仅对 Base URL 做去空格与去除末尾斜杠处理，未做格式校验或归一化，粘贴错误的 Confluence 页面 URL 或带错误 context path 的地址会导致请求地址拼接错误、报错信息不明确。
status: done 2026-08-04
resolution: resolved by Story 11.1: added is_valid_confluence_base_url validator in Rust backend and URL scheme/host validation in SettingsModal.vue.

### DW-65: `check_md2cf_installed` 调用外部 `md2cf --version` 时未设置超时，若该二进制异常挂起，测试连接按钮会无限期等待。

origin: migrated from legacy ledger ("## DW-55"), 2026-08-02
location: `commands/config.rs:207-244`：`Command::new("md2cf").arg("--version").output()` 是同步阻塞调用且无超时控制；若系统 PATH 中的 `md2cf` 因损坏或异常而挂起，前端"测试连接"流程会一直等待其返回而无法给出反馈。
severity: low
reason: `check_md2cf_installed` 调用外部 `md2cf --version` 时未设置超时，若该二进制异常挂起，测试连接按钮会无限期等待。
status: done 2026-08-04
resolution: already resolved: src-tauri/src/commands/config.rs:328-331 check_md2cf_installed now calls run_command_with_timeout(cmd, MD2CF_CHECK_TIMEOUT) instead of a blocking .output() call, with timeout-aware result mapping; resolved by story 11.2, commit 7d4c061.

### DW-66: `story-9-1.spec.ts` 完全 mock 了后端 Tauri 命令，对 Confluence 相关 Rust 逻辑（keyring 读写、请求体拼接、各类失败分支的错误码）缺乏真实的回归测试覆盖。

origin: migrated from legacy ledger ("## DW-56"), 2026-08-02
location: `e2e/story-9-1.spec.ts` 与 `e2e/utils/tauri-mock.ts` 中所有 `set_confluence_config`/`set_confluence_token`/`test_confluence_connection` 等命令均由前端 mock 直接返回预设结果，`src-tauri/src/commands/config.rs` 中新增的 keyring 存取、HTTP 请求构造与错误分类逻辑没有对应的 Rust 单元测试或集成测试验证；该 mock-everything 模式与项目内既有 e2e 用例一致（非本 story 独有），但使得本 story 新增的后端分支实际未被自动化验证。
severity: low
reason: `story-9-1.spec.ts` 完全 mock 了后端 Tauri 命令，对 Confluence 相关 Rust 逻辑（keyring 读写、请求体拼接、各类失败分支的错误码）缺乏真实的回归测试覆盖。
status: done 2026-08-04
resolution: already resolved: src-tauri/src/commands/config.rs:868-1155 adds a backend_integration_tests module with 5 real network tests via a mock HTTP server plus a keyring round-trip test; resolved by story 11-3, commit 810a8c2 (e2e mocking for the frontend remains unchanged by design).

### DW-67: `MenuBar.vue` 中 `.menu-item`/`.submenu-trigger` 已有 `aria-haspopup="true"`，但均缺少 `aria-expanded` 状态绑定，屏幕阅读器无法感知这些弹出菜单当前是展开还是收起。

origin: migrated from legacy ledger ("review of spec-dw-37-38-menu-keyboard-accessibility.md"), 2026-08-02
location: src/components/MenuBar.vue (`.menu-item`/`.submenu-trigger`)
severity: low
reason: 审查 DW-37/DW-38 键盘可达性修复的 diff 时确认该缺口在改动前后均存在（`aria-haspopup` 早已存在于原始代码），本次改动只新增了 tabindex/keydown 使元素可达，并未引入或修复 `aria-expanded` 状态，属于本次改动之外的既有无障碍语义缺口。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-menu-aria-semantics

### DW-68: `MenuBar.vue` 中 `.menu-dropdown`（顶层菜单容器）从未声明 `role="menu"`，而其内部 `.menu-row` 子项却使用 `role="menuitem"`，与 `.submenu-dropdown`（已正确声明 `role="menu"`）不一致，构成无障碍角色树的结构性不一致。

origin: migrated from legacy ledger ("review of spec-dw-37-38-menu-keyboard-accessibility.md"), 2026-08-02
location: src/components/MenuBar.vue (`.menu-dropdown` 顶层容器 vs `.submenu-dropdown`)
severity: low
reason: 对比 `.submenu-dropdown` 已有 `role="menu"` 而 `.menu-dropdown` 从未添加该属性（本次改动未涉及该属性），说明这是既有实现遗留的不一致，非本次 DW-37/DW-38 修复引入。
status: done 2026-08-02
resolution: resolved by sweep bundle dw-menu-aria-semantics

### DW-69: src/styles/preview-export.css hard-codes overlay colors instead of design tokens

origin: migrated from legacy ledger ("review of spec-dw-31-33-theme-visual-token-consistency-2.md"), 2026-08-02
location: src/styles/preview-export.css
reason: Still hard-codes the pre-existing `rgba(255, 255, 255, 0.05)`/`rgba(255, 255, 255, 0.02)` table header/zebra-stripe overlay literals instead of the new `--color-overlay-header`/`--color-overlay-zebra` tokens, so HTML exports of tables will not match the live `PreviewPane.vue` rendering once a light theme is active. Confirmed via `grep -n "rgba(255" src/styles/preview-export.css`; this file was explicitly out of scope for the DW-31/32/33 spec (only `PreviewPane.vue`/`SlashMenu.vue`/`SettingsModal.vue`/`src/lib/preview.ts`/`src/styles/app.css` were in scope) and predates this change.
status: done 2026-08-04
resolution: already resolved: src/styles/preview-export.css:178,184 now reference var(--color-overlay-header)/var(--color-overlay-zebra) instead of the hard-coded rgba(255,255,255,0.05)/rgba(255,255,255,0.02) literals; resolved by story 13-1, commit c44a6ed.

### DW-70: SettingsModal.vue hard-codes success-state text color instead of --color-success token

origin: migrated from legacy ledger ("review of spec-dw-31-33-theme-visual-token-consistency-2.md"), 2026-08-02
location: src/components/SettingsModal.vue:696
reason: Hard-codes `color: #3fb950` instead of referencing the `--color-success` token, so it will not adopt the new per-theme light-mode success color values added by this story. Confirmed via `grep -n "#3fb950" src/components/SettingsModal.vue`; this hardcode predates this change and was outside the DW-31/32/33 task list.
status: done 2026-08-04
resolution: already resolved: src/components/SettingsModal.vue:875 .success-text now uses color: var(--color-success) instead of the hard-coded #3fb950; resolved by story 13-1, commit c44a6ed.

### DW-71: PublishConfluenceModal.vue hard-codes confirm-button color and undefined --color-danger fallback

origin: migrated from legacy ledger ("review of spec-dw-31-33-theme-visual-token-consistency-2.md"), 2026-08-02
location: src/components/PublishConfluenceModal.vue:263,272
reason: Hard-codes a confirm-button text color (`color: white`) and references an undefined `--color-danger` fallback variable instead of the token-system `--color-error`, so it neither adopts `--color-accent-foreground` nor the new per-theme error colors. Confirmed via `grep -n "color: white\|color-danger" src/components/PublishConfluenceModal.vue`; this file was explicitly excluded from the DW-31/32/33 scope and the hardcode predates this change.
status: done 2026-08-04
resolution: already resolved: src/components/PublishConfluenceModal.vue:263,272 now use var(--color-accent-foreground) and var(--color-error) respectively; grep for "color: white"/"color-danger" returns no matches; resolved by story 13-1, commit c44a6ed.

### DW-72: MenuBar.vue role="menu" containers lack aria-label tying them to their trigger text

origin: migrated from legacy ledger ("review of spec-dw-67-68-menu-aria-semantics.md"), 2026-08-02
location: src/components/MenuBar.vue
reason: The two `.menu-dropdown` containers (and the pre-existing `.submenu-dropdown`) now all declare `role="menu"` but none has an `aria-label`/`aria-labelledby` tying it back to its trigger text ("Markdown Cat" / "文件" / "Theme"), so a screen reader announces "menu" with no distinguishing name when moving between them. Confirmed via `grep -n 'role="menu"' src/components/MenuBar.vue`; DW-67/68's scope was explicitly limited to `aria-expanded` and `role="menu"` parity only.
status: done 2026-08-04
resolution: already resolved: src/components/MenuBar.vue:177,201,256 all three role="menu" containers now carry aria-label ("Markdown Cat"/"文件"/"Theme"); resolved by story 13-2, commit 7f2a0fe.

### DW-73: Async image-paste insert can target the wrong document if the user switches files mid-save

origin: migrated from legacy ledger ("review of spec-dw-47-49-55-clipboard-paste-editor-robustness.md"), 2026-08-02
location: src/App.vue (handleClipboardImagePaste)
reason: `handleClipboardImagePaste` resolves the pending `save_image_asset` invocation and calls `sourceEditorRef.value?.insertText(...)` against whatever document is currently open, so if the user switches to a different file before the async save completes, the image markdown reference is inserted into the wrong (newly opened) document instead of the one the paste originated from. This asynchronous save-then-insert race predates this story and is not touched by its changes; independently re-surfaced twice by different review passes over the same spec.
status: done 2026-08-03
resolution: resolved by sweep bundle dw-clipboard-paste-document-identity-guard
seen-again: review of spec-dw-47-49-55-clipboard-paste-editor-robustness.md (re-confirmed still unresolved by a second reviewer)

### DW-74: positionTokenSeq/trackedPastePositions in SourceEditor.vue not namespaced by document/editor-instance identity

origin: migrated from legacy ledger ("review of spec-dw-47-49-55-clipboard-paste-editor-robustness.md"), 2026-08-02
location: src/components/SourceEditor.vue
reason: `positionTokenSeq`/`trackedPastePositions` are scoped per component instance with no namespacing by document or editor-instance identity, so if the editor is unmounted and remounted (or the document context otherwise resets) while a paste's async `save_image_asset` call is still pending, the stale token number could coincide with a freshly issued token in the new instance and cause the pending insert to target an unrelated position. New mechanism introduced by this story (position-token tracking), a plausible but narrow lifecycle edge case not exercised by any current test.
status: done 2026-08-03
resolution: resolved by sweep bundle dw-clipboard-paste-document-identity-guard

### DW-75: handleClipboardImagePaste reports save success without checking sourceEditorRef availability

origin: migrated from legacy ledger ("review of spec-dw-47-49-55-clipboard-paste-editor-robustness.md"), 2026-08-02
location: src/App.vue (handleClipboardImagePaste)
reason: The success branch sets `saveStatus.value = 'success'` and a success message unconditionally after `sourceEditorRef.value?.insertText(...)`, without checking whether `sourceEditorRef.value` was actually available/truthy, so if the editor ref is unavailable at resolve time the file is still written to disk but no Markdown reference is inserted while the UI still reports success. This optional-chaining-without-verification pattern predates this story and is not a new regression.
status: done 2026-08-03
resolution: resolved by sweep bundle dw-clipboard-paste-document-identity-guard

### DW-76: Failed last-opened-file restore during `onMounted` does not clear `lastOpenedFile` from config, so the app retries loading the same broken path on every subsequent launch.

origin: migrated from legacy ledger ("spec-dw-50-restore-current-file-path.md"), 2026-08-03
location: src/App.vue (onMounted)
reason: When `read_external_document` returns `{ ok: false }` during last-opened-file restore, onMounted falls through to `get_blank_document` but never updates config to clear `lastOpenedFile`, so the stale broken path persists and is retried on every subsequent launch.
status: done 2026-08-04
resolution: already resolved: src/App.vue:1329-1335 calls invoke('update_last_opened_file',{filePath:null}) when resolveStartupRestoreOutcome (src/lib/session-restore.ts:36-39) reports shouldClearStaleConfig; resolved by story 12-1, commit e7fe7c2.

### DW-77: If `read_external_document` throws during the `onMounted` last-opened-file restore, the surrounding `try` aborts the rest of `onMounted`, skipping fallback and setup steps.

origin: migrated from legacy ledger ("spec-dw-50-restore-current-file-path.md"), 2026-08-03
location: src/App.vue (onMounted)
reason: If `read_external_document` throws (rather than resolving with `{ ok: false }`) during the last-opened-file restore, the surrounding try/catch aborts the rest of onMounted, skipping the blank-document fallback, `currentSavePath` fallback, and `resetWidths()`/resize-listener setup.
status: done 2026-08-04
resolution: already resolved: src/App.vue:1305-1311 wraps read_external_document in try/catch so a thrown error still allows outcome resolution and the fallback/resetWidths()/resize-listener setup at lines 1339-1364 to run; resolved by story 12-1.

### DW-78: No regression test exists for "restore last-opened file, then paste image / save / export"

origin: migrated from legacy ledger ("spec-dw-50-restore-current-file-path.md"), 2026-08-03
location: src/App.vue (documentBaseDir / onMounted restore path)
reason: No regression test covers "restore last-opened file, then paste image / save / export", even though `documentBaseDir` (which resolves from the restored `currentFilePath`) drives paste-image save location, autosave/save-as target resolution, and HTML/PDF/Confluence export asset resolution; a future refactor could silently regress this.
status: resolved
resolution: resolved for the restore → paste-image → autosave → **HTML export** chain by `e2e/story-12-3.spec.ts`, enabled by the opt-in `App.vue` startup-restore test hook `__TAURI_MOCK_ENABLE_STARTUP_RESTORE__`. Save-As migration, PDF export, and Confluence publish asset-resolution coverage remain untested — tracked separately as DW-83, DW-84, and DW-85.

### DW-83: No regression test covers Save-As migration of restored/pasted assets driven by documentBaseDir

origin: review finding from spec-12-3-session-restore-and-asset-regression-tests.md, 2026-08-04
location: src/App.vue (handleSaveAsFile / documentBaseDir-driven asset migration)
reason: DW-78's restore→paste→autosave→export regression test (story-12-3.spec.ts) does not exercise "Save As" after restoring a last-opened file and pasting an image; `documentBaseDir`-driven asset migration (moving sibling images to the new save location and rewriting markdown references) remains untested for the restored-session case and could silently regress.
status: open

### DW-84: No regression test covers PDF export image resolution driven by documentBaseDir for a restored session

origin: review finding from spec-12-3-session-restore-and-asset-regression-tests.md, 2026-08-04
location: src/App.vue (derivePdfExportDefaultPath / PDF export asset resolution)
reason: DW-78's regression test (story-12-3.spec.ts) only covers HTML export; PDF export uses a separate export path that also depends on `documentBaseDir` derived from the restored `currentFilePath`, and image resolution during PDF export for a restored session remains untested.
status: open

### DW-85: No regression test covers Confluence publish local-image resolution driven by documentBaseDir for a restored session

origin: review finding from spec-12-3-session-restore-and-asset-regression-tests.md, 2026-08-04
location: src/App.vue (Confluence publish flow / local image resolution)
reason: DW-78's regression test (story-12-3.spec.ts) does not cover Confluence publish; local image resolution during publish also depends on `documentBaseDir` derived from the restored `currentFilePath`, and this path remains untested for a restored session.
status: open

### DW-79: Narrow startup race — opening a different document while last-opened-file restore is still pending can overwrite it with stale restored data

origin: migrated from legacy ledger ("spec-dw-50-restore-current-file-path.md"), 2026-08-03
location: src/App.vue (onMounted)
reason: If a user opens a different document via the file-open dialog while the last-opened-file restore's `read_external_document` await is still pending, the restore's resolved `filename`/`content`/`currentFilePath` values can overwrite the user's newly opened document with stale restored data once the await resolves.
status: done 2026-08-04
resolution: already resolved: src/App.vue:1302,1314 increments and re-checks openRequestToken via isLatestOpenRequest (src/lib/session-restore.ts:42-44) before applying restored state at lines 1316/1325/1329; resolved by story 12-1.

### DW-80: extractSiblingImageReferences/replaceSiblingImageReferenceFilename were never extended to the HTML `<img>`, reference-style, or titled-link forms extractAssetReferences now covers

origin: migrated from legacy ledger ("spec-save-as-asset-migration-hardening.md"), 2026-08-03
location: src/lib/image-assets.ts (extractSiblingImageReferences / replaceSiblingImageReferenceFilename)
reason: extractSiblingImageReferences/replaceSiblingImageReferenceFilename still only recognize plain inline `![alt](./filename)` sibling-image links and were never extended to the HTML `<img>`, reference-style, or titled-link forms that extractAssetReferences now covers, so a sibling image referenced via any of those richer syntaxes loses migration/rename coverage after "Save As" relocates an already-saved document.
status: done 2026-08-04
resolution: already resolved: src/lib/image-assets.ts:212-217 extractSiblingImageReferences now matches inline, reference-style, and HTML <img> forms, with matching replace patterns at lines 279-311; resolved by story 12-2, commit a8b974e.

### DW-81: extractAssetReferences treats a query-string/fragment suffix as part of the literal asset filename, so migration silently fails to find the real file

origin: migrated from legacy ledger ("spec-save-as-asset-migration-hardening.md"), 2026-08-03
location: src/lib/image-assets.ts (extractAssetReferences)
reason: extractAssetReferences treats a query-string/fragment suffix (e.g. `./assets/pic.png?raw=1` or `./assets/pic.png#frag`) as part of the literal filename, so migration looks for a file named `pic.png?raw=1` on disk, never finds it, and silently reports the reference as skipped/failed instead of migrating the real underlying file.
status: done 2026-08-04
resolution: already resolved: src/lib/image-assets.ts:150-158 adds stripQueryAndFragment(), applied at lines 187 and 231 before decoding candidate filenames; resolved by story 12-2, commit a8b974e.

### DW-82: extractAssetReferences matches image references inside fenced code blocks, treating illustrative examples as real asset dependencies

origin: migrated from legacy ledger ("spec-save-as-asset-migration-hardening.md"), 2026-08-03
location: src/lib/image-assets.ts (extractAssetReferences)
reason: extractAssetReferences matches image references inside fenced code blocks (e.g. a documentation snippet showing `<img src="./assets/demo.png">`), so a purely illustrative/example reference is treated as a real asset dependency and triggers a spurious "not migrated" warning or unnecessary migration attempt during Save As.
status: done 2026-08-04
resolution: already resolved: src/lib/image-assets.ts:113-148 stripFencedCodeBlocks() is applied at lines 170 and 213 before pattern matching in both extraction functions; resolved by story 12-2, commit a8b974e.

### DW-86: `run_command_with_timeout` in `src-tauri/src/commands/config.rs` pipes the child's stdout/stderr but never drains them while polling `try_wait()`, ...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-11-2-confluence-network-and-process-resilience.md"), 2026-08-04
location: src-tauri/src/commands/config.rs (run_command_with_timeout)
reason: `run_command_with_timeout` in `src-tauri/src/commands/config.rs` pipes the child's stdout/stderr but never drains them while polling `try_wait()`, so a command whose output exceeds the OS pipe buffer before exiting would block on write and appear to hang until the timeout fires instead of exiting normally. Confirmed by independent review (Blind Hunter) reading the polling loop in `run_command_with_timeout`: `try_wait()` is called in a loop with no concurrent read of `child.stdout`/`child.stderr`, and output is only consumed via `wait_with_output()` after completion is detected. Low real-world likelihood for `md2cf --version`'s tiny output, but the helper is now general-purpose and could be reused for larger-output commands later.
status: done 2026-08-04
resolution: already resolved: src-tauri/src/commands/config.rs:275-278 spawns stdout_thread/stderr_thread that continuously drain the child's pipes via read_capped() while the main loop only polls try_wait(); the ledger's premise (pipes never drained) does not match the current implementation, which already handles this correctly.

### DW-87: On timeout, `run_command_with_timeout` only kills the immediate child process; if `md2cf` is a wrapper script that spawns further subprocesses, tho...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-11-2-confluence-network-and-process-resilience.md"), 2026-08-04
location: src-tauri/src/commands/config.rs (run_command_with_timeout)
reason: On timeout, `run_command_with_timeout` only kills the immediate child process; if `md2cf` is a wrapper script that spawns further subprocesses, those descendants are not reaped and can keep running after `check_md2cf_installed` has already returned a timeout result. Confirmed by independent review (Blind Hunter): `child.kill()` targets only the direct child PID with no process-group/tree termination, so any grandchild processes spawned by a wrapper `md2cf` binary would survive past the reported timeout.
status: done 2026-08-04
resolution: resolved by sweep bundle dw-md2cf-timeout-process-robustness

### DW-88: The `confluenceFormDirty` dirty-form guard in `SettingsModal.vue` depends on toggling `suppressConfluenceDirtyTracking` around synchronous field as...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-11-2-confluence-network-and-process-resilience.md"), 2026-08-04
location: src/components/SettingsModal.vue (confluenceFormDirty guard)
reason: The `confluenceFormDirty` dirty-form guard in `SettingsModal.vue` depends on toggling `suppressConfluenceDirtyTracking` around synchronous field assignments combined with a `flush: 'sync'` watcher; this pattern is correct today but fragile — any future refactor that moves the suppress-flag toggling out of a single synchronous block (e.g. splitting `applyConfluenceConfig` across an `await`) would silently defeat the guard with no test to catch the regression. Confirmed by independent review (Blind Hunter), and acknowledged directly in the implementation's own code comment describing the `flush: 'sync'` requirement. No existing or planned test asserts the guard still works if the suppress-flag toggling is split across a microtask boundary.
status: done 2026-08-04
resolution: resolved by sweep bundle dw-confluence-dirty-guard-test

### DW-89: On timeout, `run_command_with_timeout` in `src-tauri/src/commands/config.rs` discards any partial stdout/stderr the `md2cf` process produced before...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-11-2-confluence-network-and-process-resilience.md"), 2026-08-04
location: src-tauri/src/commands/config.rs (run_command_with_timeout)
reason: On timeout, `run_command_with_timeout` in `src-tauri/src/commands/config.rs` discards any partial stdout/stderr the `md2cf` process produced before being killed, so the user-facing message cannot distinguish "genuinely hung" from "was about to finish" — it always reports a generic timeout. Confirmed by independent review (Blind Hunter): the timeout branch calls `child.kill()` then `child.wait()` and never surfaces the drained stdout/stderr threads' partial buffers in the resulting message.
status: done 2026-08-04
resolution: resolved by sweep bundle dw-md2cf-timeout-process-robustness

### DW-90: The new `response.chunk()`-based streaming body read and 1 MiB cap in `test_confluence_connection`, and the `Completed`/`TimedOut`/`NotFound` resul...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-11-2-confluence-network-and-process-resilience.md"), 2026-08-04
location: src-tauri/src/commands/config.rs (test_confluence_connection, check_md2cf_installed)
reason: The new `response.chunk()`-based streaming body read and 1 MiB cap in `test_confluence_connection`, and the `Completed`/`TimedOut`/`NotFound` result-mapping in `check_md2cf_installed`, are only covered indirectly (via the pure `build_confluence_test_result` function and the generic `run_command_with_timeout` helper with unrelated test commands) — there is no integration test exercising the actual streaming loop against a real/mocked HTTP response, nor an end-to-end test of `check_md2cf_installed()` itself. Confirmed by independent review (both Blind Hunter and Edge Case Hunter): adding either would require a local mock HTTP server or a real/fake `md2cf` binary on PATH, which the current test suite has no infrastructure for.
status: done 2026-08-04
resolution: resolved by sweep bundle dw-md2cf-fake-binary-test

### DW-91: When the 1 MiB body cap is hit in `test_confluence_connection`, the function returns immediately without reading/discarding the remainder of the HT...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-11-2-confluence-network-and-process-resilience.md"), 2026-08-04
location: src-tauri/src/commands/config.rs (test_confluence_connection)
reason: When the 1 MiB body cap is hit in `test_confluence_connection`, the function returns immediately without reading/discarding the remainder of the HTTP response stream, which may prevent the underlying connection from being returned to reqwest's connection pool for reuse. Confirmed by independent review (Blind Hunter): the `oversized` branch calls `return` directly after `break`, with no drain of the remaining `response.chunk()` stream before the response value is dropped.
status: done 2026-08-04
resolution: resolved by sweep bundle dw-md2cf-timeout-process-robustness

### DW-92: If `child.kill()` in `run_command_with_timeout` fails for a reason other than "process already exited in the race window" (e.g. an OS-level permiss...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-11-2-confluence-network-and-process-resilience.md"), 2026-08-04
location: src-tauri/src/commands/config.rs (run_command_with_timeout)
reason: If `child.kill()` in `run_command_with_timeout` fails for a reason other than "process already exited in the race window" (e.g. an OS-level permission error), the subsequent `child.wait()` could theoretically block indefinitely if the process is actually still alive, defeating the intended timeout bound. Confirmed by independent review (Edge Case Hunter): the `Err(_kill_err)` branch unconditionally calls `child.wait()` with no secondary timeout guard. Considered very low real-world probability since the process is a direct child owned by the calling process, but not provably impossible on all platforms.
status: done 2026-08-04
resolution: resolved by sweep bundle dw-md2cf-timeout-process-robustness

### DW-93: The new Rust `keyring_entry_round_trips_without_touching_production_credential` integration test depends on a real OS credential-store backend bein...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-11-3-confluence-accessibility-and-integration-tests.md"), 2026-08-04
location: src-tauri/tests (keyring_entry_round_trips_without_touching_production_credential)
reason: The new Rust `keyring_entry_round_trips_without_touching_production_credential` integration test depends on a real OS credential-store backend being available and non-interactive, which is known to be flaky or unavailable on headless Linux CI runners (no Secret Service/libsecret daemon) unlike this sandboxed macOS environment where it was verified to work. Confirmed by independent review (Blind Hunter/Edge Case Hunter): the test uses the real `keyring` crate against the actual OS backend with no mock/fallback; this is an inherent, deliberately-accepted trade-off of testing real keyring behavior (documented in the story's Design Notes) rather than a code defect, but remains a portability risk worth tracking for CI environments beyond this sandbox.
status: open

### DW-94: The new backend integration tests cover `test_confluence_connection` with an explicitly-provided `api_token`, but never exercise the "no token prov...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-11-3-confluence-accessibility-and-integration-tests.md"), 2026-08-04
location: src-tauri/src/commands/config.rs (resolve_connection_token / test_confluence_connection)
reason: The new backend integration tests cover `test_confluence_connection` with an explicitly-provided `api_token`, but never exercise the "no token provided, fall back to the value already saved in the OS keyring" path (`resolve_connection_token` with `api_token: None`), leaving that specific integration seam still only covered indirectly. Confirmed by independent review (Blind Hunter): this coverage gap is real, but the current story's intent-contract explicitly forbids reading/writing/deleting the user's real production Confluence credential (`markdown-cat-confluence` service/account) to avoid clobbering a real saved token, and `resolve_connection_token`/`test_confluence_connection` are not refactored in this story to accept an injectable token source. Closing this gap safely would require either a follow-up story that adds a test-seam abstraction or an explicitly authorized exception to that safety constraint.
status: open
decision: 2026-08-05 Use a dedicated test-only keyring entry (not production) in CI — Reuse the distinctly-named test-only keyring service/account already used by DW-93's round-trip test to seed a token and verify resolve_connection_token falls back to it correctly, without touching the production 'markdown-cat-confluence' entry.

### DW-95: When the stale-vs-superseded startup restore path clears `lastOpenedFile` (`resolveStartupRestoreOutcome().shouldClearStaleConfig`) but a newer man...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-12-1-session-startup-restore-fault-tolerance.md"), 2026-08-04
location: src/App.vue (onMounted startup restore)
reason: When the stale-vs-superseded startup restore path clears `lastOpenedFile` (`resolveStartupRestoreOutcome().shouldClearStaleConfig`) but a newer manual open request has since started, the clear is skipped entirely (`isRestoreStillLatest` guard), so a genuinely broken `lastOpenedFile` path can survive into the next launch instead of being cleared immediately. Confirmed by independent review (Blind Hunter and Edge Case Hunter): `App.vue`'s `onMounted` only calls `update_last_opened_file({ filePath: null })` when `isRestoreStillLatest` is true, so a race where the user opens another file while the broken restore is still resolving leaves the bad path in config for one more launch cycle. Low impact — the next launch's restore attempt against the same broken path will still fail and clear it then — but not immediate self-healing.
status: open

### DW-96: When the startup last-opened-file restore fails or throws and the blank-document fallback silently takes over, no status-bar message informs the us...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-12-1-session-startup-restore-fault-tolerance.md"), 2026-08-04
location: src/App.vue (onMounted startup restore / get_blank_document fallback)
reason: When the startup last-opened-file restore fails or throws and the blank-document fallback silently takes over, no status-bar message informs the user that their previous file could not be restored; this messaging gap pre-dates this story's change (the prior code also fell through to `get_blank_document` without a user-facing explanation). Confirmed by independent review (Blind Hunter): `App.vue`'s `onMounted` restore-failure branch sets no `saveStatus`/`saveMessage`, and `get_blank_document`'s success branch does not set them either, so the blank fallback is visually indistinguishable from a fresh/empty startup even when it was actually caused by a broken `lastOpenedFile`. Not introduced by this story's diff; pre-existing behavior around this path.
status: open

### DW-97: `loadFileFromPath`'s catch block (for a thrown/rejected `read_external_document` invoke during a manual file open) still only `console.error`s the ...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-12-1-session-startup-restore-fault-tolerance.md"), 2026-08-04
location: src/App.vue (loadFileFromPath)
reason: `loadFileFromPath`'s catch block (for a thrown/rejected `read_external_document` invoke during a manual file open) still only `console.error`s the failure with no user-facing status-bar message, leaving the user with stale UI state and no visible indication the open attempt failed. Confirmed by independent review (Blind Hunter): the `catch (err: any) { console.error(...) }` block in `loadFileFromPath` is unchanged by this story's diff (only the request-token staleness check was added ahead of it) and was already silent on thrown errors before this change; not a regression introduced here.
status: open

### DW-98: `onFileDrop`'s fallback branch (used when a dropped `File` has no native `path`, so it reads content via `file.text()`) writes directly to `filenam...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-12-1-session-startup-restore-fault-tolerance.md"), 2026-08-04
location: src/App.vue (onFileDrop)
reason: `onFileDrop`'s fallback branch (used when a dropped `File` has no native `path`, so it reads content via `file.text()`) writes directly to `filename`/`content`/`activeDocumentId`/`saveStatus` without incrementing or checking `openRequestToken`, so it does not participate in this story's staleness-guard protocol and remains racy against a concurrently in-flight startup restore or another open. Confirmed by independent review (Blind Hunter): `src/App.vue`'s `onFileDrop` calls `loadFileFromPath` (token-guarded) only when `file.path` is available; the `else` branch performing `await file.text()` then assigning state directly has no equivalent guard. This race predates this story (no protection existed anywhere before this diff) and this story's scope/code map only covers `onMounted`, `loadFileFromPath`, and `handleOpenFile`.
status: open

### DW-99: The `openRequestToken` guard protects only the in-memory `currentFilePath`/`filename`/`content`/`saveStatus` writes; the separate `invoke('update_l...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-12-1-session-startup-restore-fault-tolerance.md"), 2026-08-04
location: src/App.vue (loadFileFromPath, onMounted — update_last_opened_file persistence)
reason: The `openRequestToken` guard protects only the in-memory `currentFilePath`/`filename`/`content`/`saveStatus` writes; the separate `invoke('update_last_opened_file', { filePath })` persistence call in `loadFileFromPath` (and the `filePath: null` clear call in `onMounted`) has no freshness re-check immediately before it fires, so two overlapping opens (or an overlapping open and a stale-config clear) can have their persistence calls resolve out of order, leaving the persisted `lastOpenedFile` config pointing at the wrong path even though in-memory UI state is correct. Confirmed by independent review (Edge Case Hunter, two related findings at `App.vue:841-843` and `App.vue:1386-1388`): the freshness check in each code path is taken once, before the persistence invoke, not re-validated right before it; the underlying persisted-config write already had no ordering protection before this story (baseline `loadFileFromPath` had the identical unguarded persist call), and the intent contract's race-guard requirement explicitly scopes only `currentFilePath`/`filename`/`content`/`saveStatus`, not the persisted `lastOpenedFile` config value.
status: open

### DW-100: Neither `replaceAssetReferenceFilename` nor `replaceSiblingImageReferenceFilename` skips fenced code blocks during rewrite, unlike the extraction f...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-12-2-markdown-asset-parser-edge-cases.md"), 2026-08-04
location: src/lib/image-assets.ts (replaceAssetReferenceFilename / replaceSiblingImageReferenceFilename)
reason: Neither `replaceAssetReferenceFilename` nor `replaceSiblingImageReferenceFilename` skips fenced code blocks during rewrite, unlike the extraction functions, so a filename coincidentally reused inside a documentation code example could be silently mutated whenever an unrelated real reference with the same filename is renamed. Confirmed by independent review (Blind Hunter): `stripFencedCodeBlocks` is only applied inside `extractAssetReferences`/`extractSiblingImageReferences`; the replace functions run their regexes against the raw, unstripped markdown, so any occurrence of the literal old filename anywhere in the document — including inside a ```` ``` ````/`~~~` fenced example — gets rewritten during a rename. Pre-existing characteristic of `replaceAssetReferenceFilename` for the `assets/` case (predates this story); newly inherited by the extended `replaceSiblingImageReferenceFilename`.
status: done 2026-08-04
resolution: resolved by sweep bundle dw-asset-replace-function-edge-cases

### DW-101: Inline (single-backtick) code spans, e.g. `` `![alt](./assets/pic.png)` ``, are still treated as live asset/sibling-image references by both extrac...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-12-2-markdown-asset-parser-edge-cases.md"), 2026-08-04
location: src/lib/image-assets.ts (extractAssetReferences / extractSiblingImageReferences)
reason: Inline (single-backtick) code spans, e.g. `` `![alt](./assets/pic.png)` ``, are still treated as live asset/sibling-image references by both extraction functions, so a prose example wrapped only in a code span (not a fenced block) can trigger a spurious migration/rename warning. Confirmed by independent review (Blind Hunter): `stripFencedCodeBlocks` only recognizes triple-backtick/tilde fenced blocks per this story's explicit scope ("Never implement a full CommonMark parser"); inline code spans are a distinct, unaddressed construct. Pre-existing behavior, not a regression introduced by this story's diff.
status: open

### DW-102: The reference-style pattern in both `extractAssetReferences` and (the newly extended) `extractSiblingImageReferences` matches any `[label]: ./path`...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-12-2-markdown-asset-parser-edge-cases.md"), 2026-08-04
location: src/lib/image-assets.ts (extractAssetReferences / extractSiblingImageReferences)
reason: The reference-style pattern in both `extractAssetReferences` and (the newly extended) `extractSiblingImageReferences` matches any `[label]: ./path` definition line, without confirming that `label` is actually used by an image (`![alt][label]`) reference anywhere in the document, so an unused or non-image link-reference definition pointing at a same-named file can be misclassified as an asset dependency. Confirmed by independent review (Blind Hunter): the reference-style regex has no cross-check against `![...][label]` usage elsewhere in the document. This is a pre-existing, intentional tradeoff already shipped in `extractAssetReferences` before this story (never flagged via a DW ticket); this story's spec explicitly directed mirroring that same pattern structure for the new sibling extractor, so the tradeoff is inherited by design, not introduced as a new defect.
status: open

### DW-103: CommonMark's angle-bracket link destination form (e.g. `![alt](<./assets/pic.png>)` or `![alt](<./pic.png>)`) is not recognized by either extractio...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-12-2-markdown-asset-parser-edge-cases.md"), 2026-08-04
location: src/lib/image-assets.ts (extractAssetReferences / extractSiblingImageReferences)
reason: CommonMark's angle-bracket link destination form (e.g. `![alt](<./assets/pic.png>)` or `![alt](<./pic.png>)`) is not recognized by either extraction function, so an asset or sibling image referenced only via that syntax is silently skipped during "Save As" migration. Confirmed by independent review (Blind Hunter): none of the regex patterns in `extractAssetReferences`/`extractSiblingImageReferences` account for a `<...>`-wrapped destination. Pre-existing gap (this destination form was never supported before this story); out of this story's explicit scope, which targeted only the HTML `<img>`, reference-style, query/fragment, and fenced-code-block issues enumerated by DW-80/81/82.
status: done 2026-08-04
resolution: resolved by sweep bundle dw-markdown-fence-linkdest-fixes

### DW-104: `replaceAssetReferenceFilename` and `replaceSiblingImageReferenceFilename` only probe the raw filename and its uppercase-hex `encodeURIComponent` v...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-12-2-markdown-asset-parser-edge-cases.md"), 2026-08-04
location: src/lib/image-assets.ts (replaceAssetReferenceFilename / replaceSiblingImageReferenceFilename)
reason: `replaceAssetReferenceFilename` and `replaceSiblingImageReferenceFilename` only probe the raw filename and its uppercase-hex `encodeURIComponent` variant when locating a reference to rewrite, so a filename that appears in the document lowercase-percent-encoded (e.g. `./%e4%bd%a0.png` instead of `./%E4%BD%A0.png`) is correctly extracted but never located/rewritten during rename. Confirmed by independent review (Blind Hunter): both replace functions build their `variants` Set from `[oldFilename, encodeURIComponent(oldFilename)]`; `encodeURIComponent` always emits uppercase hex digits, so a document using lowercase percent-encoding for the same logical filename won't match either variant. Pre-existing characteristic of `replaceAssetReferenceFilename` (predates this story); newly inherited by the extended `replaceSiblingImageReferenceFilename`.
status: done 2026-08-04
resolution: resolved by sweep bundle dw-asset-replace-function-edge-cases

### DW-105: The unquoted `<img src=...>` pattern in both extraction functions and both replace functions does not account for a self-closing XHTML-style slash ...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-12-2-markdown-asset-parser-edge-cases.md"), 2026-08-04
location: src/lib/image-assets.ts (extractAssetReferences / extractSiblingImageReferences / replace functions)
reason: The unquoted `<img src=...>` pattern in both extraction functions and both replace functions does not account for a self-closing XHTML-style slash immediately before the closing `>` (e.g. `<img src=./assets/pic.png/>`), so the trailing `/` gets swept into the captured filename, the candidate is then rejected by the existing "no `/` in filename" validation, and the reference is silently skipped instead of extracted/renamed. Confirmed by independent review (Blind Hunter, pass 2): the unquoted-src character class `[^\s"'=<>`]+` does not exclude `/`, so `<img src=./assets/pic.png/>` captures `pic.png/` as the raw candidate; `extractAssetReferences`'s existing traversal check (`!candidate.includes('/')`) then drops it entirely. Pre-existing characteristic of the unquoted-`<img>` pattern in `extractAssetReferences` (predates this story); inherited by the newly mirrored sibling pattern per this story's explicit "mirror `extractAssetReferences`'s pattern structure" directive.
status: done 2026-08-04
resolution: resolved by sweep bundle dw-asset-replace-function-edge-cases

### DW-106: `stripFencedCodeBlocks`'s `getFenceInfo` treats any line starting with 3+ backticks as a valid fence opener even when the info string after the bac...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-12-2-markdown-asset-parser-edge-cases.md"), 2026-08-04
location: src/lib/image-assets.ts (stripFencedCodeBlocks / getFenceInfo)
reason: `stripFencedCodeBlocks`'s `getFenceInfo` treats any line starting with 3+ backticks as a valid fence opener even when the info string after the backtick run itself contains a backtick (e.g. ` ```bad`info `), whereas CommonMark specifies a backtick-fenced code block's info string must not contain a backtick, so such a malformed-looking line is incorrectly accepted as a real fence and can cause following content to be blanked out or a real closing fence to be mismatched. Confirmed by independent review (Blind Hunter and Edge Case Hunter, pass 3): `getFenceInfo` only validates the leading run length (`length >= 3`) and does not inspect `rest` for a backtick when `char === '`'`, unlike the CommonMark fenced-code-block spec. Narrow edge case (a backtick appearing in an otherwise-fence-like line's trailing text) with low real-world likelihood in typical note documents; not part of this story's explicit scope (DW-80/81/82).
status: done 2026-08-04
resolution: resolved by sweep bundle dw-markdown-fence-linkdest-fixes

### DW-107: The new `story-12-3.spec.ts` restore path only exercises the successful-restore branch; it does not cover the stale-config cleanup path where `read...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-12-3-session-restore-and-asset-regression-tests.md"), 2026-08-04
location: e2e/story-12-3.spec.ts
reason: The new `story-12-3.spec.ts` restore path only exercises the successful-restore branch; it does not cover the stale-config cleanup path where `read_external_document` fails/returns `{ ok: false }` during startup restore and `update_last_opened_file` should be invoked to clear the broken `lastOpenedFile` config. Confirmed by independent review (Blind Hunter, pass 2). The opt-in `__TAURI_MOCK_ENABLE_STARTUP_RESTORE__` hook now makes this failure path testable under the mock harness for the first time, but exercising it was out of this story's explicit scope (spec's "Never" section: do not modify or test startup-restore failure handling beyond what's needed to close DW-78's happy-path gap).
status: open

### DW-108: The new opt-in `__TAURI_MOCK_ENABLE_STARTUP_RESTORE__` hook makes the `onMounted` startup-restore `openRequestToken` race (a user opening a differe...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-12-3-session-restore-and-asset-regression-tests.md"), 2026-08-04
location: e2e/story-12-3.spec.ts (relates to DW-79)
reason: The new opt-in `__TAURI_MOCK_ENABLE_STARTUP_RESTORE__` hook makes the `onMounted` startup-restore `openRequestToken` race (a user opening a different document while the restore's `read_external_document` await is still pending) testable under the mock harness for the first time, but `story-12-3.spec.ts` does not add a regression test for it; this race is already tracked as DW-79. Confirmed by independent review (Blind Hunter, pass 2). Out of this story's explicit scope (DW-78 only); flagged here so a future pass on DW-79 can use the newly-testable opt-in hook to close it.
status: open

### DW-109: `cyberpunk-dark`, `obsidian-black`, `deep-void`, `midnight-slate`, and `solarized-dark` theme blocks in `src/styles/app.css` do not override `--col...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-13-1-design-tokens-hardcode-cleanup.md"), 2026-08-04
location: src/styles/app.css (cyberpunk-dark, obsidian-black, deep-void, midnight-slate, solarized-dark theme blocks)
reason: `cyberpunk-dark`, `obsidian-black`, `deep-void`, `midnight-slate`, and `solarized-dark` theme blocks in `src/styles/app.css` do not override `--color-success`, `--color-error`, `--color-overlay-header`, or `--color-overlay-zebra`, so components/exports newly consuming these tokens (per this story) silently fall back to the `:root` default-theme values instead of a palette-appropriate color on those five themes. Confirmed via inspection of `src/styles/app.css` theme blocks (lines 241-325): only `--bg-primary`, `--bg-surface`, `--border-color`, `--text-primary`, `--text-secondary`, `--accent-color`, `--code-bg`, `--app-color-scheme`, `--color-background-elevated`, `--color-border-subtle`, `--color-text-muted`, `--color-text-disabled`, `--color-accent-foreground`, and `--color-selection` are defined per-theme for these five themes; `--color-success`/`--color-error`/`--color-overlay-header`/`--color-overlay-zebra` are absent, unlike `paper-light`/`cream-warm`/`ice-cool`/`sand-sandstone`/`nord-light` which define all of them. Pre-existing gap in `app.css`'s theme system; not caused by this story (which only touches consumer files, not `app.css`), and explicitly out of scope per this story's spec ("Never: 不引入新 token").
status: open

### DW-110: `PublishConfluenceModal.vue`'s `.success-text` rule still hard-codes a `#3ba55d` fallback (`color: var(--color-success, #3ba55d);`) that does not m...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-13-1-design-tokens-hardcode-cleanup.md"), 2026-08-04
location: src/components/PublishConfluenceModal.vue (.success-text)
reason: `PublishConfluenceModal.vue`'s `.success-text` rule still hard-codes a `#3ba55d` fallback (`color: var(--color-success, #3ba55d);`) that does not match the actual `--color-success` token value in any current theme (e.g. `:root`'s `--color-success` is `#3FB950`), so the fallback is stale and misleading if ever exercised. Confirmed via `grep -n "color-success" src/components/PublishConfluenceModal.vue` showing `var(--color-success, #3ba55d)` versus `grep -n "color-success" src/styles/app.css` showing `#3FB950` in `:root`. Pre-existing hardcode predating this story; this story's spec scoped `PublishConfluenceModal.vue` changes to only `.confirm-btn` and `.error-text` (DW-71), not `.success-text`.
status: open

### DW-111: No automated test exercises the tokenized colors (`--color-overlay-header`/`--color-overlay-zebra`/`--color-success`/`--color-accent-foreground`/`-...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-13-1-design-tokens-hardcode-cleanup.md"), 2026-08-04
location: n/a (test coverage gap)
reason: No automated test exercises the tokenized colors (`--color-overlay-header`/`--color-overlay-zebra`/`--color-success`/`--color-accent-foreground`/`--color-error`) added by this story under non-default themes or in the exported-HTML code path, so a future theme-palette edit could silently regress these consumers without test failure. Confirmed via review (Blind Hunter): existing test suites only cover default-theme rendering; this story's own Verification section only required `npm run build` and static grep checks, not theme-matrix or export-path assertions, consistent with its "refactor, no behavior change" scope.
status: open

### DW-112: The new `write_export_file` Tauri command is a generic file-write primitive (any `target_path`/`content`) with no export-specific guardrails (e.g. ...

origin: migrated from legacy ledger ("_bmad-output/implementation-artifacts/spec-13-2-menu-aria-labels-and-tauri-scope-safety.md"), 2026-08-04
location: src-tauri/src/commands (write_export_file)
reason: The new `write_export_file` Tauri command is a generic file-write primitive (any `target_path`/`content`) with no export-specific guardrails (e.g. restricting to `.html` extensions or validating the path isn't inside a sensitive directory), broadening the frontend-invokable API surface beyond strictly what HTML export needs. Confirmed by independent review (Blind Hunter). This story's spec scoped `write_export_file` only to mirror `save_document_as`'s write semantics minus the asset-scope widening (DW-72); adding path/extension validation was not in scope and risks over-specifying "how" per the spec template's guidance.
status: open

- source_spec: `_bmad-output/implementation-artifacts/spec-dw-103-106-markdown-fence-linkdest-fixes.md`
  summary: Angle-bracket link/image destinations (`<...>`) do not support CommonMark's backslash-escaped `>` (e.g. `<./assets/foo\>.png>` for a literal `>` in a filename) in either extraction (`extractAssetReferences`/`extractSiblingImageReferences`) or rewrite (`replaceAssetReferenceFilename`/`replaceSiblingImageReferenceFilename`).
  evidence: Confirmed via inspection of the new regexes in `src/lib/image-assets.ts` (all four use `[^>\r\n]` character classes with no `\\>` escape handling), and via independent review (Edge Case Hunter, review pass 2). Narrow in practice since filenames containing a literal `>` are extremely rare, but a real CommonMark-conformance gap left open by this story since DW-103's scope was limited to the plain angle-bracket form.
