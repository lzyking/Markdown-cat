<script setup lang="ts">
import TitleBar from './components/TitleBar.vue'
import MenuBar from './components/MenuBar.vue'
import StatusBar from './components/StatusBar.vue'
</script>

<template>
  <div class="app">
    <TitleBar />
    <MenuBar />
    <div class="workspace">
      <div class="pane source-pane">
        <!-- Story 2.1: 源码编辑器将替换此占位 -->
        <div class="placeholder">源码编辑器占位</div>
      </div>
      <div class="pane preview-pane">
        <!-- Story 2.2: 预览区将替换此占位 -->
        <div class="placeholder">预览区占位</div>
      </div>
    </div>
    <StatusBar />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--color-background);
  color: var(--color-text-primary);
}

.workspace {
  display: flex;
  flex: 1;
  min-height: 0;
}

.pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.source-pane {
  background: var(--color-background);
  border-right: 1px solid var(--color-border);
}

.preview-pane {
  background: var(--color-background-surface);
}

.placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 14px;
}
</style>
