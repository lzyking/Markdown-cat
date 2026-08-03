---
title: 'Save As 资源迁移健壮性加固'
type: 'bugfix' # feature | bugfix | refactor | chore
created: '2026-08-03'
status: 'done' # draft | ready-for-dev | in-progress | in-review | done | blocked
baseline_revision: '4870d431586447f7abe860a0d9aa9fdeaa3789b0'
final_revision: '0b2465d2a5181ad8e6a513d855d5d9aa5a50cc0e'
review_loop_iteration: 0 # incremented by step-04 before each review loopback
followup_review_recommended: false # set by step-04 on status: done from the final review pass significance judgment
context: []
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** "另存为"（Save As）的资源迁移路径存在三个相关缺口：(1) `copy_asset_between_dirs` 在目标目录已存在同名文件时用 `fs::copy` 直接覆盖，而不像粘贴保存那样做唯一化处理；(2) `handleSaveAsFile` 未检查 `AssetMigrationResult.migrated`，迁移失败/跳过时仅 `console.error`，UI 仍提示保存成功，用户无法察觉图片引用失效；(3) `extractAssetReferences` 只识别 `![alt](./assets/filename)` 一种写法，无法识别 HTML `<img>`、引用式链接、带标题的链接、以及不带 `./` 前缀的 `assets/filename` 路径，导致这些引用在迁移时被漏掉。

**Approach:** 复用 `write_unique_file` 已有的“探测占用 -> 递增后缀”唯一化逻辑，为 `copy_asset_between_dirs` 增加同名冲突时的重命名能力并向调用方返回最终使用的文件名；在 `copy_asset_file` 命令与 `AssetMigrationResult` 中新增 `finalFilename` 字段回传该结果；`handleSaveAsFile` 在收到迁移结果后检查 `migrated` 与文件名是否变化，对失败/跳过给出非阻断式 UI 警告，对文件名变化则原地替换正文中对应的 Markdown 图片引用；`extractAssetReferences` 扩展正则覆盖 HTML `<img src="...">`、引用式链接定义 `[label]: ./assets/filename`、带标题的行内链接 `![alt](./assets/filename "title")`，以及无 `./` 前缀的 `assets/filename` 路径。

## Boundaries & Constraints

