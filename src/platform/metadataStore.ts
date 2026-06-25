import type { ChatHistory, ChatMessage, GenerationOptions, Theme } from '../types'
import { STORAGE_KEYS } from '../utils/constants'
import { normalizeApiConfigState } from '../utils/storage'
import { resolveStoredImageUrls, stripBase64FromMessages } from '../utils/imagePersistence'
import { getImageRepository } from './imageRepository'
import { isTauriRuntime } from './runtime'

export const HISTORY_LIST_KEY = 'chat-image-history-list'
export const HISTORY_MESSAGES_PREFIX = 'chat-image-history-messages-'

const STORE_FILE = 'chat-image-store.json'
const MIGRATION_VERSION_KEY = 'desktop-migration-version'
const DESKTOP_MIGRATION_VERSION = 1

type Store = Awaited<ReturnType<typeof import('@tauri-apps/plugin-store').Store.load>>

let storePromise: Promise<Store> | null = null

async function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = import('@tauri-apps/plugin-store').then(({ Store }) =>
      Store.load(STORE_FILE, { defaults: {}, autoSave: 100 }),
    )
  }
  return storePromise
}

export async function getMetadataValue<T>(key: string, defaultValue: T): Promise<T> {
  if (!isTauriRuntime()) {
    try {
      const value = localStorage.getItem(key)
      return value ? JSON.parse(value) as T : defaultValue
    } catch {
      return defaultValue
    }
  }

  const store = await getStore()
  const value = await store.get<T>(key)
  return value ?? defaultValue
}

export async function setMetadataValue<T>(key: string, value: T): Promise<void> {
  if (!isTauriRuntime()) {
    localStorage.setItem(key, JSON.stringify(value))
    return
  }

  const store = await getStore()
  await store.set(key, value)
  await store.save()
}

export async function removeMetadataValue(key: string): Promise<void> {
  if (!isTauriRuntime()) {
    localStorage.removeItem(key)
    return
  }

  const store = await getStore()
  await store.delete(key)
  await store.save()
}

function readLocalStorageValue<T>(key: string, defaultValue: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : defaultValue
  } catch {
    return defaultValue
  }
}

async function localizeMessages(messages: ChatMessage[]): Promise<ChatMessage[]> {
  const repository = getImageRepository()
  const withLocalImages = await Promise.all(messages.map(async msg => {
    if (!msg.images) {
      return {
        ...msg,
        isFavorite: msg.isFavorite ?? false,
      }
    }

    const images = await Promise.all(msg.images.map(image => {
      if (image.localPath) return repository.resolveDisplayUrl(image)
      return repository.saveGeneratedImage({
        id: image.id,
        b64Json: image.base64,
        url: image.originalUrl || image.url,
        timestamp: image.timestamp,
        sourcePrompt: image.sourcePrompt,
        sourceMessageId: image.sourceMessageId,
      })
    }))

    return {
      ...msg,
      isFavorite: msg.isFavorite ?? false,
      images,
    }
  }))

  return stripBase64FromMessages(withLocalImages)
}

export async function initializeDesktopPersistence(): Promise<void> {
  if (!isTauriRuntime()) return

  const store = await getStore()
  const version = await store.get<number>(MIGRATION_VERSION_KEY)
  if (version === DESKTOP_MIGRATION_VERSION) return

  const chatHistory = readLocalStorageValue<ChatMessage[]>(STORAGE_KEYS.CHAT_HISTORY, [])
  if (chatHistory.length > 0) {
    await store.set(STORAGE_KEYS.CHAT_HISTORY, await localizeMessages(chatHistory))
  }

  const historyList = readLocalStorageValue<ChatHistory[]>(HISTORY_LIST_KEY, [])
  if (historyList.length > 0) {
    await store.set(HISTORY_LIST_KEY, historyList)

    await Promise.all(historyList.map(async item => {
      const key = HISTORY_MESSAGES_PREFIX + item.id
      const messages = readLocalStorageValue<ChatMessage[]>(key, [])
      if (messages.length > 0) {
        await store.set(key, await localizeMessages(messages))
      }
    }))
  }

  const apiConfigState = normalizeApiConfigState(
    readLocalStorageValue<unknown>(STORAGE_KEYS.API_CONFIG, null),
  )
  if (apiConfigState.configs.length > 0) {
    await store.set(STORAGE_KEYS.API_CONFIG, apiConfigState)
  }

  const theme = readLocalStorageValue<Theme | null>(STORAGE_KEYS.THEME, null)
  if (theme) {
    await store.set(STORAGE_KEYS.THEME, theme)
  }

  const generationOptions = readLocalStorageValue<GenerationOptions | null>(
    STORAGE_KEYS.GENERATION_OPTIONS,
    null,
  )
  if (generationOptions) {
    await store.set(STORAGE_KEYS.GENERATION_OPTIONS, generationOptions)
  }

  await store.set(MIGRATION_VERSION_KEY, DESKTOP_MIGRATION_VERSION)
  await store.save()
}

export async function getDesktopChatHistory(): Promise<ChatMessage[]> {
  const messages = await getMetadataValue<ChatMessage[]>(STORAGE_KEYS.CHAT_HISTORY, [])
  return resolveStoredImageUrls(messages.map(msg => ({
    ...msg,
    isFavorite: msg.isFavorite ?? false,
  })))
}
