<script setup lang="ts">
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import ConfluencePageTreeNode from './ConfluencePageTreeNode.vue'
import type { CmdResult, ConfluencePageNode, ConfluenceSpaceSummary } from '../lib/types'

const SPACE_KEY_PATTERN = /^([A-Za-z0-9_]+|~[A-Za-z0-9_\-:.]+)$/
const PARENT_PAGE_ID_PATTERN = /^[0-9]+$/
const SEARCH_DEBOUNCE_MS = 300

const props = defineProps<{
  baseUrl: string
  username: string
  ignoreSsl: boolean
  tokenOverride: string
  initialSpaceKey: string
  initialParentPageId: string
}>()

const emit = defineEmits<{
  (e: 'select', payload: { spaceKey: string; parentPageId: string; parentTitle: string }): void
}>()

const fetchArgs = computed(() => ({
  baseUrl: props.baseUrl,
  username: props.username.trim() || undefined,
  apiToken: props.tokenOverride.trim() || undefined,
  ignoreSsl: props.ignoreSsl,
}))

const currentSelectionLabel = computed(() => {
  if (!props.initialSpaceKey) return '尚未选择 Space'
  return `当前已保存：Space ${props.initialSpaceKey}，父页面 ${props.initialParentPageId || '（空间根目录）'}`
})

const keyword = ref('')
const searchResults = ref<ConfluenceSpaceSummary[]>([])
const searchLoading = ref(false)
const searchError = ref('')
let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined

const personalSpaceLoading = ref(false)
const personalSpaceError = ref('')

const selectedSpace = ref<ConfluenceSpaceSummary | null>(null)
const rootNodes = ref<ConfluencePageNode[]>([])
const treeLoading = ref(false)
const treeError = ref('')

const manualOpen = ref(false)
const manualTouched = ref(false)
const manualSpaceKey = ref(props.initialSpaceKey)
const manualParentPageId = ref(props.initialParentPageId)

const manualSpaceKeyError = computed(() => {
  if (!manualTouched.value) return ''
  const val = manualSpaceKey.value.trim()
  if (!val) return 'Space Key 为必填项'
  return SPACE_KEY_PATTERN.test(val) ? '' : 'Space Key 仅支持字母、数字、下划线，或个人空间格式 ~xxx'
})
const manualParentPageIdError = computed(() => {
  if (!manualTouched.value || !manualParentPageId.value.trim()) return ''
  return PARENT_PAGE_ID_PATTERN.test(manualParentPageId.value.trim())
    ? ''
    : 'Parent Page ID 仅支持数字'
})

function onKeywordInput() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    void runSearch()
  }, SEARCH_DEBOUNCE_MS)
}

async function runSearch() {
  searchLoading.value = true
  searchError.value = ''
  try {
    const res = await invoke<CmdResult<ConfluenceSpaceSummary[]>>('search_confluence_spaces', {
      ...fetchArgs.value,
      keyword: keyword.value.trim(),
    })
    if (res.ok && res.data) {
      searchResults.value = res.data
    } else {
      searchResults.value = []
      searchError.value = `搜索 Space 失败：${res.error || '未知错误'}`
    }
  } catch (err: any) {
    searchResults.value = []
    searchError.value = `搜索 Space 异常：${err?.message || '未知错误'}`
  } finally {
    searchLoading.value = false
  }
}

async function loadPersonalSpace() {
  personalSpaceLoading.value = true
  personalSpaceError.value = ''
  try {
    const res = await invoke<CmdResult<ConfluenceSpaceSummary>>(
      'get_confluence_personal_space',
      fetchArgs.value
    )
    if (res.ok && res.data) {
      selectSpace(res.data)
    } else {
      personalSpaceError.value = `未找到个人空间：${res.error || '未知错误'}`
    }
  } catch (err: any) {
    personalSpaceError.value = `获取个人空间异常：${err?.message || '未知错误'}`
  } finally {
    personalSpaceLoading.value = false
  }
}

function selectSpace(space: ConfluenceSpaceSummary) {
  selectedSpace.value = space
  rootNodes.value = []
  treeError.value = ''
  void loadRootPages()
}

async function loadRootPages() {
  const space = selectedSpace.value
  if (!space) return
  treeLoading.value = true
  treeError.value = ''
  try {
    const res = await invoke<CmdResult<ConfluencePageNode[]>>('list_confluence_space_root_pages', {
      ...fetchArgs.value,
      spaceKey: space.key,
    })
    if (res.ok && res.data) {
      rootNodes.value = res.data
    } else {
      rootNodes.value = []
      treeError.value = `加载页面树失败：${res.error || '未知错误'}`
    }
  } catch (err: any) {
    rootNodes.value = []
    treeError.value = `加载页面树异常：${err?.message || '未知错误'}`
  } finally {
    treeLoading.value = false
  }
}

function choosePage(node: ConfluencePageNode | null) {
  if (!selectedSpace.value) return
  emit('select', {
    spaceKey: selectedSpace.value.key,
    parentPageId: node?.id ?? '',
    parentTitle: node?.title || '（空间根目录）',
  })
}

function confirmManual() {
  manualTouched.value = true
  if (manualSpaceKeyError.value || manualParentPageIdError.value) return
  const parentPageId = manualParentPageId.value.trim()
  emit('select', {
    spaceKey: manualSpaceKey.value.trim(),
    parentPageId,
    parentTitle: parentPageId ? `页面 ID ${parentPageId}` : '（空间根目录）',
  })
}
</script>

