import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

async function dispatchClipboardImagePaste(
  page: Page,
  options: {
    type: 'image/png' | 'image/jpeg'
    name: string
    bytes: number[]
    includeTextItem?: boolean
  },
) {
  await page.evaluate(async ({ type, name, bytes, includeTextItem }) => {
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
    const textItem = {
      kind: 'string',
      type: 'text/plain',
      getAsFile: () => null,
    }

    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', {
      value: {
        items: includeTextItem ? [textItem, imageItem] : [imageItem],
        files: [file],
      },
    })

    target.dispatchEvent(event)
    await Promise.resolve()
    await Promise.resolve()
  }, options)
}

test.describe('Story 7.2：剪贴板图片粘贴与同目录本地存储', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  test('未保存文档粘贴图片时应暂存到默认目录 assets 并插入相对路径', async ({ page }) => {
    await dispatchClipboardImagePaste(page, {
      type: 'image/png',
      name: 'clipboard.png',
      bytes: [137, 80, 78, 71],
      includeTextItem: true,
    })

    await expect.poll(async () => page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString() ?? ''
    })).toMatch(/^!\[Image\]\(\.\/assets\/img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png\)$/)

    const saveCall = await page.evaluate(() => {
      const invocations = (window as any).__TAURI_MOCK__.invocations
      return invocations.filter((inv: any) => inv.command === 'save_image_asset').at(-1)
    })

    expect(saveCall.args.targetDir).toBe('/tmp/markdown-cat-test/assets')
    expect(saveCall.args.bytes).toEqual([137, 80, 78, 71])
    expect(saveCall.args.filename).toMatch(/^img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png$/)

    const previewImage = page.locator('.preview-content img')
    await expect(previewImage).toHaveAttribute(
      'src',
      /asset:\/\/localhost\/tmp\/markdown-cat-test\/assets\/img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.png/,
    )
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
    expect(saveCall.args.filename).toMatch(/^img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.jpg$/)

    const previewImage = page.locator('.preview-content img')
    await expect(previewImage).toHaveAttribute(
      'src',
      /asset:\/\/localhost\/tmp\/markdown-cat-test\/img_\d{8}_\d{6}_\d{3}_[0-9a-f]{4}\.jpg/,
    )
  })
})
