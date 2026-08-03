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

export interface ConfluenceImageUpload {
  filename: string
  dataBase64: string
}

export interface ConfluencePublishPayload {
  baseUrl: string
  username: string
  apiToken?: string
  spaceKey: string
  parentPageId: string
  ignoreSsl: boolean
  pageTitle: string
  storageXhtml: string
  images: ConfluenceImageUpload[]
}

export interface ConfluencePublishResult {
  pageId: string
  pageUrl: string
  warnings: string[]
}

export interface ConfluencePublishProgress {
  step: string
  status: 'running' | 'done' | 'error'
  message: string
}

export interface DocumentState {
  filename: string
  content: string
}

export interface SaveResult {
  filename: string
  path: string
}

export interface AssetMigrationResult {
  migrated: boolean
  finalFilename?: string | null
}

export interface ClipboardImagePayload {
  mimeType: 'image/png' | 'image/jpeg'
  bytes: string
  positionToken?: number
}

export interface ReadImageAssetResult {
  mimeType: string
  sizeBytes: number
  dataBase64?: string | null
  skippedLarge?: boolean
}
