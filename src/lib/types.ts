export interface CmdResult<T> {
  ok: boolean
  data?: T
  error?: string
}

export interface DocumentState {
  filename: string
  content: string
}

export interface SaveResult {
  filename: string
  path: string
}
