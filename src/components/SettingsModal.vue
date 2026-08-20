<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref, watch, type ComponentPublicInstance } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { withDirtyTrackingSuppressed } from '../lib/confluence-dirty-guard'
import ConfluenceSpaceBrowser from './ConfluenceSpaceBrowser.vue'
import type {
  CmdResult,
  ConfluenceConfig,
  ConfluencePatConnectionResult,
  ConfluenceTokenStatus,
  Md2cfCheckResult,
} from '../lib/types'

const tabOrder = ['general', 'confluence'] as const
export type SettingsTab = (typeof tabOrder)[number]

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    currentPath: string
    initialTab?: SettingsTab
  }>(),
  {
    initialTab: 'general',
  }
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update-path', newPath: string): void
}>()

const activeTab = ref<SettingsTab>('general')
const selectedPath = ref('')
const errorMessage = ref('')
const confluenceErrorMessage = ref('')
const confluenceSuccessMessage = ref('')
const tokenInput = ref('')
const hasStoredToken = ref(false)
const isSavingConfluence = ref(false)
const isClearingToken = ref(false)
const isClearingAllConfluenceSettings = ref(false)
const isTestingConnection = ref(false)
const md2cfMessage = ref('')
const md2cfInstalled = ref<boolean | null>(null)
const connectionMessage = ref('')
const connectionSucceeded = ref<boolean | null>(null)
const baseUrlTouched = ref(false)
const confluenceFormDirty = ref(false)
const suppressConfluenceDirtyTracking = ref(false)
const tabButtonRefs = ref<Array<HTMLButtonElement | null>>([])
const confluenceStep = ref<'connection' | 'browse'>('connection')
const patCurrentUserDisplayName = ref('')
const advancedOptionsOpen = ref(false)
const diagnosticsOpen = ref(false)

const loadedConfluenceConfig = ref<{ baseUrl: string; username: string }>({
  baseUrl: '',
  username: '',
})

const confluenceForm = reactive<ConfluenceConfig>({
  baseUrl: '',
  username: '',
  spaceKey: '',
  parentPageId: '',
  ignoreSsl: false,
})

watch(
  confluenceForm,
  () => {
    if (!suppressConfluenceDirtyTracking.value) {
      confluenceFormDirty.value = true
    }
  },
  { deep: true, flush: 'sync' }
)

const tokenPlaceholder = computed(() =>
  hasStoredToken.value ? '已保存令牌；留空则保持不变' : '请输入 API Token 或 Personal Access Token'
)

function isValidUrl(urlStr: string): boolean {
  const trimmed = urlStr.trim()
  if (!trimmed) return false
  if (!/^https?:\/\//i.test(trimmed)) return false
  try {
    const parsed = new URL(trimmed)
    return !!parsed.host
  } catch {
    return false
  }
}

const baseUrlError = computed(() => {
  if (!baseUrlTouched.value) return ''
  const val = confluenceForm.baseUrl.trim()
  if (!val) return 'Base URL 为必填项'
  if (!isValidUrl(val)) return 'Base URL 必须为有效的 http:// 或 https:// 地址'
  return ''
})

const isCredentialsServerChanged = computed(() => {
  if (!hasStoredToken.value) return false
  if (!loadedConfluenceConfig.value.baseUrl && !loadedConfluenceConfig.value.username) return false
  const currentUrl = confluenceForm.baseUrl.trim().replace(/\/+$/, '')
  const loadedUrl = loadedConfluenceConfig.value.baseUrl.trim().replace(/\/+$/, '')
  const currentUsername = confluenceForm.username.trim()
  const loadedUsername = loadedConfluenceConfig.value.username.trim()

  const urlChanged = currentUrl !== '' && currentUrl !== loadedUrl
  const userChanged = currentUsername !== '' && currentUsername !== loadedUsername
  return (urlChanged || userChanged) && !tokenInput.value.trim()
})

const confluenceBusy = computed(
  () => isSavingConfluence.value || isClearingToken.value || isTestingConnection.value
)

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      activeTab.value = props.initialTab || 'general'
      selectedPath.value = ''
      errorMessage.value = ''
      resetConfluenceMessages()
      window.addEventListener('keydown', onKeydown)
      void loadConfluenceSettings()
    } else {
      resetConfluenceMessages()
      window.removeEventListener('keydown', onKeydown)
    }
  },
  { immediate: true }
)

