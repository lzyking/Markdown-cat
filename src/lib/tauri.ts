import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { CmdResult } from './types'

export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args)
}

export async function ping(): Promise<CmdResult<string>> {
  return invokeCommand<CmdResult<string>>('ping')
}

export async function initApp(): Promise<CmdResult<null>> {
  return invokeCommand<CmdResult<null>>('init_app')
}

export async function openExternalUrl(url: string): Promise<void> {
  const tauriMock = (window as any).__TAURI_MOCK__
  if (tauriMock?.openUrl) {
    await tauriMock.openUrl(url)
    return
  }
  if (tauriMock?.opener?.openUrl) {
    await tauriMock.opener.openUrl(url)
    return
  }

  try {
    await openUrl(url)
  } catch {
    if (typeof window !== 'undefined' && window.open) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }
}