<template>
  <div class="space-browser">
    <p class="selection-hint">{{ currentSelectionLabel }}</p>

    <div class="search-row">
      <input
        v-model="keyword"
        type="text"
        class="text-input"
        placeholder="输入 Space 名称或 Key 关键词搜索…"
        aria-label="搜索 Space"
        @input="onKeywordInput"
      />
      <button
        type="button"
        class="btn btn-secondary"
        :disabled="personalSpaceLoading"
        @click="loadPersonalSpace"
      >
        {{ personalSpaceLoading ? '加载中...' : '我的个人空间' }}
      </button>
    </div>
    <p v-if="personalSpaceError" class="error-text" role="alert">{{ personalSpaceError }}</p>

    <p v-if="searchLoading" class="hint-text">搜索中...</p>
    <p v-else-if="searchError" class="error-text" role="alert">{{ searchError }}</p>
    <ul v-else-if="searchResults.length > 0" class="space-result-list">
      <li v-for="space in searchResults" :key="space.key">
        <button type="button" class="space-result-btn" @click="selectSpace(space)">
          <span class="space-result-name">{{ space.name || space.key }}</span>
          <span class="space-result-key">{{ space.key }}</span>
        </button>
      </li>
    </ul>

    <div v-if="selectedSpace" class="tree-panel">
      <div class="tree-panel-header">
        <span>已选 Space：{{ selectedSpace.name || selectedSpace.key }}（{{ selectedSpace.key }}）</span>
        <button type="button" class="link-button" @click="choosePage(null)">
          不指定父页面，发布到空间根目录
        </button>
      </div>
      <p v-if="treeLoading" class="hint-text">加载页面树中...</p>
      <p v-else-if="treeError" class="error-text" role="alert">{{ treeError }}</p>
      <p v-else-if="rootNodes.length === 0" class="hint-text">该 Space 下暂无根级页面。</p>
      <ul v-else class="tree-root">
        <ConfluencePageTreeNode
          v-for="node in rootNodes"
          :key="node.id"
          :node="node"
          :depth="0"
          :fetch-args="fetchArgs"
          @choose="choosePage"
        />
      </ul>
    </div>

    <details class="manual-fallback" :open="manualOpen">
      <summary @click.prevent="manualOpen = !manualOpen">
        搜索或页面树不可用？手动输入 Space Key / Parent Page ID
      </summary>
      <div class="manual-fallback-body">
        <div class="field-group">
          <label class="field-label" for="confluence-manual-space-key">Space Key</label>
          <input
            id="confluence-manual-space-key"
            v-model="manualSpaceKey"
            type="text"
            class="text-input"
            placeholder="MY_SPACE"
            @blur="manualTouched = true"
          />
          <p v-if="manualSpaceKeyError" class="error-text" role="alert">{{ manualSpaceKeyError }}</p>
        </div>
        <div class="field-group">
          <label class="field-label" for="confluence-manual-parent-page-id">Parent Page ID（可留空）</label>
          <input
            id="confluence-manual-parent-page-id"
            v-model="manualParentPageId"
            type="text"
            class="text-input"
            placeholder="123456"
            @blur="manualTouched = true"
          />
          <p v-if="manualParentPageIdError" class="error-text" role="alert">{{ manualParentPageIdError }}</p>
        </div>
        <button type="button" class="btn btn-secondary" @click="confirmManual">
          使用手动输入的 Space / 页面
        </button>
      </div>
    </details>
  </div>
</template>

<style scoped>
.space-browser {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm, 8px);
}

.selection-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.search-row {
  display: flex;
  gap: var(--spacing-sm, 8px);
}

.text-input {
  flex: 1;
  width: 100%;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 4px);
  padding: var(--spacing-sm) var(--spacing-md);
  color: var(--color-text-primary);
  font-size: var(--font-size-body, 13px);
  outline: none;
  box-sizing: border-box;
}

.text-input:focus {
  border-color: var(--color-accent);
}

.space-result-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
}

.space-result-btn {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-sm, 8px);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 4px);
  padding: var(--spacing-sm) var(--spacing-md);
  color: var(--color-text-primary);
  cursor: pointer;
  text-align: left;
}

.space-result-btn:hover {
  border-color: var(--color-accent);
}

.space-result-key {
  color: var(--color-text-muted);
  font-size: 12px;
}

.tree-panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 4px);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm, 8px);
  background: var(--color-background);
}

.tree-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--spacing-sm, 8px);
  font-size: var(--font-size-body, 13px);
}

.tree-root {
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
}

.link-button {
  background: transparent;
  border: none;
  color: var(--color-accent);
  cursor: pointer;
  padding: 0;
  font-size: 12px;
  text-decoration: underline;
}

.manual-fallback {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 4px);
  padding: var(--spacing-sm) var(--spacing-md);
}

.manual-fallback summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-muted);
}

.manual-fallback-body {
  margin-top: var(--spacing-sm, 8px);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm, 8px);
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: var(--font-size-body, 13px);
  color: var(--color-text-primary);
}

.hint-text {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.error-text {
  margin: 0;
  font-size: 12px;
  color: var(--color-error, #f85149);
}

.btn {
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-body, 13px);
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.btn-secondary {
  background: var(--color-background-surface);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-border);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
