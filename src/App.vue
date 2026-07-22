<script setup lang="ts">
import TitleBar from './components/TitleBar.vue'
import MenuBar from './components/MenuBar.vue'
import StatusBar from './components/StatusBar.vue'
</script>

<template>
  <div class="app">
    <TitleBar />
    <MenuBar />
    <main class="editor-workspace">
      <section class="editor-pane source-pane" aria-label="源码编辑器">
        <!-- Story 2.1: 源码编辑器将替换此占位 -->
        <div class="placeholder">源码编辑器占位</div>
      </section>
      <section class="editor-pane preview-pane" aria-label="实时预览">
        <!-- Story 2.2: 预览区将替换此占位 -->
        <div class="placeholder">预览区占位</div>
      </section>
    </main>
    <StatusBar />
  </div>
</template>

<style scoped>
/* 应用根容器：垂直堆叠标题栏、菜单栏、主编辑区、状态栏 */
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--color-background);
  color: var(--color-text-primary);
}

/* 主编辑区：占据剩余空间，1:1 等宽双栏 */
.editor-workspace {
  display: flex;
  flex: 1;
  min-height: 0;
}

.editor-pane {
  flex: 1 1 50%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 源码编辑区：深色背景，右侧主分隔线 */
.source-pane {
  background: var(--color-background);
  border-right: 1px solid var(--color-border);
}

/* 预览区：次级表面背景 */
.preview-pane {
  background: var(--color-background-surface);
}

/* 占位内容：居中显示，提示后续 Story 替换 */
.placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-body);
}
</style>
