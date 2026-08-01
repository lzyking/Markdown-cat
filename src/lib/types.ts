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

export interface ClipboardImagePayload {
  mimeType: 'image/png' | 'image/jpeg'
  bytes: number[]
}

export interface ReadImageAssetResult {
  mimeType: string
  sizeBytes: number
  dataBase64?: string | null
  skippedLarge?: boolean
}
