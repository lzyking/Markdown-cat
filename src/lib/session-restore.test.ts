import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isLatestOpenRequest,
  resolveStartupRestoreOutcome,
  shouldSkipBlankDocumentFallback,
} from './session-restore.ts'

test('applies startup restore payload when document load succeeds', () => {
  const outcome = resolveStartupRestoreOutcome({
    ok: true,
    data: {
      filename: 'notes.md',
      content: '# hi',
    },
  })

  assert.deepEqual(outcome, {
    applied: true,
    shouldClearStaleConfig: false,
    filename: 'notes.md',
    content: '# hi',
    message: '已自动恢复上次编辑文件：notes.md',
  })
})

test('marks stale config for clearing when document load fails explicitly', () => {
  const outcome = resolveStartupRestoreOutcome({
    ok: false,
    error: 'ENOENT',
  })

  assert.deepEqual(outcome, {
    applied: false,
    shouldClearStaleConfig: true,
  })
})

test('preserves stale config when document load throws and resolves as null', () => {
  const outcome = resolveStartupRestoreOutcome(null)

  assert.deepEqual(outcome, {
    applied: false,
    shouldClearStaleConfig: false,
  })
})

test('returns true when request token matches latest token', () => {
  assert.equal(isLatestOpenRequest(3, 3), true)
})

test('returns false when request token is stale', () => {
  assert.equal(isLatestOpenRequest(2, 3), false)
})

test('skips blank-document fallback when restore applied its own document', () => {
  const outcome = resolveStartupRestoreOutcome({
    ok: true,
    data: { filename: 'notes.md', content: '# hi' },
  })

  assert.equal(shouldSkipBlankDocumentFallback(outcome, true, false), true)
})

test('skips blank-document fallback when a newer open request superseded a failed restore and loaded a document', () => {
  // Regression guard: a stale restore that failed/threw must not let the
  // blank-document fallback run and clobber a document the user has
  // already opened via a newer, still-in-flight-or-completed request.
  const outcome = resolveStartupRestoreOutcome({ ok: false, error: 'ENOENT' })

  assert.equal(shouldSkipBlankDocumentFallback(outcome, false, true), true)
})

test('runs blank-document fallback when a newer open request superseded a failed restore but itself failed to load a document', () => {
  // Regression guard: if the superseding request never actually loaded a
  // document (e.g. it also failed), the app must not end up with neither
  // the restored file nor a properly initialized blank document.
  const outcome = resolveStartupRestoreOutcome({ ok: false, error: 'ENOENT' })

  assert.equal(shouldSkipBlankDocumentFallback(outcome, false, false), false)
})

test('runs blank-document fallback when restore failed and no newer request superseded it', () => {
  const outcome = resolveStartupRestoreOutcome(null)

  assert.equal(shouldSkipBlankDocumentFallback(outcome, true, false), false)
})
