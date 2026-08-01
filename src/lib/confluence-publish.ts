import { marked, type Token, type Tokens } from 'marked'
import { isRelativeAssetPath, resolveRelativeAssetPath } from './image-assets'

const REMOTE_IMAGE_PATTERN = /^https?:\/\//i
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/

export interface ConfluenceLocalImageReference {
  originalSrc: string
  absolutePath: string
  filename: string
}

export interface ConfluenceStorageConversionResult {
  storageXhtml: string
  images: ConfluenceLocalImageReference[]
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttribute(value: string): string {
  return escapeXml(value)
}

function escapeCdata(value: string): string {
  return value.replace(/\]\]>/g, ']]]]><![CDATA[>')
}

function isAbsoluteFilesystemPath(path: string): boolean {
  return path.startsWith('/') || path.startsWith('\\') || WINDOWS_ABSOLUTE_PATH_PATTERN.test(path)
}

function isRemoteImage(path: string): boolean {
  return REMOTE_IMAGE_PATTERN.test(path) || path.startsWith('//')
}

function getBasename(path: string): string {
  const normalized = path.split('?')[0]?.split('#')[0] ?? path
  const segments = normalized.split(/[\\/]/)
  const rawName = segments[segments.length - 1] || 'image'
  try {
    return decodeURIComponent(rawName)
  } catch {
    return rawName
  }
}

function appendUniqueImage(
  images: ConfluenceLocalImageReference[],
  image: ConfluenceLocalImageReference,
) {
  if (images.some((entry) => entry.absolutePath === image.absolutePath && entry.filename === image.filename)) {
    return
  }
  images.push(image)
}

function resolveLocalImage(
  src: string,
  documentBaseDir: string | null,
): ConfluenceLocalImageReference | null {
  if (isRemoteImage(src)) {
    return null
  }

  const absolutePath = isRelativeAssetPath(src)
    ? documentBaseDir
      ? resolveRelativeAssetPath(documentBaseDir, src)
      : null
    : isAbsoluteFilesystemPath(src)
      ? src
      : null

  if (!absolutePath) {
    return null
  }

  return {
    originalSrc: src,
    absolutePath,
    filename: getBasename(absolutePath),
  }
}

function renderInlineTokens(
  tokens: Token[] | undefined,
  images: ConfluenceLocalImageReference[],
  documentBaseDir: string | null,
): string {
  if (!tokens?.length) {
    return ''
  }

  return tokens.map((token) => renderInlineToken(token, images, documentBaseDir)).join('')
}

function renderInlineToken(
  token: Token,
  images: ConfluenceLocalImageReference[],
  documentBaseDir: string | null,
): string {
  switch (token.type) {
    case 'text':
      return 'tokens' in token && Array.isArray(token.tokens) && token.tokens.length > 0
        ? renderInlineTokens(token.tokens, images, documentBaseDir)
        : escapeXml((token as Tokens.Text).text)
    case 'escape':
      return escapeXml((token as Tokens.Escape).text)
    case 'strong':
      return `<strong>${renderInlineTokens((token as Tokens.Strong).tokens, images, documentBaseDir)}</strong>`
    case 'em':
      return `<em>${renderInlineTokens((token as Tokens.Em).tokens, images, documentBaseDir)}</em>`
    case 'codespan':
      return `<code>${escapeXml((token as Tokens.Codespan).text)}</code>`
    case 'br':
      return '<br />'
    case 'del':
      return `<del>${renderInlineTokens((token as Tokens.Del).tokens, images, documentBaseDir)}</del>`
    case 'link': {
      const link = token as Tokens.Link
      const title = link.title ? ` title="${escapeAttribute(link.title)}"` : ''
      return `<a href="${escapeAttribute(link.href)}"${title}>${renderInlineTokens(link.tokens, images, documentBaseDir)}</a>`
    }
    case 'image': {
      const image = token as Tokens.Image
      if (isRemoteImage(image.href)) {
        const title = image.title ? ` title="${escapeAttribute(image.title)}"` : ''
        const alt = image.text ? ` alt="${escapeAttribute(image.text)}"` : ''
        return `<img src="${escapeAttribute(image.href)}"${alt}${title} />`
      }

      const localImage = resolveLocalImage(image.href, documentBaseDir)
      if (!localImage) {
        return `<img src="${escapeAttribute(image.href)}"${image.text ? ` alt="${escapeAttribute(image.text)}"` : ''} />`
      }

      appendUniqueImage(images, localImage)
      return `<ac:image><ri:attachment ri:filename="${escapeAttribute(localImage.filename)}" /></ac:image>`
    }
    case 'html':
      return escapeXml((token as Tokens.HTML).raw)
    default:
      return 'tokens' in token && Array.isArray(token.tokens)
        ? renderInlineTokens(token.tokens, images, documentBaseDir)
        : escapeXml((token as Tokens.Generic).raw ?? '')
  }
}

