---
title: 'MenuBar 下拉菜单 ARIA 展开状态与角色层级补全（DW-67, DW-68）'
type: 'bugfix'
created: '2026-08-02'
status: 'done'
baseline_revision: '8bfa6e4bea994899dcf521039562fee0a661efec'
final_revision: '69a533f2c355b42c7006094379d6ac4ced0f46aa'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** `src/components/MenuBar.vue` 中已声明 `aria-haspopup="true"` 的 `.menu-item`（含"Markdown Cat"与"文件"两个顶层菜单）与 `.submenu-trigger`（Theme 子菜单触发器）均缺少 `aria-expanded` 状态绑定，屏幕阅读器无法感知这些弹出菜单当前是展开还是收起（DW-67）；同时顶层 `.menu-dropdown` 容器从未声明 `role="menu"`，与其内部已使用 `role="menuitem"` 的 `.menu-row` 子项、以及已正确声明 `role="menu"` 的 `.submenu-dropdown` 不一致，构成无障碍角色树的结构性缺口（DW-68）。

**Approach：** 为每个 `.menu-item` 与 `.submenu-trigger` 新增基于 `mouseenter`/`mouseleave`/`focusin`/`focusout` 的展开状态跟踪（悬停或焦点落在容器内即视为展开），与现有 CSS `:hover`/`:focus-within` 驱动的显隐触发条件保持完全一致，并将结果绑定到对应元素的 `aria-expanded`；同时为两个 `.menu-dropdown` 容器新增 `role="menu"`，使其与 `.submenu-dropdown` 的角色声明一致。不引入任何新的展开/收起触发逻辑或 CSS 改动。

## Boundaries & Constraints

**Always:**
- 每个具备 `aria-haspopup="true"` 的元素（两个顶层 `.menu-item` 与 `.submenu-trigger`）必须新增 `:aria-expanded` 绑定，值为一个反映"鼠标悬停在该容器内或键盘焦点位于该容器内（含所有后代）"的布尔状态。
- 该展开状态的判定条件必须与现有 CSS 选择器 `.menu-item:hover`/`.menu-item:focus-within`（及 `.submenu-trigger:hover`/`.submenu-trigger:focus-within`）驱动 `.menu-dropdown`/`.submenu-dropdown` 显隐的条件保持等价：鼠标进入/离开该元素时更新 hover 分量；`focusin`/`focusout` 冒泡事件用于更新 focus-within 分量，`focusout` 时必须检查 `relatedTarget` 是否仍在当前容器内（`currentTarget.contains(relatedTarget)`），只有确实离开容器时才清除 focus 分量，避免容器内部焦点切换（如从菜单行 Tab 到下一菜单行）时状态被错误置为 `false`。
- 两个 `.menu-dropdown` 容器（"Markdown Cat"与"文件"菜单）必须新增 `role="menu"`，与 `.submenu-dropdown` 已有的 `role="menu"` 保持一致；其内部 `.menu-row`/`.submenu-trigger` 已有的 `role="menuitem"` 保持不变。
- 不得改变任何现有 CSS 规则、既有 `tabindex`/`keydown` 行为、菜单展开/收起的视觉时机——本次改动仅新增 ARIA 属性与用于计算这些属性值的状态跟踪逻辑，鼠标与键盘的实际可见行为必须与改动前完全一致。
- 新增的事件监听器（`mouseenter`/`mouseleave`/`focusin`/`focusout`）仅用于计算 `aria-expanded` 值，不得调用 `preventDefault()`、不得触发既有 `@click`/`@keydown` 处理函数之外的任何副作用。

**Block If:** 无需人工决策的已知阻塞条件——本任务范围与既有菜单结构清晰对应，无需暂停。

