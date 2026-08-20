import { test, expect } from './fixtures'

// TID: S11.1-E2E Confluence 表单校验与 Token 安全提示
// Priority: P1
// 覆盖 Story 11.1 (DW-57, DW-61, DW-62, DW-64) 的 Acceptance Criteria
test.describe('Story 11.1：Confluence 表单校验与 Token 安全提示', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
    await page.evaluate(() => {
      ;(window as any).__OPEN_SETTINGS__()
    })
  })

  // TID-11-1-01 (P1): 验证 Base URL 留空或非法格式时阻断保存并显示校验信息
  test('Base URL 留空或非法格式失焦后阻断保存并提示', async ({ page }) => {
    await page.locator('.tab-btn', { hasText: 'Confluence' }).click()

    const baseUrlInput = page.locator('#confluence-base-url')
    await baseUrlInput.fill('invalid-url-without-protocol')
    await baseUrlInput.blur()

    await expect(page.locator('.field-group', { hasText: 'Confluence Server URL' })).toContainText(
      '必须为有效的 http:// 或 https:// 地址'
    )

    await page.locator('button.confirm-btn').click()
    await expect(page.locator('.error-text', { hasText: '请先修正 Confluence 配置中的格式错误' })).toBeVisible()
  })

  // TID-11-1-02 (P1): 验证修改 Base URL / Username 且存在已有 Token 时显示复用 Notice Banner
  test('修改已存 Token 对应的 Base URL 或 Username 应显示 Token 复用提醒 Notice', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.__TAURI_MOCK__.__registerHandler('get_config', () => ({
        ok: true,
        data: {
          confluence: {
            baseUrl: 'https://old-server.atlassian.net/wiki',
            username: 'old-user@example.com',
            spaceKey: 'DOCS',
            parentPageId: '',
            ignoreSsl: false,
          },
        },
      }))
      w.__TAURI_MOCK__.__registerHandler('get_confluence_token_status', () => ({
        ok: true,
        data: { hasToken: true },
      }))
    })

    // 重新打开弹窗以加载 mock 配置
    await page.locator('.close-btn').click()
    await page.evaluate(() => {
      ;(window as any).__OPEN_SETTINGS__()
    })
    await page.locator('.tab-btn', { hasText: 'Confluence' }).click()

    // 已有配置时会自动进入第 2 步；需先返回“编辑连接信息”才能看到 Base URL 表单。
    await expect(page.locator('.connection-status')).toBeVisible()
    await page.locator('button', { hasText: '编辑连接信息' }).click()

    // 初始状态下不显示 Notice Banner
    await expect(page.locator('.notice-banner')).not.toBeVisible()

    // 修改 Base URL
    const baseUrlInput = page.locator('#confluence-base-url')
    await baseUrlInput.fill('https://new-server.atlassian.net/wiki')

    // 应展示 Notice Banner 提示复用旧 Token
    await expect(page.locator('.notice-banner')).toBeVisible()
    await expect(page.locator('.notice-banner')).toContainText('已修改 Base URL 或用户名')
  })

  // TID-11-1-03 (P2): 验证关闭弹窗重开后草稿被彻底清空
  test('编辑表单后关闭弹窗，重新打开时草稿被彻底重置', async ({ page }) => {
    await page.locator('.tab-btn', { hasText: 'Confluence' }).click()

    const baseUrlInput = page.locator('#confluence-base-url')
    await baseUrlInput.fill('https://draft-server.atlassian.net')
    await baseUrlInput.blur()

    // 关闭弹窗
    await page.locator('.close-btn').click()

    // 重新打开弹窗
    await page.evaluate(() => {
      ;(window as any).__OPEN_SETTINGS__()
    })
    await page.locator('.tab-btn', { hasText: 'Confluence' }).click()

    // 不应残留未保存的草稿值
    await expect(baseUrlInput).toHaveValue('')
    await expect(page.locator('.error-text', { hasText: 'Base URL' })).not.toBeVisible()
  })
})
