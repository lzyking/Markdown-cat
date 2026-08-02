---
title: 'MenuBar File 菜单及 Theme 子菜单键盘可达性（DW-37, DW-38）'
type: 'bugfix'
created: '2026-08-02'
status: 'done'
baseline_revision: '9daaf48cdfabf8d42b34e57846401820b3f8d5d1'
final_revision: '521eb0ec2222b18121f7fa94940a5599b205e8e7'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** `src/components/MenuBar.vue` 的 `.menu-item`/`.menu-dropdown`/`.submenu-trigger`/`.submenu-dropdown` 展开逻辑完全依赖鼠标 `:hover` 与错误使用的 `:focus`（而非 `:focus-within`），且 `.menu-row`/`.submenu-trigger` 均无 `tabindex`、无 `keydown` 处理，纯键盘用户无法 Tab 进入 File 菜单内部各项，也无法到达并操作 Theme 子菜单及其中的主题按钮（DW-37、DW-38）。

**Approach：** 将 `.menu-item` 的展开触发从 CSS `:focus` 改为 `:focus-within`，为所有具备点击动作的 `.menu-row`（含 `.submenu-trigger`）新增 `tabindex="0"` 与 `keydown` 处理（Enter/Space 触发对应动作，Escape 收起），并为 `.submenu-trigger` 与主题按钮新增键盘路径，使 Tab 顺序能连续到达 File 菜单各项、Theme 子菜单触发器及全部主题按钮。

## Boundaries & Constraints

**Always:**
- `.menu-item` 展开 `.menu-dropdown` 的 CSS 触发条件必须从 `:focus` 改为 `:focus-within`，使焦点移入其任意后代（含子菜单）时下拉保持展开。
- 每个带 `@click` 动作的 `.menu-row`（含"设置保存路径…"、"打开文件…"、"另存为…"、"导出为 HTML…"、"导出为 PDF…"、"发布到 Confluence…"、"设置默认保存路径…"）必须新增 `tabindex="0"` 与 `@keydown` 处理：`Enter` 或 `Space`（`e.preventDefault()` 后）触发与 `@click` 相同的既有函数（`openSettings`/`openFile`/`saveAsFile`/`exportHtml`/`exportPdf`/`publishConfluence`）。
- `.submenu-trigger` 本身必须新增 `tabindex="0"`；其 `keydown` 处理 `Enter`/`Space`/`ArrowRight` 时 `e.preventDefault()` 并将焦点移动到 Theme 子菜单第一个可见的主题按钮（Light Themes 分组首项），使子菜单可通过键盘进入。
- 所有新增可聚焦元素（`.menu-row`、`.submenu-trigger`、`.theme-option`）在按下 `Escape` 时必须 blur 当前聚焦元素，使其祖先的 `:focus-within` 状态清除、对应下拉菜单随之收起。
- 新增可聚焦元素必须补充 `:focus-visible` 轮廓样式，使键盘焦点可见（不得依赖颜色以外的唯一提示）。
- 主题按钮（`.theme-option`）保持原生 `<button>` 元素与既有 `@click.stop="selectTheme(...)"` 行为不变；Enter/Space 依赖浏览器原生按钮激活语义，无需额外拦截。
- 不得回归 `e2e/story-6-2.spec.ts` 现有用例（Theme 子菜单结构、点击切换、持久化）。

**Block If:** 无需人工决策的已知阻塞条件——本任务范围与既有菜单结构清晰对应，无需暂停。

**Never:**
- 不引入完整 ARIA menu 的方向键循环导航（roving tabindex、ArrowUp/ArrowDown 在同级菜单项间跳转）——超出 DW-37/DW-38 所述的"无法聚焦并展开"缺口，属于范围外增强。
- 不改变现有菜单 DOM 结构（`.menu-dropdown`/`.submenu-dropdown`）或迁移到不同的展开实现机制（如 JS 驱动的 `v-show`/Teleport）；继续沿用现有 CSS 可见性驱动模型，仅修正其触发条件并补充键盘入口。
- 不改变 `openFile`/`saveAsFile`/`exportHtml`/`exportPdf`/`publishConfluence`/`openSettings`/`selectTheme` 现有函数签名与鼠标点击行为。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tab 聚焦顶层 "文件" 菜单项 | 键盘 Tab 到 `.menu-item`（文件） | `.menu-dropdown` 变为可见（`:focus-within` 触发） | 无异常 |
| 继续 Tab 进入某菜单行 | Tab 移动焦点到某 `tabindex="0"` 的 `.menu-row` | 该行显示可见焦点样式，`.menu-dropdown` 保持展开 | 无异常 |
| 在菜单行上按 Enter/Space | 聚焦于"打开文件…"等可执行 `.menu-row` | 触发与鼠标点击相同的事件（如 `open-file`） | 无异常 |
| Tab 到 submenu-trigger 并按 Enter | 聚焦 `.submenu-trigger` 后按 `Enter`/`Space`/`ArrowRight` | 焦点移至 Theme 子菜单第一个主题按钮，子菜单保持展开 | 无异常 |
| 在任意菜单行/主题按钮上按 Escape | 聚焦位于菜单内的可聚焦元素 | 当前元素 blur，对应下拉菜单收起 | 无异常 |
| 主题按钮上按 Enter/Space | 聚焦某 `.theme-option` 按钮 | 触发 `selectTheme(theme.id)`（原生按钮行为） | 无异常 |

