<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import TitleBar from './components/TitleBar.vue'
import MenuBar from './components/MenuBar.vue'
import StatusBar from './components/StatusBar.vue'
import SourceEditor from './components/SourceEditor.vue'
import PreviewPane from './components/PreviewPane.vue'
import SettingsModal from './components/SettingsModal.vue'
import type { CursorPosition } from './components/SourceEditor.vue'
import { DocumentState, CmdResult, SaveResult } from './lib/types'

const filename = ref('New_*.md')
const content = ref('')
const cursorPosition = ref<CursorPosition>({ line: 1, column: 1 })

// Story 4.1: 设置保存路径 Modal 状态
const isSettingsOpen = ref(false)
const currentSavePath = ref('')

// Story 2.3: 保存状态三态管理（unsaved / success / failure）
type SaveStatus = 'unsaved' | 'success' | 'failure'
const saveStatus = ref<SaveStatus>('unsaved')
const saveMessage = ref('')

// StatusBar 的 status prop 不接受 'unsaved'，需要映射为 'normal'
const statusBarStatus = computed(() =>
  saveStatus.value === 'unsaved' ? 'normal' : saveStatus.value
)

// Story 3.1: 300ms 防抖自动保存
let autoSaveTimer: number | null = null

function formatSaveError(rawError?: string): string {
  if (!rawError) {
    return '保存失败：未知错误'
  }
  if (rawError === 'ERR_SAVE_FAILED') {
    return '保存失败：文件保存失败'
  }
  if (rawError === 'ERR_DIR_NOT_WRITABLE') {
    return '保存失败：应用目录不可写，请设置保存路径'
  }
  if (/permission/i.test(rawError)) {
    return '保存失败：权限不足'
  }
  if (/space/i.test(rawError)) {
    return '保存失败：磁盘空间不足'
  }
  if (rawError.startsWith('保存失败：')) {
    return rawError
  }
  return `保存失败：${rawError}`
}

function triggerDebouncedAutoSave(newContent: string) {
  if (autoSaveTimer !== null) {
    window.clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }

  autoSaveTimer = window.setTimeout(async () => {
    try {
      const res = await invoke<CmdResult<SaveResult>>('save_document', {
        filename: filename.value,
        content: newContent,
        savePath: currentSavePath.value || undefined,
      })
      if (res.ok) {
        saveStatus.value = 'success'
        saveMessage.value = `已保存至 ${filename.value}`
      } else {
        saveStatus.value = 'failure'
        saveMessage.value = formatSaveError(res.error)
      }
    } catch (err: any) {
      saveStatus.value = 'failure'
      saveMessage.value = formatSaveError(err?.message)
    }
  }, 300)
}

// content 变化时重置保存状态为 unsaved，并触发 300ms 防抖保存
watch(content, (newVal) => {
  saveStatus.value = 'unsaved'
  triggerDebouncedAutoSave(newVal)
})

function onPathUpdated(newPath: string) {
  currentSavePath.value = newPath
  saveStatus.value = 'success'
  saveMessage.value = '保存路径已更新'
}

onMounted(async () => {
  try {
    const result = await invoke<CmdResult<DocumentState>>('get_blank_document')
    if (result.ok && result.data) {
      filename.value = result.data.filename
      content.value = result.data.content
    } else if (result.error) {
      filename.value = 'New_Untitled.md'
      saveStatus.value = 'failure'
      saveMessage.value = `文档初始化警告：${result.error}`
      console.error('Failed to initialize blank document:', result.error)
    }

    const configRes = await invoke<CmdResult<{ savePath: string | null }>>('get_config')
    if (configRes.ok && configRes.data?.savePath) {
      currentSavePath.value = configRes.data.savePath
    } else {
      const dirRes = await invoke<CmdResult<string>>('get_app_dir')
      if (dirRes.ok && dirRes.data) {
        currentSavePath.value = dirRes.data
      }
      if (!configRes.ok) {
        saveStatus.value = 'unsaved'
        saveMessage.value = '已回退到默认保存路径'
      }
    }
  } catch (e) {
    console.error('Failed on mounted initialization:', e)
  }
})

function onCursorPositionUpdate(pos: CursorPosition) {
  cursorPosition.value = pos
}

// E2E 测试辅助：在 mock 环境下暴露状态控制函数与设置弹窗控制
if ((window as any).__TAURI_MOCK__) {
  ;(window as any).__SET_SAVE_STATUS__ = (status: SaveStatus) => {
    saveStatus.value = status
  }
  ;(window as any).__SET_SAVE_MESSAGE__ = (msg: string) => {
    saveMessage.value = msg
  }
  ;(window as any).__OPEN_SETTINGS__ = () => {
    isSettingsOpen.value = true
  }
  ;(window as any).__GET_CURRENT_SAVE_PATH__ = () => {
    return currentSavePath.value
  }
}
</script>

<template>
  <div class="app">
    <TitleBar :filename="filename" :save-status="saveStatus" />
    <MenuBar @open-settings="isSettingsOpen = true" />
    <main class="editor-workspace">
      <section class="editor-pane source-pane" aria-label="源码编辑器">
        <SourceEditor
          v-model="content"
          @cursor-change="onCursorPositionUpdate"
        />
      </section>
      <section class="editor-pane preview-pane">
        <PreviewPane :content="content" />
      </section>
    </main>
    <StatusBar
      :line="cursorPosition.line"
      :column="cursorPosition.column"
      :message="saveMessage"
      :status="statusBarStatus"
    />

    <SettingsModal
      :is-open="isSettingsOpen"
      :current-path="currentSavePath"
      @close="isSettingsOpen = false"
      @update-path="onPathUpdated"
    />
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

/* 主编辑区：占据标题栏、菜单栏、状态栏之外的所有剩余空间 */
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
</style>
