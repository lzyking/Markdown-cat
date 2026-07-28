import { test, expect } from './fixtures'

// TID: S5-E2E-v0.2.0 新功能自动化测试套件 (Session恢复、文件菜单、拖拽打开、斜杠快捷菜单)
// Priority: P1
test.describe('Epic 5 (v0.2.0)：新功能自动化测试套件', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  // TID: S5.1-E2E-001
  // Priority: P1
  // AC: 验证默认提示占位符与编辑器焦点
  test('Story 5.4: 空内容时应展示斜杠快捷插入提示占位语', async ({ page }) => {
    const editor = page.locator('.cm-content')
    await expect(editor).toBeVisible()

    // 检查 Placeholder 占位语是否存在
    const placeholder = page.locator('.cm-placeholder')
    await expect(placeholder).toHaveText('按 / 键快速插入 markdown 格式')
  })

  // TID: S5.2-E2E-001
  // Priority: P1
  // AC: 验证【文件】下拉菜单项展示（打开文件与另存为）
  test('Story 5.2: 点击文件菜单应展示打开文件与另存为选项', async ({ page }) => {
    const fileMenu = page.locator('.menu-bar .menu-item', { hasText: '文件' })
    await fileMenu.hover()

    const openRow = page.locator('.menu-dropdown .menu-row', { hasText: '打开文件 (Open)…' })
    await expect(openRow).toBeVisible()

    const saveAsRow = page.locator('.menu-dropdown .menu-row', { hasText: '另存为 (Save As)…' })
    await expect(saveAsRow).toBeVisible()
  })

  // TID: S5.4-E2E-001
  // Priority: P1
  // AC: 按下 / 键时触发斜杠快捷插入浮窗面板
  test('Story 5.4: 按下 / 键应弹出快捷插入 Markdown 浮窗菜单', async ({ page }) => {
    const editor = page.locator('.cm-content')
    await editor.click()
    await page.keyboard.press('/')

    const slashMenu = page.locator('.slash-menu')
    await expect(slashMenu).toBeVisible()

    const header = page.locator('.slash-menu-header')
    await expect(header).toHaveText('快捷插入 Markdown')

    const items = page.locator('.slash-menu-item')
    await expect(items).toHaveCount(9)

    // 验证包含 H1 一级标题与加粗等菜单
    await expect(items.first()).toContainText('H1 一级标题')
  })

  // TID: S5.4-E2E-002
  // Priority: P1
  // AC: 快捷菜单通过键盘上下键切换并回车插入
  test('Story 5.4: 选择快捷菜单项应自动在光标处插入 Markdown 模板', async ({ page }) => {
    const editor = page.locator('.cm-content')
    await editor.click()
    await page.keyboard.press('/')

    const slashMenu = page.locator('.slash-menu')
    await expect(slashMenu).toBeVisible()

    // 按下 Enter 选择第一个项目 (H1 一级标题)
    await page.keyboard.press('Enter')

    // 弹窗菜单应当关闭
    await expect(slashMenu).toHaveCount(0)

    // 编辑器内容应变为 `# `
    const content = await page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString()
    })
    expect(content).toBe('# ')
  })
})
