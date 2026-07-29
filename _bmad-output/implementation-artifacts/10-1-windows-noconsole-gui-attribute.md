---
id: 10-1-windows-noconsole-gui-attribute
title: Windows Subsystem GUI No-Console Launcher Attribute Configuration
epic: epic-10
status: ready-for-dev
---

# Story 10.1: Windows Subsystem GUI No-Console Launcher Attribute Configuration

## Story Description
作为 Windows 用户，当我双击打开 Markdown Cat 软件时，期望应用直接打开 GUI 界面，而不弹出或保留额外的命令提示符黑窗口（cmd / terminal window），改善使用体验。

## Acceptance Criteria
1. **Rust Main 属性定义**: 在 `src-tauri/src/main.rs` 顶部声明 `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`。
2. **Tauri Windows 打包支持**: 检查并更新 `src-tauri/Cargo.toml` 与 `tauri.conf.json` 中的 Windows bundle 属性。
3. **独立无控制台运行**: 在 Windows 生产版本（Release Build）下双击可执行文件或快捷方式启动时，不出现控制台黑框；关闭软件主窗口时程序安全退出。
4. **崩溃日志文件记录 (App Log)**: 配置底层日志 logger（如将 panic 堆栈与未捕获异常写入应用数据目录下的 `logs/app.log`），确保在隐藏终端控制台的情况下，软件若发生异常崩溃仍能留存详细日志。
5. **Debug/Release 模式条件隔离**: 使用 `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` 确保仅生产发布版 (Release) 隐藏黑窗口，Debug 模式下保留控制台方便调试日志查看。
