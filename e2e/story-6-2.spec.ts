import { test, expect } from './fixtures'

// TID: S6.2-E2E 主题子菜单选择与配置持久化
// Priority: P1
// 覆盖 Story 6.2 的所有 Acceptance Criteria。
test.describe('Story 6.2：File 菜单 Theme 子菜单选择与配置持久化', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  async function openThemeSubmenu(page: import('@playwright/test').Page) {
    const fileMenu = page.locator('.menu-bar .menu-item', { hasText: '文件' })
    await fileMenu.hover()
    const themeTrigger = page.locator('.menu-dropdown .submenu-trigger', { hasText: 'Theme' })
    await themeTrigger.hover()
    return themeTrigger
  }

  // TID: S6.2-E2E-001
  // Priority: P1
  // AC1: File 菜单集成 Theme 子菜单，划分 Light Themes / Dark Themes 两个小节，各展示 5 种主题。
  test('Theme 子菜单应展示 Light Themes 与 Dark Themes 两个小节各 5 项', async ({ page }) => {
    const themeTrigger = await openThemeSubmenu(page)
    const dropdown = themeTrigger.locator('.submenu-dropdown')
    await expect(dropdown).toBeVisible()

    const sections = dropdown.locator('.theme-section')
    await expect(sections).toHaveCount(2)

    const lightSection = sections.nth(0)
    await expect(lightSection.locator('.menu-section-label')).toHaveText('Light Themes')
    await expect(lightSection.locator('.theme-option')).toHaveCount(5)

    const darkSection = sections.nth(1)
    await expect(darkSection.locator('.menu-section-label')).toHaveText('Dark Themes')
    await expect(darkSection.locator('.theme-option')).toHaveCount(5)
  })

  // TID: S6.2-E2E-002
  // Priority: P1
  // AC2: 当前激活主题左侧显示对勾，点击任意主题项立即切换根节点 data-theme 属性。
  test('点击主题项应立即切换 data-theme 并在对应项显示勾选标记', async ({ page }) => {
    const themeTrigger = await openThemeSubmenu(page)
    const dropdown = themeTrigger.locator('.submenu-dropdown')

    const targetOption = dropdown.locator('.theme-option', { hasText: 'Cyberpunk Dark' })
    await targetOption.click()

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cyberpunk-dark')

    // 重新打开子菜单验证勾选标记跟随当前激活主题
    await openThemeSubmenu(page)
    const reopenedDropdown = page.locator('.menu-dropdown .submenu-trigger', { hasText: 'Theme' }).locator('.submenu-dropdown')
    const checkedOption = reopenedDropdown.locator('.theme-option', { hasText: 'Cyberpunk Dark' })
    await expect(checkedOption.locator('.menu-check')).toHaveText('✓')

    const otherOption = reopenedDropdown.locator('.theme-option', { hasText: 'Paper Light' })
    await expect(otherOption.locator('.menu-check')).toHaveText('')
  })

  // TID: S6.2-E2E-003
  // Priority: P1
  // AC3: 选中的 themeId 写入本地配置文件，应用重启后自动加载应用该主题。
  test('选择主题应通过 set_config 持久化，且重启后自动加载已保存的主题', async ({ page }) => {
    const themeTrigger = await openThemeSubmenu(page)
    const dropdown = themeTrigger.locator('.submenu-dropdown')

    await dropdown.locator('.theme-option', { hasText: 'Nord Light' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'nord-light')

    const invocations = await page.evaluate(() => (window as any).__TAURI_MOCK__.invocations)
    const setConfigCall = invocations
      .filter((entry: any) => entry.command === 'set_config')
      .pop()
    expect(setConfigCall?.args?.themeId).toBe('nord-light')

    // 模拟“重启”：以持久化后的 themeId 作为 get_config 返回值重新加载页面。
    // 使用 addInitScript（而非 page.evaluate）确保该值在 reload 触发的新导航中依然生效。
    await page.addInitScript(() => {
      ;(window as any).__TAURI_MOCK_CONFIG__ = { savePath: null, themeId: 'nord-light' }
    })
    await page.reload()
    await page.waitForSelector('.source-editor .cm-editor')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'nord-light')
  })
})
