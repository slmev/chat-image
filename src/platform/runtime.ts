declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export type AppRuntime = 'web' | 'tauri'

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
}

export function getRuntime(): AppRuntime {
  return isTauriRuntime() ? 'tauri' : 'web'
}
