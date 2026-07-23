import { test, expect } from './fixtures'

// TID: S3.3-E2E 实现保存失败提示与保底编辑体验
// Priority: P1
// 覆盖 Story 3.3 的所有 Acceptance Criteria。
test.describe('Story 3.3：实现保存失败提示与保底编辑体验', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  // TID: S3.3-E2E-001
  // Priority: P1
  // AC: 保存失败时标题栏显示红色圆点，状态栏显示格式化明确原因（红色）。
  test('保存失败时标题栏显示红色圆点，状态栏显示格式化的失败原因', async ({ page }) => {
    // 覆盖 save_document mock 返回错误
    await page.evaluate(() => {
      const mock = (window as any).__TAURI_MOCK__
      mock.__registerHandler('save_document', () => ({
        ok: false,
        error: 'ERR_SAVE_FAILED',
      }))
    })

    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('Testing save failure')

    // 演进 300ms 防抖
    await page.evaluate(async () => {
      ;(window as any).__FAKE_TIMERS__.tick(300)
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })

    // 标题栏出现红色圆点
    const failureDot = page.locator('.title-bar .status-dot.failure')
    await expect(failureDot).toBeVisible()
    const dotBg = await failureDot.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(dotBg).toBe('rgb(248, 81, 73)')

    // 状态栏显示格式化的失败提示与红色文字
    const statusLeft = page.locator('.status-bar .left')
    await expect(statusLeft).toHaveText('保存失败：文件保存失败')
    const textColor = await statusLeft.evaluate((el) => getComputedStyle(el).color)
    expect(textColor).toBe('rgb(248, 81, 73)')
  })

  // TID: S3.3-E2E-002
  // Priority: P1
  // AC: 目录不可写等特定的错误码应转换为友好中文提示。
  test('特定错误码应转换为可读的友好提示文案', async ({ page }) => {
    await page.evaluate(() => {
      const mock = (window as any).__TAURI_MOCK__
      mock.__registerHandler('save_document', () => ({
        ok: false,
        error: 'ERR_DIR_NOT_WRITABLE',
      }))
    })

    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('Testing dir unwritable')

    await page.evaluate(async () => {
      ;(window as any).__FAKE_TIMERS__.tick(300)
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })

    const statusLeft = page.locator('.status-bar .left')
    await expect(statusLeft).toHaveText('保存失败：应用目录不可写，请设置保存路径')
  })

  // TID: S3.3-E2E-003
  // Priority: P1
  // AC: 保存失败后编辑器内容绝对完好，允许用户继续键入且允许后续防抖存盘重试。
  test('保存失败后编辑器内容完好且可继续编辑重试', async ({ page }) => {
    // 第一次触发失败
    await page.evaluate(() => {
      const mock = (window as any).__TAURI_MOCK__
      mock.__registerHandler('save_document', () => ({
        ok: false,
        error: 'ERR_SAVE_FAILED',
      }))
    })

    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('Content before failure')

    await page.evaluate(async () => {
      ;(window as any).__FAKE_TIMERS__.tick(300)
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })

    // 编辑器内容完好零损坏
    const textContent = await editor.textContent()
    expect(textContent).toBe('Content before failure')

    // 恢复模拟后端为成功
    await page.evaluate(() => {
      const mock = (window as any).__TAURI_MOCK__
      mock.__registerHandler('save_document', (args: any) => ({
        ok: true,
        data: {
          filename: args?.filename || 'New_Document.md',
          path: `/tmp/${args?.filename || 'New_Document.md'}`,
        },
      }))
    })

    // 用户追加输入
    await editor.type(' and added text after recovery')

    await page.evaluate(async () => {
      ;(window as any).__FAKE_TIMERS__.tick(300)
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })

    // 验证存盘成功切回绿色成功态
    await expect(page.locator('.title-bar .status-dot.success')).toBeVisible()
    await expect(page.locator('.status-bar .left')).toHaveText('已保存至 New_Document.md')
  })
})