**Always:**
- `copy_asset_between_dirs` 的唯一化必须与 `write_unique_file` 一致：保留原扩展名，在文件名 stem 后追加递增数字后缀（`_1`, `_2`, ...），直至找到未被占用的目标路径。
- 唯一化后的最终文件名必须原子化地返回给调用方（Rust 层返回值 + `AssetMigrationResult` 序列化字段），前端据此更新 Markdown 正文中的引用。
- `handleSaveAsFile` 中，无论 `assets/` 迁移分支还是同级图片迁移分支，都要检查 `migrated` 结果；`migrated: false`（源文件缺失被跳过）或迁移调用抛出异常，都必须让用户可见（更新 `saveMessage` 与 `saveStatus`，不能仅 `console.error`），但不能阻止/回滚已经成功完成的文档另存为本身。
- 若同一份文档的多个图片迁移中，一部分失败/跳过、一部分成功迁移改名，UI 提示需要能反映"另存为成功，但部分图片未迁移"这种混合状态，而不是被最后一次迁移结果覆盖。
- `extractAssetReferences` 的新增匹配模式必须仍然拒绝路径穿越（含 `/`、`\`、`..` 的候选一律跳过），并保持返回值为去重后的纯文件名列表，行为与现有 `decodeURIComponent` 容错逻辑保持一致。
- 新增/修改的 Rust 与 TypeScript 逻辑都需要补充对应单元测试覆盖 I/O 矩阵中的场景。

**Block If:** 无（本次范围内的三个缺口均有明确的最小可行修复路径，不存在需要人工决策的分支）。

**Never:**
- 不修改 `save_binary_asset_to_dir` / `write_unique_file` 已有的粘贴保存唯一化实现，只在 `copy_asset_between_dirs` 中复用/新增等价逻辑。
- 不引入迁移失败时的自动重试或回滚文档保存的机制——用户已经保存成功的文档路径不因图片迁移失败而回退。
- 不改变 `copy_asset_file` Tauri 命令的现有调用方参数（`fromDir`/`toDir`/`filename`），只在返回结构体中新增字段。
- 不实现完整的 Markdown/HTML 解析器；`extractAssetReferences` 的扩展仍是基于正则的启发式匹配，只覆盖本次列出的四种额外写法，不追求覆盖所有可能的 Markdown 图片引用语法变体。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 目标目录无同名文件 | `copy_asset_between_dirs(from, to, "img.png")`，`to/img.png` 不存在 | 复制为 `img.png`，返回 `Some("img.png")` 对应最终文件名 | 无 |
| 目标目录已有同名文件 | `to/img.png` 已存在（内容不同） | 复制为 `img_1.png`（或下一个未占用的递增后缀），返回该最终文件名，不覆盖已有文件 | 无错误，视为正常唯一化 |
| 源文件不存在 | `from/missing.png` 不存在 | 返回 `Ok(None)`，不创建目标目录 | 保持现有跳过行为不变 |
| 前端收到 `migrated: false` | `copy_asset_file` 返回 `{migrated: false}` | `saveMessage` 在保存成功提示基础上追加警告（如"另存为成功，但部分图片未迁移"），`console.error` 仍保留 | 不影响文档已另存为成功的状态 |
| 前端收到迁移改名 | `copy_asset_file` 返回的最终文件名与请求的 `filename` 不同 | 用正则将正文中对应的旧文件名引用替换为新文件名，避免图片链接失效 | 替换应仅针对该文件名的资源路径出现处，不误伤其他同名文本 |
| `extractAssetReferences` 匹配 HTML `<img>` | 正文含 `<img src="./assets/pic.png">` | 返回包含 `pic.png` | 无 |
| `extractAssetReferences` 匹配引用式链接 | 正文含 `![alt][ref]` 和 `[ref]: ./assets/pic.png` | 返回包含 `pic.png` | 无 |
| `extractAssetReferences` 匹配带标题链接 | 正文含 `![alt](./assets/pic.png "标题")` | 返回包含 `pic.png` | 无 |
| `extractAssetReferences` 匹配无 `./` 前缀路径 | 正文含 `![alt](assets/pic.png)` | 返回包含 `pic.png` | 无 |
| `extractAssetReferences` 路径穿越防护 | 正文含 `<img src="./assets/../secret.png">` 或类似构造 | 该候选被跳过，不出现在返回列表中 | 与现有行为一致 |

</intent-contract>

## Code Map

- `src-tauri/src/doc.rs` -- `copy_asset_between_dirs` 需要在目标文件已存在时唯一化并返回最终文件名；可提炼/复用现有 `write_unique_file` 的命名生成逻辑（copy 场景需要复制字节内容而非直接写入新字节，可通过读取源文件字节后调用等价的候选名生成 + `fs::copy` 来实现，或抽出共享的“候选名生成”辅助函数供两处复用）。
- `src-tauri/src/commands/doc.rs` -- `AssetMigrationResult` 结构体与 `copy_asset_file_impl`/`copy_asset_file`：新增 `final_filename: Option<String>` 字段（`migrated: true` 时为唯一化后的最终文件名；`false` 时为 `None`），序列化为 camelCase 供前端消费。
- `src/lib/types.ts` -- 新增/更新 `AssetMigrationResult` 接口（`migrated: boolean`, `finalFilename?: string | null`），供 `App.vue` 使用类型化的 `invoke` 返回值。
- `src/App.vue` -- `handleSaveAsFile` 中两处 `copy_asset_file` 调用：改为使用类型化返回值检查 `migrated`；`migrated === false` 时汇总为警告追加到 `saveMessage`；`finalFilename` 与原文件名不同时替换 `content.value` 中对应的资源引用。
- `src/lib/image-assets.ts` -- `extractAssetReferences`：扩展匹配规则以覆盖 HTML `<img>`、引用式链接定义、带标题的行内链接、无 `./` 前缀的 `assets/filename` 路径，同时保留现有路径穿越防护与 `decodeURIComponent` 容错。
- `src/lib/image-assets.test.ts` -- 新建测试文件，覆盖 `extractAssetReferences` 新增场景（该文件当前不存在，需要新建）。
- `src-tauri/src/doc.rs`（`#[cfg(test)] mod tests`）-- 为 `copy_asset_between_dirs` 新增同名冲突唯一化的单元测试。
- `src-tauri/src/commands/doc.rs`（`#[cfg(test)] mod tests`）-- 为 `copy_asset_file_impl` 新增验证 `final_filename` 回传值的单元测试。

