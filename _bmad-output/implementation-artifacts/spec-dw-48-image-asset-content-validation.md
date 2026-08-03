---
title: '后端 save_image_asset 命令加固：写入前校验字节内容确为合法图片（DW-48）'
type: 'bugfix'
created: '2026-08-03'
status: 'done'
baseline_revision: 'f8493ba5633b7875cf058917f0abd3538be4a822'
final_revision: '198fe149335e30e4f7728f0e3d8ab9323e3dd199'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** `src-tauri/src/commands/doc.rs` 的 `save_image_asset` 命令只校验文件名合法性（无路径穿越），从未对解码后的 `bytes` 做图片文件头/内容校验；理论上可被用于把任意二进制内容写入受信资源目录中的任意合法文件名。

**Approach:** 在 `save_image_asset_base64_impl` 完成 base64 解码之后、调用 `save_image_asset_impl`/落盘之前，复用既有的 `looks_like_image_content()` 魔数校验函数对解码后的字节做校验；校验失败时直接返回失败 `CmdResult`，不写入任何文件。

## Boundaries & Constraints

**Always:**
- 复用现有 `looks_like_image_content(path, bytes)` 函数（`src-tauri/src/commands/doc.rs`），不新增或修改其魔数判定逻辑。
- 校验使用的 `path` 基于命令收到的 `filename` 参数（构造 `std::path::Path::new(filename)`），以复用其扩展名判断分支（含 SVG 直接放行的既有行为）。
- 校验必须发生在 base64 解码成功之后、`save_image_asset_impl`（写盘）调用之前；校验失败时不得创建目录、不得写入文件。
- 校验失败返回的 `CmdResult` 使用新错误码 `ERR_UNSUPPORTED_IMAGE_TYPE`（与 `read_image_asset` 现有错误码保持一致的命名风格），沿用 `CmdResult::failure` 构造方式。
- 保持 `save_image_asset` 命令签名（`target_dir`, `filename`, `bytes`）与既有行为不变；仅在 `save_image_asset_base64_impl` 内部新增校验步骤。
- 保持中文注释风格；仅在新增校验代码处补充简短注释说明"为什么"（复用已有校验、防止任意二进制写入）。

**Block If:** 无（本轮范围已在情报与既有 `looks_like_image_content` 实现中明确，无需人工决策）。

**Never:**
- 不改变 `looks_like_image_content` 的魔数判定规则或支持的图片类型集合。
- 不改动 `read_image_asset`、`copy_asset_file`、`copy_asset_between_dirs` 等其他命令的字节校验方式。
- 不引入新的 IPC 命令或修改现有命令名。
- 不改变 base64 解码失败时的既有 `ERR_INVALID_IMAGE_DATA` 错误路径与行为。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 合法 PNG/JPEG 字节 | base64 解码后字节以 PNG (`89 50 4e 47`) 或 JPEG (`ff d8 ff`) 魔数开头 | 正常写入文件，返回成功 `CmdResult`，行为与改动前一致 | 无新增错误路径 |
| 非法/伪造图片字节 | base64 解码成功，但字节内容不匹配 `looks_like_image_content` 支持的任何魔数（如任意二进制或文本内容） | 命令返回失败 `CmdResult`，不创建目录、不写入文件 | 返回 `ERR_UNSUPPORTED_IMAGE_TYPE` |
| SVG 文件名 | `filename` 扩展名为 `.svg`（无统一魔数的纯文本格式） | 沿用 `looks_like_image_content` 对 `.svg` 扩展名直接放行的既有行为，正常写入 | 无新增错误路径 |
| base64 解码失败（既有行为，回归验证） | `bytes` 字段不是合法 base64 | 命令返回失败 `CmdResult`，不写入文件（本轮改动不影响此路径） | 沿用既有 `ERR_INVALID_IMAGE_DATA` |

</intent-contract>

## Code Map

