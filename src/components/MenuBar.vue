<script setup lang="ts">
function openSettings() {
  // Story 4.1: 接入保存路径对话框
  console.log('设置保存路径…')
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
    <div class="menu-item disabled" role="menuitem" aria-disabled="true">文件</div>
    <div class="menu-item disabled" role="menuitem" aria-disabled="true">编辑</div>
    <div class="menu-item disabled" role="menuitem" aria-disabled="true">视图</div>
    <div class="menu-item disabled" role="menuitem" aria-disabled="true">帮助</div>
  </div>
</template>

<style scoped>
.menu-bar {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border-subtle);
  user-select: none;
}

.menu-item {
  position: relative;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 14px;
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
  min-width: 180px;
  padding: 4px;
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}

.menu-item:focus .menu-dropdown,
.menu-item:hover .menu-dropdown {
  display: block;
}

.menu-row {
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 14px;
  color: var(--color-text-primary);
}

.menu-row:hover {
  background: var(--color-background-surface);
}
</style>
