# Deferred Work

## DW-1: index.html 引用不存在的 /vite.svg 导致 404

origin: code review of 1-1-init-tauri-2-x-project.md, 2026-07-22
location: index.html:5
severity: low
reason: 移除或替换不存在的 favicon 资源，避免启动时 404 噪声。属于 polish 项，不影响功能，可延后处理。
status: open

## DW-2: ping 命令使用 async 但无 await，可改为同步函数

origin: code review of 1-1-init-tauri-2-x-project.md, 2026-07-22
location: src-tauri/src/commands/mod.rs:32
severity: low
reason: ping 命令无异步操作，改为同步函数可减少不必要的运行时开销。属于代码质量优化，不影响当前运行，可延后处理。
status: open

## DW-3: thiserror 依赖已引入但当前未使用

origin: code review of 1-1-init-tauri-2-x-project.md, 2026-07-22
location: src-tauri/Cargo.toml:28
severity: low
reason: thiserror 计划用于后续 Story 的错误处理，当前未使用。为避免误删后重复添加，保持现状，延后到实现错误处理层时统一使用或移除。
status: open

## DW-4: Cargo.toml 中 authors 字段已弃用

origin: code review of 1-1-init-tauri-2-x-project.md, 2026-07-22
location: src-tauri/Cargo.toml:5
severity: low
reason: Cargo 的 `authors` 字段已标记为弃用，应移除或改用 `package.authors` 以外的元数据方式。属于维护性清理，不影响构建与运行，可延后处理。
status: open
