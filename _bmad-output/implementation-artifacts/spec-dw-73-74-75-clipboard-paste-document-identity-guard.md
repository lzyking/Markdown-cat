---
title: '剪贴板粘贴图片链路：文档身份守卫与编辑器实例隔离（DW-73, DW-74, DW-75）'
type: 'bugfix'
created: '2026-08-03'
status: 'done'
review_loop_iteration: 1
baseline_revision: '093e74a8d16ea7a669b20da37f8b59d7a00bb132'
final_revision: '19c66d694d478733e541a5305a09d9fcadd12be4'
followup_review_recommended: false
context: []
warnings: ['multiple-goals']
---

<intent-contract>

## Intent

**Problem:** `handleClipboardImagePaste`（`src/App.vue`）在 `save_image_asset` 异步保存期间不做任何"文档是否还是发起粘贴时的那个文档"的校验，也不检查 `sourceEditorRef.value` 在成功分支是否真的可用，导致：用户中途切换/打开另一个文件时图片引用会被插入错误文档；`sourceEditorRef.value` 不可用时仍报告"成功"但实际未插入。同时 `SourceEditor.vue` 的 `positionTokenSeq`/`trackedPastePositions` 只是组件级状态，`<script setup>` 每次组件实例化都会重新从 0 计数，若编辑器被卸载后重新挂载，旧实例遗留的异步回调可能携带与新实例编号重合的 token，导致新实例把图片错误地插入到自己映射表中巧合命中的位置。

**Approach:** 在 `src/App.vue` 引入一个随"切换到不同文档"（打开文件、拖拽导入、启动时恢复会话）而递增的 `activeDocumentId`；`handleClipboardImagePaste` 在发起粘贴时记下该值，`save_image_asset` resolve 后仅当该值未变化才插入引用，否则跳过插入并给出区别于成功/失败保存的专门提示；同时只有 `sourceEditorRef.value` 存在且确实执行了插入，才把 `saveStatus` 置为 `success`。在 `SourceEditor.vue` 中为每个组件实例生成一个唯一 `editorInstanceId`（`crypto.randomUUID()`，在 setup 执行时求值一次，因此天然随每次重新挂载而变化），并将其编入 `positionToken`（由纯数字改为 `${editorInstanceId}:${seq}` 字符串），使不同实例签发的 token 在字符串层面永不相等，从根本上消除跨实例编号巧合碰撞的可能。

## Boundaries & Constraints

**Always:**
- `activeDocumentId` 必须在每一个"替换为不同文档内容"的入口处递增：`loadFileFromPath` 成功分支、`onFileDrop` 无文件路径（浏览器拖拽的降级）分支、应用启动时恢复会话的两个分支（成功恢复上次文件 / 回退到空白文档）。
- `handleClipboardImagePaste` 必须在函数刚开始（任何 `await` 之前）捕获 `activeDocumentId.value` 到局部变量，作为"发起粘贴时的文档身份"。
- 保存成功但文档身份已变化时：调用 `sourceEditorRef.value?.releasePositionToken(...)` 释放 token（避免残留），把 `saveStatus` 置为 `'failure'`，并用一条明确指出"图片已保存但因文档切换未插入引用"的独立提示信息（不同于原有的保存失败提示文案，也不同于原有的成功提示文案）。
- 只有 `sourceEditorRef.value` 存在、文档身份未变化、且已实际调用 `insertText` 之后，才允许把 `saveStatus` 置为 `'success'`。
- `SourceEditor.vue` 的 `positionToken` 类型改为 `string`（连同 `ClipboardImagePayload.positionToken`、`insertText`、`releasePositionToken` 的形参类型同步改为 `string | undefined`），`trackedPastePositions` 的键类型同步改为 `string`。
- `editorInstanceId` 必须在组件 `<script setup>` 顶层求值一次（每次组件实例化各自求值一次，而不是模块级共享一份），确保重新挂载出的新实例天然获得不同取值。
- 不得改变现有的选区映射（mapPos/bias）逻辑、`insertText` 的 slash 替换逻辑、以及粘贴事件对混合内容的放行策略——本次改动只涉及"身份识别与校验"，不得动"如何编辑文档"的既有算法。

**Block If:** 无（现有代码路径与既定架构已足以完成本次修复，无需人工决策）。

