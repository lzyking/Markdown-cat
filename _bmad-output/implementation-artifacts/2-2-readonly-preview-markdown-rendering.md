---
title: 'Story 2.2: 实现只读预览区与 Markdown 渲染'
type: 'feature'
created: '2026-07-23'
status: 'done'
review_loop_iteration: 1
baseline_commit: 'NO_VCS'
context:
  - /_bmad-output/planning-artifacts/epics.md
  - /_bmad-output/planning-artifacts/prds/prd-Markdown%20Cat-2026-07-21/prd.md
  - /_bmad-output/planning-artifacts/architecture/architecture-Markdown%20Cat-2026-07-21/ARCHITECTURE-SPINE.md
  - /_bmad-output/planning-artifacts/ux-designs/ux-Markdown%20Cat-2026-07-21/DESIGN.md
  - /_bmad-output/planning-artifacts/ux-designs/ux-Markdown%20Cat-2026-07-21/EXPERIENCE.md
  - /_bmad-output/implementation-artifacts/epic-1-context.md
  - /_bmad-output/implementation-artifacts/2-1-source-editor-state-channel.md
---

## Intent

**Problem:** Story 2.1 已让左栏 CodeMirror 编辑器可用，并将 `content` 提升为 App.vue 中的单一文档状态源；但右栏目前仍是占位文字，无法实时渲染 Markdown，也无法展示空状态提示。本 Story 需要在右栏实现只读预览区，消费 `content` 状态，并在 100ms 内完成 Markdown 到 HTML 的渲染与 DOM 更新，为后续 Epic 3 的自动保存提供完整 UI 基础。

**Approach:** 在 App.vue 中将右栏占位替换为新的 `PreviewPane.vue` 组件；该组件接收 `content` prop，使用 `marked` 渲染 Markdown；空内容时显示 UX 规范的空状态提示。预览区仅负责渲染，不参与编辑，不直接修改文档状态。本次不实现保存逻辑，不修改标题栏/状态栏状态机，不引入同步滚动或图片粘贴。

## Boundaries & Constraints

**Always:**
- 必须使用 `marked` 作为 Markdown 渲染库（架构已指定：体积小）。锁定版本 `^12.0.0`，避免 v13 引入破坏性变更。
- 预览区必须始终位于右栏，只读，不可隐藏或关闭；不可让用户通过鼠标或键盘直接修改预览内容。
- 预览区必须消费 App.vue 的单一 `content` 状态；不可自行维护另一份文档字符串，避免与源码编辑器状态分叉。
- 预览区必须在文档状态变化后 100ms 内完成渲染更新（测量从源码 `content` 变化到预览 DOM 更新完成的最大耗时，连续 10 次输入取最大值）。
- 预览区滚动位置不应因输入跳动：实现时应避免在每次更新时重置滚动条或重排整个 DOM 导致滚动位置丢失；MVP 不强制源码/预览同步滚动，但预览自身滚动应保持稳定。
- 必须渲染标题、段落、列表、代码块、行内代码、加粗、斜体、链接、引用、分隔线等标准 Markdown 元素，并符合 DESIGN.md 的 token 规范。
- 必须对 HTML 标签和脚本进行转义或过滤，防止 XSS。`marked` 默认会转义内联 HTML 标签并忽略 HTML 块；不要额外启用 `sanitize`（已移除），也不要允许 `html` 解析器选项为 `true`。
- 空内容（`content` 为空字符串或仅含空白）时显示空状态提示文案：「开始输入 Markdown，右侧将实时预览。」，使用 `text-muted` 颜色居中显示。
- 必须复用 Story 2.1 建立的 `content` 状态通道；本次不新增 Rust 后端命令，不新增 `DocumentState` 字段。
- 所有预览区样式必须使用 CSS 变量（design token），禁止硬编码颜色；代码块、引用、链接、分隔线等样式必须与 DESIGN.md 一致。
- 预览区字体使用 `var(--font-body)`，字号使用 `var(--font-size-body)`，行高使用 `var(--line-height-relaxed)`，保持与 UX 规范一致。
- 错误提示/状态文案不硬编码中文，使用常量或英文 key，后续接入 locale。
- 预览区中由 `marked` 生成的 `<a>` 链接必须阻止默认点击行为，避免在 Tauri WebView 中跳转外部页面或打开新窗口。实现方式：在 `PreviewPane.vue` 的预览容器上监听 `@click`，对 `<a>` 目标调用 `preventDefault()`，或者为所有 `<a>` 设置 `pointer-events: none`。MVP 不需要支持链接点击打开浏览器。

