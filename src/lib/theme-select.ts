import type { CmdResult } from './types'

export interface ThemeSelectOutcome {
  themeId: string
  status: 'success' | 'failure'
  message: string
}

export function resolveThemeSelectionOutcome(
  previousThemeId: string,
  requestedThemeId: string,
  result: CmdResult<null> | null,
  errorMessage?: string,
): ThemeSelectOutcome {
  if (result === null) {
    return {
      themeId: previousThemeId,
      status: 'failure',
      message: `主题保存异常：${errorMessage || '系统错误'}`,
    }
  }

  if (!result.ok) {
    return {
      themeId: previousThemeId,
      status: 'failure',
      message: `主题保存失败：${result.error || '未知错误'}`,
    }
  }

  return {
    themeId: requestedThemeId,
    status: 'success',
    message: `主题已切换为 ${requestedThemeId}`,
  }
}
