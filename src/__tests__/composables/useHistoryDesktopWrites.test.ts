import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ChatHistory, ChatMessage, GeneratedImage } from '../../types'
import { STORAGE_KEYS } from '../../utils/constants'

const HISTORY_LIST_KEY = 'chat-image-history-list'
const HISTORY_MESSAGES_PREFIX = 'chat-image-history-messages-'
const metadata = new Map<string, unknown>()
const initializeDesktopPersistence = vi.fn<() => Promise<void>>()
const getDesktopChatHistory = vi.fn<() => Promise<ChatMessage[]>>()
const getMetadataValue = vi.fn(
  async <T>(key: string, defaultValue: T): Promise<T> =>
    metadata.has(key) ? (metadata.get(key) as T) : defaultValue,
)
const setMetadataValue = vi.fn(async (key: string, value: unknown): Promise<void> => {
  metadata.set(key, value)
})
const removeMetadataValue = vi.fn(async (key: string): Promise<void> => {
  metadata.delete(key)
})
const deleteUnreferencedLocalImages = vi.fn<(...args: [GeneratedImage[]]) => Promise<void>>()

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('../../platform/metadataStore', () => ({
  HISTORY_LIST_KEY,
  HISTORY_MESSAGES_PREFIX,
  initializeDesktopPersistence,
  getDesktopChatHistory,
  getMetadataValue,
  setMetadataValue,
  removeMetadataValue,
}))

vi.mock('../../platform/imageReferenceCleanup', () => ({
  deleteUnreferencedLocalImages,
}))

function message(id: string, type: ChatMessage['type'] = 'assistant'): ChatMessage {
  return {
    id,
    type,
    content: id,
    timestamp: 1,
    status: 'success',
  }
}

function messageWithImage(id: string): ChatMessage {
  return {
    ...message(id),
    images: [
      {
        id: `${id}-image`,
        url: `images/${id}.png`,
        localPath: `images/${id}.png`,
        timestamp: 1,
      },
    ],
  }
}

function history(id: string, messageCount = 1): ChatHistory {
  return {
    id,
    title: id,
    timestamp: 10,
    messageCount,
    isFavorite: false,
  }
}

async function setupHistory() {
  const { useChatStore } = await import('../../stores/chat')
  const { useHistory } = await import('../../composables/useHistory')
  const chatStore = useChatStore()
  await chatStore.hydrateFromPersistence()
  const historyApi = useHistory()
  await historyApi.hydrateHistoryList()
  return { chatStore, historyApi }
}