</intent-contract>

## Code Map

- `src/components/MenuBar.vue` -- 顶层菜单项、菜单行、Theme 子菜单触发器与主题按钮的模板与样式；新增 tabindex/keydown 处理与 CSS `:focus-within` 修正。
- `e2e/story-6-2.spec.ts` -- 为 Theme 子菜单新增纯键盘可达性回归用例。

## Tasks & Acceptance

**Execution:**
- [x] `src/components/MenuBar.vue` -- 新增通用 `onMenuRowKeydown(e: KeyboardEvent, action: () => void)` 函数：`Enter`/`Space` 时 `e.preventDefault()` 并调用 `action()`；`Escape` 时 `(e.currentTarget as HTMLElement).blur()` -- 为所有可执行菜单行提供统一键盘激活/收起逻辑
- [x] `src/components/MenuBar.vue` -- 为 "设置保存路径…"、"打开文件…"、"另存为…"、"导出为 HTML…"、"导出为 PDF…"、"发布到 Confluence…"、"设置默认保存路径…" 这些 `.menu-row` 新增 `tabindex="0"` 与 `@keydown="onMenuRowKeydown($event, ...)"` 绑定对应既有函数 -- 使菜单行可被 Tab 到达并用 Enter/Space 激活（DW-37）
- [x] `src/components/MenuBar.vue` -- 为 `.submenu-trigger` 新增 `tabindex="0"`、`ref="submenuTriggerRef"` 与 `@keydown` 处理：`Enter`/`Space`/`ArrowRight` 时 `preventDefault()` 并调用新增函数 `focusFirstThemeOption()` 将焦点移至第一个可见主题按钮；`Escape` 时 blur 自身 -- 使 Theme 子菜单可被键盘聚焦并进入（DW-38）
- [x] `src/components/MenuBar.vue` -- 为 Light Themes 分组首个 `.theme-option` 按钮新增 `ref="firstThemeOptionRef"`；为全部 `.theme-option` 按钮新增 `@keydown.esc="($event.currentTarget as HTMLElement)?.blur()"` -- 提供 `focusFirstThemeOption` 的焦点目标，并使主题按钮上的 Escape 也能收起子菜单（DW-38）
- [x] `src/components/MenuBar.vue` -- 将 CSS 选择器 `.menu-item:focus .menu-dropdown` 改为 `.menu-item:focus-within .menu-dropdown` -- 修正核心缺陷：焦点移入下拉内部后菜单不再意外收起（DW-37）
- [x] `src/components/MenuBar.vue` -- 新增 `.menu-row:focus-visible`、`.submenu-trigger:focus-visible`、`.theme-option:focus-visible` 的可见轮廓样式（复用现有 `--color-accent`/`outline` 风格） -- 满足键盘聚焦可见性
- [x] `e2e/story-6-2.spec.ts` -- 新增用例：纯键盘（`page.keyboard.press('Tab')` 等）从页面起点 Tab 至 "文件" 菜单、进入菜单行、到达 `.submenu-trigger`、Enter 进入 Theme 子菜单、到达首个主题按钮、Enter 选中主题并验证 `data-theme` 变化 -- 验证 DW-37/DW-38 键盘可达性回归覆盖
- [x] 运行 `npm run build` 验证无 TypeScript / 构建错误 -- 基本回归检查
- [x] 运行 `npx playwright test` 验证全量 E2E 无回归 -- 确认未破坏既有菜单/主题测试

**Acceptance Criteria:**
- Given 页面加载完成且未使用鼠标, when 用户连续按 Tab 聚焦到 "文件" 菜单项, then `.menu-dropdown` 变为可见
- Given "文件" 菜单已因聚焦展开, when 用户继续 Tab 进入 "打开文件…" 等菜单行并按 Enter, then 触发与鼠标点击等价的事件，且菜单在此过程中未意外收起
- Given 焦点到达 `.submenu-trigger`, when 用户按下 Enter 或 ArrowRight, then 焦点移动到 Theme 子菜单第一个主题按钮，且子菜单保持可见
- Given 焦点位于某主题按钮, when 用户按下 Enter, then 对应主题被选中（`data-theme` 属性更新），行为与鼠标点击一致
- Given 焦点位于菜单内任意新增可聚焦元素, when 用户按下 Escape, then 该元素失焦且对应下拉菜单收起

