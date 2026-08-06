import assert from 'node:assert/strict'
import test from 'node:test'

import { renderMarkdown } from './markdown.ts'

type CheckboxAttributes = Record<string, string>

function extractCheckboxAttributes(html: string): CheckboxAttributes[] {
  return Array.from(html.matchAll(/<input\b([^>]*)>/g), ([, rawAttributes = '']) => {
    const attributes: CheckboxAttributes = {}

    for (const [, name, value] of rawAttributes.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) {
      attributes[name] = value ?? ''
    }

    return attributes
  })
}

test('renders an unchecked task item with its plain-text aria-label', () => {
  const { html } = renderMarkdown('- [ ] 买牛奶')
  const [checkbox] = extractCheckboxAttributes(html)

  assert.ok(checkbox)
  assert.equal(checkbox['aria-label'], '买牛奶')
  assert.equal(checkbox.checked, undefined)
  assert.equal(checkbox['data-task-index'], '0')
  assert.match(checkbox.id, /^task-checkbox-.+-0$/)
})

test('renders a checked task item with stripped inline-formatting text in aria-label', () => {
  const { html } = renderMarkdown('- [x] **bold** task')
  const [checkbox] = extractCheckboxAttributes(html)

  assert.ok(checkbox)
  assert.equal(checkbox['aria-label'], 'bold task')
  assert.equal(checkbox.checked, '')
})

test('keeps nested task checkbox ids and aria-labels assigned to their own items', () => {
  const { html } = renderMarkdown('- [ ] Parent\n  - [x] Child **task**\n- [ ] Sibling')
  const checkboxes = extractCheckboxAttributes(html)

  assert.equal(checkboxes.length, 3)

  const labelsByIndex = new Map(
    checkboxes.map((checkbox) => [checkbox['data-task-index'], checkbox['aria-label']]),
  )

  assert.match(labelsByIndex.get('0') ?? '', /Parent/)
  assert.equal(labelsByIndex.get('1'), 'Child task')
  assert.equal(labelsByIndex.get('2'), 'Sibling')
  assert.notEqual(labelsByIndex.get('0'), labelsByIndex.get('1'))

  for (const checkbox of checkboxes) {
    assert.match(checkbox.id, new RegExp(`-${checkbox['data-task-index']}$`))
  }
})

test('leaves non-task list items unchanged', () => {
  const { html } = renderMarkdown('- 普通列表项')

  assert.equal(html, '<ul>\n<li>普通列表项</li>\n</ul>\n')
  assert.doesNotMatch(html, /aria-label=/)
  assert.doesNotMatch(html, /id="task-checkbox-/)
})

test('uses image alt text for aria-label when a task item contains only an image', () => {
  const { html } = renderMarkdown('- [ ] ![截图说明](./assets/shot.png)')
  const [checkbox] = extractCheckboxAttributes(html)

  assert.ok(checkbox)
  assert.equal(checkbox['aria-label'], '截图说明')
})

test('generates slug ids for headings supporting Chinese and English and duplicate handling', () => {
  const markdown = '# 1. 快速开始 (Quick Start)!\n\n## 章节一：介绍\n\n## 章节一：介绍'
  const { html } = renderMarkdown(markdown)

  assert.match(html, /<h1 id="1-快速开始-quick-start">1\. 快速开始 \(Quick Start\)!<\/h1>/)
  assert.match(html, /<h2 id="章节一介绍">章节一：介绍<\/h2>/)
  assert.match(html, /<h2 id="章节一介绍-1">章节一：介绍<\/h2>/)
})

