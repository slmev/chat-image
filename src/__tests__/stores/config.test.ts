import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { STORAGE_KEYS } from '../../utils/constants'

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('../../platform/metadataStore', () => ({
  getMetadataValue: vi.fn(),
  removeMetadataValue: vi.fn(),
  setMetadataValue: vi.fn(),
}))

describe('config store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
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
})
