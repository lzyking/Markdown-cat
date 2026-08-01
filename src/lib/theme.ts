import { defaultThemeId, getResolvedThemeId } from './themes'

export function applyTheme(themeId: unknown): string {
  const resolvedThemeId = getResolvedThemeId(themeId)
  document.documentElement.setAttribute('data-theme', resolvedThemeId)
  return resolvedThemeId
}

export function getActiveThemeId(): string {
  return getResolvedThemeId(document.documentElement.getAttribute('data-theme') ?? defaultThemeId)
}
