import { test, expect } from './fixtures'

// TID: S9.1-E2E 接入 Confluence REST API 配置设置对话框
// Priority: P1
// 覆盖 Story 9.1 的核心 Acceptance Criteria：设置界面渲染、正则校验、测试连接反馈。
test.describe('Story 9.1：Confluence REST API 配置设置对话框', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
    await page.evaluate(() => {
      ;(window as any).__OPEN_SETTINGS__()
    })
  })

  // AC1: 设置面板增加 Confluence 标签页，提供 5 个输入字段。
  test('切换到 Confluence 标签页应渲染全部输入字段与 SSL 开关', async ({ page }) => {
    await page.locator('.tab-btn', { hasText: 'Confluence' }).click()

    await expect(page.locator('#confluence-base-url')).toBeVisible()
    await expect(page.locator('#confluence-username')).toBeVisible()
    await expect(page.locator('#confluence-api-token')).toBeVisible()
    await expect(page.locator('#confluence-space-key')).toBeVisible()
    await expect(page.locator('#confluence-parent-page-id')).toBeVisible()
    await expect(page.locator('.checkbox-row')).toContainText('忽略 SSL 校验')
  })

  // AC5: Space Key 与 Parent Page ID 应在失焦时进行正则校验并给出错误提示。
  test('非法 Space Key 与 Parent Page ID 失焦后应显示格式错误提示', async ({ page }) => {
    await page.locator('.tab-btn', { hasText: 'Confluence' }).click()

    const spaceKeyInput = page.locator('#confluence-space-key')
    await spaceKeyInput.fill('bad space!')
    await spaceKeyInput.blur()
    await expect(page.locator('.field-group', { hasText: 'Space Key' })).toContainText(
      '仅支持字母、数字和下划线'
    )

    const parentPageIdInput = page.locator('#confluence-parent-page-id')
    await parentPageIdInput.fill('abc123')
    await parentPageIdInput.blur()
    await expect(page.locator('.field-group', { hasText: 'Parent Page ID' })).toContainText(
      '仅支持数字'
    )
  })

  // AC2 + AC4: 测试连接按钮应调用 md2cf 检测与 REST API 连通性测试，并展示明确反馈。
  test('点击测试连接应展示 md2cf 检测结果与连接成功反馈', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.__TAURI_MOCK__.__registerHandler('check_md2cf_installed', () => ({
        ok: true,
        data: { installed: true, version: 'md2cf 2.0.0', message: '已检测到 md2cf（md2cf 2.0.0）。' },
      }))
      w.__TAURI_MOCK__.__registerHandler('test_confluence_connection', () => ({
        ok: true,
        data: { success: true, message: '连接成功，已验证空间访问权限。', statusCode: 200 },
      }))
    })

    await page.locator('.tab-btn', { hasText: 'Confluence' }).click()
    await page.locator('#confluence-base-url').fill('https://example.atlassian.net/wiki')
    await page.locator('#confluence-username').fill('user@example.com')
    await page.locator('#confluence-api-token').fill('token-123')
    await page.locator('#confluence-space-key').fill('DOCS')

    await page.locator('button', { hasText: '测试连接' }).click()

    await expect(page.locator('.status-text', { hasText: '已检测到 md2cf' })).toBeVisible()
    await expect(page.locator('.status-text', { hasText: '连接成功' })).toBeVisible()
  })

  // AC3: API Token 不应以明文形式回显；已保存令牌时输入框应显示占位提示而非明文。
  test('已保存 Token 时输入框应显示占位提示而非明文', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.__TAURI_MOCK__.__registerHandler('get_confluence_token_status', () => ({
        ok: true,
        data: { hasToken: true },
      }))
    })

    // 重新打开设置弹窗以触发 loadConfluenceSettings 读取更新后的 handler。
    await page.locator('.close-btn').click()
    await page.evaluate(() => {
      ;(window as any).__OPEN_SETTINGS__()
    })
    await page.locator('.tab-btn', { hasText: 'Confluence' }).click()

    const tokenInput = page.locator('#confluence-api-token')
    await expect(tokenInput).toHaveValue('')
    await expect(tokenInput).toHaveAttribute('placeholder', /已保存令牌/)
    await expect(page.locator('.token-hint')).toContainText('当前已保存安全令牌')
  })
})
