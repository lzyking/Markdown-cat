import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

async function getEditorMarkdown(page: Page) {
  return page.evaluate(() => {
    const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
    return cmView?.state.doc.toString() ?? ''
  })
}

async function registerReadExternalDocumentHandler(page: Page) {
  await page.evaluate(() => {
    const w = window as any
    w.__TAURI_MOCK__.__registerHandler('read_external_document', (args: any) => {
      const path = String(args?.path || '')
      const filename = path.split('/').at(-1) || 'Opened.md'
      return {
        ok: true,
        data: {
          filename,
          content: `Loaded from ${filename}`,
        },
      }
    })
  })
}

async function registerPendingSaveImageAsset(page: Page) {
  await page.evaluate(() => {
    const w = window as any
    w.__PENDING_SAVE_IMAGE_ASSET__ = {
      args: null,
      resolve: null,
    }
    w.__TAURI_MOCK__.__registerHandler('save_image_asset', (args: any) => new Promise((resolve) => {
      w.__PENDING_SAVE_IMAGE_ASSET__.args = args
      w.__PENDING_SAVE_IMAGE_ASSET__.resolve = () => resolve({
        ok: true,
        data: {
          filename: args?.filename || 'img_test.png',
          path: `${args?.targetDir || '/tmp/markdown-cat-test/assets'}/${args?.filename || 'img_test.png'}`,
        },
      })
    }))
  })
}

async function resolvePendingSaveImageAsset(page: Page) {
  await page.evaluate(() => {
    const resolve = (window as any).__PENDING_SAVE_IMAGE_ASSET__?.resolve
    if (!resolve) {
      throw new Error('Pending save_image_asset resolver not found')
    }
    resolve()
  })
}

async function dispatchClipboardImagePaste(
  page: Page,
  options: {
    type: 'image/png' | 'image/jpeg'
    name: string
    bytes: number[]
    includeTextItem?: boolean
    includeHtmlItem?: boolean
  },
) {
  return page.evaluate(async ({ type, name, bytes, includeTextItem, includeHtmlItem }) => {
    const target = document.querySelector('.source-editor .cm-content') as HTMLElement | null
    if (!target) {
      throw new Error('Editor target not found')
    }

    target.focus()

    const file = new File([new Uint8Array(bytes)], name, { type })
    const pastedText = 'Clipboard text'
    const pastedHtml = '<b>Clipboard html</b>'
    const imageItem = {
      kind: 'file',
      type,
      getAsFile: () => file,
    }
    const textItem = {
      kind: 'string',
      type: 'text/plain',
      getAsFile: () => null,
    }
    const htmlItem = {
      kind: 'string',
      type: 'text/html',
      getAsFile: () => null,
    }

    const clipboardTypes = [
      ...(includeTextItem ? ['text/plain'] : []),
      ...(includeHtmlItem ? ['text/html'] : []),
      type,
    ]
    const clipboardItems = [
      ...(includeTextItem ? [textItem] : []),
      ...(includeHtmlItem ? [htmlItem] : []),
      imageItem,
    ]

    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', {
      value: {
        types: clipboardTypes,
        items: clipboardItems,
        files: [file],
        getData: (clipboardType: string) => {
          if (clipboardType === 'text/plain' && includeTextItem) return pastedText
          if (clipboardType === 'text/html' && includeHtmlItem) return pastedHtml
          return ''
        },
      },
    })

    target.dispatchEvent(event)
    await Promise.resolve()
    await Promise.resolve()
    const handlerPreventedDefault = (document.querySelector('.source-editor') as any)?.__lastImagePastePreventedDefault
    return { defaultPrevented: event.defaultPrevented, handlerPreventedDefault }
  }, options)
}

