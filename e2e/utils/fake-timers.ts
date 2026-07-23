import { type Page } from '@playwright/test'

/**
 * 在页面中安装轻量 fake timers。
 *
 * Story 2.1 需要验证编辑器初始化与后续防抖保存的时序行为。
 * 通过 fake timers 可以精确控制 setTimeout，避免真实等待 100ms/300ms。
 */
export function installFakeTimers(page: Page) {
  return page.evaluateHandle(() => {
    const w = window as any
    const originalSetTimeout = w.setTimeout
    const originalClearTimeout = w.clearTimeout
    const timeouts: Array<{
      id: number
      fn: () => void
      when: number
      cleared: boolean
    }> = []
    let now = 0
    let idCounter = 1

    const timers = {
      tick: async (ms: number) => {
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
      runAll: async () => {
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
      const id = idCounter++
      const when = now + delay
      timeouts.push({ id, fn, when, cleared: false })
      return id
    }

    w.clearTimeout = (id?: number) => {
      const timer = timeouts.find((t) => t.id === id)
      if (timer) timer.cleared = true
    }

    w.__FAKE_TIMERS__ = timers

    return timers
  })
}
