import assert from 'node:assert/strict'
import test from 'node:test'

import { reactive, ref, watch } from 'vue'

import { withDirtyTrackingSuppressed } from './confluence-dirty-guard.ts'

function createConfluenceDirtyHarness() {
  const form = reactive({
    baseUrl: '',
    username: '',
    spaceKey: '',
    parentPageId: '',
    ignoreSsl: false,
  })
  const dirty = ref(false)
  const suppress = ref(false)

  watch(
    form,
    () => {
      if (!suppress.value) {
        dirty.value = true
      }
    },
    { deep: true, flush: 'sync' }
  )

  return { form, dirty, suppress }
}

test('keeps dirty false for synchronous suppressed mutations', () => {
  const { form, dirty, suppress } = createConfluenceDirtyHarness()

  withDirtyTrackingSuppressed(suppress, () => {
    form.baseUrl = 'https://example.atlassian.net'
    form.username = 'max@example.com'
  })

  assert.equal(dirty.value, false)
  assert.equal(suppress.value, false)
})

test('marks dirty for reactive writes outside suppression', () => {
  const { form, dirty } = createConfluenceDirtyHarness()

  form.baseUrl = 'https://example.atlassian.net'

  assert.equal(dirty.value, true)
})

test('throws and resets suppression for thenable-returning mutations', () => {
  const { form, dirty, suppress } = createConfluenceDirtyHarness()

  assert.throws(
    () => withDirtyTrackingSuppressed(
      suppress,
      (() => {
        form.baseUrl = 'https://example.atlassian.net'
        return Promise.resolve()
      }) as unknown as () => void
    ),
    (error: unknown) => {
      assert.ok(error instanceof TypeError)
      assert.match(
        error.message,
        /must be fully synchronous|flush:'sync' dirty-tracking guard/
      )
      return true
    }
  )

  assert.equal(suppress.value, false)
  assert.equal(dirty.value, false)
})

test('preserves an outer suppression scope across a nested call', () => {
  const { form, dirty, suppress } = createConfluenceDirtyHarness()

  withDirtyTrackingSuppressed(suppress, () => {
    form.baseUrl = 'https://outer.atlassian.net'
    withDirtyTrackingSuppressed(suppress, () => {
      form.username = 'nested@example.com'
    })
    // The nested call must not have turned suppression off early: this write
    // still happens inside the outer suppressed scope.
    form.spaceKey = 'OUTER'
  })

  assert.equal(dirty.value, false)
  assert.equal(suppress.value, false)
})

test('resets suppression via finally even when mutate throws synchronously', () => {
  const { form, dirty, suppress } = createConfluenceDirtyHarness()

  assert.throws(
    () =>
      withDirtyTrackingSuppressed(suppress, () => {
        form.baseUrl = 'https://example.atlassian.net'
        throw new Error('boom')
      }),
    /boom/
  )

  assert.equal(suppress.value, false)
  // The write before the throw happened while suppressed, so it must not
  // have marked the form dirty.
  assert.equal(dirty.value, false)
})
