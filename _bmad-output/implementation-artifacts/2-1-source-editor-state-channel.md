---
title: 'Story 2.1: 集成源码编辑器与文档状态通道'
type: 'feature'
created: '2026-07-22'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'NO_VCS'
context:
  - /_bmad-output/planning-artifacts/epics.md
  - /_bmad-output/planning-artifacts/prds/prd-Markdown%20Cat-2026-07-21/prd.md
  - /_bmad-output/planning-artifacts/architecture/architecture-Markdown%20Cat-2026-07-21/ARCHITECTURE-SPINE.md
  - /_bmad-output/planning-artifacts/ux-designs/ux-Markdown%20Cat-2026-07-21/DESIGN.md
  - /_bmad-output/planning-artifacts/ux-designs/ux-Markdown%20Cat-2026-07-21/EXPERIENCE.md
  - /_bmad-output/implementation-artifacts/epic-1-context.md
  - /_bmad-output/implementation-artifacts/spec-1-4-create-default-markdown-doc.md
---

## Intent

**Problem:** Epic 1 已经为应用搭建了基础布局、设计 token 和默认文档状态，但左栏仍是占位 div。本 Story 需要在左栏集成真正的 Markdown 源码编辑器，并建立可被后续 Epic 复用的文档状态通道（内容、文件名、保存状态），为实时预览（Story 2.2）和自动保存（Epic 3）提供统一状态源。

**Approach:** 使用 CodeMirror 6 作为源码编辑器，封装成 `SourceEditor.vue` 组件；在 `App.vue` 中将当前占位替换为 `SourceEditor`，并提升 `content` 为单一状态源；通过 `v-model` 或事件将编辑器 change 事件同步到上层状态，同时保持组件可测试。本次不实现预览、不实现自动保存，仅建立状态通道与编辑器集成。

## Boundaries & Constraints

**Always:**
- 必须使用 CodeMirror 6 作为源码编辑器（架构已指定）。
- 源码编辑器必须始终位于左栏，不可隐藏、不可关闭。
- 编辑器必须支持撤销/重做、复制、粘贴、剪切、全选（macOS 标准编辑操作）。
- 编辑器内容变化必须通过单一 `content` 状态通道向上同步，使 App.vue 持有当前文档的完整源码；后续 Epic 通过监听 `content` 实现预览和自动保存。
- 编辑器必须应用现有设计 token：`background` 背景、`text-primary` 文字色、`body-mono` 字体、`selection` 选中色、无自定义滚动条美化；注意 `color-scheme: dark` 已设置，CodeMirror 的 `caret` 和 `selection` 等默认样式需显式覆盖。
- 编辑区必须无边框、默认获得焦点（或用户点击即可 focus）；在 Vue 组件挂载后显式调用 `view.focus()`，并在 `content` 从外部更新时通过 `view.setState` 或重新创建 `EditorState` 同步视图，光标颜色为 `text-primary`。
- 编辑器 change 事件为后续防抖保存与实时预览提供触发点，本次仅建立事件通道，不消费事件。
- 必须在 `SourceEditor.vue` 的 `onUnmounted` 中调用 `view.destroy()` 释放 CodeMirror 实例，避免内存泄漏。
- 必须复用 Epic 1 的 `DocumentState` 类型和 `CmdResult` 结构约定；不改动 Rust 后端命令。
- 文件名、保存状态、行列号等状态必须统一在 App.vue 中管理，避免分散在多个组件中导致不一致。
- 错误提示/状态文案不硬编码中文，使用常量或英文 key，后续接入 locale。

**Ask First:**
- 是否需要一次性引入 markdown-it / marked 进行实时预览？—— 不需要，预览由 Story 2.2 处理。
- 是否需要自动保存？—— 不需要，由 Epic 3 处理。
- 是否需要在编辑器中显示行号？—— MVP 不需要，保持简洁。

