import { expect, test } from './fixtures'

// TID: S11.3-E2E Confluence 无障碍标签与键盘导航
// Priority: P2
// 注：本文件仅覆盖前端 ARIA/键盘可达性；Confluence 后端 keyring 与 HTTP 集成测试见
// src-tauri/src/commands/config.rs 的 `backend_integration_tests` 模块（Rust `cargo test`）。
test.describe('Story 11.3：Confluence 设置弹窗无障碍标签与键盘导航', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
    await page.evaluate(() => {
      ;(window as any).__OPEN_SETTINGS__()
    })
  })

  test('设置弹窗标签应具备 ARIA 关联并支持左右方向键切换', async ({ page }) => {
    const generalTab = page.locator('#tab-general')
    const confluenceTab = page.locator('#tab-confluence')
    const generalPanel = page.locator('#panel-general')

    await expect(generalTab).toHaveAttribute('aria-controls', 'panel-general')
    await expect(confluenceTab).toHaveAttribute('aria-controls', 'panel-confluence')
    await expect(generalPanel).toHaveAttribute('role', 'tabpanel')
    await expect(generalPanel).toHaveAttribute('aria-labelledby', 'tab-general')
    await expect(generalTab).toHaveAttribute('tabindex', '0')
    await expect(confluenceTab).toHaveAttribute('tabindex', '-1')
    await expect(page.locator('input[aria-label="当前保存路径"]')).toBeVisible()
    await expect(page.locator('#confluence-base-url')).toHaveCount(0)

    await generalTab.focus()
    await page.keyboard.press('ArrowRight')

    const confluencePanel = page.locator('#panel-confluence')
    await expect(confluenceTab).toBeFocused()
    await expect(confluenceTab).toHaveAttribute('aria-selected', 'true')
    await expect(confluenceTab).toHaveAttribute('tabindex', '0')
    await expect(generalTab).toHaveAttribute('tabindex', '-1')
    await expect(confluencePanel).toHaveAttribute('role', 'tabpanel')
    await expect(confluencePanel).toHaveAttribute('aria-labelledby', 'tab-confluence')
    await expect(page.locator('#confluence-base-url')).toBeVisible()
    await expect(page.locator('input[aria-label="当前保存路径"]')).toHaveCount(0)

    await page.keyboard.press('ArrowLeft')

    await expect(generalTab).toBeFocused()
    await expect(generalTab).toHaveAttribute('aria-selected', 'true')
    await expect(generalTab).toHaveAttribute('tabindex', '0')
    await expect(confluenceTab).toHaveAttribute('tabindex', '-1')
    await expect(page.locator('#panel-general')).toHaveAttribute('aria-labelledby', 'tab-general')
    await expect(page.locator('input[aria-label="当前保存路径"]')).toBeVisible()
    await expect(page.locator('#confluence-base-url')).toHaveCount(0)
  })

  test('Home/End 键应跳转到首/尾标签', async ({ page }) => {
    const generalTab = page.locator('#tab-general')
    const confluenceTab = page.locator('#tab-confluence')

    await generalTab.focus()
    await page.keyboard.press('End')

    await expect(confluenceTab).toBeFocused()
    await expect(confluenceTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#confluence-base-url')).toBeVisible()

    await page.keyboard.press('Home')

    await expect(generalTab).toBeFocused()
    await expect(generalTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('input[aria-label="当前保存路径"]')).toBeVisible()
  })
})
