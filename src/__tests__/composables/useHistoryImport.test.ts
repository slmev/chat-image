import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ChatHistory, ChatMessage, GeneratedImage } from '../../types'
import { STORAGE_KEYS } from '../../utils/constants'

const HISTORY_LIST_KEY = 'chat-image-history-list'
const HISTORY_MESSAGES_PREFIX = 'chat-image-history-messages-'

const metadata = new Map<string, unknown>()
const initializeDesktopPersistence = vi.fn<() => Promise<void>>()
const getDesktopChatHistory = vi.fn<() => Promise<ChatMessage[]>>()
const getMetadataValue = vi.fn(async <T>(key: string, defaultValue: T): Promise<T> => (
  metadata.has(key) ? metadata.get(key) as T : defaultValue
))
const setMetadataValue = vi.fn(async (key: string, value: unknown): Promise<void> => {
  metadata.set(key, value)
})
const removeMetadataValue = vi.fn(async (key: string): Promise<void> => {
  metadata.delete(key)
})
const importDesktopHistoryZip = vi.fn()
const cleanupDesktopImportedImages = vi.fn<(...args: [string[]]) => Promise<void>>()
const deleteUnreferencedLocalImages = vi.fn<(...args: [unknown[]]) => Promise<void>>()
const resolveDisplayUrl = vi.fn(async (image: GeneratedImage) => image)

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

vi.mock('../../platform/desktopHistoryImport', () => ({
  importDesktopHistoryZip,
  cleanupDesktopImportedImages,
}))

vi.mock('../../platform/imageReferenceCleanup', () => ({
  deleteUnreferencedLocalImages,
}))

vi.mock('../../platform/imageRepository', () => ({
  getImageRepository: () => ({
    resolveDisplayUrl,
  }),
}))

function message(id: string, content = id): ChatMessage {
  return {
    id,
    type: 'assistant',
    content,
    timestamp: 1,
    status: 'success',
  }
}

function messageWithImage(id: string, localPath: string): ChatMessage {
  return {
    ...message(id),
    images: [{
      id: `${id}-image`,
      url: localPath,
      localPath,
      timestamp: 1,
    }],
  }
}

function history(id: string): ChatHistory {
  return {
    id,
    title: id,
    timestamp: 1,
    messageCount: 1,
    isFavorite: false,
  }
}

function importedData(options: {
  currentMessages?: ChatMessage[]
  historyList?: ChatHistory[]
  historyMessages?: Record<string, ChatMessage[]>
  writtenImagePaths?: string[]
} = {}) {
  const importedHistory = options.historyList ?? [history('new-history')]
  return {
    currentMessages: options.currentMessages ?? [message('new-current')],
    historyList: importedHistory,
    historyMessages: options.historyMessages ?? Object.fromEntries(
      importedHistory.map(item => [item.id, [message(`${item.id}-message`)]]),
    ),
    writtenImagePaths: options.writtenImagePaths ?? ['images/imported.png'],
  }
}

function importFile(): File {
  return new File(['zip'], 'history.zip', { type: 'application/zip' })
}

