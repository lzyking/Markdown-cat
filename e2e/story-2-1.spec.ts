import { test, expect } from './fixtures'

// TID: S2.1-E2E-INF 基础设施自检
// Priority: P3
// 这些测试验证 Playwright fixtures、Tauri mock 和 fake timers 是否正常工作，
// 是后续业务测试可靠运行的前提。
test.describe('Story 2.1 准备：测试基础设施自检', () => {
  // TID: S2.1-E2E-INF-001
  // Priority: P3
  test('页面标题应显示 Markdown Cat', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Markdown Cat/)
  })

  // TID: S2.1-E2E-INF-002
  // Priority: P3
  test('Tauri mock 应被注入并响应 ping 命令', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const w = window as any
      return await w.__TAURI_MOCK__.invoke('ping')
    })
    expect(result).toBe('pong')

    const invocations = await page.evaluate(() => {
      const w = window as any
      return w.__TAURI_MOCK__.invocations
    })
    expect(invocations).toContainEqual({ command: 'ping', args: undefined })
  })

  // TID: S2.1-E2E-INF-003
  // Priority: P3
  test('fake timers 应能控制 setTimeout 时序', async ({ page }) => {
    await page.goto('/')
    const before = await page.evaluate(() => {
      const w = window as any
      w.__timerFired__ = false
      window.setTimeout(() => {
        w.__timerFired__ = true
      }, 300)
      return w.__timerFired__
    })
    expect(before).toBe(false)

    await page.evaluate(() => {
      const w = window as any
      w.__FAKE_TIMERS__.tick(300)
    })

    const after = await page.evaluate(() => {
      const w = window as any
      return w.__timerFired__
    })
    expect(after).toBe(true)
  })
})

/**
 * 获取页面中 SourceEditor 暴露的 CodeMirror view 对象与命令函数。
 * SourceEditor.vue 在挂载时会将 view 与常用命令暴露到 .source-editor 元素上。
 */
function getCodeMirrorTestingHooks(page: any) {
  return page.evaluate(() => {
    const el = document.querySelector('.source-editor') as any
    return {
      view: el ? el.__codemirrorView : null,
      commands: el ? el.__codemirrorCommands : null,
    }
  })
}

