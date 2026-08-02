import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import {
  PREVIEW_COMPACT_MAX_WIDTH,
  PREVIEW_REGULAR_MAX_WIDTH,
  resolveResponsiveLayout,
} from '../src/lib/preview'

async function dragSplitterTo(page: Page, x: number) {
  const splitter = page.locator('[role="separator"]')
  const splitterBox = await splitter.boundingBox()
  expect(splitterBox).not.toBeNull()
  if (!splitterBox) return

  await splitter.hover()
  await page.mouse.down()
  await page.mouse.move(x, splitterBox.y + splitterBox.height / 2)
  await page.mouse.up()
  await page.waitForTimeout(100)
}

// TID: S5.2-E2E 响应式预览自适应
// Priority: P1
// 覆盖 Story 5.2 的所有 Acceptance Criteria。
test.describe('Story 5.2：响应式预览自适应', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
    await page.setViewportSize({ width: 1100, height: 700 })
    await page.waitForTimeout(100)
  })

  // TID: S5.2-E2E-001
  // Priority: P1
  // AC: 预览区内容应约束在容器宽度内，图片保持 max-width: 100% 与 height: auto。
  test('预览图片应跟随容器缩放且不溢出', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    const markdown =
      '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxMjAwJyBoZWlnaHQ9JzYwMCcgdmlld0JveD0nMCAwIDEyMDAgNjAwJz48cmVjdCB3aWR0aD0nMTIwMCcgaGVpZ2h0PSc2MDAnIGZpbGw9JyM3REQzRkMnLz48L3N2Zz4=" alt="responsive image" />'
    await editor.fill(markdown)

    // 拖到 x=860：在 1100px 视口下把预览列收窄，但不针对断点边界做精确控制，本用例只依赖预览列变窄这一事实。
    await dragSplitterTo(page, 860)

    const image = page.locator('.preview-content img')
    await page.waitForFunction(() => {
      const img = document.querySelector('.preview-content img') as HTMLImageElement | null
      return Boolean(img && img.complete)
    })

    await expect(image).toBeVisible()

    const metrics = await page.evaluate(() => {
      const preview = document.querySelector('.preview-pane-inner') as HTMLElement | null
      const img = document.querySelector('.preview-content img') as HTMLImageElement | null
      if (!preview || !img) return null

      const previewRect = preview.getBoundingClientRect()
      const imgRect = img.getBoundingClientRect()
      const style = getComputedStyle(img)

      return {
        previewWidth: previewRect.width,
        imageWidth: imgRect.width,
        imageHeight: imgRect.height,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        maxWidth: style.maxWidth,
      }
    })

    expect(metrics).not.toBeNull()
    if (!metrics) return

    expect(metrics.maxWidth).toBe('100%')
    expect(metrics.imageWidth).toBeLessThanOrEqual(metrics.previewWidth + 1)
    expect(metrics.imageHeight / metrics.imageWidth).toBeCloseTo(
      metrics.naturalHeight / metrics.naturalWidth,
      2,
    )
  })

  // TID: S5.2-E2E-002
  // Priority: P1
  // AC: 窄容器下代码块与表格应提供独立横向滚动，不把外层预览容器撑破。
  test('窄预览区中的代码块与表格应独立横向滚动', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    const markdown = [
      '```ts',
      'const veryLongPreviewLine = "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz0123456789012345678901234567890123456789"',
      '```',
      '',
      '| Column Header With A Very Long Title | Another Extremely Long Header |',
      '| --- | --- |',
      '| some-super-long-cell-value-that-should-overflow-horizontally | another-super-long-cell-value-that-should-overflow-horizontally |',
    ].join('\n')

    await editor.fill(markdown)
    // 拖到 x=880：在 1100px 视口下比 860px 更进一步收窄预览列，制造更窄的预览宽度。
    await dragSplitterTo(page, 880)

    const pre = page.locator('.preview-content pre')
    const tableScroll = page.locator('.preview-content .preview-table-scroll')

    await expect(pre).toBeVisible()
    await expect(tableScroll).toBeVisible()

    const metrics = await page.evaluate(() => {
      const preview = document.querySelector('.preview-pane-inner') as HTMLElement | null
      const pre = document.querySelector('.preview-content pre') as HTMLElement | null
      const tableScroll = document.querySelector('.preview-content .preview-table-scroll') as HTMLElement | null
      if (!preview || !pre || !tableScroll) return null

      return {
        previewScrollWidth: preview.scrollWidth,
        previewClientWidth: preview.clientWidth,
        preOverflowX: getComputedStyle(pre).overflowX,
        tableOverflowX: getComputedStyle(tableScroll).overflowX,
        preScrollWidth: pre.scrollWidth,
        preClientWidth: pre.clientWidth,
        tableScrollWidth: tableScroll.scrollWidth,
        tableClientWidth: tableScroll.clientWidth,
      }
    })

    expect(metrics).not.toBeNull()
    if (!metrics) return

    expect(metrics.preOverflowX).toBe('auto')
    expect(metrics.tableOverflowX).toBe('auto')
    expect(metrics.preScrollWidth).toBeGreaterThan(metrics.preClientWidth)
    expect(metrics.tableScrollWidth).toBeGreaterThan(metrics.tableClientWidth)
    expect(metrics.previewScrollWidth).toBeLessThanOrEqual(metrics.previewClientWidth + 1)
  })

  // TID: S5.2-E2E-003
  // Priority: P1
  // AC: ResizeObserver 应在预览容器尺寸变化后更新响应式布局标记。
  test('拖动 splitter 与窗口 resize 后应更新预览响应式布局标记', async ({ page }) => {
    const preview = page.locator('.preview-pane-inner')

    const initialBox = await preview.boundingBox()
    expect(initialBox, '初始状态应能读取 .preview-pane-inner 的真实宽度').not.toBeNull()
    if (!initialBox) {
      throw new Error('初始状态无法读取 .preview-pane-inner 的真实宽度')
    }

    // data-preview-width 反映的是 ResizeObserver 的 contentRect（不含 padding/border）宽度，
    // 与 boundingBox（含 padding/border）天然不同，因此不直接比较数值；只验证该属性是有效数字，
    // 且用它算出的期望布局与 data-preview-layout 一致，从而仍能捕获该属性本身失效/NaN 的回归。
    const initialWidth = initialBox.width
    const initialReportedWidth = Number(await preview.getAttribute('data-preview-width'))
    expect(Number.isFinite(initialReportedWidth) && initialReportedWidth > 0).toBe(true)
    const initialExpectedLayout = resolveResponsiveLayout(initialWidth)
    await expect(preview).toHaveAttribute('data-preview-layout', initialExpectedLayout)
    expect(resolveResponsiveLayout(initialReportedWidth)).toBe(initialExpectedLayout)

    // 拖到 x=900：在 1100px 视口下把预览列压到 compact 阈值（420px）以内，稳定落入 compact 分区。
    await dragSplitterTo(page, 900)

    const compactBox = await preview.boundingBox()
    expect(compactBox, '拖拽后应能读取 .preview-pane-inner 的真实宽度').not.toBeNull()
    if (!compactBox) {
      throw new Error('拖拽后无法读取 .preview-pane-inner 的真实宽度')
    }

    const compactWidth = compactBox.width
    expect(
      compactWidth,
      `拖到 x=900 后测得宽度 ${compactWidth}px，未落入 compact 分区（应 <= ${PREVIEW_COMPACT_MAX_WIDTH}px）`,
    ).toBeLessThanOrEqual(PREVIEW_COMPACT_MAX_WIDTH)
    const compactReportedWidth = Number(await preview.getAttribute('data-preview-width'))
    expect(Number.isFinite(compactReportedWidth) && compactReportedWidth > 0).toBe(true)
    const compactExpectedLayout = resolveResponsiveLayout(compactWidth)
    expect(compactExpectedLayout).toBe('compact')
    await expect(preview).toHaveAttribute('data-preview-layout', compactExpectedLayout)
    expect(resolveResponsiveLayout(compactReportedWidth)).toBe(compactExpectedLayout)
    expect(compactWidth).toBeLessThan(initialWidth)

    await page.setViewportSize({ width: 1600, height: 700 })
    await page.waitForTimeout(100)

    const wideBox = await preview.boundingBox()
    expect(wideBox, '窗口放大后应能读取 .preview-pane-inner 的真实宽度').not.toBeNull()
    if (!wideBox) {
      throw new Error('窗口放大后无法读取 .preview-pane-inner 的真实宽度')
    }

    const wideWidth = wideBox.width
    expect(
      wideWidth,
      `视口放大到 1600px 后测得宽度 ${wideWidth}px，未落入 wide 分区（应 > ${PREVIEW_REGULAR_MAX_WIDTH}px）`,
    ).toBeGreaterThan(PREVIEW_REGULAR_MAX_WIDTH)
    const wideReportedWidth = Number(await preview.getAttribute('data-preview-width'))
    expect(Number.isFinite(wideReportedWidth) && wideReportedWidth > 0).toBe(true)
    const wideExpectedLayout = resolveResponsiveLayout(wideWidth)
    expect(wideExpectedLayout).toBe('wide')
    await expect(preview).toHaveAttribute('data-preview-layout', wideExpectedLayout)
    expect(resolveResponsiveLayout(wideReportedWidth)).toBe(wideExpectedLayout)
    expect(wideWidth).toBeGreaterThan(compactWidth)
  })
})
