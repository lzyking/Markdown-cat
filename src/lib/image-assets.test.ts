import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractAssetReferences,
  extractSiblingImageReferences,
  replaceAssetReferenceFilename,
  replaceSiblingImageReferenceFilename,
} from './image-assets.ts'

test('extracts asset filenames from html img tags', () => {
  const markdown = '<img src="./assets/pic.png" alt="preview">'

  assert.deepEqual(extractAssetReferences(markdown), ['pic.png'])
})

test('extracts asset filenames from reference-style image definitions', () => {
  const markdown = '![alt][shot]\n\n[shot]: ./assets/pic.png'

  assert.deepEqual(extractAssetReferences(markdown), ['pic.png'])
})

test('extracts asset filenames from titled inline image links', () => {
  const markdown = '![alt](./assets/pic.png "标题")'

  assert.deepEqual(extractAssetReferences(markdown), ['pic.png'])
})

test('extracts asset filenames without the dot-slash prefix', () => {
  const markdown = '![alt](assets/pic.png)'

  assert.deepEqual(extractAssetReferences(markdown), ['pic.png'])
})

test('rejects asset references containing path traversal', () => {
  const markdown = '<img src="./assets/../secret.png">\n![alt](assets/..%2Fsecret.png)'

  assert.deepEqual(extractAssetReferences(markdown), [])
})

test('extracts asset filenames while stripping query strings and fragments', () => {
  const markdown = [
    '![alt](./assets/pic.png?raw=1)',
    '<img src="./assets/icon.png#frag" alt="preview">',
  ].join('\n')

  assert.deepEqual(extractAssetReferences(markdown).sort(), ['icon.png', 'pic.png'])
})

test('ignores asset references inside fenced code blocks and still finds later real references', () => {
  const markdown = [
    '```md',
    '![alt](./assets/example.png)',
    '```',
    '![alt](./assets/real.png)',
    '~~~',
    '<img src="./assets/also-example.png">',
    '~~~',
  ].join('\n')

  assert.deepEqual(extractAssetReferences(markdown), ['real.png'])
})

test('extracts sibling image filenames from html, reference-style, and titled inline forms', () => {
  const markdown = [
    '<img src="./html.png" alt="preview">',
    '![alt][shot]',
    '',
    '[shot]: ./ref.png',
    '![alt](./titled.png "标题")',
  ].join('\n')

  assert.deepEqual(extractSiblingImageReferences(markdown).sort(), ['html.png', 'ref.png', 'titled.png'])
})

test('extracts sibling image filenames while stripping query strings and fragments', () => {
  const markdown = [
    '<img src="./pic.png?raw=1" alt="preview">',
    '![alt](./icon.png#frag)',
  ].join('\n')

  assert.deepEqual(extractSiblingImageReferences(markdown).sort(), ['icon.png', 'pic.png'])
})

test('ignores sibling image references inside fenced code blocks and still finds later real references', () => {
  const markdown = [
    '~~~markdown',
    '![alt](./example.png)',
    '~~~',
    '![alt](./real.png)',
    '```html',
    '<img src="./also-example.png">',
    '```',
  ].join('\n')

  assert.deepEqual(extractSiblingImageReferences(markdown), ['real.png'])
})

test('rewrites asset reference filenames across all supported forms, encoded variants, and preserved suffixes', () => {
  const original = [
    '![inline](./assets/old name.png)',
    '![titled](assets/old%20name.png "标题")',
    '[shot]: ./assets/old name.png',
    '<img src="assets/old%20name.png" alt="quoted">',
    '<img src=./assets/old%20name.png?raw=1>',
    '<img src=assets/old%20name.png#frag>',
  ].join('\n')

  const expected = [
    '![inline](./assets/new name.png)',
    '![titled](assets/new%20name.png "标题")',
    '[shot]: ./assets/new name.png',
    '<img src="assets/new%20name.png" alt="quoted">',
    '<img src=./assets/new%20name.png?raw=1>',
    '<img src=assets/new%20name.png#frag>',
  ].join('\n')

  assert.equal(replaceAssetReferenceFilename(original, 'old name.png', 'new name.png'), expected)
})

test('rewrites asset references outside fenced code blocks only', () => {
  const original = [
    '![real](./assets/pic.png)',
    '```md',
    '![example](./assets/pic.png)',
    '<img src="./assets/pic.png">',
    '```',
  ].join('\n')

  const expected = [
    '![real](./assets/new.png)',
    '```md',
    '![example](./assets/pic.png)',
    '<img src="./assets/pic.png">',
    '```',
  ].join('\n')

  assert.equal(replaceAssetReferenceFilename(original, 'pic.png', 'new.png'), expected)
})

test('rewrites lowercase percent-encoded asset references', () => {
  const original = '![alt](./assets/%e4%bd%a0.png)'
  const expected = '![alt](./assets/%e4%bb%96.png)'

  assert.equal(replaceAssetReferenceFilename(original, '你.png', '他.png'), expected)
})

test('preserves uppercase percent-encoded asset replacement behavior', () => {
  const original = '![alt](./assets/%E4%BD%A0.png)'
  const expected = '![alt](./assets/%E4%BB%96.png)'

  assert.equal(replaceAssetReferenceFilename(original, '你.png', '他.png'), expected)
})

test('extracts and rewrites self-closing unquoted asset img src references', () => {
  const original = '<img src=./assets/pic.png/>'

  assert.deepEqual(extractAssetReferences(original), ['pic.png'])
  assert.equal(replaceAssetReferenceFilename(original, 'pic.png', 'new.png'), '<img src=./assets/new.png/>')
})

test('rewrites sibling image filenames across all supported forms, encoded variants, and preserved suffixes', () => {
  const original = [
    '![inline](./old name.png)',
    '![titled](./old%20name.png "标题")',
    '[shot]: ./old name.png',
    '<img src="./old%20name.png" alt="quoted">',
    '<img src=./old%20name.png?raw=1>',
    '<img src=./old%20name.png#frag>',
  ].join('\n')

  const expected = [
    '![inline](./new name.png)',
    '![titled](./new%20name.png "标题")',
    '[shot]: ./new name.png',
    '<img src="./new%20name.png" alt="quoted">',
    '<img src=./new%20name.png?raw=1>',
    '<img src=./new%20name.png#frag>',
  ].join('\n')

  assert.equal(replaceSiblingImageReferenceFilename(original, 'old name.png', 'new name.png'), expected)
})

test('rewrites sibling image references outside fenced code blocks only', () => {
  const original = [
    '![real](./pic.png)',
    '~~~md',
    '![example](./pic.png)',
    '<img src="./pic.png">',
    '~~~',
  ].join('\n')

  const expected = [
    '![real](./new.png)',
    '~~~md',
    '![example](./pic.png)',
    '<img src="./pic.png">',
    '~~~',
  ].join('\n')

  assert.equal(replaceSiblingImageReferenceFilename(original, 'pic.png', 'new.png'), expected)
})

test('extracts and rewrites self-closing unquoted sibling img src references', () => {
  const original = '<img src=./pic.png/>'

  assert.deepEqual(extractSiblingImageReferences(original), ['pic.png'])
  assert.equal(replaceSiblingImageReferenceFilename(original, 'pic.png', 'new.png'), '<img src=./new.png/>')
})
