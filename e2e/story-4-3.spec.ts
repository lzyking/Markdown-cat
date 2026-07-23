import { test, expect } from './fixtures'

// TID: S4.3-E2E 实现路径更新后的即时反馈与重启持久化验证
// Priority: P1
// 覆盖 Story 4.3 的所有 Acceptance Criteria。
test.describe('Story 4.3：实现路径更新后的即时反馈与重启持久化验证', () => {
  // TID: S4.3-E2E-001
  // Priority: P1
  // AC: 保存路径更新成功对话框关闭后，状态栏显示“保存路径已更新”成功提示（绿色）。
  test('保存路径更新成功后状态栏应显示保存路径已更新与 success 绿色', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')

    await page.evaluate(() => {
      ;(window as any).__OPEN_SETTINGS__()
    })

    await page.locator('.modal-body .select-btn').click()
    await page.locator('.modal-footer .confirm-btn').click()

    // 1. Modal 关闭
    await expect(page.locator('.modal-backdrop')).toHaveCount(0)

    // 2. 状态栏呈现“保存路径已更新”
    const statusLeft = page.locator('.status-bar .left')
    await expect(statusLeft).toHaveText('保存路径已更新')

    // 3. 颜色符合 success token
    const textColor = await statusLeft.evaluate((el) => getComputedStyle(el).color)
    expect(textColor).toBe('rgb(63, 185, 80)')
  })

  // TID: S4.3-E2E-002
  // Priority: P1
  // AC: 应用启动时自动从配置文件读取 savePath 并作为默认保存路径。
  test('应用启动时应从配置文件中读取新的默认保存路径', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).__TAURI_MOCK_CONFIG__ = { savePath: '/tmp/persisted-custom-path' }
    })

    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')

    const currentPath = await page.evaluate(() => {
      return (window as any).__GET_CURRENT_SAVE_PATH__()
    })
    expect(currentPath).toBe('/tmp/persisted-custom-path')
  })

  // TID: S4.3-E2E-003
  // Priority: P1
  // AC: 配置文件损坏或读取失败时，优雅回退到默认保存路径并在状态栏提示。
  test('配置文件损坏或读取失败时应安全回退到默认路径并显示回退提示', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).__TAURI_MOCK_CONFIG_ERROR__ = 'ERR_CONFIG_CORRUPTED'
    })

    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')

    // 回退到默认路径
    const currentPath = await page.evaluate(() => {
      return (window as any).__GET_CURRENT_SAVE_PATH__()
    })
    expect(currentPath).toBe('/tmp/markdown-cat-test')

    // 状态栏提示“已回退到默认保存路径”
    const statusLeft = page.locator('.status-bar .left')
    await expect(statusLeft).toHaveText('已回退到默认保存路径')
  })
})
