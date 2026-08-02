import assert from 'node:assert/strict'
import test from 'node:test'

import { computeMinimalLineChange } from './source-editor-diff.ts'

function createLineAt(doc: string) {
  const lines = doc.split('\n')
  const ranges = lines.map((line, index) => {
    const from = index === 0
      ? 0
      : lines.slice(0, index).join('\n').length + 1

    return {
      number: index + 1,
      from,
      to: from + line.length,
    }
  })

  return (offset: number) => {
    const match = ranges.find((line) => offset >= line.from && offset <= line.to) ?? ranges[ranges.length - 1]
    return { number: match.number }
  }
}

test('returns a scoped single-line change for a checkbox toggle', () => {
  const current = '- [ ] first\n- [x] second'
  const next = '- [x] first\n- [x] second'

  const change = computeMinimalLineChange(current, next, createLineAt(current))

  assert.deepEqual(change, {
    from: 3,
    to: 4,
    insert: 'x',
  })
})

test('returns null for a multi-line diff so the caller can fall back to full replace', () => {
  const current = '- [ ] first\n- [x] second'
  const next = '- [x] first\n- [ ] second'

  const change = computeMinimalLineChange(current, next, createLineAt(current))

  assert.equal(change, null)
})

test('returns a scoped single-line change for a checkbox un-toggle', () => {
  const current = '- [x] first\n- [x] second'
  const next = '- [ ] first\n- [x] second'

  const change = computeMinimalLineChange(current, next, createLineAt(current))

  assert.deepEqual(change, {
    from: 3,
    to: 4,
    insert: ' ',
  })
})

test('returns a scoped change when the entire single-line document is replaced', () => {
  const current = 'a'
  const next = 'b'

  const change = computeMinimalLineChange(current, next, createLineAt(current))

  assert.deepEqual(change, {
    from: 0,
    to: 1,
    insert: 'b',
  })
})
