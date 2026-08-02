<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { standardKeymap, history, historyKeymap, undo, redo, selectAll } from '@codemirror/commands'
import type { ClipboardImagePayload } from '../lib/types'
import { isSupportedClipboardImageType } from '../lib/image-assets'
import { computeMinimalLineChange } from '../lib/source-editor-diff'

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
  (e: 'imagePaste', payload: ClipboardImagePayload): void
}>()

const containerRef = ref<HTMLElement | null>(null)
let view: EditorView | null = null
let isApplyingExternalUpdate = false
let positionTokenSeq = 0
// 跟踪的是粘贴发生瞬间的完整选区范围（from/to）与是否为折叠光标点位，
// 这样"粘贴图片时选中了一段文本"仍能像原生粘贴一样替换该选区；而折叠光标（无选区）
// 情形下用相同的映射偏向（bias）跟踪单点，避免同一位置发生的原生文本粘贴把单点
// "撑开"成一段范围，导致图片引用错误地替换掉刚插入的文本而非跟在其后。
const trackedPastePositions = new Map<number, { from: number; to: number; collapsed: boolean }>()

function releasePositionToken(token?: number) {
  if (token === undefined) {
    return
  }

  trackedPastePositions.delete(token)
}

function insertText(text: string, cursorOffset?: number, replaceSlashPrefix = false, positionToken?: number) {
  if (!view) return
  const trackedPosition = positionToken === undefined ? undefined : trackedPastePositions.get(positionToken)
  if (positionToken !== undefined && trackedPosition !== undefined) {
    trackedPastePositions.delete(positionToken)
  }

  const { from, to } = trackedPosition ?? view.state.selection.main
  
  let start = from
  if (replaceSlashPrefix && start > 0 && view.state.doc.sliceString(start - 1, start) === '/') {
    start = start - 1
  }

  isApplyingExternalUpdate = true
  if (replaceSlashPrefix) {
    const line = view.state.doc.lineAt(start)
    view.dispatch({
      changes: [
        { from: start, to },
        { from: line.from, insert: text },
      ],
      selection: cursorOffset
        ? { anchor: line.from + text.length - cursorOffset }
        : { anchor: line.from + text.length },
    })
  } else {
    view.dispatch({
      changes: { from: start, to, insert: text },
      selection: cursorOffset
        ? { anchor: start + text.length - cursorOffset }
        : { anchor: start + text.length },
    })
  }
  isApplyingExternalUpdate = false
  emit('update:modelValue', view.state.doc.toString())
  view.focus()
}

function insertTemplate(template: string, cursorOffset?: number) {
  insertText(template, cursorOffset, true)
}

function hasOtherPasteableClipboardContent(clipboardData: DataTransfer): boolean {
  const clipboardTypes = Array.from(clipboardData.types ?? [])
  const hasTextItem = clipboardTypes.includes('text/plain') && clipboardData.getData('text/plain').length > 0
  const hasHtmlItem = clipboardTypes.includes('text/html') && clipboardData.getData('text/html').length > 0
  return hasTextItem || hasHtmlItem
}

async function emitClipboardImage(event: ClipboardEvent): Promise<void> {
  const clipboardData = event.clipboardData
  if (!clipboardData || !view) {
    return
  }

  // 混合内容放行时，原生粘贴会用剪贴板文本/HTML 替换当前选区（一次 delete+insert
  // 变更，替换范围恰好等于原选区 from/to）。选区两端作为该变更的边界点，无论
  // mapPos 的 bias 取值都会分别映射到"替换前"（from）与"替换后"（to），因此继续
  // 追踪原始 {from, to} 会把原生刚插入的内容整体当作待替换范围，导致图片引用错误
  // 地吞掉它。此时应只追踪选区的 `to` 端点并当作折叠光标处理，让它随原生插入内容
  // 一起前移到其后，图片再跟在后面插入而不覆盖任何内容。仅当图片是剪贴板中唯一可
  // 粘贴内容（原生粘贴被 preventDefault，不会发生该替换）时，才保留原始选区范围，
  // 让图片按原有行为替换用户当时选中的文本。
  const nativeAlsoHandlesPaste = hasOtherPasteableClipboardContent(clipboardData)
  const positionToken = ++positionTokenSeq
  const selectionAtPaste = view.state.selection.main
  trackedPastePositions.set(positionToken, nativeAlsoHandlesPaste
    ? { from: selectionAtPaste.to, to: selectionAtPaste.to, collapsed: true }
    : {
      from: selectionAtPaste.from,
      to: selectionAtPaste.to,
      collapsed: selectionAtPaste.from === selectionAtPaste.to,
    })

  const items = Array.from(clipboardData.items ?? [])
  const matchedItem = items.find((item) => item.kind === 'file' && isSupportedClipboardImageType(item.type))
  const matchedFile = matchedItem?.getAsFile()
    ?? Array.from(clipboardData.files ?? []).find((file) => isSupportedClipboardImageType(file.type))

  if (!matchedFile || !isSupportedClipboardImageType(matchedFile.type)) {
    trackedPastePositions.delete(positionToken)
    return
  }

  const dataUrl = await new Promise<string | null>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.onabort = () => resolve(null)
    reader.readAsDataURL(matchedFile)
  })

  if (!dataUrl) {
    trackedPastePositions.delete(positionToken)
    // Reading the clipboard file failed (e.g. corrupted/unreadable blob) — abort silently.
    return
  }

  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) {
    trackedPastePositions.delete(positionToken)
    return
  }

  emit('imagePaste', {
    mimeType: matchedFile.type,
    bytes: dataUrl.slice(commaIndex + 1),
    positionToken,
  })
}

defineExpose({
  insertTemplate,
  insertText,
  releasePositionToken,
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
        paste(event) {
          const clipboardData = event.clipboardData
          if (!clipboardData) {
            return false
          }

          const hasImage = Array.from(clipboardData.items ?? []).some(
            (item) => item.kind === 'file' && isSupportedClipboardImageType(item.type),
          ) || Array.from(clipboardData.files ?? []).some((file) => isSupportedClipboardImageType(file.type))

          if (!hasImage) {
            return false
          }

          const hasOtherPasteableContent = hasOtherPasteableClipboardContent(clipboardData)
          // 仅供 E2E 断言本处理器是否命中过 preventDefault 分支。
          const containerEl = containerRef.value as ((HTMLElement & { __lastImagePastePreventedDefault?: boolean }) | null)
          if (containerEl) {
            containerEl.__lastImagePastePreventedDefault = !hasOtherPasteableContent
          }

          if (!hasOtherPasteableContent) {
            event.preventDefault()
          }
          void emitClipboardImage(event)
          return !hasOtherPasteableContent
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          for (const [token, range] of trackedPastePositions) {
            // 折叠光标（无选区）用相同 bias 映射两端，保持其始终是单点，跟随插入内容
            // 前移（等同用户在该处继续输入时光标的自然行为）；有选区时用 -1/+1，使
            // 选区边界处发生的插入被视为"落在选区内"，选区随之正确扩展/收缩。
            const bias = range.collapsed ? 1 : -1
            trackedPastePositions.set(token, {
              from: update.changes.mapPos(range.from, bias),
              to: update.changes.mapPos(range.to, 1),
              collapsed: range.collapsed,
            })
          }
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
      delete containerEl.__lastImagePastePreventedDefault
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

    trackedPastePositions.clear()
    isApplyingExternalUpdate = true
    const change = computeMinimalLineChange(current, next ?? '', (offset) => view!.state.doc.lineAt(offset))
    view.dispatch({
      changes: change ?? {
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
