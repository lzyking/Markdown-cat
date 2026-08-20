import { test, expect } from './fixtures'

// TID: S9.1-E2E 接入 Confluence REST API 配置设置对话框（两步式向导）
// Priority: P1
// 覆盖 Confluence 设置面板重构后的核心行为：第一步 PAT+BaseURL 表单、保存后自动进入
// 第二步 Space 搜索/个人空间/页面树浏览、以及手动兜底输入。
test.describe('Story 9.1：Confluence REST API 配置设置对话框', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
    await page.evaluate(() => {
      ;(window as any).__OPEN_SETTINGS__()
    })
  })

  // AC1: 无配置时，Confluence 标签页应只展示第 1 步（Base URL + Token），高级选项默认折叠。
  test('切换到 Confluence 标签页应渲染第 1 步表单，高级选项默认折叠', async ({ page }) => {
    await page.locator('.tab-btn', { hasText: 'Confluence' }).click()

    await expect(page.locator('#confluence-base-url')).toBeVisible()
    await expect(page.locator('#confluence-api-token')).toBeVisible()
    await expect(page.locator('#confluence-username')).not.toBeVisible()
    await expect(page.locator('.checkbox-row')).not.toBeVisible()

    await page.locator('.advanced-options summary').click()
    await expect(page.locator('#confluence-username')).toBeVisible()
    await expect(page.locator('.checkbox-row')).toContainText('忽略 SSL 校验')
  })

  // AC2: 保存 Base URL + Token 成功后应自动进入第 2 步，并展示 Space 搜索与个人空间入口。
  test('保存连接信息成功后应自动进入第 2 步并测试连接', async ({ page }) => {
    await page.locator('.tab-btn', { hasText: 'Confluence' }).click()
    await page.locator('#confluence-base-url').fill('https://example.atlassian.net/wiki')
    await page.locator('#confluence-api-token').fill('token-123')

    await page.locator('.confirm-btn', { hasText: '保存并继续' }).click()

    await expect(page.locator('#confluence-base-url')).toHaveCount(0)
    await expect(page.locator('.connection-status')).toContainText('已连接')
    await expect(page.getByPlaceholder('输入 Space 名称或 Key 关键词搜索…')).toBeVisible()
    await expect(page.locator('button', { hasText: '我的个人空间' })).toBeVisible()
  })

  // AC3: 已有持久化配置时打开设置应直接进入第 2 步并自动测试连接。
  test('已有配置时打开面板应直接进入第 2 步', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).__TAURI_MOCK_CONFIG__ = {
        savePath: null,
        confluence: {
          baseUrl: 'https://example.atlassian.net/wiki',
          username: '',
          spaceKey: 'DOCS',
          parentPageId: '',
          ignoreSsl: false,
        },
      }
    })
    await page.locator('.close-btn').click()
    await page.evaluate(() => {
      ;(window as any).__OPEN_SETTINGS__()
    })
    await page.locator('.tab-btn', { hasText: 'Confluence' }).click()

    await expect(page.locator('#confluence-base-url')).toHaveCount(0)
    await expect(page.locator('.selection-hint')).toContainText('Space DOCS')
    await expect(page.locator('.connection-status')).toContainText('已连接')
  })

  // AC4: 第 2 步搜索/树接口不可用时，仍可通过折叠的手动输入兜底保存 Space Key / Parent Page ID。
  test('手动兜底输入非法 Space Key 应展示格式错误提示，合法输入可保存', async ({ page }) => {
    await page.locator('.tab-btn', { hasText: 'Confluence' }).click()
    await page.locator('#confluence-base-url').fill('https://example.atlassian.net/wiki')
    await page.locator('#confluence-api-token').fill('token-123')
    await page.locator('.confirm-btn', { hasText: '保存并继续' }).click()
    await expect(page.locator('.connection-status')).toContainText('已连接')

    await page.locator('.manual-fallback summary').click()
    const manualSpaceKeyInput = page.locator('#confluence-manual-space-key')
    await manualSpaceKeyInput.fill('bad space!')
    await manualSpaceKeyInput.blur()
    await page.locator('button', { hasText: '使用手动输入的 Space / 页面' }).click()
    await expect(page.locator('.manual-fallback')).toContainText('仅支持字母、数字和下划线')

    await manualSpaceKeyInput.fill('DOCS')
    await page.locator('#confluence-manual-parent-page-id').fill('123456')
    await page.locator('button', { hasText: '使用手动输入的 Space / 页面' }).click()
    await expect(page.locator('.success-text')).toContainText('已保存：Space DOCS')
  })

  // AC5: 展开诊断面板应可单独检测 md2cf 安装状态，不影响 PAT 连接测试。
  test('展开诊断面板应可检测 md2cf 安装状态', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.__TAURI_MOCK__.__registerHandler('check_md2cf_installed', () => ({
        ok: true,
        data: { installed: true, version: 'md2cf 2.0.0', message: '已检测到 md2cf（md2cf 2.0.0）。' },
      }))
    })

    await page.locator('.tab-btn', { hasText: 'Confluence' }).click()
    await page.locator('.diagnostics-panel summary').click()
    await page.locator('button', { hasText: '检测 md2cf 安装状态' }).click()

    await expect(page.locator('.status-text', { hasText: '已检测到 md2cf' })).toBeVisible()
  })

  // AC6: API Token 不应以明文形式回显；已保存令牌时输入框应显示占位提示而非明文。
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

