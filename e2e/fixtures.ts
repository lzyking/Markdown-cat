import { test as base, type Page } from '@playwright/test'

/**
 * 为页面注册 Tauri API mock 与 fake timers。
 *
 * 通过 page.addInitScript 在每次页面加载时注入，确保测试在 page.goto('/') 后
 * 仍能访问 window.__TAURI_MOCK__ 与 window.__FAKE_TIMERS__。
 */
async function injectMocks(page: Page) {
  await page.addInitScript(() => {
    const invocations: Array<{ command: string; args: unknown }> = []
    const dialogInvocations: Array<{ method: 'open' | 'save'; options: unknown }> = []
    const openedUrls: string[] = []
    const eventListeners = new Map<string, number[]>()
    const callbacks = new Map<number, (payload: unknown) => unknown>()
    let callbackIdCounter = 1
    const handlers: Record<string, (args: unknown) => unknown> = {
      ping: () => 'pong',
      init_app: () => ({ ok: true }),
      get_app_dir: () => ({ ok: true, data: '/tmp/markdown-cat-test' }),
      get_config: () => {
        const w = window as any
        if (w.__TAURI_MOCK_CONFIG_ERROR__) {
          return { ok: false, error: w.__TAURI_MOCK_CONFIG_ERROR__ }
        }
        return {
          ok: true,
          data:
            w.__TAURI_MOCK_CONFIG__ || {
              savePath: null,
              confluence: {
                baseUrl: '',
                username: '',
                spaceKey: '',
                parentPageId: '',
                ignoreSsl: false,
              },
            },
        }
      },
      set_config: () => ({ ok: true }),
      set_confluence_config: () => ({ ok: true }),
      get_confluence_token_status: () => ({ ok: true, data: { hasToken: false } }),
      set_confluence_token: () => ({ ok: true }),
      clear_confluence_token: () => ({ ok: true }),
      check_md2cf_installed: () => ({
        ok: true,
        data: {
          installed: false,
          version: null,
          message: '未检测到 md2cf，将使用 REST API 直连模式。',
        },
      }),
      test_confluence_connection: () => ({
        ok: true,
        data: {
          success: false,
          message: '请在测试中按需覆盖 test_confluence_connection handler。',
          statusCode: null,
        },
      }),
      select_save_dir: () => ({ ok: true, data: '/tmp/custom-markdown-save-dir' }),
      get_blank_document: () => ({
        ok: true,
        data: { filename: 'New_Document.md', content: '' },
      }),
      save_document: (args: any) => {
        const dir = args?.savePath || '/tmp/markdown-cat-test'
        const fn = args?.filename || 'New_Document.md'
        return {
          ok: true,
          data: {
            filename: fn,
            path: `${dir}/${fn}`,
          },
        }
      },
      save_document_as: (args: any) => {
        const targetPath = args?.targetPath || '/tmp/markdown-cat-test/New_Document.md'
        const pathSegments = String(targetPath).split(/[/\\]/)
        return {
          ok: true,
          data: {
            filename: pathSegments[pathSegments.length - 1] || 'New_Document.md',
            path: targetPath,
          },
        }
      },
      write_export_file: (args: any) => {
        const targetPath = args?.targetPath || '/tmp/markdown-cat-test/exported.html'
        const pathSegments = String(targetPath).split(/[/\\]/)
        return {
          ok: true,
          data: {
            filename: pathSegments[pathSegments.length - 1] || 'exported.html',
            path: targetPath,
          },
        }
      },
      save_image_asset: (args: any) => {
        const dir = args?.targetDir || '/tmp/markdown-cat-test/assets'
        const fn = args?.filename || 'img_test.png'
        return {
          ok: true,
          data: {
            filename: fn,
            path: `${dir}/${fn}`,
          },
        }
      },
      copy_asset_file: () => ({ ok: true, data: { migrated: true } }),
      pdf_export_supported: () => true,
      read_image_asset: () => ({
        ok: true,
        data: {
          mimeType: 'image/png',
          sizeBytes: 4,
          dataBase64: 'iVBORw0KGgo=',
          skippedLarge: false,
        },
      }),
    }

    const w = window as any
    w.__TAURI_MOCK__ = {
      invoke: async (command: string, args?: unknown) => {
        if (command === 'plugin:event|listen') {
          const event = String((args as any)?.event || '')
          const handlerId = Number((args as any)?.handler)
          const listeners = eventListeners.get(event) || []
          listeners.push(handlerId)
          eventListeners.set(event, listeners)
          return handlerId
        }
        if (command === 'plugin:event|unlisten') {
          const event = String((args as any)?.event || '')
          const eventId = Number((args as any)?.eventId)
          const listeners = eventListeners.get(event) || []
          eventListeners.set(event, listeners.filter((listenerId) => listenerId !== eventId))
          callbacks.delete(eventId)
          return null
        }
        if (command === 'plugin:opener|open_url') {
          openedUrls.push(String((args as any)?.url || ''))
          return null
        }
        invocations.push({ command, args })
        const handler = handlers[command]
        if (!handler) {
          throw new Error(`No mock handler registered for command: ${command}`)
        }
        return handler(args)
      },
      dialog: {
        open: async (options?: unknown) => {
          dialogInvocations.push({ method: 'open', options })
          return w.__TAURI_MOCK_OPEN_DIALOG_RESULT__ ?? null
        },
        save: async (options?: unknown) => {
          dialogInvocations.push({ method: 'save', options })
          return w.__TAURI_MOCK_SAVE_DIALOG_RESULT__ ?? null
        },
      },
      __registerHandler: (command: string, handler: (args: unknown) => unknown) => {
        handlers[command] = handler
      },
      emitEvent: (event: string, payload: unknown) => {
        const listeners = eventListeners.get(event) || []
        listeners.forEach((listenerId) => {
          callbacks.get(listenerId)?.({
            event,
            id: listenerId,
            payload,
          })
        })
      },
      openUrl: async (url: string) => {
        openedUrls.push(url)
      },
      get invocations() {
        return invocations
      },
      get dialogInvocations() {
        return dialogInvocations
      },
      get openedUrls() {
        return openedUrls
      },
    }
    w.__TAURI__ = w.__TAURI_MOCK__
    w.__TAURI_IPC__ = w.__TAURI_MOCK__
    w.__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: unknown) => w.__TAURI_MOCK__.invoke(cmd, args),
      transformCallback: (callback: (payload: unknown) => unknown, once = false) => {
        const id = callbackIdCounter++
        callbacks.set(id, (payload) => {
          if (once) {
            callbacks.delete(id)
          }
          return callback(payload)
        })
        return id
      },
      unregisterCallback: (id: number) => {
        callbacks.delete(id)
      },
      convertFileSrc: (filePath: string, protocol = 'asset') =>
        `${protocol}://localhost/${filePath.replace(/^\/+/, '').replace(/\\/g, '/')}`,
    }
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (_event: string, id: number) => {
        callbacks.delete(id)
      },
    }

    const timeouts: Array<{ id: number; fn: () => void; when: number; cleared: boolean }> = []
    let now = 0
    let idCounter = 1

    const originalSetTimeout = w.setTimeout
    const originalClearTimeout = w.clearTimeout

    w.__FAKE_TIMERS__ = {
      tick: (ms: number) => {
        const target = now + ms
        while (true) {
          const next = timeouts
            .filter((t) => !t.cleared)
            .sort((a, b) => a.when - b.when)[0]
          if (!next || next.when > target) break
          now = next.when
          next.cleared = true
          next.fn()
        }
        now = target
      },
      runAll: () => {
        while (true) {
          const next = timeouts
            .filter((t) => !t.cleared)
            .sort((a, b) => a.when - b.when)[0]
          if (!next) break
          now = next.when
          next.cleared = true
          next.fn()
        }
      },
      uninstall: () => {
        w.setTimeout = originalSetTimeout
        w.clearTimeout = originalClearTimeout
      },
      getNow: () => now,
    }

    w.setTimeout = (fn: (...args: any[]) => void, delay = 0) => {
      if (delay === 0) {
        return originalSetTimeout(fn, 0)
      }
      const id = idCounter++
      const when = now + delay
      timeouts.push({ id, fn, when, cleared: false })
      return id
    }

    w.clearTimeout = (id?: number) => {
      if (typeof id === 'number') {
        originalClearTimeout(id)
      }
      const timer = timeouts.find((t) => t.id === id)
      if (timer) timer.cleared = true
    }
  })
}

/**
 * 项目级测试 fixture。
 *
 * 每个测试开始前自动注入 Tauri API mock 与 fake timers，使前端可以在非 Tauri 环境运行，
 * 并精确控制 setTimeout 时序，用于验证 100ms 预览延迟与 300ms 防抖保存。
 */
export const test = base.extend({
  mocksInjected: [
    async ({ page }: { page: Page }, use: (v: boolean) => Promise<void>) => {
      await injectMocks(page)
      await use(true)
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
