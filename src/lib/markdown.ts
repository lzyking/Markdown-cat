import { Marked, Renderer, type Token, type Tokens } from 'marked'

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
 * 危险 HTML / 脚本攻击正则，用于拦截 XSS。
 */
const DANGEROUS_HTML_PATTERN = /<script|<iframe|<object|<embed|on\w+\s*=|javascript:/i

/**
 * 递归遍历 token 树，过滤危险脚本标签，允许安全的 HTML 文本与颜色标签（如 <font color="...">, <span style="...">）。
 */
function sanitizeTokens(tokens: Token[]): Token[] {
  return tokens.map((token) => {
    if (token.type === 'html') {
      const raw = (token as Tokens.HTML).raw
      if (DANGEROUS_HTML_PATTERN.test(raw)) {
        return { type: 'text', raw, text: escapeHtml(raw) } as Tokens.Text
      }
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
 * 生成一次性随机 nonce，绑定到本次渲染产出的 checkbox 元素上。
 *
 * 用户在 Markdown 源码中手写的原始 `<input>` HTML 无法预测该值，
 * 从而防止伪造 `data-task-index` 骗取预览区点击事件去翻转任意行。
 */
function createRenderNonce(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * 每次渲染独立的 Renderer 实例，避免共享的模块级可变状态
 * （例如此前的模块级计数器）在潜在的重入/并发渲染场景下产生错乱。
 */
class TaskAwareRenderer extends Renderer {
  private taskIndex = 0

  constructor(private readonly nonce: string) {
    super()
  }

  checkbox(checked: boolean): string {
    const index = this.taskIndex++
    return `<input type="checkbox" data-task-nonce="${this.nonce}" data-task-index="${index}"${checked ? ' checked' : ''}>`
  }
}

export interface MarkdownRenderResult {
  html: string
  /** 本次渲染生成的 checkbox nonce，供预览区点击校验使用，防止伪造的原始 HTML checkbox 被误当作真实任务项处理。 */
  taskNonce: string
}

/**
 * 将 Markdown 源码渲染为 HTML 字符串（及本次渲染的任务列表 nonce）。
 *
 * 使用独立 Marked 实例，避免污染全局 marked 默认行为。
 * 内联/块级 HTML 标签以及表格会被转义为纯文本，防止 XSS 并统一降级行为。
 */
export function renderMarkdown(source: string): MarkdownRenderResult {
  if (!source || source.trim() === '') {
    return { html: '', taskNonce: '' }
  }
  const nonce = createRenderNonce()
  const html = marked.parse(source, { async: false, renderer: new TaskAwareRenderer(nonce) }) as string
  return { html, taskNonce: nonce }
}
