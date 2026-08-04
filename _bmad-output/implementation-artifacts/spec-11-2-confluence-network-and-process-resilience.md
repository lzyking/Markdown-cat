---
title: 'Story 11.2: Confluence 网络与进程交互容错'
type: 'refactor'
created: '2026-08-04'
status: 'done'
baseline_revision: '9264aee88ebff3ddffebd792f8d035266c781db8'
final_revision: '7d4c061f83bb662aa568aa1f1e68328a33191ea3'
review_loop_iteration: 2
followup_review_recommended: true
context: []
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** Confluence 集成在网络异常判定、异步加载竞态、外部进程调用及反馈清理四方面存在健壮性缺口（DW-58, DW-60, DW-63, DW-65）：连接测试仅凭 2xx 状态码判定成功（会被 SSO/代理拦截页误判）；设置弹窗异步加载配置可能静默覆盖用户正在编辑的表单；点击"测试连接"因格式校验提前返回时，上一次 md2cf 检测消息未被清除，与新错误同屏误导用户；`md2cf --version` 调用无超时，异常挂起会导致"测试连接"无限期等待。

**Approach:** 后端为连接测试增加 Content-Type/JSON 结构校验，仅当响应为 JSON 且包含 Space 对象特征字段时才判定成功；为 `check_md2cf_installed` 增加子进程执行超时与强制终止；前端为设置表单增加"脏表单"标记以避免异步加载覆盖用户输入；在校验失败提前返回前先清空 md2cf 检测反馈状态。

## Boundaries & Constraints

**Always:** 保持现有 Tauri 命令签名对前端调用方（`invoke` 调用参数与返回的 `CmdResult` 结构）向后兼容；所有新增校验失败/超时都必须返回用户可读的中文提示消息，不得 panic 或未处理地 reject；沿用现有错误码常量风格（`ERR_CONFLUENCE_*`），不引入新错误码除非确有必要区分。

**Block If:** 若需要新增外部 crate 依赖（如显式引入 `tokio` 用于超时）会导致 Cargo 依赖冲突或版本不兼容 — 若探测到冲突，改用标准库线程 + channel 实现超时，不得中止任务。

**Never:** 不修改 `test_confluence_connection`/`check_md2cf_installed` 之外的发布（`confluence.rs` publish 流程）逻辑；不引入新的 UI 组件或改变 Tab 无障碍结构（属于 Story 11.3 范围）；不将 md2cf 超时做成用户可配置项（保持固定合理超时常量）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SSO 拦截误判 | Confluence 请求返回 2xx 但 Content-Type 为 `text/html`（登录页） | `test_confluence_connection` 判定失败，提示"响应内容不是有效的 Confluence 数据，可能被代理/SSO 拦截" | 不 panic，success=false，status_code 仍回传 |
| 正常 JSON 成功 | 返回 2xx，Content-Type 含 `application/json`，body 含 `key`/`name` 字段 | 判定成功，原有成功提示文案不变 | 无 |
| JSON 但缺关键字段 | 2xx + `application/json`，但 body 是 `{}` 或数组 | 判定失败，提示响应结构异常 | success=false |
| md2cf 挂起 | `md2cf --version` 进程超过超时阈值未退出 | 终止子进程，返回 `installed:false`，message 提示"检测超时" | 不阻塞调用方，命令必须在超时后尽快返回 |
| 表单编辑竞态 | 用户在 `loadConfluenceSettings` 异步返回前已修改任意字段 | 异步返回后不覆盖用户已编辑的字段（不应用 `applyConfluenceConfig`） | 无错误提示，静默保留用户输入 |
| 校验失败清理 | Base URL 存在校验错误 + 上次遗留 md2cf 检测消息 | 点击"测试连接"后 `md2cfMessage`/`md2cfInstalled` 被清空，仅展示当前格式错误 | 无 |

</intent-contract>

## Code Map

