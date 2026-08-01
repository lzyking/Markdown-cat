---
id: 7-1-slash-command-task-list
title: Add Task List Option to Slash Command Popup
epic: epic-7
status: done
baseline_revision: dcbeb862bebb904a5cf636d06045520e56b293d0
final_revision: 8bf2058fb146b8038acb9cd15bf755879197fa47
followup_review_recommended: false
review_loop_iteration: 0
---

# Story 7.1: Add Task List Option to Slash Command Popup

## Story Description
作为用户，当我输入 `/` 触发语法提示菜单时，能够快捷选择 `- [ ]` 任务列表指令，提高 Markdown 待办事项的书写效率。

## Acceptance Criteria
1. **Slash 菜单项扩充**: 在 `/` 快捷弹出框列表中新增选项：`- [ ] Task List (任务列表)`。
2. **快捷插入**: 选中该项（点击或键盘方向键 + Enter）后，在编辑器光标当前行首自动插入 `- [ ] ` 文本，并将光标移动到复选框后面。
3. **渲染支持**: 预览区渲染出可互动的 Checkbox 待办列表元素。

## Code Map

- `src/components/SlashMenu.vue` -- slash 快捷菜单项定义，新增 `task` 条目
- `src/components/SourceEditor.vue` -- `insertTemplate` 插入逻辑（无需改动，已满足 AC2）
- `src/App.vue` -- `onSlashSelect` 分发插入，新增 `onToggleTask` 处理预览区勾选回写
- `src/lib/markdown.ts` -- `marked` 自定义 `TaskAwareRenderer`，输出可交互（非 disabled）checkbox，附带每次渲染独立的 `data-task-nonce` + `data-task-index`
- `src/components/PreviewPane.vue` -- 预览区点击处理扩展，捕获 checkbox 点击并 emit `toggle-task`
- `e2e/story-7-1.spec.ts` -- 新增端到端测试覆盖 AC1/AC2/AC3
- `e2e/story-5.spec.ts` -- 更新菜单项数量断言以适配新增条目

## Tasks & Acceptance

**Execution:**
- [x] `src/components/SlashMenu.vue` -- 新增 `- [ ] Task List 任务列表` 菜单项 -- 满足 AC1
- [x] `src/App.vue` / `src/components/SourceEditor.vue` -- 确认现有插入逻辑（无 cursorOffset）满足行首插入及光标定位 -- 满足 AC2
- [x] `src/lib/markdown.ts` -- 覆盖 `checkbox` 渲染器，移除 `disabled`，附加 `data-task-index` -- 满足 AC3（渲染可交互元素）
- [x] `src/components/PreviewPane.vue` + `src/App.vue` -- 预览区点击勾选框回写 markdown 源码 -- 满足 AC3（可互动）
- [x] `e2e/story-7-1.spec.ts` -- 新增插入与勾选回写的自动化验证
- [x] `e2e/story-5.spec.ts` -- 同步更新既有菜单数量断言

**Acceptance Criteria:**
- Given 编辑器为空且光标在文档起始位置, when 按下 `/` 并选择 "Task List 任务列表", then 光标位置自动插入 `- [ ] ` 且光标停在复选框标记之后 -- 验证于 `e2e/story-7-1.spec.ts`
- Given 预览区渲染了任务列表, when 点击其中一个 checkbox, then 对应行在源码中的 `[ ]`/`[x]` 状态被切换，编辑器与预览同步更新 -- 验证于 `e2e/story-7-1.spec.ts`

## Spec Change Log

（空 — 本轮 review 未触发 bad_spec 回环）

## Review Triage Log

### 2026-08-01 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 1high, medium 1medium, low 2low)
- defer: 3: (medium 1medium, low 2low)
- reject: 2: (low 2low)
- addressed_findings:
  - `[high]` `[patch]` 预览区 checkbox 点击处理只按 `data-task-index` 匹配，攻击者可在 Markdown 源码中手写原始 `<input data-task-index>` 伪造/劫持任意行的勾选状态 -- 修复：`renderMarkdown` 改为每次渲染生成随机 nonce (`data-task-nonce`)，预览区点击时校验 nonce 与本次渲染一致才触发 `toggle-task`，手写 HTML 无法预测该值
  - `[medium]` `[patch]` `TASK_LIST_LINE_PATTERN` 未覆盖引用块（blockquote）内的任务项，如 `> - [ ] quoted task`，导致预览区渲染出勾选框但点击无效（no-op） -- 修复：正则扩展为 `/^(\s*(?:>\s*)*(?:[-*+]|\d+\.)\s+)\[([ xX])\](.*)$/`，并新增 e2e 用例验证
  - `[low]` `[patch]` `src/lib/markdown.ts` 中 `taskCheckboxIndex` 为模块级可变状态，理论上存在重入/并发渲染错乱风险 -- 修复：改为每次 `renderMarkdown()` 调用创建独立的 `TaskAwareRenderer` 实例并通过 `marked.parse(source, { renderer })` 传入，消除模块级共享状态
  - `[low]` `[patch]` 新增 E2E 覆盖缺少 AC2 提到的键盘方向键 + Enter 选中路径 -- 修复：`e2e/story-7-1.spec.ts` 新增 `应可通过键盘方向键 + Enter 选中任务列表菜单项` 用例
