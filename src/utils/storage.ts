import { DEFAULT_GENERATION_OPTIONS, STORAGE_KEYS, normalizeGenerationOptions } from './constants'
import type {
  ApiConfig,
  ApiConfigProfile,
  ApiConfigState,
  ChatMessage,
  Theme,
  GenerationOptions,
} from '../types'
import { reviveStoredImageUrls, stripBase64FromMessages } from './imagePersistence'

// 通用的本地存储工具函数
export function getFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key)
    if (stored === null) return defaultValue
    return JSON.parse(stored) as T
  } catch (error) {
    console.error(`Error reading from localStorage key ${key}:`, error)
    return defaultValue
  }
}

export function setToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn(`Storage quota exceeded for key ${key}`)
    } else {
      console.error(`Error writing to localStorage key ${key}:`, error)
    }
  }
}

export function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.error(`Error removing from localStorage key ${key}:`, error)
  }
}

function decodeApiKey(config: ApiConfig): ApiConfig {
  const next = { ...config }
  if (next.apiKey) {
    try {
      next.apiKey = atob(next.apiKey)
    } catch {
      // 如果解码失败，说明是明文存储（向后兼容）
    }
  }
  return next
}

function encodeApiKey<T extends ApiConfig>(config: T): T {
  return {
    ...config,
    apiKey: btoa(config.apiKey),
  }
}

function isApiConfig(value: unknown): value is ApiConfig {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as ApiConfig).endpoint === 'string' &&
    typeof (value as ApiConfig).apiKey === 'string' &&
    typeof (value as ApiConfig).model === 'string'
  )
}

function isApiConfigProfile(value: unknown): value is ApiConfigProfile {
  return (
    isApiConfig(value) &&
    typeof (value as ApiConfigProfile).id === 'string' &&
    typeof (value as ApiConfigProfile).name === 'string'
  )
}

export function normalizeApiConfigState(value: unknown, decodeKeys = true): ApiConfigState {
  if (value && typeof value === 'object' && Array.isArray((value as ApiConfigState).configs)) {
    const configs = (value as ApiConfigState).configs.filter(isApiConfigProfile).map((profile) => ({
      ...(decodeKeys ? decodeApiKey(profile) : profile),
      id: profile.id,
      name: profile.name.trim() || '配置 1',
    }))
    const activeConfigId = configs.some(
      (profile) => profile.id === (value as ApiConfigState).activeConfigId,
    )
      ? (value as ApiConfigState).activeConfigId
      : (configs[0]?.id ?? null)
    return { configs, activeConfigId }
  }

  if (isApiConfig(value)) {
    const config = decodeKeys ? decodeApiKey(value) : value
    const id = generateId()
    return {
      configs: [
        {
          ...config,
          id,
          name: '配置 1',
        },
      ],
      activeConfigId: id,
    }
  }

  return { configs: [], activeConfigId: null }
}

// API 配置存储（API Key 使用 Base64 编码存储）
export function getApiConfigState(): ApiConfigState {
  const state = normalizeApiConfigState(getFromStorage<unknown>(STORAGE_KEYS.API_CONFIG, null))
  return {
    configs: state.configs,
    activeConfigId: state.activeConfigId ?? state.configs[0]?.id ?? null,
  }
}

export function setApiConfigState(state: ApiConfigState): void {
  setToStorage(STORAGE_KEYS.API_CONFIG, {
    activeConfigId: state.activeConfigId,
    configs: state.configs.map((profile) => encodeApiKey(profile)),
  })
}

export function clearApiConfigState(): void {
  removeFromStorage(STORAGE_KEYS.API_CONFIG)
}

export function getApiConfig(): ApiConfig | null {
  const state = getApiConfigState()
  const activeProfile = state.configs.find((profile) => profile.id === state.activeConfigId) || null
  if (!activeProfile) return null
  return {
    endpoint: activeProfile.endpoint,
    apiKey: activeProfile.apiKey,
    model: activeProfile.model,
  }
}

export function setApiConfig(config: ApiConfig): void {
  const profile: ApiConfigProfile = {
    ...config,
    id: generateId(),
    name: '配置 1',
  }
  setApiConfigState({
    configs: [profile],
    activeConfigId: profile.id,
  })
}

export function clearApiConfig(): void {
  clearApiConfigState()
}

// 对话历史存储
export function getChatHistory(): ChatMessage[] {
  const messages = getFromStorage<ChatMessage[]>(STORAGE_KEYS.CHAT_HISTORY, [])
  // Migration: ensure all messages have isFavorite field and revive persisted image data.
  const migrated = messages.map((msg) => ({
    ...msg,
    isFavorite: msg.isFavorite ?? false,
  }))
  return reviveStoredImageUrls(migrated)
}

export function setChatHistory(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(messages))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      // 图片 base64 可能较大，超限时优先保留最近的完整消息。
      console.warn('Storage quota exceeded, trimming history...')
      const trimmed = messages.slice(-20)
      try {
        localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(trimmed))
      } catch {
        try {
          localStorage.setItem(
            STORAGE_KEYS.CHAT_HISTORY,
            JSON.stringify(stripBase64FromMessages(trimmed)),
          )
          console.warn('Saved trimmed history without image base64 data')
        } catch {
          console.error('Still cannot save after trimming. Consider clearing history.')
        }
      }
    } else {
      console.error('Error writing chat history:', error)
    }
  }
}

export function clearChatHistory(): void {
  removeFromStorage(STORAGE_KEYS.CHAT_HISTORY)
}

// 主题存储
export function getTheme(): Theme {
  return getFromStorage<Theme>(STORAGE_KEYS.THEME, 'system')
}

export function setTheme(theme: Theme): void {
  setToStorage(STORAGE_KEYS.THEME, theme)
}

// 生成选项存储
export function getGenerationOptions(): GenerationOptions {
  return normalizeGenerationOptions(
    getFromStorage<unknown>(STORAGE_KEYS.GENERATION_OPTIONS, DEFAULT_GENERATION_OPTIONS),
  )
}

export function setGenerationOptions(options: GenerationOptions): void {
  setToStorage(STORAGE_KEYS.GENERATION_OPTIONS, normalizeGenerationOptions(options))
}

// 生成唯一 ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}
