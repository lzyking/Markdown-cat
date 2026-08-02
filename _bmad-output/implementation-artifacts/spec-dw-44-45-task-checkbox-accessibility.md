---
title: '预览区任务 checkbox 可访问名称与 Tab 顺序修复（DW-44, DW-45）'
type: 'bugfix'
created: '2026-08-02'
status: 'done'
baseline_revision: '4904e58a4cf9d2c296be2c9acc8fe6ddb376153f'
final_revision: '985951637dbe429eb9afed7f1bbc8cf299147549'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** `src/lib/markdown.ts` 的 `TaskAwareRenderer.checkbox()` 仅输出裸 `<input type="checkbox">`，未关联同一 `<li>` 内的任务文本，屏幕阅读器读出的控件无可访问名称（DW-44）；同时 `src/components/PreviewPane.vue` 渲染的这些 checkbox 未移出原生 Tab 顺序，纯展示性预览区会为含多任务项的长文档新增大量 Tab 停靠点（DW-45）。

**Approach：** 在 `checkbox()` 中为每个 checkbox 生成稳定 id，并新增 `listitem()` 覆写：提取该任务项的纯文本（去除 HTML 标签后的内容）写入同一 `<input>` 的 `aria-label`，使屏幕阅读器读出任务文字本身；在 `src/lib/preview.ts` 的 `decoratePreviewHtml` 中为所有 `input[type="checkbox"][data-task-nonce]` 元素新增 `tabindex="-1"`，使其移出预览区的原生 Tab 顺序（该函数当前唯一调用方是 `PreviewPane.vue` 的 `renderPreviewHtml`，属于该组件的渲染管线）。

## Boundaries & Constraints

**Always:**
- `TaskAwareRenderer.checkbox()` 生成的 `<input>` 必须携带稳定且在同一次渲染内唯一的 `id`（如 `task-checkbox-${nonce}-${index}`），与既有 `data-task-nonce`/`data-task-index` 并存，不得替换或移除这两个既有属性（`PreviewPane.vue` 的点击校验逻辑依赖它们）。
- 新增 `TaskAwareRenderer.listitem(text, task, checked)` 覆写：当 `task` 为真时，从 `text` 中去除已知的、由本渲染器 `checkbox()` 生成的前导 `<input ...>` 字符串，对剩余部分执行简单的标签剥离（正则去除 `<[^>]+>`）与空白折叠/trim，得到纯文本后，把它写回同一个 `<input>` 标签的 `aria-label` 属性（对 `"` 做转义），再调用父类 `super.listitem(text, task, checked)` 输出最终 `<li>`；当 `task` 为假时行为不变，直接委托给 `super.listitem(...)`。
- checkbox id 与 aria-label 关联须使用一个类字段实现的**栈**（数组 push/pop），而非单一变量，以正确处理任务列表项内嵌套子列表（`checkbox()` 先 push，本项 `listitem()` 最终从栈顶 pop 出匹配 id）的调用顺序。
- `src/lib/preview.ts` 的 `decoratePreviewHtml` 必须新增一步：`root.querySelectorAll('input[type="checkbox"][data-task-nonce]')` 遍历，为每个元素 `setAttribute('tabindex', '-1')`，与现有 `table` 包裹、`img` 替换逻辑并列执行，不改变其执行顺序对既有行为的影响。
- 不得改变 `PreviewPane.vue` 中 `onPreviewClick` 的既有点击委托逻辑（`data-task-nonce`/`data-task-index` 校验、`toggle-task` emit）。
- 不得改变 `renderMarkdown` 的返回结构（`{ html, taskNonce }`）或 `MarkdownRenderResult` 接口。

**Block If:** 无需人工决策的已知阻塞条件——本任务范围内 DOM 结构与既有渲染管线清晰对应，无需暂停。

