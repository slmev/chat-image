import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ApiConfig, ApiConfigProfile, ApiConfigState } from '../types'
import {
  clearApiConfigState,
  generateId,
  getApiConfigState,
  normalizeApiConfigState,
  setApiConfigState,
} from '../utils/storage'
import { DEFAULT_MODEL, STORAGE_KEYS } from '../utils/constants'
import { getMetadataValue, removeMetadataValue, setMetadataValue } from '../platform/metadataStore'
import { isTauriRuntime } from '../platform/runtime'

type ConfigInput = ApiConfig & { name?: string }

export const useConfigStore = defineStore('config', () => {
  const configState = ref<ApiConfigState>(getApiConfigState())

  const configs = computed(() => configState.value.configs)
  const activeConfigId = computed(() => configState.value.activeConfigId)
  const activeConfigProfile = computed(
    () =>
      configState.value.configs.find(
        (profile) => profile.id === configState.value.activeConfigId,
      ) || null,
  )
  const apiConfig = computed<ApiConfig | null>(() => {
    const active = activeConfigProfile.value
    if (!active) return null
    return {
      endpoint: active.endpoint,
      apiKey: active.apiKey,
      model: active.model,
    }
  })
  const isConfigured = computed(() => {
    return (
      apiConfig.value !== null &&
      apiConfig.value.endpoint.trim() !== '' &&
      apiConfig.value.apiKey.trim() !== ''
    )
  })

  function nextConfigName(): string {
    const existingNames = new Set(configState.value.configs.map((profile) => profile.name.trim()))
    let index = 1
    while (existingNames.has(`配置 ${index}`)) {
      index += 1
    }
    return `配置 ${index}`
  }

  function normalizeProfile(input: ConfigInput, id = generateId()): ApiConfigProfile {
    return {
      id,
      name: input.name?.trim() || nextConfigName(),
      endpoint: input.endpoint,
      apiKey: input.apiKey,
      model: input.model || DEFAULT_MODEL,
    }
  }

  async function persist(): Promise<void> {
    const snapshot: ApiConfigState = {
      configs: configState.value.configs.map((profile) => ({ ...profile })),
      activeConfigId: configState.value.activeConfigId,
    }

    if (isTauriRuntime()) {
      await setMetadataValue(STORAGE_KEYS.API_CONFIG, snapshot)
    } else {
      setApiConfigState(snapshot)
    }
  }

  async function addConfig(input: ConfigInput): Promise<ApiConfigProfile> {
    const profile = normalizeProfile(input)
    const shouldActivate = configState.value.configs.length === 0
    configState.value = {
      configs: [...configState.value.configs, profile],
      activeConfigId: shouldActivate ? profile.id : configState.value.activeConfigId,
    }
    await persist()
    return profile
  }

  async function updateConfig(id: string, updates: Partial<ConfigInput>): Promise<void> {
    configState.value = {
      ...configState.value,
      configs: configState.value.configs.map((profile) =>
        profile.id === id
          ? {
              ...profile,
              ...updates,
              name: updates.name !== undefined ? updates.name.trim() || profile.name : profile.name,
              model: updates.model !== undefined ? updates.model || DEFAULT_MODEL : profile.model,
            }
          : profile,
      ),
    }
    await persist()
  }

  async function activateConfig(id: string): Promise<void> {
    if (!configState.value.configs.some((profile) => profile.id === id)) return
    configState.value = {
      ...configState.value,
      activeConfigId: id,
    }
    await persist()
  }

  async function deleteConfig(id: string): Promise<void> {
    const configsAfterDelete = configState.value.configs.filter((profile) => profile.id !== id)
    const activeWasDeleted = configState.value.activeConfigId === id
    configState.value = {
      configs: configsAfterDelete,
      activeConfigId: activeWasDeleted
        ? (configsAfterDelete[0]?.id ?? null)
        : configState.value.activeConfigId,
    }
    await persist()
  }

  async function clearAllConfigs(): Promise<void> {
    configState.value = {
      configs: [],
      activeConfigId: null,
    }
    if (isTauriRuntime()) {
      await removeMetadataValue(STORAGE_KEYS.API_CONFIG)
    } else {
      clearApiConfigState()
    }
  }

  async function saveConfig(config: ApiConfig): Promise<void> {
    if (configState.value.activeConfigId) {
      await updateConfig(configState.value.activeConfigId, config)
      return
    }

    await addConfig(config)
  }

  async function clearConfig(): Promise<void> {
    if (configState.value.activeConfigId) {
      await deleteConfig(configState.value.activeConfigId)
    } else {
      await clearAllConfigs()
    }
  }

  async function updateEndpoint(endpoint: string): Promise<void> {
    if (configState.value.activeConfigId) {
      await updateConfig(configState.value.activeConfigId, { endpoint })
    } else {
      await addConfig({
        endpoint,
        apiKey: '',
        model: DEFAULT_MODEL,
      })
    }
  }

  async function updateApiKey(apiKey: string): Promise<void> {
    if (configState.value.activeConfigId) {
      await updateConfig(configState.value.activeConfigId, { apiKey })
    } else {
      await addConfig({
        endpoint: '',
        apiKey,
        model: DEFAULT_MODEL,
      })
    }
  }

  async function updateModel(model: string): Promise<void> {
    if (configState.value.activeConfigId) {
      await updateConfig(configState.value.activeConfigId, { model })
    }
  }

  async function hydrateFromPersistence(): Promise<void> {
    if (!isTauriRuntime()) return
    const stored = await getMetadataValue<unknown>(STORAGE_KEYS.API_CONFIG, null)
    const normalized = normalizeApiConfigState(stored, false)
    configState.value = {
      configs: normalized.configs,
      activeConfigId: normalized.activeConfigId ?? normalized.configs[0]?.id ?? null,
    }

    if (stored !== null) {
      await persist()
    }
  }

  return {
    configState,
    configs,
    activeConfigId,
    activeConfigProfile,
    apiConfig,
    isConfigured,
    nextConfigName,
    addConfig,
    updateConfig,
    activateConfig,
    deleteConfig,
    clearAllConfigs,
    saveConfig,
    clearConfig,
    updateEndpoint,
    updateApiKey,
    updateModel,
    hydrateFromPersistence,
  }
})
