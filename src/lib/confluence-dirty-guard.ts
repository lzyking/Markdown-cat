import type { Ref } from 'vue'

export function withDirtyTrackingSuppressed(
  suppressFlag: Ref<boolean>,
  mutate: () => void
): void {
  // Restore (not hard-reset) the previous suppression state so nested/re-entrant
  // calls don't prematurely re-enable dirty tracking for an outer suppressed scope.
  const previouslySuppressed = suppressFlag.value
  let result: unknown

  try {
    suppressFlag.value = true
    result = (mutate as () => unknown)()
  } finally {
    suppressFlag.value = previouslySuppressed
  }

  if (
    (typeof result === 'object' || typeof result === 'function')
    && result !== null
    && 'then' in result
    && typeof (result as { then?: unknown }).then === 'function'
  ) {
    // This fails loudly if a refactor ever splits suppress/mutate/un-suppress across an await.
    throw new TypeError(
      "withDirtyTrackingSuppressed mutate callback must be fully synchronous; returning a Promise/thenable silently defeats the flush:'sync' dirty-tracking guard."
    )
  }
}
