<script setup lang="ts">
import { ref, type ComponentPublicInstance } from 'vue'
import { themes } from '../lib/themes'

const props = defineProps<{
  activeThemeId: string
}>()

const emit = defineEmits<{
  (e: 'open-file'): void
  (e: 'save-as-file'): void
  (e: 'export-html'): void
  (e: 'export-pdf'): void
  (e: 'publish-confluence'): void
  (e: 'open-settings'): void
  (e: 'select-theme', themeId: string): void
}>()

const lightThemes = themes.filter((theme) => theme.mode === 'light')
const darkThemes = themes.filter((theme) => theme.mode === 'dark')
// 子菜单展开后键盘焦点的落点：优先取 Light Themes 首项，若为空（如主题配置被清空）则回退到 Dark Themes 首项，
// 保证 Theme 触发器的 keydown 处理始终有一个可聚焦目标。
const firstFocusableThemeId = lightThemes[0]?.id ?? darkThemes[0]?.id
const firstThemeOptionRef = ref<HTMLElement | null>(null)

function useHoverFocusExpanded() {
  const isHovered = ref(false)
  const isFocusWithin = ref(false)
  const isOpen = ref(false)

  function syncIsOpen() {
    isOpen.value = isHovered.value || isFocusWithin.value
  }

  function onMouseEnter() {
    isHovered.value = true
    syncIsOpen()
  }

  function onMouseLeave() {
    isHovered.value = false
    syncIsOpen()
  }

  function onFocusIn() {
    isFocusWithin.value = true
    syncIsOpen()
  }

  function onFocusOut(event: FocusEvent) {
    const currentTarget = event.currentTarget as HTMLElement | null
    const relatedTarget = event.relatedTarget as Node | null

    if (relatedTarget && currentTarget?.contains(relatedTarget)) {
      return
    }

    // Some WebKit builds (relevant to this Tauri app's macOS webview) report
    // `relatedTarget` as null even though focus actually moved to a sibling
    // element still inside the container. Fall back to `document.activeElement`
    // (already updated by the time `focusout` fires) before deciding focus
    // truly left the container.
    if (!relatedTarget && currentTarget?.contains(document.activeElement)) {
      return
    }

    isFocusWithin.value = false
    syncIsOpen()
  }

  return {
    isOpen,
    onMouseEnter,
    onMouseLeave,
    onFocusIn,
    onFocusOut,
  }
}

const markdownCatMenuExpanded = useHoverFocusExpanded()
const fileMenuExpanded = useHoverFocusExpanded()
const themeSubmenuExpanded = useHoverFocusExpanded()

function resolveFocusableElement(el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) {
    return el
  }

  if (el && '$el' in el && el.$el instanceof HTMLElement) {
    return el.$el
  }

  return null
}

function setFirstThemeOptionRef(el: Element | ComponentPublicInstance | null, themeId: string) {
  if (themeId === firstFocusableThemeId) {
    firstThemeOptionRef.value = resolveFocusableElement(el)
  }
}

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

function publishConfluence() {
  emit('publish-confluence')
}

function openSettings() {
  emit('open-settings')
}

function selectTheme(themeId: string) {
  emit('select-theme', themeId)
}

function onMenuRowKeydown(e: KeyboardEvent, action: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    action()
    return
  }

  if (e.key === 'Escape') {
    ;(e.currentTarget as HTMLElement).blur()
  }
}

function focusFirstThemeOption() {
  firstThemeOptionRef.value?.focus()
}

function onSubmenuTriggerKeydown(e: KeyboardEvent) {
  if (e.target !== e.currentTarget) {
    return
  }

  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
    e.preventDefault()
    focusFirstThemeOption()
    return
  }

  if (e.key === 'Escape') {
    ;(e.currentTarget as HTMLElement).blur()
  }
}
</script>

<template>
  <div class="menu-bar" role="menubar">
    <div
      class="menu-item"
      tabindex="0"
      role="menuitem"
      aria-haspopup="true"
      :aria-expanded="markdownCatMenuExpanded.isOpen.value"
      @mouseenter="markdownCatMenuExpanded.onMouseEnter"
      @mouseleave="markdownCatMenuExpanded.onMouseLeave"
      @focusin="markdownCatMenuExpanded.onFocusIn"
      @focusout="markdownCatMenuExpanded.onFocusOut"
    >
      Markdown Cat
      <div class="menu-dropdown" role="menu">
        <div
          class="menu-row"
          tabindex="0"
          role="menuitem"
          @click="openSettings"
          @keydown="onMenuRowKeydown($event, openSettings)"
        >
          设置保存路径…
        </div>
      </div>
    </div>
    <div
      class="menu-item"
      tabindex="0"
      role="menuitem"
      aria-haspopup="true"
      :aria-expanded="fileMenuExpanded.isOpen.value"
      @mouseenter="fileMenuExpanded.onMouseEnter"
      @mouseleave="fileMenuExpanded.onMouseLeave"
      @focusin="fileMenuExpanded.onFocusIn"
      @focusout="fileMenuExpanded.onFocusOut"
    >
      文件
      <div class="menu-dropdown" role="menu">
        <div class="menu-row" tabindex="0" role="menuitem" @click="openFile" @keydown="onMenuRowKeydown($event, openFile)">
          打开文件 (Open)…
        </div>
        <div
          class="menu-row"
          tabindex="0"
          role="menuitem"
          @click="saveAsFile"
          @keydown="onMenuRowKeydown($event, saveAsFile)"
        >
          另存为 (Save As)…
        </div>
        <div
          class="menu-row"
          tabindex="0"
          role="menuitem"
          @click="exportHtml"
          @keydown="onMenuRowKeydown($event, exportHtml)"
        >
          导出为 HTML (Export as HTML)…
        </div>
        <div
          class="menu-row"
          tabindex="0"
          role="menuitem"
          @click="exportPdf"
          @keydown="onMenuRowKeydown($event, exportPdf)"
        >
          导出为 PDF (Export as PDF)…
        </div>
        <div
          class="menu-row"
          tabindex="0"
          role="menuitem"
          @click="publishConfluence"
          @keydown="onMenuRowKeydown($event, publishConfluence)"
        >
          发布到 Confluence…
        </div>
        <div class="menu-divider"></div>
        <div
          class="menu-row submenu-trigger"
          tabindex="0"
          role="menuitem"
          aria-haspopup="true"
          :aria-expanded="themeSubmenuExpanded.isOpen.value"
          @mouseenter="themeSubmenuExpanded.onMouseEnter"
          @mouseleave="themeSubmenuExpanded.onMouseLeave"
          @focusin="themeSubmenuExpanded.onFocusIn"
          @focusout="themeSubmenuExpanded.onFocusOut"
          @keydown="onSubmenuTriggerKeydown"
        >
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
                :ref="(el) => setFirstThemeOptionRef(el, theme.id)"
                @click.stop="selectTheme(theme.id)"
                @keydown.esc="($event.currentTarget as HTMLElement)?.blur()"
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
                @keydown.esc="($event.currentTarget as HTMLElement)?.blur()"
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
        <div
          class="menu-row"
          tabindex="0"
          role="menuitem"
          @click="openSettings"
          @keydown="onMenuRowKeydown($event, openSettings)"
        >
          设置默认保存路径…
        </div>
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

.menu-item:focus-within .menu-dropdown,
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

.menu-row:focus-visible,
.submenu-trigger:focus-visible,
.theme-option:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
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
