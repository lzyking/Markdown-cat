---
title: 'Story 11.3: Confluence 无障碍与后端集成测试'
type: 'chore'
created: '2026-08-04'
status: 'done'
baseline_revision: '090be3620a28fa1abb41bc6cbbac34a9e30c8c5f'
final_revision: '38b91028f14370738d53754c8b1ab210c0b9a1ae'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** Epic 11 遗留两项低优先级健壮性缺口：(1) `SettingsModal.vue` 的“常规/Confluence”标签栏仅有 `role="tab"`，缺少 `aria-controls`/`role="tabpanel"`/`aria-labelledby` 关联以及方向键切换焦点，不符合完整 WAI-ARIA Tabs 模式（DW-59）；(2) `src-tauri/src/commands/config.rs` 中新增的 Confluence 后端逻辑（keyring 读写、HTTP 请求构造与响应判定、错误码分类）仅被前端 e2e 测试通过 mock Tauri 命令间接覆盖，缺乏针对 Rust 代码本身的自动化集成测试（DW-66）。

**Approach:** 为标签栏与两个面板补充完整的 ARIA Tabs 语义（`id`/`aria-controls`/`role="tabpanel"`/`aria-labelledby`/`tabindex`）并在标签栏上实现 `ArrowLeft`/`ArrowRight`/`Home`/`End` 键盘导航（移动焦点并激活对应面板，符合 WAI-ARIA Authoring Practices 的自动激活模型）；在 `src-tauri/src/commands/config.rs` 现有 `#[cfg(test)]` 模块旁新增一个集成测试模块，使用真实系统 keyring（读写清理成对出现，使用独立 service 前缀隔离）验证 token 读写清除的完整链路，并使用零依赖的本地 TCP mock HTTP 服务器驱动真实的 `test_confluence_connection` 命令，覆盖成功、401/403/404、SSO/代理 HTML 假成功拦截等场景。

## Boundaries & Constraints

**Always:**
- 保持现有视觉样式与鼠标点击交互行为不变，仅新增无障碍属性与键盘处理逻辑。
- 新增的 Rust keyring 集成测试必须使用与生产代码不同的 service/account 标识（例如 `markdown-cat-confluence-test`），避免读写、覆盖或删除用户真实已保存的 Confluence Token；测试结束前必须清理自己写入的凭据（含 `panic` 路径也不能残留，用 `Drop` 守卫或显式收尾覆盖正常与异常路径）。
- 新增的 Rust HTTP 集成测试必须通过本地回环 TCP 服务器模拟 Confluence 响应，不得访问真实外部网络；测试内必须显式设置 `NO_PROXY`/`no_proxy` 环境变量豁免 `127.0.0.1`，避免受当前机器/CI 系统代理配置影响导致测试挂起或误报（已验证：`reqwest::Client` 默认会遵循系统代理设置，直连回环地址在存在系统代理时会被错误路由并挂起或返回网关错误）。
- 键盘导航必须遵循 WAI-ARIA Tabs（Automatic Activation）模式：`ArrowLeft`/`ArrowRight` 循环切换并激活标签，`Home`/`End` 跳转到首/尾标签；`Tab` 键行为不变（仅在标签栏内以及标签栏与面板之间正常切换）。
- Cargo.toml 中新增的 `tokio` dev-dependency 版本需与现有 lockfile 已解析的传递版本兼容，避免大范围升级无关依赖（构建前需核对 `cargo build`/`cargo test` 后 `Cargo.lock` 的变更范围仅限必要项）。

**Block If:** 无需人工介入的决策点——DW-59 与 DW-66 均为纯代码可完成的无障碍属性补充与自动化测试补齐，不涉及需要人工在仓库之外执行的操作（如域名/DNS/第三方控制台授权）。