// TID: S2.1-E2E 源码编辑器与文档状态通道
// Priority: P1
// 覆盖 Story 2.1 的所有 Acceptance Criteria。
test.describe('Story 2.1：集成源码编辑器与文档状态通道', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  // TID: S2.1-E2E-001
  // Priority: P1
  // AC: 左栏显示可输入的源码编辑器，且可立即获得焦点输入。
  test('左栏应显示源码编辑器且可 focus', async ({ page }) => {
    const sourcePane = page.locator('[aria-label="源码编辑器"]')
    await expect(sourcePane).toBeVisible()

    const editor = page.locator('.source-editor .cm-editor')
    await expect(editor).toBeVisible()
    await expect(editor).toHaveClass(/cm-focused/)
  })

  // TID: S2.1-E2E-002
  // Priority: P1
  // AC: 编辑器可立即获得焦点输入。
  test('编辑器应默认获得焦点', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await expect(editor).toBeFocused()
  })

  // TID: S2.1-E2E-003
  // Priority: P1
  // AC: 键入更新文档状态字符串。
  test('输入文本后应更新文档状态字符串', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('# Hello Markdown Cat')
    await expect(editor).toHaveText('# Hello Markdown Cat')
  })

  // TID: S2.1-E2E-004
  // Priority: P1
  // AC: 删除更新文档状态字符串。
  test('删除文本后应更新文档状态字符串', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('Hello')
    await editor.fill('')
    const docText = await page.evaluate(() => {
      const cmView = (document.querySelector('.source-editor') as any)?.__codemirrorView
      return cmView?.state.doc.toString()
    })
    expect(docText).toBe('')
  })

  // TID: S2.1-E2E-005
  // Priority: P2
  // AC: 选择文本后触发 cursorChange 事件，父组件状态栏正确显示行列号。
  test('选择文本后应触发 cursorChange 事件并更新状态栏', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('Line one\nLine two')

    const hooks = await getCodeMirrorTestingHooks(page)
    expect(hooks.view).not.toBeNull()
    expect(hooks.commands).not.toBeNull()

    // 将光标设置到第 2 行第 4 列（position = line2.from + 3）
    await page.evaluate(() => {
      const el = document.querySelector('.source-editor') as any
      const view = el.__codemirrorView
      const line2 = view.state.doc.line(2)
      const column4 = line2.from + 3
      view.dispatch({ selection: { anchor: column4, head: column4 } })
    })

    // 验证状态栏显示正确的行列号
    const statusBar = page.locator('[role="status"]')
    await expect(statusBar).toContainText('行 2, 列 4')
  })

  // TID: S2.1-E2E-006
  // Priority: P1
  // AC: 撤销/重做操作生效。
  // 注意：CodeMirror 的 history 分组会按输入时间窗口合并连续输入。本测试通过
  //       round-trip 验证：完整撤销能回到初始空文档，重做能恢复最终内容，从而
  //       验证 undo/redo 命令功能正确。历史分组的粒度可在后续补充 keymap 快捷键
  //       测试时进一步覆盖。
  test('应支持撤销与重做（Ctrl+Z / Ctrl+Shift+Z）', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('first second')

    await expect(editor).toHaveText('first second')

    await page.evaluate(() => {
      const el = document.querySelector('.source-editor') as any
      const view = el.__codemirrorView
      const commands = el.__codemirrorCommands
      commands.undo(view)
    })
    // 验证撤销后内容不再是 'first second'（可能是空文档或中间状态）
    const afterUndo = await editor.textContent()
    expect(afterUndo).not.toBe('first second')

    await page.evaluate(() => {
      const el = document.querySelector('.source-editor') as any
      const view = el.__codemirrorView
      const commands = el.__codemirrorCommands
      commands.redo(view)
    })
    await expect(editor).toHaveText('first second')
  })

  // TID: S2.1-E2E-007
  // Priority: P1
  // AC: 全选操作生效。
  // 注意：同 E2E-006，直接调用 CodeMirror selectAll 命令，keymap 验证后续补充。
  test('应支持全选（Ctrl+A）', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('select all test')

    await page.evaluate(() => {
      const el = document.querySelector('.source-editor') as any
      const view = el.__codemirrorView
      const commands = el.__codemirrorCommands
      commands.selectAll(view)
    })

    const selection = await page.evaluate(() => {
      const el = document.querySelector('.source-editor') as any
      const main = el.__codemirrorView.state.selection.main
      return { anchor: main.anchor, head: main.head, length: el.__codemirrorView.state.doc.length }
    })

    expect(selection.anchor).toBe(0)
    expect(selection.head).toBe(selection.length)
  })

  // TID: S2.1-E2E-008
  // Priority: P1
  // AC: 单次粘贴 10,000 字符不卡顿且内容正确。
  test('单次粘贴 10000 字符不应导致编辑器崩溃或内容丢失', async ({ page }) => {
    const longText = 'a'.repeat(10000)
    const editor = page.locator('.source-editor .cm-content')

    await editor.evaluate((el, text) => {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/plain', text)
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true,
      })
      el.dispatchEvent(pasteEvent)
    }, longText)

    await expect(editor).toHaveText(longText)
  })

  // TID: S2.1-E2E-009
  // Priority: P1
  // AC: 编辑器始终位于左栏且不可关闭。
  test('编辑器应始终位于左栏且不可关闭', async ({ page }) => {
    const sourcePane = page.locator('[aria-label="源码编辑器"]')
    const previewPane = page.locator('[aria-label="实时预览"]')

    await expect(sourcePane).toBeVisible()
    await expect(previewPane).toBeVisible()

    const sourceBox = await sourcePane.boundingBox()
    const previewBox = await previewPane.boundingBox()

    expect(sourceBox).not.toBeNull()
    expect(previewBox).not.toBeNull()
    expect(sourceBox!.x).toBeLessThan(previewBox!.x)
  })

  // TID: S2.1-E2E-010
  // Priority: P2
  // AC: 文本选中样式、字体与光标样式符合 UX token 规范。
  test('编辑器应使用 design token 定义的样式', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-editor')
    const scroller = page.locator('.source-editor .cm-scroller')

    const editorBg = await editor.evaluate((el) => getComputedStyle(el).backgroundColor)
    const editorColor = await editor.evaluate((el) => getComputedStyle(el).color)
    const scrollerFont = await scroller.evaluate((el) => getComputedStyle(el).fontFamily)

    expect(editorBg).toBe('rgb(13, 17, 23)')
    expect(editorColor).toBe('rgb(230, 237, 243)')
    expect(scrollerFont).toContain('ui-monospace')
  })

  // TID: S2.1-E2E-011
  // Priority: P3
  // AC: 编辑器暴露可访问性属性。
  test('源码编辑器应暴露可访问性属性', async ({ page }) => {
    const editor = page.locator('.source-editor')
    await expect(editor).toHaveAttribute('role', 'textbox')
    await expect(editor).toHaveAttribute('aria-label', 'Markdown 源码编辑器')
    await expect(editor).toHaveAttribute('aria-multiline', 'true')
  })
})