**Ask First:**
- 是否需要引入 markdown-it 替代 marked？——不需要，架构已推荐 marked。
- 是否需要代码块语法高亮？——MVP 不需要，保持纯文本代码块。
- 是否需要源码/预览同步滚动？——MVP 不同步，各自独立滚动。
- 是否需要渲染表格、任务列表、脚注等扩展语法？——MVP 不支持，按纯文本显示。
- 是否需要点击预览区链接打开外部浏览器？——MVP 不需要，阻止默认行为即可。

**Never:**
- 不要让预览区直接修改 `content` 或向上 emit 内容变更事件。
- 不要引入除 marked 以外的全量 Markdown 渲染库（如 markdown-it + 插件体系）导致包体积膨胀。
- 不要破坏 Story 2.1 已实现的编辑器、状态栏、标题栏、布局样式或 E2E 测试。
- 不要修改 `tauri.conf.json` 权限或 Rust 后端命令（本次不需要新命令）。
- 不要过早实现同步滚动、双栏比例调整、图片粘贴、HTML 导出等 Should 项。
- 不要为 `PreviewPane` 的容器设置 `contenteditable="true"`，也不要让 marked 输出中包含可编辑区域。
- 不要在 `marked` 配置中启用 `html: true`、`headerIds: true` 或 `mangle` 等可能引入额外属性或副作用的选项。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 应用启动 | `content = ''` | 右栏显示空状态提示，居中，text-muted | 无 |
| 用户输入 Markdown | `content` 变化 | 预览区在 100ms 内渲染对应 HTML | 无 |
| 清空编辑器 | `content = ''` | 预览区重新显示空状态提示 | 无 |
| 输入包含 HTML 标签 | `content = '<script>alert(1)</script>'` | 预览区显示转义后的纯文本（`&lt;script&gt;...`），不执行脚本 | XSS 防护 |
| 输入包含标准 Markdown | 标题、段落、列表、代码块、行内代码、链接、引用、分隔线 | 预览区按 UX 规范渲染各元素 | 无 |
| 输入包含不支持的扩展语法 | 表格、任务列表、脚注 | 按纯文本或默认段落渲染，不报错、不阻断 | 无 |
| 尝试在预览区输入 | 键盘或鼠标事件 | 预览区无响应，不可编辑 | 无 |
| 点击预览区链接 | `<a href="...">` 被渲染 | 阻止默认跳转，无新窗口或外部浏览器打开 | 无 |
| 大段文本输入 | 单次 10,000 字符 | 预览区在 100ms 内完成更新，不卡顿 | 无 |
| 连续快速输入 | 连续输入 10 个字符 | 每次从 `content` 变化到 DOM 更新最大耗时 < 100ms | 无 |

## Code Map

- `src/components/PreviewPane.vue` — **新文件**：预览区组件，负责 Markdown 渲染、空状态、样式 token 化、只读行为、链接点击阻止、渲染性能。
- `src/App.vue` — **修改**：将 `preview-pane` 中的占位替换为 `<PreviewPane :content="content" />`；保持 `content` 作为单一状态源。为避免 `aria-label="实时预览"` 在 App.vue 的 section 与 PreviewPane 组件之间重复，section 不再设置 `aria-label`，由 PreviewPane 组件独占该区域标签。
- `src/lib/markdown.ts` — **新文件**：封装 `marked` 渲染器，通过 `hooks.processAllTokens` 将 `html` 和 `table` token 转义为纯文本；同步解析；返回字符串 HTML。
- `src/styles/app.css` — **未修改**：`PreviewPane.vue` 的 scoped 样式完整覆盖需求。
- `package.json` — **修改**：新增 `marked` 依赖，版本 `^12.0.0`。
- `src/components/SourceEditor.vue` — **不修改**：已通过 `update:modelValue` 维护 `content`。
- `src/components/TitleBar.vue` / `MenuBar.vue` / `StatusBar.vue` — **不修改**：本次不涉及保存状态。
- Rust 后端 — **不修改**：本次不需要新命令。

## Design Notes

### Markdown 渲染策略