test.describe('Story 7.2：剪贴板图片粘贴与同目录本地存储', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  test('未保存文档粘贴图片时应暂存到默认目录 assets 并插入相对路径', async ({ page }) => {
    const { handlerPreventedDefault } = await dispatchClipboardImagePaste(page, {
      type: 'image/png',
      name: 'clipboard.png',
      bytes: [137, 80, 78, 71],
      includeTextItem: true,
    })
    expect(handlerPreventedDefault).toBe(false)

    await expect.poll(async () => page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString() ?? ''
    })).toMatch(/^Clipboard text!\[Image\]\(\.\/assets\/img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png\)$/)

    const saveCall = await page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations
      return invocations.filter((inv: any) => inv.command === 'save_image_asset').at(-1)
    })

    expect(saveCall.args.targetDir).toBe('/tmp/markdown-cat-test/assets')
    expect(saveCall.args.bytes).toBe('iVBORw==')
    expect(saveCall.args.filename).toMatch(/^img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png$/)

    const previewImage = page.locator('.preview-content img')
    await expect(previewImage).toHaveAttribute(
      'src',
      /asset:\/\/localhost\/tmp\/markdown-cat-test\/assets\/img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png/,
    )
  })

  test('剪贴板仅含受支持图片、无其他可粘贴内容时，应调用 preventDefault 阻止原生粘贴', async ({ page }) => {
    const { handlerPreventedDefault } = await dispatchClipboardImagePaste(page, {
      type: 'image/png',
      name: 'clipboard.png',
      bytes: [137, 80, 78, 71],
    })
    expect(handlerPreventedDefault).toBe(true)

    await expect.poll(async () => page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString() ?? ''
    })).toMatch(/^!\[Image\]\(\.\/assets\/img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png\)$/)
  })

  test('已保存文档粘贴图片时应保存到文档同目录并插入同级相对路径', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('Saved document')

    await page.evaluate(async () => {
      ;(window as any).__FAKE_TIMERS__.tick(300)
      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve()
      }
    })

    await dispatchClipboardImagePaste(page, {
      type: 'image/jpeg',
      name: 'clipboard.jpg',
      bytes: [255, 216, 255, 224],
    })

    await expect.poll(async () => page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString() ?? ''
    })).toMatch(/^Saved document!\[Image\]\(\.\/img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.jpg\)$/)

    const saveCall = await page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations
      return invocations.filter((inv: any) => inv.command === 'save_image_asset').at(-1)
    })

    expect(saveCall.args.targetDir).toBe('/tmp/markdown-cat-test')
    expect(saveCall.args.bytes).toBe('/9j/4A==')
    expect(saveCall.args.filename).toMatch(/^img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.jpg$/)

    const previewImage = page.locator('.preview-content img')
    await expect(previewImage).toHaveAttribute(
      'src',
      /asset:\/\/localhost\/tmp\/markdown-cat-test\/img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.jpg/,
    )
  })

  test('剪贴板同时含图片与 HTML 内容时，粘贴不应整体丢弃原生行为', async ({ page }) => {
    const { handlerPreventedDefault } = await dispatchClipboardImagePaste(page, {
      type: 'image/png',
      name: 'clipboard.png',
      bytes: [137, 80, 78, 71],
      includeHtmlItem: true,
    })
    expect(handlerPreventedDefault).toBe(false)

    // 图片仍应照常异步保存并插入 Markdown 引用。
    await expect.poll(async () => page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations
      return invocations.some((inv: any) => inv.command === 'save_image_asset')
    })).toBe(true)

    // 该纯文本 CodeMirror 编辑器的原生粘贴不会插入 text/html-only 剪贴板内容，
    // 因此最终文档应只包含图片 Markdown 引用，而非丢失或重复内容。
    await expect.poll(async () => page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString() ?? ''
    })).toMatch(/^!\[Image\]\(\.\/assets\/img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png\)$/)
  })

  test('粘贴图片时应替换粘贴瞬间选中的文本，而非写盘完成后的当前选区', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('Hello world')

    // 在粘贴瞬间选中 "world"，模拟"粘贴图片替换选中文本"的原生行为。
    await page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      const doc = cmView.state.doc.toString()
      const from = doc.indexOf('world')
      const to = from + 'world'.length
      cmView.dispatch({ selection: { anchor: from, head: to } })
    })

    await dispatchClipboardImagePaste(page, {
      type: 'image/png',
      name: 'clipboard.png',
      bytes: [137, 80, 78, 71],
    })

    // 写盘完成前，模拟用户在文档另一处继续输入，验证插入位置沿用粘贴瞬间捕获的选区而非当前选区。
    await page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      cmView.dispatch({ changes: { from: 0, insert: 'X' } })
    })

    await expect.poll(async () => page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString() ?? ''
    })).toMatch(/^XHello !\[Image\]\(\.\/assets\/img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png\)$/)
  })

  test('选中文本时粘贴混合内容（文本+图片），原生粘贴插入的文本不应被图片引用覆盖', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('Hello world')

    // 粘贴瞬间选中 "world"：混合内容放行意味着原生粘贴会先用剪贴板文本替换该选区。
    await page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      const doc = cmView.state.doc.toString()
      const from = doc.indexOf('world')
      const to = from + 'world'.length
      cmView.dispatch({ selection: { anchor: from, head: to } })
    })

    const { handlerPreventedDefault } = await dispatchClipboardImagePaste(page, {
      type: 'image/png',
      name: 'clipboard.png',
      bytes: [137, 80, 78, 71],
      includeTextItem: true,
    })
    expect(handlerPreventedDefault).toBe(false)

    // 原生粘贴的文本应保留，图片 Markdown 引用应跟在其后插入，而非替换掉刚粘贴的文本。
    await expect.poll(async () => page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString() ?? ''
    })).toMatch(/^Hello Clipboard text!\[Image\]\(\.\/assets\/img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png\)$/)
  })

  test('保存图片期间切换到另一文档时，不应把 Markdown 图片引用插入到新文档', async ({ page }) => {
    await registerReadExternalDocumentHandler(page)
    await registerPendingSaveImageAsset(page)

    await dispatchClipboardImagePaste(page, {
      type: 'image/png',
      name: 'clipboard.png',
      bytes: [137, 80, 78, 71],
    })

    await expect.poll(async () => page.evaluate(() => Boolean((window as any).__PENDING_SAVE_IMAGE_ASSET__?.args))).toBe(true)

    await page.evaluate(async () => {
      await (window as any).__LOAD_FILE_FROM_PATH__('/docs/other.md')
    })

    await expect.poll(async () => getEditorMarkdown(page)).toBe('Loaded from other.md')

    await resolvePendingSaveImageAsset(page)

    await expect.poll(async () => getEditorMarkdown(page)).toBe('Loaded from other.md')
    await expect(page.locator('.status-bar .left')).toHaveText(/^图片已保存至 img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png，但因文档已切换，未插入 Markdown 引用$/)
  })

  test('保存成功但 sourceEditorRef 整体不可用时，不应报告插入成功', async ({ page }) => {
    await registerPendingSaveImageAsset(page)

    await dispatchClipboardImagePaste(page, {
      type: 'image/png',
      name: 'clipboard.png',
      bytes: [137, 80, 78, 71],
    })

    await expect.poll(async () => page.evaluate(() => Boolean((window as any).__PENDING_SAVE_IMAGE_ASSET__?.args))).toBe(true)

    await page.evaluate(() => {
      ;(window as any).__SET_SOURCE_EDITOR_REF__(null)
    })

    await resolvePendingSaveImageAsset(page)

    await expect.poll(async () => getEditorMarkdown(page)).toBe('')
    await expect(page.locator('.status-bar .left')).toHaveText(/^图片已保存至 img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png，但编辑器当前不可用，未插入 Markdown 引用$/)
    await expect(page.locator('.title-bar .status-dot.success')).toHaveCount(0)
    await expect(page.locator('.title-bar .status-dot.failure')).toHaveCount(1)
  })

  test('sourceEditorRef 存在但 insertText 返回 false 时，仍不应报告插入成功', async ({ page }) => {
    await registerPendingSaveImageAsset(page)

    await dispatchClipboardImagePaste(page, {
      type: 'image/png',
      name: 'clipboard.png',
      bytes: [137, 80, 78, 71],
    })

    await expect.poll(async () => page.evaluate(() => Boolean((window as any).__PENDING_SAVE_IMAGE_ASSET__?.args))).toBe(true)

    await page.evaluate(() => {
      const w = window as any
      w.__INSERT_TEXT_FALSE_STUB__ = {
        insertCalls: 0,
        releasedTokens: [] as string[],
      }
      w.__SET_SOURCE_EDITOR_REF__({
        insertText: () => {
          w.__INSERT_TEXT_FALSE_STUB__.insertCalls += 1
          return false
        },
        releasePositionToken: (token?: string) => {
          if (token !== undefined) {
            w.__INSERT_TEXT_FALSE_STUB__.releasedTokens.push(token)
          }
        },
      })
    })

    await resolvePendingSaveImageAsset(page)

    await expect.poll(async () => getEditorMarkdown(page)).toBe('')
    await expect(page.locator('.status-bar .left')).toHaveText(/^图片已保存至 img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png，但编辑器当前不可用，未插入 Markdown 引用$/)
    await expect(page.locator('.title-bar .status-dot.success')).toHaveCount(0)
    await expect(page.locator('.title-bar .status-dot.failure')).toHaveCount(1)
    await expect.poll(async () => page.evaluate(() => (window as any).__INSERT_TEXT_FALSE_STUB__)).toMatchObject({
      insertCalls: 1,
    })
    await expect.poll(async () => page.evaluate(() => (window as any).__INSERT_TEXT_FALSE_STUB__.releasedTokens.length)).toBe(1)
  })
})
