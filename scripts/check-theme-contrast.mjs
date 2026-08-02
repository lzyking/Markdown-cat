import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const relativePaths = {
  appCss: 'src/styles/app.css',
  themesJson: 'src/lib/themes.json',
}

const filePaths = Object.fromEntries(
  Object.entries(relativePaths).map(([key, relativePath]) => [key, path.join(repoRoot, relativePath)]),
)

const trackedTokens = [
  '--bg-primary',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-muted',
  '--color-accent',
  '--color-accent-foreground',
]

const contrastChecks = [
  ['--color-text-primary', '--bg-primary', 4.5],
  ['--color-text-secondary', '--bg-primary', 4.5],
  ['--color-text-muted', '--bg-primary', 3.0],
  ['--color-accent', '--bg-primary', 3.0],
  ['--color-accent-foreground', '--color-accent', 4.5],
]

function readFile(relativePathKey) {
  return fs.readFileSync(filePaths[relativePathKey], 'utf8')
}

function stripCssComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, '')
}

function extractRequiredMatch(content, regex, description, relativePath) {
  const match = content.match(regex)
  if (!match) {
    throw new Error(`Could not extract ${description} from ${relativePath}.`)
  }
  return match[1]
}

function requireNoDuplicates(values, relativePath, describeDuplicate) {
  const seen = new Set()
  const duplicates = new Set()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  if (duplicates.size > 0) {
    throw new Error(
      `Duplicate ${describeDuplicate} in ${relativePath}: ${[...duplicates].sort().join(', ')}.`,
    )
  }
}

function parseDeclarations(blockContent, blockDescription) {
  const declarations = {}
  const names = []
  for (const match of blockContent.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match
    declarations[name] = value.trim()
    names.push(name)
  }
  requireNoDuplicates(names, relativePaths.appCss, `${blockDescription} token names`)
  return declarations
}

function loadExpectedThemeIds() {
  const parsed = JSON.parse(readFile('themesJson'))
  if (!parsed || !Array.isArray(parsed.themes)) {
    throw new Error(`Expected "themes" array in ${relativePaths.themesJson}.`)
  }
  return parsed.themes.map((theme) => theme.id)
}

function loadThemes() {
  const content = stripCssComments(readFile('appCss'))
  const rootBlock = extractRequiredMatch(content, /:root\s*\{([\s\S]*?)\}/, ':root block', relativePaths.appCss)
  const rootDeclarations = parseDeclarations(rootBlock, ':root')
  const themeMatches = [...content.matchAll(/\[data-theme=['"]([^'"]+)['"]\]\s*\{([\s\S]*?)\}/g)]
  const themeIds = themeMatches.map((match) => match[1])
  requireNoDuplicates(themeIds, relativePaths.appCss, 'data-theme selectors')

  // Guard against the regex silently matching fewer theme blocks than actually
  // declared (e.g. a selector refactor or truncated file) so a coverage gap
  // never masquerades as a passing contrast run.
  const expectedThemeIds = loadExpectedThemeIds()
  const missingFromCss = expectedThemeIds.filter((id) => !themeIds.includes(id))
  if (missingFromCss.length > 0) {
    throw new Error(
      `Expected ${expectedThemeIds.length} themes from ${relativePaths.themesJson} to have a matching ` +
        `[data-theme] block in ${relativePaths.appCss}; missing: ${missingFromCss.join(', ')}.`,
    )
  }

  const themes = themeMatches.map((match) => ({
    name: match[1],
    declarations: parseDeclarations(match[2], `[data-theme='${match[1]}']`),
  }))

  return {
    rootDeclarations,
    themes,
  }
}

function resolveColorToken(tokenName, themeDeclarations, rootDeclarations, themeName, visited = new Set()) {
  if (visited.has(tokenName)) {
    throw new Error(`Circular token reference for ${tokenName} in theme "${themeName}".`)
  }

  const value = themeDeclarations[tokenName] ?? rootDeclarations[tokenName]
  if (!value) {
    throw new Error(`Missing token ${tokenName} for theme "${themeName}" in ${relativePaths.appCss}.`)
  }

  const varMatch = value.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+?)\s*)?\)$/)
  if (varMatch) {
    const [, referencedToken, fallbackValue] = varMatch
    const nextVisited = new Set(visited)
    nextVisited.add(tokenName)
    if (themeDeclarations[referencedToken] || rootDeclarations[referencedToken]) {
      return resolveColorToken(referencedToken, themeDeclarations, rootDeclarations, themeName, nextVisited)
    }
    if (fallbackValue) {
      return fallbackValue.trim().toUpperCase()
    }
    throw new Error(
      `Unresolved token reference ${value} for ${tokenName} in theme "${themeName}" from ${relativePaths.appCss}.`,
    )
  }

  if (!/^#(?:[\dA-Fa-f]{3}|[\dA-Fa-f]{6})$/.test(value)) {
    throw new Error(
      `Unsupported color value "${value}" for ${tokenName} in theme "${themeName}" from ${relativePaths.appCss}.`,
    )
  }

  return value.toUpperCase()
}

function hexToRgbChannels(hex) {
  const normalized = hex.slice(1)
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((channel) => channel + channel)
          .join('')
      : normalized
  return [0, 2, 4].map((index) => parseInt(expanded.slice(index, index + 2), 16) / 255)
}

function getRelativeLuminance(hex) {
  const [r, g, b] = hexToRgbChannels(hex).map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function getContrastRatio(foregroundHex, backgroundHex) {
  const [lighter, darker] = [getRelativeLuminance(foregroundHex), getRelativeLuminance(backgroundHex)].sort(
    (left, right) => right - left,
  )
  return (lighter + 0.05) / (darker + 0.05)
}

function main() {
  try {
    const { rootDeclarations, themes } = loadThemes()
    const failures = []

    for (const theme of themes) {
      const resolvedTokens = Object.fromEntries(
        trackedTokens.map((tokenName) => [
          tokenName,
          resolveColorToken(tokenName, theme.declarations, rootDeclarations, theme.name),
        ]),
      )

      for (const [foregroundToken, backgroundToken, minimumRatio] of contrastChecks) {
        const ratio = getContrastRatio(resolvedTokens[foregroundToken], resolvedTokens[backgroundToken])
        if (ratio < minimumRatio) {
          failures.push(
            `Theme "${theme.name}": ${foregroundToken} vs ${backgroundToken} = ${ratio.toFixed(4)} (required >= ${minimumRatio.toFixed(1)}).`,
          )
        }
      }
    }

    if (failures.length > 0) {
      console.error(failures.join('\n'))
      process.exit(1)
    }

    console.log(
      `Theme contrast OK: ${themes.length} themes passed ${themes.length * contrastChecks.length} contrast checks in ${relativePaths.appCss}.`,
    )
    process.exit(0)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

main()
