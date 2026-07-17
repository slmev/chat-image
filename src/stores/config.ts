import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ApiConfig, ApiConfigProfile, ApiConfigState } from '../types'
import {
  clearApiConfigState,
  generateId,
  getApiConfigState,
  normalizeApiConfigState,
  PersistenceError,
  setApiConfigState,
} from '../utils/storage'
import { DEFAULT_MODEL, STORAGE_KEYS } from '../utils/constants'
import { getMetadataValue, removeMetadataValue, setMetadataValue } from '../platform/metadataStore'
import { isTauriRuntime } from '../platform/runtime'

type ConfigInput = ApiConfig & { name?: string }

export const useConfigStore = defineStore('config', () => {
  const configState = ref<ApiConfigState>(getApiConfigState())
  let pendingMutation: Promise<void> = Promise.resolve()

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

  function cloneConfigState(source: ApiConfigState = configState.value): ApiConfigState {
    return {
      configs: source.configs.map((profile) => ({ ...profile })),
      activeConfigId: source.activeConfigId,
    }
  }

  function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const mutation = pendingMutation.then(operation)
    pendingMutation = mutation.then(
      () => undefined,
      () => undefined,
    )
    return mutation
  }

  async function persistSnapshot(snapshot: ApiConfigState, remove = false): Promise<void> {
    const storedSnapshot = cloneConfigState(snapshot)

    if (isTauriRuntime()) {
      if (remove) {
        await removeMetadataValue(STORAGE_KEYS.API_CONFIG)
      } else {
        await setMetadataValue(STORAGE_KEYS.API_CONFIG, storedSnapshot)
      }
    } else {
      if (remove) {
        clearApiConfigState()
      } else {
        setApiConfigState(storedSnapshot)
      }

      if (JSON.stringify(getApiConfigState()) !== JSON.stringify(storedSnapshot)) {
        throw new PersistenceError('Failed to save API configuration')
      }
    }
  }

  async function commitConfigState(nextState: ApiConfigState, remove = false): Promise<void> {
    const previousState = cloneConfigState()
    const nextSnapshot = cloneConfigState(nextState)
    configState.value = nextSnapshot

    try {
      await persistSnapshot(nextSnapshot, remove)
    } catch (originalError) {
      configState.value = previousState
      try {
        await persistSnapshot(previousState, previousState.configs.length === 0)
      } catch (rollbackError) {
        throw new PersistenceError('Config write failed and rollback was incomplete', {
          cause: { originalError, rollbackError },
        })
      }
      throw originalError
    }
  }

  async function addConfigInternal(input: ConfigInput): Promise<ApiConfigProfile> {
    const profile = normalizeProfile(input)
    const shouldActivate = configState.value.configs.length === 0
    await commitConfigState({
      configs: [...configState.value.configs, profile],
      activeConfigId: shouldActivate ? profile.id : configState.value.activeConfigId,
    })
    return profile
  }

  async function updateConfigInternal(id: string, updates: Partial<ConfigInput>): Promise<void> {
    await commitConfigState({
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
    })
  }

  async function activateConfigInternal(id: string): Promise<void> {
    if (!configState.value.configs.some((profile) => profile.id === id)) return
    await commitConfigState({
      ...configState.value,
      activeConfigId: id,
    })
  }

  async function deleteConfigInternal(id: string): Promise<void> {
    const configsAfterDelete = configState.value.configs.filter((profile) => profile.id !== id)
    const activeWasDeleted = configState.value.activeConfigId === id
    await commitConfigState({
      configs: configsAfterDelete,
      activeConfigId: activeWasDeleted
        ? (configsAfterDelete[0]?.id ?? null)
        : configState.value.activeConfigId,
    })
  }

  async function clearAllConfigsInternal(): Promise<void> {
    await commitConfigState(
      {
        configs: [],
        activeConfigId: null,
      },
      true,
    )
  }

  function addConfig(input: ConfigInput): Promise<ApiConfigProfile> {
    return enqueueMutation(() => addConfigInternal(input))
  }

  function updateConfig(id: string, updates: Partial<ConfigInput>): Promise<void> {
    return enqueueMutation(() => updateConfigInternal(id, updates))
  }

  function activateConfig(id: string): Promise<void> {
    return enqueueMutation(() => activateConfigInternal(id))
  }

  function deleteConfig(id: string): Promise<void> {
    return enqueueMutation(() => deleteConfigInternal(id))
  }

  function clearAllConfigs(): Promise<void> {
    return enqueueMutation(clearAllConfigsInternal)
  }

  function saveConfig(config: ApiConfig): Promise<void> {
    return enqueueMutation(async () => {
      if (configState.value.activeConfigId) {
        await updateConfigInternal(configState.value.activeConfigId, config)
      } else {
        await addConfigInternal(config)
      }
    })
  }

  function clearConfig(): Promise<void> {
    return enqueueMutation(async () => {
      if (configState.value.activeConfigId) {
        await deleteConfigInternal(configState.value.activeConfigId)
      } else {
        await clearAllConfigsInternal()
      }
    })
  }

  function updateEndpoint(endpoint: string): Promise<void> {
    return enqueueMutation(async () => {
      if (configState.value.activeConfigId) {
        await updateConfigInternal(configState.value.activeConfigId, { endpoint })
      } else {
        await addConfigInternal({
          endpoint,
          apiKey: '',
          model: DEFAULT_MODEL,
        })
      }
    })
  }

  function updateApiKey(apiKey: string): Promise<void> {
    return enqueueMutation(async () => {
      if (configState.value.activeConfigId) {
        await updateConfigInternal(configState.value.activeConfigId, { apiKey })
      } else {
        await addConfigInternal({
          endpoint: '',
          apiKey,
          model: DEFAULT_MODEL,
        })
      }
    })
  }

  function updateModel(model: string): Promise<void> {
    return enqueueMutation(async () => {
      if (configState.value.activeConfigId) {
        await updateConfigInternal(configState.value.activeConfigId, { model })
      }
    })
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
      await persistSnapshot(configState.value)
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
