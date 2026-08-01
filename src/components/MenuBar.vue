<script setup lang="ts">
import { themes } from '../lib/themes'

const props = defineProps<{
  activeThemeId: string
}>()

const emit = defineEmits<{
  (e: 'open-file'): void
  (e: 'save-as-file'): void
  (e: 'export-html'): void
  (e: 'export-pdf'): void
  (e: 'open-settings'): void
  (e: 'select-theme', themeId: string): void
}>()

const lightThemes = themes.filter((theme) => theme.mode === 'light')
const darkThemes = themes.filter((theme) => theme.mode === 'dark')

function openFile() {
  emit('open-file')
}

function saveAsFile() {
  emit('save-as-file')
}

function exportHtml() {
  emit('export-html')
}

function exportPdf() {
  emit('export-pdf')
}

function openSettings() {
  emit('open-settings')
}

function selectTheme(themeId: string) {
  emit('select-theme', themeId)
}
</script>

<template>
  <div class="menu-bar" role="menubar">
    <div class="menu-item" tabindex="0" role="menuitem" aria-haspopup="true">
      Markdown Cat
      <div class="menu-dropdown">
        <div class="menu-row" role="menuitem" @click="openSettings">设置保存路径…</div>
      </div>
    </div>
    <div class="menu-item" tabindex="0" role="menuitem" aria-haspopup="true">
      文件
      <div class="menu-dropdown">
        <div class="menu-row" role="menuitem" @click="openFile">打开文件 (Open)…</div>
        <div class="menu-row" role="menuitem" @click="saveAsFile">另存为 (Save As)…</div>
        <div class="menu-row" role="menuitem" @click="exportHtml">导出为 HTML (Export as HTML)…</div>
        <div class="menu-row" role="menuitem" @click="exportPdf">导出为 PDF (Export as PDF)…</div>
        <div class="menu-divider"></div>
        <div class="menu-row submenu-trigger" role="menuitem" aria-haspopup="true">
          <span>Theme</span>
          <span class="submenu-arrow" aria-hidden="true">›</span>
          <div class="submenu-dropdown" role="menu">
            <div class="theme-section">
              <div class="menu-section-label">Light Themes</div>
              <button
                v-for="theme in lightThemes"
                :key="theme.id"
                type="button"
                class="theme-option"
                role="menuitemradio"
                :aria-checked="props.activeThemeId === theme.id"
                @click.stop="selectTheme(theme.id)"
              >
                <span class="menu-check" aria-hidden="true">
                  {{ props.activeThemeId === theme.id ? '✓' : '' }}
                </span>
                <span>{{ theme.name }}</span>
              </button>
            </div>
            <div class="menu-divider"></div>
            <div class="theme-section">
              <div class="menu-section-label">Dark Themes</div>
              <button
                v-for="theme in darkThemes"
                :key="theme.id"
                type="button"
                class="theme-option"
                role="menuitemradio"
                :aria-checked="props.activeThemeId === theme.id"
                @click.stop="selectTheme(theme.id)"
              >
                <span class="menu-check" aria-hidden="true">
                  {{ props.activeThemeId === theme.id ? '✓' : '' }}
                </span>
                <span>{{ theme.name }}</span>
              </button>
            </div>
          </div>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-row" role="menuitem" @click="openSettings">设置默认保存路径…</div>
      </div>
    </div>
    <div class="menu-item disabled" role="menuitem" aria-disabled="true">编辑</div>
    <div class="menu-item disabled" role="menuitem" aria-disabled="true">视图</div>
    <div class="menu-item disabled" role="menuitem" aria-disabled="true">帮助</div>
  </div>
</template>

<style scoped>
/* 菜单栏：标题栏下方，固定高度 28px */
.menu-bar {
  display: flex;
  align-items: center;
  height: var(--size-menu-bar-height);
  padding: 0 var(--spacing-sm);
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border-subtle);
  user-select: none;
}

.menu-item {
  position: relative;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--rounded-sm);
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  cursor: pointer;
}

.menu-item:hover:not(.disabled) {
  background: var(--color-background-elevated);
}

.menu-item.disabled {
  color: var(--color-text-disabled);
  cursor: default;
}

.menu-dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  min-width: calc(var(--spacing-lg) * 10);
  padding: var(--spacing-xs);
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--rounded-md);
  box-shadow: var(--shadow-dialog);
}

.menu-item:focus .menu-dropdown,
.menu-item:hover .menu-dropdown {
  display: block;
}

.menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--rounded-sm);
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
}

.menu-row:hover {
  background: var(--color-background-surface);
}

.menu-divider {
  height: 1px;
  background: var(--color-border-subtle, #3a3f4b);
  margin: var(--spacing-xs) 0;
}

.submenu-trigger {
  position: relative;
  gap: var(--spacing-md);
}

.submenu-arrow {
  color: var(--color-text-muted);
}

.submenu-dropdown {
  display: none;
  position: absolute;
  top: calc(var(--spacing-xs) * -1);
  left: calc(100% - var(--spacing-xs));
  min-width: 220px;
  padding: var(--spacing-xs);
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--rounded-md);
  box-shadow: var(--shadow-dialog);
}

.submenu-trigger:hover .submenu-dropdown,
.submenu-trigger:focus-within .submenu-dropdown {
  display: block;
}

.theme-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-section-label {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-label);
  color: var(--color-text-muted);
}

.theme-option {
  display: flex;
  align-items: center;
  width: 100%;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 0;
  border-radius: var(--rounded-sm);
  background: transparent;
  color: var(--color-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.theme-option:hover {
  background: var(--color-background-surface);
}

.menu-check {
  display: inline-flex;
  width: 16px;
  margin-right: var(--spacing-sm);
  color: var(--color-accent);
  justify-content: center;
}
</style>
