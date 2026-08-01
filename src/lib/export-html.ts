import appStyles from '../styles/app.css?raw'
import previewExportStyles from '../styles/preview-export.css?raw'
import { isRelativeAssetPath, resolveRelativeAssetPath } from './image-assets'
import { decoratePreviewHtml, getResponsivePreviewStyle, resolveResponsiveLayout } from './preview'

export const LOCAL_IMAGE_EMBED_LIMIT_BYTES = 10 * 1024 * 1024
const REMOTE_IMAGE_TIMEOUT_MS = 3000
const REMOTE_IMAGE_PATTERN = /^https?:\/\//i
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/

export interface ExportImageWarning {
  kind: 'local-too-large' | 'local-read-failed' | 'remote-fetch-failed' | 'remote-timeout' | 'remote-too-large'
  src: string
  message: string
}

export interface ExportProgressUpdate {
  current: number
  total: number
  message: string
  warnings: ExportImageWarning[]
}

export interface LocalImageReadResult {
  mimeType: string
  sizeBytes: number
  dataBase64?: string | null
  skippedLarge?: boolean
}

export interface ExportSelfContainedHtmlOptions {
  markdownHtml: string
  title: string
  themeId: string
  previewWidth?: number
  documentBaseDir?: string | null
  readLocalImage: (absolutePath: string, maxInlineSizeBytes: number) => Promise<LocalImageReadResult>
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  onProgress?: (update: ExportProgressUpdate) => void
}

export class HtmlExportCancelledError extends Error {
  constructor() {
    super('HTML export cancelled')
    this.name = 'HtmlExportCancelledError'
  }
}

class RemoteImageTimeoutError extends Error {
  constructor() {
    super('Remote image fetch timed out')
    this.name = 'RemoteImageTimeoutError'
  }
}

export class RemoteImageTooLargeError extends Error {
  constructor() {
    super('Remote image exceeds inline size limit')
    this.name = 'RemoteImageTooLargeError'
  }
}

function isAbsoluteFilesystemPath(path: string): boolean {
  if (path.startsWith('//') || path.startsWith('\\\\')) {
    // Protocol-relative URL (e.g. "//cdn.example.com/x.png") — not a filesystem path.
    return false
  }
  return path.startsWith('/') || path.startsWith('\\') || WINDOWS_ABSOLUTE_PATH_PATTERN.test(path)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function serializeStyle(style: Record<string, string>): string {
  return Object.entries(style)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ')
}

function buildExportStyles(): string {
  // `appStyles` inlines the app shell's `html, body, #app { height: 100%; overflow: hidden; }`
  // rule, which is meant for the single-page app container and clips/disables scrolling once
  // applied to a standalone exported document. Reset it so long exported documents remain
  // scrollable in a plain browser.
  const exportOverrides = `
html, body {
  height: auto;
  min-height: 100%;
  overflow: visible;
}
`
  return `${appStyles}\n\n${previewExportStyles}\n\n${exportOverrides}`
}

function inferMimeTypeFromUrl(url: string): string | null {
  const normalizedUrl = url.split('?')[0]?.split('#')[0] ?? ''
  const extension = normalizedUrl.slice(normalizedUrl.lastIndexOf('.') + 1).toLowerCase()
  switch (extension) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'bmp':
      return 'image/bmp'
    case 'ico':
      return 'image/x-icon'
    case 'avif':
      return 'image/avif'
    case 'tif':
    case 'tiff':
      return 'image/tiff'
    default:
      return null
  }
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new HtmlExportCancelledError()
  }
}

function isRemoteImageTimeoutError(error: unknown): error is RemoteImageTimeoutError {
  return error instanceof RemoteImageTimeoutError
}

function isRemoteImageTooLargeError(error: unknown): error is RemoteImageTooLargeError {
  return error instanceof RemoteImageTooLargeError
}

export function isHtmlExportCancelledError(error: unknown): error is HtmlExportCancelledError {
  return error instanceof HtmlExportCancelledError
}

async function fetchRemoteImageAsDataUri(
  src: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<string> {
  throwIfCancelled(signal)

  const timeoutController = new AbortController()
  let timedOut = false
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    timeoutController.abort()
  }, REMOTE_IMAGE_TIMEOUT_MS)
  const abortFromParent = () => timeoutController.abort()
  signal?.addEventListener('abort', abortFromParent, { once: true })

  try {
    const response = await fetchImpl(src, { signal: timeoutController.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > LOCAL_IMAGE_EMBED_LIMIT_BYTES) {
      throw new RemoteImageTooLargeError()
    }

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim()
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > LOCAL_IMAGE_EMBED_LIMIT_BYTES) {
      // Server omitted (or under-reported) Content-Length; enforce the limit
      // after download so an unbounded remote image can't still freeze the
      // renderer or blow up memory during base64 conversion.
      throw new RemoteImageTooLargeError()
    }
    const mimeType = contentType || inferMimeTypeFromUrl(src) || 'application/octet-stream'
    return `data:${mimeType};base64,${bytesToBase64(bytes)}`
  } catch (error) {
    if (signal?.aborted) {
      throw new HtmlExportCancelledError()
    }
    if (timedOut) {
      throw new RemoteImageTimeoutError()
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortFromParent)
  }
}