**Never:** 不引入新的 UI 组件库或无障碍框架；不修改 `test_confluence_connection`/`build_confluence_test_result`/keyring 相关函数的既有业务判定逻辑（仅新增测试与前端 ARIA 属性，不做行为变更）；不为达成测试可测性而将 `src-tauri` 内部模块整体标记为 `pub`（继续使用 `#[cfg(test)]` 内联测试模块，保持现有 crate 封装边界）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 键盘右方向键切换 | 焦点在“常规”标签，按下 `ArrowRight` | 焦点与 `activeTab` 均移动到“Confluence”标签，对应 `tabpanel` 显示 | 若已在最后一个标签，`ArrowRight` 循环回第一个标签 |
| 键盘左方向键切换 | 焦点在“Confluence”标签，按下 `ArrowLeft` | 焦点与 `activeTab` 均移动到“常规”标签 | 若已在第一个标签，`ArrowLeft` 循环回最后一个标签 |
| Home/End 键 | 焦点在任一标签，按下 `Home` 或 `End` | 焦点与激活状态跳转到第一个/最后一个标签 | 单标签场景（理论上不存在，当前恒为 2 个标签）无需特殊处理 |
| 面板可达性 | 屏幕阅读器/自动化测试查询当前激活面板 | 面板元素具有 `role="tabpanel"`、`aria-labelledby` 指向对应标签 `id`、`tabindex="0"` 可被聚焦 | 非激活面板不渲染（保持现有 `v-if`/`v-else` 行为，不需要 `hidden` 属性兼容） |
| keyring 成功写入并读回 | 调用 `set_confluence_token` 写入一个测试 Token，再调用 `get_confluence_token_status`/内部读取函数 | 状态显示已有 Token，读回值与写入值一致 | 测试结束显式调用清除，验证清除后状态恢复为无 Token |
| HTTP 200 + 合法 JSON | 本地 mock 服务器返回 200 + `{"key":"TEAM","name":"..."}` + `application/json` | `test_confluence_connection` 返回 `success: true` | 不适用 |
| HTTP 401/403/404 | 本地 mock 服务器分别返回对应状态码 | `test_confluence_connection` 返回 `success: false` 且 `message` 含对应中文错误分类文案，`status_code` 与响应一致 | 不适用——均为已定义的正常错误分支 |
| SSO/代理 HTML 假成功 | 本地 mock 服务器返回 200 + HTML 登录页 + `text/html` | `test_confluence_connection` 判定 `success: false` 并提示“响应内容不是有效的 Confluence 数据” | 验证既有 DW-58 防护逻辑仍被真实网络路径覆盖，而非仅被单元测试覆盖 |

</intent-contract>

## Code Map

- `src/components/SettingsModal.vue` -- 标签栏（`tab-bar`）与两个面板（`general`/`confluence` 的 `modal-body`）需补充 ARIA 关联属性与键盘导航处理函数
- `src-tauri/src/commands/config.rs` -- 现有 `#[cfg(test)] mod tests` 之后新增 `#[cfg(test)] mod backend_integration_tests`，覆盖 keyring 与 `test_confluence_connection` 的真实集成路径；被测函数 `set_confluence_token`/`get_confluence_token_status`/`clear_confluence_token`/`test_confluence_connection`/`ConfluenceConnectionPayload` 均已 `pub`，无需改动可见性
- `src-tauri/Cargo.toml` -- 新增 `tokio`（`rt-multi-thread`/`macros`/`time` features）到 `[dev-dependencies]`，供 `#[tokio::test]` 使用（已验证与既有 lockfile 传递版本 1.53.1 兼容，`cargo test` 增量构建正常）

## Tasks & Acceptance

**Execution:**
- [x] `src/components/SettingsModal.vue` -- 为 `tab-bar` 内两个 `role="tab"` 按钮各增加唯一 `id`（如 `tab-general`/`tab-confluence`）与 `aria-controls`（指向对应面板 `id`）；为两个面板容器（`v-if="activeTab === 'general'"` 与 `v-else`）分别增加 `id`（`panel-general`/`panel-confluence`）、`role="tabpanel"`、`aria-labelledby`（指向对应标签 `id`）与 `tabindex="0"` -- 建立标签与面板的双向 ARIA 关联，满足 DW-59 的结构要求
- [x] `src/components/SettingsModal.vue` -- 在 `tab-bar` 容器上增加 `@keydown` 处理函数（如 `onTabKeydown`），实现 `ArrowLeft`/`ArrowRight` 循环切换 `activeTab` 并将焦点移动到新激活的标签按钮（通过 `ref` 数组 + `nextTick` 后 `focus()`），`Home`/`End` 跳转到首/尾标签；同时为非激活标签设置 `tabindex="-1"`、激活标签 `tabindex="0"`（roving tabindex），保持鼠标点击行为不变 -- 实现 WAI-ARIA Tabs 键盘导航模式
- [x] `src-tauri/Cargo.toml` -- 在 `[dev-dependencies]` 增加 `tokio = { version = "1", features = ["rt-multi-thread", "macros", "time"] }`，运行 `cargo test` 确认 `Cargo.lock` 仅新增 `tokio`/`tokio-macros` 相关必要条目 -- 为新增异步集成测试提供测试专用运行时
- [x] `src-tauri/src/commands/config.rs` -- 新增 `#[cfg(test)] mod backend_integration_tests`，包含：(a) keyring 往返测试：使用独立 `Entry::new` 的测试专用 service/account 直接验证写入/读取/删除三段式往返（不复用生产 `token_entry()`，避免与真实用户凭据的 service/account 常量耦合，同时仍验证与生产完全一致的 `keyring` crate 调用链路）；(b) 本地 TCP mock 服务器辅助函数（绑定 `127.0.0.1:0`，单线程 `accept` 一次连接、读取请求、写回预设的 HTTP 响应字节）；(c) 至少 5 个 `#[tokio::test]` 用例覆盖 I/O 矩阵中的 HTTP 场景（200 成功、401、403、404、HTML 假成功），每个用例内先设置 `NO_PROXY`/`no_proxy` 环境变量再调用真实的 `test_confluence_connection(payload)` -- 解决 DW-66 的后端集成测试覆盖缺口
- [x] `src-tauri/src/commands/config.rs` -- 复核新增测试与既有 `mod tests` 中的纯函数单元测试（`build_confluence_test_result` 等）不重复断言同一逻辑分支，新增测试聚焦端到端网络/凭据路径而非重复已覆盖的纯函数分支 -- 避免测试冗余
- [x] `e2e/story-11-1.spec.ts`（或新增 `e2e/story-11-3.spec.ts`，视现有用例组织方式选择侵入性更小的一种）-- 增加一个前端断言：设置弹窗打开后，标签按钮具备 `aria-controls`，对应面板具备 `role="tabpanel"` 且 `aria-labelledby` 与标签 `id` 对应；并模拟按下 `ArrowRight`/`ArrowLeft` 验证 `activeTab` 与面板可见性随之切换 -- 为 DW-59 的键盘导航提供前端自动化回归覆盖

