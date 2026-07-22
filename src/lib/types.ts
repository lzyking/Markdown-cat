export interface CmdResult<T> {
  ok: boolean
  data?: T
  error?: string
}
