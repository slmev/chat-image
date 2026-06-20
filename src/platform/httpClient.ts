import { isTauriRuntime } from './runtime'

type RuntimeFetchInput = string | URL | Request
type RuntimeFetch = (input: RuntimeFetchInput, init?: RequestInit) => Promise<Response>

interface RuntimeFetchDependencies {
  isTauriRuntime: () => boolean
  browserFetch: RuntimeFetch
  tauriFetch: () => Promise<RuntimeFetch>
}

async function loadTauriFetch(): Promise<RuntimeFetch> {
  const { fetch } = await import('@tauri-apps/plugin-http')
  return fetch
}

export async function runtimeFetchWithDependencies(
  input: RuntimeFetchInput,
  init: RequestInit | undefined,
  dependencies: RuntimeFetchDependencies,
): Promise<Response> {
  if (dependencies.isTauriRuntime()) {
    const tauriFetch = await dependencies.tauriFetch()
    return tauriFetch(input, init)
  }

  return dependencies.browserFetch(input, init)
}

export async function runtimeFetch(
  input: RuntimeFetchInput,
  init?: RequestInit,
): Promise<Response> {
  return runtimeFetchWithDependencies(input, init, {
    isTauriRuntime,
    browserFetch: globalThis.fetch.bind(globalThis),
    tauriFetch: loadTauriFetch,
  })
}
