<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { convertFileSrc } from '@tauri-apps/api/core'
import { renderMarkdown } from '../lib/markdown'
import { isRelativeAssetPath, resolveRelativeAssetPath } from '../lib/image-assets'
import { decoratePreviewHtml, getResponsivePreviewStyle, resolveResponsiveLayout, type PreviewLayout } from '../lib/preview'

const props = defineProps<{
  content: string
  documentBaseDir?: string | null
}>()

const emit = defineEmits<{
  (e: 'toggle-task', index: number): void
}>()

const previewPaneRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
const responsiveLayout = ref<PreviewLayout>('wide')

let resizeObserver: ResizeObserver | null = null
let resizeRafId: number | null = null
let pendingObservedWidth = 0

function renderPreviewHtml(rawHtml: string): string {
  return decoratePreviewHtml(rawHtml, {
    transformImageSrc: (source) => {
      if (!props.documentBaseDir || !isRelativeAssetPath(source)) {
        return null
      }

      const absolutePath = resolveRelativeAssetPath(props.documentBaseDir, source)
      return convertFileSrc(absolutePath)
    },
  })
}

function applyResponsiveLayout(width: number) {
  containerWidth.value = Math.max(0, Math.round(width))
  responsiveLayout.value = resolveResponsiveLayout(width)
}

function scheduleResponsiveLayout(width: number) {
  pendingObservedWidth = width

  if (resizeRafId !== null) {
    cancelAnimationFrame(resizeRafId)
  }

  resizeRafId = requestAnimationFrame(() => {
    applyResponsiveLayout(pendingObservedWidth)
    resizeRafId = null
  })
}

const renderResult = computed(() => renderMarkdown(props.content))
const html = computed(() => renderPreviewHtml(renderResult.value.html))
const currentTaskNonce = computed(() => renderResult.value.taskNonce)
const isEmpty = computed(() => !props.content || props.content.trim() === '')
const responsiveStyle = computed<Record<string, string>>(() => getResponsivePreviewStyle(responsiveLayout.value))

// TODO: i18n — extract to locale key (e.g. 'preview.emptyState')
const EMPTY_STATE_TEXT = '开始输入 Markdown，右侧将实时预览。'

function onPreviewClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) {
    return
  }

  const checkbox = target.closest('input[type="checkbox"][data-task-index]')
  if (checkbox instanceof HTMLInputElement) {
    event.preventDefault()
    // 校验 nonce：只信任本次渲染由 renderMarkdown 生成的 checkbox，
    // 防止用户在 Markdown 源码里手写伪造的 <input data-task-index> 触发误翻转。
    if (checkbox.dataset.taskNonce !== currentTaskNonce.value || !currentTaskNonce.value) {
      return
    }
    const index = Number(checkbox.dataset.taskIndex)
    if (Number.isInteger(index)) {
      emit('toggle-task', index)
    }
    return
  }

  const link = target.closest('a')
  if (link) {
    event.preventDefault()
  }
}

onMounted(() => {
  if (!previewPaneRef.value) {
    return
  }

  applyResponsiveLayout(previewPaneRef.value.clientWidth)

  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) {
      return
    }

    scheduleResponsiveLayout(entry.contentRect.width)
  })

  resizeObserver.observe(previewPaneRef.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null

  if (resizeRafId !== null) {
    cancelAnimationFrame(resizeRafId)
    resizeRafId = null
  }
})
</script>

<template>
  <div
    ref="previewPaneRef"
    class="preview-pane-inner"
    aria-label="实时预览"
    role="region"
    aria-live="off"
    :data-preview-layout="responsiveLayout"
    :data-preview-width="containerWidth"
    :style="responsiveStyle"
    @click="onPreviewClick"
  >
    <div v-if="isEmpty" class="empty-state">
      {{ EMPTY_STATE_TEXT }}
    </div>
    <div v-else class="preview-content" v-html="html"></div>
  </div>
</template>

<style scoped>
.preview-pane-inner {
  --preview-body-font-size: var(--font-size-body);
  --preview-heading-font-size: var(--font-size-heading);
  --preview-padding: var(--spacing-xl);
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--color-background-surface);
  color: var(--color-text-primary);
  font-family: var(--font-body);
  font-size: var(--preview-body-font-size);
  line-height: var(--line-height-relaxed);
  padding: var(--preview-padding);
  user-select: text;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.preview-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  font-size: var(--font-size-body);
  text-align: center;
}