**Never:**
- 不引入 `v-if`/`v-show` 或改变 `.menu-dropdown`/`.submenu-dropdown` 的 DOM 挂载时机；继续沿用现有 CSS 可见性驱动模型。
- 不为 `disabled` 的顶层菜单项（"编辑"/"视图"/"帮助"，均无 `aria-haspopup`）新增 `aria-expanded`。
- 不改变 `.theme-option`（`role="menuitemradio"`）的既有 `aria-checked` 逻辑与行为。
- 不引入完整 ARIA menu 模式的方向键循环导航（roving tabindex、ArrowUp/ArrowDown 同级跳转）——超出 DW-67/DW-68 所述缺口。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 鼠标悬停顶层菜单 | 鼠标移入"文件" `.menu-item` | 该元素 `aria-expanded="true"`；移出后（且无焦点）变为 `"false"` | 无异常 |
| 键盘 Tab 进入菜单 | Tab 聚焦"文件" `.menu-item`，`.menu-dropdown` 展开 | `.menu-item` 的 `aria-expanded="true"` | 无异常 |
| Tab 在菜单内部行间移动 | 焦点从菜单内一个 `.menu-row` Tab 到同菜单内下一个 `.menu-row` | `focusout`/`focusin` 交替触发，但因 `relatedTarget` 仍在容器内，`aria-expanded` 全程保持 `"true"`，不闪烁为 `"false"` | 无异常 |
| Tab 离开菜单到菜单外元素 | 焦点从菜单内最后一行 Tab 到菜单外元素，且鼠标未悬停 | `.menu-item` 的 `aria-expanded` 变为 `"false"` | 无异常 |
| Theme 子菜单触发器展开 | 焦点或鼠标进入 `.submenu-trigger` | `.submenu-trigger` 的 `aria-expanded="true"`；离开（且父菜单仍可能为 `true`）后子菜单触发器本身变为 `"false"` | 无异常 |
| 禁用菜单项 | "编辑"/"视图"/"帮助" `.menu-item.disabled` | 不新增 `aria-expanded` 属性 | 无异常 |

</intent-contract>

## Code Map

- `src/components/MenuBar.vue` -- 顶层 `.menu-item`（"Markdown Cat"、"文件"）、`.menu-dropdown` 容器与 Theme `.submenu-trigger` 的模板；新增展开状态跟踪 refs/handlers 与 `aria-expanded`/`role="menu"` 绑定。

## Tasks & Acceptance

**Execution:**
- [x] `src/components/MenuBar.vue` -- 新增一个可复用的展开状态工厂函数（如 `useHoverFocusExpanded()`），返回 `isOpen` ref 及 `onMouseEnter`/`onMouseLeave`/`onFocusIn`/`onFocusOut` 处理器；`onFocusOut` 通过 `event.relatedTarget` 与 `event.currentTarget.contains(...)` 判断是否真正离开容器 -- 提供与现有 CSS `:hover`/`:focus-within` 等价的 JS 侧展开状态，供三处 `aria-expanded` 复用
- [x] `src/components/MenuBar.vue` -- 为"Markdown Cat" `.menu-item`（第 107 行附近）创建一个状态实例，绑定 `:aria-expanded`、`@mouseenter`、`@mouseleave`、`@focusin`、`@focusout` -- 修复 DW-67：使该顶层菜单的展开状态可被屏幕阅读器感知
- [x] `src/components/MenuBar.vue` -- 为"文件" `.menu-item`（第 121 行附近）创建独立状态实例，同样绑定 `:aria-expanded` 与四个事件 -- 修复 DW-67
- [x] `src/components/MenuBar.vue` -- 为 `.submenu-trigger`（第 165 行附近）创建独立状态实例，绑定 `:aria-expanded` 与四个事件（与既有 `@keydown="onSubmenuTriggerKeydown"` 共存，不替换） -- 修复 DW-67
- [x] `src/components/MenuBar.vue` -- 为两处 `.menu-dropdown`（第 109、123 行附近）新增 `role="menu"` -- 修复 DW-68：使其与 `.submenu-dropdown` 的角色声明一致
- [x] 运行 `npm run build` 验证无 TypeScript / 构建错误 -- 基本回归检查
- [x] 运行 `npx playwright test` 验证全量 E2E 无回归（不新增视觉/行为变化，现有用例应保持通过）-- 确认未破坏既有菜单/主题测试

**Acceptance Criteria:**
- Given 页面加载完成, when 鼠标悬停或键盘 Tab 使"文件" `.menu-item` 的 `.menu-dropdown` 变为可见, then 该 `.menu-item` 的 `aria-expanded` 属性值为 `"true"`
- Given "文件" `.menu-item` 处于展开状态, when 鼠标移出且无键盘焦点位于其内部, then 该 `.menu-item` 的 `aria-expanded` 属性值变为 `"false"`
- Given 焦点位于 `.submenu-trigger` 使 Theme 子菜单展开, when 检查该元素属性, then `aria-expanded` 为 `"true"`；焦点/悬停离开后变为 `"false"`
- Given 页面加载完成, when 检查任一 `.menu-dropdown` 元素, then 其具有 `role="menu"` 属性，与 `.submenu-dropdown` 一致
- Given 本次改动前后的鼠标点击、键盘 Tab/Enter/Space/Escape 行为, when 对比改动前后的可见展开/收起时机, then 完全一致，无回归

