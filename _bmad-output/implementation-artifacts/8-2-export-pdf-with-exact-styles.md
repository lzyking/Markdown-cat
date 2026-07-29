---
id: 8-2-export-pdf-with-exact-styles
title: Export High-Quality PDF Preserving Exact Preview Styles
epic: epic-8
status: ready-for-dev
---

# Story 8.2: Export High-Quality PDF Preserving Exact Preview Styles

## Story Description
作为用户，我可以通过 File > Export > Export as PDF... 将当前 Markdown 完美打印/导出为 PDF 文档，完全保留预览区的字体、颜色、代码块与图片排版布局。

## Acceptance Criteria
1. **PDF 导出菜单与对话框**: File > Export 菜单添加 "Export as PDF..." 选项。
2. **样式一致性与无截断**: 利用 WebView 打印引擎或 HTML-to-PDF 渲染库生成 PDF，确保页面边距、分页符（Page Break）、表格和代码块不被异常裁切截断。
3. **导出提示与反馈**: 生成过程提示进度，成功后在状态栏/弹窗提示保存绝对路径。