function resetConfluenceMessages() {
  confluenceErrorMessage.value = ''
  confluenceSuccessMessage.value = ''
  connectionMessage.value = ''
  connectionSucceeded.value = null
  patCurrentUserDisplayName.value = ''
  md2cfMessage.value = ''
  md2cfInstalled.value = null
  tokenInput.value = ''
  baseUrlTouched.value = false
  confluenceStep.value = 'connection'
  advancedOptionsOpen.value = false
  diagnosticsOpen.value = false
  withDirtyTrackingSuppressed(suppressConfluenceDirtyTracking, () => {
    confluenceForm.baseUrl = ''
    confluenceForm.username = ''
    confluenceForm.spaceKey = ''
    confluenceForm.parentPageId = ''
    confluenceForm.ignoreSsl = false
  })
  confluenceFormDirty.value = false
  loadedConfluenceConfig.value = { baseUrl: '', username: '' }
}

function applyConfluenceConfig(config?: Partial<ConfluenceConfig>) {
  withDirtyTrackingSuppressed(suppressConfluenceDirtyTracking, () => {
    confluenceForm.baseUrl = config?.baseUrl ?? ''
    confluenceForm.username = config?.username ?? ''
    confluenceForm.spaceKey = config?.spaceKey ?? ''
    confluenceForm.parentPageId = config?.parentPageId ?? ''
    confluenceForm.ignoreSsl = config?.ignoreSsl ?? false
  })
  confluenceFormDirty.value = false

  if (config) {
    loadedConfluenceConfig.value = {
      baseUrl: config.baseUrl ?? '',
      username: config.username ?? '',
    }
  }
}

async function loadConfluenceSettings() {
  // Use allSettled so a failure/throw on either call cannot discard data already
  // fetched by the other (e.g. a token-status error must not blank out a
  // successfully loaded Confluence config).
  const [configOutcome, tokenStatusOutcome] = await Promise.allSettled([
    invoke<CmdResult<{ confluence?: ConfluenceConfig }>>('get_config'),
    invoke<CmdResult<ConfluenceTokenStatus>>('get_confluence_token_status'),
  ])

  if (configOutcome.status === 'fulfilled' && configOutcome.value.ok) {
    if (!confluenceFormDirty.value) {
      applyConfluenceConfig(configOutcome.value.data?.confluence)
    }
  } else {
    if (!confluenceFormDirty.value) {
      applyConfluenceConfig()
    }
    const reason =
      configOutcome.status === 'fulfilled'
        ? configOutcome.value.error
        : configOutcome.reason?.message
    confluenceErrorMessage.value = `读取 Confluence 配置失败：${reason || '未知错误'}`
  }

  if (tokenStatusOutcome.status === 'fulfilled' && tokenStatusOutcome.value.ok) {
    hasStoredToken.value = !!tokenStatusOutcome.value.data?.hasToken
  } else {
    hasStoredToken.value = false
    const reason =
      tokenStatusOutcome.status === 'fulfilled'
        ? tokenStatusOutcome.value.error
        : tokenStatusOutcome.reason?.message
    confluenceErrorMessage.value = `读取令牌状态失败：${reason || '未知错误'}`
  }

  if (!confluenceFormDirty.value) {
    confluenceStep.value = confluenceForm.baseUrl.trim() ? 'browse' : 'connection'
    if (confluenceStep.value === 'browse') {
      void onTestPatConnection()
    }
  }
}

function onKeydown(e: KeyboardEvent) {
  if (props.isOpen && e.key === 'Escape') {
    onClose()
  }
}

function setTabButtonRef(index: number, element: Element | ComponentPublicInstance | null) {
  tabButtonRefs.value[index] = element instanceof HTMLButtonElement ? element : null
}

function focusTabButton(tab: SettingsTab) {
  const index = tabOrder.indexOf(tab)
  void nextTick(() => {
    tabButtonRefs.value[index]?.focus()
  })
}

function setActiveTab(tab: SettingsTab, options?: { focus?: boolean }) {
  activeTab.value = tab
  if (options?.focus) {
    focusTabButton(tab)
  }
}