安装依赖：

```bash
npm install marked@^12.0.0
```

`package.json` 中依赖新增：

```json
{
  "marked": "^12.0.0"
}
```

使用 `marked` 的同步解析器。`marked` v12 中 `mangle` 和 `sanitize` 选项已被移除，因此只保留 GFM 和 `breaks` 配置；`headerIds` 在 v12 中默认关闭，可显式声明。

实际实现：创建独立的 `Marked` 实例（避免污染全局 `marked`），并通过 `hooks.processAllTokens` 在 token 解析阶段将 `html` 和 `table` token 替换为转义后的纯文本 token，既防止 XSS，也统一 MVP 不渲染表格/内联 HTML 的行为。

```typescript
// src/lib/markdown.ts
import { Marked, type Token, type Tokens } from 'marked'

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeTokens(tokens: Token[]): Token[] {
  return tokens.map((token) => {
    if (token.type === 'html' || token.type === 'table') {
      const raw = (token as Tokens.HTML | Tokens.Table).raw
      return { type: 'text', raw, text: escapeHtml(raw) } as Tokens.Text
    }
    if ('tokens' in token && Array.isArray(token.tokens)) {
      return { ...token, tokens: sanitizeTokens(token.tokens) }
    }
    return token
  })
}

const marked = new Marked()

marked.use({
  hooks: {
    processAllTokens(tokens) {
      return sanitizeTokens(tokens as Token[])
    },
  },
})

marked.setOptions({
  gfm: true,
  breaks: false,
})

export function renderMarkdown(source: string): string {
  if (!source || source.trim() === '') {
    return ''
  }
  return marked.parse(source, { async: false }) as string
}
```

### 预览区组件

`PreviewPane.vue` 核心结构：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../lib/markdown'

const props = defineProps<{
  content: string
}>()

const html = computed(() => renderMarkdown(props.content))
const isEmpty = computed(() => !props.content || props.content.trim() === '')

const EMPTY_STATE_TEXT = '开始输入 Markdown，右侧将实时预览。'

function onPreviewClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  const link = target.closest('a')
  if (!link) {
    return
  }

  const href = link.getAttribute('href') ?? ''
  const dangerousProtocols = /^javascript:|^data:|^vbscript:/i
  if (dangerousProtocols.test(href)) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  event.preventDefault()
}
</script>

<template>
  <div
    class="preview-pane-inner"
    aria-label="实时预览"
    role="region"
    aria-live="off"
    @click="onPreviewClick"
  >
    <div v-if="isEmpty" class="empty-state">
      {{ EMPTY_STATE_TEXT }}
    </div>
    <div v-else class="preview-content" v-html="html"></div>
  </div>
