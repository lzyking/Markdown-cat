# Epic 13 Context: UI 设计 Token 统一与无障碍/安全细节

## Goal

清理项目中残留的硬编码 CSS 颜色，完善主菜单栏 WAI-ARIA 容器语义，并隔离 HTML 导出引发的 Tauri Asset 协议作用域放宽问题 (DW-56, DW-69~DW-72)。

## Stories

- **Story 13.1: CSS 与组件硬编码颜色 Token 化** (`13-1-design-tokens-hardcode-cleanup`)
  - 清理条目：DW-69, DW-70, DW-71
  - 核心要求：将 `preview-export.css` 表格 overlay 颜色统一为 `--color-overlay-*`；将 `SettingsModal.vue` 中的成功色替换为 `--color-success`；替换 `PublishConfluenceModal.vue` 中的硬编码颜色与未定义变量。

- **Story 13.2: 菜单无障碍 Label 与 HTML 导出作用域安全** (`13-2-menu-aria-labels-and-tauri-scope-safety`)
  - 清理条目：DW-56, DW-72
  - 核心要求：为 `MenuBar.vue` 中 `role="menu"` 容器添加 `aria-label`/`aria-labelledby` 绑定；解除 HTML 导出路径对 `save_document_as` 的复用，避免无故放宽 `asset://` 协议作用域。
