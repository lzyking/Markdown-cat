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

  async function tabUntilFocused(
    page: import('@playwright/test').Page,
    locator: import('@playwright/test').Locator,
    maxTabs = 12,
  ) {
    for (let index = 0; index < maxTabs; index += 1) {
      const isFocused = await locator.evaluate((element) => element === document.activeElement).catch(() => false)
      if (isFocused) {
        return
      }
      await page.keyboard.press('Tab')
    }

    await expect(locator).toBeFocused()
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

  // TID: S6.2-E2E-004
  // Priority: P1
  // DW-37/DW-38: 纯键盘 Tab 链路可到达 File 菜单、Theme 子菜单及首个主题按钮，并可用 Enter 完成主题切换与 Escape 收起菜单。
  test('纯键盘 Tab 链路应可进入 File 菜单与 Theme 子菜单并完成主题切换', async ({ page }) => {
    const topLevelMenus = page.locator('.menu-bar .menu-item')
    const markdownCatMenu = topLevelMenus.filter({ hasText: 'Markdown Cat' })
    const markdownCatDropdown = markdownCatMenu.locator('.menu-dropdown')
    const markdownCatSettingsRow = markdownCatDropdown.locator('.menu-row', { hasText: '设置保存路径…' })
    const fileMenu = topLevelMenus.filter({ hasText: '文件' })
    const fileDropdown = fileMenu.locator('.menu-dropdown')
    const openRow = fileDropdown.locator('.menu-row', { hasText: '打开文件 (Open)…' })
    const themeTrigger = fileDropdown.locator('.submenu-trigger', { hasText: 'Theme' })
    const themeDropdown = themeTrigger.locator('.submenu-dropdown')
    const firstThemeOption = themeDropdown.locator('.theme-option').first()

    await tabUntilFocused(page, markdownCatMenu)
    await expect(markdownCatDropdown).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(markdownCatSettingsRow).toBeFocused()
    await page.keyboard.press('Tab')

    await expect(fileMenu).toBeFocused()
    await expect(fileDropdown).toBeVisible()

    await page.keyboard.press('Tab')
    await expect(openRow).toBeFocused()
    await expect(fileDropdown).toBeVisible()

    await tabUntilFocused(page, themeTrigger)
    await expect(themeTrigger).toBeFocused()
    await expect(fileDropdown).toBeVisible()

    const themeIdBeforeSelection = await page.locator('html').getAttribute('data-theme')

    await page.keyboard.press('Enter')
    await expect(themeDropdown).toBeVisible()
    await expect(firstThemeOption).toBeFocused()

    await firstThemeOption.press('Enter')
    await expect(firstThemeOption.locator('.menu-check')).toHaveText('✓')
    await expect
      .poll(() => page.locator('html').getAttribute('data-theme'))
      .not.toBe(themeIdBeforeSelection)

    await page.keyboard.press('Escape')
    await expect(firstThemeOption).not.toBeFocused()
    await expect(fileDropdown).toBeHidden()
    await expect(themeDropdown).toBeHidden()
  })

  // TID: S6.2-E2E-005
  // Priority: P1
  // DW-37/DW-38: 菜单行应可聚焦并用键盘激活，Escape 可使当前聚焦菜单行失焦并关闭对应下拉菜单。
  test('聚焦菜单行后按 Space 应触发与点击等价的动作，按 Escape 应关闭菜单', async ({ page }) => {
    const fileMenu = page.locator('.menu-bar .menu-item', { hasText: '文件' })
    const fileDropdown = fileMenu.locator('.menu-dropdown')
    const openRow = fileDropdown.locator('.menu-row', { hasText: '打开文件 (Open)…' })

    await fileMenu.focus()
    await expect(fileDropdown).toBeVisible()

    await openRow.focus()
    await expect(openRow).toBeFocused()
    await expect(fileDropdown).toBeVisible()

    await openRow.press(' ')

    await expect.poll(async () => {
      const entries = await page.evaluate(() => (window as any).__TAURI_MOCK__.dialogInvocations as Array<any>)
      return entries.filter((entry) => entry.method === 'open').length
    }).toBe(1)

    await openRow.focus()
    await openRow.press('Escape')

    await expect(openRow).not.toBeFocused()
    await expect(fileDropdown).toBeHidden()
  })
})
