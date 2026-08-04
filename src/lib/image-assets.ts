export const SUPPORTED_CLIPBOARD_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const

export type SupportedClipboardImageType = (typeof SUPPORTED_CLIPBOARD_IMAGE_TYPES)[number]

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+\-.]*:/i

function pad(value: number, size = 2): string {
  return value.toString().padStart(size, '0')
}

function randomHashSegment(): string {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const values = new Uint8Array(2)
    crypto.getRandomValues(values)
    return Array.from(values)
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 4)
  }

  return Math.random().toString(16).slice(2, 6).padEnd(4, '0')
}

export function isSupportedClipboardImageType(type: string): type is SupportedClipboardImageType {
  return SUPPORTED_CLIPBOARD_IMAGE_TYPES.includes(type as SupportedClipboardImageType)
}

export function getImageExtension(type: SupportedClipboardImageType): 'png' | 'jpg' {
  return type === 'image/jpeg' ? 'jpg' : 'png'
}

export function generateClipboardImageFilename(type: SupportedClipboardImageType, now = new Date()): string {
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('') + `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${pad(now.getMilliseconds(), 3)}`

  return `img_${timestamp}_${randomHashSegment()}.${getImageExtension(type)}`
}

export function getParentDirectory(filePath: string | null | undefined): string | null {
  if (!filePath) {
    return null
  }

  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  if (lastSlash < 0) {
    return filePath.includes(':') ? `${filePath.slice(0, 2)}\\` : null
  }
  if (lastSlash === 0) {
    // POSIX root-level file, e.g. "/note.md" -> parent is "/".
    return '/'
  }
  return filePath.slice(0, lastSlash)
}

function getPathSeparator(path: string): '/' | '\\' {
  return path.includes('\\') ? '\\' : '/'
}

export function joinFilePath(baseDir: string, ...segments: string[]): string {
  const separator = getPathSeparator(baseDir)
  const cleanedSegments = segments
    .map((segment) => segment.replace(/^[\\/]+|[\\/]+$/g, ''))
    .filter(Boolean)
  // A filesystem root ("/" or "\\") trims down to an empty string with the
  // generic rule below, which would drop the leading separator entirely
  // (e.g. joinFilePath('/', 'assets') => 'assets' instead of '/assets').
  if (baseDir === '/' || baseDir === '\\') {
    return baseDir + cleanedSegments.join(separator)
  }
  const trimmedBase = baseDir.replace(/[\\/]+$/, '')
  return [trimmedBase, ...cleanedSegments].join(separator)
}

export function isRelativeAssetPath(path: string): boolean {
  if (ABSOLUTE_URL_PATTERN.test(path) || path.startsWith('//') || path.startsWith('\\\\')) {
    return false
  }
  // POSIX absolute path (e.g. "/images/foo.png") or Windows drive-letter path
  // (e.g. "C:\\images\\foo.png" / "C:/images/foo.png") is not relative either.
  if (path.startsWith('/') || path.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(path)) {
    return false
  }
  return true
}

function getFenceInfo(line: string): { char: '`' | '~'; length: number; rest: string } | null {
  let index = 0
  while (index < line.length && index < 3 && line[index] === ' ') {
    index += 1
  }

  const char = line[index]
  if (char !== '`' && char !== '~') {
    return null
  }

  let end = index
  while (line[end] === char) {
    end += 1
  }

  const length = end - index
  if (length < 3) {
    return null
  }

  return { char, length, rest: line.slice(end) }
}

function stripFencedCodeBlocks(markdown: string): string {
  const parts = markdown.split(/(\r?\n)/)
  const stripped: string[] = []
  let activeFence: { char: '`' | '~'; length: number } | null = null

  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index] ?? ''
    const newline = parts[index + 1] ?? ''

    if (!activeFence) {
      const openingFence = getFenceInfo(line)
      if (openingFence) {
        activeFence = { char: openingFence.char, length: openingFence.length }
        stripped.push('', newline)
        continue
      }

      stripped.push(line, newline)
      continue
    }

    const closingFence = getFenceInfo(line)
    if (
      closingFence
      && closingFence.char === activeFence.char
      && closingFence.length >= activeFence.length
      && /^[ \t]*$/.test(closingFence.rest)
    ) {
      activeFence = null
    }

    stripped.push('', newline)
  }

  return stripped.join('')
}

