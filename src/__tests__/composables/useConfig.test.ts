import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfig, localizeApiTestResult } from '../../composables/useConfig'
import { useConfigStore } from '../../stores/config'

const mockState = vi.hoisted(() => ({
  runtimeFetch: vi.fn(),
}))

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('../../platform/metadataStore', () => ({
  getMetadataValue: vi.fn(),
  removeMetadataValue: vi.fn(),
  setMetadataValue: vi.fn(),
}))

vi.mock('../../platform/httpClient', () => ({
  runtimeFetch: mockState.runtimeFetch,
}))

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('useConfig', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockState.runtimeFetch.mockReset()
  })

  it('tests API connection through the runtime HTTP client', async () => {
    mockState.runtimeFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    const store = useConfigStore()
    await store.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })

    const { testApiConnection } = useConfig()
    const result = await testApiConnection()

    expect(result).toEqual({ success: true, code: 'apiConnectionSuccess' })
    expect(mockState.runtimeFetch).toHaveBeenCalledWith('https://api.example.test/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer sk-test',
      },
    })
  })

  it('can test an unsaved config directly', async () => {
    mockState.runtimeFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))

    const { testApiConnection } = useConfig()
    const result = await testApiConnection({
      endpoint: 'https://api.unsaved.test',
      apiKey: 'sk-unsaved',
      model: 'gpt-image-2',
    })

    expect(result).toEqual({ success: true, code: 'apiConnectionSuccess' })
    expect(mockState.runtimeFetch).toHaveBeenCalledWith('https://api.unsaved.test/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer sk-unsaved',
      },
    })
  })

  it('keeps existing connection error messages', async () => {
    mockState.runtimeFetch.mockResolvedValueOnce(jsonResponse({
      error: { message: 'model endpoint unavailable' },
    }, 400))
    const store = useConfigStore()
    await store.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })

    const { testApiConnection } = useConfig()

    await expect(testApiConnection()).resolves.toEqual({
      success: false,
      code: 'serverError',
      detail: 'model endpoint unavailable',
      status: 400,
    })
  })

  it('localizeApiTestResult translates known codes', () => {
    const t = (key: string) => key
    expect(localizeApiTestResult({ success: true, code: 'apiConnectionSuccess' }, t)).toBe('apiConnectionSuccess')
    expect(localizeApiTestResult({ success: false, code: 'invalidApiKey' }, t)).toBe('invalidApiKey')
  })

  it('localizeApiTestResult prefers server detail over i18n key', () => {
    const t = (key: string, named?: Record<string, unknown>) => `${key}:${named?.code}`
    expect(localizeApiTestResult(
      { success: false, code: 'serverError', detail: 'model not found', status: 400 },
      t,
    )).toBe('model not found')
    expect(localizeApiTestResult(
      { success: false, code: 'serverError', status: 400 },
      t,
    )).toBe('apiTestServerError:400')
  })
})
