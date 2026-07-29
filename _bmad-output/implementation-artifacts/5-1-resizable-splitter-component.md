---
id: 5-1-resizable-splitter-component
title: Resizable Splitter Component between Editor and Preview
epic: epic-5
status: in-progress
baseline_revision: 1671f72d725ec6d44066b4ea36869751cf1a3a04
---

# Story 5.1: Resizable Splitter Component between Editor and Preview

## Story Description
作为用户，我希望能够按住编辑栏与预览栏之间的分割线左右拖动，以灵活调整代码编辑器与预览区域的宽窄占比，提升在不同屏宽下的书写与阅读体验。

## Acceptance Criteria
1. **拖动交互**: 在左侧源码编辑栏和右侧预览栏之间增加可拖动的 Splitter 元素，鼠标悬停时光标变为 `col-resize`。
2. **最小与最大范围限制**: 拖动时左右两栏均限制最小宽度（例如 200px），避免某一边被完全压死消失。
3. **双击重置**: 双击 Splitter 时自动重置两栏宽度为平分的 50% / 50% 布局。
4. **流畅反馈**: 拖动过程中使用 `requestAnimationFrame` 或原生事件调优，保证拖拽流畅无卡顿、掉帧。
5. **全局拖拽绑定与硬性边界约束**: 拖拽事件在全局 `window` 监听（防止鼠标划出分界线或移出窗口时状态挂起）；通过 `Math.max(200, Math.min(newWidth, containerWidth - 200))` 强制约束双栏最小宽度不低于 200px。
