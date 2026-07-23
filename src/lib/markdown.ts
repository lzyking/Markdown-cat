import { Marked, type Token, type Tokens } from 'marked'

/**
 * 将 HTML 特殊字符转义为纯文本显示，防止 XSS。
 */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 递归遍历 token 树，将所有 HTML 和表格 token 转换为转义后的纯文本 token。
 * MVP 不渲染内联/块级 HTML 以及表格等扩展语法，防止 XSS 并保证降级行为一致。
 */
function sanitizeTokens(tokens: Token[]): Token[] {
  return tokens.map((token) => {
    if (token.type === 'html' || token.type === 'table') {
      const raw = (token as Tokens.HTML | Tokens.Table).raw
      return { type: 'text', raw, text: escapeHtml(raw) } as Tokens.Text
    }
    if ('tokens' in token && Array.isArray(token.tokens)) {
      return { ...token, tokens: sanitizeTokens(token.tokens) }
    }
    return token
  })
}

const marked = new Marked()

marked.use({
  hooks: {
    processAllTokens(tokens) {
      return sanitizeTokens(tokens as Token[])
    },
  },
})

marked.setOptions({
  gfm: true,
  breaks: false,
})

/**
 * 将 Markdown 源码渲染为 HTML 字符串。
 *
 * 使用独立 Marked 实例，避免污染全局 marked 默认行为。
 * 内联/块级 HTML 标签以及表格会被转义为纯文本，防止 XSS 并统一降级行为。
 */
export function renderMarkdown(source: string): string {
  if (!source || source.trim() === '') {
    return ''
  }
  return marked.parse(source, { async: false }) as string
}
