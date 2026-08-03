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

  test('导出 PDF 时应提示内容加载超时', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.__TAURI_MOCK_SAVE_DIALOG_RESULT__ = '/Users/max/Project/Markdown Cat/test-artifacts/load-timeout.pdf'
      w.__TAURI_MOCK__.__registerHandler('export_pdf', () => ({
        ok: false,
        error: 'ERR_PDF_EXPORT_LOAD_TIMEOUT: PDF 预览加载超时',
      }))
    })

    await page.locator('.source-editor .cm-content').fill('# PDF Load Timeout')

    const fileMenu = page.locator('.menu-bar .menu-item', { hasText: '文件' })
    await fileMenu.hover()
    await page.locator('.menu-dropdown .menu-row', { hasText: '导出为 PDF (Export as PDF)…' }).click()

    await expect(page.locator('.status-bar .left')).toContainText('导出 PDF 失败：内容加载超时，请重试')
  })

  test('导出 PDF 时应提示渲染超时', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.__TAURI_MOCK_SAVE_DIALOG_RESULT__ = '/Users/max/Project/Markdown Cat/test-artifacts/render-timeout.pdf'
      w.__TAURI_MOCK__.__registerHandler('export_pdf', () => ({
        ok: false,
        error: 'ERR_PDF_EXPORT_RENDER_TIMEOUT: PDF 渲染超时',
      }))
    })

    await page.locator('.source-editor .cm-content').fill('# PDF Render Timeout')

    const fileMenu = page.locator('.menu-bar .menu-item', { hasText: '文件' })
    await fileMenu.hover()
    await page.locator('.menu-dropdown .menu-row', { hasText: '导出为 PDF (Export as PDF)…' }).click()

    await expect(page.locator('.status-bar .left')).toContainText('导出 PDF 失败：PDF 渲染超时，请重试')
  })

  // Cancellation is only reachable during the HTML/asset-inlining phase: the
  // cancel button (`exportCancelable`) is hidden as soon as the native PDF
  // render phase begins (see `src/App.vue`'s `handleExportPdf`), so a click
  // during that later phase is not a reachable UI path to test here.
  test('取消导出 PDF（HTML 内嵌阶段）时不应调用 export_pdf', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.__TAURI_MOCK_SAVE_DIALOG_RESULT__ = '/Users/max/Project/Markdown Cat/test-artifacts/cancelled.pdf'
      w.__TAURI_MOCK__.__registerHandler('read_image_asset', async () => {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 500))
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
      w.__TAURI_MOCK__.__registerHandler('export_pdf', () => ({
        ok: true,
        data: {
          filename: 'SHOULD_NOT_BE_CALLED.pdf',
          path: 'SHOULD_NOT_BE_CALLED',
        },
      }))
    })

    await page.locator('.source-editor .cm-content').fill('# Export PDF\n\n![Cat](./assets/cat.png)')

    const fileMenu = page.locator('.menu-bar .menu-item', { hasText: '文件' })
    await fileMenu.hover()
    await page.locator('.menu-dropdown .menu-row', { hasText: '导出为 PDF (Export as PDF)…' }).click()

    const cancelButton = page.locator('.export-progress-button', { hasText: '取消导出' })
    await expect(cancelButton).toBeVisible()
    await cancelButton.click()
    await page.evaluate(() => {
      ;(window as any).__FAKE_TIMERS__.tick(500)
    })

    await expect(page.locator('.status-bar .left')).toContainText('PDF 导出已取消')

    const exportPdfCallCount = await page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
      return invocations.filter((entry) => entry.command === 'export_pdf').length
    })
    expect(exportPdfCallCount).toBe(0)
  })

  test('非 macOS 平台应快速提示不支持且不打开保存对话框', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any
      w.__TAURI_MOCK__.__registerHandler('pdf_export_supported', () => false)
      w.__TAURI_MOCK__.__registerHandler('export_pdf', () => ({
        ok: true,
        data: {
          filename: 'SHOULD_NOT_BE_CALLED.pdf',
          path: 'SHOULD_NOT_BE_CALLED',
        },
      }))
    })

    await page.locator('.source-editor .cm-content').fill('# Unsupported PDF Export')

    const saveDialogCountBefore = await page.evaluate(() => {
      const entries = (window as any).__TAURI_MOCK__.dialogInvocations as Array<any>
      return entries.filter((entry) => entry.method === 'save').length
    })

    const fileMenu = page.locator('.menu-bar .menu-item', { hasText: '文件' })
    await fileMenu.hover()
    await page.locator('.menu-dropdown .menu-row', { hasText: '导出为 PDF (Export as PDF)…' }).click()

    await expect(page.locator('.status-bar .left')).toContainText('导出 PDF 失败：当前平台暂不支持 PDF 导出')

    const { saveDialogCountAfter, exportPdfCallCount } = await page.evaluate(() => {
      const tauriMock = (window as any).__TAURI_MOCK__
      const dialogInvocations = tauriMock.dialogInvocations as Array<any>
      const invocations = tauriMock.invocations as Array<any>
      return {
        saveDialogCountAfter: dialogInvocations.filter((entry) => entry.method === 'save').length,
        exportPdfCallCount: invocations.filter((entry) => entry.command === 'export_pdf').length,
      }
    })

    expect(saveDialogCountAfter).toBe(saveDialogCountBefore)
    expect(exportPdfCallCount).toBe(0)
  })
})
