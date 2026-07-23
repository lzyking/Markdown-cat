import { test, expect } from './fixtures'

// TID: S4.2-E2E 完成系统文件夹选择与配置写入
// Priority: P1
// 覆盖 Story 4.2 的所有 Acceptance Criteria。
test.describe('Story 4.2：完成系统文件夹选择与配置写入', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.source-editor .cm-editor')
  })

  // TID: S4.2-E2E-001
  // Priority: P1
  // AC: 点击“选择...”后更新选中的保存路径，使“确认”按钮变为可用。
  test('点击选择按钮后应调起选择并回显新路径，启用确认按钮', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).__OPEN_SETTINGS__()
    })

    const selectBtn = page.locator('.modal-body .select-btn')
    const confirmBtn = page.locator('.modal-footer .confirm-btn')
    const pathInput = page.locator('.modal-body .path-input')

    await expect(confirmBtn).toBeDisabled()

    // 点击选择... 调起 mock 的 select_save_dir
    await selectBtn.click()

    await expect(pathInput).toHaveValue('/tmp/custom-markdown-save-dir')
    await expect(confirmBtn).toBeEnabled()
  })

  // TID: S4.2-E2E-002
  // Priority: P1
  // AC: 点击确认后调用 set_config 持久化，关闭 Modal 并更新全局保存路径。
  test('点击确认后应调用 set_config 写入配置并更新全局保存路径', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).__OPEN_SETTINGS__()
    })

    await page.locator('.modal-body .select-btn').click()
    await page.locator('.modal-footer .confirm-btn').click()

    // Modal 关闭
    await expect(page.locator('.modal-backdrop')).toHaveCount(0)

    // 全局保存路径已更新
    const currentPath = await page.evaluate(() => {
      return (window as any).__GET_CURRENT_SAVE_PATH__()
    })
    expect(currentPath).toBe('/tmp/custom-markdown-save-dir')

    // 验证调用了 set_config 参数
    const invocations = await page.evaluate(() => {
      return (window as any).__TAURI_MOCK__.invocations
    })
    const setConfigCalls = invocations.filter((inv: any) => inv.command === 'set_config')
    expect(setConfigCalls.length).toBeGreaterThan(0)
    expect(setConfigCalls[setConfigCalls.length - 1].args).toEqual({
      savePath: '/tmp/custom-markdown-save-dir',
    })
  })

  // TID: S4.2-E2E-003
  // Priority: P1
  // AC: 配置写入失败时，对话框不关闭并显示明确错误提示。
  test('配置写入失败时不关闭 Modal 且显示明确错误提示', async ({ page }) => {
    // mock set_config 返回失败
    await page.evaluate(() => {
      const mock = (window as any).__TAURI_MOCK__
      mock.__registerHandler('set_config', () => ({
        ok: false,
        error: 'ERR_WRITE_CONFIG_FAILED',
      }))
      ;(window as any).__OPEN_SETTINGS__()
    })

    await page.locator('.modal-body .select-btn').click()
    await page.locator('.modal-footer .confirm-btn').click()

    // Modal 保持打开
    await expect(page.locator('.modal-backdrop')).toBeVisible()

    // 显示错误提示
    const errorText = page.locator('.modal-body .error-text')
    await expect(errorText).toBeVisible()
    await expect(errorText).toHaveText('配置保存失败：ERR_WRITE_CONFIG_FAILED')
  })

  // TID: S4.2-E2E-004
  // Priority: P1
  // AC: Action Item A7 存盘连通 — 修改路径后自动保存关联新路径。
  test('Action Item A7：保存路径更新后，自动保存传入新路径作为目标', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).__OPEN_SETTINGS__()
    })

    await page.locator('.modal-body .select-btn').click()
    await page.locator('.modal-footer .confirm-btn').click()

    // 用户在编辑器打字触发自动保存
    const editor = page.locator('.source-editor .cm-content')
    await editor.fill('Testing auto save with new path')

    await page.evaluate(async () => {
      ;(window as any).__FAKE_TIMERS__.tick(300)
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })

    const invocations = await page.evaluate(() => {
      return (window as any).__TAURI_MOCK__.invocations
    })
    const saveCalls = invocations.filter((inv: any) => inv.command === 'save_document')
    const lastSave = saveCalls[saveCalls.length - 1]

    expect(lastSave.args.savePath).toBe('/tmp/custom-markdown-save-dir')
  })
})