## Tasks & Acceptance

**Execution:**
- [x] `src-tauri/src/doc.rs` -- 让 `copy_asset_between_dirs` 在 `dest` 已存在时，仿照 `write_unique_file` 的“stem + 递增后缀 + 原扩展名”规则寻找未占用的目标文件名，用 `fs::copy` 复制到该唯一路径，并将返回值从当前的 `Result<Option<String>, String>`（完整路径）调整为同时携带最终文件名（例如返回 `Result<Option<(String, String)>, String>` 为 `(final_filename, full_path)`，或新增字段）-- 解决 DW-51：避免同名文件被静默覆盖。
- [x] `src-tauri/src/commands/doc.rs` -- 在 `AssetMigrationResult` 增加 `final_filename: Option<String>` 字段；更新 `copy_asset_file_impl` 从 `copy_asset_between_dirs` 的新返回值中取出最终文件名并填入结果 -- 让前端能够感知迁移后被重命名的文件名。
- [x] `src/lib/types.ts` -- 定义/更新 `AssetMigrationResult` TS 接口以匹配后端新增字段 -- 为前端提供类型化访问。
- [x] `src/App.vue` -- `handleSaveAsFile` 中两处迁移调用改为使用 `invoke<CmdResult<AssetMigrationResult>>('copy_asset_file', ...)`；收集每次迁移的失败/跳过/改名情况；迁移循环结束后，如有任何 `migrated === false` 的情况，在 `saveMessage` 后追加警告文案（如 `（警告：N 张图片未能随文档迁移，请检查图片链接）`）；如有 `finalFilename` 与原文件名不同的情况，用文件名做字符串替换更新 `content.value` 中的对应引用 -- 解决 DW-52：让迁移失败/跳过对用户可见，且改名后的引用保持有效。
- [x] `src/lib/image-assets.ts` -- 扩展 `extractAssetReferences` 的匹配逻辑：新增对 `<img[^>]+src=["']\.?\/?assets\/([^"'\s]+)["']` 形式 HTML 标签、引用式链接定义 `^\s*\[[^\]]+\]:\s*\.?\/?assets\/(\S+)`（支持行内出现）、带标题的行内链接 `!\[[^\]]*\]\(\.?\/?assets\/([^)\s]+)(?:\s+"[^"]*")?\)`、以及无 `./` 前缀 `assets/filename` 的匹配；统一通过既有的路径穿越过滤与 `decodeURIComponent` 容错后再加入结果集合 -- 解决 DW-53：扩大另存为迁移时识别到的图片引用写法覆盖面。
- [x] `src-tauri/src/doc.rs` -- 新增测试：目标目录已存在同名文件时 `copy_asset_between_dirs` 唯一化重命名且不覆盖原文件，源文件内容验证两者均保留 -- 覆盖 I/O 矩阵"目标目录已有同名文件"场景。
- [x] `src-tauri/src/commands/doc.rs` -- 新增测试：`copy_asset_file_impl` 在目标目录已有同名文件时返回的 `final_filename` 与实际写入的文件名一致 -- 覆盖唯一化结果的端到端回传。
- [x] `src/lib/image-assets.test.ts` -- 新建测试文件并覆盖 I/O 矩阵中 HTML `<img>`、引用式链接、带标题链接、无 `./` 前缀路径、路径穿越防护五个场景 -- 保证扩展后的正则行为符合预期且不引入回归。

