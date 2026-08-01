<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import TitleBar from './components/TitleBar.vue'
import MenuBar from './components/MenuBar.vue'
import StatusBar from './components/StatusBar.vue'
import SourceEditor from './components/SourceEditor.vue'
import PreviewPane from './components/PreviewPane.vue'
import SettingsModal from './components/SettingsModal.vue'
import SlashMenu, { type SlashMenuItem } from './components/SlashMenu.vue'
import type { CursorPosition } from './components/SourceEditor.vue'
import { applyTheme, getActiveThemeId } from './lib/theme'
import { renderMarkdown } from './lib/markdown'
import { getResolvedThemeId } from './lib/themes'
import { exportSelfContainedHtml, isHtmlExportCancelledError, type ExportImageWarning } from './lib/export-html'
import {
  extractAssetReferences,
  extractSiblingImageReferences,
  generateClipboardImageFilename,
  getParentDirectory,
  joinFilePath,
} from './lib/image-assets'
import { openDialog, saveDialog } from './lib/tauri-dialog'
import type { AppConfig, ClipboardImagePayload, DocumentState, CmdResult, ReadImageAssetResult, SaveResult } from './lib/types'

const filename = ref('New_*.md')
const content = ref('')
const cursorPosition = ref<CursorPosition>({ line: 1, column: 1 })
const sourceEditorRef = ref<any>(null)

// 可拖动分栏
const containerRef = ref<HTMLElement | null>(null)
const splitterRef = ref<HTMLElement | null>(null)
const previewPaneSectionRef = ref<HTMLElement | null>(null)
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
interface ExportProgressState {
  active: boolean
  current: number
  total: number
  message: string
  warnings: ExportImageWarning[]
}

const saveStatus = ref<SaveStatus>('unsaved')
const saveMessage = ref('')
const exportProgress = ref<ExportProgressState>({
  active: false,
  current: 0,
  total: 0,
  message: '',
  warnings: [],
})

const statusBarStatus = computed(() =>
  saveStatus.value === 'unsaved' ? 'normal' : saveStatus.value
)
const exportProgressPercent = computed(() => {
  if (!exportProgress.value.active) return 0
  if (exportProgress.value.total === 0) return 100
  return Math.min(100, Math.round((exportProgress.value.current / exportProgress.value.total) * 100))
})
const visibleExportWarnings = computed(() => exportProgress.value.warnings.slice(-3))

let autoSaveTimer: number | null = null
let exportAbortController: AbortController | null = null

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
const documentBaseDir = computed(() => getParentDirectory(currentFilePath.value) ?? currentSavePath.value ?? null)

function resetExportProgress() {
  exportProgress.value = {
    active: false,
    current: 0,
    total: 0,
    message: '',
    warnings: [],
  }
}

function updateExportProgress(next: Partial<ExportProgressState>) {
  exportProgress.value = {
    ...exportProgress.value,
    ...next,
  }
}

function cancelHtmlExport() {
  exportAbortController?.abort()
}

function deriveHtmlExportFilename(sourceFilename: string): string {
  const trimmedFilename = sourceFilename.trim() || 'Untitled.md'
  // Only strip a recognized document extension — a bare `\.[^.]+$` match would
  // also clip non-extension trailing dot-segments (e.g. "Release 1.0" would
  // wrongly become "Release 1.html").
  if (/\.(md|markdown|txt)$/i.test(trimmedFilename)) {
    return trimmedFilename.replace(/\.(md|markdown|txt)$/i, '.html')
  }
  return `${trimmedFilename}.html`
}

function deriveHtmlExportDefaultPath(): string {
  const exportFilename = deriveHtmlExportFilename(filename.value)
  const baseDir = getParentDirectory(currentFilePath.value) ?? currentSavePath.value
  return baseDir ? joinFilePath(baseDir, exportFilename) : exportFilename
}

function getPreviewExportWidth(): number {
  return previewPaneSectionRef.value?.clientWidth ?? containerRef.value?.clientWidth ?? 960
}

async function readLocalImageForExport(absolutePath: string) {
  const result = await invoke<CmdResult<ReadImageAssetResult>>('read_image_asset', {
    path: absolutePath,
    maxInlineSizeBytes: 10 * 1024 * 1024,
  })

  if (!result.ok || !result.data) {
    throw new Error(result.error || 'ERR_READ_FILE_FAILED')
  }

  return result.data
}