function mapOutsideFencedCodeBlocks(markdown: string, transform: (segment: string) => string): string {
  const parts = markdown.split(/(\r?\n)/)
  const mapped: string[] = []
  let activeFence: { char: '`' | '~'; length: number } | null = null
  let currentMode: 'protected' | 'transform' | null = null
  let currentParts: string[] = []

  const flush = () => {
    if (!currentMode) {
      return
    }

    const segment = currentParts.join('')
    mapped.push(currentMode === 'transform' ? transform(segment) : segment)
    currentMode = null
    currentParts = []
  }

  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index] ?? ''
    const newline = parts[index + 1] ?? ''

    let mode: 'protected' | 'transform' = 'transform'
    if (!activeFence) {
      const openingFence = getFenceInfo(line)
      if (openingFence) {
        activeFence = { char: openingFence.char, length: openingFence.length }
        mode = 'protected'
      }
    } else {
      mode = 'protected'
      const closingFence = getFenceInfo(line)
      if (
        closingFence
        && closingFence.char === activeFence.char
        && closingFence.length >= activeFence.length
        && /^[ \t]*$/.test(closingFence.rest)
      ) {
        activeFence = null
      }
    }

    if (currentMode !== mode) {
      flush()
      currentMode = mode
    }

    currentParts.push(line, newline)
  }

  flush()
  return mapped.join('')
}

function stripQueryAndFragment(rawCandidate: string): string {
  const queryIndex = rawCandidate.indexOf('?')
  const fragmentIndex = rawCandidate.indexOf('#')
  const cutoff = [queryIndex, fragmentIndex]
    .filter((index) => index >= 0)
    .reduce((smallest, index) => Math.min(smallest, index), rawCandidate.length)

  return rawCandidate.slice(0, cutoff)
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lowercasePercentHex(value: string): string {
  return value.replace(/%[0-9A-Fa-f]{2}/g, (match) => match.toLowerCase())
}

function getReplacementVariantPairs(oldFilename: string, newFilename: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [
    [oldFilename, newFilename],
    [encodeURIComponent(oldFilename), encodeURIComponent(newFilename)],
    [lowercasePercentHex(encodeURIComponent(oldFilename)), lowercasePercentHex(encodeURIComponent(newFilename))],
  ]
  const deduped: Array<[string, string]> = []
  const seen = new Set<string>()

  for (const [oldVariant, newVariant] of pairs) {
    if (seen.has(oldVariant)) {
      continue
    }

    seen.add(oldVariant)
    deduped.push([oldVariant, newVariant])
  }

  return deduped
}

/**
 * 从 Markdown 文本中提取指向 `./assets/<filename>` / `assets/<filename>` 的图片引用文件名。
 * 用于“另存为”时判断是否需要将暂存资源迁移到新目录。
 */
export function extractAssetReferences(markdown: string): string[] {
  const names = new Set<string>()
  const sanitizedMarkdown = stripFencedCodeBlocks(markdown)
  const patterns = [
    /!\[[^\]]*\]\(\s*(?:\.\/)?assets\/([^)\s]+?)(?=\s+(?:"[^"]*"|'[^']*'|\([^)]*\))|\s*\))/g,
    /^\s*\[[^\]]+\]:\s*(?:\.\/)?assets\/([^\s]+)(?=\s+(?:"[^"]*"|'[^']*'|\([^)]*\))|\s*$)/gm,
    /<img\b[^>]*\bsrc\s*=\s*(?:"(?:\.\/)?assets\/([^"]+)"|'(?:\.\/)?assets\/([^']+)'|(?:\.\/)?assets\/([^\s"'=<>`/]+))/gi,
  ]

  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(sanitizedMarkdown)) !== null) {
      const rawCandidate = match.slice(1).find(Boolean)
      if (!rawCandidate) {
        continue
      }

      let candidate: string
      try {
        candidate = decodeURIComponent(stripQueryAndFragment(rawCandidate))
      } catch {
        // Malformed percent-encoding (e.g. a stray "%" in the filename) — skip
        // rather than let this abort "Save As" after the document has already
        // been written to its new location.
        continue
      }
      // Only accept plain filenames — ignore anything with path traversal/segments.
      if (
        candidate
        && candidate !== '..'
        && !candidate.includes('/')
        && !candidate.includes('\\')
      ) {
        names.add(candidate)
      }
    }
  }
  return Array.from(names)
}

