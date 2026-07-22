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
.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  padding: 0 16px;
  background: var(--color-background-surface);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
  user-select: none;
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.app-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: var(--color-accent);
  color: var(--color-accent-foreground);
  font-size: 10px;
  font-weight: 600;
}

.filename {
  font-size: 14px;
  color: var(--color-text-primary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.success {
  background: var(--color-success);
}

.status-dot.failure {
  background: var(--color-error);
}
</style>
