import { test, expect } from './fixtures'

test.describe('MenuBar 新建 (New)、样式 (Theme) 与菜单清理 E2E 测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  test('文件菜单中第一项为 新建 (New)，点击后创建新空白文件', async ({ page }) => {
    // 改变编辑器内容
    await page.locator('.source-editor .cm-content').fill('# Some Existing Content')

    // 打开文件菜单
    const fileMenu = page.locator('.menu-bar .menu-item', { hasText: '文件' })
    await fileMenu.hover()

    const dropdown = fileMenu.locator('.menu-dropdown')
    await expect(dropdown).toBeVisible()

    const firstRow = dropdown.locator('.menu-row').first()
    await expect(firstRow).toHaveText('新建 (New)')

    // 点击 新建 (New)
    await firstRow.click()

    // 验证先前编辑的内容已重置（不包含以往文本）
    await expect(page.locator('.source-editor .cm-content')).not.toContainText('# Some Existing Content')
  })

  test('顶部菜单栏包含 样式 菜单，且不存在 编辑 和 帮助 菜单', async ({ page }) => {
    const menuItems = page.locator('.menu-bar .menu-item')
    
    // 样式 菜单存在并与 文件 并列
    const themeMenu = menuItems.filter({ hasText: '样式' })
    await expect(themeMenu).toBeVisible()

    // 编辑 和 帮助 菜单已删除
    const editMenu = menuItems.filter({ hasText: '编辑' })
    await expect(editMenu).toHaveCount(0)

    const helpMenu = menuItems.filter({ hasText: '帮助' })
    await expect(helpMenu).toHaveCount(0)
  })
})
