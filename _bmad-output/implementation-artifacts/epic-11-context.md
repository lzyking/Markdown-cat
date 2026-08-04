# Epic 11 Context: Confluence 模块健壮性与体验巩固

## Goal

彻底清理与巩固 Story 9.1 / 9.2 Confluence 模块落地后在配置校验、网关/代理容错、异步表单竞态、安全凭据提示及 WAI-ARIA 无障碍方面留存的 Deferred Work 项 (DW-57~DW-66)。

## Stories

- **Story 11.1: Confluence 表单校验与 Token 安全提示** (`11-1-confluence-form-validation-and-token-security`)
  - 清理条目：DW-57, DW-61, DW-62, DW-64
  - 核心要求：增加 Base URL/Space Key 必填与 URL 格式归一化校验；修改地址但留空 Token 时提供明确凭据复用提示；弹窗关闭/重新打开时正确重置与隔离表单状态。

- **Story 11.2: Confluence 网络与进程交互容错** (`11-2-confluence-network-and-process-resilience`)
  - 清理条目：DW-58, DW-60, DW-63, DW-65
  - 核心要求：测试连接增加 Content-Type/JSON 结构校验防 SSO 假成功；防护异步加载覆盖编辑中表单的竞态；补充 `md2cf --version` 命令超时控制；修正格式失败提前返回时的检测反馈清理。

- **Story 11.3: Confluence 无障碍与后端集成测试** (`11-3-confluence-accessibility-and-integration-tests`)
  - 清理条目：DW-59, DW-66
  - 核心要求：补齐 SettingsModal 标签页的 WAI-ARIA Tab 模式 (role="tabpanel"/aria-controls/键盘导航)；增加对 Confluence 后端 Rust 逻辑 (Keyring/HTTP 请求/错误码) 的自动化集成测试。