**Never:**
- 不引入编辑器多实例/多文档标签页等新架构；`SourceEditor` 仍是应用中长期存活的单一实例，`editorInstanceId` 只是为潜在的卸载/重挂载场景提供防御，不需要新增任何触发卸载/重挂载的功能。
- 不为了这次修复而给 `SourceEditor` 增加 `documentId`/`key` prop 或让其感知具体文档路径——文档身份判断留在 `App.vue` 层面。
- 不删除或弱化任何既有的成功/失败提示分支，只新增"文档已切换"这一第三种结果分支。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 粘贴期间未切换文档 | 粘贴发起后 `activeDocumentId` 全程不变，`save_image_asset` 成功，`sourceEditorRef.value` 可用 | 按原逻辑插入 `![Image](...)` 引用，`saveStatus = 'success'` | 无 |
| 粘贴期间切换到另一文档 | `save_image_asset` 正在进行时用户打开了另一个文件（`activeDocumentId` 递增） | 不调用 `insertText`；调用 `releasePositionToken` 释放 token；`saveStatus = 'failure'`；`saveMessage` 明确说明图片已保存但因文档切换未插入 | 视为非致命：磁盘文件已写入，只是未插入引用 |
| `save_image_asset` 保存失败 | `saveRes.ok` 为 false | 保持原有行为：释放 token，`saveStatus = 'failure'`，展示后端错误信息 | 沿用 `formatSaveError` |
| 保存成功但 `sourceEditorRef.value` 不可用（文档身份未变） | `sourceEditorRef.value` 为 `null`/`undefined` | 不调用 `insertText`；`saveStatus = 'failure'`；`saveMessage` 说明图片已保存但编辑器不可用、未插入引用 | 不抛异常，正常 return |
| 编辑器组件被卸载并重新挂载后，旧实例的粘贴 token 才 resolve | 旧实例 `editorInstanceId = A`，其 `positionToken` 为 `"A:1"`；新实例 `editorInstanceId = B`，自己也签发了 `"B:1"` | 新实例的 `trackedPastePositions` 中查找 `"A:1"` 找不到匹配项（因为键是 `"B:1"` 等 B 前缀的字符串），`insertText` 按“未追踪到该 token”的既有降级路径处理（退回当前选区），不会误命中 B 实例下编号巧合为 1 的追踪位置 | 不抛异常 |

</intent-contract>

## Code Map

