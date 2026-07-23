<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../lib/markdown'

const props = defineProps<{
  content: string
}>()

const html = computed(() => renderMarkdown(props.content))
const isEmpty = computed(() => !props.content || props.content.trim() === '')

// TODO: i18n — extract to locale key (e.g. 'preview.emptyState')
const EMPTY_STATE_TEXT = '开始输入 Markdown，右侧将实时预览。'

function onPreviewClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  const link = target.closest('a')
  if (!link) {
    return
  }

  event.preventDefault()
}
</script>

<template>
  <div
    class="preview-pane-inner"
    aria-label="实时预览"
    role="region"
    aria-live="off"
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
  width: 100%;
  height: 100%;
  overflow: auto;
  background: var(--color-background-surface);
  color: var(--color-text-primary);
  font-family: var(--font-body);
  font-size: var(--font-size-body);
  line-height: var(--line-height-relaxed);
  padding: var(--spacing-xl);
  user-select: text;
  word-break: break-word;
  overflow-wrap: anywhere;
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
  font-size: var(--font-size-heading);
}

.preview-content :deep(h2) {
  font-size: calc(var(--font-size-heading) - 1px);
}

.preview-content :deep(h3) {
  font-size: calc(var(--font-size-heading) - 2px);
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

.preview-content :deep(pre) {
  background: var(--color-code-background);
  border-radius: var(--rounded-md);
  padding: var(--spacing-md);
  overflow: auto;
  margin: var(--spacing-md) 0;
}

.preview-content :deep(code) {
  font-family: var(--font-body-mono);
  font-size: var(--font-size-body);
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
</style>