**Never:**
- 不要引入除 CodeMirror 6 以外的富文本编辑器或 Markdown 编辑器组件。
- 不要在前端直接写盘（文件写入必须由后端命令执行，本次不涉及写入）。
- 不要破坏 Epic 1 已实现的标题栏、菜单栏、状态栏、布局样式。
- 不要修改 `tauri.conf.json` 权限或 Rust 后端命令（除非需要新命令，本次不需要）。
- 不要过早实现同步滚动、双栏比例调整、图片粘贴等 Should 项。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 应用启动 | 默认空白文档 | 左栏显示可输入的源码编辑器，默认获得焦点或可立即点击 focus | 无 |
| 用户输入 | 键盘输入或粘贴 | 编辑器内容更新，App.vue 中 `content` 同步更新 | 无 |
| 大段粘贴 | 单次粘贴 10,000 字符 | 编辑器不卡顿，最终 `content` 与粘贴内容一致 | 无 |
| 标准编辑操作 | ⌘Z / ⌘ShiftZ / ⌘C / ⌘V / ⌘X / ⌘A | 撤销/重做/复制/粘贴/剪切/全选生效 | 无 |
| 编辑器失焦/重聚焦 | 用户点击其他区域后返回 | 编辑器可重新获得焦点，内容保持不变 | 无 |
| 内容清空 | 用户删除全部文本 | 编辑器为空，预览区在 Story 2.2 中应显示空状态（本次不验证） | 无 |
| 源码编辑区不可关闭 | 任何用户操作 | 始终显示左栏编辑器，无隐藏按钮或菜单项 | 无 |

## Code Map

- `src/components/SourceEditor.vue` — **新文件**：CodeMirror 6 编辑器组件，负责渲染、主题、keymap、change 事件输出。
- `src/App.vue` — **修改**：将 `source-pane` 中的占位替换为 `<SourceEditor v-model="content" @cursor-change="onCursorPositionUpdate" />`，提升 `content` 与 `cursorPosition` 为响应式状态；将 `content` 和 `cursorPosition` 传递给 `StatusBar` 用于显示行列号。
- `src/styles/app.css` — **可选修改**：补充 `.cm-editor` / `.cm-scroller` / `.cm-content` 相关样式覆盖，确保背景、边框、滚动条与系统滚动条一致，并适配深色 `color-scheme`；优先使用 CSS 变量，避免硬编码颜色。
- `package.json` — **修改**：新增 `@codemirror/state`、`@codemirror/view`、`@codemirror/commands` 依赖。本次不引入 `@codemirror/lang-markdown`、`basic-setup` 或其他扩展，保持最小化。
- `src/components/TitleBar.vue` — **不修改**：文件名由 App.vue 传入。
- `src/components/StatusBar.vue` — **可能修改**：若当前未显示行列号，需在 App.vue 中通过 `content` 计算当前光标行列号并传给 `StatusBar`。StatusBar 已接受 `line`/`column` props，只需在 App.vue 中计算。
- Rust 后端 — **不修改**：本次不新增命令。

## Design Notes

### CodeMirror 6 基础配置

推荐最小依赖集合：

```json
{
  "@codemirror/state": "^6.4.0",
  "@codemirror/view": "^6.28.0",
  "@codemirror/commands": "^6.5.0"
}
```

基础编辑器配置：

```typescript
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { standardKeymap, history, historyKeymap } from '@codemirror/commands'

const theme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-body-mono)',
    fontSize: 'var(--font-size-body)',
    height: '100%'
  },
  '.cm-content': {
    caretColor: 'var(--color-text-primary)',
    padding: 'var(--spacing-xl)',
    lineHeight: 'var(--line-height-relaxed)'
  },
  '.cm-selectionBackground': {
    backgroundColor: 'var(--color-selection)'
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--color-selection)'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    borderRight: 'none'
  }
})

const state = EditorState.create({
  doc: props.modelValue ?? '',
  extensions: [
    keymap.of(standardKeymap),
    history(),
    keymap.of(historyKeymap),
    theme,
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        emit('update:modelValue', update.state.doc.toString())
      }
      const pos = update.state.selection.main.head
      const line = update.state.doc.lineAt(pos)
      emit('cursorChange', {
        line: line.number,
        column: pos - line.from + 1
      })
    })
  ]
})
```

注意：
- `standardKeymap` 已包含复制/粘贴/剪切/全选，无需额外配置。
- `historyKeymap` 提供 ⌘Z / ⌘ShiftZ 撤销/重做。
- 不启用 `lineNumbers` 或语法高亮，保持 MVP 简洁。
- `EditorView.lineWrapping` 启用自动换行，避免水平滚动条。
- 在 Vue 的 `onMounted` 中创建 `EditorView` 并调用 `view.focus()` 让编辑器默认获得焦点；在 `onUnmounted` 中调用 `view.destroy()`。
- 当 `props.modelValue` 从外部变化（如后续自动保存或打开新文档）时，使用 `view.setState(newState)` 或重新创建 `EditorState` 同步视图，避免直接修改 DOM。

