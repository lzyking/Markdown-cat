import { test, expect } from './fixtures'

// TID: S4.1-E2E 接入菜单入口与保存路径对话框
// Priority: P1
// 覆盖 Story 4.1 的所有 Acceptance Criteria。
test.describe('Story 4.1：接入菜单入口与保存路径对话框', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  // TID: S4.1-E2E-001
  // Priority: P1
  // AC: 触发菜单或信号后弹出居中对话框，展示标题、说明、只读路径输入框与按钮。
  test('触发设置后应弹出居中保存路径对话框且渲染对应元素', async ({ page }) => {
    // 触发 Modal 打开
    await page.evaluate(() => {
      ;(window as any).__OPEN_SETTINGS__()
    })

    const backdrop = page.locator('.modal-backdrop')
    await expect(backdrop).toBeVisible()

    const modal = page.locator('.modal-container')
    await expect(modal).toBeVisible()

    const title = page.locator('#settings-modal-title')
    await expect(title).toHaveText('设置保存路径')

    const pathInput = page.locator('.modal-body .path-input')
    await expect(pathInput).toBeVisible()
    await expect(pathInput).toHaveValue('/tmp/markdown-cat-test')
    await expect(pathInput).toHaveAttribute('readonly', '')

    const selectBtn = page.locator('.modal-body .select-btn')
    await expect(selectBtn).toHaveText('选择...')

    const cancelBtn = page.locator('.modal-footer .cancel-btn')
    await expect(cancelBtn).toHaveText('取消')

    const confirmBtn = page.locator('.modal-footer .confirm-btn')
    await expect(confirmBtn).toHaveText('确认')
    // 尚未选择新路径时确认按钮被禁用
    await expect(confirmBtn).toBeDisabled()
  })

  // TID: S4.1-E2E-002
  // Priority: P1
  // AC: 按 Esc 键或点击取消按钮应关闭对话框。
  test('点击取消按钮或按下 Esc 键应关闭对话框', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).__OPEN_SETTINGS__()
    })
    await expect(page.locator('.modal-backdrop')).toBeVisible()

    // 1. 点击取消按钮
    await page.locator('.modal-footer .cancel-btn').click()
    await expect(page.locator('.modal-backdrop')).toHaveCount(0)

    // 2. 再次打开并测试 Esc 键
    await page.evaluate(() => {
      ;(window as any).__OPEN_SETTINGS__()
    })
    await expect(page.locator('.modal-backdrop')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('.modal-backdrop')).toHaveCount(0)
  })

  // TID: S4.1-E2E-003
  // Priority: P2
  // AC: 菜单“Markdown Cat > 设置保存路径…”可被点击触发。
  test('菜单中的设置保存路径项被点击时应打开对话框', async ({ page }) => {
    const menuItem = page.locator('.menu-bar .menu-item', { hasText: 'Markdown Cat' })
    await menuItem.hover()

    const dropdownRow = page.locator('.menu-dropdown .menu-row', { hasText: '设置保存路径…' })
    await expect(dropdownRow).toBeVisible()

    await dropdownRow.click()
    await expect(page.locator('.modal-backdrop')).toBeVisible()
  })
})
