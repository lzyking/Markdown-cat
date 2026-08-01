export interface CmdResult<T> {
  ok: boolean
  data?: T
  error?: string
}

export interface AppConfig {
  savePath: string | null
  lastOpenedFile: string | null
  themeId: string
}

export interface DocumentState {
  filename: string
  content: string
}

export interface SaveResult {
  filename: string
  path: string
}