function onTabKeydown(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    return
  }
  // Ignore modified key presses (e.g. Cmd/Ctrl+Arrow, Alt+Arrow) so browser/OS/assistive-tech
  // shortcuts that happen to share these keys are not hijacked by tab switching.
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return
  }

  event.preventDefault()

  const currentIndex = tabOrder.indexOf(activeTab.value)
  let nextIndex = currentIndex

  switch (event.key) {
    case 'ArrowLeft':
      nextIndex = (currentIndex - 1 + tabOrder.length) % tabOrder.length
      break
    case 'ArrowRight':
      nextIndex = (currentIndex + 1) % tabOrder.length
      break
    case 'Home':
      nextIndex = 0
      break
    case 'End':
      nextIndex = tabOrder.length - 1
      break
  }

  setActiveTab(tabOrder[nextIndex], { focus: true })
}

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

function onClose() {
  selectedPath.value = ''
  errorMessage.value = ''
  resetConfluenceMessages()
  emit('close')
}

async function onSelect() {
  errorMessage.value = ''
  try {
    let folderPath: string | null = null

    if ((window as any).__TAURI_MOCK__) {
      const res = await invoke<CmdResult<string>>('select_save_dir')
      if (res.ok && res.data) {
        folderPath = res.data
      }
    } else {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: '选择默认 Markdown 保存目录',
      })
      if (selected && typeof selected === 'string') {
        folderPath = selected
      }
    }

    if (folderPath) {
      selectedPath.value = folderPath
    }
  } catch (err: any) {
    errorMessage.value = `选择路径异常：${err?.message || '未知错误'}`
  }
}

async function onConfirm() {
  if (activeTab.value === 'general') {
    await onConfirmGeneral()
    return
  }

  if (confluenceStep.value === 'connection') {
    await onSaveConnection()
  } else {
    onClose()
  }
}

async function onConfirmGeneral() {
  if (!selectedPath.value) return
  errorMessage.value = ''
  try {
    const res = await invoke<CmdResult<null>>('set_config', {
      savePath: selectedPath.value,
    })
    if (res.ok) {
      emit('update-path', selectedPath.value)
      onClose()
    } else {
      errorMessage.value = `配置保存失败：${res.error || '未知错误'}`
    }
  } catch (err: any) {
    errorMessage.value = `配置保存异常：${err?.message || '系统错误'}`
  }
}

async function onSaveConnection() {
  baseUrlTouched.value = true
  resetConfluenceFeedback()
  if (baseUrlError.value) {
    confluenceErrorMessage.value = '请先修正 Confluence 配置中的格式错误'
    return
  }

  isSavingConfluence.value = true
  try {
    const configRes = await invoke<CmdResult<null>>('set_confluence_config', {
      confluence: {
        baseUrl: confluenceForm.baseUrl.trim(),
        username: confluenceForm.username.trim(),
        spaceKey: confluenceForm.spaceKey.trim(),
        parentPageId: confluenceForm.parentPageId.trim(),
        ignoreSsl: confluenceForm.ignoreSsl,
      },
    })

    if (!configRes.ok) {
      confluenceErrorMessage.value = `Confluence 配置保存失败：${configRes.error || '未知错误'}`
      return
    }

    const nextToken = tokenInput.value.trim()
    if (nextToken) {
      const tokenRes = await invoke<CmdResult<null>>('set_confluence_token', {
        apiToken: nextToken,
      })
      if (!tokenRes.ok) {
        confluenceErrorMessage.value = `Confluence 配置已保存，但安全令牌保存失败：${tokenRes.error || '未知错误'}`
        return
      }
      tokenInput.value = ''
      // 以独立的 get_confluence_token_status 读取作为真实持久化依据，而非乐观地假定写入成功就一定可读回。
      const statusRes = await invoke<CmdResult<ConfluenceTokenStatus>>('get_confluence_token_status')
      hasStoredToken.value = statusRes.ok ? !!statusRes.data?.hasToken : false
      if (!hasStoredToken.value) {
        confluenceErrorMessage.value =
          'Token 写入请求返回成功，但随后独立读取确认未找到已保存的令牌（可能为系统安全存储访问问题）。'
        return
      }
    }

    confluenceSuccessMessage.value = 'Confluence 连接信息已保存'
    confluenceStep.value = 'browse'
    void onTestPatConnection()
  } catch (err: any) {
    confluenceErrorMessage.value = `Confluence 配置保存异常：${err?.message || '系统错误'}`
  } finally {
    isSavingConfluence.value = false
  }
}

