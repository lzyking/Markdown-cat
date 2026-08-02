<script setup lang="ts">
defineProps<{
  message?: string
  status?: 'normal' | 'success' | 'failure'
  themeMessage?: string
  themeStatus?: 'unsaved' | 'success' | 'failure'
  line?: number
  column?: number
}>()
</script>

<template>
  <div class="status-bar" role="status">
    <div class="left" :class="status">
      {{ message || '准备就绪' }}
    </div>
    <div class="right">
      <span v-if="themeMessage" class="theme-feedback" :class="themeStatus">{{ themeMessage }}</span>
      <span v-if="line !== undefined && column !== undefined">行 {{ line }}, 列 {{ column }}</span>
      <span class="doc-type">Markdown</span>
    </div>
  </div>
</template>

<style scoped>
/* 状态栏：窗口底部，固定高度 24px */
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--size-status-bar-height);
  padding: 0 var(--spacing-md);
  background: var(--color-background-elevated);
  border-top: 1px solid var(--color-border-subtle);
  font-size: var(--font-size-status);
  color: var(--color-text-muted);
  user-select: none;
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.left.success {
  color: var(--color-success);
}

.left.failure {
  color: var(--color-error);
}

.theme-feedback.success {
  color: var(--color-success);
}

.theme-feedback.failure {
  color: var(--color-error);
}

.theme-feedback {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 12rem;
}

.doc-type {
  color: var(--color-text-muted);
}
</style>