- `src-tauri/src/commands/config.rs` -- `build_confluence_test_result`（DW-58 需增加 Content-Type/JSON 结构校验）、`check_md2cf_installed`（DW-65 需增加超时与强制终止）、`test_confluence_connection`（需读取响应 Content-Type 与 body 并传给判定函数）
- `src/components/SettingsModal.vue` -- `loadConfluenceSettings`/`applyConfluenceConfig`（DW-60 需增加脏表单保护）、`resetConfluenceFeedback`（DW-63 需清空 md2cf 检测状态）、`onTestConnection`（调用顺序保持不变）

## Tasks & Acceptance

**Execution:**
- [x] `src-tauri/src/commands/config.rs` -- 重构 `build_confluence_test_result` 签名为接收 `status: StatusCode, content_type: Option<&str>, body: &str`；当 `status.is_success()` 时，先将 `body` 解析为 JSON 对象并检查是否含 `key` 或 `name` 字段（且该字段值必须是非空字符串，`null`/非字符串不计入）——此结构校验是判定的必要条件；仅当 `content_type` 明确声明了与 JSON 不兼容的类型（如 `text/html`）时才在结构校验通过的情况下额外拒绝（即 content-type 缺失或包含 `json` 时视为兼容，不强制要求精确等于 `application/json`）。结构校验不通过则始终判定失败。判定失败时返回"响应内容不是有效的 Confluence 数据，可能被代理/SSO 拦截"提示（保留 `status_code`）-- 解决 DW-58 的假成功判定，同时避免因反向代理剥离/改写 Content-Type 头或使用 `application/hal+json` 等非字面量 JSON 变体而误判合法响应为失败（2026-08-04 复审 bad_spec 修正）
- [x] `src-tauri/src/commands/config.rs` -- 在 `test_confluence_connection` 中，成功拿到 HTTP 响应后先提取 `Content-Type` 头与 `status`；读取 body 前先检查 `Content-Length`（若存在且超过 `MAX_CONFLUENCE_TEST_BODY_BYTES`，如 1 MiB，则不读取 body，直接按"响应内容不是有效的 Confluence 数据"判定失败，避免无上限缓冲），否则 `response.text().await` 读取 body（读取失败时按空字符串处理并记录 warn 日志，不中断流程），将三者传入重构后的 `build_confluence_test_result` -- 支撑 DW-58 修复的数据来源，并规避大体积/慢速响应被无限制读入内存（2026-08-04 复审 patch）
- [x] `src-tauri/src/commands/config.rs` -- 为 `check_md2cf_installed` 增加执行超时：改为 spawn 子进程 + 轮询 `try_wait()`（间隔如 100ms）直到完成或超过固定超时常量（如 5 秒），超时后调用 `child.kill()` 并返回 `installed:false, message:"检测 md2cf 超时（可能已挂起），将使用 REST API 直连模式。"`；正常完成路径的行为与消息保持不变 -- 解决 DW-65 的无限期等待
- [x] `src-tauri/src/commands/config.rs` -- 为 `build_confluence_test_result` 的新增分支与 `check_md2cf_installed` 的超时分支补充 `#[cfg(test)]` 单元测试：成功 JSON（`key`+`name` 均存在）、仅含 `key`、仅含 `name`、HTML 假成功、JSON 缺字段、`key`/`name` 值为 `null` 的伪造情况、超时命中、以及 `run_command_with_timeout` 的正常（非超时）完成路径 -- 覆盖 I/O 矩阵场景与本次复审发现的边界（2026-08-04 复审 patch：补充遗漏测试）
- [x] `src/components/SettingsModal.vue` -- 增加 `confluenceFormDirty` 响应式标记：在 `applyConfluenceConfig` 首次应用后，为 `confluenceForm` 的各字段增加 watcher（或在已有的输入事件路径上）在用户产生任何编辑时置为 `true`；弹窗打开时（`resetConfluenceMessages`）重置为 `false`；`loadConfluenceSettings` 在应用后端返回的配置前检查该标记，若为 `true` 则跳过 `applyConfluenceConfig` 调用（不覆盖用户已编辑内容），仅在 token 状态等不涉及表单文本的字段上照常处理 -- 解决 DW-60 竞态覆盖
- [x] `src/components/SettingsModal.vue` -- 在 `resetConfluenceFeedback` 函数体中增加 `md2cfMessage.value = ''` 与 `md2cfInstalled.value = null` -- 解决 DW-63 陈旧检测消息残留

