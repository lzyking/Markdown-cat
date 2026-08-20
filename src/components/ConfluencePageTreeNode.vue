<script setup lang="ts">
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { CmdResult, ConfluencePageNode } from '../lib/types'

const props = defineProps<{
  node: ConfluencePageNode
  depth: number
  fetchArgs: { baseUrl: string; username?: string; apiToken?: string; ignoreSsl: boolean }
}>()

const emit = defineEmits<{
  (e: 'choose', node: ConfluencePageNode): void
}>()

const expanded = ref(false)
const loading = ref(false)
const error = ref('')
const children = ref<ConfluencePageNode[] | null>(null)

async function toggle() {
  expanded.value = !expanded.value
  if (!expanded.value || children.value !== null || loading.value) return

  loading.value = true
  error.value = ''
  try {
    const res = await invoke<CmdResult<ConfluencePageNode[]>>('list_confluence_page_children', {
      ...props.fetchArgs,
      pageId: props.node.id,
    })
    if (res.ok && res.data) {
      children.value = res.data
    } else {
      children.value = []
      error.value = `加载子页面失败：${res.error || '未知错误'}`
    }
  } catch (err: any) {
    children.value = []
    error.value = `加载子页面异常：${err?.message || '未知错误'}`
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <li class="tree-node">
    <div class="tree-node-row" :style="{ paddingLeft: `${depth * 16}px` }">
      <button
        type="button"
        class="tree-expand-btn"
        :aria-expanded="expanded"
        :aria-label="expanded ? '收起子页面' : '展开子页面'"
        @click="toggle"
      >
        {{ expanded ? '▾' : '▸' }}
      </button>
      <button type="button" class="tree-node-label" @click="emit('choose', node)">
        {{ node.title || '（无标题）' }}
      </button>
    </div>
    <p
      v-if="loading"
      class="tree-hint"
      :style="{ paddingLeft: `${(depth + 1) * 16}px` }"
    >
      加载中...
    </p>
    <p
      v-else-if="error"
      class="tree-hint tree-hint-error"
      :style="{ paddingLeft: `${(depth + 1) * 16}px` }"
    >
      {{ error }}
    </p>
    <p
      v-else-if="expanded && children && children.length === 0"
      class="tree-hint"
      :style="{ paddingLeft: `${(depth + 1) * 16}px` }"
    >
      无子页面
    </p>
    <ul v-if="expanded && children && children.length > 0" class="tree-children">
      <ConfluencePageTreeNode
        v-for="child in children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :fetch-args="fetchArgs"
        @choose="(n) => emit('choose', n)"
      />
    </ul>
  </li>
</template>

<style scoped>
.tree-node {
  list-style: none;
}

.tree-node-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tree-expand-btn {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  width: 18px;
  padding: 0;
  font-size: 11px;
}

.tree-node-label {
  background: transparent;
  border: none;
  color: var(--color-text-primary);
  cursor: pointer;
  text-align: left;
  padding: 2px 4px;
  font-size: var(--font-size-body, 13px);
  border-radius: var(--radius-sm, 4px);
}

.tree-node-label:hover {
  background: var(--color-border);
}

.tree-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.tree-hint-error {
  color: var(--color-error, #f85149);
}

.tree-children {
  margin: 0;
  padding: 0;
}
</style>