## Spec Change Log

## Review Triage Log

### 2026-08-02 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4 (low 4)
- defer: 2 (low 1, medium 1)
- reject: 5 (low 5)
- addressed_findings:
  - `[low]` `[patch]` `submenuTriggerRef` 被声明并绑定到模板但从未读取，属于死代码；已删除该未使用的 ref 及其模板绑定。
  - `[low]` `[patch]` `setFirstThemeOptionRef` 硬编码只匹配 `lightThemes[0]`，若 Light Themes 分组为空（如主题配置被清空），Theme 触发器的 Enter/ArrowRight 将无法把焦点移入子菜单；已改为 `lightThemes[0]?.id ?? darkThemes[0]?.id` 的回退目标。
  - `[low]` `[patch]` `e2e/story-6-2.spec.ts` 新增测试用 5 次硬编码 `Tab` 按键到达 Theme 触发器，与当前菜单行数量强耦合；已改用既有 `tabUntilFocused` 辅助函数循环 Tab 直至该元素获得焦点。
  - `[low]` `[patch]` 同一测试硬编码断言选中主题后 `data-theme` 变为 `paper-light`，实质是在断言 `themes.json` 的顺序而非键盘行为本身；已改为断言 `data-theme` 相对选择前的值发生变化，并断言首个主题选项显示 `✓` 勾选标记。
- deferred_findings:
  - `[medium]` `[defer]` `.menu-item`/`.submenu-trigger` 已有 `aria-haspopup="true"`，但均缺少 `aria-expanded` 状态绑定，屏幕阅读器无法感知展开/收起状态；此为既有实现遗留缺口，非本次改动引入，已记录到 deferred-work.md。
  - `[low]` `[defer]` `.menu-dropdown` 从未声明 `role="menu"`（其子项已用 `role="menuitem"`），与 `.submenu-dropdown` 已正确使用 `role="menu"` 不一致；此为既有结构性不一致，非本次改动引入，已记录到 deferred-work.md。
- rejected_findings（noise / 与 intent-contract 明确设计一致，不构成缺陷）:
  - Escape 仅 `blur()` 当前聚焦元素而不将焦点显式返回到父级触发器 —— 与 intent-contract "Always" 中"按下 Escape 时必须 blur 当前聚焦元素"的明确设计一致，未要求焦点回退到指定元素。
  - 选中主题后菜单/子菜单未自动收起 —— 与鼠标点击时的既有行为一致（鼠标点击同样不会自动收起，需移开鼠标或后续交互才会因失去 hover/focus-within 而收起），非本次改动引入的回归。
  - 顶层 `.menu-item` 没有显式 keydown（Enter/Space/ArrowDown）来"主动"展开下拉，而是依赖 `:focus-within` 被动展开 —— 与 Design Notes 中"沿用现有 CSS 可见性驱动的展开模型...不引入独立的响应式 open 状态"的明确设计一致。
  - 缺少完整 ARIA menu 模式的 ArrowUp/ArrowDown/Home/End 同级导航 —— 与 intent-contract "Never" 中"不引入完整 ARIA menu 的方向键循环导航...超出 DW-37/DW-38 所述缺口，属于范围外增强"的明确排除一致。
  - 将所有 `.menu-row` 设为可 Tab 到达后，用户需依次 Tab 经过某菜单内全部行才能到达下一个顶层菜单 —— 这正是本次修复"使各菜单行可被 Tab 到达"的既定目标所致的预期副作用，非缺陷。

## Design Notes

沿用现有 CSS 可见性驱动的展开模型（`display:none` ↔ `display:block`），仅将顶层 `.menu-item` 的触发条件由 `:focus` 修正为 `:focus-within`（`.submenu-trigger` 已正确使用 `:focus-within`，无需改动）。新增的 `tabindex`/`keydown` 只负责让原本因 `display:none` 而不可 Tab 到达的元素在祖先展开后能被聚焦与激活，不引入独立的响应式 "open" 状态或方向键循环导航，保持改动最小化、与现有鼠标交互完全并行。

## Verification

**Commands:**
- `npm run build` -- expected: 无 TypeScript / 构建错误
- `npx playwright test` -- expected: 全量用例通过，无回归

