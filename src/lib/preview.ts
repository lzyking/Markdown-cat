export type PreviewLayout = 'compact' | 'regular' | 'wide'

const PREVIEW_LAYOUT_STYLES: Record<PreviewLayout, Record<string, string>> = {
  compact: {
    '--preview-body-font-size': '13px',
    '--preview-heading-font-size': '16px',
    '--preview-padding': '16px',
  },
  regular: {
    '--preview-body-font-size': '13.5px',
    '--preview-heading-font-size': '17px',
    '--preview-padding': '18px',
  },
  wide: {
    '--preview-body-font-size': '14px',
    '--preview-heading-font-size': '18px',
    '--preview-padding': '20px',
  },
}

export function decoratePreviewHtml(
  rawHtml: string,
  options: {
    transformImageSrc?: (src: string) => string | null
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

  return root.innerHTML
}

export function resolveResponsiveLayout(width: number): PreviewLayout {
  if (width <= 420) {
    return 'compact'
  }

  if (width <= 640) {
    return 'regular'
  }

  return 'wide'
}

export function getResponsivePreviewStyle(layout: PreviewLayout): Record<string, string> {
  return PREVIEW_LAYOUT_STYLES[layout]
}
