import themeRegistry from './themes.json'

export interface Theme {
  id: string
  name: string
  mode: 'light' | 'dark'
}

export const defaultThemeId = 'midnight-slate'

function isValidTheme(value: unknown): value is Theme {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.length > 0 &&
    (candidate.mode === 'light' || candidate.mode === 'dark')
  )
}

const rawThemes = (themeRegistry as { themes?: unknown[] }).themes ?? []
const themes: Theme[] = rawThemes.filter(isValidTheme)
const themeIdSet = new Set(themes.map((theme) => theme.id))

if (themes.length !== rawThemes.length) {
  // 主题注册表中存在字段缺失或类型错误的条目，跳过以避免运行时异常
  console.warn('[themes] Ignored malformed theme entries in themes.json')
}

export function isThemeId(value: unknown): value is Theme['id'] {
  return typeof value === 'string' && themeIdSet.has(value)
}

export function getResolvedThemeId(value: unknown): Theme['id'] {
  return isThemeId(value) ? value : defaultThemeId
}

export { themes }
