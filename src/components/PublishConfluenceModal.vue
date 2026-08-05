<script setup lang="ts">
import type { ConfluencePublishProgress } from '../lib/types'

const props = defineProps<{
  isOpen: boolean
  isRunning: boolean
  steps: ConfluencePublishProgress[]
  successMessage: string
  errorMessage: string
  pageUrl: string
  warnings: string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-page'): void
  (e: 'open-settings'): void
}>()

function stepStatusText(status: ConfluencePublishProgress['status']) {
  if (status === 'done') return '完成'
  if (status === 'error') return '异常'
  return '进行中'
}

function stepStatusIcon(status: ConfluencePublishProgress['status']) {
  if (status === 'done') return '✓'
  if (status === 'error') return '!'
  return '…'
}
</script>

<template>
  <div v-if="props.isOpen" class="modal-backdrop" @click.self="emit('close')">
    <div
      class="modal-container publish-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-confluence-modal-title"
    >
      <div class="modal-header">
        <h3 id="publish-confluence-modal-title" class="modal-title">发布到 Confluence</h3>
        <button class="close-btn" aria-label="关闭对话框" @click="emit('close')">×</button>
      </div>

      <div class="modal-body publish-body">
        <p class="modal-description">
          {{ props.isRunning ? '正在后台执行 Confluence 发布，请稍候…' : 'Confluence 发布流程已完成。' }}
        </p>

        <div class="step-list" aria-label="Confluence 发布进度">
          <div
            v-for="step in props.steps"
            :key="step.step"
            class="step-item"
            :class="`status-${step.status}`"
          >
            <div class="step-header">
              <span class="step-icon" aria-hidden="true">{{ stepStatusIcon(step.status) }}</span>
              <span class="step-name">{{ step.step }}</span>
              <span class="step-status-text">{{ stepStatusText(step.status) }}</span>
            </div>
            <div class="step-message">{{ step.message }}</div>
          </div>
        </div>

        <p v-if="props.successMessage" class="success-text">{{ props.successMessage }}</p>
        <p v-if="props.errorMessage" class="error-text" role="alert">{{ props.errorMessage }}</p>

        <div v-if="props.warnings.length > 0" class="warning-panel">
          <div class="warning-title">警告（{{ props.warnings.length }}）</div>
          <div
            v-for="warning in props.warnings"
            :key="warning"
            class="warning-item"
          >
            {{ warning }}
          </div>
        </div>

        <button
          v-if="props.pageUrl"
          type="button"
          class="link-button"
          @click="emit('open-page')"
        >
          打开页面
        </button>
        <p v-if="props.pageUrl" class="page-url">{{ props.pageUrl }}</p>
      </div>

      <div class="modal-footer">
        <button
          v-if="props.errorMessage"
          type="button"
          class="btn btn-secondary"
          @click="emit('open-settings')"
        >
          前往 Confluence 设置
        </button>
        <button type="button" class="btn btn-primary confirm-btn" @click="emit('close')">
          {{ props.isRunning ? '隐藏' : '关闭' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal-container {
  width: min(720px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--rounded-lg);
  box-shadow: var(--shadow-dialog);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.publish-modal {
  width: min(640px, calc(100vw - 48px));
}

.modal-header,
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border-subtle);
}

.modal-footer {
  border-bottom: 0;
  border-top: 1px solid var(--color-border-subtle);
  justify-content: flex-end;
  gap: var(--spacing-sm);
}

.modal-title {
  margin: 0;
  font-size: var(--font-size-heading);
  font-weight: var(--font-weight-semibold);
}

.close-btn {
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 20px;
  cursor: pointer;
}

.modal-body {
  padding: var(--spacing-lg);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.modal-description,
.page-url {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
}

.step-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.step-item {
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--rounded-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-background-surface);
}

.step-item.status-done {
  border-color: rgba(74, 166, 120, 0.45);
}

.step-item.status-error {
  border-color: rgba(210, 90, 90, 0.5);
}

.step-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-xs);
}

.step-icon {
  width: 18px;
  text-align: center;
  font-weight: var(--font-weight-semibold);
}

.step-name {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.step-status-text,
.step-message {
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
}

.step-status-text {
  margin-left: auto;
}

.step-message {
  white-space: pre-line;
}

.warning-panel {
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--rounded-md);
  background: rgba(210, 153, 34, 0.12);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.warning-title {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.warning-item {
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
}

.link-button,
.btn {
  border: 1px solid var(--color-border);
  border-radius: var(--rounded-md);
  background: var(--color-background-surface);
  color: var(--color-text-primary);
  font: inherit;
  padding: var(--spacing-xs) var(--spacing-md);
  cursor: pointer;
}

.link-button:hover,
.btn:hover {
  background: var(--color-background);
}

.confirm-btn {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-foreground);
}

.success-text {
  color: var(--color-success, #3ba55d);
  margin: 0;
}

.error-text {
  color: var(--color-error);
  margin: 0;
}
</style>