export async function exportSelfContainedHtml(
  options: ExportSelfContainedHtmlOptions,
): Promise<{ html: string; warnings: ExportImageWarning[] }> {
  const previewWidth = Math.max(0, Math.round(options.previewWidth ?? 960))
  const responsiveStyle = getResponsivePreviewStyle(resolveResponsiveLayout(previewWidth))
  const decoratedHtml = decoratePreviewHtml(options.markdownHtml)
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div id="preview-export-root">${decoratedHtml}</div>`, 'text/html')
  const root = doc.getElementById('preview-export-root')

  if (!root) {
    throw new Error('ERR_EXPORT_HTML_ROOT_MISSING')
  }

  const images = Array.from(root.querySelectorAll('img'))
  const warnings: ExportImageWarning[] = []
  options.onProgress?.({
    current: 0,
    total: images.length,
    message: images.length > 0 ? '正在分析图片资源…' : '正在生成 HTML…',
    warnings,
  })

  for (const [index, image] of images.entries()) {
    throwIfCancelled(options.signal)

    const originalSource = image.getAttribute('src')?.trim()
    if (!originalSource || originalSource.startsWith('data:')) {
      options.onProgress?.({
        current: index + 1,
        total: images.length,
        message: `正在处理图片 ${index + 1}/${images.length}`,
        warnings,
      })
      continue
    }

    try {
      if (REMOTE_IMAGE_PATTERN.test(originalSource)) {
        image.setAttribute(
          'src',
          await fetchRemoteImageAsDataUri(originalSource, options.fetchImpl ?? fetch, options.signal),
        )
      } else if (originalSource.startsWith('//')) {
        // Protocol-relative URL (e.g. "//cdn.example.com/x.png") — resolve against https:.
        image.setAttribute(
          'src',
          await fetchRemoteImageAsDataUri(`https:${originalSource}`, options.fetchImpl ?? fetch, options.signal),
        )
      } else if (isRelativeAssetPath(originalSource) || isAbsoluteFilesystemPath(originalSource)) {
        const absolutePath = isRelativeAssetPath(originalSource)
          ? options.documentBaseDir
            ? resolveRelativeAssetPath(options.documentBaseDir, originalSource)
            : null
          : originalSource

        if (!absolutePath) {
          warnings.push({
            kind: 'local-read-failed',
            src: originalSource,
            message: `无法解析本地图片路径：${originalSource}`,
          })
        } else {
          const localImage = await options.readLocalImage(absolutePath, LOCAL_IMAGE_EMBED_LIMIT_BYTES)
          if (localImage.dataBase64) {
            image.setAttribute('src', `data:${localImage.mimeType};base64,${localImage.dataBase64}`)
          } else if (localImage.skippedLarge) {
            warnings.push({
              kind: 'local-too-large',
              src: originalSource,
              message: `图片超过 10MB，已跳过内嵌：${originalSource}`,
            })
          }
        }
      } else {
        // Unsupported scheme (e.g. "blob:", "file://") — cannot be embedded or
        // fetched; keep the original src but surface a warning instead of
        // silently shipping an unusable reference in the exported HTML.
        warnings.push({
          kind: 'local-read-failed',
          src: originalSource,
          message: `不支持的图片来源，已保留原路径：${originalSource}`,
        })
      }
    } catch (error) {
      if (isHtmlExportCancelledError(error)) {
        throw error
      }

      const isRemote = REMOTE_IMAGE_PATTERN.test(originalSource) || originalSource.startsWith('//')
      warnings.push({
        kind: isRemote
          ? isRemoteImageTimeoutError(error)
            ? 'remote-timeout'
            : isRemoteImageTooLargeError(error)
              ? 'remote-too-large'
              : 'remote-fetch-failed'
          : 'local-read-failed',
        src: originalSource,
        message: isRemote
          ? isRemoteImageTimeoutError(error)
            ? `远程图片请求超时，已保留原链接：${originalSource}`
            : isRemoteImageTooLargeError(error)
              ? `远程图片超过 10MB，已跳过内嵌并保留原链接：${originalSource}`
              : `远程图片处理失败，已保留原链接：${originalSource}`
          : `本地图片处理失败，已保留原路径：${originalSource}`,
      })
    }

    options.onProgress?.({
      current: index + 1,
      total: images.length,
      message: `正在处理图片 ${index + 1}/${images.length}`,
      warnings,
    })
  }

  throwIfCancelled(options.signal)

  const title = escapeHtml(options.title)
  const themeId = escapeHtml(options.themeId)
  const html = [
    '<!DOCTYPE html>',
    `<html lang="zh-CN" data-theme="${themeId}">`,
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${title}</title>`,
    '  <style>',
    buildExportStyles(),
    '  </style>',
    '</head>',
    '<body>',
    `  <div class="preview-pane-inner" style="${escapeHtml(serializeStyle(responsiveStyle))}">`,
    `    <div class="preview-content">${root.innerHTML}</div>`,
    '  </div>',
    '</body>',
    '</html>',
  ].join('\n')

  return { html, warnings }
}
