---
id: 9-2-confluence-md2cf-publisher
title: Publish Markdown to Confluence using md2cf and REST API
epic: epic-9
status: ready-for-dev
---

# Story 9.2: Publish Markdown to Confluence using md2cf and REST API

## Story Description
作为用户，我可以通过“发布到 Confluence”功能，利用 Python `md2cf` 方案将当前 Markdown 文档（自动处理本地图片、表格、代码块等转为 Confluence 原生 Macro 宏）发布或更新至 Confluence 页面。

## Acceptance Criteria
1. **发布菜单/按钮**: 在 File / 工具栏中增加“Publish to Confluence...”功能。
2. **`md2cf` 转换与 API 调用**: 使用 Python `md2cf` 命令行/库（或内置转换机制）封装 REST API，将 Markdown 转为 Confluence Storage Format XHTML 结构，自动上传 Markdown 中引用的图片附件，处理代码高亮与表格 Macro。
3. **成功反馈与页面链接**: 发布完成后，状态栏/弹窗提示发布成功，并提供可直接点击打开对应 Confluence 页面 URL 的链接。
