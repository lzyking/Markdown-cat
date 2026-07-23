import { test, expect } from './fixtures'

// TID: S3.2-E2E 实现保存成功状态反馈
// Priority: P1
// 覆盖 Story 3.2 的所有 Acceptance Criteria。
test.describe('Story 3.2：实现保存成功状态反馈', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  // TID: S3.2-E2E-001
  // Priority: P1
  // AC: 保存成功后状态栏显示已保存文案，标题栏显示绿色圆点，颜色符合 success token 规范。
  test('自动保存成功后状态栏显示格式化的文件名与 success 绿色', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('Testing success status format')

    // 演进 300ms 满防抖存盘
    await page.evaluate(async () => {
      ;(window as any).__FAKE_TIMERS__.tick(300)
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })

    // 1. 标题栏绿色圆点
    const dot = page.locator('.title-bar .status-dot.success')
    await expect(dot).toBeVisible()
    const dotBg = await dot.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(dotBg).toBe('rgb(63, 185, 80)')

    // 2. 状态栏显示“已保存至 New_Document.md”
    const statusLeft = page.locator('.status-bar .left')
    await expect(statusLeft).toHaveText('已保存至 New_Document.md')
    const textColor = await statusLeft.evaluate((el) => getComputedStyle(el).color)
    expect(textColor).toBe('rgb(63, 185, 80)')
  })

  // TID: S3.2-E2E-002
  // Priority: P1
  // AC: 之前的失败提示与失败状态应被新的成功结果完整替换。
  test('新的成功保存应完全覆盖先前的失败提示与状态', async ({ page }) => {
    // 假设上次失败
    await page.evaluate(() => {
      ;(window as any).__SET_SAVE_STATUS__('failure')
      ;(window as any).__SET_SAVE_MESSAGE__('保存失败：磁盘空间不足')
    })

    const failureDot = page.locator('.title-bar .status-dot.failure')
    await expect(failureDot).toBeVisible()
    const statusLeft = page.locator('.status-bar .left')
    await expect(statusLeft).toContainText('保存失败：磁盘空间不足')

    // 执行新的输入并满防抖存盘
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('Recovered text')

    await page.evaluate(async () => {
      ;(window as any).__FAKE_TIMERS__.tick(300)
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })

    // 红色圆点被销毁，替换为绿色圆点
    await expect(page.locator('.title-bar .status-dot.failure')).toHaveCount(0)
    await expect(page.locator('.title-bar .status-dot.success')).toBeVisible()

    // 失败文案被替换为成功文案
    await expect(statusLeft).toHaveText('已保存至 New_Document.md')
  })

  // TID: S3.2-E2E-003
  // Priority: P1
  // AC: 保存成功后用户继续键入打字，标题栏回到 unsaved，但状态栏保留上次成功文案且不闪烁清空。
  test('保存成功后用户打字开启新编辑，标题栏回到 unsaved 且状态栏保留上次成功文案', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('Initial save text')

    await page.evaluate(async () => {
      ;(window as any).__FAKE_TIMERS__.tick(300)
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })

    await expect(page.locator('.title-bar .status-dot.success')).toBeVisible()
    const statusLeft = page.locator('.status-bar .left')
    await expect(statusLeft).toHaveText('已保存至 New_Document.md')

    // 用户继续打字
    await editor.type(' additional typing')

    // 标题栏圆点隐藏（回到 unsaved 态）
    await expect(page.locator('.title-bar .status-dot')).toHaveCount(0)

    // 状态栏仍然保留上一次成功存盘提示
    await expect(statusLeft).toHaveText('已保存至 New_Document.md')
  })
})
