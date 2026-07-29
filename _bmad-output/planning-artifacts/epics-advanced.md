---
stepsCompleted:
  - step-01-requirements-extraction
  - step-02-design-epics
inputDocuments:
  - /_bmad-output/planning-artifacts/prds/prd-advanced-features/prd.md
---

# Markdown Cat - Advanced Features Epics & Stories Breakdown

本文档将高级功能 PRD 拆解为标准的 Epic 和 User Story，用于指导开发和 `bmad-loop` 的自动化迭代。

---

## Requirements Inventory

### Functional Requirements
- **FR-9**: 左右双栏可拖动分界线及预览自适应
- **FR-10**: File 菜单 Theme 浅色/暗色系（各5种）主题切换及持久化
- **FR-11**: `/` Slash 命令加入 `- [ ]` Task List
- **FR-12**: HTML（Base64内联图片单文件）与 PDF 保留样式导出
- **FR-13**: Confluence REST API 配置面板与 `md2cf` 自动转换发布
- **FR-14**: 剪贴板图片粘贴、当前目录自动保存与相对路径引用
- **FR-15**: Windows 平台隐藏控制台终端窗口启动

---

## Epics & Stories List

### Epic 5: Dual-Pane Resizable Splitter & Dynamic Responsive Layout (分界线拖动与自适应)
- **Story 5.1 (`5-1-resizable-splitter-component`)**: 左右双栏 Splitter 拖动组件
  - **Goal**: 在编辑栏与预览栏之间实现支持鼠标拖动的分割条，限制左右最小宽度（如 200px），支持双击重置为 50/50。
- **Story 5.2 (`5-2-responsive-preview-auto-adapter`)**: 预览区响应式自适应布局
  - **Goal**: 当分割条拖动或窗口缩放时，预览区文字排版、代码块、图片等自动按新容器宽度重新计算适配展示。

### Epic 6: Multi-Theme Color System in File Menu (File 菜单主题选择)
- **Story 6.1 (`6-1-antigravity-color-tokens`)**: Antigravity 风格双色系 10 种主题 Token
  - **Goal**: 定义 5 款 Light 主题（如 Paper Light, Sand Warm, Ice Cool, Nord Light, Cream Classic）与 5 款 Dark 主题（如 Cyberpunk Dark, Obsidian, Deep Void, Midnight Slate, Solarized Dark）的 CSS 变量。
- **Story 6.2 (`6-2-file-menu-theme-selector`)**: File 菜单 Theme 子菜单及切换控制
  - **Goal**: File 菜单中增加 Theme 子菜单，分列 Light/Dark，选中的主题显示勾选状态，修改后全局动态生效并写入本地用户配置 JSON。

### Epic 7: Editor Slash Command Task List & Clipboard Image Handling (Slash命令与图片粘贴)
- **Story 7.1 (`7-1-slash-command-task-list`)**: Slash 语法提示新增 Task List (`- [ ]`)
  - **Goal**: 在 `/` 快捷弹出菜单中加入 `- [ ] Task List` 选项，按 Enter 键插入到当前行起始位置。
- **Story 7.2 (`7-2-clipboard-image-paste-and-local-storage`)**: 剪贴板图片粘贴与同目录存储
  - **Goal**: 监听编辑器 `paste` 事件，当包含图片数据时自动生成带时间戳的文件名写入当前 `.md` 文件的同一目录，并在光标处插入 `![Image](./image_timestamp.png)`，预览区同步加载显示。

### Epic 8: Export HTML and PDF with Full Style & Inline Image Embedding (HTML/PDF 精确导出)
- **Story 8.1 (`8-1-export-self-contained-html`)**: 离线单文件 HTML 导出
  - **Goal**: File > Export > HTML 功能，抓取当前预览 DOM 与完整 CSS 样式，自动扫描相对图片路径转换为 Base64 `data:image/...` 嵌在 HTML 中导出。
- **Story 8.2 (`8-2-export-pdf-with-exact-styles`)**: 样式精确保留的 PDF 导出
  - **Goal**: File > Export > PDF 功能，使用 WebView 打印/Tauri PDF API 将预览区域导出为高清晰度、无排版截断的 PDF 文件。

### Epic 9: Confluence Integration via Rest API & md2cf (Confluence 发布)
- **Story 9.1 (`9-1-confluence-config-setting-dialog`)**: Confluence REST API 设置面板
  - **Goal**: 增加设置弹窗选项，配置 Confluence Base URL、Username、API Token、Space Key、Parent Page ID 并提供“测试连接”功能。
- **Story 9.2 (`9-2-confluence-md2cf-publisher`)**: 基于 `md2cf` / REST API 的一键发布功能
  - **Goal**: 提供菜单/按钮“发布至 Confluence”，在 Rust 后端或 Python 子进程中调用 `md2cf`，自动将 Markdown 及其引用的本地图片/代码块/表格转为 Confluence Macro 并发布。

### Epic 10: Windows Subsystem GUI No-Console Launcher (Windows 无控制台启动)
- **Story 10.1 (`10-1-windows-noconsole-gui-attribute`)**: Windows GUI `windows_subsystem` 配置
  - **Goal**: 在 `src-tauri/src/main.rs` 及构建配置中完善 `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`，确保 Windows 上双击运行不再弹出 cmd 终端黑框。