- `src/App.vue` -- 新增 `activeDocumentId` ref 及其在各文档切换入口的递增；`handleClipboardImagePaste` 增加发起时身份捕获、结果分支的身份校验与 `sourceEditorRef` 可用性校验。
- `src/components/SourceEditor.vue` -- 新增按组件实例求值一次的 `editorInstanceId`；`positionToken`/`trackedPastePositions` 由纯数字改为 `${editorInstanceId}:${seq}` 字符串键。
- `src/lib/types.ts` -- `ClipboardImagePayload.positionToken` 类型由 `number` 改为 `string`。
- `e2e/story-7-2.spec.ts` -- 参照该文件已有的 `save_image_asset` 断言与 `dispatchClipboardImagePaste` 帮助函数模式，追加覆盖"粘贴中途切换文档"与"编辑器不可用"两种新分支的用例。

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/types.ts` -- 将 `ClipboardImagePayload.positionToken` 类型从 `number` 改为 `string` -- 承载新的 `${instanceId}:${seq}` 复合 token 格式
- [x] `src/components/SourceEditor.vue` -- 引入 `editorInstanceId`（`crypto.randomUUID()`，setup 顶层求值一次）；`positionTokenSeq` 改为拼接 `editorInstanceId` 生成字符串 token；`trackedPastePositions` 键类型、`insertText`/`releasePositionToken` 形参类型同步改为 `string`；`insertText` 的返回类型改为 `boolean`：`if (!view) return false`，函数正常完成 dispatch 后 `return true` -- 使不同组件实例签发的 token 永不因数值重合而互相碰撞，并让调用方能区分"确实插入过"与"因内部 view 不存在而静默跳过"
- [x] `src/App.vue` -- 新增 `activeDocumentId` ref（初值 `0`），在 `loadFileFromPath` 成功分支、`onFileDrop` 的无路径降级分支、启动时恢复会话的两个分支（成功恢复 / 回退空白文档）中各自递增 -- 为"当前文档"建立可比较的身份标识
- [x] `src/App.vue` -- 重写 `handleClipboardImagePaste`：函数开头捕获 `pasteOriginDocumentId = activeDocumentId.value`；`save_image_asset` 成功后先判断 `activeDocumentId.value !== pasteOriginDocumentId`（不一致则释放 token、置失败、给出"已保存但因切换未插入"提示并 return）；否则调用 `const inserted = sourceEditorRef.value?.insertText(...) ?? false`（**不要**先单独判断 `sourceEditorRef.value` 是否存在再据此判定成功——`sourceEditorRef.value` 存在时其内部 CodeMirror `view` 仍可能为 `null`，此时 `insertText` 会静默返回 `false` 而不抛错，必须依据其**返回值**而非 ref 是否存在来判定插入是否真的发生）；当 `inserted` 为 `false` 时释放 token（`sourceEditorRef.value?.releasePositionToken(...)`）、置失败、给出"已保存但编辑器不可用"提示并 return；只有 `inserted` 为 `true` 才置 `success` -- 消除错误文档插入与虚假成功报告，包括"ref 存在但内部 view 已销毁"这一此前遗漏的边界情况
- [x] `e2e/story-7-2.spec.ts` -- 新增三个用例：(1) 用 `__registerHandler('save_image_asset', ...)` 返回一个受控 Promise，在其 resolve 前触发一次文档切换（如 `read_external_document` 走 `loadFileFromPath` 等价的 UI 操作或直接调用暴露的测试钩子切换 `currentFilePath`），断言 resolve 后编辑器内容未插入图片引用且状态提示为"已保存但未插入"文案；(2) 覆盖 `sourceEditorRef` 整体不可用（如置为 `null`）时保存成功但不算作 `success` 状态；(3) 覆盖 `sourceEditorRef.value` 存在但其 `insertText` 返回 `false`（模拟内部 `view` 已销毁，例如通过测试钩子替换为一个 `insertText` 返回 `false` 的桩对象）时同样不得报告 `success` -- 锁定 DW-73/DW-75 行为不再回归，尤其是"ref 存在但插入未真正发生"这一新覆盖的边界情形

**Acceptance Criteria:**
- Given 用户粘贴图片且 `save_image_asset` 尚未返回时打开了另一个文件, when 保存最终成功返回, then Markdown 图片引用不会被插入到新打开的文件中，且状态提示明确说明"已保存但未插入".
- Given 用户粘贴图片且全程未切换文档, when `save_image_asset` 成功返回, then 图片引用被正确插入到发起粘贴的文档中，状态为 `success`.
- Given `sourceEditorRef.value` 在保存成功回调时整体不可用（为 `null`）, when 到达原插入分支, then `saveStatus` 不会被置为 `success`，且不调用 `insertText`.
- Given `sourceEditorRef.value` 存在但其 `insertText` 因内部 `view` 已不存在而返回 `false`（未真正插入）, when 到达原插入分支, then `saveStatus` 依然不会被置为 `success`——判定依据必须是 `insertText` 的返回值，而非仅凭 `sourceEditorRef.value` 是否为真值.
- Given 一个 `SourceEditor` 实例被卸载后又重新挂载出新实例, when 旧实例遗留的异步粘贴流程调用新实例暴露的 `insertText`/`releasePositionToken` 并带着旧实例签发的 token, then 新实例不会因编号巧合而命中自己映射表中不相关的追踪位置.

## Design Notes

`activeDocumentId` 只是一个单调递增计数器，不需要携带具体路径信息——它的唯一职责是回答"粘贴发起后，当前文档是否还是同一个文档实例"这一个布尔问题，因此用 `ref(0)` + 每次切换 `+= 1` 即可，无需引入 UUID 或路径比较（路径比较无法区分"新建的两个未保存空白文档"这种边缘情况）。

`editorInstanceId` 使用 `crypto.randomUUID()` 而非模块级自增计数器，是因为 `<script setup>` 顶层声明的变量在 Vue 3 中每次组件实例化都会重新求值（相当于运行在 `setup()` 函数体内），如果沿用当前 `let positionTokenSeq = 0` 那种写法作为实例标识起点，重新挂载后同样会从相同初值重新计数，起不到区分实例的效果；随机 UUID 天然满足"每个实例各自不同"且无需额外的模块级共享状态。

`insertText` 必须返回 `boolean` 而不是 `void`：`sourceEditorRef.value` 是暴露给父组件的组件实例代理，只要子组件未被销毁它就是"真值"，但其内部的 CodeMirror `view` 变量可能因为尚未 `onMounted` 或已经 `onUnmounted` 而为 `null`——此时 `insertText` 现有的 `if (!view) return` 会静默什么都不做。若调用方只判断 `sourceEditorRef.value` 是否存在就断定插入成功，会在"ref 存在但 view 为 null"这一窄边界下产生假成功。让 `insertText` 如实返回它是否真的执行了 dispatch，调用方据此判断，才能同时覆盖"ref 不存在"与"ref 存在但内部未就绪/已销毁"两类场景。

## Spec Change Log

### 2026-08-03 — Review pass 1（bad_spec 修复）

- **触发发现：** 两个独立评审子代理（Blind Hunter 与 Edge Case Hunter）各自独立发现同一个问题：`handleClipboardImagePaste` 的"编辑器不可用"守卫只判断了 `sourceEditorRef.value` 是否为真值，但 `SourceEditor.vue` 的 `insertText` 在内部 CodeMirror `view` 为 `null`（组件实例存在但尚未挂载完成或已销毁）时会静默 `return` 而不抛错、也不返回任何可判断的值；因此当 `sourceEditorRef.value` 恰好非空但其内部 `view` 为空时，代码会误判"插入已发生"并把 `saveStatus` 置为 `success`，这正是 DW-75 要求消除的"虚假成功报告"的一个未覆盖分支。
- **已修改内容：** 
  - `Tasks & Acceptance` 中 `SourceEditor.vue` 任务新增要求：`insertText` 返回 `boolean`（内部 `view` 为空时返回 `false`，否则返回 `true`）。
  - `Tasks & Acceptance` 中 `App.vue` 任务改为要求依据 `insertText` 的**返回值**（而非 `sourceEditorRef.value` 是否为真值）判断插入是否真的发生。
  - 新增一条 Acceptance Criteria，专门覆盖"`sourceEditorRef.value` 存在但 `insertText` 返回 `false`"这一边界情形。
  - `e2e` 任务从两个用例扩展为三个，新增对上述边界情形的专门覆盖。
  - `Design Notes` 补充了 `insertText` 为何必须返回 `boolean` 的设计说明。
- **避免的已知坏状态：** 若不修复，代码会在"组件实例存在但内部编辑器未就绪/已销毁"这一窄边界下报告保存成功，而 Markdown 引用实际未被插入，用户会误以为图片已正确关联到文档。
- **KEEP（本轮之前已验证正确、须原样保留的部分）：**
  - `activeDocumentId` 的引入位置与递增时机（`loadFileFromPath` 成功分支、`onFileDrop` 无路径降级分支、启动恢复会话的两个分支）——已被两个评审代理确认为覆盖了 DW-73 描述的所有文档切换入口，无需改动。
  - `editorInstanceId` 使用 `crypto.randomUUID()` 在 `<script setup>` 顶层求值一次的做法，以及 `positionToken` 由数字改为 `${editorInstanceId}:${seq}` 字符串复合键的方案——已被确认能从根本上消除跨实例编号巧合碰撞（DW-74 的核心诉求），无需改动。
  - "文档身份不一致时跳过插入并释放 token、给出专门提示"的分支逻辑与提示文案——保持不变。
  - 现有 `e2e/story-7-2.spec.ts` 中两个已验证通过的新增用例（DW-73 切换文档、DW-75 ref 为 `null`）的测试模式（`registerPendingSaveImageAsset`/`resolvePendingSaveImageAsset`/`openFileFromMenu` 等辅助函数）——保留并在此基础上追加第三个用例，不重新设计测试基础设施。

## Review Triage Log

### 2026-08-03 — Review pass
- intent_gap: 0
- bad_spec: 1 (high 0, medium 1, low 0)
- patch: 0
- defer: 2 (high 2, medium 0, low 0)
- reject: 4 (high 0, medium 0, low 4)
- addressed_findings:
  - `[medium]` `[bad_spec]` "编辑器不可用"守卫仅判断 `sourceEditorRef.value` 真值、未判断 `insertText` 是否真的执行了插入（`view` 为 `null` 时静默无操作），导致"ref 存在但内部 view 为空"边界下误报 `success`——已修订 Tasks/Acceptance/Design Notes，要求 `insertText` 返回 `boolean` 并据此判断，随后重新推导实现。

### 2026-08-03 — Review pass 2
- intent_gap: 0
- bad_spec: 0
- patch: 1 (high 0, medium 0, low 1)
- defer: 3 (high 0, medium 2, low 1)
- reject: 2 (high 0, medium 0, low 2)
- addressed_findings:
  - `[low]` `[patch]` 两条"保存成功但未插入"的失败提示文案未包含实际写盘的文件名（`saveRes.data.filename`），用户在补救时无法定位已孤立保存的图片文件——已直接修订 `App.vue` 两处 `saveMessage.value`，将 `actualFilename` 拼入提示文案，并同步更新 `e2e/story-7-2.spec.ts` 中对应的三处断言（`toHaveText` 改为匹配含文件名的正则）。已用 `vue-tsc --noEmit` 与 `playwright test`（`story-7-2.spec.ts` 9/9、全量 112/112）验证无回归。
- deferred_findings（未写入 deferred-work.md——遵照用户明确指示，该账本由编排器统一维护；以下仅作叙述性记录，供编排器后续参考）：
  - `[medium]` `activeDocumentId` 仅在 `read_external_document` **成功返回**后才递增；若一次图片粘贴的 `save_image_asset` 在此期间完成并先行落盘/插入到"仍在显示的旧文档"，随后慢速加载完成时会用新文档内容整体覆盖 `content.value`，连带丢弃刚插入的图片引用。这是"文档加载对并发编辑的整体覆盖"这一更广泛的、先于本次改动已存在的问题类别的一个实例，不由本次身份守卫改动引入，也不在 DW-73/74/75 账本条目的字面范围内（账本聚焦 `save_image_asset` 悬挂期间的身份判定，而非加载完成后的整体覆盖语义）。
  - `[medium]` "Save As 期间发生保存图片"场景下，`targetDir`/相对路径在 `handleClipboardImagePaste` 早期即被快照，若用户此时执行"另存为"改变了 `currentFilePath`，成功保存的图片可能仍落在旧目录、Markdown 引用给出的相对路径与新文档实际所在目录不一致——pass 1 评审已发现并判定为账本字面范围之外的预置问题（DW-73/74/75 仅描述"切换文档"与"卸载/重新挂载编辑器"两类场景，未提及"另存为迁移"），pass 2 两个评审代理再次独立复现，维持同一判断，仍为 defer。
  - `[low]` `onFileDrop` 中"拖入的浏览器 File 无 `path`"降级分支只递增了 `activeDocumentId`，未清空 `currentFilePath`；这是本次改动之前就存在的行为（本次 diff 未触及该分支的 `currentFilePath` 逻辑），理论上可能让下一次粘贴图片错误地沿用上一个真实文档的目录作为保存目标。判定为与本次身份守卫改动无关的预置问题，defer。
- rejected_findings:
  - `[low]` `pasteOriginDocumentId` 在 `SourceEditor.vue` 的 `emitClipboardImage` 完成异步 `FileReader.readAsDataURL` 之后才通过 `imagePaste` 事件传给 `App.vue`，理论上存在"粘贴发生"到"`App.vue` 捕获文档身份"之间的极窄异步窗口，若在此窗口内切换文档则身份捕获会落在错误的（新）文档上。经评估：`FileReader` 读取内存中的 `Blob` 通常在个位数毫秒级完成，触发窗口远小于 DW-73 账本明确针对的 `save_image_asset`（磁盘/IPC 往返，通常数十至数百毫秒）异步窗口；账本原文与本 spec 的 Approach/Boundaries 明确将"待完成的 `save_image_asset` 调用"列为需要防护的异步窗口，未涵盖粘贴事件分发前的浏览器内部解码延迟。判定为超出本轮账本字面范围的低概率理论风险，reject（而非升级为新一轮 bad_spec）。
  - `[low]` "`positionToken` 在当前编辑器实例上已不存在时，`insertText` 回退到当前实时光标位置插入"——与 pass 1 评审的判定重复：当前代码库中 `SourceEditor` 是应用生命周期内唯一持续存在的组件实例（无 `v-if`/`:key` 触发的重新挂载路径），因此该回退分支是 DW-74 描述场景下已记录在案的防御性、目前不可达的兜底行为，非本次改动引入的新问题，reject。

## Verification

**Commands:**
- `npm run test:e2e -- story-7-2` -- expected: 全部通过，包括新增的三个用例
- `vue-tsc --noEmit` -- expected: 无类型错误（尤其确认 `positionToken` 由 `number` 改为 `string` 后各处调用点类型一致）

**Manual checks (if no CLI):**
- 若上述命令因环境限制无法执行（例如 Playwright 浏览器未安装），在 PR 描述或验证记录中说明具体限制，并确保改动本身通过代码审查确认逻辑正确。

## Auto Run Result

**Summary:** 实现了 `_bmad-loop` 束 `clipboard-paste-document-identity-guard`（DW-73/74/75）的完整修复，经过 2 轮实现 + 2 轮独立并行对抗性评审（Blind Hunter + Edge Case Hunter）后收敛：`App.vue` 新增随文档切换（打开文件、拖拽导入、启动恢复会话）递增的 `activeDocumentId`，`handleClipboardImagePaste` 在发起粘贴时快照该值，`save_image_asset` resolve 后仅当文档身份未变且 `insertText` 确实返回成功（而非仅判断 `sourceEditorRef.value` 真值）时才插入 Markdown 引用，否则给出区分文档已切换/编辑器不可用的专门提示（现已包含实际保存的文件名以便手动找回）；`SourceEditor.vue` 为每个组件实例生成唯一 `editorInstanceId`（`crypto.randomUUID()`），并将其编入 `positionToken`（`${editorInstanceId}:${seq}` 字符串复合键），从根本上消除跨实例编号巧合碰撞。

**Files changed:**
- `src/App.vue` — 新增 `activeDocumentId`；重写 `handleClipboardImagePaste` 增加文档身份守卫与基于 `insertText` 返回值的插入成功判定；失败提示文案补充实际文件名；新增测试专用钩子 `__LOAD_FILE_FROM_PATH__`/`__SET_SOURCE_EDITOR_REF__`。
- `src/components/SourceEditor.vue` — 新增 `editorInstanceId`；`positionToken` 由 `number` 改为 `${editorInstanceId}:${seq}` 字符串；`insertText` 改为返回 `boolean`（内部 `view` 为空返回 `false`）。
- `src/lib/types.ts` — `ClipboardImagePayload.positionToken` 类型由 `number` 改为 `string`。
- `e2e/story-7-2.spec.ts` — 新增 3 个用例（切换文档中途保存、`sourceEditorRef` 为 `null`、`insertText` 返回 `false`），并配套新增测试辅助函数；同步更新 pass 2 补丁引入的文案断言。

**Review findings breakdown:**
- Pass 1：bad_spec 1（已修复并重新推导实现）、defer 2、reject 4。
- Pass 2：patch 1（已直接修复：失败提示补充文件名）、defer 3（均为预置于本次改动之前、超出账本字面范围的问题：文档加载完成后整体覆盖并发编辑内容、Save As 迁移期间的图片目录漂移、`onFileDrop` 无路径分支未清空 `currentFilePath`）、reject 2（FileReader 解码延迟的极窄理论竞态、陈旧 token 回退到实时光标的既有防御性行为）。
- 遵照用户明确指示：**未**写入 `_bmad-output/implementation-artifacts/deferred-work.md`（该账本由编排器统一维护解决状态）；上述 defer 项仅在此处叙述性记录，供编排器后续参考决定是否登记为新的账本条目。

**Follow-up review recommendation:** `false` — 最终一轮（pass 2）仅有一处低严重度、纯文案层面的机械修补（补充文件名），未涉及行为/API/安全/数据面的变更，不足以构成需要独立复评的量级。

**Verification performed:**
- `vue-tsc --noEmit`：两轮实现及 pass 2 补丁后均执行，全部通过，无类型错误。
- `playwright test e2e/story-7-2.spec.ts`：pass 2 补丁后 9/9 通过。
- `playwright test`（全量）：112/112 通过，无回归。

**Residual risks:**
- 上述 3 项 pass 2 defer 发现（文档加载整体覆盖并发编辑、Save As 迁移期间目录漂移、`onFileDrop` 无路径分支未清空 `currentFilePath`）均为预置问题，建议编排器后续视情况登记为新的独立账本条目并安排单独的故事修复。
- FileReader 解码延迟窗口的理论竞态已评估为账本字面范围之外的低概率风险，若未来产品需求收紧到"零容忍任何窗口"，需要重新审视 `pasteOriginDocumentId` 的捕获时机（可考虑改为在 `SourceEditor.vue` 的同步 `paste` 事件处理中、`FileReader` 异步读取开始之前捕获）。