**Acceptance Criteria:**
- Given 目标目录已存在与待迁移资源同名的文件，when 执行“另存为”触发资源迁移，then 原有同名文件内容不被覆盖，新迁移的文件以唯一化后的新文件名写入，且正文中对应的图片引用被替换为新文件名。
- Given 某次资源迁移因源文件已被外部删除而返回 `migrated: false`，when “另存为”流程结束，then 用户在保存成功提示的基础上能看到明确的警告文案，而不是仅在控制台看到 `console.error`。
- Given 正文中包含 HTML `<img>` 标签、引用式链接、带标题的行内链接或不带 `./` 前缀的 `assets/filename` 路径引用暂存图片，when 执行“另存为”，then 这些引用对应的图片文件都被正确识别并迁移到新文档目录。

## Spec Change Log

(空 — 本轮未触发 bad_spec 回环)

## Review Triage Log

### 2026-08-03 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4 (high 1, medium 2, low 1)
- defer: 2 (low 2)
- reject: 3
- addressed_findings:
  - `[high]` `[patch]` `replaceAssetReferenceFilename` 未覆盖无引号的 HTML `<img src=assets/...>` 写法，导致该写法下改名后的引用未被回写，图片链接失效 —— 已新增无引号形式的替换分支（`src/App.vue`）。
  - `[medium]` `[patch]` 迁移改名重写时，若原始引用是 `%`-百分号编码文件名，替换逻辑只按解码后的名字匹配，命中不到正文中的编码形式 —— 已改为同时尝试编码前后两种形式进行替换（`src/App.vue`）。
  - `[medium]` `[patch]` `handleSaveAsFile` 用布尔标志 `suppressAutoSave` 抑制自动保存监听器，但 Vue 默认 `watch` 是异步 flush，标志在监听器实际执行前已被重置，导致改名重写时仍会多触发一次自动保存 —— 已改为在重置前 `await nextTick()`（`src/App.vue`）。
  - `[low]` `[patch]` `extractAssetReferences` 的路径穿越过滤使用 `candidate.includes('..')`，会连带拒绝合法的含 “..” 子串文件名（如 `v1..2.png`）—— 已改回精确匹配 `candidate !== '..'`（斜杠检测已足以阻止真正的路径穿越）（`src/lib/image-assets.ts`）。

  已计入 defer（见 `deferred-work.md`，不在此重复列出具体内容）：
  - `[low]` `extractSiblingImageReferences`/`replaceSiblingImageReferenceFilename` 尚未像 `extractAssetReferences` 一样扩展到 HTML `<img>`、引用式、带标题链接写法（DW-53 原始条目范围仅覆盖 `extractAssetReferences`，本轮未涉及）。
  - `[low]` 资源引用正则会把形如 `pic.png?raw=1` 的查询字符串后缀当作文件名的一部分，导致该写法的迁移静默跳过（该限制在改动前的正则中已存在，非本次引入）。

  已 reject（噪音/不属于本故事范围，理由）：
  - `copy_asset_between_dirs` 复制路径仍存在“判断不存在 -> `fs::copy`”之间的极小 TOCTOU 竞态窗口 —— Design Notes 已明确将其列为本轮可接受的已知取舍并已在代码中加注释说明，非新增缺陷。
  - 迁移改名重写保存失败时 `saveStatus` 仍为 `success` —— 这是 spec 明确要求的“不回滚已保存文档”设计决策的直接结果，且已附带警告文案提示用户重新保存。
  - 缺少 `handleSaveAsFile` 端到端集成测试 —— 仓库当前没有任何 `App.vue` 组件级测试先例，引入新测试范式超出本次 spec 的 Verification 范围。