### 状态通道设计

```typescript
// App.vue
const filename = ref('New_*.md')
const content = ref('')
const cursorPosition = ref({ line: 1, column: 1 })

function onCursorPositionUpdate(pos: { line: number, column: number }) {
  cursorPosition.value = pos
}
```

`SourceEditor` 通过 `update:modelValue` 同步内容，通过 `cursorChange` 事件同步光标位置。组件 Props 与事件约定：

```typescript
const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'cursorChange', pos: { line: number, column: number }): void
}>()
```

### 行列号计算

CodeMirror 6 提供 `state.selection.main.head`，可通过 `state.doc.lineAt(pos)` 获取行号：

```typescript
const line = state.doc.lineAt(pos)
const lineNumber = line.number
const columnNumber = pos - line.from + 1
```

在 `updateListener` 中监听选择变化，向父组件 emit 光标位置。

## Tasks & Acceptance Criteria

**Execution:**
- [x] 安装 CodeMirror 6 最小依赖：`@codemirror/state`、`@codemirror/view`、`@codemirror/commands`。
- [x] 创建 `src/components/SourceEditor.vue`：封装 CodeMirror 6 编辑器，支持 `modelValue` 双向绑定、主题 token 化、change 事件、selection 事件；组件卸载时调用 `view.destroy()`。
- [x] 修改 `src/App.vue`：将 `source-pane` 占位替换为 `<SourceEditor v-model="content" @cursor-change="onCursorPositionUpdate" />`；新增 `cursorPosition` 响应式状态，并通过 `content` 与 `cursorPosition` 同步更新 `StatusBar` 的 `line`/`column` props。
- [x] 修改 `src/App.vue`：确保 `get_blank_document` 返回的 `content` 初始为空字符串，并正确绑定到编辑器；`content` 应定义为 `ref('')`，作为后续预览和保存的唯一状态源。
- [x] 修改 `src/styles/app.css`（可选）：补充 `.cm-editor` / `.cm-scroller` / `.cm-content` 相关样式覆盖，确保背景、边框、滚动条与系统滚动条一致，并适配深色 `color-scheme`；优先使用 CSS 变量，避免硬编码颜色。
- [x] 验证 `npm run build` 通过 TypeScript 类型检查且无 Vue 编译错误。
- [x] 验证 `cd src-tauri && cargo check` 通过（本次不改动 Rust，但需确保前端改动未影响构建）。
- [x] 验证 `npm run test:e2e` 或至少运行 Story 2.1 相关 e2e 测试（如果有）通过。

**Acceptance Criteria:**
- Given 应用主窗口已加载，When 用户进入主编辑区，Then 左栏显示可输入的源码编辑器，且可立即获得焦点输入。
- Given 用户在源码编辑器内输入文本，When 执行键入、删除、移动光标、选择文本，Then 编辑器正确更新文档状态字符串。
- Given 用户在源码编辑器内，When 使用 ⌘Z / ⌘ShiftZ / ⌘C / ⌘V / ⌘X / ⌘A，Then 撤销、重做、复制、粘贴、剪切、全选操作生效。
- Given 源码编辑器已集成，When 检查界面行为，Then 编辑器始终位于左栏且不可隐藏或关闭。
- Given 检查文本选中样式、字体与光标样式，Then 符合 UX token 规范（背景、文字色、等宽字体、选中色、光标色）。
- Given 单次粘贴大段文本（10,000 字符），When 内容被粘贴，Then 编辑器不卡顿且 change 事件触发。
- Given 应用启动，When 检查源码编辑器，Then 内容为空字符串，光标可在编辑器中 focus 并输入。
- Given 运行 `npm run build`，When 构建完成，Then 无 TypeScript 或 Vue 编译错误。
- Given 运行 `cd src-tauri && cargo check`，When 编译完成，Then 无错误。

## Verification

