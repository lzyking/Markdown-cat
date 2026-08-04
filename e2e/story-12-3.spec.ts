import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

const RESTORED_FILE_PATH = '/tmp/markdown-cat-test/docs/restored.md'
const RESTORED_FILE_DIR = '/tmp/markdown-cat-test/docs'
const EXPORT_PATH = '/tmp/markdown-cat-test/docs/exported.html'

async function getEditorMarkdown(page: Page) {
  return page.evaluate(() => {
    const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
    return cmView?.state.doc.toString() ?? ''
  })
}

async function setEditorSelectionToEnd(page: Page) {
  await page.evaluate(() => {
    const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
    const doc = cmView?.state.doc.toString() ?? ''
    cmView?.dispatch({ selection: { anchor: doc.length, head: doc.length } })
  })
}

async function dispatchClipboardImagePaste(
  page: Page,
  options: {
    type: 'image/png' | 'image/jpeg'
    name: string
    bytes: number[]
  },
) {
  return page.evaluate(async ({ type, name, bytes }) => {
    const target = document.querySelector('.source-editor .cm-content') as HTMLElement | null
    if (!target) {
      throw new Error('Editor target not found')
    }

    target.focus()

    const file = new File([new Uint8Array(bytes)], name, { type })
    const imageItem = {
      kind: 'file',
      type,
      getAsFile: () => file,
    }

    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', {
      value: {
        types: [type],
        items: [imageItem],
        files: [file],
        getData: () => '',
      },
    })

    target.dispatchEvent(event)
    await Promise.resolve()
    await Promise.resolve()
    const handlerPreventedDefault = (document.querySelector('.source-editor') as any)?.__lastImagePastePreventedDefault
    return { defaultPrevented: event.defaultPrevented, handlerPreventedDefault }
  }, options)
}

async function getLastInvocation(page: Page, command: string) {
  return page.evaluate((invokedCommand) => {
    const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
    return invocations.filter((entry) => entry.command === invokedCommand).at(-1) ?? null
  }, command)
}

