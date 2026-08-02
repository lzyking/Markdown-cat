import { createApp } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import App from './App.vue'
import { applyTheme } from './lib/theme'
import { defaultThemeId } from './lib/themes'
import type { AppConfig, CmdResult } from './lib/types'
import './styles/app.css'

// 防止 get_config IPC 挂起导致应用永远无法挂载。
const CONFIG_PRELOAD_TIMEOUT_MS = 2000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('config preload timed out')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

async function bootstrap() {
  applyTheme(defaultThemeId)
  const configPromise = withTimeout(
    invoke<CmdResult<AppConfig>>('get_config'),
    CONFIG_PRELOAD_TIMEOUT_MS
  )

  try {
    const configRes = await configPromise
    if (configRes.ok && configRes.data) {
      applyTheme(configRes.data.themeId)
    }
  } catch (error) {
    console.warn('Failed to preload theme config:', error)
  }

  createApp(App, { configPromise }).mount('#app')
}

bootstrap()
