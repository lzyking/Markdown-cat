import { test, expect } from './fixtures'

// TID: S2.5-E2E 窗口缩放与显示器 DPI 适配
// Priority: P1
// 覆盖 Story 2.5 的所有 Acceptance Criteria。
test.describe('Story 2.5：窗口缩放与显示器 DPI 适配', () => {
  // TID: S2.5-E2E-001
  // Priority: P1
  // AC: 模拟不同 deviceScaleFactor (DPR = 1.0, 1.5, 2.0, 3.0)，验证固定栏高度与双栏 1:1 比例保持一致。
  for (const dpr of [1.0, 1.5, 2.0, 3.0]) {
    test(`DPR 为 ${dpr} 时界面布局与固定栏高度应保持稳定`, async ({ browser }) => {
      // 通过 Playwright 创建特定 deviceScaleFactor 的页面上下文
      const context = await browser.newContext({
        deviceScaleFactor: dpr,
        viewport: { width: 1100, height: 700 },
      })
      const page = await context.newPage()
      await page.goto('/')
      await page.waitForSelector('.source-editor .cm-editor')

      // 检查当前页面 devicePixelRatio 的值
      const actualDpr = await page.evaluate(() => window.devicePixelRatio)
      expect(actualDpr).toBe(dpr)

      // 验证固定栏的高度为规范要求的逻辑像素
      const titleBarBox = await page.locator('.title-bar').boundingBox()
      const menuBarBox = await page.locator('.menu-bar').boundingBox()
      const statusBarBox = await page.locator('.status-bar').boundingBox()

      expect(titleBarBox?.height).toBe(38)
      expect(menuBarBox?.height).toBe(28)
      expect(statusBarBox?.height).toBe(24)

      // 验证双栏 1:1 等宽与高度
      const sourceBox = await page.locator('.source-pane').boundingBox()
      const previewBox = await page.locator('.preview-pane').boundingBox()

      expect(sourceBox).not.toBeNull()
      expect(previewBox).not.toBeNull()

      if (sourceBox && previewBox) {
        expect(Math.abs(sourceBox.width - previewBox.width)).toBeLessThanOrEqual(1)
        expect(sourceBox.height).toBe(previewBox.height)
        expect(sourceBox.height).toBe(700 - (38 + 28 + 24))
      }

      await context.close()
    })
  }

  // TID: S2.5-E2E-002
  // Priority: P1
  // AC: 在长文档滚动后改变窗口尺寸或切换 DPR，滚动位置不归零。
  test('改变视口尺寸或 DPR 时，预览区与编辑器的滚动位置应保持稳定', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')

    const editor = page.locator('.source-editor .cm-content')
    const longContent = Array.from({ length: 80 }, (_, i) => `Paragraph Line ${i}\n\n`).join('')
    await editor.fill(longContent)

    const preview = page.locator('.preview-pane-inner')
    await expect(preview.locator('p')).toHaveCount(80)

    // 将预览区向下滚动 200px
    await preview.evaluate((el) => {
      el.scrollTop = 200
    })
    const initialScrollTop = await preview.evaluate((el) => el.scrollTop)
    expect(initialScrollTop).toBe(200)

    // 改变视口尺寸模拟窗口最大化/恢复
    await page.setViewportSize({ width: 1400, height: 900 })

    // 验证预览区 scrollTop 不丢失归零
    const newScrollTop = await preview.evaluate((el) => el.scrollTop)
    expect(newScrollTop).toBe(200)
  })

  // TID: S2.5-E2E-003
  // Priority: P2
  // AC: 验证字体平滑抗锯齿配置已应用。
  test('全局 CSS 应应用高 DPI 字体抗锯齿平滑规则', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')

    const fontSmoothing = await page.evaluate(() => {
      const style = getComputedStyle(document.body)
      return (
        style.getPropertyValue('-webkit-font-smoothing') ||
        (style as any).webkitFontSmoothing
      )
    })
    expect(fontSmoothing).toBe('antialiased')
  })
})
