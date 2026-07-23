import { spawn, type ChildProcess } from 'node:child_process'

let viteProcess: ChildProcess | null = null

/**
 * 全局测试前置：启动 Vite dev server 供 E2E 测试使用。
 *
 * 由于 Playwright 内置的 webServer 在检测本地服务启动时存在超时问题，
 * 改为在 globalSetup 中直接启动 Vite，测试结束后在 globalTeardown 中关闭。
 */
export default async function globalSetup() {
  const port = process.env.E2E_PORT || '1420'

  viteProcess = spawn(
    'node',
    ['./node_modules/vite/bin/vite.js', '--port', port, '--strictPort', '--host'],
    {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' },
    }
  )

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for Vite dev server'))
    }, 120 * 1000)

    const onData = (data: Buffer) => {
      const output = data.toString()
      if (output.includes('ready in') || output.includes('Local:')) {
        clearTimeout(timeout)
        viteProcess!.stdout?.off('data', onData)
        viteProcess!.stderr?.off('data', onData)
        resolve()
      }
    }

    viteProcess!.stdout?.on('data', onData)
    viteProcess!.stderr?.on('data', onData)

    viteProcess!.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  process.env.PLAYWRIGHT_BASE_URL = `http://localhost:${port}`
}

export { viteProcess }
