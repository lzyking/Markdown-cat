# Epic 5 Context: v0.2.0 新版本功能增强

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

This epic focuses on enhancing the user experience by enabling automatic recovery of the last opened file upon application launch, standardizing the default save path to `~/Documents/My Markdown`, and improving file management through new menu options for opening and saving files, drag-and-drop functionality, and a quick-insert Markdown syntax menu in the editor.

## Stories

- Story 5.1: 启动自动恢复上次文件 & 默认保存路径升级
- Story 5.2: 重新设计【文件】菜单支持【打开】与【另存为】
- Story 5.3: 外部 Markdown 文件拖拽 (Drag & Drop) 识别与导入
- Story 5.4: 编辑器光标焦点提示与 `/` 快捷插入 Markdown 语法浮窗菜单

## Requirements & Constraints

The application must automatically load the `lastOpenedFile` from configuration and display its content and title on startup. If the file is missing or corrupted, a new blank document should be created with an informative status bar message. The default save path for macOS and Windows should be `~/Documents/My Markdown`, with automatic directory creation if needed. The "File" menu needs "Open File..." and "Save As..." options. Both operations should update the `lastOpenedFile` record and the application's binding to the file path. Users must be able to drag and drop `.md` or `.txt` files into the main window to open them. The editor should display a placeholder hint "按 / 键快速插入 markdown 格式" when empty, and pressing `/` should trigger a slash menu with Markdown syntax options. Selecting an option should insert the template and position the cursor for text input. All file operations must gracefully handle errors by displaying clear status bar messages and preventing data loss.

## Technical Decisions

The `lastOpenedFile` should be stored in the application's configuration. File selection (Open, Save As) should utilize Tauri's dialog capabilities and `fs` permissions, restricted to existing directories and preventing access to protected system locations. The slash menu needs to be implemented as a UI component that integrates with the editor to insert Markdown syntax.

## UX & Interaction Patterns

The "File" menu should include "Open File...", "Save As...", and "Set Default Save Path..." options. The system's native file picker should be used for "Open File" and "Save As". The editor's empty state should display a hint for the slash command. The slash menu should appear at the cursor, be navigable via keyboard (up/down arrow, Enter), and automatically position the cursor after insertion.

## Cross-Story Dependencies

Story 5.1 (automatic file recovery and default path upgrade) will likely depend on the existing configuration reading/writing module implemented in Epic 1 and Epic 4. Story 5.2 (Open/Save As) and Story 5.3 (drag & drop) will rely on the file system access and dialog capabilities established in previous epics (e.g., Epic 1 for `fs` and `dialog` permissions).
