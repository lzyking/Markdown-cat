export type PreviewLayout = 'compact' | 'regular' | 'wide'

export const PREVIEW_COMPACT_MAX_WIDTH = 420
export const PREVIEW_REGULAR_MAX_WIDTH = 640

const PREVIEW_LAYOUT_STYLES: Record<PreviewLayout, Record<string, string>> = {
  compact: {
    '--preview-body-font-size': 'var(--font-size-preview-compact)',
    '--preview-heading-font-size': 'var(--font-size-preview-heading-compact)',
    '--preview-padding': '16px',
  },
  regular: {
    '--preview-body-font-size': 'var(--font-size-preview-regular)',
    '--preview-heading-font-size': 'var(--font-size-preview-heading-regular)',
    '--preview-padding': '18px',
  },
  wide: {
    '--preview-body-font-size': 'var(--font-size-preview-wide)',
    '--preview-heading-font-size': 'var(--font-size-preview-heading-wide)',
    '--preview-padding': '20px',
  },
}

export function decoratePreviewHtml(
  rawHtml: string,
  options: {
    transformImageSrc?: (src: string) => string | null
    /**
     * 仅供"被动展示"的实时预览面板（PreviewPane.vue）设置为 true：
     * 将任务 checkbox 移出原生 Tab 顺序（DW-45）。
     * 导出为独立 HTML 文档（export-html.ts）时不应传入此项——
     * 导出文档中的 checkbox 是页面主要内容，仍需保留默认 Tab 可达性。
     */
    disableCheckboxTabbing?: boolean
  } = {},
): string {
  if (!rawHtml) {
    return ''
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div id="preview-root">${rawHtml}</div>`, 'text/html')
  const root = doc.getElementById('preview-root')

  if (!root) {
    return rawHtml
  }

  root.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('preview-table-scroll') || !table.parentNode) {
      return
    }

    const wrapper = doc.createElement('div')
    wrapper.className = 'preview-table-scroll'
    table.parentNode.insertBefore(wrapper, table)
    wrapper.appendChild(table)
  })

  if (options.transformImageSrc) {
    root.querySelectorAll('img').forEach((image) => {
      const source = image.getAttribute('src')
      if (!source) {
        return
      }

      const transformedSource = options.transformImageSrc!(source)
      if (transformedSource) {
        image.setAttribute('src', transformedSource)
      }
    })
  }

  if (options.disableCheckboxTabbing) {
    root.querySelectorAll('input[type="checkbox"][data-task-nonce]').forEach((checkbox) => {
      checkbox.setAttribute('tabindex', '-1')
    })
  }

  return root.innerHTML
}

export function resolveResponsiveLayout(width: number): PreviewLayout {
  if (width <= PREVIEW_COMPACT_MAX_WIDTH) {
    return 'compact'
  }

  if (width <= PREVIEW_REGULAR_MAX_WIDTH) {
    return 'regular'
  }

  return 'wide'
}

export function getResponsivePreviewStyle(layout: PreviewLayout): Record<string, string> {
  return PREVIEW_LAYOUT_STYLES[layout]
}