**Never:**
- 不将任务文本包裹进 `<label for="...">`：会改变现有点击委托的事件目标语义（label 点击会触发浏览器对关联控件的合成点击），超出本次 DW-44/DW-45 仅要求"可访问名称"与"移出 Tab 顺序"的范围，属于范围外行为变更。
- 不为嵌套任务列表内文本做精确的"仅本行、不含子列表"文本提取；`aria-label` 允许包含子列表纯文本这一已知的、可接受的粗粒度近似（低优先级缺陷范围内的合理简化）。
- 不改变 checkbox 的 `disabled`/可交互性、既有 CSS（`cursor: pointer` 等）或点击后触发的任务切换行为。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 单个顶层任务项 | Markdown `- [ ] 买牛奶` | 渲染出的 `<input>` 含 `aria-label="买牛奶"` 与 `tabindex="-1"` | 无异常 |
| 任务文本含内联格式 | Markdown `- [x] **重要**：修 bug` | `aria-label` 为标签剥离后的纯文本（如"重要：修 bug"），`checked` 属性保留 | 无异常 |
| 嵌套任务列表 | 父任务项下含子任务列表 | 父、子 checkbox 均各自获得与自身 `data-task-index` 对应、不串位的 `id`/`aria-label` | 无异常 |
| 围栏代码块内的类任务文本 | ```` ```\n- [ ] 不是任务\n``` ```` | 不计入 checkbox 索引，不受本次改动影响（沿用既有行为） | 无异常 |
| 非任务列表项 | Markdown `- 普通列表项` | `listitem()` 委托给 `super.listitem(...)`，无 `aria-label`/`tabindex` 相关改动 | 无异常 |

</intent-contract>

## Code Map

