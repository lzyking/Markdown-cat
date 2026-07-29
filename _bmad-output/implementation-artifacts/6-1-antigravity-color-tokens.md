---
id: 6-1-antigravity-color-tokens
title: Antigravity Inspired Light and Dark Theme Color Tokens
epic: epic-6
status: ready-for-dev
---

# Story 6.1: Antigravity Inspired Light and Dark Theme Color Tokens

## Story Description
作为用户，我希望软件支持丰富的主题配色，包含 5 款浅色系主题和 5 款暗色系主题（参考 Antigravity IDE 调色板），满足不同光照环境下的视觉偏好。

## Acceptance Criteria
1. **10 种主题 Token 定义**: 在全局 CSS/Design Tokens 中定义 5 款浅色主题（如 `Paper Light`, `Cream Warm`, `Ice Cool`, `Sand Sandstone`, `Nord Light`）和 5 款暗色主题（如 `Cyberpunk Dark`, `Obsidian Black`, `Deep Void`, `Midnight Slate`, `Solarized Dark`）。
2. **完整 CSS 变量覆盖**: 每种主题包含背景色 (`--bg-primary`, `--bg-surface`), 边框色 (`--border-color`), 文本色 (`--text-primary`, `--text-secondary`), 高亮强调色 (`--accent-color`), 代码块背景色 (`--code-bg`)。
3. **数据驱动**: 主题列表可通过 JSON 配置读取注册，方便后续灵活扩充。
