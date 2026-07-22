# Markdown Cat

基于 Tauri 2.x + Vue 3 的轻量 Markdown 编辑器。

## 环境要求

- Node.js >= 20 (LTS)
- Rust >= 1.80
- macOS (MVP 仅支持 macOS)

## 快速开始

```bash
# 安装前端依赖
npm install

# 安装 Tauri Rust 依赖（首次）
cd src-tauri && cargo fetch && cd ..

# 开发模式运行
npm run tauri:dev
```

## 项目结构

```text
src/           # Vue 3 前端
src-tauri/     # Tauri 2.x Rust 后端
```

## 构建

```bash
npm run tauri:build
```

构建产物位于 `src-tauri/target/release/bundle/`。

## 权限说明

- `fs`：仅允许访问应用目录与用户选择的保存目录。
- `dialog`：仅用于打开文件夹选择器。

## 最小权限集说明

Tauri 2.x 默认在 `src-tauri/capabilities/` 中定义权限。
本应用仅声明两个能力文件：

- `default.json`：主窗口最小权限（窗口聚焦、主题事件等）。
- `filesystem.json`：文件系统与对话框权限，且 `fs:scope` 严格限定于应用目录与用户选择的保存目录。

禁止在前端直接写盘；所有文件操作通过后端命令执行。

## Gatekeeper 测试

在未签名的受控 Mac 上，首次运行 `.app` 包时可能需要右键「打开」绕过 Gatekeeper。
若无法绕过，请在 README/下载页提供说明，并记录为 PRD OQ-2 的 Fallback Decision。