describe('useHistory desktop writes', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    metadata.clear()
    initializeDesktopPersistence.mockReset()
    initializeDesktopPersistence.mockResolvedValue(undefined)
    getDesktopChatHistory.mockReset()
    getDesktopChatHistory.mockImplementation(
      async () => (metadata.get(STORAGE_KEYS.CHAT_HISTORY) as ChatMessage[]) || [],
    )
    getMetadataValue.mockClear()
    getMetadataValue.mockImplementation(
      async <T>(key: string, defaultValue: T): Promise<T> =>
        metadata.has(key) ? (metadata.get(key) as T) : defaultValue,
    )
    setMetadataValue.mockReset()
    setMetadataValue.mockImplementation(async (key: string, value: unknown): Promise<void> => {
      metadata.set(key, value)
    })
    removeMetadataValue.mockReset()
    removeMetadataValue.mockImplementation(async (key: string): Promise<void> => {
      metadata.delete(key)
    })
    deleteUnreferencedLocalImages.mockReset()
    deleteUnreferencedLocalImages.mockResolvedValue(undefined)
  })

  it('removes a newly written message record when saving the history list fails', async () => {
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('user-1', 'user'), message('assistant-1')])
    metadata.set(HISTORY_LIST_KEY, [])
    const { historyApi } = await setupHistory()
    let failed = false
    setMetadataValue.mockImplementation(async (key: string, value: unknown): Promise<void> => {
      metadata.set(key, value)
      if (key === HISTORY_LIST_KEY && Array.isArray(value) && value.length > 0 && !failed) {
        failed = true
        throw new Error('list save failed')
      }
    })

    await expect(historyApi.saveCurrentChat()).rejects.toThrow('Failed to save history list')

    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([])
    expect(
      Array.from(metadata.keys()).filter((key) => key.startsWith(HISTORY_MESSAGES_PREFIX)),
    ).toEqual([])
    expect(historyApi.historyList.value).toEqual([])
  })

  it('restores an existing history snapshot when its list update fails', async () => {
    const savedHistory = history('history-1', 2)
    const savedMessages = [message('user-1', 'user'), message('assistant-1')]
    const currentMessages = [...savedMessages, message('user-2', 'user'), message('assistant-2')]
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, currentMessages)
    metadata.set(HISTORY_LIST_KEY, [savedHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + savedHistory.id, savedMessages)
    const { historyApi } = await setupHistory()
    let failed = false
    setMetadataValue.mockImplementation(async (key: string, value: unknown): Promise<void> => {
      metadata.set(key, value)
      if (
        key === HISTORY_LIST_KEY &&
        Array.isArray(value) &&
        value[0]?.messageCount === 4 &&
        !failed
      ) {
        failed = true
        throw new Error('list save failed')
      }
    })

    await expect(historyApi.saveCurrentChat(savedHistory.id)).rejects.toThrow(
      'Failed to save history list',
    )

    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([savedHistory])
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + savedHistory.id)).toEqual(savedMessages)
    expect(historyApi.historyList.value).toEqual([savedHistory])
  })

  it('restores a deleted history when removing its message record fails', async () => {
    const savedHistory = history('history-1')
    const savedMessages = [message('assistant-1')]
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [])
    metadata.set(HISTORY_LIST_KEY, [savedHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + savedHistory.id, savedMessages)
    const { historyApi } = await setupHistory()
    let failed = false
    removeMetadataValue.mockImplementation(async (key: string): Promise<void> => {
      metadata.delete(key)
      if (key === HISTORY_MESSAGES_PREFIX + savedHistory.id && !failed) {
        failed = true
        throw new Error('message delete failed')
      }
    })

    await expect(historyApi.deleteHistoryItem(savedHistory.id)).rejects.toThrow(
      'message delete failed',
    )

    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([savedHistory])
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + savedHistory.id)).toEqual(savedMessages)
    expect(historyApi.historyList.value).toEqual([savedHistory])
  })

  it('restores every history record when a clear operation partially fails', async () => {
    const firstHistory = history('history-1')
    const secondHistory = history('history-2')
    const firstMessages = [message('assistant-1')]
    const secondMessages = [message('assistant-2')]
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [])
    metadata.set(HISTORY_LIST_KEY, [firstHistory, secondHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + firstHistory.id, firstMessages)
    metadata.set(HISTORY_MESSAGES_PREFIX + secondHistory.id, secondMessages)
    const { historyApi } = await setupHistory()
    let failed = false
    removeMetadataValue.mockImplementation(async (key: string): Promise<void> => {
      metadata.delete(key)
      if (key === HISTORY_MESSAGES_PREFIX + secondHistory.id && !failed) {
        failed = true
        throw new Error('message delete failed')
      }
    })

    await expect(historyApi.clearHistory()).rejects.toThrow('message delete failed')

    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([firstHistory, secondHistory])
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + firstHistory.id)).toEqual(firstMessages)
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + secondHistory.id)).toEqual(secondMessages)
    expect(historyApi.historyList.value).toEqual([firstHistory, secondHistory])
  })

  it('restores duplicate records when the final deduplicated list write fails', async () => {
    const firstHistory = history('history-1')
    const secondHistory = history('history-2')
    const firstMessages = [message('shared-user', 'user'), message('shared-assistant')]
    const secondMessages = [message('shared-user', 'user'), message('shared-assistant')]
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [])
    metadata.set(HISTORY_LIST_KEY, [firstHistory, secondHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + firstHistory.id, firstMessages)
    metadata.set(HISTORY_MESSAGES_PREFIX + secondHistory.id, secondMessages)
    const { useChatStore } = await import('../../stores/chat')
    const { useHistory } = await import('../../composables/useHistory')
    const chatStore = useChatStore()
    await chatStore.hydrateFromPersistence()
    setMetadataValue.mockImplementation(async (key: string, value: unknown): Promise<void> => {
      metadata.set(key, value)
      if (key === HISTORY_LIST_KEY && Array.isArray(value) && value.length === 1) {
        throw new Error('deduplicated list save failed')
      }
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const historyApi = useHistory()
    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith('Failed to load history list:', expect.any(Error)),
    )

    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([firstHistory, secondHistory])
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + firstHistory.id)).toEqual(firstMessages)
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + secondHistory.id)).toEqual(secondMessages)
    expect(historyApi.historyList.value).toEqual([firstHistory, secondHistory])
    consoleError.mockRestore()
  })

  it('keeps a completed save successful when deduplication rolls back cleanly', async () => {
    const firstHistory = history('history-1', 2)
    const secondHistory = history('history-2', 2)
    const sharedMessages = [message('shared-user', 'user'), message('shared-assistant')]
    const distinctMessages = [message('other-user', 'user'), message('other-assistant')]
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, sharedMessages)
    metadata.set(HISTORY_LIST_KEY, [firstHistory, secondHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + firstHistory.id, sharedMessages)
    metadata.set(HISTORY_MESSAGES_PREFIX + secondHistory.id, distinctMessages)
    const { historyApi } = await setupHistory()
    metadata.set(HISTORY_MESSAGES_PREFIX + secondHistory.id, sharedMessages)
    setMetadataValue.mockImplementation(async (key: string, value: unknown): Promise<void> => {
      metadata.set(key, value)
      if (key === HISTORY_LIST_KEY && Array.isArray(value) && value.length === 1) {
        throw new Error('deduplicated list save failed')
      }
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(historyApi.saveCurrentChat(firstHistory.id)).resolves.toBe(firstHistory.id)

    expect(metadata.get(HISTORY_LIST_KEY)).toHaveLength(2)
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + firstHistory.id)).toEqual(sharedMessages)
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + secondHistory.id)).toEqual(sharedMessages)
    expect(warn).toHaveBeenCalledWith('Failed to deduplicate saved histories:', expect.any(Error))
    warn.mockRestore()
  })

  it('cleans unique images from a history removed by deduplication', async () => {
    const keptHistory = { ...history('history-1'), timestamp: 20 }
    const removedHistory = { ...history('history-2'), timestamp: 10 }
    const keptMessage = messageWithImage('shared-message')
    const removedMessage = {
      ...messageWithImage('shared-message'),
      images: [
        {
          id: 'removed-image',
          url: 'images/removed-image.png',
          localPath: 'images/removed-image.png',
          timestamp: 1,
        },
      ],
    }
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [])
    metadata.set(HISTORY_LIST_KEY, [keptHistory, removedHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + keptHistory.id, [keptMessage])
    metadata.set(HISTORY_MESSAGES_PREFIX + removedHistory.id, [removedMessage])
    const { useChatStore } = await import('../../stores/chat')
    const { useHistory } = await import('../../composables/useHistory')
    const chatStore = useChatStore()
    await chatStore.hydrateFromPersistence()
    deleteUnreferencedLocalImages.mockClear()

    useHistory()
    await chatStore.flushHistorySave()

    expect(deleteUnreferencedLocalImages).toHaveBeenCalledWith(removedMessage.images)
  })

  it('keeps a committed deletion successful when image cleanup cannot scan references', async () => {
    const savedHistory = history('history-1')
    const savedMessage = messageWithImage('assistant-1')
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [])
    metadata.set(HISTORY_LIST_KEY, [savedHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + savedHistory.id, [savedMessage])
    const { historyApi } = await setupHistory()
    const cleanupError = new Error('reference scan failed')
    deleteUnreferencedLocalImages.mockRejectedValueOnce(cleanupError)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(historyApi.deleteHistoryItem(savedHistory.id)).resolves.toBeUndefined()

    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([])
    expect(metadata.has(HISTORY_MESSAGES_PREFIX + savedHistory.id)).toBe(false)
    expect(warn).toHaveBeenCalledWith('Failed to clean up removed history images:', cleanupError)
    warn.mockRestore()
  })

  it('cleans images removed when an existing history snapshot is overwritten', async () => {
    const savedHistory = history('history-1')
    const savedMessage = messageWithImage('assistant-1')
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('assistant-1')])
    metadata.set(HISTORY_LIST_KEY, [savedHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + savedHistory.id, [savedMessage])
    const { historyApi } = await setupHistory()
    deleteUnreferencedLocalImages.mockClear()

    await historyApi.saveCurrentChat(savedHistory.id)

    expect(deleteUnreferencedLocalImages).toHaveBeenCalledWith(savedMessage.images)
  })
})