**Commands:**
- `npm install @codemirror/state @codemirror/view @codemirror/commands` — 安装依赖。
- `npm run build` — expected: 无错误。
- `cd src-tauri && cargo check` — expected: 无错误（本次不改动 Rust，但做回归检查）。
- `npm run tauri:dev` — expected: 应用窗口出现，左栏可输入，标准编辑操作正常。
- `npm run test:e2e` — expected: 已有测试通过（若存在针对编辑器的测试）。

**Manual checks:**
- 启动应用，左栏是否为可输入编辑器而非占位文字。
- 输入内容，检查 `content` 是否正确同步（可通过 Vue DevTools 或 console 输出）。
- 使用 ⌘A、⌘C、⌘V、⌘Z 测试标准编辑操作。
- 检查选中文字背景色是否为 `--color-selection`。
- 检查编辑器背景是否为 `--color-background`。
- 检查状态栏行列号是否随光标移动更新。

## Dev Agent Record

**Implementation Plan:**
- 使用 CodeMirror 6 最小依赖集合（`@codemirror/state`、`@codemirror/view`、`@codemirror/commands`）实现源码编辑器组件。
- 编辑器通过 `update:modelValue` 将 `doc` 同步到 `App.vue` 的 `content` 状态，通过 `cursorChange` 事件同步光标位置到 `cursorPosition` 状态。
- `content` 作为单一状态源，供后续 Story 2.2 预览和 Epic 3 自动保存消费。
- 在组件中显式覆盖 CodeMirror 默认主题以匹配设计 token（背景、文字色、等宽字体、选中色、光标色）。
- 组件卸载时调用 `view.destroy()` 释放 CodeMirror 实例。

**Completion Notes:**
- 安装 `@codemirror/state@^6.4.0`、`@codemirror/view@^6.28.0`、`@codemirror/commands@^6.5.0` 成功。
- 创建 `src/components/SourceEditor.vue`，封装 CodeMirror 6 编辑器，支持 `v-model` 双向绑定、`cursorChange` 事件、主题 token 化、生命周期清理。
- 修改 `src/App.vue`，替换左栏占位，引入 `SourceEditor`，并提升 `content` 和 `cursorPosition` 状态，传递给 `StatusBar` 显示行列号。
- 未修改 `src/styles/app.css`：相关 token 覆盖已在 `SourceEditor.vue` 的 scoped 样式中使用 `:deep()` 完成，未引入全局滚动条美化，保持与系统滚动条一致。
- 代码审查后修复：外部 `modelValue` 更新改为 `view.dispatch` 以保留撤销历史与选区；通过 `isApplyingExternalUpdate` 标志抑制外部更新导致的 `cursorChange` 事件；在 `src/lib/types.ts` 中新增 `DocumentState` 并导入复用；清理 `package.json` 未使用的测试依赖；恢复 `.editor-workspace` 的 `min-height: 0`。
- 验证通过：`npm run build` 无错误；`cd src-tauri && cargo check` 无错误；`npm run test:e2e -- story-2-1.spec.ts` 3 个测试全部通过。

**File List:**
- 新增：`src/components/SourceEditor.vue`
- 修改：`src/App.vue`
- 修改：`src/lib/types.ts`（新增 `DocumentState` 共享类型）
- 修改：`package.json`、`package-lock.json`（依赖变更由 npm 自动生成）
- 未修改：`src/styles/app.css`（已在组件内覆盖 CodeMirror 主题）
- 未修改：Rust 后端（本次不涉及后端命令）

## Change Log

- 2026-07-22: 创建 Story 2.1 故事文件，明确状态通道与编辑器集成范围。
- 2026-07-22: 通过 `bmad-create-story:validate` 审查，补充外部 `content` 同步、`view.destroy()`、`color-scheme: dark` 样式覆盖、行列号事件约定、最小依赖范围等实现细节。
- 2026-07-22: 完成 Story 2.1 实现，集成 CodeMirror 6 源码编辑器，建立 `content` 与 `cursorPosition` 状态通道，所有验证通过，状态更新为 review。
- 2026-07-22: 运行 `bmad-code-review`，发现以下问题。
- 2026-07-23: 根据 Epic 1 Retrospective Action Item A2，在 Story 2.1 完成后补充 E2E 测试覆盖，新增 11 个测试用例验证编辑器初始化、输入、选择、撤销/重做、全选、大段粘贴、布局、样式与可访问性属性。测试文件：`e2e/story-2-1.spec.ts`。运行结果：14 个测试全部通过。
- 2026-07-23: 生成测试质量审查报告 [test-review-story-2-1-spec-20260723.md](../test-artifacts/test-reviews/test-review-story-2-1-spec-20260723.md)，评分 82/100（A - Good），建议 Approve with Comments。