function onEditConnection() {
  confluenceStep.value = 'connection'
}

async function onSpaceBrowserSelect(payload: {
  spaceKey: string
  parentPageId: string
  parentTitle: string
}) {
  resetConfluenceFeedback()
  withDirtyTrackingSuppressed(suppressConfluenceDirtyTracking, () => {
    confluenceForm.spaceKey = payload.spaceKey
    confluenceForm.parentPageId = payload.parentPageId
  })
  try {
    const res = await invoke<CmdResult<null>>('set_confluence_config', {
      confluence: {
        baseUrl: confluenceForm.baseUrl.trim(),
        username: confluenceForm.username.trim(),
        spaceKey: confluenceForm.spaceKey.trim(),
        parentPageId: confluenceForm.parentPageId.trim(),
        ignoreSsl: confluenceForm.ignoreSsl,
      },
    })
    if (res.ok) {
      confluenceSuccessMessage.value = `已保存：Space ${payload.spaceKey}，父页面 ${payload.parentTitle}`
    } else {
      confluenceErrorMessage.value = `保存 Space/页面选择失败：${res.error || '未知错误'}`
    }
  } catch (err: any) {
    confluenceErrorMessage.value = `保存 Space/页面选择异常：${err?.message || '系统错误'}`
  }
}

async function onClearToken() {
  resetConfluenceFeedback()
  isClearingToken.value = true
  try {
    const res = await invoke<CmdResult<null>>('clear_confluence_token')
    if (res.ok) {
      hasStoredToken.value = false
      tokenInput.value = ''
      confluenceSuccessMessage.value = '已清除已保存的 API Token'
    } else {
      confluenceErrorMessage.value = `清除令牌失败：${res.error || '未知错误'}`
    }
  } catch (err: any) {
    confluenceErrorMessage.value = `清除令牌异常：${err?.message || '系统错误'}`
  } finally {
    isClearingToken.value = false
  }
}

async function onTestPatConnection() {
  resetConfluenceFeedback()
  isTestingConnection.value = true
  try {
    const res = await invoke<CmdResult<ConfluencePatConnectionResult>>(
      'test_confluence_pat_connection',
      {
        payload: {
          baseUrl: confluenceForm.baseUrl.trim(),
          username: confluenceForm.username.trim() || undefined,
          apiToken: tokenInput.value.trim() || undefined,
          ignoreSsl: confluenceForm.ignoreSsl,
        },
      }
    )

    if (res.ok && res.data) {
      connectionSucceeded.value = res.data.success
      patCurrentUserDisplayName.value = res.data.currentUserDisplayName || ''
      connectionMessage.value = res.data.success
        ? `已连接${res.data.currentUserDisplayName ? `，当前用户：${res.data.currentUserDisplayName}` : ''}`
        : res.data.message
      if (!res.data.success) {
        confluenceErrorMessage.value = res.data.message
        if (res.data.message.includes('API Token')) {
          // 独立核对持久化状态，区分"确实从未保存过令牌"与"已保存但本次读取失败"两种情况，
          // 避免用户误以为"已保存令牌"提示等同于令牌一定可被读取到。
          const statusRes = await invoke<CmdResult<ConfluenceTokenStatus>>(
            'get_confluence_token_status'
          )
          hasStoredToken.value = statusRes.ok ? !!statusRes.data?.hasToken : false
          confluenceErrorMessage.value = hasStoredToken.value
            ? `${res.data.message}（系统检测到已保存令牌，但本次读取失败，请点击上方"编辑连接信息"重新输入并保存 PAT）`
            : `${res.data.message}（系统未检测到任何已保存令牌，请点击上方"编辑连接信息"输入并保存 PAT）`
        }
      }
    } else {
      connectionSucceeded.value = false
      connectionMessage.value = `连接测试失败：${res.error || '未知错误'}`
      confluenceErrorMessage.value = connectionMessage.value
    }
  } catch (err: any) {
    connectionSucceeded.value = false
    connectionMessage.value = `连接测试异常：${err?.message || '未知错误'}`
    confluenceErrorMessage.value = connectionMessage.value
  } finally {
    isTestingConnection.value = false
  }
}

