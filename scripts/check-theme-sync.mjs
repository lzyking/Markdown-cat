import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const relativePaths = {
  themesJson: 'src/lib/themes.json',
  appCss: 'src/styles/app.css',
  themesTs: 'src/lib/themes.ts',
  configRs: 'src-tauri/src/config.rs',
}

const filePaths = Object.fromEntries(
  Object.entries(relativePaths).map(([key, relativePath]) => [key, path.join(repoRoot, relativePath)]),
)

function readFile(relativePathKey) {
  return fs.readFileSync(filePaths[relativePathKey], 'utf8')
}

function formatList(values) {
  return values.length > 0 ? values.join(', ') : '(none)'
}

function diffSets(sourceSet, targetSet) {
  const missingFromTarget = [...sourceSet].filter((value) => !targetSet.has(value)).sort()
  const extraInTarget = [...targetSet].filter((value) => !sourceSet.has(value)).sort()
  return { missingFromTarget, extraInTarget }
}

function extractMatches(content, regex) {
  return [...content.matchAll(regex)].map((match) => match[1])
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

function stripCssComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, '')
}

function stripCLikeComments(content) {
  // Shared by TS and Rust: strip `//` line comments, then `/* ... */` block comments.
  return content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

function extractRequiredMatch(content, regex, description, relativePath) {
  const match = content.match(regex)
  if (!match) {
    throw new Error(`Could not extract ${description} from ${relativePath}.`)
  }
  return match[1]
}

function loadThemeIds() {
  const content = readFile('themesJson')
  const parsed = JSON.parse(content)
  if (!parsed || !Array.isArray(parsed.themes)) {
    throw new Error(`Expected "themes" array in ${relativePaths.themesJson}.`)
  }

  const ids = parsed.themes.map((theme, index) => {
    if (!theme || typeof theme.id !== 'string' || theme.id.length === 0) {
      throw new Error(`Invalid theme id at index ${index} in ${relativePaths.themesJson}.`)
    }
    return theme.id
  })

  requireNoDuplicates(ids, relativePaths.themesJson, 'theme ids')

  return new Set(ids)
}

function loadCssThemeIds() {
  const content = stripCssComments(readFile('appCss'))
  const ids = extractMatches(content, /\[data-theme=['"]([^'"]+)['"]\]/g)
  requireNoDuplicates(ids, relativePaths.appCss, 'data-theme selectors')
  return new Set(ids)
}

function loadFrontendDefaultThemeId() {
  const content = stripCLikeComments(readFile('themesTs'))
  return extractRequiredMatch(
    content,
    /export const defaultThemeId\s*=\s*['"]([^'"]+)['"]/,
    'defaultThemeId literal',
    relativePaths.themesTs,
  )
}

function loadRustThemeConfig() {
  const content = stripCLikeComments(readFile('configRs'))
  const validThemeIdsBlock = extractRequiredMatch(
    content,
    /pub const VALID_THEME_IDS:\s*&\[\s*&str\s*\]\s*=\s*&\[(.*?)\];/s,
    'VALID_THEME_IDS array',
    relativePaths.configRs,
  )
  const validThemeIdsList = extractMatches(validThemeIdsBlock, /"([^"]+)"/g)
  requireNoDuplicates(validThemeIdsList, relativePaths.configRs, 'VALID_THEME_IDS entries')
  const validThemeIds = new Set(validThemeIdsList)
  const defaultThemeId = extractRequiredMatch(
    content,
    /const DEFAULT_THEME_ID:\s*&str\s*=\s*"([^"]+)";/,
    'DEFAULT_THEME_ID literal',
    relativePaths.configRs,
  )

  return { validThemeIds, defaultThemeId }
}

function main() {
  try {
    const themeIds = loadThemeIds()
    const cssThemeIds = loadCssThemeIds()
    const frontendDefaultThemeId = loadFrontendDefaultThemeId()
    const { validThemeIds, defaultThemeId: rustDefaultThemeId } = loadRustThemeConfig()

    const errors = []

    const cssDiff = diffSets(themeIds, cssThemeIds)
    if (cssDiff.missingFromTarget.length > 0 || cssDiff.extraInTarget.length > 0) {
      errors.push(
        [
          `Theme ID mismatch between ${relativePaths.themesJson} and ${relativePaths.appCss}.`,
          `  Missing in ${relativePaths.appCss}: ${formatList(cssDiff.missingFromTarget)}`,
          `  Extra in ${relativePaths.appCss}: ${formatList(cssDiff.extraInTarget)}`,
        ].join('\n'),
      )
    }

    const rustDiff = diffSets(themeIds, validThemeIds)
    if (rustDiff.missingFromTarget.length > 0 || rustDiff.extraInTarget.length > 0) {
      errors.push(
        [
          `Theme ID mismatch between ${relativePaths.themesJson} and ${relativePaths.configRs} VALID_THEME_IDS.`,
          `  Missing in ${relativePaths.configRs} VALID_THEME_IDS: ${formatList(rustDiff.missingFromTarget)}`,
          `  Extra in ${relativePaths.configRs} VALID_THEME_IDS: ${formatList(rustDiff.extraInTarget)}`,
        ].join('\n'),
      )
    }

    if (frontendDefaultThemeId !== rustDefaultThemeId) {
      errors.push(
        [
          `Default theme mismatch between ${relativePaths.themesTs} and ${relativePaths.configRs}.`,
          `  ${relativePaths.themesTs}: ${frontendDefaultThemeId}`,
          `  ${relativePaths.configRs}: ${rustDefaultThemeId}`,
        ].join('\n'),
      )
    }

    if (!themeIds.has(frontendDefaultThemeId)) {
      errors.push(
        `Default theme "${frontendDefaultThemeId}" from ${relativePaths.themesTs} is missing from ${relativePaths.themesJson}.`,
      )
    }

    if (!themeIds.has(rustDefaultThemeId)) {
      errors.push(
        `Default theme "${rustDefaultThemeId}" from ${relativePaths.configRs} is missing from ${relativePaths.themesJson}.`,
      )
    }

    if (errors.length > 0) {
      console.error(errors.join('\n\n'))
      process.exit(1)
    }

    console.log(
      `Theme sync OK: ${themeIds.size} themes confirmed across ${relativePaths.themesJson}, ${relativePaths.appCss}, ${relativePaths.themesTs}, and ${relativePaths.configRs}; default=${frontendDefaultThemeId}.`,
    )
    process.exit(0)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

main()
