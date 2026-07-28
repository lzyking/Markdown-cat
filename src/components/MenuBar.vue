<script setup lang="ts">
const emit = defineEmits<{
  (e: 'open-file'): void
  (e: 'save-as-file'): void
  (e: 'open-settings'): void
}>()

function openFile() {
  emit('open-file')
}

function saveAsFile() {
  emit('save-as-file')
}

function openSettings() {
  emit('open-settings')
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
</style>