function unwrapSingleParagraph(html: string): string {
  const trimmed = html.trim()
  const match = trimmed.match(/^<p>([\s\S]*)<\/p>$/)
  return match ? match[1] : trimmed
}

function renderListItem(
  item: Tokens.ListItem,
  images: ConfluenceLocalImageReference[],
  documentBaseDir: string | null,
): string {
  const rendered = renderBlockTokens(item.tokens, images, documentBaseDir)
  return `<li>${unwrapSingleParagraph(rendered)}</li>`
}

function renderTableCell(
  cell: Tokens.TableCell,
  tagName: 'th' | 'td',
  images: ConfluenceLocalImageReference[],
  documentBaseDir: string | null,
): string {
  return `<${tagName}>${renderInlineTokens(cell.tokens, images, documentBaseDir)}</${tagName}>`
}

function renderBlockToken(
  token: Token,
  images: ConfluenceLocalImageReference[],
  documentBaseDir: string | null,
): string {
  switch (token.type) {
    case 'space':
      return ''
    case 'paragraph':
      return `<p>${renderInlineTokens((token as Tokens.Paragraph).tokens, images, documentBaseDir)}</p>`
    case 'text': {
      const textToken = token as Tokens.Text
      return textToken.tokens?.length
        ? `<p>${renderInlineTokens(textToken.tokens, images, documentBaseDir)}</p>`
        : `<p>${escapeXml(textToken.text)}</p>`
    }
    case 'heading': {
      const heading = token as Tokens.Heading
      const level = Math.min(6, Math.max(1, heading.depth))
      return `<h${level}>${renderInlineTokens(heading.tokens, images, documentBaseDir)}</h${level}>`
    }
    case 'blockquote':
      return `<blockquote>${renderBlockTokens((token as Tokens.Blockquote).tokens, images, documentBaseDir)}</blockquote>`
    case 'list': {
      const list = token as Tokens.List
      const tagName = list.ordered ? 'ol' : 'ul'
      const start = list.ordered && typeof list.start === 'number' && list.start > 1
        ? ` start="${list.start}"`
        : ''
      const items = list.items
        .map((item) => renderListItem(item, images, documentBaseDir))
        .join('')
      return `<${tagName}${start}>${items}</${tagName}>`
    }
    case 'code': {
      const code = token as Tokens.Code
      const language = escapeXml((code.lang || 'plain').trim() || 'plain')
      return `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">${language}</ac:parameter><ac:plain-text-body><![CDATA[${escapeCdata(code.text)}]]></ac:plain-text-body></ac:structured-macro>`
    }
    case 'table': {
      const table = token as Tokens.Table
      const header = table.header
        .map((cell) => renderTableCell(cell, 'th', images, documentBaseDir))
        .join('')
      const rows = table.rows
        .map((row) => `<tr>${row.map((cell) => renderTableCell(cell, 'td', images, documentBaseDir)).join('')}</tr>`)
        .join('')
      return `<table><tbody><tr>${header}</tr>${rows}</tbody></table>`
    }
    case 'hr':
      return '<hr />'
    case 'html':
      return escapeXml((token as Tokens.HTML).raw)
    default:
      return 'tokens' in token && Array.isArray(token.tokens)
        ? renderBlockTokens(token.tokens, images, documentBaseDir)
        : escapeXml((token as Tokens.Generic).raw ?? '')
  }
}

function renderBlockTokens(
  tokens: Token[],
  images: ConfluenceLocalImageReference[],
  documentBaseDir: string | null,
): string {
  return tokens
    .map((token) => renderBlockToken(token, images, documentBaseDir))
    .filter(Boolean)
    .join('')
}

export function convertMarkdownToConfluenceStorage(
  markdown: string,
  documentBaseDir: string | null,
): ConfluenceStorageConversionResult {
  if (!markdown.trim()) {
    return {
      storageXhtml: '<p></p>',
      images: [],
    }
  }

  const tokens = marked.lexer(markdown, {
    gfm: true,
    breaks: false,
  })
  const images: ConfluenceLocalImageReference[] = []

  return {
    storageXhtml: renderBlockTokens(tokens, images, documentBaseDir),
    images,
  }
}