- `src/lib/markdown.ts` -- `TaskAwareRenderer` 新增 `listitem()` 覆写与 checkbox id 生成/栈式关联逻辑
- `src/lib/preview.ts` -- `decoratePreviewHtml` 新增 checkbox `tabindex="-1"` 设置步骤
- `e2e/story-7-1.spec.ts` -- 现有任务 checkbox 交互用例参考，确保无回归
- `e2e/story-9-1.spec.ts` -- 现有任务 checkbox 交互用例参考，确保无回归

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/markdown.ts` -- 为 `TaskAwareRenderer` 新增私有字段 `private pendingCheckboxIds: string[] = []`；修改 `checkbox(checked)`：生成 `id = task-checkbox-${this.nonce}-${index}`，`push` 进 `pendingCheckboxIds`，并在返回的 `<input>` 字符串中新增 `id="${id}"` 属性 -- 为每个 checkbox 建立可被同一列表项关联的稳定标识
- [x] `src/lib/markdown.ts` -- 新增 `listitem(text: string, task: boolean, checked: boolean): string` 覆写：`task` 为真时 `pop` 出对应 id，提取剩余文本（去除已知前导 checkbox HTML 后，正则剥离标签、折叠空白、trim、转义双引号），将 `aria-label="..."` 插入该 `<input>` 标签内，再返回 `super.listitem(...)` 结果；`task` 为假时直接返回 `super.listitem(text, task, checked)` -- 使任务 checkbox 获得以任务文字为内容的可访问名称（DW-44）
- [x] `src/lib/preview.ts` -- 在 `decoratePreviewHtml` 内、`return root.innerHTML` 之前新增：`root.querySelectorAll('input[type="checkbox"][data-task-nonce]').forEach((checkbox) => checkbox.setAttribute('tabindex', '-1'))` -- 使预览区 checkbox 移出原生 Tab 顺序（DW-45）
- [x] 新增/扩展单元测试（如 `src/lib/markdown.test.ts` 若存在，否则新建同风格测试文件）覆盖：单任务项 `aria-label` 内容、内联格式剥离后的纯文本、嵌套任务列表 id 不串位、非任务列表项不受影响 -- 覆盖 I/O 矩阵边界
- [x] 新增/扩展 `src/lib/preview.test.ts`（若存在同类测试文件）覆盖：`decoratePreviewHtml` 输出的任务 checkbox 含 `tabindex="-1"`，非任务 checkbox（若有）或普通元素不受影响 -- 覆盖 tabindex 行为
- [x] 运行 `npm run build` 验证无 TypeScript / 构建错误 -- 基本回归检查
- [x] 运行 `npx playwright test e2e/story-7-1.spec.ts e2e/story-9-1.spec.ts` 验证既有任务 checkbox 交互无回归 -- 确认点击切换、nonce 校验等行为未被破坏

**Acceptance Criteria:**
- Given Markdown 源码含一个未勾选任务项"买牛奶", when 该文档被渲染进预览区, then 对应 `<input type="checkbox">` 具有 `aria-label="买牛奶"` 且不含 `checked` 属性
- Given Markdown 源码含一个已勾选、文本含加粗格式的任务项, when 渲染进预览区, then 对应 checkbox 的 `aria-label` 为剥离 HTML 标签后的纯文本，且 `checked` 属性存在
- Given Markdown 源码含嵌套任务列表（父任务项下含子任务列表）, when 渲染进预览区, then 每个 checkbox 的 `aria-label` 内容与其自身 `data-task-index` 对应的任务文本一致，不与其他层级串位
- Given 预览区已渲染任意任务列表, when 检查该区域内 checkbox 元素的 DOM 属性, then 每个 checkbox 均含 `tabindex="-1"`
- Given 预览区任务 checkbox 已具备 `aria-label`/`tabindex="-1"`, when 用户像此前一样直接点击 checkbox, then `toggle-task` 事件仍正确触发，行为与改动前一致（无回归）

## Spec Change Log

## Review Triage Log

### 2026-08-02 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2 (medium 1, low 1)
- defer: 1 (low 1)
- reject: 6 (low 6)
- addressed_findings:
  - `[medium]` `[patch]` `decoratePreviewHtml` 是 `PreviewPane.vue` 与 `export-html.ts`（自包含 HTML 导出）共用的辅助函数；本次改动最初无条件为其内所有任务 checkbox 添加 `tabindex="-1"`，导致导出文档中的 checkbox（页面主要内容，非"被动展示预览区"）也被移出原生 Tab 顺序，超出 DW-45 仅针对预览面板的范围。已改为 `decoratePreviewHtml` 新增可选参数 `disableCheckboxTabbing`，仅 `PreviewPane.vue` 的调用处传入 `true`；`export-html.ts` 调用处保持不传，导出文档行为不变。新增两个单元测试分别覆盖"传入该选项时设置 tabindex"与"未传入时不触碰 tabindex"，并运行 `e2e/story-8-1.spec.ts` 确认导出 HTML 功能无回归。
  - `[low]` `[patch]` 仅含图片的任务项（如 `- [ ] ![alt](...)`）此前会被通用标签剥离正则整体去掉 `<img>` 标签及其 `alt` 文本，导致 `aria-label` 变为空字符串，反而比完全没有 `aria-label` 更不利于屏幕阅读。已在通用标签剥离之前，先将 `<img alt="...">` 替换为其 `alt` 文本内容，使图片任务项的可访问名称回退为图片描述。新增单元测试覆盖该场景。
  - deferred entry (see below) and rejected findings are noted for completeness, no code changes.
- deferred_findings:
  - `[low]` `[defer]` `TaskAwareRenderer` 通过 `pendingCheckboxIds` 栈把 `checkbox()` 与后续 `listitem()` 调用配对，正确性依赖 marked v12 当前"先调用一次 `checkbox()`，随后（含所有嵌套内容完全解析后）调用一次 `listitem()`"的内部调用顺序；若未来升级 marked 且改变该遍历/序列化顺序，此配对可能静默错位。本次改动的单元测试（含嵌套任务列表用例）已覆盖当前行为，属于可接受的既有库版本耦合风险，非本次改动引入的功能缺陷，记录以供未来升级 marked 时重点回归。
- rejected_findings（noise / 与 intent-contract 明确设计一致，不构成缺陷）:
  - 父任务项的 `aria-label` 会包含嵌套子任务的文本（如"Parent Child task"）—— 与 intent-contract "Never" 中"不为嵌套任务列表内文本做精确的仅本行、不含子列表提取；aria-label 允许包含子列表纯文本"的明确设计一致。
  - 同样的"父级吞并子级纯文本列表"现象对嵌套的非任务普通列表项同样成立 —— 与上一条相同的明确设计范围一致，未被排除。
  - 通过正则编辑已渲染 HTML 字符串而非基于结构化 token/DOM 派生标签 —— 属于实现风格偏好评价，非功能缺陷；current 单元测试与真实浏览器 e2e（Playwright）均验证了当前实现在既定场景下正确工作。
  - 嵌套任务回归测试仅断言父级 `aria-label` 包含"Parent"子串，被认为"过弱、放任子级文本混入" —— 该断言宽松度正是为了兼容 intent-contract 明确允许的"aria-label 允许包含子列表纯文本"设计，不构成测试缺陷。
  - 未新增"嵌套非任务子级污染父级 aria-label"的专项回归测试 —— 同上，该行为是明确允许的设计，无需专项测试固化。
  - `preview.test.ts` 使用手写的 FakeDOMParser/FakeElement 而非真实浏览器 DOM，被认为无法验证真实浏览器下的选择器匹配与序列化细节 —— 该风险已由同时运行的真实浏览器 Playwright e2e 测试（`e2e/story-7-1.spec.ts`、`e2e/story-9-1.spec.ts`、`e2e/story-8-1.spec.ts`）覆盖并通过，单元测试仅用于快速回归纯函数逻辑，两者互补，非缺陷。

## Auto Run Result

Status: done

**Summary:** 为预览区任务列表 checkbox 补充可访问名称并移出原生 Tab 顺序，解决 DW-44（缺少 accessible label/name）与 DW-45（预览区 checkbox 污染 Tab 顺序）。

**Files changed:**
- `src/lib/markdown.ts` -- `TaskAwareRenderer` 新增稳定 checkbox `id`、栈式 `pendingCheckboxIds` 关联与 `listitem()` 覆写，将任务纯文本（含图片 alt 文本兜底）写入对应 checkbox 的 `aria-label`
- `src/lib/preview.ts` -- `decoratePreviewHtml` 新增可选参数 `disableCheckboxTabbing`，仅在传入时为任务 checkbox 设置 `tabindex="-1"`
- `src/components/PreviewPane.vue` -- 调用 `decoratePreviewHtml` 时传入 `disableCheckboxTabbing: true`（`export-html.ts` 调用处不受影响）
- `src/lib/markdown.test.ts` -- 新增单元测试（单任务项、内联格式、嵌套任务列表、非任务列表项、图片 alt 兜底）
- `src/lib/preview.test.ts` -- 新增单元测试（`disableCheckboxTabbing` 开启/省略两种场景）

**Review findings breakdown:** patch 2（medium 1: 导出 HTML 意外继承 `tabindex="-1"`，已修复为选项化；low 1: 仅图片任务项 `aria-label` 为空，已用 alt 文本兜底修复）；defer 1（low: `pendingCheckboxIds` 栈式配对对 marked 内部调用顺序的耦合风险，供未来升级 marked 时留意）；reject 6（均与 intent-contract 明确设计一致或已由现有真实浏览器 e2e 覆盖的测试风格评价）。

**Verification performed:**
- `npm run build` -- 通过，无 TypeScript/构建错误
- `node --experimental-transform-types --test src/lib/markdown.test.ts src/lib/preview.test.ts` -- 7 项全部通过
- `npx playwright test e2e/story-7-1.spec.ts e2e/story-9-1.spec.ts` -- 11 项全部通过（既有任务 checkbox 点击/回写行为无回归）
- `npx playwright test e2e/story-8-1.spec.ts` -- 1 项通过（导出自包含 HTML 功能无回归，确认 `tabindex` 选项化未破坏导出）

**Residual risks:**
- `pendingCheckboxIds` 栈式配对依赖 marked v12 当前"每个任务列表项恰好先调用一次 `checkbox()`，随后（含全部嵌套内容解析完毕后）调用一次 `listitem()`"的内部顺序；已记录为低优先级 defer，供未来升级 marked 版本时重点回归。
- 嵌套任务/列表场景下父级 `aria-label` 可能包含子级纯文本（intent-contract 明确允许的粗粒度近似），非精确的单行文本提取。

