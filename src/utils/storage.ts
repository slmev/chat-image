import { STORAGE_KEYS } from './constants'
import type { ApiConfig, ChatMessage, Theme, GenerationOptions } from '../types'
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

// API 配置存储（API Key 使用 Base64 编码存储）
export function getApiConfig(): ApiConfig | null {
  const config = getFromStorage<ApiConfig | null>(STORAGE_KEYS.API_CONFIG, null)
  if (config && config.apiKey) {
    try {
      // 尝试解码 Base64
      config.apiKey = atob(config.apiKey)
    } catch {
      // 如果解码失败，说明是明文存储（向后兼容）
    }
  }
  return config
}

export function setApiConfig(config: ApiConfig): void {
  // 对 API Key 进行 Base64 编码
  const encodedConfig = {
    ...config,
    apiKey: btoa(config.apiKey),
  }
  setToStorage(STORAGE_KEYS.API_CONFIG, encodedConfig)
}

export function clearApiConfig(): void {
  removeFromStorage(STORAGE_KEYS.API_CONFIG)
}

// 对话历史存储
export function getChatHistory(): ChatMessage[] {
  const messages = getFromStorage<ChatMessage[]>(STORAGE_KEYS.CHAT_HISTORY, [])
  // Migration: ensure all messages have isFavorite field and revive persisted image data.
  const migrated = messages.map(msg => ({
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
  return getFromStorage<GenerationOptions>(STORAGE_KEYS.GENERATION_OPTIONS, {
    size: '1024x1024',
    quality: 'standard',
    n: 1,
  })
}

export function setGenerationOptions(options: GenerationOptions): void {
  setToStorage(STORAGE_KEYS.GENERATION_OPTIONS, options)
}

// 生成唯一 ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}
