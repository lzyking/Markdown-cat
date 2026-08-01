import { test, expect } from './fixtures'

test.describe('Story 8.2：导出高保真 PDF', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  test('File 菜单应提供 Export as PDF，并将完整样式 HTML 交给 export_pdf 命令', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.__TAURI_MOCK_SAVE_DIALOG_RESULT__ = '/Users/max/Project/Markdown Cat/test-artifacts/exported.pdf'
      w.__TAURI_MOCK__.__registerHandler('export_pdf', (args: any) => {
        const savePath = String(args?.savePath || '')
        const pathSegments = savePath.split(/[/\\]/)
        return {
          ok: true,
          data: {
            filename: pathSegments[pathSegments.length - 1] || 'exported.pdf',
            path: savePath,
          },
        }
      })
    })

    await page.locator('.source-editor .cm-content').fill('# Export PDF\n\n```ts\nconsole.log(\"cat\")\n```')

    const fileMenu = page.locator('.menu-bar .menu-item', { hasText: '文件' })
    await fileMenu.hover()
    await page.locator('.menu-dropdown .menu-row', { hasText: '导出为 PDF (Export as PDF)…' }).click()

    const dialogCall = await page.evaluate(() => {
      const entries = (window as any).__TAURI_MOCK__.dialogInvocations as Array<any>
      return entries[entries.length - 1] || null
    })

    expect(dialogCall?.method).toBe('save')
    expect(dialogCall?.options?.filters).toEqual([{ name: 'PDF', extensions: ['pdf'] }])
    expect(String(dialogCall?.options?.defaultPath || '')).toMatch(/\.pdf$/)
    // The default document loaded by the `get_blank_document` mock is named
    // "New_Document.md" -- assert the exact derived basename, not just the
    // `.pdf` extension, so regressions in `derivePdfExportDefaultPath()` are caught.
    expect(String(dialogCall?.options?.defaultPath || '')).toMatch(/New_Document\.pdf$/)

    await expect.poll(async () => page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
      const exportCalls = invocations.filter(
        (entry) => entry.command === 'export_pdf'
          && entry.args?.savePath === '/Users/max/Project/Markdown Cat/test-artifacts/exported.pdf',
      )
      return exportCalls.length > 0 ? exportCalls[exportCalls.length - 1] : null
    })).not.toBeNull()

    const commandCall = await page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
      const exportCalls = invocations.filter(
        (entry) => entry.command === 'export_pdf'
          && entry.args?.savePath === '/Users/max/Project/Markdown Cat/test-artifacts/exported.pdf',
      )
      return exportCalls.length > 0 ? exportCalls[exportCalls.length - 1] : null
    })

    expect(commandCall?.args?.savePath).toBe('/Users/max/Project/Markdown Cat/test-artifacts/exported.pdf')
    expect(commandCall?.args?.html).toContain('<style>')
    expect(commandCall?.args?.html).toContain('.preview-pane-inner')
    expect(commandCall?.args?.html).toContain('<pre')
    await expect(page.locator('.status-bar .left')).toContainText('PDF')
  })
})