**Acceptance Criteria:**
- Given Confluence 服务器因 SSO/代理拦截返回 2xx 状态码但内容为 HTML 登录页, when 用户点击"测试连接", then 前端展示连接失败提示（而非误判成功），且提示区分于普通网络错误
- Given Confluence 服务器返回正常的 JSON Space 详情（2xx + `application/json` + 含 `key`/`name`）, when 用户点击"测试连接", then 判定成功且原有成功文案不变
- Given 系统 PATH 中的 `md2cf` 二进制异常挂起不退出, when 用户点击"测试连接", then `check_md2cf_installed` 在固定超时后返回而不是无限期阻塞，前端展示"检测超时"类提示
- Given 设置弹窗正在异步加载配置期间用户已开始编辑 Base URL 或其他字段, when 异步加载在用户编辑之后返回, then 用户已编辑的字段值不会被静默覆盖
- Given Space Key 存在格式校验错误且上一次测试连接曾留下 md2cf 检测消息, when 用户再次点击"测试连接"并因格式错误提前返回, then 界面不再同时显示陈旧的 md2cf 检测消息，只显示当前的格式错误提示

## Design Notes

**DW-58 判定逻辑（Rust 伪代码，2026-08-04 复审 pass 2 后再次修正）：**
```rust
const MAX_CONFLUENCE_TEST_BODY_BYTES: u64 = 1_048_576; // 1 MiB

// requested_space_key: 本次请求实际使用的 Space Key（来自 payload.space_key，trim 后），
// 用于将“返回的 key 是否等于我方请求的 key”作为成功判据，而不仅仅是“key/name 字段存在”。
fn build_confluence_test_result(
    status: StatusCode,
    content_type: Option<&str>,
    body: &str,
    requested_space_key: &str,
) -> ConfluenceTestResult {
    if status.is_success() {
        // 必须解析出 JSON 对象，且其 `key` 字段（字符串）与本次请求的 Space Key 完全一致，
        // 才判定为“已验证空间访问权限”。相比仅检查 key/name 字段“存在”，此判据可防止
        // 通用错误响应体（例如某些代理/网关返回的 {"name": "Not Found", ...} 异常载荷）
        // 因恰好含有 name/key 字段而被误判为成功——这是 pass 2 复审中两名评审者独立指出的
        // 假阳性风险（原逻辑不校验字段值是否与本次请求的对象相关）。
        // Confluence REST API 对 GET /rest/api/space/{key} 的真实成功响应中，`key` 字段
        // 恒等于请求路径中的 space key，因此该校验精确且不引入误判合法响应的新回归风险。
        let key_matches = serde_json::from_str::<Value>(body).ok()
            .and_then(|v| v.as_object().cloned())
            .and_then(|obj| obj.get("key").and_then(Value::as_str).map(|s| s.eq_ignore_ascii_case(requested_space_key)))
            .unwrap_or(false);

        // content-type 仅在“明确声明为非 JSON”时才参与拒绝；缺失或包含 "json"
        // （涵盖 application/json、application/hal+json 等变体）均视为兼容，
        // 避免反向代理剥离/改写头部或使用非字面量 JSON 类型时误判合法响应为失败。
        let content_type_incompatible = content_type
            .map(|v| !v.to_ascii_lowercase().contains("json"))
            .unwrap_or(false);

        if key_matches && !content_type_incompatible {
            return ConfluenceTestResult { success: true, message: "连接成功，已验证空间访问权限。".into(), status_code: Some(status.as_u16()) };
        }
        return ConfluenceTestResult { success: false, message: "响应内容不是有效的 Confluence 数据，可能被代理/SSO 拦截。".into(), status_code: Some(status.as_u16()) };
    }
    // existing failure-status branch unchanged
}
```
注：HTML SSO 拦截页仍会被正确拒绝——HTML body 无法解析出 JSON 对象，`key_matches` 恒为 `false`。通用 JSON 错误载荷（例如 `{"name": "No space found"}` 且不含匹配的 `key`）现在也会被正确拒绝，因为不再接受“仅 name 字段存在”作为成功判据。

