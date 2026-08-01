import { type Page } from '@playwright/test'

/**
 * 为页面注入 Tauri API mock。
 *
 * 在 Playwright 中测试前端时，页面运行在 Chromium 而非 Tauri webview 中，
 * window.__TAURI__ 与 @tauri-apps/api 均不可用。本工具注入一个最小 mock，
 * 使调用 `invoke('get_blank_document')` 等命令返回可控数据。
 *
 * 返回的 state 暴露给测试，用于断言 invoke 调用次数与参数。
 */
export function injectTauriMock(page: Page) {
  return page.evaluateHandle(() => {
    const invocations: Array<{ command: string; args: unknown }> = []
    const openedUrls: string[] = []
    const eventListeners = new Map<string, number[]>()
    const callbacks = new Map<number, (payload: unknown) => unknown>()
    let callbackIdCounter = 1
    const handlers: Record<string, (args: unknown) => unknown> = {
      ping: () => 'pong',
      init_app: () => ({ ok: true }),
      get_app_dir: () => ({ ok: true, data: '/tmp/markdown-cat-test' }),
      get_config: () => ({
        ok: true,
        data: {
          savePath: null,
          confluence: {
            baseUrl: '',
            username: '',
            spaceKey: '',
            parentPageId: '',
            ignoreSsl: false,
          },
        },
      }),
      set_config: () => ({ ok: true }),
      get_confluence_token_status: () => ({ ok: true, data: { hasToken: false } }),
      set_confluence_token: () => ({ ok: true }),
      clear_confluence_token: () => ({ ok: true }),
      set_confluence_config: () => ({ ok: true }),
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
          message: '请在测试中注册 test_confluence_connection 的自定义 handler。',
        },
      }),
      get_blank_document: () => ({
        ok: true,
        data: { filename: 'New_Document.md', content: '' },
      }),
      publish_confluence: () => ({
        ok: true,
        data: {
          pageId: '123',
          pageUrl: 'https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123',
          warnings: [],
        },
      }),
    }

    const mock = {
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
      __mockInvocations: invocations,
      openedUrls,
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
    }

    // @ts-expect-error 注入全局 Tauri mock
    window.__TAURI__ = mock
    // @ts-expect-error 兼容旧版直接访问 window.__TAURI_IPC__
    window.__TAURI_IPC__ = mock
    // @ts-expect-error 兼容 @tauri-apps/api/core 与 @tauri-apps/api/event
    window.__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: unknown) => mock.invoke(cmd, args),
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
    }
    // @ts-expect-error 兼容 @tauri-apps/api/event
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (_event: string, id: number) => {
        callbacks.delete(id)
      },
    }

    return mock
  })
}
