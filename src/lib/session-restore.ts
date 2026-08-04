import type { CmdResult, DocumentState } from './types'

export type StartupRestoreOutcome =
  | {
      applied: true
      shouldClearStaleConfig: false
      filename: string
      content: string
      message: string
    }
  | {
      applied: false
      shouldClearStaleConfig: boolean
    }

export function resolveStartupRestoreOutcome(
  loadRes: CmdResult<DocumentState> | null,
): StartupRestoreOutcome {
  if (loadRes === null) {
    return {
      applied: false,
      shouldClearStaleConfig: false,
    }
  }

  if (loadRes.ok && loadRes.data) {
    return {
      applied: true,
      shouldClearStaleConfig: false,
      filename: loadRes.data.filename,
      content: loadRes.data.content,
      message: `已自动恢复上次编辑文件：${loadRes.data.filename}`,
    }
  }

  return {
    applied: false,
    shouldClearStaleConfig: true,
  }
}

export function isLatestOpenRequest(requestToken: number, latestToken: number): boolean {
  return requestToken === latestToken
}

/**
 * Decides whether the startup blank-document fallback must be skipped.
 * True when this restore itself supplied a document, or when a newer open
 * request has since superseded it AND that newer request actually loaded a
 * document (`hasNewerDocumentLoaded`). A superseding request that itself
 * failed to load anything must not suppress the fallback — otherwise the
 * app would start with neither the restored file nor a properly
 * initialized blank document.
 */
export function shouldSkipBlankDocumentFallback(
  outcome: StartupRestoreOutcome,
  isRestoreStillLatest: boolean,
  hasNewerDocumentLoaded: boolean,
): boolean {
  return outcome.applied || (!isRestoreStillLatest && hasNewerDocumentLoaded)
}
