---
id: 5-2-responsive-preview-auto-adapter
title: Responsive Preview Auto Layout Adaptation
epic: epic-5
status: ready-for-dev
---

# Story 5.2: Responsive Preview Auto Layout Adaptation

## Story Description
作为用户，当我拖动分割线或调整窗口大小时，预览区域能够根据其容器宽度的变化自动适配字号排版、代码块滚动与图片自适应大小，避免内容溢出或排版变形。

## Acceptance Criteria
1. **容器宽度适配**: 预览区使用 CSS `max-width: 100%` / flex 盒模型，内部图片 `max-width: 100%; height: auto` 保持比例。
2. **代码块与表格横向滚动**: 当预览区容器较窄时，代码块和表格提供 `overflow-x: auto` 自定义滚动条，不穿透破坏外部排版。
3. **Resize Observer 监听**: 使用 `ResizeObserver` 监听预览容器尺寸变化，动态更新 Preview 挂载点防抖重排。
