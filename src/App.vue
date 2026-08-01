<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import TitleBar from './components/TitleBar.vue'
import MenuBar from './components/MenuBar.vue'
import StatusBar from './components/StatusBar.vue'
import SourceEditor from './components/SourceEditor.vue'
import PreviewPane from './components/PreviewPane.vue'
import SettingsModal from './components/SettingsModal.vue'
import SlashMenu, { type SlashMenuItem } from './components/SlashMenu.vue'
import type { CursorPosition } from './components/SourceEditor.vue'
import { applyTheme, getActiveThemeId } from './lib/theme'
import { getResolvedThemeId } from './lib/themes'
import type { AppConfig, DocumentState, CmdResult, SaveResult } from './lib/types'

const filename = ref('New_*.md')
const content = ref('')
const cursorPosition = ref<CursorPosition>({ line: 1, column: 1 })
const sourceEditorRef = ref<any>(null)

// 可拖动分栏
const containerRef = ref<HTMLElement | null>(null)
const splitterRef = ref<HTMLElement | null>(null)
const leftWidth = ref<number>(0)
let isDragging = false
let isManuallyResized = false
let rafId: number | null = null
let pendingWidth = 0
let dragContainerRect: DOMRect | null = null

// 斜杠快捷插入菜单状态
const isSlashMenuOpen = ref(false)
const slashMenuPosition = ref({ top: 0, left: 0 })

// Settings Modal 状态
const isSettingsOpen = ref(false)
const currentSavePath = ref('')
const activeThemeId = ref(getActiveThemeId())

// 保存状态管理
type SaveStatus = 'unsaved' | 'success' | 'failure'
const saveStatus = ref<SaveStatus>('unsaved')
const saveMessage = ref('')

const statusBarStatus = computed(() =>
  saveStatus.value === 'unsaved' ? 'normal' : saveStatus.value
)

let autoSaveTimer: number | null = null

function formatSaveError(rawError?: string): string {
  if (!rawError) return '保存失败：未知错误'
  if (rawError === 'ERR_SAVE_FAILED') return '保存失败：文件保存失败'
  if (rawError === 'ERR_DIR_NOT_WRITABLE') return '保存失败：应用目录不可写，请设置保存路径'
  if (/permission/i.test(rawError)) return '保存失败：权限不足'
  if (/space/i.test(rawError)) return '保存失败：磁盘空间不足'
  if (rawError.startsWith('保存失败：')) return rawError
  return `保存失败：${rawError}`
}

const currentFilePath = ref<string | null>(null)

function triggerDebouncedAutoSave(newContent: string) {
  if (autoSaveTimer !== null) {
    window.clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }

  autoSaveTimer = window.setTimeout(async () => {
    try {
      if (currentFilePath.value) {
        const res = await invoke<CmdResult<SaveResult>>('save_document_as', {
          targetPath: currentFilePath.value,
          content: newContent,
        })
        if (res.ok && res.data) {
          saveStatus.value = 'success'
          saveMessage.value = `已保存至 ${filename.value}`
          if (!(window as any).__TAURI_MOCK__) {
            await invoke('update_last_opened_file', { filePath: res.data.path })
          }
        } else {
          saveStatus.value = 'failure'
          saveMessage.value = formatSaveError(res.error)
        }
      } else {
        const res = await invoke<CmdResult<SaveResult>>('save_document', {
          filename: filename.value,
          content: newContent,
          savePath: currentSavePath.value || undefined,
        })
        if (res.ok && res.data) {
          currentFilePath.value = res.data.path
          saveStatus.value = 'success'
          saveMessage.value = `已保存至 ${filename.value}`
          if (!(window as any).__TAURI_MOCK__) {
            await invoke('update_last_opened_file', { filePath: res.data.path })
          }
        } else {
          saveStatus.value = 'failure'
          saveMessage.value = formatSaveError(res.error)
        }
      }
    } catch (err: any) {
      saveStatus.value = 'failure'
      saveMessage.value = formatSaveError(err?.message)
    }
  }, 300)
}

watch(content, (newVal) => {
  saveStatus.value = 'unsaved'
  triggerDebouncedAutoSave(newVal)
})

function onPathUpdated(newPath: string) {
  currentSavePath.value = newPath
  saveStatus.value = 'success'
  saveMessage.value = '保存路径已更新'
}

async function handleThemeSelect(themeId: string) {
  const previousThemeId = activeThemeId.value
  const resolvedThemeId = applyTheme(themeId)
  activeThemeId.value = resolvedThemeId

  try {
    const res = await invoke<CmdResult<null>>('set_config', {
      themeId: resolvedThemeId,
    })
    if (!res.ok) {
      activeThemeId.value = applyTheme(previousThemeId)
      saveStatus.value = 'failure'
      saveMessage.value = `主题保存失败：${res.error || '未知错误'}`
      return
    }

    saveStatus.value = 'success'
    saveMessage.value = `主题已切换为 ${resolvedThemeId}`
  } catch (err: any) {
    activeThemeId.value = applyTheme(previousThemeId)
    saveStatus.value = 'failure'
    saveMessage.value = `主题保存异常：${err?.message || '系统错误'}`
  }
}