async function onCheckMd2cf() {
  md2cfMessage.value = ''
  md2cfInstalled.value = null
  try {
    const res = await invoke<CmdResult<Md2cfCheckResult>>('check_md2cf_installed')
    if (res.ok && res.data) {
      md2cfInstalled.value = res.data.installed
      md2cfMessage.value = res.data.message
    } else {
      md2cfInstalled.value = false
      md2cfMessage.value = `md2cf 检测失败：${res.error || '未知错误'}`
    }
  } catch (err: any) {
    md2cfInstalled.value = false
    md2cfMessage.value = `md2cf 检测异常：${err?.message || '未知错误'}`
  }
}

function resetConfluenceFeedback() {
  confluenceErrorMessage.value = ''
  confluenceSuccessMessage.value = ''
  connectionMessage.value = ''
  connectionSucceeded.value = null
  patCurrentUserDisplayName.value = ''
  md2cfMessage.value = ''
  md2cfInstalled.value = null
}

async function onClearAllConfluenceSettings() {
  if (!window.confirm('确定要删除所有已保存的 Confluence 配置与 API Token 吗？此操作不可撤销。')) {
    return
  }
  resetConfluenceFeedback()
  isClearingAllConfluenceSettings.value = true
  try {
    const res = await invoke<CmdResult<null>>('clear_confluence_settings')
    if (res.ok) {
      hasStoredToken.value = false
      resetConfluenceMessages()
      confluenceSuccessMessage.value = '已删除所有已保存的 Confluence 配置与 API Token'
    } else {
      confluenceErrorMessage.value = `删除失败：${res.error || '未知错误'}`
    }
  } catch (err: any) {
    confluenceErrorMessage.value = `删除异常：${err?.message || '系统错误'}`
  } finally {
    isClearingAllConfluenceSettings.value = false
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="onClose">
    <div
      class="modal-container"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div class="modal-header">
        <h3 id="settings-modal-title" class="modal-title">设置</h3>
        <button class="close-btn" aria-label="关闭对话框" @click="onClose">×</button>
      </div>

      <div class="tab-bar" role="tablist" aria-label="设置标签页" @keydown="onTabKeydown">
        <button
          id="tab-general"
          :ref="(element) => setTabButtonRef(0, element)"
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'general' }"
          role="tab"
          :aria-selected="activeTab === 'general'"
          aria-controls="panel-general"
          :tabindex="activeTab === 'general' ? 0 : -1"
          @click="setActiveTab('general')"
        >
          常规
        </button>
        <button
          id="tab-confluence"
          :ref="(element) => setTabButtonRef(1, element)"
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'confluence' }"
          role="tab"
          :aria-selected="activeTab === 'confluence'"
          aria-controls="panel-confluence"
          :tabindex="activeTab === 'confluence' ? 0 : -1"
          @click="setActiveTab('confluence')"
        >
          Confluence
        </button>
      </div>

      <div
        v-if="activeTab === 'general'"
        id="panel-general"
        class="modal-body"
        role="tabpanel"
        aria-labelledby="tab-general"
        tabindex="0"
      >
        <p class="modal-description">选择新的默认 Markdown 文件保存目录：</p>
        <div class="path-input-group">
          <input
            type="text"
            class="path-input"
            readonly
            :value="selectedPath || currentPath"
            aria-label="当前保存路径"
          />
          <button type="button" class="btn btn-secondary select-btn" @click="onSelect">
            选择...
          </button>
        </div>
        <p v-if="errorMessage" class="error-text" role="alert">{{ errorMessage }}</p>
      </div>

      <div
        v-else
        id="panel-confluence"
        class="modal-body confluence-body"
        role="tabpanel"
        aria-labelledby="tab-confluence"
        tabindex="0"
      >
        <template v-if="confluenceStep === 'connection'">
          <p class="modal-description">
            第 1 步：填写 Confluence Base URL 与 API Token / Personal Access Token (PAT)，保存后即可浏览 Space 与页面。
          </p>

          <div
            v-if="isCredentialsServerChanged"
            class="notice-banner"
            role="status"
            data-testid="credentials-notice-banner"
          >
            已修改 Base URL 或用户名，保存后将继续复用已保存的 Token；若更换了服务器或账号，请重新输入 Token。
          </div>

          <div class="field-group">
            <label class="field-label" for="confluence-base-url">Confluence Server URL</label>
            <input
              id="confluence-base-url"
              v-model="confluenceForm.baseUrl"
              type="url"
              class="text-input"
              placeholder="https://your-domain.atlassian.net/wiki"
              @blur="baseUrlTouched = true"
            />
            <p v-if="baseUrlError" class="error-text" role="alert">{{ baseUrlError }}</p>
          </div>

          <div class="field-group">
            <label class="field-label" for="confluence-api-token">API Token / Personal Access Token</label>
            <input
              id="confluence-api-token"
              v-model="tokenInput"
              type="password"
              class="text-input"
              :placeholder="tokenPlaceholder"
            />
            <div class="token-row">
              <span v-if="hasStoredToken" class="token-hint">当前已保存安全令牌</span>
              <button
                v-if="hasStoredToken"
                type="button"
                class="btn btn-secondary token-clear-btn"
                :disabled="confluenceBusy"
                @click="onClearToken"
              >
                {{ isClearingToken ? '清除中...' : '清除已保存令牌' }}
              </button>
            </div>
          </div>

          <details class="advanced-options" :open="advancedOptionsOpen">
            <summary @click.prevent="advancedOptionsOpen = !advancedOptionsOpen">高级选项</summary>
            <div class="advanced-options-body">
              <div class="field-group">
                <label class="field-label" for="confluence-username">用户名 / 邮箱（可选）</label>
                <input
                  id="confluence-username"
                  v-model="confluenceForm.username"
                  type="text"
                  class="text-input"
                  placeholder="name@example.com"
                />
              </div>
              <label class="checkbox-row">
                <input v-model="confluenceForm.ignoreSsl" type="checkbox" />
                <span>忽略 SSL 校验（允许自签名证书）</span>
              </label>
              <div class="danger-zone">
                <button
                  type="button"
                  class="btn btn-danger"
                  :disabled="isClearingAllConfluenceSettings"
                  @click="onClearAllConfluenceSettings"
                >
                  {{ isClearingAllConfluenceSettings ? '删除中...' : '删除所有已保存的 Confluence 信息' }}
                </button>
                <p class="hint-text">用于测试：一键清除已持久化的 Confluence 配置与安全令牌，重新回到第 1 步。</p>
              </div>
            </div>
          </details>

          <details class="diagnostics-panel" :open="diagnosticsOpen">
            <summary @click.prevent="diagnosticsOpen = !diagnosticsOpen">诊断（可选）</summary>
            <div class="diagnostics-body">
              <button type="button" class="btn btn-secondary" @click="onCheckMd2cf">
                检测 md2cf 安装状态
              </button>
              <p class="hint-text">发布始终优先使用 REST API 直连，md2cf 检测仅供参考。</p>
              <p v-if="md2cfMessage" class="status-text" :class="{ success: md2cfInstalled }">
                {{ md2cfMessage }}
              </p>
            </div>
          </details>

          <p v-if="confluenceErrorMessage" class="error-text" role="alert">{{ confluenceErrorMessage }}</p>
          <p v-if="confluenceSuccessMessage" class="success-text">{{ confluenceSuccessMessage }}</p>
        </template>

        <template v-else>
          <p class="modal-description">第 2 步：搜索并选择 Space，展开页面树选择父页面（可选）。</p>

          <div
            class="connection-status"
            :class="{ success: connectionSucceeded, failure: connectionSucceeded === false }"
          >
            <span class="status-text">
              {{ isTestingConnection ? '连接中...' : connectionMessage || '尚未测试连接' }}
            </span>
            <div class="connection-actions">
              <button
                type="button"
                class="btn btn-secondary"
                :disabled="isTestingConnection"
                @click="onTestPatConnection"
              >
                重新测试连接
              </button>
              <button type="button" class="link-button" @click="onEditConnection">
                编辑连接信息
              </button>
            </div>
          </div>

          <ConfluenceSpaceBrowser
            :base-url="confluenceForm.baseUrl"
            :username="confluenceForm.username"
            :ignore-ssl="confluenceForm.ignoreSsl"
            :token-override="tokenInput"
            :initial-space-key="confluenceForm.spaceKey"
            :initial-parent-page-id="confluenceForm.parentPageId"
            @select="onSpaceBrowserSelect"
          />

          <p v-if="confluenceErrorMessage" class="error-text" role="alert">{{ confluenceErrorMessage }}</p>
          <p v-if="confluenceSuccessMessage" class="success-text">{{ confluenceSuccessMessage }}</p>
        </template>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary cancel-btn" @click="onClose">
          取消
        </button>
        <button
          v-if="activeTab === 'general' || confluenceStep === 'connection'"
          type="button"
          class="btn btn-primary confirm-btn"
          :disabled="activeTab === 'general' ? !selectedPath : confluenceBusy"
          @click="onConfirm"
        >
          {{
            activeTab === 'general'
              ? '确认'
              : isSavingConfluence
                ? '保存中...'
                : '保存并继续'
          }}
        </button>
        <button v-else type="button" class="btn btn-primary confirm-btn" @click="onClose">
          完成
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  width: 640px;
  max-width: 92vw;
  background: var(--color-background-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 8px);
  box-shadow: var(--shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.5));
  color: var(--color-text-primary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  margin: 0;
  font-size: var(--font-size-h3, 16px);
  font-weight: 600;
  color: var(--color-text-primary);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.close-btn:hover {
  color: var(--color-text-primary);
}

.tab-bar {
  display: flex;
  gap: 0;
  padding: 0 var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background);
}