describe('useHistory desktop ZIP import', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    metadata.clear()
    initializeDesktopPersistence.mockReset()
    initializeDesktopPersistence.mockResolvedValue(undefined)
    getDesktopChatHistory.mockReset()
    getDesktopChatHistory.mockImplementation(async () => (
      metadata.get(STORAGE_KEYS.CHAT_HISTORY) as ChatMessage[] || []
    ))
    getMetadataValue.mockClear()
    setMetadataValue.mockClear()
    removeMetadataValue.mockClear()
    importDesktopHistoryZip.mockReset()
    importDesktopHistoryZip.mockResolvedValue({
      success: true,
      data: importedData(),
    })
    cleanupDesktopImportedImages.mockReset()
    cleanupDesktopImportedImages.mockResolvedValue(undefined)
    deleteUnreferencedLocalImages.mockReset()
    deleteUnreferencedLocalImages.mockResolvedValue(undefined)
    resolveDisplayUrl.mockClear()
    localStorage.clear()
  })

  it('replaces current chat and saved history from a desktop ZIP', async () => {
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    metadata.set(HISTORY_LIST_KEY, [history('old-history')])
    metadata.set(HISTORY_MESSAGES_PREFIX + 'old-history', [message('old-history-message')])
    const data = importedData()
    importDesktopHistoryZip.mockResolvedValue({ success: true, data })

    const { useHistory } = await import('../../composables/useHistory')
    const { useChatStore } = await import('../../stores/chat')
    const result = await useHistory().importHistory(importFile(), 'replace')

    expect(result).toEqual({ success: true, message: '历史记录已替换' })
    expect(useChatStore().messages).toEqual([expect.objectContaining({ id: 'new-current' })])
    expect(metadata.get(STORAGE_KEYS.CHAT_HISTORY)).toEqual([expect.objectContaining({ id: 'new-current' })])
    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([expect.objectContaining({ id: 'new-history' })])
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + 'new-history')).toEqual([
      expect.objectContaining({ id: 'new-history-message' }),
    ])
    expect(metadata.has(HISTORY_MESSAGES_PREFIX + 'old-history')).toBe(false)
  })

  it('merges current messages and only new saved histories from a desktop ZIP', async () => {
    const existingHistory = history('existing-history')
    const newHistory = history('new-history')
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('shared-current')])
    metadata.set(HISTORY_LIST_KEY, [existingHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + existingHistory.id, [message('existing-history-message')])
    importDesktopHistoryZip.mockResolvedValue({
      success: true,
      data: importedData({
        currentMessages: [message('shared-current'), message('new-current')],
        historyList: [existingHistory, newHistory],
        historyMessages: {
          [existingHistory.id]: [message('imported-existing-message')],
          [newHistory.id]: [message('new-history-message')],
        },
      }),
    })

    const { useHistory } = await import('../../composables/useHistory')
    const { useChatStore } = await import('../../stores/chat')
    const result = await useHistory().importHistory(importFile(), 'merge')

    expect(result).toEqual({ success: true, message: '历史记录已合并' })
    expect(useChatStore().messages.map(item => item.id)).toEqual(['shared-current', 'new-current'])
    expect((metadata.get(HISTORY_LIST_KEY) as ChatHistory[]).map(item => item.id)).toEqual([
      'existing-history',
      'new-history',
    ])
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + existingHistory.id)).toEqual([
      expect.objectContaining({ id: 'existing-history-message' }),
    ])
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + newHistory.id)).toEqual([
      expect.objectContaining({ id: 'new-history-message' }),
    ])
  })

  it('cleans imported images that merge skips because the message or history already exists', async () => {
    const existingHistory = history('existing-history')
    const newHistory = history('new-history')
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('shared-current')])
    metadata.set(HISTORY_LIST_KEY, [existingHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + existingHistory.id, [message('existing-history-message')])
    importDesktopHistoryZip.mockResolvedValue({
      success: true,
      data: importedData({
        currentMessages: [
          messageWithImage('shared-current', 'images/skip-current.png'),
          messageWithImage('new-current', 'images/use-current.png'),
        ],
        historyList: [existingHistory, newHistory],
        historyMessages: {
          [existingHistory.id]: [messageWithImage('imported-existing-message', 'images/skip-history.png')],
          [newHistory.id]: [messageWithImage('new-history-message', 'images/use-history.png')],
        },
        writtenImagePaths: [
          'images/skip-current.png',
          'images/use-current.png',
          'images/skip-history.png',
          'images/use-history.png',
        ],
      }),
    })

    const { useHistory } = await import('../../composables/useHistory')
    const result = await useHistory().importHistory(importFile(), 'merge')

    expect(result).toEqual({ success: true, message: '历史记录已合并' })
    expect(cleanupDesktopImportedImages).toHaveBeenCalledWith([
      'images/skip-current.png',
      'images/skip-history.png',
    ])
  })

  it('does not mutate data when ZIP validation fails', async () => {
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    metadata.set(HISTORY_LIST_KEY, [history('old-history')])
    importDesktopHistoryZip.mockResolvedValue({
      success: false,
      message: 'ZIP 包缺少 history.json',
    })

    const { useHistory } = await import('../../composables/useHistory')
    const result = await useHistory().importHistory(importFile(), 'replace')

    expect(result).toEqual({ success: false, message: 'ZIP 包缺少 history.json' })
    expect(metadata.get(STORAGE_KEYS.CHAT_HISTORY)).toEqual([message('old-current')])
    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([history('old-history')])
    expect(cleanupDesktopImportedImages).not.toHaveBeenCalled()
  })

  it('rolls back metadata and cleans imported images when commit fails', async () => {
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    metadata.set(HISTORY_LIST_KEY, [history('old-history')])
    metadata.set(HISTORY_MESSAGES_PREFIX + 'old-history', [message('old-history-message')])
    const data = importedData({ writtenImagePaths: ['images/imported.png'] })
    importDesktopHistoryZip.mockResolvedValue({ success: true, data })
    setMetadataValue.mockImplementation(async (key: string, value: unknown): Promise<void> => {
      if (
        key === HISTORY_LIST_KEY
        && Array.isArray(value)
        && value.some(item => item.id === 'new-history')
      ) {
        throw new Error('store failed')
      }
      metadata.set(key, value)
    })

    const { useHistory } = await import('../../composables/useHistory')
    const result = await useHistory().importHistory(importFile(), 'replace')

    expect(result).toEqual({ success: false, message: '导入失败，现有数据已保持不变' })
    expect(metadata.get(STORAGE_KEYS.CHAT_HISTORY)).toEqual([expect.objectContaining({ id: 'old-current' })])
    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([expect.objectContaining({ id: 'old-history' })])
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + 'old-history')).toEqual([
      expect.objectContaining({ id: 'old-history-message' }),
    ])
    expect(cleanupDesktopImportedImages).toHaveBeenCalledWith(['images/imported.png'])
  })
})