async function loadFileFromPath(filePath: string) {
  try {
    const res = await invoke<CmdResult<DocumentState>>('read_external_document', { path: filePath })
    if (res.ok && res.data) {
      currentFilePath.value = filePath
      filename.value = res.data.filename
      content.value = res.data.content
      saveStatus.value = 'success'
      saveMessage.value = `已打开 ${res.data.filename}`
      if (!(window as any).__TAURI_MOCK__) {
        await invoke('update_last_opened_file', { filePath })
      }
    } else {
      saveStatus.value = 'failure'
      saveMessage.value = `打开失败：${res.error || '文件无法读取'}`
    }
  } catch (err: any) {
    console.error('Failed to load file from path:', err)
  }
}

async function handleOpenFile() {
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Markdown Document', extensions: ['md', 'markdown', 'txt'] }],
    })
    if (selected && typeof selected === 'string') {
      await loadFileFromPath(selected)
    }
  } catch (err: any) {
    saveStatus.value = 'failure'
    saveMessage.value = `打开文件调起对话框失败：${err?.message || err}`
    console.error('Open file dialog error:', err)
  }
}

async function handleSaveAsFile() {
  try {
    const defaultName = filename.value || 'Untitled.md'
    const defaultPath = currentSavePath.value
      ? `${currentSavePath.value}/${defaultName}`
      : defaultName
    const target = await save({
      defaultPath,
      filters: [{ name: 'Markdown Document', extensions: ['md', 'markdown', 'txt'] }],
    })
    if (target && typeof target === 'string') {
      const res = await invoke<CmdResult<SaveResult>>('save_document_as', {
        targetPath: target,
        content: content.value,
      })
      if (res.ok && res.data) {
        currentFilePath.value = res.data.path
        filename.value = res.data.filename
        saveStatus.value = 'success'
        saveMessage.value = `已另存为 ${res.data.filename}`
        if (!(window as any).__TAURI_MOCK__) {
          await invoke('update_last_opened_file', { filePath: res.data.path })
        }
      } else {
        saveStatus.value = 'failure'
        saveMessage.value = `另存为失败：${res.error}`
      }
    }
  } catch (err: any) {
    saveStatus.value = 'failure'
    saveMessage.value = `另存为调起对话框失败：${err?.message || err}`
    console.error('Save as file error:', err)
  }
}

async function onFileDrop(e: DragEvent) {
  e.preventDefault()
  if (!e.dataTransfer || !e.dataTransfer.files.length) return
  const file = e.dataTransfer.files[0]
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (ext !== 'md' && ext !== 'markdown' && ext !== 'txt') {
    saveStatus.value = 'failure'
    saveMessage.value = '拖拽打开失败：仅支持打开 .md, .markdown, .txt 扩展名的文本文件'
    return
  }
  const filePath = (file as any).path
  if (filePath) {
    await loadFileFromPath(filePath)
  } else {
    const text = await file.text()
    filename.value = file.name
    content.value = text
    saveStatus.value = 'success'
    saveMessage.value = `已从拖拽打开 ${file.name}`
  }
}

function onSlashTrigger(pos: { top: number; left: number }) {
  slashMenuPosition.value = pos
  isSlashMenuOpen.value = true
}

function onSlashSelect(item: SlashMenuItem) {
  if (sourceEditorRef.value) {
    sourceEditorRef.value.insertTemplate(item.template, item.cursorOffset)
  }
  isSlashMenuOpen.value = false
}

const SPLITTER_WIDTH = 4

function clampLeftWidth(newWidth: number, containerWidth: number): number {
  return Math.max(200, Math.min(newWidth, containerWidth - 200))
}

function applyPendingWidth() {
  leftWidth.value = pendingWidth
  rafId = null
}

function scheduleWidthUpdate(width: number) {
  pendingWidth = width
  if (rafId === null) {
    rafId = requestAnimationFrame(applyPendingWidth)
  }
}

function stopDragging() {
  isDragging = false
  dragContainerRect = null
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  document.body.style.userSelect = ''
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
}

function onWindowMouseMove(e: MouseEvent) {
  if (!isDragging || !dragContainerRect) return
  const rawWidth = e.clientX - dragContainerRect.left
  const clamped = clampLeftWidth(rawWidth, dragContainerRect.width)
  scheduleWidthUpdate(clamped)
}

function onWindowMouseUp() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    leftWidth.value = pendingWidth
    rafId = null
  }
  stopDragging()
}

function onSplitterMouseDown(e: MouseEvent) {
  e.preventDefault()
  if (!containerRef.value) return
  isDragging = true
  isManuallyResized = true
  document.body.style.userSelect = 'none'
  dragContainerRect = containerRef.value.getBoundingClientRect()
  pendingWidth = clampLeftWidth(e.clientX - dragContainerRect.left, dragContainerRect.width)
  scheduleWidthUpdate(pendingWidth)
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
}

function resetWidths() {
  if (!containerRef.value) return
  isManuallyResized = false
  const containerWidth = containerRef.value.getBoundingClientRect().width
  // 平分去除 splitter 后的可用宽度，使左右两栏内容区相等
  leftWidth.value = clampLeftWidth(
    (containerWidth - SPLITTER_WIDTH) / 2,
    containerWidth,
  )
}

