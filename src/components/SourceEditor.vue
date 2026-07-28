<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { standardKeymap, history, historyKeymap, undo, redo, selectAll } from '@codemirror/commands'

export interface CursorPosition {
  line: number
  column: number
}

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'cursorChange', pos: CursorPosition): void
  (e: 'slashTrigger', position: { top: number; left: number }): void
}>()

const containerRef = ref<HTMLElement | null>(null)
let view: EditorView | null = null
let isApplyingExternalUpdate = false

function insertTemplate(template: string, cursorOffset?: number) {
  if (!view) return
  const { from, to } = view.state.selection.main
  
  // 检查光标前是否为 '/' 字符，若是则替换
  let start = from
  if (start > 0 && view.state.doc.sliceString(start - 1, start) === '/') {
    start = start - 1
  }

  isApplyingExternalUpdate = true
  view.dispatch({
    changes: { from: start, to, insert: template },
    selection: cursorOffset
      ? { anchor: start + template.length - cursorOffset }
      : { anchor: start + template.length },
  })
  isApplyingExternalUpdate = false
  emit('update:modelValue', view.state.doc.toString())
  view.focus()
}

defineExpose({
  insertTemplate,
})

function createState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      keymap.of(standardKeymap),
      history(),
      keymap.of(historyKeymap),
      EditorView.lineWrapping,
      placeholder('按 / 键快速插入 markdown 格式'),
      EditorView.domEventHandlers({
        keydown(event, view) {
          if (event.key === '/') {
            const head = view.state.selection.main.head
            const coords = view.coordsAtPos(head)
            if (coords) {
              const menuHeight = 280
              const spaceBelow = window.innerHeight - coords.bottom
              const top = spaceBelow < menuHeight
                ? Math.max(10, coords.top - menuHeight - 4)
                : coords.bottom + 4
              const left = Math.min(coords.left, window.innerWidth - 240)
              emit('slashTrigger', { top, left })
            }
          }
          return false
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          emit('update:modelValue', update.state.doc.toString())
        }
        if (update.selectionSet && !isApplyingExternalUpdate) {
          const pos = update.state.selection.main.head
          const line = update.state.doc.lineAt(pos)
          emit('cursorChange', {
            line: line.number,
            column: pos - line.from + 1,
          })
        }
      }),
    ],
  })
}

onMounted(() => {
  if (!containerRef.value) return

  view = new EditorView({
    state: createState(props.modelValue ?? ''),
    parent: containerRef.value,
  })

  // 暴露 CodeMirror 实例与常用命令供 E2E 测试访问，不影响生产功能
  const containerEl = containerRef.value as any
  containerEl.__codemirrorView = view
  containerEl.__codemirrorCommands = { undo, redo, selectAll }

  view.focus()
})

onUnmounted(() => {
  if (view) {
    const containerEl = containerRef.value as any
    if (containerEl) {
      delete containerEl.__codemirrorView
      delete containerEl.__codemirrorCommands
    }
    view.destroy()
    view = null
  }
})

watch(
  () => props.modelValue,
  (next) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (next === current) return

    isApplyingExternalUpdate = true
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: next ?? '',
      },
    })
    isApplyingExternalUpdate = false
  },
)
</script>

<template>
  <div ref="containerRef" class="source-editor" role="textbox" aria-label="Markdown 源码编辑器" aria-multiline="true"></div>
</template>

<style scoped>
.source-editor {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.source-editor :deep(.cm-editor) {
  height: 100%;
  background-color: var(--color-background);
  color: var(--color-text-primary);
  font-family: var(--font-body-mono);
  font-size: var(--font-size-body);
  line-height: var(--line-height-relaxed);
}

.source-editor :deep(.cm-scroller) {
  font-family: var(--font-body-mono);
  line-height: var(--line-height-relaxed);
}

.source-editor :deep(.cm-content) {
  caret-color: var(--color-text-primary);
  padding: var(--spacing-xl);
}

.source-editor :deep(.cm-content ::selection),
.source-editor :deep(.cm-content::selection) {
  background-color: var(--color-selection);
}

.source-editor :deep(.cm-selectionBackground) {
  background-color: var(--color-selection) !important;
}

.source-editor :deep(.cm-focused .cm-selectionBackground) {
  background-color: var(--color-selection) !important;
}

.source-editor :deep(.cm-cursor) {
  border-left-color: var(--color-text-primary);
}

.source-editor :deep(.cm-activeLine) {
  background-color: transparent;
}

.source-editor :deep(.cm-gutters) {
  display: none;
}
</style>
