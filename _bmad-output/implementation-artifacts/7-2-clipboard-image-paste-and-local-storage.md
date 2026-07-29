---
id: 7-2-clipboard-image-paste-and-local-storage
title: Clipboard Image Paste and Same-Directory Local Storage
epic: epic-7
status: ready-for-dev
---

# Story 7.2: Clipboard Image Paste and Same-Directory Local Storage

## Story Description
作为用户，我可以在编辑器中直接粘贴剪贴板里的截图或图片，软件自动把图片文件保存到当前 Markdown 文件所在的目录中，并在编辑器插入相对路径，使本地图文混排更加直观便捷。

## Acceptance Criteria
1. **粘贴事件拦截**: 在源码编辑器监听 `paste` 事件，识别 `event.clipboardData` 中包含的图片数据（`image/png`, `image/jpeg`）。
2. **本地保存与命名**: 在当前打开的 `.md` 文件同级目录下自动创建图片文件（命名格式如 `img_YYYYMMDD_HHMMSS.png`）。如果当前文档未保存，回退到默认存储目录。
3. **相对路径插入与预览**: 自动在光标位置插入 Markdown 图片语法 `![Image](./img_YYYYMMDD_HHMMSS.png)`，预览区根据相对路径正常渲染图片。
4. **未保存文档兜底处理**: 当当前 Markdown 文档尚未保存到磁盘（无确切父路径）时，粘贴图片自动提示用户先选择保存路径，或暂存至应用默认保存目录的 `assets/` 文件夹下。