**DW-58 响应体读取上限（无内容长度时的绕过修复）：** `test_confluence_connection` 不再依赖 `response.content_length()`（对分块传输编码/Transfer-Encoding: chunked 响应恒为 `None`，导致原 pass 1 的 Content-Length 上限检查被完全绕过——pass 2 中两名评审者独立收敛到同一发现）。改为使用 `response.chunk().await`（reqwest 内置能力，无需新增 `stream` feature/依赖）边读边累加字节数，一旦累计超过 `MAX_CONFLUENCE_TEST_BODY_BYTES` 立即中止读取并返回“响应体过大”的失败结果，而不是先无限制读入内存再事后检查：
```rust
let mut buf: Vec<u8> = Vec::new();
while let Some(chunk) = response.chunk().await.map_err(|e| ...)? {
    buf.extend_from_slice(&chunk);
    if buf.len() as u64 > MAX_CONFLUENCE_TEST_BODY_BYTES {
        return ConfluenceTestResult { success: false, message: "响应体超出大小限制，已中止读取。".into(), status_code: Some(status.as_u16()) };
    }
}
let body = String::from_utf8_lossy(&buf).to_string();
```
该方式对有/无 `Content-Length` 的响应一视同仁，彻底修复分块编码绕过问题，且不引入新的 Cargo 依赖。

**DW-65 超时轮询（避免新增 tokio 依赖）：** 使用 `std::process::Command::spawn()` + 循环 `child.try_wait()` + `std::thread::sleep(Duration::from_millis(100))`，累计耗时超过 `MD2CF_CHECK_TIMEOUT`（如 `Duration::from_secs(5)`）时 `child.kill()` 并返回超时结果；未超时则按原逻辑读取 stdout/stderr 组装消息。

**DW-65 `kill()` 竞态处理（pass 2 patch）：** 若子进程恰好在 `try_wait()` 返回 `None` 之后、`child.kill()` 执行之前自然退出，`kill()` 可能返回 `Err`（如 `InvalidInput`/`ESRCH` 等价错误，具体取决于平台），不应视为“检测失败”的硬错误。改为：`kill()` 返回 `Err` 时忽略该错误（进程已退出，kill 目标已不存在，语义上等同于“正常结束”），随后统一调用 `child.wait()` 读取其真实退出结果，按未超时路径处理；仅当 `wait()`/`try_wait()` 本身失败时才归类为检测失败（该失败路径同样会先 `kill()` + `wait()` 回收子进程，避免残留孤儿/僵尸进程）。

**DW-65 管道排空（pass 3 patch）：** 轮询期间必须并发消费子进程的 stdout/stderr（各设 1 MiB 上限的后台线程读取），否则子进程输出一旦超过操作系统管道缓冲区（通常约 64 KiB）就会在写入时阻塞，`try_wait()` 永远观察不到其退出，导致恒被误判为超时——这是手写轮询循环相比 `Command::output()`（内部自动排空管道）重新引入的经典陷阱，已通过并发读取线程修复，并有专门测试验证 200 KiB 输出仍可在超时前正常完成。

