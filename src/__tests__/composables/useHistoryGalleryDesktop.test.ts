import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ChatHistory, ChatMessage, GeneratedImage } from '../../types'
import { STORAGE_KEYS } from '../../utils/constants'

const HISTORY_LIST_KEY = 'chat-image-history-list'
const HISTORY_MESSAGES_PREFIX = 'chat-image-history-messages-'

const metadataState = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  failNextHistoryListWrite: false,
}))
const deleteUnreferencedLocalImages = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('../../platform/metadataStore', () => {
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

  return {
    HISTORY_LIST_KEY: 'chat-image-history-list',
    HISTORY_MESSAGES_PREFIX: 'chat-image-history-messages-',
    getDesktopChatHistory: vi.fn(async () =>
      clone(metadataState.values.get('chat-image-chat-history') || []),
    ),
    getMetadataValue: vi.fn(async (key: string, fallback: unknown) =>
      clone(metadataState.values.has(key) ? metadataState.values.get(key) : fallback),
    ),
    initializeDesktopPersistence: vi.fn(async () => undefined),
    removeMetadataValue: vi.fn(async (key: string) => {
      metadataState.values.delete(key)
    }),
    setMetadataValue: vi.fn(async (key: string, value: unknown) => {
      if (key === 'chat-image-history-list' && metadataState.failNextHistoryListWrite) {
        metadataState.failNextHistoryListWrite = false
        throw new Error('history list write failed')
      }
      metadataState.values.set(key, clone(value))
    }),
  }
})

vi.mock('../../platform/imageReferenceCleanup', () => ({ deleteUnreferencedLocalImages }))

vi.mock('../../platform/imageRepository', () => ({
  getImageRepository: () => ({
    resolveDisplayUrl: vi.fn(async (image: GeneratedImage) => image),
  }),
}))

function image(id: string, localPath = `images/${id}.png`): GeneratedImage {
  return {
    id,
    url: '',
    localPath,
    timestamp: 1,
  }
}

function message(id: string, generatedImage: GeneratedImage): ChatMessage {
  return {
    id,
    type: 'assistant',
    content: id,
    timestamp: 1,
    status: 'success',
    images: [generatedImage],
  }
}

describe('useHistory desktop gallery mutations', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    metadataState.values.clear()
    metadataState.failNextHistoryListWrite = false
    deleteUnreferencedLocalImages.mockClear()
  })

  it('waits for an active import before reading a desktop gallery snapshot', async () => {
    metadataState.values.set(STORAGE_KEYS.CHAT_HISTORY, [])
    metadataState.values.set(HISTORY_LIST_KEY, [])
    const { useChatStore } = await import('../../stores/chat')
    const { useHistory } = await import('../../composables/useHistory')
    const chatStore = useChatStore()
    await chatStore.hydrateFromPersistence()
    const historyApi = useHistory()
    await historyApi.loadGalleryImages()
    const importedHistory: ChatHistory = {
      id: 'imported-history',
      title: 'Imported session',
      timestamp: 2,
      messageCount: 1,
      isFavorite: false,
    }
    let markImportStarted: () => void = () => undefined
    const importStarted = new Promise<void>((resolve) => {
      markImportStarted = resolve
    })
    let finishImport: () => void = () => undefined
    const importGate = new Promise<void>((resolve) => {
      finishImport = resolve
    })
    const importPromise = chatStore.runMessageImport(async () => {
      markImportStarted()
      await importGate
      metadataState.values.set(HISTORY_LIST_KEY, [importedHistory])
      metadataState.values.set(HISTORY_MESSAGES_PREFIX + importedHistory.id, [
        message('imported-message', image('imported-image')),
      ])
    })
    await importStarted

    let readFinished = false
    const readPromise = historyApi.loadGalleryImages().then((items) => {
      readFinished = true
      return items
    })
    await Promise.resolve()
    expect(readFinished).toBe(false)

    finishImport()
    await importPromise
    await expect(readPromise).resolves.toMatchObject([
      { sourceHistoryId: importedHistory.id, image: { id: 'imported-image' } },
    ])
  })

  it('restores messages and messageCount when the desktop list write fails', async () => {
    const savedHistory: ChatHistory = {
      id: 'history-1',
      title: 'Saved session',
      timestamp: 1,
      messageCount: 2,
      isFavorite: false,
    }
    const savedMessages = [message('remove', image('remove')), message('keep', image('keep'))]
    metadataState.values.set(STORAGE_KEYS.CHAT_HISTORY, [])
    metadataState.values.set(HISTORY_LIST_KEY, [savedHistory])
    metadataState.values.set(HISTORY_MESSAGES_PREFIX + savedHistory.id, savedMessages)

    const { useChatStore } = await import('../../stores/chat')
    const { useHistory } = await import('../../composables/useHistory')
    await useChatStore().hydrateFromPersistence()
    const historyApi = useHistory()
    const items = await historyApi.loadGalleryImages()
    metadataState.failNextHistoryListWrite = true

    await expect(
      historyApi.deleteGalleryItems(items.filter((item) => item.image.id === 'remove')),
    ).rejects.toThrow('Failed to save history list')

    expect(metadataState.values.get(HISTORY_LIST_KEY)).toEqual([savedHistory])
    expect(metadataState.values.get(HISTORY_MESSAGES_PREFIX + savedHistory.id)).toMatchObject([
      { id: 'remove', images: [{ id: 'remove' }] },
      { id: 'keep', images: [{ id: 'keep' }] },
    ])
    expect(historyApi.historyList.value).toEqual([savedHistory])
    expect(deleteUnreferencedLocalImages).not.toHaveBeenCalled()
  })

  it('keeps the same image id distinct by local path and deletes only one entity', async () => {
    const savedHistory: ChatHistory = {
      id: 'history-1',
      title: 'Saved session',
      timestamp: 1,
      messageCount: 1,
      isFavorite: false,
    }
    metadataState.values.set(STORAGE_KEYS.CHAT_HISTORY, [
      message('current', image('shared-id', 'images/entity-a.png')),
    ])
    metadataState.values.set(HISTORY_LIST_KEY, [savedHistory])
    metadataState.values.set(HISTORY_MESSAGES_PREFIX + savedHistory.id, [
      message('saved', image('shared-id', 'images/entity-b.png')),
    ])

    const { useChatStore } = await import('../../stores/chat')
    const { useHistory } = await import('../../composables/useHistory')
    await useChatStore().hydrateFromPersistence()
    const historyApi = useHistory()
    const items = await historyApi.loadGalleryImages()

    expect(items).toHaveLength(2)
    expect(items.map((item) => item.image.localPath).sort()).toEqual([
      'images/entity-a.png',
      'images/entity-b.png',
    ])

    await historyApi.deleteGalleryItems(
      items.filter((item) => item.image.localPath === 'images/entity-a.png'),
    )

    const remaining = await historyApi.loadGalleryImages()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].image).toMatchObject({
      id: 'shared-id',
      localPath: 'images/entity-b.png',
    })
  })
})
