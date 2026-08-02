<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

export interface SlashMenuItem {
  id: string
  label: string
  shortcut: string
  template: string
  cursorOffset?: number
}

defineProps<{
  position: { top: number; left: number }
}>()

const emit = defineEmits<{
  (e: 'select', item: SlashMenuItem): void
  (e: 'close'): void
}>()

const items: SlashMenuItem[] = [
  { id: 'h1', label: 'H1 一级标题', shortcut: '# ', template: '# ' },
  { id: 'h2', label: 'H2 二级标题', shortcut: '## ', template: '## ' },
  { id: 'h3', label: 'H3 三级标题', shortcut: '### ', template: '### ' },
  { id: 'bold', label: '加粗文本', shortcut: '**粗体**', template: '**粗体文本**', cursorOffset: 2 },
  { id: 'italic', label: '斜体文本', shortcut: '*斜体*', template: '*斜体文本*', cursorOffset: 1 },
  { id: 'quote', label: '引用段落', shortcut: '> ', template: '> ' },
  { id: 'codeblock', label: '代码块', shortcut: '```', template: '```\n\n```', cursorOffset: 4 },
  { id: 'ul', label: '无序列表', shortcut: '- ', template: '- ' },
  { id: 'ol', label: '有序列表', shortcut: '1. ', template: '1. ' },
  { id: 'task', label: 'Task List 任务列表', shortcut: '- [ ] ', template: '- [ ] ' },
]

const selectedIndex = ref(0)

function select(item: SlashMenuItem) {
  emit('select', item)
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % items.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value - 1 + items.length) % items.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    select(items[selectedIndex.value])
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown, true)
})
</script>

<template>
  <div
    class="slash-menu"
    :style="{ top: `${position.top}px`, left: `${position.left}px` }"
    role="menu"
    aria-label="快捷插入 Markdown 菜单"
  >
    <div class="slash-menu-header">快捷插入 Markdown</div>
    <div
      v-for="(item, idx) in items"
      :key="item.id"
      class="slash-menu-item"
      :class="{ active: idx === selectedIndex }"
      @click="select(item)"
      @mouseenter="selectedIndex = idx"
      role="menuitem"
    >
      <span class="label">{{ item.label }}</span>
      <span class="shortcut">{{ item.shortcut }}</span>
    </div>
  </div>
</template>

<style scoped>
.slash-menu {
  position: absolute;
  z-index: 1000;
  width: 220px;
  max-height: 280px;
  overflow-y: auto;
  background: var(--color-background-elevated, #25282e);
  border: 1px solid var(--color-border, #3a3f4b);
  border-radius: var(--rounded-md, 6px);
  box-shadow: var(--shadow-menu);
  padding: 4px;
}

.slash-menu-header {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  padding: 6px 8px 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.slash-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--color-text-primary, #e1e4ea);
  cursor: pointer;
  transition: background 0.15s ease;
}

.slash-menu-item.active,
.slash-menu-item:hover {
  background: var(--color-background-surface, #323742);
}

.shortcut {
  font-family: var(--font-body-mono, monospace);
  font-size: 11px;
  color: var(--color-text-muted);
  background: var(--color-overlay-shortcut);
  padding: 2px 5px;
  border-radius: 3px;
}
</style>