**DW-58 Key 匹配大小写（pass 3 patch）：** `key_matches` 使用 `eq_ignore_ascii_case` 而非精确大小写敏感比较——若 Confluence 实例/代理对 Space Key 做大小写规范化，精确匹配可能将用户实际能成功访问的连接误判为失败；大小写不敏感的字面量匹配仍是极强信号，不会重新引入通用错误载荷被误判为成功的风险。

**DW-60 脏表单保护（Vue 伪代码）：**
```ts
const confluenceFormDirty = ref(false)
const suppressConfluenceDirtyTracking = ref(false)
watch(confluenceForm, () => {
  if (!suppressConfluenceDirtyTracking.value) confluenceFormDirty.value = true
}, { deep: true, flush: 'sync' }) // flush:'sync' is required: the default 'pre'
  // flush batches all mutations from one synchronous block into a single
  // microtask-scheduled callback, by which point the suppress flag would
  // already be back to false, silently defeating the guard below.
// 在 applyConfluenceConfig()/resetConfluenceMessages() 内：
//   suppressConfluenceDirtyTracking.value = true
//   ...同步赋值表单字段...
//   suppressConfluenceDirtyTracking.value = false
//   confluenceFormDirty.value = false
// loadConfluenceSettings 内:
if (!confluenceFormDirty.value) applyConfluenceConfig(configOutcome.value.data?.confluence)
```
KEEP：`suppressConfluenceDirtyTracking` + `flush: 'sync'` 的实现方式已在复审中确认功能正确（覆盖了 `applyConfluenceConfig`/`resetConfluenceMessages` 两个赋值路径），予以保留；其对“同步赋值块”的隐性依赖已记入 Deferred Work 供后续更稳健的重构参考，不在本次范围内改动。

## Spec Change Log

### 2026-08-04 — Review pass 1 (bad_spec)
- **Triggering finding:** `build_confluence_test_result` 的 Content-Type 判定使用 `content_type.contains("application/json")` 字面量子串匹配，并要求其与 JSON 结构校验同时成立（AND）。两名独立评审者分别指出：(a) 该字面量匹配无法覆盖 `application/hal+json`、`text/json` 等合法 JSON 变体；(b) 若反向代理/网关剥离或改写了合法 Confluence 响应的 Content-Type 头，即便 body 结构完全正确也会被误判为连接失败——这是本次改动引入的新回归风险，而非既有问题。
- **Amendment:** 将判定逻辑改为：结构校验（`key`/`name` 存在且为非空字符串）作为成功的必要条件；Content-Type 仅在明确声明为非 JSON（不含 "json" 子串）时才参与拒绝，缺失或含糊的 Content-Type 视为兼容。同时为 `key`/`name` 增加非空字符串值校验（原实现仅检查键存在，`{"key": null}` 会被误判为有效）。
- **Known-bad state avoided:** 避免因严格 AND 逻辑 + 字面量子串匹配导致的“功能正常但被误判为失败”的假阴性回归，以及因未校验字段值类型导致的“伪造 JSON 误判为真实空间数据”的假阳性风险。
- **KEEP:** 保留 DW-65 超时轮询的 spawn+try_wait+kill 设计不变；保留 DW-60 的 `confluenceFormDirty` + `suppressConfluenceDirtyTracking` + `flush:'sync'` 设计不变；保留 DW-63 `resetConfluenceFeedback` 清空 md2cf 状态的改动不变。仅重新derivation `build_confluence_test_result` 与 `test_confluence_connection` 中读取 body 的部分，并补充遗漏的单元测试（key-only/name-only 结构、`run_command_with_timeout` 正常完成路径）与响应体大小上限保护。

