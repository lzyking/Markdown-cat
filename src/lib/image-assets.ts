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
  // (e.g. "C:\images\foo.png" / "C:/images/foo.png") is not relative either.
  if (path.startsWith('/') || path.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(path)) {
    return false
  }
  return true
}

/**
 * 从 Markdown 文本中提取指向 `./assets/<filename>` 的图片引用文件名。
 * 用于“另存为”时判断是否需要将暂存资源迁移到新目录。
 */
export function extractAssetReferences(markdown: string): string[] {
  const pattern = /!\[[^\]]*\]\(\.\/assets\/([^)\s]+)\)/g
  const names = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = pattern.exec(markdown)) !== null) {
    let candidate: string
    try {
      candidate = decodeURIComponent(match[1])
    } catch {
      // Malformed percent-encoding (e.g. a stray "%" in the filename) — skip
      // rather than let this abort "Save As" after the document has already
      // been written to its new location.
      continue
    }
    // Only accept plain filenames — ignore anything with path traversal/segments.
    if (candidate && !candidate.includes('/') && !candidate.includes('\\') && candidate !== '..') {
      names.add(candidate)
    }
  }
  return Array.from(names)
}

/**
 * 从 Markdown 文本中提取指向文档同级目录的图片引用文件名（如 `./img_xxx.png`），
 * 不含任何子目录前缀。用于“另存为”已保存文档时判断需要迁移哪些同目录图片。
 */
export function extractSiblingImageReferences(markdown: string): string[] {
  const pattern = /!\[[^\]]*\]\(\.\/([^)\s/\\]+)\)/g
  const names = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = pattern.exec(markdown)) !== null) {
    let candidate: string
    try {
      candidate = decodeURIComponent(match[1])
    } catch {
      continue
    }
    if (candidate && !candidate.includes('/') && !candidate.includes('\\') && candidate !== '..') {
      names.add(candidate)
    }
  }
  return Array.from(names)
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
