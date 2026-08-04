<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'
import TitleBar from './components/TitleBar.vue'
import MenuBar from './components/MenuBar.vue'
import StatusBar from './components/StatusBar.vue'
import SourceEditor from './components/SourceEditor.vue'
import PreviewPane from './components/PreviewPane.vue'
import PublishConfluenceModal from './components/PublishConfluenceModal.vue'
import SettingsModal from './components/SettingsModal.vue'
import SlashMenu, { type SlashMenuItem } from './components/SlashMenu.vue'
import type { CursorPosition } from './components/SourceEditor.vue'
import { applyTheme, getActiveThemeId } from './lib/theme'
import { resolveThemeSelectionOutcome, type ThemeSelectOutcome } from './lib/theme-select'
import {
  isLatestOpenRequest,
  resolveStartupRestoreOutcome,
  shouldSkipBlankDocumentFallback,
} from './lib/session-restore'
import { renderMarkdown } from './lib/markdown'
import { getResolvedThemeId } from './lib/themes'
import { exportSelfContainedHtml, isHtmlExportCancelledError, type ExportImageWarning } from './lib/export-html'
import { convertMarkdownToConfluenceStorage } from './lib/confluence-publish'
import {
  extractAssetReferences,
  extractSiblingImageReferences,
  generateClipboardImageFilename,
  getParentDirectory,
  joinFilePath,
  replaceAssetReferenceFilename,
  replaceSiblingImageReferenceFilename,
} from './lib/image-assets'
import { openDialog, saveDialog } from './lib/tauri-dialog'
import type {
  AppConfig,
  AssetMigrationResult,
  ClipboardImagePayload,
  CmdResult,
  ConfluenceImageUpload,
  ConfluencePublishPayload,
  ConfluencePublishProgress,
  ConfluencePublishResult,
  DocumentState,
  Md2cfCheckResult,
  ReadImageAssetResult,
  SaveResult,
} from './lib/types'

const props = defineProps<{ configPromise?: Promise<CmdResult<AppConfig>> }>()
const filename = ref('New_*.md')
const content = ref('')
const cursorPosition = ref<CursorPosition>({ line: 1, column: 1 })
const sourceEditorRef = ref<any>(null)
const activeDocumentId = ref(0)
const openRequestToken = ref(0)

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
let activeTouchId: number | null = null

// 斜杠快捷插入菜单状态
const isSlashMenuOpen = ref(false)
const slashMenuPosition = ref({ top: 0, left: 0 })

// Settings Modal 状态
const isSettingsOpen = ref(false)
const isPublishConfluenceOpen = ref(false)
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
interface PublishProgressState {
  active: boolean
  running: boolean
  steps: ConfluencePublishProgress[]
  successMessage: string
  errorMessage: string
  pageUrl: string
  warnings: string[]
}
type ExportKind = 'HTML' | 'PDF'

const saveStatus = ref<SaveStatus>('unsaved')
const saveMessage = ref('')
const themeStatus = ref<SaveStatus>('unsaved')
const themeMessage = ref('')
const exportProgress = ref<ExportProgressState>({
  active: false,
  current: 0,
  total: 0,
  message: '',
  warnings: [],
})
const publishProgress = ref<PublishProgressState>({
  active: false,
  running: false,
  steps: [],
  successMessage: '',
  errorMessage: '',
  pageUrl: '',
  warnings: [],
})
const activeExportKind = ref<ExportKind>('HTML')
// Once the native PDF render (a single `invoke('export_pdf', ...)` call) has
// started, there is no way to abort it: the JS-side AbortController only ever
// covers the HTML-inlining phase, and Tauri gives no mechanism to cancel a
// command already in flight. Rather than let the cancel button appear to work
// while silently doing nothing, hide it once that phase begins.
const exportCancelable = ref(true)

const statusBarStatus = computed(() =>
  saveStatus.value === 'unsaved' ? 'normal' : saveStatus.value
)
const splitterAriaValueNow = computed(() => {
  const containerWidth = containerRef.value?.getBoundingClientRect().width
  if (!containerWidth) return 50
  return Math.round((leftWidth.value / containerWidth) * 100)
})
const exportProgressPercent = computed(() => {
  if (!exportProgress.value.active) return 0
  if (exportProgress.value.total === 0) return 100
  return Math.min(100, Math.round((exportProgress.value.current / exportProgress.value.total) * 100))
})
const visibleExportWarnings = computed(() => exportProgress.value.warnings.slice(-3))
const PUBLISH_STEP_ORDER = ['环境检测', '附件上传', '页面发布'] as const