### 2026-08-04 — Review pass 2 (bad_spec)
- **Triggering finding:** 两名独立评审者分别指出两处新回归/遗留风险：(a) `build_confluence_test_result` 的成功判据仅要求 `key`/`name` 字段“存在且非空”，未校验字段值是否与本次请求的 Space Key 相关，导致某些代理/网关返回的通用 JSON 错误载荷（恰好含 `name` 字段）可能被误判为“已验证空间访问权限”；(b) pass 1 加入的 `Content-Length` 上限检查对分块传输编码（chunked，无 `Content-Length` 头）响应完全失效，1 MiB 防护形同虚设。
- **Amendment:** (a) 将判据改为要求解析出的 `key` 字段与 `test_confluence_connection` 本次请求使用的 `space_key`（trim 后）精确相等，不再接受“仅 name 存在”作为成功条件；(b) 弃用 `content_length()` 检查，改为使用 reqwest 内置的 `response.chunk().await` 边读边累加字节数，超过 `MAX_CONFLUENCE_TEST_BODY_BYTES` 立即中止读取并判定失败，不依赖 `Content-Length` 头是否存在。同时顺带修复 `check_md2cf_installed` 中 `child.kill()` 与进程自然退出之间的竞态（`kill()` 失败时改为回退至 `wait_with_output()` 而非直接报告为检测失败）。
- **Known-bad state avoided:** 避免因“字段存在即成功”的弱判据导致的假阳性（用户看到“连接成功”但实际命中了代理错误页/无关 JSON 响应）；避免因分块编码响应绕过大小上限检查而导致的无限制内存占用（自 DoS）风险依然存在于生产路径中；避免因 `kill()` 竞态被误报为“md2cf 检测失败”而非“检测完成/未安装”的用户体验回归。
- **KEEP:** 保留 DW-65 超时轮询整体骨架（spawn + try_wait 循环 + 超时判定）不变，仅调整 `kill()` 失败分支的错误处理；保留 DW-60 的表单脏保护设计（`confluenceFormDirty`/`suppressConfluenceDirtyTracking`/`flush:'sync'`）与 DW-63 的 `resetConfluenceFeedback` 改动完全不变；保留 pass 1 已修正的 Content-Type 判定逻辑（结构校验必要 + 仅明确非 JSON 时拒绝）不变，仅将“结构校验”从“字段存在”加强为“key 精确匹配”。仅重新实现 `build_confluence_test_result`（新增 `requested_space_key` 参数）、`test_confluence_connection` 的响应体读取部分、以及 `check_md2cf_installed` 的 `kill()` 错误处理分支，并补充对应单元测试（key 不匹配的通用错误 payload 被拒绝、超大分块响应在无 `Content-Length` 时仍被正确截断）。

## Review Triage Log

### 2026-08-04 — Review pass 1
- intent_gap: 0
- bad_spec: 1 (medium 1)
- patch: 4 (medium 2, low 2)
- defer: 3 (low 3)
- reject: 4 (low 4)
- addressed_findings:
  - `[medium]` `[bad_spec]` Content-Type 字面量匹配 + AND 强校验存在误判合法响应为失败的回归风险（含 `application/hal+json` 等变体未覆盖）；已修正设计为“结构校验必要 + Content-Type 仅在明确冲突时才参与拒绝”，触发本轮 step-03 重新实现
  - `[medium]` `[patch]` `key`/`name` 字段值未校验非空字符串，`{"key": null}` 会被误判为有效空间数据；已在设计中改为 `as_str().is_some_and(|s| !s.is_empty())`
  - `[medium]` `[patch]` `test_confluence_connection` 无限制缓冲响应体到内存；已加入 `Content-Length` 上限检查（1 MiB）作为轻量防护
  - `[low]` `[patch]` 单元测试缺少 key-only/name-only 边界与 `run_command_with_timeout` 正常完成路径覆盖；已加入任务清单待本轮实现补齐

