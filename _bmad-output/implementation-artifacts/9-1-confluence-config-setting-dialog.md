---
id: 9-1-confluence-config-setting-dialog
title: Confluence REST API Configuration Setting Modal
epic: epic-9
status: ready-for-dev
---

# Story 9.1: Confluence REST API Configuration Setting Modal

## Story Description
作为用户，我可以在软件设置中配置 Confluence REST API 连接凭证（Base URL, Username, API Token, Space Key, Parent Page ID），并测试网络连通性，为文档发布做准备。

## Acceptance Criteria
1. **设置配置界面**: 在设置面板/对话框中增加 Confluence 标签页，提供输入字段：Confluence Server URL, Username/Email, API Token / Personal Access Token, Space Key, Parent Page ID。
2. **测试连接 (Test Connection)**: 点击按钮调用 Confluence REST API `/rest/api/space/{spaceKey}` 进行连通性与权限校验，返回成功或明确报错信息。
3. **安全存储**: API Token 安全保存在配置中，防止明文暴露。
