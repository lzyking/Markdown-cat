<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import type { CmdResult } from '../lib/types'

const props = defineProps<{
  isOpen: boolean
  currentPath: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update-path', newPath: string): void
}>()

const selectedPath = ref('')
const errorMessage = ref('')

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      selectedPath.value = ''
      errorMessage.value = ''
      window.addEventListener('keydown', onKeydown)
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
  { immediate: true }
)

function onKeydown(e: KeyboardEvent) {
  if (props.isOpen && e.key === 'Escape') {
    onClose()
  }
}

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

function onClose() {
  selectedPath.value = ''
  errorMessage.value = ''
  emit('close')
}

async function onSelect() {
  errorMessage.value = ''
  try {
    let folderPath: string | null = null

    if ((window as any).__TAURI_MOCK__) {
      const res = await invoke<CmdResult<string>>('select_save_dir')
      if (res.ok && res.data) {
        folderPath = res.data
      }
    } else {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: '选择默认 Markdown 保存目录',
      })
      if (selected && typeof selected === 'string') {
        folderPath = selected
      }
    }

    if (folderPath) {
      selectedPath.value = folderPath
    }
  } catch (err: any) {
    errorMessage.value = `选择路径异常：${err?.message || '未知错误'}`
  }
}

async function onConfirm() {
  if (!selectedPath.value) return
  errorMessage.value = ''
  try {
    const res = await invoke<CmdResult<null>>('set_config', {
      savePath: selectedPath.value,
    })
    if (res.ok) {
      emit('update-path', selectedPath.value)
      onClose()
    } else {
      errorMessage.value = `配置保存失败：${res.error || '未知错误'}`
    }
  } catch (err: any) {
    errorMessage.value = `配置保存异常：${err?.message || '系统错误'}`
  }
}

// 测试辅助 Mock：可从 E2E 脚本中直接注入 selectedPath
if ((window as any).__TAURI_MOCK__) {
  ;(window as any).__SET_SELECTED_PATH__ = (p: string) => {
    selectedPath.value = p
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="onClose">
    <div
      class="modal-container"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div class="modal-header">
        <h3 id="settings-modal-title" class="modal-title">设置保存路径</h3>
        <button class="close-btn" aria-label="关闭对话框" @click="onClose">×</button>
      </div>

      <div class="modal-body">
        <p class="modal-description">选择新的默认 Markdown 文件保存目录：</p>
        <div class="path-input-group">
          <input
            type="text"
            class="path-input"
            readonly
            :value="selectedPath || currentPath"
            aria-label="当前保存路径"
          />
          <button type="button" class="btn btn-secondary select-btn" @click="onSelect">
            选择...
          </button>
        </div>
        <p v-if="errorMessage" class="error-text" role="alert">{{ errorMessage }}</p>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary cancel-btn" @click="onClose">
          取消
        </button>
        <button
          type="button"
          class="btn btn-primary confirm-btn"
          :disabled="!selectedPath"
          @click="onConfirm"
        >
          确认
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  width: 480px;
  max-width: 90vw;
  background: var(--color-background-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 8px);
  box-shadow: var(--shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.5));
  color: var(--color-text-primary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  margin: 0;
  font-size: var(--font-size-h3, 16px);
  font-weight: 600;
  color: var(--color-text-primary);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.close-btn:hover {
  color: var(--color-text-primary);
}

.modal-body {
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.modal-description {
  margin: 0;
  font-size: var(--font-size-body, 13px);
  color: var(--color-text-muted);
}

.path-input-group {
  display: flex;
  gap: var(--spacing-sm, 8px);
}

.path-input {
  flex: 1;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 4px);
  padding: var(--spacing-sm) var(--spacing-md);
  color: var(--color-text-primary);
  font-family: var(--font-body-mono);
  font-size: var(--font-size-body, 13px);
  outline: none;
}

.path-input:focus {
  border-color: var(--color-primary);
}

.error-text {
  margin: 0;
  font-size: var(--font-size-body, 12px);
  color: var(--color-error, #f85149);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm, 8px);
  padding: var(--spacing-md) var(--spacing-lg);
  border-top: 1px solid var(--color-border);
  background: var(--color-background);
}

.btn {
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-body, 13px);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.btn-secondary {
  background: var(--color-background-surface);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

.btn-secondary:hover {
  background: var(--color-border);
}

.btn-primary {
  background: var(--color-primary, #58a6ff);
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