### 2026-08-04 — Review pass 2
- intent_gap: 0
- bad_spec: 2 (medium 2)
- patch: 1 (low 1)
- defer: 4 (low 4)
- reject: 5 (low 5)
- addressed_findings:
  - `[medium]` `[bad_spec]` 两名评审者独立指出：成功判据仅检查 `key`/`name` 字段“存在且非空”，未校验其值是否与本次请求的 Space Key 相关，通用错误 JSON 载荷（例如网关/代理返回的 `{"name": "Not Found"}`）可能被误判为“已验证空间访问权限”；已修正为要求 `key` 字段与请求的 `space_key` 精确相等，触发本轮 step-03 重新实现
  - `[medium]` `[bad_spec]` 两名评审者独立收敛：`response.content_length()` 对分块传输编码（chunked）响应恒为 `None`，导致 pass 1 加入的 1 MiB 上限检查被完全绕过，无限制读入内存的风险依然存在；已修正为使用 `response.chunk().await` 边读边累加字节数、超限立即中止，不再依赖 `Content-Length` 头
  - `[low]` `[patch]` `child.kill()` 与子进程自然退出之间存在竞态，`kill()` 失败会被当作硬错误返回通用检测失败消息；已在设计中改为忽略该竞态错误并回退到 `wait_with_output()`
  - `[low]` `[defer]` `run_command_with_timeout` 使用 `thread::sleep` 轮询——Tauri 对同步 command 已在独立线程池调度执行，不阻塞异步运行时，风险为理论级别，记入 Deferred Work 供未来评估是否切换为异步定时器
  - `[low]` `[defer]` `loadConfluenceSettings` 在表单脏时跳过 `applyConfluenceConfig`，`loadedConfluenceConfig` 基线在用户长时间编辑期间不会刷新——为 DW-60 “保护用户编辑优先于后台同步”的既定取舍，记入 Deferred Work 作为后续可优化项
  - `[low]` `[defer]` 弹窗快速关闭/重开时 `loadConfluenceSettings` 缺少请求代际标记，可能应用过期响应——该竞态在本次改动前已存在（并非本次改动引入），记入 Deferred Work
  - `[low]` `[defer]` 缺少“脏表单阻止后台重载”场景的自动化测试覆盖——因需要在 e2e mock 中人为引入延迟，成本较高，记入 Deferred Work；“分块编码响应仍受大小上限保护”“通用错误 payload 因 name 字段被误判”两项已随本轮 bad_spec 修复补充单元测试，不再记入 defer
  - `[low]` `[reject]` `resetConfluenceFeedback` 在保存/清除凭据等无关操作时也会清空 `md2cfMessage`——该函数语义即“重置本标签页全部反馈状态”，与 DW-63 的既定设计一致，非回归
  - `[low]` `[reject]` 成功提示文案“已验证空间访问权限”被指夸大保证——随 `key_matches` 精确匹配修正后，该文案已能准确反映实际校验强度，问题随 bad_spec 修复一并解决
  - `[low]` `[reject]` `suppressConfluenceDirtyTracking` 早退出场景下可能卡在 `true`——与 pass 1 已记入 Deferred Work 的“脆弱抑制标志设计”为同一问题，不重复记录
  - `[low]` `[reject]` key/name 非字符串类型（数字/对象/数组）缺少专门测试——代码层面 `.as_str()` 已正确处理（返回 `None`），随 bad_spec 修复的新增测试已覆盖该路径
  - `[low]` `[reject]` 忙等待轮询可能阻塞异步运行时——与上方 defer 项为同一问题的两种表述，仅记录一次