- `src-tauri/src/commands/doc.rs` -- 在 `save_image_asset_base64_impl` 中，base64 解码成功后、调用 `save_image_asset_impl` 前插入 `looks_like_image_content` 校验；校验失败返回 `ERR_UNSUPPORTED_IMAGE_TYPE`。
- `src-tauri/src/commands/doc.rs` 测试模块（`mod tests`）-- 更新 `save_image_asset_impl_writes_file_and_allows_asset_directory` 与 `save_image_asset_impl_avoids_name_collision_at_command_level` 中使用的占位字节（当前为 `[1,2,3,4]`/`[1,2]`/`[3,4]`）为合法 PNG 魔数字节，避免这两个测试因新增校验而失真失败；新增用例覆盖 `save_image_asset_base64_impl` 拒绝非法图片内容且不写入文件的路径。

## Tasks & Acceptance

**Execution:**
- [x] `src-tauri/src/commands/doc.rs` -- 在 `save_image_asset_base64_impl` 内，`base64::engine::general_purpose::STANDARD.decode` 成功后，用 `std::path::Path::new(filename)` 与解码字节调用 `looks_like_image_content`；校验不通过时返回 `CmdResult::failure("ERR_UNSUPPORTED_IMAGE_TYPE".to_string())`，不调用 `save_image_asset_impl` -- 补齐 DW-48 描述的写入前内容校验缺口。
- [x] `src-tauri/src/commands/doc.rs` `mod tests` -- 将 `save_image_asset_impl_writes_file_and_allows_asset_directory` 与 `save_image_asset_impl_avoids_name_collision_at_command_level` 测试中的占位字节替换为合法 PNG 魔数字节（如 `&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]`），确保这两个既有测试在新增校验后仍能通过 -- 防止测试因未使用真实图片字节而在加固后误报失败。
- [x] `src-tauri/src/commands/doc.rs` `mod tests` -- 新增测试：`save_image_asset_base64_impl` 传入能被 base64 解码、但内容不匹配任何受支持图片魔数的字节（如纯文本 `"not an image"` 编码后的 base64），断言返回失败、`error` 为 `Some("ERR_UNSUPPORTED_IMAGE_TYPE".to_string())`，且目标目录未被创建/文件未被写入 -- 验证 DW-48 加固的核心行为与 I/O 矩阵中的"非法/伪造图片字节"场景。

**Acceptance Criteria:**
- Given 前端粘贴/保存流程传入合法 PNG 或 JPEG 字节（base64 编码后），when 调用 `save_image_asset`，then 文件被正常写入，行为与改动前一致。
- Given 调用方传入能通过 base64 解码但不是合法图片魔数的字节，when 调用 `save_image_asset`，then 命令返回失败且不写入任何文件、不创建目标目录。
- Given `filename` 扩展名为 `.svg`，when 调用 `save_image_asset`，then 沿用 `looks_like_image_content` 对 SVG 的既有放行逻辑，正常写入。

## Review Triage Log

### 2026-08-03 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1: (low 1)
- defer: 3: (low 3)
- reject: 3: (low 3)
- addressed_findings:
  - `[low]` `[patch]` 新增的 `save_image_asset_rejects_non_image_content_without_writing_file` 测试补充断言：拒绝路径下 `asset_protocol_scope().is_allowed(&asset_dir)` 应为 `false`，覆盖“拒绝写入时不应放宽 asset:// 作用域”这一回归点。

