---
title: Markdown Cat - Advanced Features PRD
status: final
created: 2026-07-29
updated: 2026-07-29
---

# Markdown Cat - Advanced Features Product Requirement Document (PRD)

## 1. Document Overview & Goal
本文档针对 Markdown Cat 软件的一系列高级功能需求（包含双栏可拖动分界线、Antigravity 风格主题切换、Slash 语法拓展、HTML/PDF 导出、Confluence REST API 发布、图片剪贴板粘贴及存储、Windows 隐藏控制台启动等）进行产品需求规范化定义，指导后续架构设计与自动化 Loop 迭代开发。

---

## 2. Requirements Inventory

### Functional Requirements (FR)

- **FR-9 (可拖动分界线与自动适配)**: 主窗口编辑区与预览区之间增加可左右拖动的 Splitter 分界线。拖动时左右两栏按比例实时调整，且预览区根据容器宽度自动适配版面排版、字体缩放与图片显示。
- **FR-10 (File 菜单主题选择)**: 在 File 菜单中增加 "Theme" 子菜单，包含浅色系 (Light) 和暗色系 (Dark) 两个分类，每个分类提供 5 种基于 Antigravity 设计风格的主题颜色。点击选择后立即切换全软件 CSS 主题设计 Token，并持久化存储至用户配置。
- **FR-11 (Slash 命令新增任务列表)**: 在编辑器输入 `/` 触发语法提示弹框中，新增 `- [ ]`（Task List / 任务列表）选项，回车选择后自动在当前行插入任务列表语法。
- **FR-12 (HTML & PDF 离线导出功能)**: 在 File 菜单中增加 Export 功能，支持将当前 Markdown 文档导出为单文件 HTML（包含完整 CSS 样式，本地图片自动转为 Base64 嵌入内联）和 PDF 格式（精确保留样式、表格与图片排版）。
- **FR-13 (Confluence REST API 发布与配置)**: 软件设置中提供 Confluence 配置面板（URL、用户名/邮箱、API Token、Space Key、Parent Page ID 及测试连接功能）。点击“发布到 Confluence”后使用 Python `md2cf` / REST API 方案将 Markdown（含图片、表格、代码块）自动转换并发布至 Confluence 专属 Macro 页面。
- **FR-14 (剪贴板图片粘贴与同目录存储)**: 编辑器支持键盘/右键粘贴剪贴板中的图片，自动将图片保存为当前 `.md` 文件同级目录下的图片文件，并在编辑器中自动插入相对路径 `![Image](./image_timestamp.png)`，预览区同步正常渲染。
- **FR-15 (Windows 无控制台启动模式)**: Windows 平台双击运行软件时，不弹出/不保留 cmd 终端黑窗口，应用独立作为 GUI 桌面进程运行。

### Non-Functional Requirements (NFR)

- **NFR-6 (拖动流畅度)**: 拖动分界线时帧率 $\ge 60\text{ fps}$，预览区重绘延迟 $< 16\text{ ms}$。
- **NFR-7 (导出自包含)**: 导出的 HTML 必须为 100% 单文件自包含，不依赖外部 CSS/JS 或本地图片路径；PDF 导出版面无截断、分页合理。
- **NFR-8 (安全与隐私)**: Confluence API Token 在配置文件中加密存储或安全加密保存，不在日志中明文打印。
- **NFR-9 (兼容性与稳定)**: Windows 下完全隐藏终端窗口，退出主界面即安全结束所有子进程（如 Python/md2cf），无僵尸进程留存。

---

## 3. User Stories & Epics Summary

- **Epic 5: Dual-Pane Resizable Splitter & Dynamic Responsive Layout**
  - Story 5.1: 可拖动 Splitter 分界线组件实现
  - Story 5.2: 预览区响应式自动版面适配

- **Epic 6: Multi-Theme Color System in File Menu**
  - Story 6.1: Antigravity 浅色/暗色 10 种主题设计 Token 定义
  - Story 6.2: File 菜单 Theme 子菜单与实时主题切换持久化

- **Epic 7: Editor Slash Command Task List & Clipboard Image Handling**
  - Story 7.1: Slash (`/`) 语法菜单增加 Task List `- [ ]` 项
  - Story 7.2: 剪贴板图片粘贴、同目录保存与相对路径自动插入渲染

- **Epic 8: Export HTML and PDF with Full Style & Inline Image Embedding**
  - Story 8.1: 单文件自包含 HTML 精确导出（含 Base64 图片嵌入）
  - Story 8.2: 保持样式的 PDF 格式精确导出

- **Epic 9: Confluence Integration via Rest API & md2cf**
  - Story 9.1: Confluence REST API 连接配置对话框
  - Story 9.2: 基于 `md2cf` / REST API 的 Markdown 发布至 Confluence

- **Epic 10: Windows Subsystem GUI No-Console Launcher**
  - Story 10.1: Windows 平台 GUI 子系统无控制台黑窗口配置