### 2026-08-04 — Review pass 3
- intent_gap: 0
- bad_spec: 0
- patch: 4 (medium 2, low 2)
- defer: 5 (low 5)
- reject: 3 (low 3)
- addressed_findings:
  - `[medium]` `[patch]` `run_command_with_timeout` 轮询期间未持续消费子进程的 stdout/stderr 管道；两名评审者独立指出，若子进程输出超过操作系统管道缓冲区（通常约 64 KiB），子进程会在写入时阻塞，`try_wait()` 永远无法观察到其退出，导致恒被误判为超时——这是手写轮询循环相比原 `Command::output()`（内部自动消费管道）重新引入的经典“忘记排空管道”陷阱。已改为在轮询期间用后台线程并发消费 stdout/stderr（各设 1 MiB 上限），并新增 `run_command_with_timeout_drains_large_output_without_deadlocking` 测试验证 200 KiB 输出可在超时前正常完成
  - `[medium]` `[patch]` `build_confluence_test_result` 的 `key` 字段匹配使用大小写敏感的字符串相等；两名评审者独立指出，若 Confluence 实例/代理对 Space Key 做大小写规范化，用户实际能成功访问的连接可能因大小写不一致被误判为失败——属于本轮引入的新回归风险。已改为 `eq_ignore_ascii_case` 大小写不敏感比较，并新增 `build_confluence_test_result_accepts_case_insensitive_key_match` 测试
  - `[low]` `[patch]` `child.try_wait()` 返回 `Err` 时 `?` 直接传播错误，子进程未被终止/回收，存在僵尸/孤儿进程风险；已改为先 `kill()` + `wait()` 回收子进程，再传播错误
  - `[low]` `[patch]` 响应体读取中 `buf.extend_from_slice(&chunk)` 先追加、后检查上限，单个较大的 chunk 可能使缓冲区短暂超过 1 MiB 上限才被发现；已改为追加前检查（`buf.len() + chunk.len() > CAP`），确保缓冲区不会超过上限
  - `[low]` `[defer]` 超时分支丢弃了被杀死前子进程已产生的部分 stdout/stderr，用户提示无法区分“真正卡死”与“即将完成时被误判超时”——低价值信息，记入 Deferred Work
  - `[low]` `[defer]` `test_confluence_connection` 中 `response.chunk()` 流式读取与 1 MiB 上限逻辑缺少直接的集成测试（现有测试仅覆盖 `build_confluence_test_result` 纯函数与通用的 `run_command_with_timeout` 辅助函数）；需要 mock HTTP 服务器，成本较高，记入 Deferred Work
  - `[low]` `[defer]` `check_md2cf_installed()` 本身缺少端到端测试验证 `Completed`/`TimedOut`/`NotFound` 三种结果到 `Md2cfCheckResult` 字段与中文提示的映射；依赖真实 `md2cf` 二进制或复杂 mock，记入 Deferred Work
  - `[low]` `[defer]` 命中 1 MiB 上限后立即返回、不排空剩余响应体，可能影响底层连接池的连接复用；低优先级，记入 Deferred Work
  - `[low]` `[defer]` `child.kill()` 因非竞态原因（如权限错误）失败时，后续 `child.wait()` 理论上可能长时间阻塞——对自身创建的子进程而言概率极低，记入 Deferred Work 供参考
  - `[low]` `[reject]` 超时判定粒度为 `timeout + poll_interval`（最坏约 5.1s 而非精确 5s）——与已在设计中明确记录的 100ms 轮询间隔一致，非新问题
  - `[low]` `[reject]` Content-Type 子串匹配可被 `text/json-html` 等非标准值满足——该判据仅作为“明确非 JSON 时拒绝”的宽松第二道防线，真正的校验依赖后续 JSON 解析 + key 精确匹配，属 pass 1 已确认接受的既定设计取舍，非新回归
  - `[low]` `[reject]` 子进程默认继承父进程 stdin（评审者误认为与 `Command::output()` 默认行为不同）——经核实 `Command::output()` 本身也不会自动置空 stdin，新旧实现在此维度行为一致；但已顺带显式设置 `cmd.stdin(Stdio::null())` 作为良好实践（不视为回归修复，仅为改进附带产物）

## Verification

**Commands:**
- `cd src-tauri && cargo test commands::config` -- expected: 新增与既有的 `config.rs` 单元测试全部通过
- `cd src-tauri && cargo build` -- expected: 编译无错误无新增警告
- `npm run build` -- expected: 前端类型检查与构建通过
- `npx playwright test e2e/story-11-1.spec.ts e2e/story-9-1.spec.ts` -- expected: 既有覆盖 SettingsModal 的回归用例不因本次改动而失败
