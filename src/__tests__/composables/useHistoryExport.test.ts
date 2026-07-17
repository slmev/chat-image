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
const selectDesktopHistoryExportPath = vi.fn()
const buildDesktopHistoryExportZip = vi.fn()
const writeDesktopHistoryExportZip = vi.fn()
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
  selectDesktopHistoryExportPath,
  buildDesktopHistoryExportZip,
  writeDesktopHistoryExportZip,
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
    selectDesktopHistoryExportPath.mockReset()
    selectDesktopHistoryExportPath.mockResolvedValue('/tmp/history.zip')
    buildDesktopHistoryExportZip.mockReset()
    buildDesktopHistoryExportZip.mockResolvedValue({
      bytes: new Uint8Array([1]),
      imageCount: 1,
      missingImageCount: 0,
    })
    writeDesktopHistoryExportZip.mockReset()
    writeDesktopHistoryExportZip.mockResolvedValue({ canceled: false })
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
    expect(selectDesktopHistoryExportPath).toHaveBeenCalledOnce()
    expect(buildDesktopHistoryExportZip).toHaveBeenCalledWith(
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
    expect(writeDesktopHistoryExportZip).toHaveBeenCalledWith(
      '/tmp/history.zip',
      expect.objectContaining({ imageCount: 1, missingImageCount: 0 }),
    )
  })

  it('does not hydrate or build an archive when path selection is canceled', async () => {
    selectDesktopHistoryExportPath.mockResolvedValueOnce(null)
    const { useHistory } = await import('../../composables/useHistory')

    await expect(useHistory().exportHistory()).resolves.toEqual({ canceled: true })

    expect(selectDesktopHistoryExportPath).toHaveBeenCalledOnce()
    expect(initializeDesktopPersistence).not.toHaveBeenCalled()
    expect(buildDesktopHistoryExportZip).not.toHaveBeenCalled()
    expect(writeDesktopHistoryExportZip).not.toHaveBeenCalled()
  })

  it('holds an internally consistent snapshot while building the archive', async () => {
    let markBuildStarted: () => void = () => undefined
    const buildStarted = new Promise<void>((resolve) => {
      markBuildStarted = resolve
    })
    let finishBuild: () => void = () => undefined
    const buildGate = new Promise<void>((resolve) => {
      finishBuild = resolve
    })
    buildDesktopHistoryExportZip.mockImplementationOnce(async (input) => {
      markBuildStarted()
      await buildGate
      return {
        bytes: new Uint8Array([1]),
        imageCount: input.currentMessages.length,
        missingImageCount: 0,
      }
    })

    const { useChatStore } = await import('../../stores/chat')
    const { useHistory } = await import('../../composables/useHistory')
    const chatStore = useChatStore()
    const exportPromise = useHistory().exportHistory()
    await buildStarted

    let messageAdded = false
    const addPromise = chatStore
      .addMessage({ type: 'user', content: 'after snapshot', status: 'success' })
      .then(() => {
        messageAdded = true
      })
    await Promise.resolve()
    expect(messageAdded).toBe(false)

    finishBuild()
    await expect(exportPromise).resolves.toEqual({ canceled: false })
    await addPromise

    const exportedInput = buildDesktopHistoryExportZip.mock.calls[0][0]
    expect(exportedInput.currentMessages.map((message: ChatMessage) => message.id)).toEqual([
      'current-message',
    ])
    expect(chatStore.messages.map((message) => message.content)).toEqual([
      'hydrated current chat',
      'after snapshot',
    ])
  })
})
