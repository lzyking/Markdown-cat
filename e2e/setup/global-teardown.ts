import { viteProcess } from './global-setup'

/**
 * 全局测试后置：关闭 global-setup 中启动的 Vite dev server。
 */
export default async function globalTeardown() {
  if (viteProcess && !viteProcess.killed) {
    viteProcess.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        viteProcess!.kill('SIGKILL')
        resolve()
      }, 5000)
      viteProcess!.on('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }
}