**Acceptance Criteria:**
- Given 设置弹窗已打开且焦点位于“常规”标签, when 用户按下 `ArrowRight`, then 焦点与激活面板切换到 Confluence 标签，且 Confluence 标签按钮的 `aria-controls` 属性值等于 Confluence 面板的 `id`
- Given 设置弹窗已打开且焦点位于任一标签, when 用户使用屏幕阅读器或自动化工具查询当前可见面板的可达性属性, then 该面板具备 `role="tabpanel"` 与指向当前激活标签 `id` 的 `aria-labelledby`
- Given 系统尚未保存任何 Confluence Token（集成测试专用的 service/account）, when 集成测试依次调用写入、读取、清除该 Token 的后端函数, then 三步均返回成功且清除后再次读取显示无 Token，测试运行前后不残留任何测试凭据
- Given 本地 mock HTTP 服务器针对 `test_confluence_connection` 请求分别返回 200 合法 JSON、401、403、404、200+HTML 五种响应, when 集成测试逐一驱动真实的 `test_confluence_connection` 命令发起请求, then 每种场景下命令返回值的 `success`/`status_code`/`message` 分类均与既有业务逻辑预期一致，且测试在无外部网络依赖、不受本机代理设置影响的情况下稳定通过
- Given 运行 `cargo test` 与既有前端 `npm run test:e2e`（或对应命令）, when 新增测试与既有测试一并执行, then 全部通过且不出现因新增 `tokio` dev-dependency 导致的编译或版本冲突

## Spec Change Log

## Review Triage Log

### 2026-08-04 — Review pass 1
- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 0, medium 3, low 4)
- defer: 2: (high 0, medium 0, low 2)
- reject: 4: (high 0, medium 0, low 4)
- addressed_findings:
  - `[medium]` `[patch]` `NO_PROXY`/`no_proxy` 环境变量在多个 `#[tokio::test]` 用例间被并行修改而未做互斥，存在跨线程竞态；补充静态 `ENV_MUTATION_LOCK` 互斥锁，所有涉及网络的用例通过 `allow_local_mock_server_without_proxy()` 返回的 guard 持锁运行
  - `[medium]` `[patch]` 本地 mock HTTP 服务器的 `accept()`/`read()` 均无超时，客户端异常时会使测试线程永久挂起；改为非阻塞 `accept` + 5 秒超时轮询，并为已接受的连接设置 `set_read_timeout`，同时将单次固定 4096 字节读取改为循环读取直到检测到 `\r\n\r\n` 或达到上限
  - `[medium]` `[patch]` `SettingsModal.vue` 的 `onTabKeydown` 未忽略修饰键，`Ctrl/Alt/Meta/Shift + 方向键`等浏览器/系统/辅助技术快捷键组合会被意外劫持并触发标签切换；增加修饰键检测提前返回
  - `[low]` `[patch]` `e2e/story-11-3.spec.ts` 未覆盖 `Home`/`End` 键盘导航（已实现但缺少回归测试）；新增一个测试用例验证 `Home`/`End` 跳转到首/尾标签
  - `[low]` `[patch]` `e2e/story-11-3.spec.ts` 未验证 roving tabindex（激活标签 `tabindex=0`、非激活标签 `tabindex=-1`）这一关键无障碍行为；补充相应断言
  - `[low]` `[patch]` `e2e/story-11-3.spec.ts` 的 `describe` 文案含“后端集成测试”字样，但该文件仅覆盖前端 mock 行为，可能误导后续读者误以为已覆盖后端集成路径；文案改为准确描述范围并补充说明后端集成测试位置的注释
  - `[low]` `[patch]` Rust keyring 集成测试固定使用同一 account 名称，若同一台机器上并发运行两个 `cargo test` 进程（如重叠的 CI 任务）可能相互删除对方正在使用的测试凭据；account 名称追加 `std::process::id()` 后缀隔离
