import assert from 'node:assert/strict'
import test from 'node:test'

import { decoratePreviewHtml } from './preview.ts'

const VOID_TAGS = new Set(['input', 'img', 'br', 'hr', 'meta', 'link'])

abstract class FakeNode {
  parentNode: FakeElement | null = null

  abstract serialize(): string
}

class FakeTextNode extends FakeNode {
  constructor(private readonly value: string) {
    super()
  }

  serialize(): string {
    return this.value
  }
}

class FakeElement extends FakeNode {
  readonly attributes = new Map<string, string>()
  readonly childNodes: FakeNode[] = []

  constructor(
    readonly tagName: string,
    attributes: Record<string, string> = {},
  ) {
    super()
    Object.entries(attributes).forEach(([name, value]) => {
      this.attributes.set(name, value)
    })
  }

  get parentElement(): FakeElement | null {
    return this.parentNode
  }

  get className(): string {
    return this.getAttribute('class') ?? ''
  }

  set className(value: string) {
    this.setAttribute('class', value)
  }

  get classList() {
    return {
      contains: (token: string) => this.className.split(/\s+/).filter(Boolean).includes(token),
    }
  }

  get innerHTML(): string {
    return this.childNodes.map((child) => child.serialize()).join('')
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  appendChild(node: FakeNode): FakeNode {
    if (node.parentNode) {
      node.parentNode.removeChild(node)
    }
    this.childNodes.push(node)
    node.parentNode = this
    return node
  }

  insertBefore(node: FakeNode, referenceNode: FakeNode): FakeNode {
    if (node.parentNode) {
      node.parentNode.removeChild(node)
    }

    const referenceIndex = this.childNodes.indexOf(referenceNode)
    if (referenceIndex === -1) {
      return this.appendChild(node)
    }

    this.childNodes.splice(referenceIndex, 0, node)
    node.parentNode = this
    return node
  }

  querySelectorAll(selector: string): FakeElement[] {
    const matches: FakeElement[] = []

    const visit = (node: FakeNode) => {
      if (!(node instanceof FakeElement)) {
        return
      }

      if (node.matches(selector)) {
        matches.push(node)
      }

      node.childNodes.forEach(visit)
    }

    this.childNodes.forEach(visit)
    return matches
  }

  removeChild(node: FakeNode): void {
    const index = this.childNodes.indexOf(node)
    if (index >= 0) {
      this.childNodes.splice(index, 1)
      node.parentNode = null
    }
  }

  serialize(): string {
    const attributes = Array.from(this.attributes.entries())
      .map(([name, value]) => ` ${name}="${value}"`)
      .join('')

    if (VOID_TAGS.has(this.tagName)) {
      return `<${this.tagName}${attributes}>`
    }

    return `<${this.tagName}${attributes}>${this.innerHTML}</${this.tagName}>`
  }

  private matches(selector: string): boolean {
    const tagNameMatch = selector.match(/^[a-z]+/i)
    if (tagNameMatch && this.tagName !== tagNameMatch[0].toLowerCase()) {
      return false
    }

    for (const [, name, value] of selector.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)) {
      const attributeValue = this.getAttribute(name)
      if (attributeValue === null) {
        return false
      }
      if (value !== undefined && attributeValue !== value) {
        return false
      }
    }

    return true
  }
}

class FakeDocument {
  constructor(private readonly rootNode: FakeElement | null) {}

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName.toLowerCase())
  }

  getElementById(id: string): FakeElement | null {
    const visit = (node: FakeNode): FakeElement | null => {
      if (!(node instanceof FakeElement)) {
        return null
      }

      if (node.getAttribute('id') === id) {
        return node
      }

      for (const child of node.childNodes) {
        const match = visit(child)
        if (match) {
          return match
        }
      }

      return null
    }

    return this.rootNode ? visit(this.rootNode) : null
  }
}

class FakeDOMParser {
  parseFromString(html: string): FakeDocument {
    const stack: FakeElement[] = []
    let root: FakeElement | null = null

    for (const token of html.match(/<\/?[^>]+>|[^<]+/g) ?? []) {
      if (token.startsWith('</')) {
        stack.pop()
        continue
      }

      if (!token.startsWith('<')) {
        if (stack.length > 0) {
          stack[stack.length - 1].appendChild(new FakeTextNode(token))
        }
        continue
      }

      const tagMatch = token.match(/^<([a-z0-9-]+)\b([^>]*)\/?>$/i)
      if (!tagMatch) {
        continue
      }

      const [, rawTagName, rawAttributes] = tagMatch
      const tagName = rawTagName.toLowerCase()
      const attributes: Record<string, string> = {}

      for (const [, name, value] of rawAttributes.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) {
        attributes[name] = value ?? ''
      }

      const element = new FakeElement(tagName, attributes)
      if (!root) {
        root = element
      }

      if (stack.length > 0) {
        stack[stack.length - 1].appendChild(element)
      }

      if (!VOID_TAGS.has(tagName) && !token.endsWith('/>')) {
        stack.push(element)
      }
    }

    return new FakeDocument(root)
  }
}

test('adds tabindex=-1 to task checkboxes only when disableCheckboxTabbing is requested (preview pane)', () => {
  const originalDOMParser = globalThis.DOMParser
  Object.defineProperty(globalThis, 'DOMParser', {
    configurable: true,
    writable: true,
    value: FakeDOMParser,
  })

  try {
    const html = decoratePreviewHtml(
      '<p>before</p><input type="checkbox" data-task-nonce="nonce-1" data-task-index="0"><input type="checkbox"><span>after</span>',
      { disableCheckboxTabbing: true },
    )

    assert.match(
      html,
      /<input type="checkbox" data-task-nonce="nonce-1" data-task-index="0" tabindex="-1">/,
    )
    assert.match(html, /<input type="checkbox">/)
    assert.match(html, /<p>before<\/p>/)
    assert.match(html, /<span>after<\/span>/)
    assert.doesNotMatch(html, /<input type="checkbox" tabindex="-1">/)
  } finally {
    if (originalDOMParser) {
      Object.defineProperty(globalThis, 'DOMParser', {
        configurable: true,
        writable: true,
        value: originalDOMParser,
      })
    } else {
      Reflect.deleteProperty(globalThis, 'DOMParser')
    }
  }
})

test('does not touch checkbox tabindex when disableCheckboxTabbing is omitted (e.g. HTML export)', () => {
  const originalDOMParser = globalThis.DOMParser
  Object.defineProperty(globalThis, 'DOMParser', {
    configurable: true,
    writable: true,
    value: FakeDOMParser,
  })

  try {
    const html = decoratePreviewHtml(
      '<input type="checkbox" data-task-nonce="nonce-1" data-task-index="0">',
    )

    assert.match(html, /<input type="checkbox" data-task-nonce="nonce-1" data-task-index="0">/)
    assert.doesNotMatch(html, /tabindex/)
  } finally {
    if (originalDOMParser) {
      Object.defineProperty(globalThis, 'DOMParser', {
        configurable: true,
        writable: true,
        value: originalDOMParser,
      })
    } else {
      Reflect.deleteProperty(globalThis, 'DOMParser')
    }
  }
})
