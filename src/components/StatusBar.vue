<script setup lang="ts">
defineProps<{
  message?: string
  status?: 'normal' | 'success' | 'failure'
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
      <span v-if="line !== undefined && column !== undefined">行 {{ line }}, 列 {{ column }}</span>
      <span class="doc-type">Markdown</span>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 24px;
  padding: 0 12px;
  background: var(--color-background-elevated);
  border-top: 1px solid var(--color-border-subtle);
  font-size: 12px;
  color: var(--color-text-muted);
  user-select: none;
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.left.success {
  color: var(--color-success);
}

.left.failure {
  color: var(--color-error);
}

.doc-type {
  color: var(--color-text-muted);
}
</style>
