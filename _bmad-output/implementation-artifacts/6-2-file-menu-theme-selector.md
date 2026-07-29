---
id: 6-2-file-menu-theme-selector
title: File Menu Theme Submenu Selector and Config Persistence
epic: epic-6
status: ready-for-dev
---

# Story 6.2: File Menu Theme Submenu Selector and Config Persistence

## Story Description
作为用户，我可以在 File 菜单下的 "Theme" 中清晰地选择浅色或暗色主题，选择后界面主题即刻无缝切换，并且重新打开软件后保持上一次的选择。

## Acceptance Criteria
1. **File 菜单集成了 Theme 子菜单**: 菜单划分 "Light Themes" 和 "Dark Themes" 两个清晰的小节，各自展示 5 种主题名称。
2. **选中标记与实时生效**: 当前激活的主题项左侧显示对勾勾选状态，点击任意主题项立即切换根节点的 CSS `data-theme` 属性。
3. **配置持久化**: 将选中的 `themeId` 写入本地 JSON 配置文件 (`config.json`)，应用重启时自动加载应用该主题。