### 2026-08-03 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2 (high 1, low 1)
- defer: 2 (low 2)
- reject: 6 (medium 4, low 2)
- addressed_findings:
  - `[high]` `[patch]` 同一文档内多个资源迁移改名存在级联冲突：当资源 A 的“唯一化后新文件名”恰好等于资源 B 的“原文件名”时，按顺序逐个替换会让后一次替换命中前一次替换刚写入的文本，导致两个图片引用被错误地收敛到同一个文件名（图片链接损坏）—— 已改为先收集全部改名结果，再用“占位符两阶段替换”（`applyAssetRenames`，同时处理原样与 `encodeURIComponent` 编码后的占位符）一次性批量应用，避免改名之间互相干扰（`src/App.vue`）。
  - `[low]` `[patch]` `replaceSiblingImageReferenceFilename`（同级图片改名重写）与 `replaceAssetReferenceFilename` 不一致，完全没有尝试 `encodeURIComponent` 编码形式的匹配，导致文件名含空格等字符经百分号编码书写时，重命名后同级图片引用不会被回写 —— 已比照 `replaceAssetReferenceFilename` 补充原样 + 编码两种形式的替换（`src/App.vue`）。

  已计入 defer（见 `deferred-work.md`，不在此重复列出具体内容）：
  - `[low]` `extractSiblingImageReferences`/`replaceSiblingImageReferenceFilename` 仍只识别行内 `![alt](./filename)` 一种同级图片写法，未跟进本轮为 `extractAssetReferences` 新增的 HTML/引用式/带标题链接支持。
  - `[low]` `extractAssetReferences` 会把 `?query`/`#fragment` 后缀当作文件名字面量的一部分，导致该写法引用的资源迁移时被误判为缺失并跳过；该限制在改动前的正则中已存在，非本次引入。

  已 reject（噪音/不属于本故事范围，理由）：
  - 无引号自闭合 HTML `<img src=assets/pic.png/>` 写法未被识别 —— intent-contract 的 `Never` 边界明确声明“不追求覆盖所有可能的 Markdown 图片引用语法变体”，该写法不在本轮列出的四种扩展形式之内。
  - `replaceAssetReferenceFilename` 对小写十六进制百分号编码（如自定义工具生成的 `%e4%bd...`）不会命中改名替换 —— `encodeURIComponent` 产出大写十六进制是 JS 标准行为，spec 的 I/O 矩阵未要求覆盖非标准大小写编码，影响面极窄。
  - 引用式链接定义 `[label]: ./assets/file` 的匹配未区分该 `label` 是否确实被 `![alt][label]` 图片语法消费，可能把非图片的链接目标（如 PDF）一并纳入迁移候选 —— 消费关系判定需要额外交叉引用逻辑，且现有行为只会产生多余的迁移/提示文案，不会损坏已有内容，风险与收益不成比例，本轮不作为高置信度缺陷处理。
  - 迁移改名重写保存失败时 `saveStatus` 仍为 `success` —— 与上一轮结论一致，这是 spec 明确要求的“不回滚已保存文档”设计决策的直接结果。
  - `copy_asset_between_dirs` 判断“源 == 目标”仅用原始路径字符串相等，未处理符号链接/大小写不敏感文件系统等路径别名场景 —— 触发条件狭窄且非常规使用场景，现有 I/O 矩阵未覆盖，影响可忽略。
  - 引用式链接的尖括号目标写法 `[ref]: <./assets/pic.png>` 未被识别 —— 同样落在 intent-contract `Never` 边界声明的“不追求覆盖所有变体”范围内。

