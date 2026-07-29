---
id: 7-1-slash-command-task-list
title: Add Task List Option to Slash Command Popup
epic: epic-7
status: ready-for-dev
---

# Story 7.1: Add Task List Option to Slash Command Popup

## Story Description
作为用户，当我输入 `/` 触发语法提示菜单时，能够快捷选择 `- [ ]` 任务列表指令，提高 Markdown 待办事项的书写效率。

## Acceptance Criteria
1. **Slash 菜单项扩充**: 在 `/` 快捷弹出框列表中新增选项：`- [ ] Task List (任务列表)`。
2. **快捷插入**: 选中该项（点击或键盘方向键 + Enter）后，在编辑器光标当前行首自动插入 `- [ ] ` 文本，并将光标移动到复选框后面。
3. **渲染支持**: 预览区渲染出可互动的 Checkbox 待办列表元素。