.tab-btn {
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  padding: var(--spacing-md) var(--spacing-sm);
  margin-right: var(--spacing-md);
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.tab-btn.active {
  color: var(--color-text-primary);
  border-bottom-color: var(--color-accent);
}

.modal-body {
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.confluence-body {
  max-height: 60vh;
  overflow-y: auto;
}

.modal-description {
  margin: 0;
  font-size: var(--font-size-body, 13px);
  color: var(--color-text-muted);
}

.path-input-group {
  display: flex;
  gap: var(--spacing-sm, 8px);
}

.path-input,
.text-input {
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

.path-input {
  flex: 1;
  font-family: var(--font-body-mono);
}

.path-input:focus,
.text-input:focus {
  border-color: var(--color-accent);
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

.checkbox-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 8px);
  font-size: var(--font-size-body, 13px);
}

.token-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm, 8px);
  flex-wrap: wrap;
}

.token-hint,
.hint-text,
.status-text {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.test-panel,
.diagnostics-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 4px);
  background: var(--color-background);
}

.advanced-options,
.diagnostics-panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 4px);
  padding: var(--spacing-sm) var(--spacing-md);
}

.advanced-options summary,
.diagnostics-panel summary {
  cursor: pointer;
  font-size: var(--font-size-body, 13px);
  color: var(--color-text-muted);
}

