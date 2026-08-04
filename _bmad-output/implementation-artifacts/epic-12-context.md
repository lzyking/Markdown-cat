# Epic 12 Context: 会话生命周期与 Markdown 资源解析容错

## Goal

针对应用启动恢复（Session Restore）与 Markdown 资源解析器（Asset Parser）在极端场景和边界语法下的缺陷（DW-76~DW-82）进行深度容错治理与自动化测试补齐。

## Stories

- **Story 12.1: 启动恢复容错与会话隔离** (`12-1-session-startup-restore-fault-tolerance`)
  - 清理条目：DW-76, DW-77, DW-79
  - 核心要求：恢复上次打开文件失败时自动清空失效配置；`read_external_document` 异常捕获防止中断后续启动流程；引入文件切换 Guard，防止慢速文件读取覆盖用户已打开的新文档。

- **Story 12.2: Markdown 图片解析器边界扩展** (`12-2-markdown-asset-parser-edge-cases`)
  - 清理条目：DW-80, DW-81, DW-82
  - 核心要求：扩展图片引用解析器支持 HTML `<img>` 和引用式链接；正确剥离 URL 中的 Query String 与 Fragment (`?raw=1`, `#frag`)；忽略 Fenced Code Block 代码块内部的示例图片语法。

- **Story 12.3: 会话恢复与资源操作链回归测试** (`12-3-session-restore-and-asset-regression-tests`)
  - 清理条目：DW-78
  - 核心要求：补充“恢复上次打开文件 → 粘贴/保存/导出图片”完整生命周期的 Playwright E2E 自动化回归测试。
