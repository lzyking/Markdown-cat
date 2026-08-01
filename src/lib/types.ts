export interface CmdResult<T> {
  ok: boolean
  data?: T
  error?: string
}

export interface AppConfig {
  savePath: string | null
  lastOpenedFile: string | null
  themeId: string
  confluence: ConfluenceConfig
}

export interface ConfluenceConfig {
  baseUrl: string
  username: string
  spaceKey: string
  parentPageId: string
  ignoreSsl: boolean
}

export interface ConfluenceTokenStatus {
  hasToken: boolean
}

export interface Md2cfCheckResult {
  installed: boolean
  version?: string | null
  message: string
}

export interface ConfluenceTestResult {
  success: boolean
  message: string
  statusCode?: number | null
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