- defer 详情：keyring 集成测试依赖真实 OS 凭据后端，在无头 Linux CI 环境可能不可用/不稳定（已知的、刻意接受的真实性 vs 可移植性权衡，记录于 deferred-work.md）；未覆盖“未显式提供 Token、回退读取已保存 keyring 值”的集成路径（该覆盖需要读写生产环境 keyring 条目，与本 story 意图契约中“避免读写、覆盖或删除用户真实已保存的 Confluence Token”的约束冲突，记录于 deferred-work.md 留待后续 story 决策）
- reject 详情：`body.len()` 按字节计数的质疑不成立（Rust `str::len()`本身返回字节长度，而非字符数，现有实现已正确）；两个 `tabpanel` 均设置 `tabindex="0"` 会增加一个 Tab 停靠点的质疑属于意图契约中已明确要求的设计选择，非实现缺陷；键盘导航基于 `activeTab` 而非当前聚焦标签的理论错位场景在当前实现下不可复现（所有切换路径都会同步移动焦点与激活状态）；两个设置弹窗同时挂载导致 ID 冲突的场景与当前单例弹窗架构不符，缺乏现实触发条件

## Design Notes

- keyring 集成测试刻意不复用 `src-tauri/src/commands/config.rs` 内部的 `token_entry()`/`CONFLUENCE_TOKEN_SERVICE`/`CONFLUENCE_TOKEN_ACCOUNT` 常量，而是在测试内直接构造带有测试专属标识的 `keyring::Entry`，例如：
  ```rust
  let entry = keyring::Entry::new("markdown-cat-confluence-test", "integration-test-account")?;
  entry.set_password("probe-token")?;
  assert_eq!(entry.get_password()?, "probe-token");
  entry.delete_credential()?;
  ```
  这样既验证了与生产完全相同的 `keyring` crate 交互链路（同一 OS 凭据后端），又避免了误写入/误清除用户真实保存的 Confluence Token。
- 本地 mock HTTP 服务器无需引入 `wiremock`/`mockito` 等新依赖，直接用 `std::net::TcpListener` 手写一次性响应即可满足本 story 的 5 个固定场景，符合“非必要不新增依赖”的原则；仅新增 `tokio` dev-dependency 用于承载 `#[tokio::test]` 异步运行时（已验证 `tauri::async_runtime::block_on` 在测试上下文中可用但不能替代显式异步测试宏运行独立 mock 服务器场景的可靠性，直接采用标准 `#[tokio::test]` 更稳妥）。
- 已实测确认：不设置 `NO_PROXY`/`no_proxy` 时，若当前环境配置了系统级 HTTP 代理，`reqwest::Client`（生产代码构造方式，未调用 `.no_proxy()`）访问 `127.0.0.1` mock 服务器会被错误代理转发，导致请求挂起或返回 502，而非连接到本地 mock 服务器；因此测试必须在调用前显式设置这两个环境变量为 `127.0.0.1,localhost`。

## Verification

**Commands:**
- `cd src-tauri && cargo test` -- expected: 全部测试通过，包含新增的无障碍相关前端测试之外的、本 story 新增的 keyring 与 HTTP 集成测试用例
- `cd src-tauri && cargo build` -- expected: 编译成功，`Cargo.lock` 差异仅包含新增 `tokio` dev-dependency 及其必要传递依赖
- `npm run test:e2e`（或项目既有 e2e 测试命令，运行受影响的 `story-11-1`/`story-11-3` 用例）-- expected: 新增的 ARIA 属性与键盘导航断言通过，既有用例不回归

**Manual checks (if no CLI):**
- 使用浏览器开发者工具的无障碍面板检查设置弹窗，确认标签与面板的 `aria-controls`/`aria-labelledby`/`role` 关系正确无误
## Auto Run Result

Status: done

_Appended by the bmad-loop orchestrator (missing-marker repair, #224): the session finalized this spec's frontmatter without its `## Auto Run Result` marker, so the orchestrator synthesized the result from the frontmatter and appended this section._

Synthesized by the bmad-loop orchestrator from frontmatter status `done` for story `11-3-confluence-accessibility-and-integration-tests` (session finalized the spec without appending its marker).