Findings routed to defer (pre-existing gaps, not caused by this diff; extending them would violate this spec's `<intent-contract>` "Never: 不改变 `looks_like_image_content` 的魔数判定规则或支持的图片类型集合" 与 "Always: 复用现有 `looks_like_image_content` 函数...不新增或修改其魔数判定逻辑" 边界，须交由后续独立故事处理）：
- `.svg` 扩展名文件在 `looks_like_image_content` 中被直接放行、不做任何字节内容校验，`save_image_asset` 沿用该既有行为后同样可被用于把任意文本内容以 `.svg` 命名写入受信目录（该缺口存在于 `read_image_asset` 已使用的共享函数中，早于本次改动）。
- `save_image_asset` 从未对 `filename` 的扩展名做白名单校验（`is_supported_image_extension` 仅用于 `read_image_asset`），理论上只要字节匹配任一受支持图片魔数，即可用任意扩展名（如 `.bin`、`.dat`）写入受信目录（早于本次改动，本次改动未扩大或缩小该行为）。
- `looks_like_image_content` 对 AVIF（仅检测 `ftyp` 位于第 4-8 字节）与 TIFF（仅检测 `II`/`MM` 开头）的魔数嗅探过于宽松，可能误判部分非图片的 ISO-BMFF/TIFF 系容器文件为合法图片（该逻辑本身早于本次改动且不在本次改动范围内）。

Findings rejected as noise (working as designed per this spec's boundaries, not defects):
- 扩展名与内容不匹配（如 `paste.png` 内容实为合法 JPEG 字节）仍被接受——`looks_like_image_content` 按设计只校验字节是否为*某种*受支持图片格式，不校验是否与具体扩展名严格匹配，`read_image_asset` 已是同样语义，非本次改动引入的缺陷。
- 校验逻辑放在 `save_image_asset_base64_impl` 而非更底层的 `save_image_asset_impl`——这是本 spec `<intent-contract>` "Always" 明确要求的落点（复用点位于 base64 解码之后），属预期设计，非缺陷。
- 测试夹具（`PNG_BYTES` 仅 6 字节、`iVBORw==` 解码后仅 4 字节）"不是完整合法图片"——与代码库既有测试风格一致（如既有 `save_image_asset_decodes_valid_base64_and_writes_file` 同样只用 4 字节魔数前缀验证识别逻辑），非本次改动引入的问题。

## Verification

**Commands:**
- `cargo test --manifest-path src-tauri/Cargo.toml doc::` -- expected: 全部通过，含更新后的既有测试与新增的内容校验拒绝测试。
- `cargo build --manifest-path src-tauri/Cargo.toml` -- expected: 编译无错误无新增警告。

## Auto Run Result

Status: done

Summary: 为 DW-48 加固 `save_image_asset` 后端命令：base64 解码后、落盘前，复用既有 `looks_like_image_content()` 魔数校验函数拒绝非法图片字节，避免任意二进制内容借合法文件名写入受信资源目录。

Files changed:
- `src-tauri/src/commands/doc.rs` -- `save_image_asset_base64_impl` 新增解码后内容校验（失败返回 `ERR_UNSUPPORTED_IMAGE_TYPE`，不落盘）；更新两个既有测试的占位字节为合法 PNG 魔数字节；新增 `save_image_asset_rejects_non_image_content_without_writing_file` 测试并在审查后补充 asset 作用域未被放宽的断言。

Review findings breakdown:
- patch: 1 low-severity finding applied (rejection-path test now also asserts asset:// scope was not widened).
- defer: 3 low-severity pre-existing gaps identified, all explicitly out of scope per this spec's `<intent-contract>` boundaries (`.svg` bypass, no extension whitelist in `save_image_asset`, loose AVIF/TIFF magic sniffing in the shared `looks_like_image_content` helper) — logged in `## Review Triage Log` above for the orchestrator; the deferred-work ledger itself was intentionally left untouched per this run's invocation instructions.
- reject: 3 findings dropped as noise (working as designed: extension/content mismatch tolerance, validation placement, minimal test fixtures matching existing codebase convention).

Follow-up review recommendation: false — the only applied change this pass was one localized, low-consequence test assertion; no behavior, API, or security-relevant code changed during review.

Verification performed:
- `cargo test --manifest-path src-tauri/Cargo.toml doc::` -- all 14 tests passed, including updated and new tests.
- `cargo build --manifest-path src-tauri/Cargo.toml` -- compiled cleanly, no new warnings.

Residual risks:
- The pre-existing `.svg` content-validation bypass and missing extension whitelist in `save_image_asset` remain (see deferred findings above) — these are broader gaps in the shared `looks_like_image_content` helper and command design, out of scope for this DW-48-scoped fix.