## Spec Change Log

## Review Triage Log

### 2026-08-02 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2 (medium 1, low 1)
- defer: 1 (low 1)
- reject: 8 (low 8)
- addressed_findings:
  - `[medium]` `[patch]` `onFocusOut`'s `relatedTarget`-based containment check treated a `null` `relatedTarget` as "focus left the container" and unconditionally collapsed `isFocusWithin`; some WebKit builds (relevant to this Tauri app's macOS webview) report `relatedTarget` as `null` even when focus actually moved to a sibling still inside the container. Added a fallback that checks `document.activeElement` against `currentTarget.contains(...)` before clearing `isFocusWithin` when `relatedTarget` is `null`, preventing `aria-expanded` from prematurely flipping to `false` during keyboard Tab navigation.
  - `[low]` `[patch]` No automated test asserted that the new `aria-expanded`/`role="menu"` attributes actually toggle correctly during the existing hover/focus/blur flow. Extended the existing keyboard-navigation e2e test (S6.2-E2E-004 in `e2e/story-6-2.spec.ts`) with `aria-expanded`/`role="menu"` assertions at each Tab step (top-level menus, Theme submenu trigger, and after Escape) instead of adding a duplicate test.
- rejected_findings（noise / 与 intent-contract 明确设计一致或纯属推测，不构成缺陷）:
  - 未来若有第四个菜单触发器，需手动重复五处绑定 —— 属于对未来假设变更的推测，非本次改动引入的现存缺陷。
  - `isHovered`/`isFocusWithin` 依赖每个 setter 手动调用 `syncIsOpen()`，未来若遗漏调用会导致 `aria-expanded` 冻结 —— 属于对未来维护失误的推测，当前代码逻辑正确。
  - Theme 子菜单同时存在 `themeSubmenuExpanded` 与既有键盘聚焦路由（`firstThemeOptionRef`/`focusFirstThemeOption`）两套机制 —— 与 Design Notes 中"三处应各自使用独立状态实例"的明确设计一致，非缺陷。
  - 未为禁用的顶层菜单项（编辑/视图/帮助）添加 `aria-haspopup`/`aria-expanded` —— 与 intent-contract "Never" 中"不为 disabled 的顶层菜单项新增 aria-expanded"的明确排除一致。
  - `event.relatedTarget as Node | null` 未做运行时类型守卫 —— 与已修复的 `relatedTarget` null 处理为同一根因，修复后该类型转换已有对应的空值分支处理，不构成独立缺陷。
  - 手写的 hover/focus-within 跟踪逻辑重复造轮子，`@vueuse/core` 未被采用 —— 属于架构风格偏好，非缺陷；项目当前无 VueUse 依赖，intent-contract 未要求引入新依赖。
  - `aria-expanded` 的 JS 状态与驱动可见性的 CSS `:hover`/`:focus-within` 选择器是两套独立实现，未来 CSS 改动可能导致两者失步 —— 这正是 intent-contract 明确要求的实现方式（镜像现有 CSS 触发条件），已通过设计说明与 Boundaries 约束记录，非本次改动的缺陷。
- deferred_findings:
  - `[low]` `[defer]` 三个 `role="menu"` 容器（两个 `.menu-dropdown` 与既有 `.submenu-dropdown`）均缺少 `aria-label`/`aria-labelledby` 区分名称，屏幕阅读器移动焦点时会听到无区分的"menu"；经核实 `.submenu-dropdown` 在本次改动前已存在相同缺口，属于既有实现遗留，超出 DW-67/68 仅要求补齐 `aria-expanded`/`role="menu"` 的范围，已记录到 deferred-work.md。

## Design Notes

现有实现完全依赖 CSS `:hover`/`:focus-within` 驱动显隐，没有对应的 JS 侧响应式状态可直接绑定 `aria-expanded`。因此需要新增最小化的 JS 状态跟踪：用 `mouseenter`/`mouseleave` 镜像 `:hover`，用冒泡的 `focusin`/`focusout`（并在 `focusout` 中检查 `relatedTarget` 是否仍在 `currentTarget` 内）镜像 `:focus-within`，两者的逻辑或（OR）即为该元素的展开状态。三处（两个顶层菜单 + 一个子菜单触发器）应各自使用独立的状态实例，因为它们各自对应独立的 CSS 触发条件与独立的 `.menu-dropdown`/`.submenu-dropdown` 容器。

## Verification