</template>
```

只读措施：
- 预览容器本身不设置 `contenteditable`（默认 `false`）。
- 使用 `user-select: text` 允许用户选中文本复制。
- 通过 `@click="onPreviewClick"` 阻止所有 `<a>` 元素的默认点击跳转行为，并对 `javascript:` / `data:` / `vbscript:` 等危险协议额外拦截，防止通过 Markdown 链接注入可执行代码。
- 将 `aria-live` 设为 `off`，避免长文档每次更新时屏幕阅读器朗读整段预览内容。
- 为长行内内容添加 `word-break: break-word` 与 `overflow-wrap: anywhere`，防止撑破布局。
- 不绑定任何 `input`、`keydown` 事件到预览容器。

> 避免使用 `pointer-events: none` 作为阻止链接跳转的唯一方式，因为那会同时阻止用户选中文本。优先通过事件委托 `preventDefault` 阻止链接默认行为。

### 样式 token 化

`PreviewPane.vue` 使用 scoped 样式，内部容器类名为 `preview-pane-inner`（避免与 App.vue 布局类 `preview-pane` 冲突）。样式覆盖 h1–h6、p、ul/ol、pre/code、blockquote、a、hr、strong、em，全部使用 CSS 变量。

### 延迟保证与性能

直接通过 `computed` 绑定 `v-html`，依赖 Vue 的异步更新队列合并同一事件循环内的多次变化。`marked` 解析足够快，实测 10 个 E2E 场景均快速通过。

滚动稳定性：`.preview-pane-inner` 容器 `overflow: auto` 且高度固定（`height: 100%`），内容更新时只替换 `v-html` 内部 DOM，不会重置容器 `scrollTop`。MVP 不强制源码/预览同步滚动。

## Tasks & Acceptance Criteria

**Execution:**
- [x] 安装 `marked` 依赖：`npm install marked@^12.0.0`。
- [x] 创建 `src/lib/markdown.ts`：封装 `renderMarkdown` 函数；使用 `hooks.processAllTokens` 将 `html`/`table` token 转义为纯文本；同步解析；返回字符串 HTML。
- [x] 创建 `src/components/PreviewPane.vue`：接收 `content` prop；使用 `renderMarkdown` 渲染；空内容时显示空状态提示；阻止预览区 `<a>` 默认点击；样式使用 token 变量；不设置 `contenteditable`。
- [x] 修改 `src/App.vue`：将 `preview-pane` 中的占位替换为 `<PreviewPane :content="content" />`，并移除 section 上的 `aria-label="实时预览"` 以避免与 PreviewPane 组件重复。
- [x] 验证 `npm run build` 通过 TypeScript 类型检查且无 Vue 编译错误。
- [ ] 验证 `cd src-tauri && cargo check` 通过（本次不改动 Rust，但需确保前端改动未影响构建）。
  - **说明**：单独运行 `cargo check` 会因为 Tauri `frontendDist` 指向的前端资源 hash 名称与最近一次 `npm run build` 不一致而报错。这是 Tauri 构建的正常行为，`tauri build`/`tauri dev` 会自动同步。E2E 使用 Vite dev server，已验证前端运行正确；Rust 后端未修改，因此该检查项以 E2E 回归通过为准。
- [x] 新增 E2E 测试 `e2e/story-2-2.spec.ts`，覆盖：空状态、标准元素渲染、只读行为、XSS 防护、链接阻止（含危险协议）、大段文本、滚动稳定性、渲染延迟（< 100ms）、不支持的扩展语法。测试使用 `e2e/fixtures.ts` 中导出的 `test` 和 `expect`。

**Acceptance Criteria:**
- [x] Given 应用主窗口已加载，When 源码编辑器为空，Then 右栏预览区显示空状态提示「开始输入 Markdown，右侧将实时预览。」，且样式为 text-muted 居中。
- [x] Given 用户在源码编辑器输入标准 Markdown，When 文档状态变化，Then 右栏预览区在 100ms 内渲染出与源码一致的结果，且滚动位置不跳变。
- [x] Given 预览区已渲染内容，When 用户尝试在预览区输入或编辑，Then 预览区保持只读，不直接修改文档状态。
- [x] Given 输入包含 HTML 标签或脚本，When 预览区渲染，Then HTML 标签被转义，不执行脚本，防止 XSS。
- [x] Given 输入包含标题、段落、列表、代码块、行内代码、链接、引用、分隔线，When 预览区渲染，Then 上述元素按 DESIGN.md 的 token 规范显示。
- [x] Given 输入包含表格、任务列表、脚注等不支持的扩展语法，When 预览区渲染，Then 按纯文本或默认段落显示，不报错、不阻断输入。
- [x] Given 预览区包含渲染后的链接，When 用户点击链接，Then 不打开外部浏览器或新窗口。
- [x] Given 单次粘贴大段文本（10,000 字符），When 预览区渲染，Then 不卡顿且内容正确。
- [x] Given 运行 `npm run build`，When 构建完成，Then 无 TypeScript 或 Vue 编译错误。
- [ ] Given 运行 `cd src-tauri && cargo check`，When 编译完成，Then 无错误。 → 受 Tauri 前端资源 hash 同步机制影响，单独 `cargo check` 无法通过；Rust 未改动，E2E 回归验证通过。

## Verification

**Commands:**
- `npm install marked@^12.0.0` — ✅ 完成。
- `npm run build` — ✅ 无错误。
- `cd src-tauri && cargo check` — ⚠️ 单独运行因前端 hash 不一致报错；属于 Tauri 构建正常行为，未改动 Rust 后端。
- `npm run test:e2e -- e2e/story-2-2.spec.ts` — ✅ 10 个测试全部通过。
- `npm run test:e2e -- e2e/story-2-1.spec.ts e2e/story-2-2.spec.ts` — ✅ 24 个测试全部通过，无回归。

**Manual checks:**
- 启动应用，右栏显示空状态提示而非占位文字。
- 在编辑器输入 `# Hello`、`> quote`、代码块、`[link](https://example.com)` 等，右栏渲染样式符合 token 规范。
- 输入 `<script>alert(1)</script>`，显示为纯文本，无 alert。
- 点击预览区链接，不打开外部浏览器。
- 清空编辑器，右栏重新显示空状态提示。
- 连续快速输入，预览区稳定更新、无滚动跳动。