### 2026-08-03 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 2 (medium 2)
- reject: 6 (high 1, medium 1, low 4)
- addressed_findings:
  - none

  已计入 defer（见 `deferred-work.md`，不在此重复列出具体内容）：
  - `[medium]` `extractAssetReferences` 未排除 fenced code block（```` ``` ````）内的内容，围栏代码块中的示例性 `<img>`/图片引用写法会被误判为真实资源依赖，触发多余的"未迁移"警告；本轮新增的 HTML `<img>` 匹配扩大了该既有缺口的触发面。
  - `[medium]` `extractSiblingImageReferences`/`replaceSiblingImageReferenceFilename` 仍未跟进本轮为 `extractAssetReferences` 新增的 HTML/引用式/带标题链接支持（与既有 defer 条目重复确认，独立复核提高了置信度）。

  已 reject（噪音/不属于本故事范围/既有设计取舍，理由）：
  - `[high]` 迁移改名重写后第二次 `save_document_as` 失败时 `saveStatus` 仍为 `success` —— 代码已在该分支追加"已改名的图片引用未能立即写回磁盘，请再次保存确认"警告文案，与前两轮已确认的"不回滚已保存文档"spec 设计决策一致，非新缺陷。
  - `[medium]` `copy_asset_between_dirs` 的"判断不存在 -> `fs::copy`"之间仍存在 TOCTOU 竞态窗口（Blind Hunter 与 Edge Case Hunter 均提出同一发现）—— Design Notes 已明确将其列为本轮可接受的已知取舍，前两轮审查已就此结论一致。
  - `[low]` 新增的 `src/lib/image-assets.test.ts` 未接入 `package.json` 的任何脚本 —— 仓库现有全部 `src/lib/*.test.ts` 均未接入脚本，属既有全仓库惯例，非本故事引入的问题。
  - `[low]` 缺少 `handleSaveAsFile`/`applyAssetRenames` 的端到端集成测试 —— 与前两轮结论一致，仓库当前无 `App.vue` 组件级测试先例，超出本次 spec 的 Verification 范围。
  - `[low]` 改名重写替换未覆盖小写十六进制百分号编码变体 —— 与上一轮结论一致，`encodeURIComponent` 产出大写十六进制是 JS 标准行为，非标准大小写编码覆盖不在 I/O 矩阵范围内。
  - `[low]` 引用式链接/图片链接的尖括号目标写法 `<./assets/pic.png>` 未被识别 —— 与上一轮结论一致，落在 intent-contract `Never` 边界声明范围内。

## Design Notes

`copy_asset_between_dirs` 的唯一化不能直接调用 `write_unique_file`（它是为“先读取字节到内存再写入新文件”的粘贴场景设计的，签名接受 `bytes: &[u8]`）。推荐抽出一个共享的私有辅助函数，例如 `fn find_unique_destination(dir: &Path, filename: &str) -> (String, PathBuf)`，返回不冲突的候选文件名与完整路径（复用现有的 stem/ext 拆分与探测存在性循环，但不做 `create_new` 原子写入，因为 copy 场景要用 `fs::copy` 整体复制字节，不是逐块写入）。`copy_asset_between_dirs` 与 `write_unique_file` 都可以调用它生成候选名，前者继续用 `fs::copy` 完成复制，后者继续用 `create_new` 原子创建。注意 copy 场景理论上仍存在“判断不存在 -> fs::copy”之间的极小竞态窗口，与 `write_unique_file` 的完全原子化不同；由于图片迁移过程是文档保存的一部分、正常运行下不会并发触发，因此非本次要求消除的场景（保持并说明即可，不必用 `create_new` 语义重写 `fs::copy` 路径）。

前端识别“混合结果”（部分迁移成功改名 + 部分失败跳过）时，建议用一个局部数组分别收集 `renamed: {old, new}[]` 与 `skippedOrFailed: string[]`，迁移循环结束后统一决定 `saveMessage` 的最终文案，而不是在循环内部逐次覆盖 `saveMessage`。

## Verification

**Commands:**
- `cd src-tauri && cargo test doc::` -- expected: 新增与既有的 `copy_asset_between_dirs`/`copy_asset_file_impl` 单元测试全部通过。
- `npx tsx --test src/lib/image-assets.test.ts` -- expected: 新增的 `extractAssetReferences` 场景测试全部通过（与仓库现有 `src/lib/*.test.ts` 采用一致的 `node:test`/`node:assert` 约定，而非 vitest）。
- `npx vue-tsc --noEmit` -- expected: `App.vue` 与 `types.ts` 的类型修改无编译错误。

## Auto Run Result

**Summary:** 对已 `done` 的 Save As 资源迁移加固故事发起一轮追加复核（Blind Hunter + Edge Case Hunter 并行）。本轮未发现新的 intent_gap 或 bad_spec，也没有可自动修复的 patch；两个真实、可信的既有性缺口（fenced code block 内的误匹配、sibling 图片引用未跟进新语法支持）被计入 `deferred-work.md`，其余 6 项发现（高危 1、中危 1、低危 4）经核实均为既有设计取舍或已在前两轮复核中给出结论一致的 reject，未触发任何代码改动。

**Files changed:** 无源代码改动；仅更新 `_bmad-output/implementation-artifacts/spec-save-as-asset-migration-hardening.md`（Review Triage Log 追加本轮记录、frontmatter 状态与 `followup_review_recommended` 更新）与 `_bmad-output/implementation-artifacts/deferred-work.md`（新增 2 条 defer 记录）。

**Review findings breakdown:** patch 0；defer 2（medium 2，已追加至 `deferred-work.md`）；reject 6（high 1、medium 1、low 4，均为既有设计决策或跨轮一致结论，理由见本轮 Review Triage Log）。

**Follow-up review recommendation:** `false` —— 本轮未产生任何代码改动，两项 defer 均为既有、低风险、范围明确的覆盖缺口（不影响已保存文档或已迁移资源的正确性），不构成需要独立复核的显著变更。

**Verification performed:** 未执行命令级验证 —— 本轮无代码改动，仅审查现有代码与既有测试覆盖范围（通过阅读源码确认 `extractAssetReferences`/`extractSiblingImageReferences`/`handleSaveAsFile`/`copy_asset_between_dirs` 的当前实现与既有 reject/defer 结论一致）。

**Residual risks:** 两项新增 defer（code-fence 误匹配、sibling 图片引用语法覆盖不全）与既有多项 defer 一并留存，均为低到中危、范围明确的已知限制，不影响本故事已交付功能的正确性。

## Auto Run Result

**Summary:** 2026-08-03 的补充审查发现一个高危缺陷：`handleSaveAsFile` 逐个应用资源改名重写时，若某个资源的“唯一化后新文件名”恰好与另一个资源的“原文件名”相同，顺序替换会让后一次替换命中前一次替换刚写入的文本，导致两个不同图片的引用被错误地收敛为同一个文件名（图片链接损坏）。已通过“先收集全部改名结果、再用占位符做两阶段批量替换”的方式修复（新增 `applyAssetRenames` 辅助函数），并同时修复了 `replaceSiblingImageReferenceFilename` 缺少百分号编码变体匹配、与 `replaceAssetReferenceFilename` 行为不一致的低危问题。

**Files changed:**
- `src/App.vue` — 新增 `AssetRename` 接口与 `applyAssetRenames` 两阶段占位符批量替换函数；`handleSaveAsFile` 内的迁移循环改为收集 `pendingRenames` 而非立即改写正文，迁移全部完成后统一调用 `applyAssetRenames`；`replaceSiblingImageReferenceFilename` 补充原样 + `encodeURIComponent` 编码两种形式的替换，与 `replaceAssetReferenceFilename` 保持一致。

**Review findings breakdown:** patch 2（high 1、low 1，均已修复）；defer 2（low 2，已追加至 `deferred-work.md`）；reject 6（medium 4、low 2，噪音或明确超出本轮 intent-contract 范围）。

**Follow-up review recommendation:** `true` —— 本轮修复的高危发现改变了 `handleSaveAsFile` 迁移改名的核心批量替换逻辑（新引入的占位符两阶段替换机制），虽改动局部但涉及数据正确性（图片链接不被静默损坏），值得一次独立复核确认边界场景（如多资源循环改名、`encodeURIComponent` 占位符往返）均已覆盖。

**Verification performed:**
- `cd src-tauri && cargo test doc::` — 16 passed。
- `npx tsx --test src/lib/image-assets.test.ts` — 5 passed（本轮未新增该文件的测试，因新增/修复的代码位于 `src/App.vue`，仓库当前无 `App.vue` 组件级测试先例）。
- `npx vue-tsc --noEmit` — 无编译错误。
- 独立 Node 脚本手工复现并验证了级联改名冲突修复前后的行为差异（修复前 `pic.png`/`pic_1.png` 双改名场景会导致两个引用被错误收敛为同一文件名；修复后各自正确重写）。

**Residual risks:** 已 defer 的两项（同级图片扩展写法覆盖不全、查询字符串后缀被当作文件名字面量）仍未解决，属既有/低危范围，已记录待后续处理；未新增自动化测试直接覆盖 `applyAssetRenames`/`handleSaveAsFile`，因仓库当前无 `App.vue` 组件级测试基础设施，超出本轮 spec 的 Verification 范围（沿用既有先例）。
