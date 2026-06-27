import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ChatMessage } from '../../types'

const HISTORY_LIST_KEY = 'chat-image-history-list'

const metadata = new Map<string, unknown>()
const initializeDesktopPersistence = vi.fn<() => Promise<void>>()
const getDesktopChatHistory = vi.fn<() => Promise<ChatMessage[]>>()
const getMetadataValue = vi.fn(
  async <T>(key: string, defaultValue: T): Promise<T> =>
    metadata.has(key) ? (metadata.get(key) as T) : defaultValue,
)
const setMetadataValue = vi.fn<(...args: [string, unknown]) => Promise<void>>()
const removeMetadataValue = vi.fn<(...args: [string]) => Promise<void>>()
const exportDesktopHistoryZip = vi.fn()
const deleteUnreferencedLocalImages = vi.fn<(...args: [unknown[]]) => Promise<void>>()

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('../../platform/metadataStore', () => ({
  HISTORY_LIST_KEY,
  HISTORY_MESSAGES_PREFIX: 'chat-image-history-messages-',
  initializeDesktopPersistence,
  getDesktopChatHistory,
  getMetadataValue,
  setMetadataValue,
  removeMetadataValue,
}))

vi.mock('../../platform/desktopHistoryExport', () => ({
  exportDesktopHistoryZip,
}))

vi.mock('../../platform/imageReferenceCleanup', () => ({
  deleteUnreferencedLocalImages,
}))

function currentMessage(): ChatMessage {
  return {
    id: 'current-message',
    type: 'assistant',
    content: 'hydrated current chat',
    timestamp: 1,
    status: 'success',
    images: [
      {
        id: 'image-1',
        url: 'blob:image-1',
        localPath: 'images/image-1.png',
        timestamp: 1,
      },
    ],
  }
}

describe('useHistory desktop export', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    metadata.clear()
    metadata.set(HISTORY_LIST_KEY, [])
    initializeDesktopPersistence.mockReset()
    initializeDesktopPersistence.mockResolvedValue(undefined)
    getDesktopChatHistory.mockReset()
    getDesktopChatHistory.mockResolvedValue([currentMessage()])
    getMetadataValue.mockClear()
    setMetadataValue.mockReset()
    setMetadataValue.mockResolvedValue(undefined)
    removeMetadataValue.mockReset()
    removeMetadataValue.mockResolvedValue(undefined)
    exportDesktopHistoryZip.mockReset()
    exportDesktopHistoryZip.mockResolvedValue({ canceled: false })
    deleteUnreferencedLocalImages.mockReset()
    deleteUnreferencedLocalImages.mockResolvedValue(undefined)
    localStorage.clear()
  })

  it('hydrates desktop current messages before exporting', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const { useHistory } = await import('../../composables/useHistory')

    const chatStore = useChatStore()
    expect(chatStore.hasHydratedDesktopHistory).toBe(false)

    const { exportHistory } = useHistory()
    await exportHistory()

    expect(initializeDesktopPersistence).toHaveBeenCalledOnce()
    expect(getDesktopChatHistory).toHaveBeenCalledOnce()
    expect(chatStore.hasHydratedDesktopHistory).toBe(true)
    expect(exportDesktopHistoryZip).toHaveBeenCalledWith(
      expect.objectContaining({
        currentMessages: [
          expect.objectContaining({
            id: 'current-message',
            images: [expect.objectContaining({ localPath: 'images/image-1.png' })],
          }),
        ],
        historyList: [],
        historyMessages: {},
      }),
    )
  })
})
