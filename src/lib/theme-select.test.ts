import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveThemeSelectionOutcome } from './theme-select.ts'

test('returns requested theme and success message when config save succeeds', () => {
  const outcome = resolveThemeSelectionOutcome('midnight-slate', 'nord-light', { ok: true })

  assert.deepEqual(outcome, {
    themeId: 'nord-light',
    status: 'success',
    message: '主题已切换为 nord-light',
  })
})

test('rolls back to previous theme and reports backend error when config save fails', () => {
  const outcome = resolveThemeSelectionOutcome('midnight-slate', 'nord-light', {
    ok: false,
    error: 'ERR_X',
  })

  assert.equal(outcome.themeId, 'midnight-slate')
  assert.equal(outcome.status, 'failure')
  assert.match(outcome.message, /ERR_X/)
})

test('rolls back to previous theme and reports thrown error when config save throws', () => {
  const outcome = resolveThemeSelectionOutcome('midnight-slate', 'nord-light', null, 'boom')

  assert.equal(outcome.themeId, 'midnight-slate')
  assert.equal(outcome.status, 'failure')
  assert.match(outcome.message, /boom/)
})
