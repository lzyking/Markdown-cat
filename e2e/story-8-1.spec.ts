import { test, expect } from './fixtures'

test.describe('Story 8.1：导出自包含 HTML', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  test('File 菜单应提供 Export as HTML，并导出带内联样式与 Base64 图片的 HTML', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.__TAURI_MOCK_SAVE_DIALOG_RESULT__ = '/tmp/markdown-cat-test/exported.html'
      w.__TAURI_MOCK__.__registerHandler('read_image_asset', (args: any) => {
        if (args?.path !== '/tmp/markdown-cat-test/assets/cat.png') {
          throw new Error(`Unexpected image path: ${args?.path}`)
        }
        return {
          ok: true,
          data: {
            mimeType: 'image/png',
            sizeBytes: 4,
            dataBase64: 'QUJDRA==',
            skippedLarge: false,
          },
        }
      })
    })

    await page.locator('.source-editor .cm-content').fill('# Export\n\n![Cat](./assets/cat.png)')

    const fileMenu = page.locator('.menu-bar .menu-item', { hasText: '文件' })
    await fileMenu.hover()
    await page.locator('.menu-dropdown .menu-row', { hasText: '导出为 HTML (Export as HTML)…' }).click()

    const dialogCall = await page.evaluate(() => {
      const entries = (window as any).__TAURI_MOCK__.dialogInvocations as Array<any>
      return entries[entries.length - 1] || null
    })

    expect(dialogCall?.method).toBe('save')
    expect(dialogCall?.options?.filters).toEqual([{ name: 'HTML', extensions: ['html'] }])
    expect(dialogCall?.options?.defaultPath).toBe('/tmp/markdown-cat-test/New_Document.html')

    await expect.poll(async () => page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
      const exportCalls = invocations.filter(
        (entry) => entry.command === 'write_export_file' && entry.args?.targetPath === '/tmp/markdown-cat-test/exported.html',
      )
      return exportCalls.length > 0 ? exportCalls[exportCalls.length - 1].args.content : null
    })).not.toBeNull()

    const exportHtml = await page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
      const exportCalls = invocations.filter(
        (entry) => entry.command === 'write_export_file' && entry.args?.targetPath === '/tmp/markdown-cat-test/exported.html',
      )
      return exportCalls.length > 0 ? exportCalls[exportCalls.length - 1].args.content : ''
    }) as string

    expect(exportHtml).toContain('<style>')
    expect(exportHtml).toContain('.preview-pane-inner')
    expect(exportHtml).toContain('data:image/png;base64,QUJDRA==')
    expect(exportHtml).not.toContain('./assets/cat.png')

    const imageReadCall = await page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
      const imageCalls = invocations.filter((entry) => entry.command === 'read_image_asset')
      return imageCalls.length > 0 ? imageCalls[imageCalls.length - 1] : null
    })
    expect(imageReadCall?.args).toEqual({
      path: '/tmp/markdown-cat-test/assets/cat.png',
      maxInlineSizeBytes: 10 * 1024 * 1024,
    })
  })

  test('DW-17: 当本地图片超过 10MB 跳过内嵌时，应将其 src 改写为绝对 file:// URL', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.__TAURI_MOCK_SAVE_DIALOG_RESULT__ = '/tmp/markdown-cat-test/exported_large.html'
      w.__TAURI_MOCK__.__registerHandler('read_image_asset', (args: any) => {
        if (args?.path !== '/tmp/markdown-cat-test/assets/large.png') {
          throw new Error(`Unexpected image path: ${args?.path}`)
        }
        return {
          ok: true,
          data: {
            mimeType: 'image/png',
            sizeBytes: 15 * 1024 * 1024,
            dataBase64: null,
            skippedLarge: true,
          },
        }
      })
    })

    await page.locator('.source-editor .cm-content').fill('# Export Large\n\n![Large](./assets/large.png)')

    const fileMenu = page.locator('.menu-bar .menu-item', { hasText: '文件' })
    await fileMenu.hover()
    await page.locator('.menu-dropdown .menu-row', { hasText: '导出为 HTML (Export as HTML)…' }).click()

    await expect.poll(async () => page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
      const exportCalls = invocations.filter(
        (entry) => entry.command === 'write_export_file' && entry.args?.targetPath === '/tmp/markdown-cat-test/exported_large.html',
      )
      return exportCalls.length > 0 ? exportCalls[exportCalls.length - 1].args.content : null
    })).not.toBeNull()

    const exportHtml = await page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
      const exportCalls = invocations.filter(
        (entry) => entry.command === 'write_export_file' && entry.args?.targetPath === '/tmp/markdown-cat-test/exported_large.html',
      )
      return exportCalls.length > 0 ? exportCalls[exportCalls.length - 1].args.content : ''
    }) as string

    expect(exportHtml).toContain('src="file:///tmp/markdown-cat-test/assets/large.png"')
    expect(exportHtml).not.toContain('./assets/large.png')
  })
})