function createPublishProgressState(): PublishProgressState {
  return {
    active: false,
    running: false,
    steps: [],
    successMessage: '',
    errorMessage: '',
    pageUrl: '',
    warnings: [],
  }
}

let autoSaveTimer: number | null = null
let exportAbortController: AbortController | null = null
let suppressAutoSave = false

function formatSaveError(rawError?: string): string {
  if (!rawError) return '保存失败：未知错误'
  if (rawError === 'ERR_SAVE_FAILED') return '保存失败：文件保存失败'
  if (rawError === 'ERR_DIR_NOT_WRITABLE') return '保存失败：应用目录不可写，请设置保存路径'
  if (/permission/i.test(rawError)) return '保存失败：权限不足'
  if (/space/i.test(rawError)) return '保存失败：磁盘空间不足'
  if (rawError.startsWith('保存失败：')) return rawError
  return `保存失败：${rawError}`
}

function formatPdfExportError(rawError?: string): string {
  if (!rawError) return '导出 PDF 失败：未知错误'
  if (rawError.startsWith('ERR_PDF_EXPORT_UNSUPPORTED_PLATFORM')) return '导出 PDF 失败：当前平台暂不支持 PDF 导出'
  if (rawError.startsWith('ERR_PDF_EXPORT_LOAD_TIMEOUT')) return '导出 PDF 失败：内容加载超时，请重试'
  if (rawError.startsWith('ERR_PDF_EXPORT_RENDER_TIMEOUT')) return '导出 PDF 失败：PDF 渲染超时，请重试'
  if (rawError.startsWith('ERR_SAVE_FAILED')) return '导出 PDF 失败：文件写入失败'
  if (/permission/i.test(rawError)) return '导出 PDF 失败：权限不足'
  if (/space/i.test(rawError)) return '导出 PDF 失败：磁盘空间不足'
  if (rawError.startsWith('ERR_PDF_EXPORT_')) return '导出 PDF 失败：PDF 生成失败，请重试'
  if (rawError.startsWith('导出 PDF 失败：')) return rawError
  return `导出 PDF 失败：${rawError}`
}


interface AssetRename {
  oldFilename: string
  newFilename: string
  replaceFilename: (markdown: string, oldFilename: string, newFilename: string) => string
}

// Applies a batch of asset renames to `markdown` in two phases so that
// renames cannot interfere with each other when one rename's new filename
// happens to equal another rename's old filename (a real possibility when
// several assets migrate into the same target directory and get
// uniquified against each other, e.g. "pic.png" -> "pic_1.png" while an
// unrelated "pic_1.png" -> "pic_1_1.png"). Phase 1 swaps every old filename
// for a unique, synthetic placeholder using the same contextual replacer
// used for the real rename, so placeholders never collide with any real
// filename. Phase 2 swaps each placeholder for its final filename via a
// plain literal replace, which is safe because placeholders are unique.
function applyAssetRenames(markdown: string, renames: AssetRename[]): string {
  const effective = renames.filter(({ oldFilename, newFilename }) => oldFilename !== newFilename)
  if (effective.length === 0) {
    return markdown
  }

  let result = markdown
  const placeholders = effective.map(({ oldFilename, replaceFilename }, index) => {
    const placeholder = `\u0000__save_as_rename_${index}__\u0000`
    result = replaceFilename(result, oldFilename, placeholder)
    return placeholder
  })

  effective.forEach(({ newFilename }, index) => {
    const placeholder = placeholders[index]
    // `replaceFilename` (e.g. `replaceAssetReferenceFilename`) may rewrite a
    // percent-encoded occurrence using `encodeURIComponent(placeholder)`
    // rather than the raw placeholder text — swap both spellings back so
    // neither leaves a stray placeholder behind.
    result = result.split(placeholder).join(newFilename)
    result = result.split(encodeURIComponent(placeholder)).join(encodeURIComponent(newFilename))
  })

  return result
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
  exportCancelable.value = true
}

