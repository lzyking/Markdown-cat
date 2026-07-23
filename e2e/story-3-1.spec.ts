import { test, expect } from './fixtures'

// TID: S3.1-E2E 接入 300ms 防抖自动保存流程
// Priority: P1
// 覆盖 Story 3.1 的所有 Acceptance Criteria。
test.describe('Story 3.1：接入 300ms 防抖自动保存流程', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  // TID: S3.1-E2E-001
  // Priority: P1
  // AC: 连续键入期间不应触发 save_document 写盘，仅在停止输入 300ms 后触发一次。
  test('防抖前 200ms 不应触发 save_document，满 300ms 后触发一次', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('hello debounce')

    // 检查在前 200ms 内，save_document 尚未被调用
    await page.evaluate(async () => {
      ;(window as any).__FAKE_TIMERS__.tick(200)
      await Promise.resolve()
    })

    const countBefore = await page.evaluate(() => {
      const mock = (window as any).__TAURI_MOCK__
      return mock.invocations.filter((i: any) => i.command === 'save_document').length
    })
    expect(countBefore).toBe(0)

    // 继续演进时间至满 300ms 并等待异步微任务完成
    await page.evaluate(async () => {
      ;(window as any).__FAKE_TIMERS__.tick(100)
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })

    const saveInvocations = await page.evaluate(() => {
      const mock = (window as any).__TAURI_MOCK__
      return mock.invocations.filter((i: any) => i.command === 'save_document')
    })
    expect(saveInvocations.length).toBe(1)
    expect(saveInvocations[0].args.content).toBe('hello debounce')
  })

  // TID: S3.1-E2E-002
  // Priority: P1
  // AC: 连续快速键入多次，防抖定时器自动重置，最终有且仅有 1 次 save_document 调用。
  test('连续快速输入时应重置定时器，最终仅触发 1 次保存', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')

    // 模拟连续键入，每次间隔 100ms
    for (let i = 1; i <= 5; i++) {
      await editor.fill(`step ${i}`)
      await page.evaluate(async () => {
        ;(window as any).__FAKE_TIMERS__.tick(100)
        for (let k = 0; k < 5; k++) await Promise.resolve()
      })
    }

    // 在这期间由于每次 100ms 就再次变动，防抖重置，save_document 不应被调用
    const countMid = await page.evaluate(() => {
      const mock = (window as any).__TAURI_MOCK__
      return mock.invocations.filter((i: any) => i.command === 'save_document').length
    })
    expect(countMid).toBe(0)

    // 停止输入 300ms 后
    await page.evaluate(async () => {
      ;(window as any).__FAKE_TIMERS__.tick(300)
      for (let k = 0; k < 5; k++) await Promise.resolve()
    })

    const saveInvocations = await page.evaluate(() => {
      const mock = (window as any).__TAURI_MOCK__
      return mock.invocations.filter((i: any) => i.command === 'save_document')
    })

    expect(saveInvocations.length).toBe(1)
    expect(saveInvocations[0].args.content).toBe('step 5')
  })

  // TID: S3.1-E2E-003
  // Priority: P1
  // AC: 自动保存成功后更新 saveStatus 与状态栏已保存提示。
  test('自动保存成功后状态栏与标题栏应得到反馈', async ({ page }) => {
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('Auto save feedback test')

    // 满 300ms 防抖并触发并等待 Promise 渲染
    await page.evaluate(async () => {
      ;(window as any).__FAKE_TIMERS__.tick(300)
      for (let k = 0; k < 5; k++) await Promise.resolve()
    })

    // 标题栏应显示绿色成功圆点
    const successDot = page.locator('.title-bar .status-dot.success')
    await expect(successDot).toBeVisible()

    // 状态栏应显示已保存文案
    const statusBarLeft = page.locator('.status-bar .left')
    await expect(statusBarLeft).toContainText('已保存至')
  })
})
