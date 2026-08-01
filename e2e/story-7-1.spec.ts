import { test, expect } from './fixtures'

// TID: S7.1-E2E Slash 菜单任务列表与预览交互
// Priority: P1
test.describe('Story 7.1：斜杠菜单任务列表与预览交互', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  test('应可从斜杠菜单插入任务列表模板', async ({ page }) => {
    const editor = page.locator('.cm-content')
    await editor.click()
    await page.keyboard.press('/')

    const taskItem = page.locator('.slash-menu-item', { hasText: 'Task List 任务列表' })
    await expect(taskItem).toBeVisible()
    await taskItem.click()

    await expect(page.locator('.slash-menu')).toHaveCount(0)

    const content = await page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString()
    })

    expect(content).toBe('- [ ] ')
  })

  test('应可通过键盘方向键 + Enter 选中任务列表菜单项', async ({ page }) => {
    const editor = page.locator('.cm-content')
    await editor.click()
    await page.keyboard.press('/')

    const slashMenu = page.locator('.slash-menu')
    await expect(slashMenu).toBeVisible()

    const items = page.locator('.slash-menu-item')
    const itemCount = await items.count()
    const taskItem = page.locator('.slash-menu-item', { hasText: 'Task List 任务列表' })

    let isActive = false
    for (let i = 0; i < itemCount; i += 1) {
      await page.keyboard.press('ArrowDown')
      isActive = await taskItem.evaluate((el) => el.classList.contains('active'))
      if (isActive) {
        break
      }
    }

    expect(isActive).toBe(true)
    await page.keyboard.press('Enter')

    await expect(slashMenu).toHaveCount(0)

    const content = await page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString()
    })
    expect(content).toBe('- [ ] ')
  })

  test('点击预览区任务复选框应回写 Markdown 内容', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('- [ ] first\n- [x] second')

    const firstCheckbox = page.locator('.preview-content input[type="checkbox"][data-task-index="0"]')
    const secondCheckbox = page.locator('.preview-content input[type="checkbox"][data-task-index="1"]')

    await expect(firstCheckbox).toBeVisible()
    await expect(firstCheckbox).not.toBeDisabled()
    await expect(firstCheckbox).not.toBeChecked()
    await expect(secondCheckbox).toBeChecked()

    await firstCheckbox.click()

    await expect(firstCheckbox).toBeChecked()

    let content = await page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString()
    })
    expect(content).toBe('- [x] first\n- [x] second')

    await secondCheckbox.click()
    await expect(secondCheckbox).not.toBeChecked()

    content = await page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString()
    })
    expect(content).toBe('- [x] first\n- [ ] second')
  })

  test('点击引用块内的任务复选框应回写对应行', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('> - [ ] quoted task')

    const checkbox = page.locator('.preview-content input[type="checkbox"][data-task-index="0"]')
    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toBeChecked()

    await checkbox.click()
    await expect(checkbox).toBeChecked()

    const content = await page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString()
    })
    expect(content).toBe('> - [x] quoted task')
  })

  test('点击 ")" 分隔符的有序任务复选框应回写对应行', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('1) [ ] ordered task')

    const checkbox = page.locator('.preview-content input[type="checkbox"][data-task-index="0"]')
    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toBeChecked()

    await checkbox.click()
    await expect(checkbox).toBeChecked()

    const content = await page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString()
    })
    expect(content).toBe('1) [x] ordered task')
  })

  test('围栏代码块内的类任务文本不应被计入 checkbox 索引', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('```\n- [ ] fake task in code\n```\n- [ ] real task')

    const checkbox = page.locator('.preview-content input[type="checkbox"][data-task-index="0"]')
    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toBeChecked()

    await checkbox.click()
    await expect(checkbox).toBeChecked()

    const content = await page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString()
    })
    expect(content).toBe('```\n- [ ] fake task in code\n```\n- [x] real task')
  })
})
