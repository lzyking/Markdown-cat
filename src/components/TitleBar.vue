<script setup lang="ts">
defineProps<{
  filename?: string
  saveStatus?: 'unsaved' | 'success' | 'failure'
}>()
</script>

<template>
  <div class="title-bar">
    <div class="left">
      <div class="app-icon">M</div>
      <span class="filename">{{ filename || 'New_*.md' }}</span>
    </div>
    <div class="right">
      <span
        v-if="saveStatus === 'success'"
        class="status-dot success"
        title="保存成功"
      />
      <span
        v-else-if="saveStatus === 'failure'"
        class="status-dot failure"
        title="保存失败"
      />
    </div>
  </div>
</template>

<style scoped>
/* 标题栏：窗口顶部，支持拖拽，固定高度 38px */
.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--size-title-bar-height);
  padding: 0 var(--spacing-lg);
  background: var(--color-background-surface);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
  user-select: none;
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.app-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--rounded-sm);
  background: var(--color-accent);
  color: var(--color-accent-foreground);
  font-size: var(--font-size-icon);
  font-weight: var(--font-weight-semibold);
}

.filename {
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
}

.status-dot {
  width: var(--spacing-sm);
  height: var(--spacing-sm);
  border-radius: var(--rounded-full);
}

.status-dot.success {
  background: var(--color-success);
}

.status-dot.failure {
  background: var(--color-error);
}
</style>
