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
    const handlers: Record<string, (args: unknown) => unknown> = {
      ping: () => 'pong',
      init_app: () => ({ ok: true }),
      get_app_dir: () => ({ ok: true, data: '/tmp/markdown-cat-test' }),
      get_config: () => {
        const w = window as any
        if (w.__TAURI_MOCK_CONFIG_ERROR__) {
          return { ok: false, error: w.__TAURI_MOCK_CONFIG_ERROR__ }
        }
        return { ok: true, data: w.__TAURI_MOCK_CONFIG__ || { savePath: null } }
      },
      set_config: () => ({ ok: true }),
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
    }

    const w = window as any
    w.__TAURI_MOCK__ = {
      invoke: async (command: string, args?: unknown) => {
        invocations.push({ command, args })
        const handler = handlers[command]
        if (!handler) {
          throw new Error(`No mock handler registered for command: ${command}`)
        }
        return handler(args)
      },
      __registerHandler: (command: string, handler: (args: unknown) => unknown) => {
        handlers[command] = handler
      },
      get invocations() {
        return invocations
      },
    }
    w.__TAURI__ = w.__TAURI_MOCK__
    w.__TAURI_IPC__ = w.__TAURI_MOCK__
    w.__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: unknown) => w.__TAURI_MOCK__.invoke(cmd, args),
      convertFileSrc: (filePath: string, protocol = 'asset') =>
        `${protocol}://localhost/${filePath.replace(/^\/+/, '').replace(/\\/g, '/')}`,
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
