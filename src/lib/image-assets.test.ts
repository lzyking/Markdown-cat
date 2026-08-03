import assert from 'node:assert/strict'
import test from 'node:test'

import { extractAssetReferences } from './image-assets.ts'

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
