import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright 配置
 *
 * 目标：为 Story 2.1 编辑器初始化提供端到端测试与 fake timer 支持。
 * 当前策略：使用 Vite dev server 作为前端测试目标，通过 fixture 注入 Tauri API mock。
 * 后续 Story 2.1 的测试用例运行在此配置下，无需启动完整 Tauri 桌面应用。
 *
 * @see https://playwright.dev
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chromium'] },
    },
  ],
  globalSetup: './e2e/setup/global-setup.ts',
  globalTeardown: './e2e/setup/global-teardown.ts',
})