/**
 * 从 Markdown 文本中提取指向文档同级目录的图片引用文件名（如 `./img_xxx.png`），
 * 不含任何子目录前缀。用于“另存为”已保存文档时判断需要迁移哪些同目录图片。
 */
export function extractSiblingImageReferences(markdown: string): string[] {
  const sanitizedMarkdown = stripFencedCodeBlocks(markdown)
  const patterns = [
    /!\[[^\]]*\]\(\s*\.\/([^\)\s/\\]+?)(?=\s+(?:"[^"]*"|'[^']*'|\([^)]*\))|\s*\))/g,
    /^\s*\[[^\]]+\]:\s*\.\/([^\s/\\]+)(?=\s+(?:"[^"]*"|'[^']*'|\([^)]*\))|\s*$)/gm,
    /<img\b[^>]*\bsrc\s*=\s*(?:"\.\/([^"]+)"|'\.\/([^']+)'|\.\/([^\s"'=<>`/]+))/gi,
  ]
  const names = new Set<string>()

  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(sanitizedMarkdown)) !== null) {
      const rawCandidate = match.slice(1).find(Boolean)
      if (!rawCandidate) {
        continue
      }

      let candidate: string
      try {
        candidate = decodeURIComponent(stripQueryAndFragment(rawCandidate))
      } catch {
        continue
      }
      if (candidate && !candidate.includes('/') && !candidate.includes('\\') && candidate !== '..') {
        names.add(candidate)
      }
    }
  }

  return Array.from(names)
}

export function replaceAssetReferenceFilename(markdown: string, oldFilename: string, newFilename: string): string {
  if (oldFilename === newFilename) {
    return markdown
  }

  return mapOutsideFencedCodeBlocks(markdown, (segment) => {
    let result = segment
    // A reference may appear in its raw form or percent-encoded (e.g. a filename
    // with spaces written as "%20"); the extractor decodes both to the same
    // logical name, so the replacement must be able to find and rewrite either
    // spelling, not just the decoded one.
    for (const [oldVariant, newVariant] of getReplacementVariantPairs(oldFilename, newFilename)) {
      const escaped = escapeRegExp(oldVariant)
      result = result
        .replace(
          new RegExp(`(!\\[[^\\]]*\\]\\(\\s*)(\\.\\/assets\\/|assets\\/)${escaped}((?:\\?[^)\\s#]*)?(?:#[^)\\s]*)?)(?=(?:\\s+["'(]|\\s*\\)))`, 'g'),
          (_, prefix: string, assetPrefix: string, suffix: string) => `${prefix}${assetPrefix}${newVariant}${suffix}`,
        )
        .replace(
          new RegExp(`^(\\s*\\[[^\\]]+\\]:\\s*)(\\.\\/assets\\/|assets\\/)${escaped}((?:\\?[^\\s#]*)?(?:#[^\\s]*)?)(?=(?:\\s+["'(]|\\s*$))`, 'gm'),
          (_, prefix: string, assetPrefix: string, suffix: string) => `${prefix}${assetPrefix}${newVariant}${suffix}`,
        )
        .replace(
          new RegExp(`(<img\\b[^>]*\\bsrc\\s*=\\s*["'])(\\.\\/assets\\/|assets\\/)${escaped}((?:\\?[^"'#]*)?(?:#[^"']*)?)(?=["'])`, 'gi'),
          (_, prefix: string, assetPrefix: string, suffix: string) => `${prefix}${assetPrefix}${newVariant}${suffix}`,
        )
        .replace(
          new RegExp(`(<img\\b[^>]*\\bsrc\\s*=\\s*)(\\.\\/assets\\/|assets\\/)${escaped}((?:\\?[^\\s>#]*)?(?:#[^\\s>]*)?)(?=\\/?>|\\s)`, 'gi'),
          (_, prefix: string, assetPrefix: string, suffix: string) => `${prefix}${assetPrefix}${newVariant}${suffix}`,
        )
    }
    return result
  })
}

