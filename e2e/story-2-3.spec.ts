import { test, expect } from './fixtures'

// TID: S2.3-E2E 标题栏文件状态与三态显示
// Priority: P1
// 覆盖 Story 2.3 的所有 Acceptance Criteria。
test.describe('Story 2.3：标题栏文件状态与三态显示', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  // TID: S2.3-E2E-001
  // Priority: P1
  // AC: 初始状态为 unsaved，标题栏无状态圆点。
  test('初始状态应为 unsaved，标题栏无圆点', async ({ page }) => {
    const dots = page.locator('.title-bar .status-dot')
    await expect(dots).toHaveCount(0)
  })

  // TID: S2.3-E2E-002
  // Priority: P1
  // AC: saveStatus 为 success 时标题栏显示绿色圆点。
  test('saveStatus 为 success 时应显示绿色圆点', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).__SET_SAVE_STATUS__('success')
    })

    const dot = page.locator('.title-bar .status-dot.success')
    await expect(dot).toBeVisible()

    const bg = await dot.evaluate((el) => getComputedStyle(el).backgroundColor)
    // --color-success: #3FB950 = rgb(63, 185, 80)
    expect(bg).toBe('rgb(63, 185, 80)')
  })

  // TID: S2.3-E2E-003
  // Priority: P1
  // AC: saveStatus 为 failure 时标题栏显示红色圆点。
  test('saveStatus 为 failure 时应显示红色圆点', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).__SET_SAVE_STATUS__('failure')
    })

    const dot = page.locator('.title-bar .status-dot.failure')
    await expect(dot).toBeVisible()

    const bg = await dot.evaluate((el) => getComputedStyle(el).backgroundColor)
    // --color-error: #F85149 = rgb(248, 81, 73)
    expect(bg).toBe('rgb(248, 81, 73)')
  })

  // TID: S2.3-E2E-004
  // Priority: P1
  // AC: content 变化后 saveStatus 自动重置为 unsaved，圆点消失。
  test('编辑内容后 saveStatus 应重置为 unsaved', async ({ page }) => {
    // 先设为 success
    await page.evaluate(() => {
      ;(window as any).__SET_SAVE_STATUS__('success')
    })
    await expect(page.locator('.title-bar .status-dot.success')).toBeVisible()

    // 在编辑器中输入，触发 content 变化
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('trigger unsaved')

    // 圆点应消失
    const dots = page.locator('.title-bar .status-dot')
    await expect(dots).toHaveCount(0)
  })

  // TID: S2.3-E2E-005
  // Priority: P1
  // AC: failure 状态下编辑内容也应重置为 unsaved。
  test('failure 状态下编辑内容也应重置为 unsaved', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).__SET_SAVE_STATUS__('failure')
    })
    await expect(page.locator('.title-bar .status-dot.failure')).toBeVisible()

    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('trigger unsaved from failure')

    const dots = page.locator('.title-bar .status-dot')
    await expect(dots).toHaveCount(0)
  })

  // TID: S2.3-E2E-006
  // Priority: P1
  // AC: saveMessage 传递到状态栏并正确显示。
  test('saveMessage 应在状态栏显示', async ({ page }) => {
    const testMessage = 'Saved to test.md'
    await page.evaluate((msg) => {
      ;(window as any).__SET_SAVE_STATUS__('success')
      ;(window as any).__SET_SAVE_MESSAGE__(msg)
    }, testMessage)

    const statusLeft = page.locator('.status-bar .left')
    await expect(statusLeft).toContainText(testMessage)
    // success 状态下状态栏文字应为绿色
    const color = await statusLeft.evaluate((el) => getComputedStyle(el).color)
    // --color-success: #3FB950 = rgb(63, 185, 80)
    expect(color).toBe('rgb(63, 185, 80)')
  })

  // TID: S2.3-E2E-007
  // Priority: P1
  // AC: failure 状态下状态栏消息显示为红色。
  test('failure 状态下状态栏消息应为红色', async ({ page }) => {
    const errorMsg = 'Save failed: path not writable'
    await page.evaluate((msg) => {
      ;(window as any).__SET_SAVE_STATUS__('failure')
      ;(window as any).__SET_SAVE_MESSAGE__(msg)
    }, errorMsg)

    const statusLeft = page.locator('.status-bar .left')
    await expect(statusLeft).toContainText(errorMsg)
    const color = await statusLeft.evaluate((el) => getComputedStyle(el).color)
    // --color-error: #F85149 = rgb(248, 81, 73)
    expect(color).toBe('rgb(248, 81, 73)')
  })

  // TID: S2.3-E2E-008
  // Priority: P2
  // AC: unsaved 状态下状态栏默认显示 '准备就绪'，颜色为 muted。
  test('unsaved 状态下状态栏应显示默认文案', async ({ page }) => {
    const statusLeft = page.locator('.status-bar .left')
    await expect(statusLeft).toContainText('准备就绪')
  })
})
