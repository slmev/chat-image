import { describe, expect, it, vi } from 'vitest'
import { runtimeFetchWithDependencies } from '../../platform/httpClient'

function response(status = 200): Response {
  return new Response('{}', { status })
}

describe('runtime http client', () => {
  it('uses browser fetch outside Tauri', async () => {
    const browserFetch = vi.fn(async () => response())
    const tauriFetch = vi.fn(async () => vi.fn(async () => response()))

    await runtimeFetchWithDependencies('https://api.example.test/v1/models', undefined, {
      isTauriRuntime: () => false,
      browserFetch,
      tauriFetch,
    })

    expect(browserFetch).toHaveBeenCalledWith('https://api.example.test/v1/models', undefined)
    expect(tauriFetch).not.toHaveBeenCalled()
  })

  it('uses Tauri plugin fetch in Tauri', async () => {
    const browserFetch = vi.fn(async () => response())
    const pluginFetch = vi.fn(async () => response())
    const tauriFetch = vi.fn(async () => pluginFetch)
    const init = { method: 'GET', signal: new AbortController().signal }

    await runtimeFetchWithDependencies('https://api.example.test/v1/models', init, {
      isTauriRuntime: () => true,
      browserFetch,
      tauriFetch,
    })

    expect(tauriFetch).toHaveBeenCalled()
    expect(pluginFetch).toHaveBeenCalledWith('https://api.example.test/v1/models', init)
    expect(browserFetch).not.toHaveBeenCalled()
  })
})
