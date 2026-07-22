import { invoke } from '@tauri-apps/api/core'
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