**Commands:**
- `npm run build` -- expected: 无 TypeScript / 构建错误
- `npx playwright test` -- expected: 全量用例通过，无回归

**Manual checks (if no CLI):**
- 若 Playwright 环境下悬停/焦点时序不稳定，退化为对关键断言（`aria-expanded`/`role` 属性值、`document.activeElement`）的编程式验证，并在实现说明中记录该项为受限验证及原因。

## Auto Run Result

Status: done
Summary: 修复 `src/components/MenuBar.vue` 中两处遗留的无障碍语义缺口（DW-67、DW-68）。DW-67：两个顶层 `.menu-item`（"Markdown Cat"、"文件"）与 Theme `.submenu-trigger` 已有 `aria-haspopup="true"` 但均缺少 `aria-expanded` 状态绑定；新增可复用的 `useHoverFocusExpanded()` 状态工厂，通过 `mouseenter`/`mouseleave`/`focusin`/`focusout` 镜像现有 CSS `:hover`/`:focus-within` 触发条件，为三处元素各自绑定独立的 `aria-expanded`。DW-68：两个 `.menu-dropdown` 容器新增 `role="menu"`，与已有 `role="menu"` 的 `.submenu-dropdown` 保持一致。审查阶段修复：`onFocusOut` 在 `relatedTarget` 为 `null`（部分 WebKit 环境下的已知行为，直接影响本 Tauri macOS 应用）时增加基于 `document.activeElement` 的回退判断，避免键盘 Tab 导航中 `aria-expanded` 被错误地过早置为 `false`；并在既有 `e2e/story-6-2.spec.ts` 键盘链路测试中补充 `aria-expanded`/`role="menu"` 断言，覆盖新状态机的实际切换行为。全程未改动任何 CSS、既有 `tabindex`/`keydown` 逻辑或鼠标/键盘可见行为。
Files changed:
- `src/components/MenuBar.vue`：新增 `useHoverFocusExpanded()` 工厂函数与三个独立状态实例（`markdownCatMenuExpanded`/`fileMenuExpanded`/`themeSubmenuExpanded`）；为两个顶层 `.menu-item` 与 `.submenu-trigger` 绑定 `:aria-expanded` 及四个事件监听器；为两个 `.menu-dropdown` 新增 `role="menu"`；审查阶段为 `onFocusOut` 增加 `document.activeElement` 回退判断以处理 `relatedTarget` 为 `null` 的场景。
- `e2e/story-6-2.spec.ts`：在既有 S6.2-E2E-004 键盘 Tab 链路测试中补充 `role="menu"` 与各步骤 `aria-expanded` 值的断言（含 Escape 收起后校验归位为 `false`）。
- `_bmad-output/implementation-artifacts/spec-dw-67-68-menu-aria-semantics.md`：新建本次工作的 spec 文件（含 Review Triage Log）。
- `_bmad-output/implementation-artifacts/deferred-work.md`：追加 1 条审查中发现的既有（非本次改动引入）无障碍语义缺口记录（三个 `role="menu"` 容器缺少 `aria-label`/`aria-labelledby` 区分名称）。
Review findings:
- 已修复 patch（2 项，medium 1 / low 1）：修复 `onFocusOut` 在 `relatedTarget` 为 `null` 时错误收起 `aria-expanded` 的 WebKit 边界情况；为新状态机补充 e2e 断言覆盖。
- 已推迟 defer（1 项，low）：三个 `role="menu"` 容器缺少 `aria-label`/`aria-labelledby` 区分名称——`.submenu-dropdown` 的该缺口在本次改动前已存在，超出 DW-67/68 范围，已记录到 deferred-work.md。
- 已拒绝 reject（8 项，均 low）：均为对未来维护/假设变更的推测，或与 intent-contract 明确设计/排除范围一致，非本次改动的实际缺陷（详见 Review Triage Log）。
Follow-up review recommendation: false（本轮修复的 2 项 patch 中 1 项为局部边界条件修复、1 项为测试覆盖补充，均未涉及行为范围扩大、API 变更或架构调整，全量测试保持绿灯）。
Verification performed:
- `npm run build` — ✅ 通过（`vue-tsc --noEmit && vite build`，实现阶段与审查补丁后各验证一次）。
- `npx playwright test` — ✅ 105/105 通过（实现阶段与审查补丁后各全量运行一次，无回归）。
Residual risks: 无新增高风险项；1 项已知既有 ARIA 语义缺口（`role="menu"` 缺少区分名称）已记录到 deferred-work.md 供后续统一处理。