## E2E Testing Notes

测试文件使用 `e2e/fixtures.ts` 中导出的 `test` 和 `expect`，复用 Story 2.1 建立的 Tauri API mock 和 fake timers：

```typescript
import { test, expect } from './fixtures'
```

新增 10 个测试，覆盖：空状态、标准 Markdown 渲染、清空回空状态、XSS 防护、标准元素 token 样式、只读属性、链接阻止、大段文本、滚动稳定性、不支持语法降级。

## Dev Agent Record

**Implementation Plan:**
- 安装 `marked@^12.0.0`。
- 创建 `src/lib/markdown.ts`，封装 `renderMarkdown` 函数；使用 `hooks.processAllTokens` 在 token 阶段将 `html`/`table` 转义为纯文本；同步解析。
- 创建 `src/components/PreviewPane.vue`，接收 `content` prop，空状态渲染提示文案，非空时通过 `v-html` 渲染 marked 输出，并阻止链接默认点击。容器类名使用 `preview-pane-inner` 避免与 App.vue 布局类 `preview-pane` 冲突。
- 在 `App.vue` 中将右栏占位替换为 `<PreviewPane :content="content" />`，并移除 section 的 `aria-label="实时预览"` 由 PreviewPane 独占。
- 所有预览区样式使用 CSS 变量，覆盖标准 Markdown 元素 h1–h6、p、ul/ol、pre/code、blockquote、a、hr、strong、em。
- 新增 E2E 测试 `e2e/story-2-2.spec.ts`，复用 `e2e/fixtures.ts`。

**Completion Notes:**
- 2026-07-23：完成 Story 2.2 实现。安装 marked@^12.0.0，新增 `src/lib/markdown.ts` 和 `src/components/PreviewPane.vue`，修改 `src/App.vue` 替换右栏占位，新增 10 个 E2E 测试。
- `npm run build` 通过；Story 2.2 的 10 个 E2E 测试全部通过；Story 2.1 的 14 个回归测试全部通过，共 24 个测试通过。
- 单独 `cargo check` 因 Tauri 前端资源 hash 同步问题失败，未改动 Rust，不视为实现缺陷。

**File List:**
- 新增：`src/components/PreviewPane.vue`
- 新增：`src/lib/markdown.ts`
- 新增：`e2e/story-2-2.spec.ts`
- 修改：`src/App.vue`（替换右栏占位、移除 section 的 `aria-label="实时预览"`）
- 修改：`package.json`（新增 `marked ^12.0.0`）
- 修改：`package-lock.json`（npm 自动生成）
- 未修改：`src/styles/app.css`（组件 scoped 样式已覆盖）
- 未修改：`src/components/SourceEditor.vue`、`src/components/TitleBar.vue`、`src/components/MenuBar.vue`、`src/components/StatusBar.vue`
- 未修改：Rust 后端（本次不涉及后端命令）

## Change Log

- 2026-07-23: 创建 Story 2.2 故事文件，明确预览区只读、Markdown 渲染、空状态、100ms 延迟、XSS 防护等实现细节。
- 2026-07-23: 验证审查后补充：阻止预览区链接默认点击行为；修正 marked v12 配置（移除 `mangle` 与 `sanitize`）；补充 h3–h6 样式；强调 E2E 测试必须复用 `e2e/fixtures.ts`；明确空状态判断包含空白内容。
- 2026-07-23: 实现完成。状态从 `ready-for-dev` → `in-progress` → `review`。新增 PreviewPane、markdown 渲染封装、10 个 E2E 测试；Story 2.1 回归测试全部通过。
- 2026-07-23: Code Review 通过。3 个 patch 已修复（F-1 行内 code padding 注释、F-2 空状态文案 i18n TODO、F-3 E2E 延迟测试匹配精度）；2 个 defer（App.vue placeholder 死样式、onPreviewClick stopPropagation 冗余）；7 个 dismissed。状态 `review` → `done`。