async function handleExportHtml() {
  try {
    const target = await saveDialog({
      defaultPath: deriveHtmlExportDefaultPath(),
      filters: [{ name: 'HTML', extensions: ['html'] }],
    })

    if (!target || typeof target !== 'string') {
      return
    }

    const renderResult = renderMarkdown(content.value)
    exportAbortController = new AbortController()
    exportProgress.value = {
      active: true,
      current: 0,
      total: 0,
      message: '正在准备导出内容…',
      warnings: [],
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const exported = await exportSelfContainedHtml({
      markdownHtml: renderResult.html,
      title: deriveHtmlExportFilename(filename.value),
      themeId: activeThemeId.value,
      previewWidth: getPreviewExportWidth(),
      documentBaseDir: documentBaseDir.value,
      readLocalImage: async (absolutePath) => readLocalImageForExport(absolutePath),
      signal: exportAbortController.signal,
      onProgress: (progress) => {
        updateExportProgress(progress)
      },
    })

    const saveResult = await invoke<CmdResult<SaveResult>>('save_document_as', {
      targetPath: target,
      content: exported.html,
    })

    if (!saveResult.ok || !saveResult.data) {
      saveStatus.value = 'failure'
      saveMessage.value = `导出 HTML 失败：${saveResult.error || '写入失败'}`
      return
    }

    const warningSummary = exported.warnings.length > 0 ? `（${exported.warnings.length} 个警告）` : ''
    saveStatus.value = 'success'
    saveMessage.value = `已导出 HTML：${saveResult.data.filename}${warningSummary}`
  } catch (err: any) {
    if (isHtmlExportCancelledError(err) || exportAbortController?.signal.aborted) {
      saveStatus.value = 'failure'
      saveMessage.value = 'HTML 导出已取消'
    } else {
      saveStatus.value = 'failure'
      saveMessage.value = `导出 HTML 失败：${err?.message || err}`
      console.error('Export HTML error:', err)
    }
  } finally {
    exportAbortController = null
    resetExportProgress()
  }
}

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
    const selected = await openDialog({
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
    // Capture the pre-save state: if the document was never saved to disk,
    // any pasted images were staged under `{defaultSaveDir}/assets/`. After
    // "Save As" relocates the document, those images must be migrated to
    // stay reachable via the `./assets/...` links already in the content.
    const wasUnsaved = !currentFilePath.value
    const priorAssetsDir = wasUnsaved && currentSavePath.value
      ? joinFilePath(currentSavePath.value, 'assets')
      : null
    // Images pasted while the document was already saved to disk live
    // directly beside the old document path (as "./img_....png"), not
    // under an "assets/" staging subfolder. Capture that directory too so
    // Save As can migrate them alongside the assets/ case above — without
    // this, moving/renaming an already-saved document silently breaks
    // every sibling image link in its content.
    const priorDocDir = !wasUnsaved ? getParentDirectory(currentFilePath.value) : null

    const target = await saveDialog({
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

        if (priorAssetsDir) {
          const newDocDir = getParentDirectory(res.data.path)
          const newAssetsDir = newDocDir ? joinFilePath(newDocDir, 'assets') : null
          if (newAssetsDir && newAssetsDir !== priorAssetsDir) {
            const referencedAssets = extractAssetReferences(content.value)
            for (const assetFilename of referencedAssets) {
              try {
                await invoke('copy_asset_file', {
                  fromDir: priorAssetsDir,
                  toDir: newAssetsDir,
                  filename: assetFilename,
                })
              } catch (migrationErr) {
                console.error('Asset migration error:', migrationErr)
              }
            }
          }
        }

        if (priorDocDir) {
          const newDocDir = getParentDirectory(res.data.path)
          if (newDocDir && newDocDir !== priorDocDir) {
            const referencedSiblingImages = extractSiblingImageReferences(content.value)
            for (const imageFilename of referencedSiblingImages) {
              try {
                await invoke('copy_asset_file', {
                  fromDir: priorDocDir,
                  toDir: newDocDir,
                  filename: imageFilename,
                })
              } catch (migrationErr) {
                console.error('Sibling image migration error:', migrationErr)
              }
            }
          }
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

async function resolveFallbackImageDirectory(): Promise<string> {
  if (currentSavePath.value) {
    return joinFilePath(currentSavePath.value, 'assets')
  }

  const dirRes = await invoke<CmdResult<string>>('get_app_dir')
  if (!dirRes.ok || !dirRes.data) {
    throw new Error(dirRes.error || 'ERR_APP_DIR_NOT_WRITABLE')
  }

  currentSavePath.value = dirRes.data
  return joinFilePath(dirRes.data, 'assets')
}

async function handleClipboardImagePaste(payload: ClipboardImagePayload) {
  try {
    const savedDocumentDir = getParentDirectory(currentFilePath.value)
    const targetDir = savedDocumentDir ?? await resolveFallbackImageDirectory()
    const filenameForAsset = generateClipboardImageFilename(payload.mimeType)
    const saveRes = await invoke<CmdResult<SaveResult>>('save_image_asset', {
      targetDir,
      filename: filenameForAsset,
      bytes: payload.bytes,
    })

    if (!saveRes.ok || !saveRes.data) {
      saveStatus.value = 'failure'
      saveMessage.value = formatSaveError(saveRes.error)
      return
    }

    // Use the filename actually written by the backend: on a rare naming
    // collision (e.g. very rapid consecutive pastes) it may differ from
    // the name we requested.
    const actualFilename = saveRes.data.filename
    const relativeAssetPath = savedDocumentDir ? `./${actualFilename}` : `./assets/${actualFilename}`

    sourceEditorRef.value?.insertText(`![Image](${relativeAssetPath})`)
    saveStatus.value = 'success'
    saveMessage.value = savedDocumentDir
      ? `图片已保存至 ${actualFilename}`
      : `图片已暂存至 assets/${actualFilename}`
  } catch (err: any) {
    saveStatus.value = 'failure'
    saveMessage.value = formatSaveError(err?.message)
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

// 有序列表分隔符同时支持 `.` 与 `)`，与 marked 的列表解析行为保持一致（见 marked ListToken）。
const TASK_LIST_LINE_PATTERN = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](.*)$/
// 围栏代码块起止标记（``` 或 ~~~，至少 3 个字符），用于跳过代码块内文本，
// 避免其中形如 "- [ ] xxx" 的纯文本被误当作真实任务行计数，
// 导致预览区 checkbox 索引与源码行索引错位、翻转到错误的行。
const FENCE_LINE_PATTERN = /^\s*(`{3,}|~{3,})/

function onToggleTask(index: number) {
  const lines = content.value.split('\n')
  let taskIndex = 0
  let inFence = false

  for (let i = 0; i < lines.length; i += 1) {
    if (FENCE_LINE_PATTERN.test(lines[i])) {
      inFence = !inFence
      continue
    }
    if (inFence) {
      continue
    }

    const match = lines[i].match(TASK_LIST_LINE_PATTERN)
    if (!match) {
      continue
    }

    if (taskIndex === index) {
      const [, prefix, marker, rest] = match
      lines[i] = `${prefix}[${marker === ' ' ? 'x' : ' '}]${rest}`
      content.value = lines.join('\n')
      return
    }

    taskIndex += 1
  }
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
      @export-html="handleExportHtml"
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
          @image-paste="handleClipboardImagePaste"
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
        ref="previewPaneSectionRef"
        class="editor-pane preview-pane"
        :style="{ width: leftWidth > 0 ? `calc(100% - ${leftWidth}px - ${SPLITTER_WIDTH}px)` : `calc(50% - ${SPLITTER_WIDTH / 2}px)` }"
      >
        <PreviewPane
          :content="content"
          :document-base-dir="documentBaseDir"
          @toggle-task="onToggleTask"
        />
      </section>
    </main>
    <StatusBar
      :line="cursorPosition.line"
      :column="cursorPosition.column"
      :message="saveMessage"
      :status="statusBarStatus"
    />

    <div v-if="exportProgress.active" class="export-progress-overlay" role="dialog" aria-modal="true" aria-label="导出 HTML 进度">
      <div class="export-progress-modal">
        <div class="export-progress-title">正在导出 HTML</div>
        <div class="export-progress-message">{{ exportProgress.message }}</div>
        <div class="export-progress-bar">
          <div class="export-progress-bar-fill" :style="{ width: `${exportProgressPercent}%` }" />
        </div>
        <div class="export-progress-meta">
          {{ exportProgress.total === 0 ? '处理中…' : `${exportProgress.current} / ${exportProgress.total}` }}
        </div>
        <div v-if="visibleExportWarnings.length > 0" class="export-progress-warnings">
          <div class="export-progress-warning-title">警告（{{ exportProgress.warnings.length }}）</div>
          <div
            v-for="warning in visibleExportWarnings"
            :key="`${warning.kind}-${warning.src}`"
            class="export-progress-warning"
          >
            {{ warning.message }}
          </div>
        </div>
        <div class="export-progress-actions">
          <button type="button" class="export-progress-button" @click="cancelHtmlExport">取消导出</button>
        </div>
      </div>
    </div>

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

.export-progress-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.32);
  z-index: 40;
}

.export-progress-modal {
  width: min(420px, calc(100vw - 32px));
  padding: var(--spacing-lg);
  border: 1px solid var(--color-border);
  border-radius: var(--rounded-lg);
  background: var(--color-background-elevated);
  box-shadow: var(--shadow-dialog);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.export-progress-title {
  font-size: var(--font-size-heading);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.export-progress-message,
.export-progress-meta {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
}

.export-progress-bar {
  width: 100%;
  height: 8px;
  overflow: hidden;
  border-radius: var(--rounded-full);
  background: var(--color-background-surface);
}

.export-progress-bar-fill {
  height: 100%;
  background: var(--color-accent);
  transition: width 120ms ease;
}

.export-progress-warnings {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm);
  border-radius: var(--rounded-md);
  background: rgba(210, 153, 34, 0.12);
}

.export-progress-warning-title {
  font-size: var(--font-size-label);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.export-progress-warning {
  font-size: var(--font-size-label);
  color: var(--color-text-secondary);
}

.export-progress-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--spacing-xs);
}

.export-progress-button {
  border: 1px solid var(--color-border);
  border-radius: var(--rounded-md);
  background: var(--color-background-surface);
  color: var(--color-text-primary);
  font: inherit;
  padding: var(--spacing-xs) var(--spacing-md);
  cursor: pointer;
}

.export-progress-button:hover {
  background: var(--color-background);
}
</style>