.advanced-options-body {
  margin-top: var(--spacing-sm, 8px);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm, 8px);
}

.danger-zone {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: var(--spacing-sm, 8px);
  border-top: 1px dashed var(--color-border);
}

.btn-danger {
  background: transparent;
  border-color: var(--color-error, #f85149);
  color: var(--color-error, #f85149);
  align-self: flex-start;
}

.btn-danger:hover:not(:disabled) {
  background: var(--color-error, #f85149);
  color: var(--color-background);
}

.connection-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--spacing-sm, 8px);
  padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 4px);
  background: var(--color-background);
}

.connection-status.success {
  border-color: var(--color-success);
}

.connection-status.failure {
  border-color: var(--color-error, #f85149);
}

.connection-actions {
  display: flex;
  gap: var(--spacing-sm, 8px);
  flex-wrap: wrap;
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

.status-text.success,
.success-text {
  color: var(--color-success);
}

.status-text.failure,
.error-text {
  color: var(--color-error, #f85149);
}

.error-text,
.success-text {
  margin: 0;
  font-size: var(--font-size-body, 12px);
}

.notice-banner {
  margin-bottom: var(--spacing-sm, 8px);
  padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
  background: rgba(234, 179, 8, 0.15);
  border: 1px solid rgba(234, 179, 8, 0.4);
  border-radius: var(--radius-sm, 4px);
  color: var(--color-warning, #eab308);
  font-size: var(--font-size-body, 12px);
  line-height: 1.4;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm, 8px);
  padding: var(--spacing-md) var(--spacing-lg);
  border-top: 1px solid var(--color-border);
  background: var(--color-background);
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

.btn-primary {
  background: var(--color-accent);
  color: var(--color-accent-foreground);
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