test.describe('Story 12.3：会话恢复与资源操作链回归测试', () => {
  test('应用启动恢复上次文件后，应支持粘贴图片、自动保存并导出内联 HTML', async ({ page }) => {
    await page.addInitScript((restoredFilePath) => {
      const w = window as any
      w.__TAURI_MOCK_ENABLE_STARTUP_RESTORE__ = true
      w.__TAURI_MOCK_CONFIG__ = {
        savePath: null,
        lastOpenedFile: restoredFilePath,
        confluence: {
          baseUrl: '',
          username: '',
          spaceKey: '',
          parentPageId: '',
          ignoreSsl: false,
        },
      }
      w.__TAURI_MOCK__.__registerHandler('read_external_document', (args: any) => {
        if (args?.path !== restoredFilePath) {
          throw new Error(`Unexpected restored path: ${args?.path}`)
        }
        return {
          ok: true,
          data: {
            filename: 'restored.md',
            content: 'Restored content',
          },
        }
      })
    }, RESTORED_FILE_PATH)

    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')

    await expect.poll(async () => getEditorMarkdown(page)).toBe('Restored content')

    await setEditorSelectionToEnd(page)

    const { handlerPreventedDefault } = await dispatchClipboardImagePaste(page, {
      type: 'image/png',
      name: 'clipboard.png',
      bytes: [137, 80, 78, 71],
    })
    expect(handlerPreventedDefault).toBe(true)

    await expect.poll(async () => getEditorMarkdown(page)).toMatch(
      /^Restored content!\[Image\]\(\.\/img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png\)$/,
    )

    const pastedMarkdown = await getEditorMarkdown(page)

    await expect.poll(async () => {
      const invocation = await getLastInvocation(page, 'save_image_asset')
      return invocation?.args ?? null
    }).toMatchObject({
      targetDir: RESTORED_FILE_DIR,
    })

    const saveImageCall = await getLastInvocation(page, 'save_image_asset')
    expect(saveImageCall).not.toBeNull()
    expect(saveImageCall?.args.filename).toMatch(/^img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png$/)

    const imageFilename = saveImageCall.args.filename as string
    expect(pastedMarkdown).toBe(`Restored content![Image](./${imageFilename})`)

    await page.evaluate(async () => {
      ;(window as any).__FAKE_TIMERS__.tick(300)
      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve()
      }
    })

    await expect.poll(async () => {
      const invocations = await page.evaluate(() => (window as any).__TAURI_MOCK__.invocations as Array<any>)
      return invocations.filter(
        (entry) => entry.command === 'save_document_as' && entry.args?.targetPath === '/tmp/markdown-cat-test/docs/restored.md',
      ).at(-1) ?? null
    }).toMatchObject({
      args: {
        targetPath: RESTORED_FILE_PATH,
      },
    })

    const autosaveCall = await page.evaluate((restoredFilePath) => {
      const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
      return invocations.filter(
        (entry) => entry.command === 'save_document_as' && entry.args?.targetPath === restoredFilePath,
      ).at(-1) ?? null
    }, RESTORED_FILE_PATH)
    expect(autosaveCall?.args.content).toContain(`![Image](./${imageFilename})`)

    await page.evaluate(({ exportPath, imagePath }) => {
      const w = window as any
      w.__TAURI_MOCK_SAVE_DIALOG_RESULT__ = exportPath
      w.__TAURI_MOCK__.__registerHandler('read_image_asset', (args: any) => {
        if (args?.path !== imagePath) {
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
    }, { exportPath: EXPORT_PATH, imagePath: `${RESTORED_FILE_DIR}/${imageFilename}` })

    const fileMenu = page.locator('.menu-bar .menu-item', { hasText: '文件' })
    await fileMenu.hover()
    await page.locator('.menu-dropdown .menu-row', { hasText: '导出为 HTML (Export as HTML)…' }).click()

    await expect.poll(async () => page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
      const exportCalls = invocations.filter(
        (entry) => entry.command === 'save_document_as' && entry.args?.targetPath === '/tmp/markdown-cat-test/docs/exported.html',
      )
      return exportCalls.length > 0 ? exportCalls[exportCalls.length - 1].args.content : null
    })).not.toBeNull()

    const exportHtml = await page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
      const exportCalls = invocations.filter(
        (entry) => entry.command === 'save_document_as' && entry.args?.targetPath === '/tmp/markdown-cat-test/docs/exported.html',
      )
      return exportCalls.length > 0 ? exportCalls[exportCalls.length - 1].args.content : ''
    }) as string

    expect(exportHtml).toContain('<style>')
    expect(exportHtml).toContain('data:image/png;base64,QUJDRA==')
    expect(exportHtml).not.toContain(`./${imageFilename}`)

    const imageReadCall = await getLastInvocation(page, 'read_image_asset')
    expect(imageReadCall?.args).toEqual({
      path: `${RESTORED_FILE_DIR}/${imageFilename}`,
      maxInlineSizeBytes: 10 * 1024 * 1024,
    })
  })

  test('未显式启用 startup restore test hook 时，应继续跳过启动恢复分支', async ({ page }) => {
    await page.addInitScript((restoredFilePath) => {
      const w = window as any
      w.__TAURI_MOCK_CONFIG__ = {
        savePath: null,
        lastOpenedFile: restoredFilePath,
        confluence: {
          baseUrl: '',
          username: '',
          spaceKey: '',
          parentPageId: '',
          ignoreSsl: false,
        },
      }
      w.__TAURI_MOCK__.__registerHandler('read_external_document', () => {
        throw new Error('Startup restore should remain disabled without opt-in flag')
      })
    }, RESTORED_FILE_PATH)

    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')

    await expect.poll(async () => getEditorMarkdown(page)).toBe('')
    await expect.poll(async () => page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations as Array<any>
      return invocations.filter((entry) => entry.command === 'read_external_document').length
    })).toBe(0)
  })
})