function resetPublishProgress() {
  publishProgress.value = createPublishProgressState()
}

function formatConfluencePublishError(rawError?: string): string {
  if (!rawError) return '发布到 Confluence 失败：未知错误'
  if (rawError.startsWith('ERR_CONFLUENCE_PUBLISH_CONFIG_INCOMPLETE')) {
    return '发布到 Confluence 失败：请先在设置中完善 Confluence 地址、用户名、Space Key 与 API Token'
  }
  if (rawError.startsWith('ERR_CONFLUENCE_PAGE_LOOKUP_FAILED')) {
    return `发布到 Confluence 失败：页面查询失败。${rawError.split(':').slice(1).join(':').trim()}`
  }
  if (rawError.startsWith('ERR_CONFLUENCE_PAGE_CREATE_FAILED')) {
    return `发布到 Confluence 失败：页面创建失败。${rawError.split(':').slice(1).join(':').trim()}`
  }
  if (rawError.startsWith('ERR_CONFLUENCE_PAGE_UPDATE_FAILED')) {
    return `发布到 Confluence 失败：页面更新失败。${rawError.split(':').slice(1).join(':').trim()}`
  }
  if (rawError.startsWith('ERR_CONFLUENCE_ATTACHMENT_UPLOAD_FAILED')) {
    return `发布到 Confluence 失败：附件上传失败。${rawError.split(':').slice(1).join(':').trim()}`
  }
  if (rawError.startsWith('发布到 Confluence 失败：')) return rawError
  return `发布到 Confluence 失败：${rawError}`
}

function deriveConfluencePageTitle(sourceFilename: string): string {
  const trimmedFilename = sourceFilename.trim() || 'Untitled.md'
  if (/\.(md|markdown|txt)$/i.test(trimmedFilename)) {
    return trimmedFilename.replace(/\.(md|markdown|txt)$/i, '') || 'Untitled'
  }
  return trimmedFilename
}

function mergePublishProgress(
  update: ConfluencePublishProgress,
  options: { appendMessage?: boolean } = {},
) {
  const steps = [...publishProgress.value.steps]
  const existingIndex = steps.findIndex((entry) => entry.step === update.step)
  const nextMessage = options.appendMessage && existingIndex >= 0 && steps[existingIndex].message
    ? `${steps[existingIndex].message}\n${update.message}`
    : update.message
  const nextEntry: ConfluencePublishProgress = {
    ...update,
    message: nextMessage,
  }

  if (existingIndex >= 0) {
    steps.splice(existingIndex, 1, nextEntry)
  } else {
    steps.push(nextEntry)
  }

  steps.sort((a, b) => PUBLISH_STEP_ORDER.indexOf(a.step as any) - PUBLISH_STEP_ORDER.indexOf(b.step as any))
  publishProgress.value = {
    ...publishProgress.value,
    steps,
  }
}

function updateExportProgress(next: Partial<ExportProgressState>) {
  exportProgress.value = {
    ...exportProgress.value,
    ...next,
  }
}

