import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ApiConfig } from '../types'
import { getApiConfig, setApiConfig, clearApiConfig } from '../utils/storage'
import { DEFAULT_MODEL, STORAGE_KEYS } from '../utils/constants'
import { getMetadataValue, removeMetadataValue, setMetadataValue } from '../platform/metadataStore'
import { isTauriRuntime } from '../platform/runtime'

export const useConfigStore = defineStore('config', () => {
  // State
  const apiConfig = ref<ApiConfig | null>(getApiConfig())
  const isConfigured = computed(() => {
    return apiConfig.value !== null &&
           apiConfig.value.endpoint.trim() !== '' &&
           apiConfig.value.apiKey.trim() !== ''
  })

  // Actions
  async function saveConfig(config: ApiConfig): Promise<void> {
    const snapshot = { ...config }
    apiConfig.value = snapshot
    if (isTauriRuntime()) {
      await setMetadataValue(STORAGE_KEYS.API_CONFIG, snapshot)
    } else {
      setApiConfig(snapshot)
    }
  }

  async function clearConfig(): Promise<void> {
    apiConfig.value = null
    if (isTauriRuntime()) {
      await removeMetadataValue(STORAGE_KEYS.API_CONFIG)
    } else {
      clearApiConfig()
    }
  }

  async function updateEndpoint(endpoint: string): Promise<void> {
    if (apiConfig.value) {
      apiConfig.value.endpoint = endpoint
      await saveConfig(apiConfig.value)
    } else {
      await saveConfig({
        endpoint,
        apiKey: '',
        model: DEFAULT_MODEL,
      })
    }
  }

  async function updateApiKey(apiKey: string): Promise<void> {
    if (apiConfig.value) {
      apiConfig.value.apiKey = apiKey
      await saveConfig(apiConfig.value)
    } else {
      await saveConfig({
        endpoint: '',
        apiKey,
        model: DEFAULT_MODEL,
      })
    }
  }

  async function updateModel(model: string): Promise<void> {
    if (apiConfig.value) {
      apiConfig.value.model = model
      await saveConfig(apiConfig.value)
    }
  }

  async function hydrateFromPersistence(): Promise<void> {
    if (!isTauriRuntime()) return
    apiConfig.value = await getMetadataValue<ApiConfig | null>(STORAGE_KEYS.API_CONFIG, null)
  }

  return {
    apiConfig,
    isConfigured,
    saveConfig,
    clearConfig,
    updateEndpoint,
    updateApiKey,
    updateModel,
    hydrateFromPersistence,
  }
})