.preview-content :deep(h1),
.preview-content :deep(h2),
.preview-content :deep(h3),
.preview-content :deep(h4),
.preview-content :deep(h5),
.preview-content :deep(h6) {
  border-bottom: 1px solid var(--color-border);
  padding-bottom: var(--spacing-sm);
  margin-top: var(--spacing-xl);
  margin-bottom: var(--spacing-md);
  font-family: var(--font-heading);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
  color: var(--color-text-primary);
}

.preview-content :deep(h1) {
  font-size: var(--preview-heading-font-size);
}

.preview-content :deep(h2) {
  font-size: calc(var(--preview-heading-font-size) - 1px);
}

.preview-content :deep(h3) {
  font-size: calc(var(--preview-heading-font-size) - 2px);
  border-bottom: none;
}

.preview-content :deep(h4),
.preview-content :deep(h5),
.preview-content :deep(h6) {
  font-size: var(--font-size-body);
  border-bottom: none;
}

.preview-content :deep(p) {
  margin: var(--spacing-md) 0;
  color: var(--color-text-primary);
}

.preview-content :deep(ul),
.preview-content :deep(ol) {
  margin: var(--spacing-md) 0;
  padding-left: var(--spacing-lg);
}

.preview-content :deep(li) {
  margin: var(--spacing-sm) 0;
}

.preview-content :deep(input[type='checkbox'][data-task-nonce]) {
  cursor: pointer;
  inline-size: 16px;
  block-size: 16px;
}

.preview-content :deep(pre) {
  display: block;
  max-width: 100%;
  min-width: 0;
  background: var(--color-code-background);
  border-radius: var(--rounded-md);
  padding: var(--spacing-md);
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
  margin: var(--spacing-md) 0;
}

.preview-content :deep(code) {
  font-family: var(--font-body-mono);
  font-size: var(--preview-body-font-size);
  background: var(--color-code-background);
  border-radius: var(--rounded-sm);
  /* DESIGN.md 指定行内代码内边距为 2px 5px，无匹配 spacing token（最小 --spacing-xs = 4px） */
  padding: 2px 5px;
}

.preview-content :deep(pre code) {
  padding: 0;
  background: transparent;
  border-radius: 0;
}

.preview-content :deep(blockquote) {
  border-left: 3px solid var(--color-accent);
  padding-left: var(--spacing-lg);
  margin: var(--spacing-md) 0;
  color: var(--color-text-secondary);
}

.preview-content :deep(a) {
  color: var(--color-accent);
  text-decoration: none;
}

.preview-content :deep(a:hover) {
  text-decoration: underline;
}

.preview-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: var(--spacing-xl) 0;
}

.preview-content :deep(strong) {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.preview-content :deep(em) {
  font-style: italic;
  color: var(--color-text-primary);
}

.preview-content :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
}

.preview-content :deep(.preview-table-scroll) {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.preview-content :deep(table) {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  margin: var(--spacing-md) 0;
  font-size: var(--preview-body-font-size);
}

.preview-content :deep(th),
.preview-content :deep(td) {
  border: 1px solid var(--color-border);
  padding: var(--spacing-sm) var(--spacing-md);
}

.preview-content :deep(th) {
  background: rgba(255, 255, 255, 0.05);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.preview-content :deep(tr:nth-child(even)) {
  background: rgba(255, 255, 255, 0.02);
}

.preview-content :deep(pre::-webkit-scrollbar),
.preview-content :deep(.preview-table-scroll::-webkit-scrollbar) {
  width: 6px;
  height: 6px;
}

.preview-content :deep(pre::-webkit-scrollbar-track),
.preview-content :deep(.preview-table-scroll::-webkit-scrollbar-track) {
  background: transparent;
}

.preview-content :deep(pre::-webkit-scrollbar-thumb),
.preview-content :deep(.preview-table-scroll::-webkit-scrollbar-thumb) {
  background: var(--color-border);
  border-radius: var(--rounded-full);
}

.preview-content :deep(pre::-webkit-scrollbar-thumb:hover),
.preview-content :deep(.preview-table-scroll::-webkit-scrollbar-thumb:hover) {
  background: var(--color-text-muted);
}
</style>