- deferred_to `{implementation_artifacts}/deferred-work.md`:
  - `[medium]` `SourceEditor.insertTemplate` 仅替换触发用的 `/` 字符，并非真正"行首插入"；若光标在行中间触发 slash 菜单，插入内容会拼接在光标处而非行首。此为 ul/ol/quote 等既有菜单项共享的历史行为，非本故事引入，需要单独的规格决策后再统一修复。
  - `[low]` 渲染出的 checkbox 缺少可访问的 label/name，只有小方框本身可点击，点击任务文字本身无效果，可访问性有提升空间。
  - `[low]` 预览区新增的 checkbox 会加入原生 Tab 焦点顺序，使原本作为被动展示区域的预览面板新增多个可聚焦停靠点，可能影响整体键盘导航体验。
- rejected (noise):
  - “预览区允许 checkbox 交互与 Story 2.2 的『只读预览』定位存在冲突” -- AC3 明确、无歧义地要求“可互动的 Checkbox”，不构成需要人工澄清的 intent gap，视为对本故事既定范围的合理演进
  - “`onToggleTask` 把 `[X]` 大写勾选标记归一化为小写 `[x]`” -- 属于可接受的格式规范化，非功能性缺陷

### 2026-08-01 — Review pass (follow-up)
- intent_gap: 0
- bad_spec: 0
- patch: 1: (high 1high)
- defer: 1: (medium 1medium)
- reject: 4: (low 4low)
- addressed_findings:
  - `[high]` `[patch]` `onToggleTask` 的 `TASK_LIST_LINE_PATTERN`/围栏跟踪缺失导致预览区 checkbox 索引与真实渲染任务顺序错位：(1) 有序列表使用 `)` 分隔符（如 `1) [ ] task`）时 marked 会渲染出可点击 checkbox，但正则只匹配 `\d+\.`，导致该任务不被计入索引；(2) 围栏代码块（```` ``` ````/`~~~`）内形如 `- [ ] xxx` 的纯文本会被正则误判为任务行并计入索引，而 marked 并不会为其渲染 checkbox。两者都会造成点击预览区某个 checkbox 时源码里被翻转的其实是另一行 -- 修复：`TASK_LIST_LINE_PATTERN` 扩展为 `\d+[.)]` 同时支持 `.`/`)` 有序分隔符；`onToggleTask` 新增围栏状态跟踪（`FENCE_LINE_PATTERN` 匹配 ```` ``` ````/`~~~` 起止行时切换 `inFence`），围栏内的行不再参与任务计数；新增 e2e 用例覆盖 `1) [ ]` 有序任务与围栏代码块内类任务文本两种场景
- deferred_to `{implementation_artifacts}/deferred-work.md`:
  - `[medium]` 预览区 checkbox 点击通过整体重写 `content.value` 驱动 `SourceEditor` 的 `watch` 走全量替换事务（`from:0 to:doc.length`），而非仅针对被切换行的局部编辑；该全量替换机制是应用既有的、跨多个菜单项共享的内容同步方式（非本次改动引入），但作为更细粒度的预览交互，会对大文档产生不必要的撤销历史/滚动位置扰动，值得单独评估。
- rejected (noise):
  - “`renderMarkdown`/`nonce` 未定义、无法通过类型检查” -- 经核对 `src/lib/markdown.ts` 实际文件内容，`nonce` 已正确声明并使用，函数正确返回 `{ html, taskNonce }`；该结论源于审查时提供的 diff 片段在文本层面的拼接失真，非真实代码缺陷（已通过 `npm run build` 验证无报错）
  - “CRLF 文档中切换任务会导致行尾统一改写为 LF” -- 经核对，`split('\n')` 不会剥离 `\r`，`\r` 会保留在匹配到的 `rest` 捕获组内，`join('\n')` 会还原原始 `\r\n`，不存在行尾丢失
  - “`insertTemplate`/无障碍 label/Tab 焦点顺序” 三项 -- 均为上一轮 review 已记录在 `deferred-work.md` 的既有条目，本轮重复发现，不追加新条目
  - “`story-5.spec.ts` 断言被弱化为仅计数/存在性检查” -- 低严重度、无功能性风险的测试写法偏好，非缺陷

## Verification

**Commands:**
- `npm run build` -- expected: `vue-tsc --noEmit && vite build` 无报错，构建成功（已验证通过）
- `npx playwright test` -- expected: 全部通过（本次运行 87/87 passed，涵盖 story-7-1.spec.ts 新增的 6 个用例，含本轮新增的 2 个边界场景）

## Auto Run Result

Status: done

_Appended by the bmad-loop orchestrator (missing-marker repair, #224): the session finalized this spec's frontmatter without its `## Auto Run Result` marker, so the orchestrator synthesized the result from the frontmatter and appended this section._

Synthesized by the bmad-loop orchestrator from frontmatter status `done` for story `7-1-slash-command-task-list` (session finalized the spec without appending its marker).