export function replaceSiblingImageReferenceFilename(markdown: string, oldFilename: string, newFilename: string): string {
  if (oldFilename === newFilename) {
    return markdown
  }

  return mapOutsideFencedCodeBlocks(markdown, (segment) => {
    let result = segment
    // Mirrors `replaceAssetReferenceFilename`'s raw + percent-encoded variant
    // handling, so a sibling image reference written with an encoded filename
    // (e.g. spaces as "%20") is rewritten too instead of being left stale.
    for (const [oldVariant, newVariant] of getReplacementVariantPairs(oldFilename, newFilename)) {
      const escaped = escapeRegExp(oldVariant)
      result = result
        .replace(
          new RegExp(`(!\\[[^\\]]*\\]\\(\\s*\\.\\/)${escaped}((?:\\?[^)\\s#]*)?(?:#[^)\\s]*)?)(?=(?:\\s+["'(]|\\s*\\)))`, 'g'),
          (_, prefix: string, suffix: string) => `${prefix}${newVariant}${suffix}`,
        )
        .replace(
          new RegExp(`^(\\s*\\[[^\\]]+\\]:\\s*\\.\\/)${escaped}((?:\\?[^\\s#]*)?(?:#[^\\s]*)?)(?=(?:\\s+["'(]|\\s*$))`, 'gm'),
          (_, prefix: string, suffix: string) => `${prefix}${newVariant}${suffix}`,
        )
        .replace(
          new RegExp(`(<img\\b[^>]*\\bsrc\\s*=\\s*["']\\.\\/)${escaped}((?:\\?[^"'#]*)?(?:#[^"']*)?)(?=["'])`, 'gi'),
          (_, prefix: string, suffix: string) => `${prefix}${newVariant}${suffix}`,
        )
        .replace(
          new RegExp(`(<img\\b[^>]*\\bsrc\\s*=\\s*\\.\\/)${escaped}((?:\\?[^\\s>#]*)?(?:#[^\\s>]*)?)(?=\\/?>|\\s)`, 'gi'),
          (_, prefix: string, suffix: string) => `${prefix}${newVariant}${suffix}`,
        )
    }
    return result
  })
}

export function resolveRelativeAssetPath(baseDir: string, assetPath: string): string {
  const separator = getPathSeparator(baseDir)
  const normalizedBase = baseDir.replace(/\\/g, '/')
  const normalizedAsset = assetPath.replace(/\\/g, '/')

  const isWindowsDrive = /^[a-zA-Z]:\//.test(normalizedBase)
  const prefix = isWindowsDrive ? normalizedBase.slice(0, 2) : ''
  const baseWithoutPrefix = isWindowsDrive ? normalizedBase.slice(2) : normalizedBase
  const segments = baseWithoutPrefix.split('/').filter(Boolean)
  // The asset:// scope granted at runtime only covers the document's own
  // directory (see save_image_asset/copy_asset_file/read_external_document),
  // so never let ".." segments pop below the original base directory —
  // otherwise a crafted Markdown file could reference paths outside the
  // document's own directory once some other directory's scope happens to
  // be granted elsewhere in the same running session.
  const baseDepth = segments.length

  for (const part of normalizedAsset.split('/')) {
    if (!part || part === '.') {
      continue
    }
    if (part === '..') {
      if (segments.length > baseDepth) {
        segments.pop()
      }
      continue
    }
    segments.push(part)
  }

  if (isWindowsDrive) {
    return `${prefix}\\${segments.join('\\')}`
  }

  const leadingSlash = normalizedBase.startsWith('/') ? '/' : ''
  const resolved = `${leadingSlash}${segments.join('/')}`
  return separator === '\\' ? resolved.replace(/\//g, '\\') : resolved
}