function onWindowResize() {
  if (!containerRef.value) return
  const containerWidth = containerRef.value.getBoundingClientRect().width
  if (!isManuallyResized) {
    leftWidth.value = clampLeftWidth(
      (containerWidth - SPLITTER_WIDTH) / 2,
      containerWidth,
    )
  } else {
    leftWidth.value = clampLeftWidth(leftWidth.value, containerWidth)
  }
}

onMounted(async () => {
  try {
    const configRes = await invoke<CmdResult<AppConfig>>('get_config')
    let lastFileLoaded = false

    if (configRes.ok && configRes.data) {
      if (configRes.data.savePath) {
        currentSavePath.value = configRes.data.savePath
      }
      if (configRes.data.lastOpenedFile && !(window as any).__TAURI_MOCK__) {
        const loadRes = await invoke<CmdResult<DocumentState>>('read_external_document', {
          path: configRes.data.lastOpenedFile,
        })
        if (loadRes.ok && loadRes.data) {
          filename.value = loadRes.data.filename
          content.value = loadRes.data.content
          saveStatus.value = 'success'
          saveMessage.value = `已自动恢复上次编辑文件：${loadRes.data.filename}`
          lastFileLoaded = true
        }
      }
    }

    if (!lastFileLoaded) {
      const result = await invoke<CmdResult<DocumentState>>('get_blank_document')
      if (result.ok && result.data) {
        filename.value = result.data.filename
        content.value = result.data.content
      } else if (result.error) {
        filename.value = 'New_Untitled.md'
        saveStatus.value = 'failure'
        saveMessage.value = `文档初始化警告：${result.error}`
      }
    }

    if (!currentSavePath.value) {
      const dirRes = await invoke<CmdResult<string>>('get_app_dir')
      if (dirRes.ok && dirRes.data) {
        currentSavePath.value = dirRes.data
      }
    }
    if (!configRes.ok) {
      saveStatus.value = 'unsaved'
      saveMessage.value = '已回退到默认保存路径'
    }

    resetWidths()
    window.addEventListener('resize', onWindowResize)
  } catch (e) {
    console.error('Failed on mounted initialization:', e)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
  document.body.style.userSelect = ''
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
  ;(window as any).__GET_ACTIVE_THEME_ID__ = () => {
    return activeThemeId.value
  }
  ;(window as any).__SET_THEME__ = async (themeId: string) => {
    await handleThemeSelect(getResolvedThemeId(themeId))
  }
}
</script>

<template>
  <div
    class="app"
    @dragover.prevent
    @drop.prevent="onFileDrop"
  >
    <TitleBar :filename="filename" :save-status="saveStatus" />
    <MenuBar
      :active-theme-id="activeThemeId"
      @open-file="handleOpenFile"
      @save-as-file="handleSaveAsFile"
      @open-settings="isSettingsOpen = true"
      @select-theme="handleThemeSelect"
    />
    <main ref="containerRef" class="editor-workspace">
      <section
        class="editor-pane source-pane"
        aria-label="源码编辑器"
        :style="{ width: leftWidth > 0 ? `${leftWidth}px` : `calc(50% - ${SPLITTER_WIDTH / 2}px)` }"
      >
        <SourceEditor
          ref="sourceEditorRef"
          v-model="content"
          @cursor-change="onCursorPositionUpdate"
          @slash-trigger="onSlashTrigger"
        />
      </section>
      <div
        ref="splitterRef"
        class="editor-splitter"
        role="separator"
        aria-label="调整编辑栏与预览栏宽度"
        @mousedown="onSplitterMouseDown"
        @dblclick="resetWidths"
      />
      <section
        class="editor-pane preview-pane"
        :style="{ width: leftWidth > 0 ? `calc(100% - ${leftWidth}px - ${SPLITTER_WIDTH}px)` : `calc(50% - ${SPLITTER_WIDTH / 2}px)` }"
      >
        <PreviewPane :content="content" />
      </section>
    </main>
    <StatusBar
      :line="cursorPosition.line"
      :column="cursorPosition.column"
      :message="saveMessage"
      :status="statusBarStatus"
    />

    <SlashMenu
      v-if="isSlashMenuOpen"
      :position="slashMenuPosition"
      @select="onSlashSelect"
      @close="isSlashMenuOpen = false"
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
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--color-background);
  color: var(--color-text-primary);
  position: relative;
}

.editor-workspace {
  display: flex;
  flex: 1;
  min-height: 0;
}

.editor-pane {
  flex: 0 0 auto;
  width: 50%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.source-pane {
  background: var(--color-background);
}

.preview-pane {
  background: var(--color-background-surface);
}

.editor-splitter {
  /* 宽度需与 script 中 SPLITTER_WIDTH 常量保持一致 */
  flex: 0 0 auto;
  width: 4px;
  background: var(--color-border);
  cursor: col-resize;
  user-select: none;
  touch-action: none;
  z-index: 10;
}

.editor-splitter:hover {
  background: var(--color-accent);
}
</style>