function cancelExport() {
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

function derivePdfExportFilename(sourceFilename: string): string {
  const trimmedFilename = sourceFilename.trim() || 'Untitled.md'
  if (/\.(md|markdown|txt)$/i.test(trimmedFilename)) {
    return trimmedFilename.replace(/\.(md|markdown|txt)$/i, '.pdf')
  }
  return `${trimmedFilename}.pdf`
}

function derivePdfExportDefaultPath(): string {
  const exportFilename = derivePdfExportFilename(filename.value)
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

async function readLocalImageForPublish(absolutePath: string) {
  const result = await invoke<CmdResult<ReadImageAssetResult>>('read_image_asset', {
    path: absolutePath,
    maxInlineSizeBytes: 50 * 1024 * 1024,
  })

  if (!result.ok || !result.data) {
    throw new Error(result.error || 'ERR_READ_FILE_FAILED')
  }

  return result.data
}

async function openPublishedPage(url: string) {
  const tauriMock = (window as any).__TAURI_MOCK__
  if (tauriMock?.openUrl) {
    await tauriMock.openUrl(url)
    return
  }
  await openUrl(url)
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
    activeExportKind.value = 'HTML'
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

async function handleExportPdf() {
  try {
    const isSupported = await invoke<boolean>('pdf_export_supported')
    if (!isSupported) {
      saveStatus.value = 'failure'
      saveMessage.value = formatPdfExportError('ERR_PDF_EXPORT_UNSUPPORTED_PLATFORM')
      return
    }

    const target = await saveDialog({
      defaultPath: derivePdfExportDefaultPath(),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })

    if (!target || typeof target !== 'string') {
      return
    }

    const renderResult = renderMarkdown(content.value)
    exportAbortController = new AbortController()
    activeExportKind.value = 'PDF'
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
      title: derivePdfExportFilename(filename.value),
      themeId: activeThemeId.value,
      previewWidth: getPreviewExportWidth(),
      documentBaseDir: documentBaseDir.value,
      readLocalImage: async (absolutePath) => readLocalImageForExport(absolutePath),
      signal: exportAbortController.signal,
      onProgress: (progress) => {
        updateExportProgress(progress)
      },
    })

    updateExportProgress({ message: '正在生成 PDF…' })
    exportCancelable.value = false

    const saveResult = await invoke<CmdResult<SaveResult>>('export_pdf', {
      html: exported.html,
      savePath: target,
    })

    if (!saveResult.ok || !saveResult.data) {
      saveStatus.value = 'failure'
      saveMessage.value = formatPdfExportError(saveResult.error)
      return
    }

    const warningSummary = exported.warnings.length > 0 ? `（${exported.warnings.length} 个警告）` : ''
    saveStatus.value = 'success'
    saveMessage.value = `已导出 PDF：${saveResult.data.path}${warningSummary}`
  } catch (err: any) {
    if (isHtmlExportCancelledError(err) || exportAbortController?.signal.aborted) {
      saveStatus.value = 'failure'
      saveMessage.value = 'PDF 导出已取消'
    } else {
      saveStatus.value = 'failure'
      saveMessage.value = `导出 PDF 失败：${err?.message || err}`
      console.error('Export PDF error:', err)
    }
  } finally {
    exportAbortController = null
    resetExportProgress()
  }
}

function closePublishConfluenceModal() {
  isPublishConfluenceOpen.value = false
  if (!publishProgress.value.running) {
    resetPublishProgress()
  }
}

async function handleOpenPublishedConfluencePage() {
  if (!publishProgress.value.pageUrl) {
    return
  }

  try {
    await openPublishedPage(publishProgress.value.pageUrl)
  } catch (err: any) {
    publishProgress.value = {
      ...publishProgress.value,
      errorMessage: `打开页面失败：${err?.message || '系统错误'}`,
    }
  }
}

async function handlePublishConfluence() {
  let unlistenProgress: null | (() => void) = null

  try {
    const configRes = await invoke<CmdResult<AppConfig>>('get_config')
    const confluence = configRes.data?.confluence

    if (!configRes.ok || !confluence) {
      saveStatus.value = 'failure'
      saveMessage.value = `读取 Confluence 配置失败：${configRes.error || '未知错误'}`
      isSettingsOpen.value = true
      return
    }

    if (!confluence.baseUrl.trim() || !confluence.username.trim() || !confluence.spaceKey.trim()) {
      saveStatus.value = 'failure'
      saveMessage.value = '发布到 Confluence 前请先在设置中填写地址、用户名与 Space Key'
      isSettingsOpen.value = true
      return
    }

    isPublishConfluenceOpen.value = true
    publishProgress.value = {
      active: true,
      running: true,
      steps: [],
      successMessage: '',
      errorMessage: '',
      pageUrl: '',
      warnings: [],
    }

    const md2cfRes = await invoke<CmdResult<Md2cfCheckResult>>('check_md2cf_installed')
    const md2cfMessage = md2cfRes.ok && md2cfRes.data
      ? md2cfRes.data.installed
        ? md2cfRes.data.message
        : '未检测到 md2cf 命令行工具，将使用内置转换引擎完成发布；如需使用 md2cf CLI 可执行 `pip install md2cf` 安装。'
      : `md2cf 检测失败：${md2cfRes.error || '未知错误'}`
    mergePublishProgress(
      {
        step: '环境检测',
        status: 'running',
        message: md2cfMessage,
      },
      { appendMessage: true },
    )

    const converted = convertMarkdownToConfluenceStorage(content.value, documentBaseDir.value)
    const images: ConfluenceImageUpload[] = []
    const localImageWarnings: string[] = []

    for (const image of converted.images) {
      try {
        const asset = await readLocalImageForPublish(image.absolutePath)
        if (asset.dataBase64) {
          images.push({
            filename: image.filename,
            dataBase64: asset.dataBase64,
          })
        } else if (asset.skippedLarge) {
          localImageWarnings.push(`图片过大，未上传附件：${image.originalSrc}`)
        } else {
          localImageWarnings.push(`读取本地图片失败：${image.originalSrc}`)
        }
      } catch (err: any) {
        localImageWarnings.push(`读取本地图片失败：${image.originalSrc}（${err?.message || '未知错误'}）`)
      }
    }

    if (localImageWarnings.length > 0) {
      publishProgress.value = {
        ...publishProgress.value,
        warnings: [...publishProgress.value.warnings, ...localImageWarnings],
      }
    }

    unlistenProgress = await listen<ConfluencePublishProgress>('confluence-publish-progress', (event) => {
      mergePublishProgress(event.payload, { appendMessage: true })
    })

    const payload: ConfluencePublishPayload = {
      baseUrl: confluence.baseUrl.trim(),
      username: confluence.username.trim(),
      spaceKey: confluence.spaceKey.trim(),
      parentPageId: confluence.parentPageId.trim(),
      ignoreSsl: confluence.ignoreSsl,
      pageTitle: deriveConfluencePageTitle(filename.value),
      storageXhtml: converted.storageXhtml,
      images,
    }

    const result = await invoke<CmdResult<ConfluencePublishResult>>('publish_confluence', {
      payload,
    })

    if (!result.ok || !result.data) {
      const errorMessage = formatConfluencePublishError(result.error)
      publishProgress.value = {
        ...publishProgress.value,
        active: true,
        running: false,
        errorMessage,
      }
      saveStatus.value = 'failure'
      saveMessage.value = errorMessage
      return
    }

    const combinedWarnings = [...publishProgress.value.warnings, ...result.data.warnings]
    const warningSummary = combinedWarnings.length > 0 ? `（${combinedWarnings.length} 个警告）` : ''
    publishProgress.value = {
      ...publishProgress.value,
      active: true,
      running: false,
      successMessage: `已发布到 Confluence：${deriveConfluencePageTitle(filename.value)}${warningSummary}`,
      errorMessage: '',
      pageUrl: result.data.pageUrl,
      warnings: combinedWarnings,
    }
    saveStatus.value = 'success'
    saveMessage.value = `已发布到 Confluence：${deriveConfluencePageTitle(filename.value)}${warningSummary}`
  } catch (err: any) {
    const errorMessage = formatConfluencePublishError(err?.message || String(err))
    publishProgress.value = {
      ...publishProgress.value,
      active: true,
      running: false,
      errorMessage,
    }
    saveStatus.value = 'failure'
    saveMessage.value = errorMessage
  } finally {
    if (unlistenProgress) {
      unlistenProgress()
    }
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
  if (suppressAutoSave) {
    return
  }
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
  let outcome: ThemeSelectOutcome

  try {
    const res = await invoke<CmdResult<null>>('set_config', {
      themeId: resolvedThemeId,
    })
    outcome = resolveThemeSelectionOutcome(previousThemeId, resolvedThemeId, res)
  } catch (err: any) {
    outcome = resolveThemeSelectionOutcome(previousThemeId, resolvedThemeId, null, err?.message)
  }

  if (outcome.themeId !== resolvedThemeId) {
    activeThemeId.value = applyTheme(outcome.themeId)
  }

  themeStatus.value = outcome.status
  themeMessage.value = outcome.message
}

async function loadFileFromPath(filePath: string) {
  try {
    const requestToken = ++openRequestToken.value
    const res = await invoke<CmdResult<DocumentState>>('read_external_document', { path: filePath })
    if (!isLatestOpenRequest(requestToken, openRequestToken.value)) {
      return
    }

    if (res.ok && res.data) {
      activeDocumentId.value += 1
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
        if (!(window as any).__TAURI_MOCK__) {
          await invoke('update_last_opened_file', { filePath: res.data.path })
        }

        const skippedOrFailed: string[] = []
        let rewriteFailed = false
        // Renames are recorded here instead of being applied to the content
        // immediately. When multiple assets in the same document are
        // migrated, a later rename's *old* filename can collide with an
        // earlier rename's *new* filename (e.g. "pic.png" -> "pic_1.png",
        // then a separate "pic_1.png" -> "pic_1_1.png"). Applying renames
        // one at a time against the same mutable string would let the
        // second replacement re-match text the first replacement just
        // wrote, corrupting the first image's reference. Collecting every
        // rename first and applying them all in a single batch (via
        // collision-proof placeholders, see `applyAssetRenames`) keeps each
        // rename isolated regardless of migration order.
        const pendingRenames: AssetRename[] = []
        const migrateAsset = async (
          fromDir: string,
          toDir: string,
          assetFilename: string,
          replaceFilename: (markdown: string, oldFilename: string, newFilename: string) => string,
          logLabel: string,
        ) => {
          try {
            const migrationRes = await invoke<CmdResult<AssetMigrationResult>>('copy_asset_file', {
              fromDir,
              toDir,
              filename: assetFilename,
            })

            if (!migrationRes.ok || !migrationRes.data) {
              skippedOrFailed.push(assetFilename)
              console.error(`${logLabel} migration failed:`, migrationRes.error || assetFilename)
              return
            }

            if (!migrationRes.data.migrated) {
              skippedOrFailed.push(assetFilename)
              console.error(`${logLabel} migration skipped:`, assetFilename)
              return
            }

            const finalFilename = migrationRes.data.finalFilename
            if (finalFilename && finalFilename !== assetFilename) {
              pendingRenames.push({ oldFilename: assetFilename, newFilename: finalFilename, replaceFilename })
            }
          } catch (migrationErr) {
            skippedOrFailed.push(assetFilename)
            console.error(`${logLabel} migration error:`, migrationErr)
          }
        }

        if (priorAssetsDir) {
          const newDocDir = getParentDirectory(res.data.path)
          const newAssetsDir = newDocDir ? joinFilePath(newDocDir, 'assets') : null
          if (newAssetsDir && newAssetsDir !== priorAssetsDir) {
            const referencedAssets = extractAssetReferences(content.value)
            for (const assetFilename of referencedAssets) {
              await migrateAsset(
                priorAssetsDir,
                newAssetsDir,
                assetFilename,
                replaceAssetReferenceFilename,
                'Asset',
              )
            }
          }
        }

        if (priorDocDir) {
          const newDocDir = getParentDirectory(res.data.path)
          if (newDocDir && newDocDir !== priorDocDir) {
            const referencedSiblingImages = extractSiblingImageReferences(content.value)
            for (const imageFilename of referencedSiblingImages) {
              await migrateAsset(
                priorDocDir,
                newDocDir,
                imageFilename,
                replaceSiblingImageReferenceFilename,
                'Sibling image',
              )
            }
          }
        }

        const updatedContent = applyAssetRenames(content.value, pendingRenames)

        if (updatedContent !== content.value) {
          suppressAutoSave = true
          content.value = updatedContent
          await nextTick()
          suppressAutoSave = false

          try {
            const updatedSaveRes = await invoke<CmdResult<SaveResult>>('save_document_as', {
              targetPath: res.data.path,
              content: updatedContent,
            })
            if (!updatedSaveRes.ok) {
              rewriteFailed = true
              console.error('Failed to persist renamed asset references:', updatedSaveRes.error)
            }
          } catch (rewriteErr) {
            rewriteFailed = true
            console.error('Failed to persist renamed asset references:', rewriteErr)
          }
        }

        saveStatus.value = 'success'
        const warnings: string[] = []
        if (skippedOrFailed.length > 0) {
          warnings.push(`${skippedOrFailed.length} 张图片未能随文档迁移，请检查图片链接`)
        }
        if (rewriteFailed) {
          warnings.push('已改名的图片引用未能立即写回磁盘，请再次保存确认')
        }
        saveMessage.value = warnings.length > 0
          ? `已另存为 ${res.data.filename}（警告：${warnings.join('；')}）`
          : `已另存为 ${res.data.filename}`
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
  const pasteOriginDocumentId = activeDocumentId.value
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
      sourceEditorRef.value?.releasePositionToken(payload.positionToken)
      saveStatus.value = 'failure'
      saveMessage.value = formatSaveError(saveRes.error)
      return
    }

    // Use the filename actually written by the backend: on a rare naming
    // collision (e.g. very rapid consecutive pastes) it may differ from
    // the name we requested.
    const actualFilename = saveRes.data.filename
    const relativeAssetPath = savedDocumentDir ? `./${actualFilename}` : `./assets/${actualFilename}`

    if (activeDocumentId.value !== pasteOriginDocumentId) {
      sourceEditorRef.value?.releasePositionToken(payload.positionToken)
      saveStatus.value = 'failure'
      saveMessage.value = `图片已保存至 ${actualFilename}，但因文档已切换，未插入 Markdown 引用`
      return
    }

    const inserted = sourceEditorRef.value?.insertText(`![Image](${relativeAssetPath})`, undefined, false, payload.positionToken) ?? false
    if (!inserted) {
      sourceEditorRef.value?.releasePositionToken(payload.positionToken)
      saveStatus.value = 'failure'
      saveMessage.value = `图片已保存至 ${actualFilename}，但编辑器当前不可用，未插入 Markdown 引用`
      return
    }

    saveStatus.value = 'success'
    saveMessage.value = savedDocumentDir
      ? `图片已保存至 ${actualFilename}`
      : `图片已暂存至 assets/${actualFilename}`
  } catch (err: any) {
    sourceEditorRef.value?.releasePositionToken(payload.positionToken)
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
    activeDocumentId.value += 1
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

function removeTouchListeners() {
  window.removeEventListener('touchmove', onWindowTouchMove)
  window.removeEventListener('touchend', onWindowTouchEnd)
  window.removeEventListener('touchcancel', onWindowTouchEnd)
}

function finalizeDragging() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    leftWidth.value = pendingWidth
    rafId = null
  }
  stopDragging()
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
  removeTouchListeners()
}

function onWindowMouseMove(e: MouseEvent) {
  if (!isDragging || !dragContainerRect) return
  const rawWidth = e.clientX - dragContainerRect.left
  const clamped = clampLeftWidth(rawWidth, dragContainerRect.width)
  scheduleWidthUpdate(clamped)
}

function onWindowMouseUp() {
  finalizeDragging()
}

function onWindowTouchMove(e: TouchEvent) {
  if (!isDragging || !dragContainerRect || activeTouchId === null) return
  const touch = Array.from(e.touches).find((t) => t.identifier === activeTouchId)
  if (!touch) return
  e.preventDefault()
  const rawWidth = touch.clientX - dragContainerRect.left
  const clamped = clampLeftWidth(rawWidth, dragContainerRect.width)
  scheduleWidthUpdate(clamped)
}

function onWindowTouchEnd(e: TouchEvent) {
  if (activeTouchId !== null && !Array.from(e.changedTouches).some((t) => t.identifier === activeTouchId)) {
    return
  }
  activeTouchId = null
  finalizeDragging()
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

function onSplitterTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return
  const touch = e.touches[0]
  if (!touch || !containerRef.value) return
  e.preventDefault()
  activeTouchId = touch.identifier
  isDragging = true
  isManuallyResized = true
  document.body.style.userSelect = 'none'
  dragContainerRect = containerRef.value.getBoundingClientRect()
  pendingWidth = clampLeftWidth(touch.clientX - dragContainerRect.left, dragContainerRect.width)
  scheduleWidthUpdate(pendingWidth)
  window.addEventListener('touchmove', onWindowTouchMove, { passive: false })
  window.addEventListener('touchend', onWindowTouchEnd)
  window.addEventListener('touchcancel', onWindowTouchEnd)
}

function onSplitterKeyDown(e: KeyboardEvent) {
  if (isDragging) return
  const containerWidth = containerRef.value?.getBoundingClientRect().width
  if (!containerWidth) return

  const step = Math.max(1, containerWidth * 0.02)
  let nextWidth: number | null = null

  switch (e.key) {
    case 'ArrowLeft':
      nextWidth = leftWidth.value - step
      break
    case 'ArrowRight':
      nextWidth = leftWidth.value + step
      break
    case 'Home':
      nextWidth = 200
      break
    case 'End':
      nextWidth = containerWidth - 200
      break
    default:
      return
  }

  e.preventDefault()
  isManuallyResized = true
  leftWidth.value = clampLeftWidth(nextWidth, containerWidth)
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
    let configRes: CmdResult<AppConfig> | undefined
    if (props.configPromise) {
      try {
        configRes = await props.configPromise
      } catch (error) {
        // 共享的启动期预取（main.ts）超时或失败时，做一次有界重试，
        // 避免因偶发的慢 IPC 而永久丢失 savePath/lastOpenedFile 的恢复能力。
        console.warn('Shared config preload failed, retrying once:', error)
        try {
          configRes = await invoke<CmdResult<AppConfig>>('get_config')
        } catch (retryError) {
          console.warn('Config retry failed:', retryError)
          configRes = undefined
        }
      }
    } else {
      configRes = await invoke<CmdResult<AppConfig>>('get_config')
    }
    let lastFileLoaded = false

    if (configRes?.ok && configRes.data) {
      if (configRes.data.savePath) {
        currentSavePath.value = configRes.data.savePath
      }
      if (configRes.data.lastOpenedFile && !(window as any).__TAURI_MOCK__) {
        const requestToken = ++openRequestToken.value
        let loadRes: CmdResult<DocumentState> | null = null

        try {
          loadRes = await invoke<CmdResult<DocumentState>>('read_external_document', {
            path: configRes.data.lastOpenedFile,
          })
        } catch (error) {
          console.error('Failed to restore last opened file:', error)
        }

        const outcome = resolveStartupRestoreOutcome(loadRes)
        const isRestoreStillLatest = isLatestOpenRequest(requestToken, openRequestToken.value)

        if (outcome.applied && isRestoreStillLatest) {
          activeDocumentId.value += 1
          currentFilePath.value = configRes.data.lastOpenedFile
          filename.value = outcome.filename
          content.value = outcome.content
          saveStatus.value = 'success'
          saveMessage.value = outcome.message
        }

        if (shouldSkipBlankDocumentFallback(outcome, isRestoreStillLatest, activeDocumentId.value > 0)) {
          lastFileLoaded = true
        }

        if (outcome.shouldClearStaleConfig && isRestoreStillLatest) {
          try {
            await invoke('update_last_opened_file', { filePath: null })
          } catch (error) {
            console.warn('Failed to clear stale last opened file config:', error)
          }
        }
      }
    }

    if (!lastFileLoaded) {
      const result = await invoke<CmdResult<DocumentState>>('get_blank_document')
      if (result.ok && result.data) {
        activeDocumentId.value += 1
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
    if (!configRes?.ok) {
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
  removeTouchListeners()
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
  ;(window as any).__LOAD_FILE_FROM_PATH__ = async (filePath: string) => {
    await loadFileFromPath(filePath)
  }
  ;(window as any).__SET_SOURCE_EDITOR_REF__ = (nextSourceEditorRef: any) => {
    sourceEditorRef.value = nextSourceEditorRef
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
      @export-pdf="handleExportPdf"
      @publish-confluence="handlePublishConfluence"
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
        aria-orientation="vertical"
        tabindex="0"
        :aria-valuenow="splitterAriaValueNow"
        aria-valuemin="0"
        aria-valuemax="100"
        @mousedown="onSplitterMouseDown"
        @touchstart="onSplitterTouchStart"
        @keydown="onSplitterKeyDown"
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
      :theme-message="themeMessage"
      :theme-status="themeStatus"
    />

    <div
      v-if="exportProgress.active"
      class="export-progress-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="`导出 ${activeExportKind} 进度`"
    >
      <div class="export-progress-modal">
        <div class="export-progress-title">正在导出 {{ activeExportKind }}</div>
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
        <div v-if="exportCancelable" class="export-progress-actions">
          <button type="button" class="export-progress-button" @click="cancelExport">取消导出</button>
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
    <PublishConfluenceModal
      :is-open="isPublishConfluenceOpen"
      :is-running="publishProgress.running"
      :steps="publishProgress.steps"
      :success-message="publishProgress.successMessage"
      :error-message="publishProgress.errorMessage"
      :page-url="publishProgress.pageUrl"
      :warnings="publishProgress.warnings"
      @close="closePublishConfluenceModal"
      @open-page="handleOpenPublishedConfluencePage"
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

.editor-splitter:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
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
