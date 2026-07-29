---
id: 8-1-export-self-contained-html
title: Export Self-Contained HTML with Embedded Base64 Images
epic: epic-8
status: ready-for-dev
---

# Story 8.1: Export Self-Contained HTML with Embedded Base64 Images

## Story Description
作为用户，我可以通过 File > Export 将 Markdown 导出为单文件 HTML 格式。生成的 HTML 包含完整的 CSS 预览样式，并且 Markdown 引用的本地图片完全转换为 Base64 嵌入 HTML 内部，方便脱机或通过邮件分享。

## Acceptance Criteria
1. **菜单导出项**: 在 File > Export 菜单中添加 "Export as HTML..."，触发系统保存对话框。
2. **样式提取内嵌**: 将当前软件预览区应用的 CSS 样式（包括排版、代码高亮、表格、主题颜色）内联写入导出 HTML 的 `<style>` 标签中。
3. **本地图片 Base64 嵌入**: 扫描 HTML 中的图片 `<img>` 标签及 Markdown 本地相对/绝对图片路径，将图片读取并转为 `data:image/png;base64,...` 数据 URI 填入 `src`，确保导出的单文件 `.html` 不依赖任何外部文件资源。
4. **异步转换与超大图片容错**: Base64 图片提取及转换过程放在后台异步线程执行，在界面上弹出可取消的导出进度条；对超过 10MB 的超大图片给出防卡死提示。
5. **远程网络图片超时容错**: 遇到 `http(s)://` 远程图片时设置 3 秒 Fetch 超时，失败自动回退保持原网络 URL，不阻断整页 HTML 导出。