**Manual checks (if no CLI):**
- 若 Playwright 环境下键盘聚焦时序不稳定，退化为对关键断言（`.menu-dropdown`/`.submenu-dropdown` 的 `display` 状态、`document.activeElement`）的编程式验证，并在实现说明中记录该项为受限验证及原因。

## Auto Run Result

Status: done
Summary: 修复 `src/components/MenuBar.vue` 中 File 菜单及其 Theme 子菜单的键盘可达性缺口（DW-37、DW-38）。核心问题是顶层 `.menu-item` 的下拉展开 CSS 触发条件错误使用 `:focus`（焦点移入子元素即收起）而非 `:focus-within`，且所有可执行 `.menu-row`/`.submenu-trigger` 均无 `tabindex`/`keydown`，纯键盘用户无法 Tab 进入菜单内部、到达 Theme 子菜单或任一主题按钮。修复后：所有可执行菜单行与子菜单触发器均可通过 Tab 到达并用 Enter/Space 激活，`.submenu-trigger` 上的 Enter/Space/ArrowRight 会将焦点移入 Theme 子菜单第一个主题按钮，Escape 可从菜单内任意新增可聚焦元素处收起对应下拉，且全部新增可聚焦元素补充了 `:focus-visible` 可见轮廓。
Files changed:
- `src/components/MenuBar.vue`：新增 `onMenuRowKeydown`/`onSubmenuTriggerKeydown`/`focusFirstThemeOption` 键盘处理函数；为 7 个可执行 `.menu-row`（含 `.submenu-trigger`）新增 `tabindex="0"` 与 `@keydown` 绑定；为全部 `.theme-option` 按钮新增 `@keydown.esc`；将 CSS `.menu-item:focus .menu-dropdown` 修正为 `.menu-item:focus-within .menu-dropdown`；新增 `.menu-row/.submenu-trigger/.theme-option:focus-visible` 焦点可见样式；审查阶段移除未使用的 `submenuTriggerRef` 死代码，并将首个可聚焦主题选项的匹配逻辑改为 `lightThemes[0]?.id ?? darkThemes[0]?.id`，避免 Light Themes 分组为空时子菜单键盘入口失效。
- `e2e/story-6-2.spec.ts`：新增 `tabUntilFocused` 辅助函数与两个回归用例（S6.2-E2E-004/005），覆盖纯键盘 Tab 链路进入 File 菜单/Theme 子菜单并完成主题切换、Space 激活菜单行与 Escape 收起菜单；审查阶段将硬编码的 5 次 `Tab` 按键与硬编码的 `paper-light` 断言分别改为循环 Tab 与相对值/勾选标记断言，降低测试与当前菜单布局/主题顺序的耦合。
- `_bmad-output/implementation-artifacts/spec-dw-37-38-menu-keyboard-accessibility.md`：新建本次工作的 spec 文件（含 Review Triage Log）。
- `_bmad-output/implementation-artifacts/deferred-work.md`：追加 2 条审查中发现的既有（非本次改动引入）无障碍语义缺口记录（`aria-expanded` 缺失、`.menu-dropdown` 缺少 `role="menu"`）。
Review findings:
- 已修复 patch（4 项，均 low）：删除未使用的 `submenuTriggerRef` 死代码；为 Light Themes 为空场景补充焦点回退目标；将测试中硬编码的 Tab 次数改为循环等待；将测试中硬编码的主题 id 断言改为相对值/勾选标记断言。
- 已推迟 defer（2 项，medium 1 / low 1）：`aria-haspopup` 缺少对应 `aria-expanded` 状态；`.menu-dropdown` 缺少 `role="menu"` 与其子项 `role="menuitem"` 不一致——均为既有实现遗留，未写入 deferred-work.md 之外的任何位置，由编排器统一处理。
- 已拒绝 reject（5 项）：Escape 未显式回焦到父级触发器、选中主题后菜单不自动收起、顶层菜单无显式 keydown 主动展开、缺少完整方向键同级导航、可执行行全部可 Tab 到达导致需依次经过——均与 intent-contract 明确设计或既有鼠标交互行为一致，非缺陷。
Follow-up review recommendation: false（本轮修复的 4 项 patch 均为低严重度、局部的健壮性/测试质量补丁，未涉及行为范围扩大、API 变更或架构调整，全量测试保持绿灯）。
Verification performed:
- `npm run build` — ✅ 通过（`vue-tsc --noEmit && vite build`，实现阶段与审查补丁后各验证一次）。
- `npx playwright test` — ✅ 104/104 通过（实现阶段与审查补丁后各全量运行一次，无回归）。
Residual risks: 无新增高风险项；两项已知既有 ARIA 语义缺口（`aria-expanded`、`.menu-dropdown` 的 `role="menu"`）已记录到 deferred-work.md 供后续统一处理。
