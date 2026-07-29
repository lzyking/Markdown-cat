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
4. **自签名 SSL 支持与工具校验**: 设置界面提供“允许自签名证书 (Ignore SSL Verification)”开关；测试连接时自动检测系统 `md2cf` 依赖状态或提供 REST API 直连模式选项。
5. **输入正则前端校验**: 对 Space Key（字母数字下划线）与 Parent Page ID（纯数字字符串）进行即时正则表达式格式校验与失焦提示。
