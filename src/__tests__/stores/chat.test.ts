import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { STORAGE_KEYS } from '../../utils/constants'

const setMetadataValue = vi.fn<(...args: [string, unknown]) => Promise<void>>()
const deleteUnreferencedLocalImages = vi.fn<(...args: [unknown[]]) => Promise<void>>()
const resolveDisplayUrl = vi.fn(async (image: unknown) => image)

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('../../platform/metadataStore', () => ({
  getDesktopChatHistory: vi.fn(async () => []),
  setMetadataValue,
}))

vi.mock('../../platform/imageReferenceCleanup', () => ({
  deleteUnreferencedLocalImages,
}))

vi.mock('../../platform/imageRepository', () => ({
  getImageRepository: () => ({
    resolveDisplayUrl,
  }),
}))

describe('chat store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setMetadataValue.mockReset()
    setMetadataValue.mockResolvedValue(undefined)
    deleteUnreferencedLocalImages.mockReset()
    deleteUnreferencedLocalImages.mockResolvedValue(undefined)
    resolveDisplayUrl.mockClear()
    localStorage.clear()
  })

  it('queues immutable snapshots when saving desktop chat history', async () => {
    let releaseFirstSave: () => void = () => {
      throw new Error('First save was not started')
    }
    setMetadataValue.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFirstSave = resolve
      })
    })
    setMetadataValue.mockResolvedValue(undefined)

    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()

    store.addMessage({
      type: 'user',
      content: 'first prompt',
      status: 'success',
    })
    store.addMessage({
      type: 'assistant',
      content: 'pending image',
      status: 'pending',
    })

    await Promise.resolve()

    expect(setMetadataValue).toHaveBeenCalledTimes(1)
    expect(setMetadataValue.mock.calls[0][0]).toBe(STORAGE_KEYS.CHAT_HISTORY)
    expect(setMetadataValue.mock.calls[0][1]).toMatchObject([{ content: 'first prompt' }])

    releaseFirstSave()
    await store.flushHistorySave()

    expect(setMetadataValue).toHaveBeenCalledTimes(2)
    expect(setMetadataValue.mock.calls[1][1]).toMatchObject([
      { content: 'first prompt' },
      { content: 'pending image' },
    ])
  })

  it('rolls back a message update when desktop persistence fails', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const message = store.addMessage({
      type: 'assistant',
      content: 'previous failure',
      status: 'error',
      error: 'previous failure',
    })
    await store.flushHistorySave()
    setMetadataValue.mockRejectedValueOnce(new Error('disk full'))

    await expect(
      store.updateMessage(message.id, {
        content: 'generating',
        status: 'pending',
        error: undefined,
      }),
    ).rejects.toThrow('Failed to save chat history')

    expect(store.messages[0]).toMatchObject({
      content: 'previous failure',
      status: 'error',
      error: 'previous failure',
    })
  })

  it('passes removed current chat images to local image cleanup when clearing messages', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()

    store.addMessage({
      type: 'assistant',
      content: 'generated',
      status: 'success',
      images: [
        {
          id: 'image-1',
          url: '',
          localPath: 'images/image-1.png',
          timestamp: 1,
        },
      ],
    })
    await store.flushHistorySave()

    await store.clearMessages()

    expect(deleteUnreferencedLocalImages).toHaveBeenCalledWith([
      expect.objectContaining({ localPath: 'images/image-1.png' }),
    ])
  })

  it('passes replaced current chat images to local image cleanup during replace import', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()

    store.addMessage({
      type: 'assistant',
      content: 'old generated',
      status: 'success',
      images: [
        {
          id: 'old-image',
          url: '',
          localPath: 'images/old-image.png',
          timestamp: 1,
        },
      ],
    })
    await store.flushHistorySave()
    deleteUnreferencedLocalImages.mockClear()

    await store.importMessages(
      [
        {
          id: 'new-message',
          type: 'assistant',
          content: 'new generated',
          timestamp: 2,
          status: 'success',
          images: [
            {
              id: 'new-image',
              url: '',
              localPath: 'images/new-image.png',
              timestamp: 2,
            },
          ],
        },
      ],
      'replace',
    )

    expect(deleteUnreferencedLocalImages).toHaveBeenCalledWith([
      expect.objectContaining({ localPath: 'images/old-image.png' }),
    ])
  })
})
