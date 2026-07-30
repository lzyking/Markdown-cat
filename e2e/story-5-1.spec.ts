import { test, expect } from './fixtures'

// TID: S5.1-E2E 可拖动 Splitter 组件
// Priority: P1
// 覆盖 Story 5.1 的所有 Acceptance Criteria。
test.describe('Story 5.1：可拖动 Splitter 组件', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
    await page.setViewportSize({ width: 1100, height: 700 })
    // 等待 resize 事件更新布局
    await page.waitForTimeout(100)
  })

  // TID: S5.1-E2E-001
  // Priority: P1
  // AC: 两栏之间存在 Splitter 元素，鼠标悬停时光标变为 col-resize。
  test('双栏之间应存在 Splitter 且悬停光标为 col-resize', async ({ page }) => {
    const splitter = page.locator('[role="separator"]')
    await expect(splitter).toHaveCount(1)
    await expect(splitter).toHaveCSS('cursor', 'col-resize')
    await expect(splitter).toHaveAttribute('aria-label', '调整编辑栏与预览栏宽度')
  })

  // TID: S5.1-E2E-002
  // Priority: P1
  // AC: 拖动 Splitter 可改变左右栏宽度，且左栏最小宽度不低于 200px。
  test('拖动 Splitter 应改变左栏宽度并限制最小 200px', async ({ page }) => {
    const splitter = page.locator('[role="separator"]')
    const sourcePane = page.locator('.source-pane')
    const splitterBox = await splitter.boundingBox()
    expect(splitterBox).not.toBeNull()
    if (!splitterBox) return

    // 向左拖动到极限（x=0）
    await splitter.hover()
    await page.mouse.down()
    await page.mouse.move(0, splitterBox.y + splitterBox.height / 2)
    await page.mouse.up()
    await page.waitForTimeout(100)

    const sourceBox = await sourcePane.boundingBox()
    expect(sourceBox).not.toBeNull()
    if (sourceBox) {
      expect(sourceBox.width).toBeGreaterThanOrEqual(200)
      expect(sourceBox.width).toBeLessThanOrEqual(210)
    }
  })

  // TID: S5.1-E2E-003
  // Priority: P1
  // AC: 拖动 Splitter 时右栏最小宽度也不低于 200px。
  test('拖动 Splitter 应限制右栏最小宽度不低于 200px', async ({ page }) => {
    const splitter = page.locator('[role="separator"]')
    const previewPane = page.locator('.preview-pane')
    const splitterBox = await splitter.boundingBox()
    expect(splitterBox).not.toBeNull()
    if (!splitterBox) return

    // 向右拖动到极限（x=窗口宽度）
    await splitter.hover()
    await page.mouse.down()
    await page.mouse.move(1099, splitterBox.y + splitterBox.height / 2)
    await page.mouse.up()
    await page.waitForTimeout(100)

    const previewBox = await previewPane.boundingBox()
    expect(previewBox).not.toBeNull()
    if (previewBox) {
      // 右栏最小内容宽度受 200px 约束；因 4px splitter 占位，实际元素宽度可能为 200 - 4 = 196
      expect(previewBox.width).toBeGreaterThanOrEqual(196)
      expect(previewBox.width).toBeLessThanOrEqual(210)
    }
  })

  // TID: S5.1-E2E-004
  // Priority: P1
  // AC: 全局拖拽绑定：鼠标划出 Splitter 后仍持续响应拖拽直至松开。
  test('鼠标划出 Splitter 并释放后应完成一次完整拖拽', async ({ page }) => {
    const splitter = page.locator('[role="separator"]')
    const sourcePane = page.locator('.source-pane')
    const splitterBox = await splitter.boundingBox()
    expect(splitterBox).not.toBeNull()
    if (!splitterBox) return

    const startSourceBox = await sourcePane.boundingBox()
    expect(startSourceBox).not.toBeNull()

    // 从 splitter 开始，拖动到左栏内部（划出 splitter）
    await splitter.hover()
    await page.mouse.down()
    await page.mouse.move(splitterBox.x - 100, splitterBox.y + splitterBox.height / 2)
    await page.mouse.up()
    await page.waitForTimeout(100)

    const endSourceBox = await sourcePane.boundingBox()
    expect(endSourceBox).not.toBeNull()
    if (startSourceBox && endSourceBox) {
      expect(endSourceBox.width).toBeLessThan(startSourceBox.width)
    }
  })

  // TID: S5.1-E2E-005
  // Priority: P1
  // AC: 双击 Splitter 将两栏宽度重置为 50% / 50%。
  test('双击 Splitter 应将两栏重置为 50% / 50%', async ({ page }) => {
    const splitter = page.locator('[role="separator"]')
    const sourcePane = page.locator('.source-pane')
    const previewPane = page.locator('.preview-pane')

    // 先拖动改变宽度
    const splitterBox = await splitter.boundingBox()
    expect(splitterBox).not.toBeNull()
    if (!splitterBox) return

    await splitter.hover()
    await page.mouse.down()
    await page.mouse.move(200, splitterBox.y + splitterBox.height / 2)
    await page.mouse.up()
    await page.waitForTimeout(100)

    // 双击重置
    await splitter.dblclick()
    await page.waitForTimeout(100)

    const sourceBox = await sourcePane.boundingBox()
    const previewBox = await previewPane.boundingBox()
    expect(sourceBox).not.toBeNull()
    expect(previewBox).not.toBeNull()
    if (sourceBox && previewBox) {
      // 1100 - 4px splitter = 1096；两栏应接近 548
      expect(Math.abs(sourceBox.width - previewBox.width)).toBeLessThanOrEqual(5)
    }
  })
})
