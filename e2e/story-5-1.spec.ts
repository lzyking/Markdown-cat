import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

async function getLayoutMetrics(page: Page) {
  return page.evaluate(() => {
    const workspace = document.querySelector('.editor-workspace') as HTMLElement | null
    const sourcePane = document.querySelector('.source-pane') as HTMLElement | null
    const previewPane = document.querySelector('.preview-pane') as HTMLElement | null

    if (!workspace || !sourcePane || !previewPane) {
      throw new Error('Splitter layout elements not found')
    }

    return {
      containerWidth: workspace.getBoundingClientRect().width,
      sourceWidth: sourcePane.getBoundingClientRect().width,
      previewWidth: previewPane.getBoundingClientRect().width,
    }
  })
}

async function dispatchSplitterTouchDrag(page: Page, targetClientX: number) {
  return page.evaluate(async (nextClientX) => {
    const splitter = document.querySelector('[role="separator"]') as HTMLElement | null
    if (!splitter) {
      throw new Error('Splitter not found')
    }

    const rect = splitter.getBoundingClientRect()
    const startX = rect.left + rect.width / 2
    const clientY = rect.top + rect.height / 2

    const createTouchEvent = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent
      const activeTouches = type === 'touchend' || type === 'touchcancel'
        ? []
        : [{ clientX, clientY }]
      const changedTouches = [{ clientX, clientY }]
      Object.defineProperty(event, 'touches', { value: activeTouches })
      Object.defineProperty(event, 'targetTouches', { value: activeTouches })
      Object.defineProperty(event, 'changedTouches', { value: changedTouches })
      return event
    }

    splitter.dispatchEvent(createTouchEvent('touchstart', startX))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const moveEvent = createTouchEvent('touchmove', nextClientX)
    window.dispatchEvent(moveEvent)
    const defaultPrevented = moveEvent.defaultPrevented
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    window.dispatchEvent(createTouchEvent('touchend', nextClientX))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    return { defaultPrevented }
  }, targetClientX)
}

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

  // TID: S5.1-E2E-006
  // Priority: P1
  // AC: 键盘 ArrowLeft / ArrowRight 应按容器宽度 2% 步进调整，并遵守最小/最大宽度约束。
  test('键盘 ArrowLeft / ArrowRight 应按 2% 步进调整并受 200px 边界约束', async ({ page }) => {
    const splitter = page.locator('[role="separator"]')
    await expect(splitter).toHaveAttribute('tabindex', '0')
    await splitter.focus()
    await expect(splitter).toBeFocused()

    const before = await getLayoutMetrics(page)
    const step = Math.max(1, before.containerWidth * 0.02)

    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(50)
    const afterRight = await getLayoutMetrics(page)
    expect(afterRight.sourceWidth - before.sourceWidth).toBeGreaterThanOrEqual(step - 2)
    expect(afterRight.sourceWidth - before.sourceWidth).toBeLessThanOrEqual(step + 2)
    expect(afterRight.sourceWidth).toBeLessThanOrEqual(before.containerWidth - 200)

    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(50)
    const afterLeft = await getLayoutMetrics(page)
    expect(Math.abs(afterLeft.sourceWidth - before.sourceWidth)).toBeLessThanOrEqual(2)

    await page.keyboard.press('Home')
    await page.waitForTimeout(50)
    const atMin = await getLayoutMetrics(page)
    expect(atMin.sourceWidth).toBeGreaterThanOrEqual(200)
    expect(atMin.sourceWidth).toBeLessThanOrEqual(202)

    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(50)
    const stillAtMin = await getLayoutMetrics(page)
    expect(stillAtMin.sourceWidth).toBeGreaterThanOrEqual(200)
    expect(stillAtMin.sourceWidth).toBeLessThanOrEqual(202)
  })

  // TID: S5.1-E2E-007
  // Priority: P1
  // AC: 键盘 Home / End 应分别跳到最小/最大宽度。
  test('键盘 Home / End 应将左栏跳到最小 200px 与最大 containerWidth-200', async ({ page }) => {
    const splitter = page.locator('[role="separator"]')
    await splitter.focus()

    await page.keyboard.press('Home')
    await page.waitForTimeout(50)
    const atMin = await getLayoutMetrics(page)
    expect(atMin.sourceWidth).toBeGreaterThanOrEqual(200)
    expect(atMin.sourceWidth).toBeLessThanOrEqual(202)

    await page.keyboard.press('End')
    await page.waitForTimeout(50)
    const atMax = await getLayoutMetrics(page)
    expect(atMax.sourceWidth).toBeGreaterThanOrEqual(atMax.containerWidth - 202)
    expect(atMax.sourceWidth).toBeLessThanOrEqual(atMax.containerWidth - 198)

    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(50)
    const stillAtMax = await getLayoutMetrics(page)
    expect(stillAtMax.sourceWidth).toBeGreaterThanOrEqual(atMax.containerWidth - 202)
    expect(stillAtMax.sourceWidth).toBeLessThanOrEqual(atMax.containerWidth - 198)
  })

  // TID: S5.1-E2E-008
  // Priority: P1
  // AC: Splitter 应暴露 aria-valuenow / aria-valuemin / aria-valuemax，并随宽度变化同步更新。
  test('Splitter 应暴露并更新 ARIA 值语义属性', async ({ page }) => {
    const splitter = page.locator('[role="separator"]')
    const initial = await getLayoutMetrics(page)
    await expect(splitter).toHaveAttribute('aria-valuemin', '0')
    await expect(splitter).toHaveAttribute('aria-valuemax', '100')
    await expect(splitter).toHaveAttribute(
      'aria-valuenow',
      String(Math.round((initial.sourceWidth / initial.containerWidth) * 100)),
    )

    await splitter.focus()
    await page.keyboard.press('Home')
    await page.waitForTimeout(50)
    const atMin = await getLayoutMetrics(page)
    await expect(splitter).toHaveAttribute(
      'aria-valuenow',
      String(Math.round((atMin.sourceWidth / atMin.containerWidth) * 100)),
    )

    await page.keyboard.press('End')
    await page.waitForTimeout(50)
    const atMax = await getLayoutMetrics(page)
    await expect(splitter).toHaveAttribute(
      'aria-valuenow',
      String(Math.round((atMax.sourceWidth / atMax.containerWidth) * 100)),
    )
  })

  // TID: S5.1-E2E-009
  // Priority: P2
  // AC: 触屏拖拽应复用相同宽度约束，并在 touchmove 中阻止默认滚动行为。
  test('触屏拖拽应更新宽度、遵守边界并在 touchmove 中阻止默认行为', async ({ page }) => {
    const metrics = await getLayoutMetrics(page)
    const { defaultPrevented } = await dispatchSplitterTouchDrag(page, metrics.containerWidth - 1)
    expect(defaultPrevented).toBe(true)

    const afterDrag = await getLayoutMetrics(page)
    expect(afterDrag.sourceWidth).toBeGreaterThanOrEqual(metrics.containerWidth - 202)
    expect(afterDrag.sourceWidth).toBeLessThanOrEqual(metrics.containerWidth - 198)

    const { defaultPrevented: preventedAtMin } = await dispatchSplitterTouchDrag(page, 0)
    expect(preventedAtMin).toBe(true)

    const afterClamp = await getLayoutMetrics(page)
    expect(afterClamp.sourceWidth).toBeGreaterThanOrEqual(200)
    expect(afterClamp.sourceWidth).toBeLessThanOrEqual(202)
  })
})
