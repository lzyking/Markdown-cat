import assert from 'node:assert/strict'
import test from 'node:test'

import { defaultThemeId, getResolvedThemeId } from './themes.ts'

test('returns the same theme id when the value is valid', () => {
  assert.equal(getResolvedThemeId('nord-light'), 'nord-light')
})

test('falls back to default theme id when the value is invalid', () => {
  assert.equal(getResolvedThemeId('not-a-real-theme'), defaultThemeId)
})

test('falls back to default theme id when the value is undefined', () => {
  assert.equal(getResolvedThemeId(undefined), defaultThemeId)
})
