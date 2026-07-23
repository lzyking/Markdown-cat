import { test, expect } from './fixtures'

// TID: S2.2-E2E 预览区与 Markdown 渲染
// Priority: P1
// 覆盖 Story 2.2 的所有 Acceptance Criteria。
test.describe('Story 2.2：实现只读预览区与 Markdown 渲染', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  // TID: S2.2-E2E-001
  // Priority: P1
  // AC: 空状态时右栏显示默认提示。
  test('空状态应显示默认提示', async ({ page }) => {
    const empty = page.locator('.empty-state')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText('开始输入 Markdown，右侧将实时预览。')
  })

  // TID: S2.2-E2E-002
  // Priority: P1
  // AC: 输入 Markdown 后右栏实时渲染对应 HTML。
  test('输入 Markdown 后应渲染对应 HTML', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('# Heading\n\n> quote\n\n- item one\n- item two')

    const preview = page.locator('.preview-content')
    await expect(preview.locator('h1')).toHaveText('Heading')
    await expect(preview.locator('blockquote')).toContainText('quote')
    await expect(preview.locator('ul li')).toHaveCount(2)
  })

  // TID: S2.2-E2E-003
  // Priority: P1
  // AC: 清空编辑器后重新显示空状态提示。
  test('清空编辑器后应重新显示空状态提示', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('temporary')
    await expect(page.locator('.preview-content')).toBeVisible()

    await editor.fill('')
    await expect(page.locator('.empty-state')).toBeVisible()
  })

  // TID: S2.2-E2E-004
  // Priority: P1
  // AC: HTML 标签与脚本被转义，防止 XSS。
  test('HTML 标签应被转义防止 XSS', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('<script>alert(1)</script>')

    const preview = page.locator('.preview-content')
    // 自定义 renderer 将 HTML 标签转义，DOM 中不应存在 script 标签
    await expect(preview.locator('script')).toHaveCount(0)
    // 文本内容中应包含原始标签文本
    await expect(preview).toContainText('<script>')
  })

  // TID: S2.2-E2E-005
  // Priority: P2
  // AC: 标准 Markdown 元素按 UX token 规范渲染。
  test('标准 Markdown 元素应渲染并应用 design token', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('```ts\nconst x = 1\n```\n\n[link](https://example.com)')

    const preview = page.locator('.preview-content')
    await expect(preview.locator('pre code')).toContainText('const x = 1')

    const link = preview.locator('a')
    await expect(link).toHaveAttribute('href', 'https://example.com')

    const pre = preview.locator('pre')
    const preBg = await pre.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(preBg).toBe('rgb(28, 33, 40)')
  })

  // TID: S2.2-E2E-006
  // Priority: P1
  // AC: 预览区保持只读，不可编辑。
  test('预览区应只读，不可编辑', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('editable source')

    const preview = page.locator('.preview-pane-inner')
    await expect(preview).toHaveAttribute('role', 'region')

    // 尝试在预览区输入不应改变文档状态或聚焦预览区
    const previewContent = page.locator('.preview-content')
    await expect(previewContent).not.toBeFocused()

    // 预览容器 contenteditable 应不存在或为 false
    const contenteditable = await preview.evaluate((el) => el.getAttribute('contenteditable'))
    expect(contenteditable).toBeNull()
  })

  // TID: S2.2-E2E-007
  // Priority: P1
  // AC: 点击预览区链接不打开外部浏览器或新窗口。
  test('点击预览区链接不应跳转', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('[link](https://example.com)')

    const preview = page.locator('.preview-content')
    const link = preview.locator('a')
    await expect(link).toBeVisible()

    // 模拟点击链接，默认行为应被阻止；Playwright 不会实际跳转，
    // 通过调用 dispatchEvent 的 click 并检查是否未触发导航来验证。
    let navigated = false
    page.on('framenavigated', () => {
      navigated = true
    })

    await link.click()
    // 页面应保持在当前 origin
    expect(navigated).toBe(false)
  })

  // TID: S2.2-E2E-007b
  // Priority: P1
  // AC: 危险协议链接（如 javascript:）被额外阻止，不执行脚本。
  test('javascript 协议链接不应执行', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('[clickme](javascript:alert(1))')

    const preview = page.locator('.preview-content')
    const link = preview.locator('a')
    await expect(link).toBeVisible()

    let alertTriggered = false
    page.on('dialog', () => {
      alertTriggered = true
    })

    await link.click()
    expect(alertTriggered).toBe(false)
  })

  // TID: S2.2-E2E-008
  // Priority: P2
  // AC: 大段文本输入不卡顿，渲染结果正确。
  test('单次粘贴 10000 字符应渲染正确', async ({ page }) => {
    const longText = '# Heading\n\n' + 'a'.repeat(10000)
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill(longText)

    const preview = page.locator('.preview-content')
    await expect(preview.locator('h1')).toHaveText('Heading')

    const text = await preview.textContent()
    expect(text).toContain('a'.repeat(1000))
  })

  // TID: S2.2-E2E-009
  // Priority: P2
  // AC: 预览区滚动位置不跳变（内容更新后保持 scrollTop）。
  test('更新内容后预览区滚动位置不应跳变', async ({ page }) => {
    // 先输入足够多的内容让预览区出现滚动条
    const editor = page.locator('.source-editor .cm-content')
    const initialContent = Array.from({ length: 50 }, (_, i) => `Paragraph ${i}\n\n`).join('')
    await editor.fill(initialContent)

    const preview = page.locator('.preview-pane-inner')

    // 验证内容高度确实超过容器可视高度，确保滚动条存在
    const scrollHeight = await preview.evaluate((el) => el.scrollHeight)
    const clientHeight = await preview.evaluate((el) => el.clientHeight)
    expect(scrollHeight).toBeGreaterThan(clientHeight)

    // 设置滚动位置并确认浏览器已接受该值（可能因内容不足被限制）
    await preview.evaluate((el) => { el.scrollTop = 100 })
    const actualScrollTop = await preview.evaluate((el) => el.scrollTop)
    expect(actualScrollTop).toBe(100)

    // 继续追加少量内容
    await editor.fill(initialContent + '\n\nmore content')

    const scrollTop = await preview.evaluate((el) => el.scrollTop)
    expect(scrollTop).toBe(100)
  })

  // TID: S2.2-E2E-011
  // Priority: P1
  // AC: 从源码 content 变化到预览 DOM 更新的最大延迟应 < 100ms。
  test('预览区渲染延迟应小于 100ms', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    const preview = page.locator('.preview-content')

    // 先输入一些内容确保预览区存在
    await editor.fill('warmup')
    await expect(preview).toBeVisible()

    // 连续输入 10 次，每次测量从 fill 完成到 DOM 出现的时间
    const latencies: number[] = []
    for (let i = 0; i < 10; i++) {
      const input = `line ${i}`
      const start = Date.now()
      await editor.fill(input)
      await page.waitForFunction(
        (t: string) => {
          const el = document.querySelector('.preview-content')
          return (el && el.textContent?.includes(t)) ?? false
        },
        input
      )
      const end = Date.now()
      latencies.push(end - start)
    }

    const maxLatency = Math.max(...latencies)
    expect(maxLatency).toBeLessThan(100)
  })

  // TID: S2.2-E2E-010
  // Priority: P3
  // AC: 不支持的扩展语法按纯文本或默认段落渲染，不报错。
  test('不支持的扩展语法应按纯文本渲染', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('| col1 | col2 |\n| --- | --- |\n| a | b |')

    const preview = page.locator('.preview-content')
    // 自定义 renderer 禁用表格渲染
    await expect(preview.locator('table')).toHaveCount(0)
    await expect(preview).toContainText('col1')
  })
})
