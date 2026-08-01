import { open as tauriOpen, save as tauriSave } from '@tauri-apps/plugin-dialog'

export type OpenDialogOptions = Parameters<typeof tauriOpen>[0]
export type SaveDialogOptions = Parameters<typeof tauriSave>[0]

export async function openDialog(options?: OpenDialogOptions) {
  const tauriMock = (window as any).__TAURI_MOCK__
  if (tauriMock?.dialog?.open) {
    return tauriMock.dialog.open(options)
  }
  return tauriOpen(options)
}

export async function saveDialog(options?: SaveDialogOptions) {
  const tauriMock = (window as any).__TAURI_MOCK__
  if (tauriMock?.dialog?.save) {
    return tauriMock.dialog.save(options)
  }
  return tauriSave(options)
}