### Test Coverage Update

根据 Epic 1 Retrospective 的 Action Item A2（Epic 2 开始时初始化自动化测试框架，并在 Story 2.1 期间落地），对 Story 2.1 的 E2E 测试进行了补充和完善。

新增/完善的测试覆盖：

| 测试名称 | 覆盖的 AC |
|---------|----------|
| 左栏应显示源码编辑器且可 focus | 编辑器初始化、默认 focus |
| 编辑器应默认获得焦点 | 编辑器可立即输入 |
| 输入文本后应更新文档状态字符串 | 键入更新文档状态 |
| 删除文本后应更新文档状态字符串 | 删除更新文档状态 |
| 选择文本后应触发 cursorChange 事件 | 选择文本与光标事件 |
| 应支持撤销与重做（Ctrl+Z / Ctrl+Shift+Z） | 标准编辑操作：撤销/重做 |
| 应支持全选（Ctrl+A） | 标准编辑操作：全选 |
| 单次粘贴 10000 字符不应导致编辑器崩溃或内容丢失 | 大段粘贴性能与正确性 |
| 编辑器应始终位于左栏且不可关闭 | 编辑器位置与不可关闭 |
| 编辑器应使用 design token 定义的样式 | 主题 token 应用 |
| 源码编辑器应暴露可访问性属性 | ARIA 属性 |

测试运行命令：

```bash
npm run test:e2e -- e2e/story-2-1.spec.ts
```

运行结果：14 passed (1.2s)

为支持测试访问 CodeMirror 实例与命令，在 `SourceEditor.vue` 中暴露了测试钩子 `__codemirrorView` 与 `__codemirrorCommands`，并在 `onUnmounted` 中清理。这些属性仅在 E2E 测试中使用，不影响生产功能。修复了审查中提出的测试 ID、优先级标记、硬等待和事件集成断言缺口，最终审查评分 **92/100（A - Good）**，建议 **Approve**。

### Review Findings

- [x] [Review][Patch] 外部 `modelValue` 更新时不应重建整个 EditorState，应使用 `view.dispatch` 保留撤销历史与选区 [src/components/SourceEditor.vue:79]
- [x] [Review][Patch] 在前端共享类型模块 `src/lib/types.ts` 中新增 `DocumentState`，并在 `App.vue` 中导入复用，不再本地重新定义 [src/App.vue:10]
- [x] [Review][Patch] 清理 `package.json` 中未使用的测试依赖（`sinon`、`@types/sinon`、`serve`），保留 `@playwright/test` 与 `@types/node` 以支持既有 e2e 测试 [package.json]
- [x] [Review][Patch] 外部 `modelValue` 更新导致的 `selectionSet` 不应向上 emit `cursorChange` [src/components/SourceEditor.vue:42]
- [x] [Review][Patch] 恢复 `.editor-workspace` 的 `min-height: 0` 以避免破坏 flex 溢出收缩 [src/App.vue:73]
- [x] [Review][Defer] App.vue 初始化失败仅在控制台输出，无用户可见反馈 [src/App.vue:34] — deferred，属于全局错误处理策略，不在 Story 2.1 范围内
- [x] [Review][Defer] 容器 `role="textbox"` 可能与 CodeMirror 内部可编辑区域产生 ARIA 冲突 [src/components/SourceEditor.vue:85] — deferred，无障碍优化留到后续迭代
- [x] [Review][Dismiss] 默认文件名 `New_*.md` 含非法字符 — 这是 Rust 后端 fallback 占位，前端仅作为初始值显示，实际文件名由后端生成
- [x] [Review][Dismiss] 缺少 Markdown 语法高亮 — 符合 Story 2.1 约束，MVP 不需要
- [x] [Review][Dismiss] 自动聚焦可能影响无障碍导航 — 符合 Story 2.1 约束，且 spec 要求默认 focus
- [x] [Review][Dismiss] 未提供 CSS 变量 fallback — 变量已在 `app.css` 全局定义，无需组件内 fallback
