import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { STORAGE_KEYS } from '../../utils/constants'

const mockState = vi.hoisted(() => ({
  tauriRuntime: false,
  getMetadataValue: vi.fn(),
  removeMetadataValue: vi.fn(),
  setMetadataValue: vi.fn(),
}))

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => mockState.tauriRuntime,
}))

vi.mock('../../platform/metadataStore', () => ({
  getMetadataValue: mockState.getMetadataValue,
  removeMetadataValue: mockState.removeMetadataValue,
  setMetadataValue: mockState.setMetadataValue,
}))

describe('config store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockState.tauriRuntime = false
    mockState.getMetadataValue.mockReset()
    mockState.removeMetadataValue.mockReset()
    mockState.setMetadataValue.mockReset()
    mockState.getMetadataValue.mockResolvedValue(null)
    mockState.removeMetadataValue.mockResolvedValue(undefined)
    mockState.setMetadataValue.mockResolvedValue(undefined)
  })

  it('migrates a legacy single API config to the first active profile', async () => {
    localStorage.setItem(
      STORAGE_KEYS.API_CONFIG,
      JSON.stringify({
        endpoint: 'https://api.example.test',
        apiKey: btoa('sk-legacy'),
        model: 'gpt-image-2',
      }),
    )

    const { useConfigStore } = await import('../../stores/config')
    const store = useConfigStore()

    expect(store.configs).toHaveLength(1)
    expect(store.configs[0]).toMatchObject({
      name: '配置 1',
      endpoint: 'https://api.example.test',
      apiKey: 'sk-legacy',
      model: 'gpt-image-2',
    })
    expect(store.activeConfigId).toBe(store.configs[0].id)
    expect(store.apiConfig).toEqual({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-legacy',
      model: 'gpt-image-2',
    })
  })

  it('activates only the first added config by default', async () => {
    const { useConfigStore } = await import('../../stores/config')
    const store = useConfigStore()

    const first = await store.addConfig({
      name: 'Primary',
      endpoint: 'https://primary.example.test',
      apiKey: 'sk-primary',
      model: 'gpt-image-2',
    })
    const second = await store.addConfig({
      name: 'Backup',
      endpoint: 'https://backup.example.test',
      apiKey: 'sk-backup',
      model: 'gpt-image-2',
    })

    expect(store.activeConfigId).toBe(first.id)

    await store.activateConfig(second.id)

    expect(store.activeConfigId).toBe(second.id)
    expect(store.apiConfig?.endpoint).toBe('https://backup.example.test')
  })

  it('falls back to the first remaining config when deleting the active config', async () => {
    const { useConfigStore } = await import('../../stores/config')
    const store = useConfigStore()
    const first = await store.addConfig({
      name: 'Primary',
      endpoint: 'https://primary.example.test',
      apiKey: 'sk-primary',
      model: 'gpt-image-2',
    })
    const second = await store.addConfig({
      name: 'Backup',
      endpoint: 'https://backup.example.test',
      apiKey: 'sk-backup',
      model: 'gpt-image-2',
    })

    await store.activateConfig(second.id)
    await store.deleteConfig(second.id)

    expect(store.activeConfigId).toBe(first.id)
    expect(store.apiConfig?.endpoint).toBe('https://primary.example.test')
  })

  it('clears all configs and deactivates API access', async () => {
    const { useConfigStore } = await import('../../stores/config')
    const store = useConfigStore()
    await store.addConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })

    await store.clearAllConfigs()

    expect(store.configs).toEqual([])
    expect(store.activeConfigId).toBeNull()
    expect(store.isConfigured).toBe(false)
  })

  it('uses the first available default config name', async () => {
    const { useConfigStore } = await import('../../stores/config')
    const store = useConfigStore()
    const first = await store.addConfig({
      endpoint: 'https://first.example.test',
      apiKey: 'sk-first',
      model: 'gpt-image-2',
    })
    await store.addConfig({
      endpoint: 'https://second.example.test',
      apiKey: 'sk-second',
      model: 'gpt-image-2',
    })

    await store.deleteConfig(first.id)

    expect(store.nextConfigName()).toBe('配置 1')
  })

  it('rolls back web config when local storage rejects the write', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })
    const { useConfigStore } = await import('../../stores/config')
    const store = useConfigStore()

    await expect(
      store.addConfig({
        endpoint: 'https://api.example.test',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
      }),
    ).rejects.toThrow('Failed to save API configuration')

    expect(store.configs).toEqual([])
    expect(store.activeConfigId).toBeNull()
    setItem.mockRestore()
    warn.mockRestore()
  })

  it('rolls back in-memory desktop config when persistence fails', async () => {
    mockState.tauriRuntime = true
    mockState.setMetadataValue.mockRejectedValueOnce(new Error('save failed'))
    const { useConfigStore } = await import('../../stores/config')
    const store = useConfigStore()

    await expect(
      store.addConfig({
        endpoint: 'https://api.example.test',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
      }),
    ).rejects.toThrow('save failed')

    expect(store.configs).toEqual([])
    expect(store.activeConfigId).toBeNull()
  })

  it('restores desktop config when clearing persistence fails', async () => {
    mockState.tauriRuntime = true
    const { useConfigStore } = await import('../../stores/config')
    const store = useConfigStore()
    const profile = await store.addConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    mockState.removeMetadataValue.mockRejectedValueOnce(new Error('remove failed'))

    await expect(store.clearAllConfigs()).rejects.toThrow('remove failed')

    expect(store.configs).toEqual([profile])
    expect(store.activeConfigId).toBe(profile.id)
  })

  it('serializes desktop config writes in invocation order', async () => {
    mockState.tauriRuntime = true
    let finishFirstWrite: () => void = () => undefined
    let firstWriteFinished = false
    let secondStartedBeforeFirstFinished = false
    const snapshots: unknown[] = []
    mockState.setMetadataValue
      .mockImplementationOnce(async (_key: string, value: unknown) => {
        snapshots.push(value)
        await new Promise<void>((resolve) => {
          finishFirstWrite = resolve
        })
        firstWriteFinished = true
      })
      .mockImplementationOnce(async (_key: string, value: unknown) => {
        secondStartedBeforeFirstFinished = !firstWriteFinished
        snapshots.push(value)
      })
    const { useConfigStore } = await import('../../stores/config')
    const store = useConfigStore()

    const firstAdd = store.addConfig({
      name: 'First',
      endpoint: 'https://first.example.test',
      apiKey: 'sk-first',
      model: 'gpt-image-2',
    })
    await vi.waitFor(() => expect(mockState.setMetadataValue).toHaveBeenCalledTimes(1))
    const secondAdd = store.addConfig({
      name: 'Second',
      endpoint: 'https://second.example.test',
      apiKey: 'sk-second',
      model: 'gpt-image-2',
    })

    finishFirstWrite()
    await Promise.all([firstAdd, secondAdd])

    expect(secondStartedBeforeFirstFinished).toBe(false)
    expect(snapshots).toHaveLength(2)
    expect((snapshots[0] as { configs: unknown[] }).configs).toHaveLength(1)
    expect((snapshots[1] as { configs: unknown[] }).configs).toHaveLength(2)
    expect(store.configs.map((profile) => profile.name)).toEqual(['First', 'Second'])
  })
})
