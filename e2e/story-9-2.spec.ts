import { expect, test } from './fixtures'

const confluenceConfig = {
  savePath: '/tmp/markdown-cat-test',
  confluence: {
    baseUrl: 'https://example.atlassian.net/wiki',
    username: 'cat@example.com',
    spaceKey: 'DOCS',
    parentPageId: '123456',
    ignoreSsl: false,
  },
}

test.describe('Story 9.2：发布 Markdown 到 Confluence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
    await page.evaluate((config) => {
      ;(window as any).__TAURI_MOCK_CONFIG__ = config
    }, confluenceConfig)
  })

  test('File 菜单应提供“发布到 Confluence…”并在成功后展示页面链接', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.__TAURI_MOCK__.__registerHandler('publish_confluence', () => {
        w.__TAURI_MOCK__.emitEvent('confluence-publish-progress', {
          step: '环境检测',
          status: 'done',
          message: 'Confluence 地址、凭据与网络客户端已准备就绪。',
        })
        w.__TAURI_MOCK__.emitEvent('confluence-publish-progress', {
          step: '页面发布',
          status: 'done',
          message: '页面内容已发布，页面 ID：42。',
        })
        w.__TAURI_MOCK__.emitEvent('confluence-publish-progress', {
          step: '附件上传',
          status: 'done',
          message: '无需上传附件，已跳过该步骤。',
        })
        return {
          ok: true,
          data: {
            pageId: '42',
            pageUrl: 'https://example.atlassian.net/wiki/pages/viewpage.action?pageId=42',
            warnings: [],
          },
        }
      })
    })

    const fileMenu = page.locator('.menu-bar .menu-item', { hasText: '文件' })
    await fileMenu.hover()
    await expect(page.locator('.menu-dropdown .menu-row', { hasText: '发布到 Confluence…' })).toBeVisible()
    await page.locator('.menu-dropdown .menu-row', { hasText: '发布到 Confluence…' }).click()

    await expect(page.locator('#publish-confluence-modal-title')).toBeVisible()
    await expect(page.locator('.success-text', { hasText: '已发布到 Confluence' })).toBeVisible()
    await expect(page.locator('.page-url')).toContainText('pageId=42')

    await page.locator('button', { hasText: '打开页面' }).click()

    const openedUrls = await page.evaluate(() => (window as any).__TAURI_MOCK__.openedUrls)
    expect(openedUrls).toContain('https://example.atlassian.net/wiki/pages/viewpage.action?pageId=42')
  })

  test('发布请求应携带 Confluence Storage Format XHTML 与本地图片附件', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.__TAURI_MOCK__.__registerHandler('read_image_asset', (args: any) => {
        if (args?.path !== '/tmp/markdown-cat-test/assets/cat.png') {
          throw new Error(`Unexpected image path: ${args?.path}`)
        }
        return {
          ok: true,
          data: {
            mimeType: 'image/png',
            sizeBytes: 8,
            dataBase64: 'Q0FUSU1BR0U=',
            skippedLarge: false,
          },
        }
      })
      w.__TAURI_MOCK__.__registerHandler('publish_confluence', () => ({
        ok: true,
        data: {
          pageId: '108',
          pageUrl: 'https://example.atlassian.net/wiki/pages/viewpage.action?pageId=108',
          warnings: [],
        },
      }))
    })

    await page.locator('.source-editor .cm-content').fill(
      '# 发布测试\n\n```ts\nconsole.log("cat")\n```\n\n![Cat](./assets/cat.png)\n',
    )

    const fileMenu = page.locator('.menu-bar .menu-item', { hasText: '文件' })
    await fileMenu.hover()
    await page.locator('.menu-dropdown .menu-row', { hasText: '发布到 Confluence…' }).click()

    await expect.poll(async () => {
      return page.evaluate(() => {
        const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
        const calls = invocations.filter((entry) => entry.command === 'publish_confluence')
        return calls.length > 0 ? calls[calls.length - 1].args.payload : null
      })
    }).not.toBeNull()

    const payload = await page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
      const calls = invocations.filter((entry) => entry.command === 'publish_confluence')
      return calls[calls.length - 1].args.payload
    }) as any
    expect(payload.pageTitle).toBe('New_Document')
    expect(payload.storageXhtml).toContain('ac:structured-macro ac:name="code"')
    expect(payload.storageXhtml).toContain('<ac:image><ri:attachment ri:filename="cat.png" /></ac:image>')
    expect(payload.images).toEqual([{ filename: 'cat.png', dataBase64: 'Q0FUSU1BR0U=' }])

    const imageReadCall = await page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
      const imageCalls = invocations.filter((entry) => entry.command === 'read_image_asset')
      return imageCalls[imageCalls.length - 1]
    })
    expect(imageReadCall.args).toEqual({
      path: '/tmp/markdown-cat-test/assets/cat.png',
      maxInlineSizeBytes: 50 * 1024 * 1024,
    })
  })

  test('未安装 md2cf 时应显示友好提示，且进度步骤保持固定顺序并继续发布', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.__TAURI_MOCK__.__registerHandler('check_md2cf_installed', () => ({
        ok: true,
        data: {
          installed: false,
          version: null,
          message: '未检测到 md2cf，将使用内置转换引擎。',
        },
      }))
      w.__TAURI_MOCK__.__registerHandler('publish_confluence', () => {
        w.__TAURI_MOCK__.emitEvent('confluence-publish-progress', {
          step: '页面发布',
          status: 'done',
          message: '页面内容已发布，页面 ID：77。',
        })
        w.__TAURI_MOCK__.emitEvent('confluence-publish-progress', {
          step: '附件上传',
          status: 'done',
          message: '附件上传完成，共上传 1 个文件。',
        })
        w.__TAURI_MOCK__.emitEvent('confluence-publish-progress', {
          step: '环境检测',
          status: 'done',
          message: 'Confluence 地址、凭据与网络客户端已准备就绪。',
        })
        return {
          ok: true,
          data: {
            pageId: '77',
            pageUrl: 'https://example.atlassian.net/wiki/pages/viewpage.action?pageId=77',
            warnings: [],
          },
        }
      })
    })

    const fileMenu = page.locator('.menu-bar .menu-item', { hasText: '文件' })
    await fileMenu.hover()
    await page.locator('.menu-dropdown .menu-row', { hasText: '发布到 Confluence…' }).click()

    await expect(page.locator('.step-message', {
      hasText: '未检测到 md2cf 命令行工具，将使用内置转换引擎完成发布',
    })).toBeVisible()

    const stepNames = await page.locator('.step-name').allTextContents()
    expect(stepNames).toEqual(['环境检测', '附件上传', '页面发布'])

    const publishInvocationCount = await page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
      return invocations.filter((entry) => entry.command === 'publish_confluence').length
    })
    expect(publishInvocationCount).toBe(1)
  })
})
