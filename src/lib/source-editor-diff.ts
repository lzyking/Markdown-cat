export interface MinimalLineChange {
  from: number
  to: number
  insert: string
}

export type LineAt = (offset: number) => { number: number }

export function computeMinimalLineChange(
  current: string,
  next: string,
  lineAt: LineAt,
): MinimalLineChange | null {
  if (current === next) {
    return null
  }

  let from = 0
  const sharedPrefixLimit = Math.min(current.length, next.length)

  while (from < sharedPrefixLimit && current[from] === next[from]) {
    from += 1
  }

  let currentEnd = current.length
  let nextEnd = next.length

  while (
    currentEnd > from
    && nextEnd > from
    && current[currentEnd - 1] === next[nextEnd - 1]
  ) {
    currentEnd -= 1
    nextEnd -= 1
  }

  const insert = next.slice(from, nextEnd)
  if (current.slice(from, currentEnd).includes('\n') || insert.includes('\n')) {
    return null
  }

  const startLine = lineAt(from).number
  const endPosition = currentEnd > from ? currentEnd - 1 : from
  const endLine = lineAt(endPosition).number

  if (startLine !== endLine) {
    return null
  }

  return {
    from,
    to: currentEnd,
    insert,
  }
}
