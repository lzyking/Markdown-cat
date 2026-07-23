import { test, expect } from './fixtures'

// TID: S2.4-E2E 空状态提示与双栏响应式布局
// Priority: P1
// 覆盖 Story 2.4 的所有 Acceptance Criteria。
test.describe('Story 2.4：空状态提示与双栏响应式布局', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  // TID: S2.4-E2E-001
  // Priority: P1
  // AC: 空内容时显示空状态提示，格式与颜色符合规范。
  test('初始空白文档应在右栏显示空状态提示', async ({ page }) => {
    const emptyState = page.locator('.preview-pane .empty-state')
    await expect(emptyState).toBeVisible()
    await expect(emptyState).toHaveText('开始输入 Markdown，右侧将实时预览。')

    // 检查 color 符合 --color-text-muted (#6E7681 = rgb(110, 118, 129))
    const color = await emptyState.evaluate((el) => getComputedStyle(el).color)
    expect(color).toBe('rgb(110, 118, 129)')

    // 检查 display 为 flex 且居中
    const align = await emptyState.evaluate((el) => getComputedStyle(el).alignItems)
    const justify = await emptyState.evaluate((el) => getComputedStyle(el).justifyContent)
    expect(align).toBe('center')
    expect(justify).toBe('center')
  })

  // TID: S2.4-E2E-002
  // Priority: P1
  // AC: 输入非空白内容后空状态提示消失，显示渲染 DOM。
  test('输入 Markdown 后空状态提示应隐藏并显示渲染内容', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('# Hello World')

    const emptyState = page.locator('.preview-pane .empty-state')
    await expect(emptyState).toHaveCount(0)

    const previewContent = page.locator('.preview-pane .preview-content')
    await expect(previewContent).toBeVisible()
    await expect(previewContent.locator('h1')).toHaveText('Hello World')
  })

  // TID: S2.4-E2E-003
  // Priority: P1
  // AC: 清空内容或仅留空白符，空状态提示恢复显示。
  test('清空内容或输入纯空白字符，空状态提示应重新出现', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('Some text')
    await expect(page.locator('.preview-pane .preview-content')).toBeVisible()

    // 1. 完全清空
    await editor.fill('')
    await expect(page.locator('.preview-pane .empty-state')).toBeVisible()

    // 2. 仅输入空白与换行
    await editor.fill('   \n\n  \t ')
    await expect(page.locator('.preview-pane .empty-state')).toBeVisible()
    await expect(page.locator('.preview-pane .preview-content')).toHaveCount(0)
  })

  // TID: S2.4-E2E-004
  // Priority: P1
  // AC: 默认尺寸下双栏保持 1:1 等宽，固定栏高度恒定。
  test('默认尺寸下双栏应保持 1:1 等宽且固定栏高度符合规范', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 })

    const titleBar = page.locator('.title-bar')
    const menuBar = page.locator('.menu-bar')
    const statusBar = page.locator('.status-bar')

    const titleBarBox = await titleBar.boundingBox()
    const menuBarBox = await menuBar.boundingBox()
    const statusBarBox = await statusBar.boundingBox()

    expect(titleBarBox?.height).toBe(38)
    expect(menuBarBox?.height).toBe(28)
    expect(statusBarBox?.height).toBe(24)

    const sourcePane = page.locator('.source-pane')
    const previewPane = page.locator('.preview-pane')

    const sourceBox = await sourcePane.boundingBox()
    const previewBox = await previewPane.boundingBox()

    expect(sourceBox).not.toBeNull()
    expect(previewBox).not.toBeNull()

    if (sourceBox && previewBox) {
      // 允许 1px 浮点取整误差
      expect(Math.abs(sourceBox.width - previewBox.width)).toBeLessThanOrEqual(1)
      expect(sourceBox.height).toBe(previewBox.height)
      // 总可分配高度应该等于 700 - (38 + 28 + 24) = 610
      expect(sourceBox.height).toBe(610)
    }
  })

  // TID: S2.4-E2E-005
  // Priority: P1
  // AC: Resize 窗口到不同大小时，双栏随窗口同步缩放且始终保持 1:1 等宽。
  test('Resize 窗口尺寸后，双栏应同步缩放并维持 1:1 比例', async ({ page }) => {
    const testSizes = [
      { width: 800, height: 500 },
      { width: 1400, height: 900 },
      { width: 1024, height: 768 },
    ]

    for (const size of testSizes) {
      await page.setViewportSize(size)

      const sourcePane = page.locator('.source-pane')
      const previewPane = page.locator('.preview-pane')

      const sourceBox = await sourcePane.boundingBox()
      const previewBox = await previewPane.boundingBox()

      expect(sourceBox).not.toBeNull()
      expect(previewBox).not.toBeNull()

      if (sourceBox && previewBox) {
        expect(Math.abs(sourceBox.width - previewBox.width)).toBeLessThanOrEqual(1)
        expect(sourceBox.height).toBe(previewBox.height)
        expect(sourceBox.height).toBe(size.height - (38 + 28 + 24))
      }
    }
  })

  // TID: S2.4-E2E-006
  // Priority: P2
  // AC: 不存在允许拖拽改变双栏比例的手柄。
  test('双栏之间不应存在可拖拽修改比例的手柄', async ({ page }) => {
    const resizer = page.locator('.resizer, .splitpane, [role="separator"]')
    await expect(resizer).toHaveCount(0)
  })
})
