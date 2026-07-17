import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { STORAGE_KEYS } from '../../utils/constants'
import type { GeneratedImage } from '../../types'

const setMetadataValue = vi.fn<(...args: [string, unknown]) => Promise<void>>()
const deleteUnreferencedLocalImages = vi.fn<(...args: [unknown[]]) => Promise<void>>()
const resolveDisplayUrl = vi.fn(
  async (image: GeneratedImage, options?: { storageId?: string }): Promise<GeneratedImage> => {
    if (!image.base64 || !options?.storageId) return image
    return {
      ...image,
      url: `blob:${options.storageId}`,
      localPath: `images/${options.storageId}.png`,
      base64: undefined,
    }
  },
)

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

  it('rejects clearing messages before persistence hydration', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()

    await expect(store.clearMessages()).rejects.toThrow('Chat persistence has not been initialized')
    expect(setMetadataValue).not.toHaveBeenCalled()
  })

  it('rejects imports without canceling an active generation', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    store.setLoading(true)

    await expect(
      store.importMessages(
        [
          {
            id: 'replacement',
            type: 'assistant',
            content: 'replacement',
            timestamp: 1,
            status: 'success',
          },
        ],
        'replace',
      ),
    ).rejects.toThrow('generation is in progress')

    expect(store.isLoading).toBe(true)
    expect(store.isImportingMessages).toBe(false)
    expect(store.messages).toEqual([])
    expect(setMetadataValue).not.toHaveBeenCalled()
  })

  it('rejects concurrent writes and restores the locked snapshot when an import fails', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const previous = await store.addMessage({
      type: 'user',
      content: 'keep me',
      status: 'success',
    })
    setMetadataValue.mockClear()
    setMetadataValue.mockRejectedValueOnce(new Error('disk full'))

    let signalImportStarted: () => void = () => undefined
    const importStarted = new Promise<void>((resolve) => {
      signalImportStarted = resolve
    })
    let releaseImport: () => void = () => undefined
    const importGate = new Promise<void>((resolve) => {
      releaseImport = resolve
    })
    const importPromise = store.runMessageImport(async (commit) => {
      signalImportStarted()
      await importGate
      await commit(
        [
          {
            id: 'replacement',
            type: 'assistant',
            content: 'replacement',
            timestamp: 2,
            status: 'success',
          },
        ],
        'replace',
      )
    })

    await importStarted
    expect(store.isImportingMessages).toBe(true)
    await expect(
      store.addMessage({ type: 'user', content: 'too late', status: 'success' }),
    ).rejects.toThrow('import is in progress')
    await expect(store.importMessages([], 'replace')).rejects.toThrow(
      'import is already in progress',
    )

    releaseImport()
    await expect(importPromise).rejects.toThrow('Failed to save chat history')

    expect(store.messages.map((message) => message.id)).toEqual([previous.id])
    expect(store.isImportingMessages).toBe(false)
    expect(setMetadataValue.mock.calls.at(-1)?.[1]).toMatchObject([{ id: previous.id }])
  })

  it('waits for an active history write and lets its token finish store mutations', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const message = await store.addMessage({
      type: 'user',
      content: 'favorite me first',
      status: 'success',
    })

    let markHistoryStarted: () => void = () => undefined
    const historyStarted = new Promise<void>((resolve) => {
      markHistoryStarted = resolve
    })
    let finishHistory: () => void = () => undefined
    const historyGate = new Promise<void>((resolve) => {
      finishHistory = resolve
    })
    const historyPromise = store.runHistoryWrite(async (token) => {
      markHistoryStarted()
      await historyGate
      await store.setMessagesFavorite([message.id], true, token)
    })
    await historyStarted

    let importOperationStarted = false
    const importPromise = store.runMessageImport(async () => {
      importOperationStarted = true
    })
    await vi.waitFor(() => expect(store.isImportingMessages).toBe(true))
    expect(importOperationStarted).toBe(false)

    finishHistory()
    await expect(historyPromise).resolves.toBeUndefined()
    await expect(importPromise).resolves.toBeUndefined()
    expect(importOperationStarted).toBe(true)
    expect(store.messages[0].isFavorite).toBe(true)
  })

  it('runs history writes in FIFO order and continues after a failure', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    const order: string[] = []
    let finishFirst: () => void = () => undefined
    const firstGate = new Promise<void>((resolve) => {
      finishFirst = resolve
    })

    const first = store.runHistoryWrite(async () => {
      order.push('first:start')
      await firstGate
      order.push('first:fail')
      throw new Error('first failed')
    })
    const second = store.runHistoryWrite(async () => {
      order.push('second:start')
      order.push('second:finish')
    })

    await Promise.resolve()
    expect(order).toEqual(['first:start'])
    finishFirst()
    await expect(first).rejects.toThrow('first failed')
    await expect(second).resolves.toBeUndefined()
    expect(order).toEqual(['first:start', 'first:fail', 'second:start', 'second:finish'])
  })

  it('keeps an external message update queued behind a history rollback', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const message = await store.addMessage({
      type: 'assistant',
      content: 'before rollback',
      status: 'success',
    })
    const snapshot = JSON.parse(JSON.stringify(store.messages))
    let markRollbackStarted: () => void = () => undefined
    const rollbackStarted = new Promise<void>((resolve) => {
      markRollbackStarted = resolve
    })
    let finishRollback: () => void = () => undefined
    const rollbackGate = new Promise<void>((resolve) => {
      finishRollback = resolve
    })

    const rollback = store.runHistoryWrite(async (token) => {
      markRollbackStarted()
      await rollbackGate
      await store.restoreMessagesSnapshot(snapshot, token)
      throw new Error('gallery mutation failed')
    })
    await rollbackStarted
    const externalUpdate = store.updateMessage(message.id, { content: 'generation completed' })
    await Promise.resolve()
    expect(store.messages[0].content).toBe('before rollback')

    finishRollback()
    await expect(rollback).rejects.toThrow('gallery mutation failed')
    await expect(externalUpdate).resolves.toBeUndefined()
    expect(store.messages[0].content).toBe('generation completed')
  })

  it('rechecks generation state when a queued import is ready to start', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    let markHistoryStarted: () => void = () => undefined
    const historyStarted = new Promise<void>((resolve) => {
      markHistoryStarted = resolve
    })
    let finishHistory: () => void = () => undefined
    const historyGate = new Promise<void>((resolve) => {
      finishHistory = resolve
    })
    const history = store.runHistoryWrite(async () => {
      markHistoryStarted()
      await historyGate
      store.setLoading(true)
    })
    await historyStarted

    const importPromise = store.runMessageImport(async () => undefined)
    expect(store.isImportingMessages).toBe(true)
    finishHistory()
    await history
    await expect(importPromise).rejects.toThrow('generation is in progress')
    expect(store.isImportingMessages).toBe(false)
    store.setLoading(false)
  })

  it('queues a history read behind an active import and returns the imported state', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    let markImportStarted: () => void = () => undefined
    const importStarted = new Promise<void>((resolve) => {
      markImportStarted = resolve
    })
    let finishImport: () => void = () => undefined
    const importGate = new Promise<void>((resolve) => {
      finishImport = resolve
    })
    const importPromise = store.runMessageImport(async (commit) => {
      markImportStarted()
      await importGate
      await commit(
        [
          {
            id: 'imported-message',
            type: 'assistant',
            content: 'imported',
            timestamp: 1,
            status: 'success',
          },
        ],
        'replace',
      )
    })
    await importStarted

    let readStarted = false
    const readPromise = store.runHistoryRead(async () => {
      readStarted = true
      return store.messages.map((message) => message.id)
    })
    await Promise.resolve()
    expect(readStarted).toBe(false)

    finishImport()
    await importPromise
    await expect(readPromise).resolves.toEqual(['imported-message'])
  })

  it('globally rejects imports and duplicate exports during a history export', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    let finishExport: () => void = () => undefined
    const exportGate = new Promise<void>((resolve) => {
      finishExport = resolve
    })
    const exportPromise = store.runHistoryExport(async () => {
      await exportGate
      return 'exported'
    })

    expect(store.isExportingHistory).toBe(true)
    await expect(store.runMessageImport(async () => undefined)).rejects.toThrow(
      'export is in progress',
    )
    await expect(store.runHistoryExport(async () => undefined)).rejects.toThrow(
      'export is already in progress',
    )

    finishExport()
    await expect(exportPromise).resolves.toBe('exported')
    expect(store.isExportingHistory).toBe(false)
    await expect(store.runMessageImport(async () => undefined)).resolves.toBeUndefined()
  })

  it('releases the global export state after an export failure', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()

    await expect(
      store.runHistoryExport(async () => {
        throw new Error('export failed')
      }),
    ).rejects.toThrow('export failed')
    expect(store.isExportingHistory).toBe(false)
  })

  it('waits for an active message write to finish rolling back before starting an import', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const message = await store.addMessage({
      type: 'assistant',
      content: 'favorite me',
      status: 'success',
    })

    let markWriteStarted: () => void = () => undefined
    const writeStarted = new Promise<void>((resolve) => {
      markWriteStarted = resolve
    })
    let finishWrite: () => void = () => undefined
    const writeGate = new Promise<void>((resolve) => {
      finishWrite = resolve
    })
    setMetadataValue.mockImplementationOnce(async () => {
      markWriteStarted()
      await writeGate
      throw new Error('disk full')
    })

    const favoriteFailure = store.setFavorite(message.id, true).catch((error: unknown) => error)
    await writeStarted

    let importOperationStarted = false
    let favoriteSeenByImport: boolean | undefined
    const importPromise = store.runMessageImport(async () => {
      importOperationStarted = true
      favoriteSeenByImport = store.messages[0].isFavorite
    })
    await vi.waitFor(() => expect(store.isImportingMessages).toBe(true))
    expect(importOperationStarted).toBe(false)

    finishWrite()
    expect(await favoriteFailure).toMatchObject({
      message: 'Failed to save chat history',
    })
    await expect(importPromise).resolves.toBeUndefined()
    expect(importOperationStarted).toBe(true)
    expect(favoriteSeenByImport).toBe(false)
  })

  it('queues an in-memory error fallback and preserves it when the next write fails', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const message = await store.addMessage({
      type: 'assistant',
      content: 'before update',
      status: 'success',
    })
    setMetadataValue.mockClear()
    let markWriteStarted: () => void = () => undefined
    const writeStarted = new Promise<void>((resolve) => {
      markWriteStarted = resolve
    })
    let finishWrite: () => void = () => undefined
    const writeGate = new Promise<void>((resolve) => {
      finishWrite = resolve
    })
    setMetadataValue.mockImplementationOnce(async () => {
      markWriteStarted()
      await writeGate
    })
    setMetadataValue.mockRejectedValueOnce(new Error('disk full'))

    const firstWrite = store.updateMessage(message.id, { content: 'first update' })
    await writeStarted
    const fallback = store.setMessageErrorInMemory(message.id, 'persistence failed')
    const failedWrite = store.updateMessage(message.id, { content: 'should roll back' })
    expect(store.messages[0]).toMatchObject({ content: 'first update', status: 'success' })

    finishWrite()
    await firstWrite
    await fallback
    await expect(failedWrite).rejects.toThrow('Failed to save chat history')
    expect(store.messages[0]).toMatchObject({
      content: 'first update',
      status: 'error',
      error: 'persistence failed',
    })
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

    const firstSave = store.addMessage({
      type: 'user',
      content: 'first prompt',
      status: 'success',
    })
    const secondSave = store.addMessage({
      type: 'assistant',
      content: 'pending image',
      status: 'pending',
    })

    await Promise.resolve()

    expect(setMetadataValue).toHaveBeenCalledTimes(1)
    expect(setMetadataValue.mock.calls[0][0]).toBe(STORAGE_KEYS.CHAT_HISTORY)
    expect(setMetadataValue.mock.calls[0][1]).toMatchObject([{ content: 'first prompt' }])

    releaseFirstSave()
    await Promise.all([firstSave, secondSave])

    expect(setMetadataValue).toHaveBeenCalledTimes(2)
    expect(setMetadataValue.mock.calls[1][1]).toMatchObject([
      { content: 'first prompt' },
      { content: 'pending image' },
    ])
  })

  it('rolls back an atomic message batch when persistence fails', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    setMetadataValue.mockRejectedValueOnce(new Error('disk full'))

    await expect(
      store.addMessages([
        { type: 'user', content: 'prompt', status: 'success' },
        { type: 'assistant', content: 'generating', status: 'pending' },
      ]),
    ).rejects.toThrow('Failed to save chat history')

    expect(store.messages).toEqual([])
    expect(setMetadataValue).toHaveBeenCalledTimes(1)
    expect(setMetadataValue.mock.calls[0][1]).toMatchObject([
      { type: 'user', content: 'prompt' },
      { type: 'assistant', content: 'generating' },
    ])
  })

  it('rolls back a message update when desktop persistence fails', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const message = await store.addMessage({
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

  it('rolls back a favorite update when persistence fails', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const message = await store.addMessage({
      type: 'assistant',
      content: 'generated',
      status: 'success',
    })
    await store.flushHistorySave()
    setMetadataValue.mockRejectedValueOnce(new Error('disk full'))

    await expect(store.setFavorite(message.id, true)).rejects.toThrow('Failed to save chat history')

    expect(store.messages[0].isFavorite).toBe(false)
  })

  it('rolls back a favorite toggle when persistence fails', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const message = await store.addMessage({
      type: 'assistant',
      content: 'generated',
      status: 'success',
    })
    await store.flushHistorySave()
    setMetadataValue.mockRejectedValueOnce(new Error('disk full'))

    await expect(store.toggleFavorite(message.id)).rejects.toThrow('Failed to save chat history')

    expect(store.messages[0].isFavorite).toBe(false)
  })

  it('rolls back message deletion when persistence fails', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const message = await store.addMessage({
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
    deleteUnreferencedLocalImages.mockClear()
    setMetadataValue.mockRejectedValueOnce(new Error('disk full'))

    await expect(store.deleteMessage(message.id)).rejects.toThrow('Failed to save chat history')

    expect(store.messages[0].id).toBe(message.id)
    expect(deleteUnreferencedLocalImages).not.toHaveBeenCalled()
  })

  it('keeps a committed deletion successful when image cleanup fails', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const message = await store.addMessage({
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
    deleteUnreferencedLocalImages.mockRejectedValueOnce(new Error('reference scan failed'))
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(store.deleteMessage(message.id)).resolves.toBeUndefined()

    expect(store.messages).toEqual([])
    expect(consoleWarn).toHaveBeenCalledWith(
      'Failed to clean up removed images:',
      expect.any(Error),
    )
    consoleWarn.mockRestore()
  })

  it('rolls back image removal when persistence fails', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    await store.addMessage({
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
    deleteUnreferencedLocalImages.mockClear()
    setMetadataValue.mockRejectedValueOnce(new Error('disk full'))

    await expect(store.removeImages([store.messages[0].images![0]])).rejects.toThrow(
      'Failed to save chat history',
    )

    expect(store.messages[0].images?.[0].id).toBe('image-1')
    expect(deleteUnreferencedLocalImages).not.toHaveBeenCalled()
  })

  it('defers image cleanup until explicitly finalized', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    await store.addMessage({
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
    deleteUnreferencedLocalImages.mockClear()

    const removedImages = await store.removeImages([store.messages[0].images![0]], {
      deferCleanup: true,
    })

    expect(removedImages).toEqual([
      expect.objectContaining({ id: 'image-1', localPath: 'images/image-1.png' }),
    ])
    expect(deleteUnreferencedLocalImages).not.toHaveBeenCalled()

    await store.cleanupRemovedImages(removedImages)
    expect(deleteUnreferencedLocalImages).toHaveBeenCalledWith(removedImages)
  })

  it('rolls back clearing and keeps the save queue usable after failure', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const message = await store.addMessage({
      type: 'user',
      content: 'keep me',
      status: 'success',
    })
    await store.flushHistorySave()
    setMetadataValue.mockRejectedValueOnce(new Error('disk full'))

    await expect(store.clearMessages()).rejects.toThrow('Failed to save chat history')
    expect(store.messages.map((item) => item.id)).toEqual([message.id])

    await store.clearMessages()
    expect(store.messages).toEqual([])
    expect(setMetadataValue.mock.calls.at(-1)?.[1]).toEqual([])
  })

  it('rolls back replace imports when persistence fails', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const previous = await store.addMessage({
      type: 'assistant',
      content: 'previous',
      status: 'success',
    })
    await store.flushHistorySave()
    deleteUnreferencedLocalImages.mockClear()
    setMetadataValue.mockRejectedValueOnce(new Error('disk full'))

    await expect(
      store.importMessages(
        [
          {
            id: 'replacement',
            type: 'assistant',
            content: 'replacement',
            timestamp: 2,
            status: 'success',
          },
        ],
        'replace',
      ),
    ).rejects.toThrow('Failed to save chat history')

    expect(store.messages.map((item) => item.id)).toEqual([previous.id])
    expect(deleteUnreferencedLocalImages).not.toHaveBeenCalled()
  })

  it('rolls back merge imports when persistence fails', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const previous = await store.addMessage({
      type: 'user',
      content: 'previous',
      status: 'success',
    })
    await store.flushHistorySave()
    setMetadataValue.mockRejectedValueOnce(new Error('disk full'))

    await expect(
      store.importMessages(
        [
          {
            id: 'merged',
            type: 'assistant',
            content: 'merged',
            timestamp: 2,
            status: 'success',
          },
        ],
        'merge',
      ),
    ).rejects.toThrow('Failed to save chat history')

    expect(store.messages.map((item) => item.id)).toEqual([previous.id])
  })

  it('cleans uniquely stored imported images after a successful metadata rollback', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const previous = await store.addMessage({
      type: 'assistant',
      content: 'previous',
      status: 'success',
    })
    deleteUnreferencedLocalImages.mockClear()
    setMetadataValue.mockRejectedValueOnce(new Error('disk full'))

    await expect(
      store.importMessages(
        [
          {
            id: 'replacement',
            type: 'assistant',
            content: 'replacement',
            timestamp: 2,
            status: 'success',
            images: [
              {
                id: 'shared-image-id',
                url: 'data:image/png;base64,bmV3',
                base64: btoa('new'),
                timestamp: 2,
              },
            ],
          },
        ],
        'replace',
      ),
    ).rejects.toThrow('Failed to save chat history')

    expect(store.messages.map((item) => item.id)).toEqual([previous.id])
    expect(deleteUnreferencedLocalImages).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'shared-image-id',
        localPath: expect.stringMatching(/^images\/import-/),
      }),
    ])
  })

  it('keeps staged images when import metadata rollback also fails', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const previous = await store.addMessage({
      type: 'assistant',
      content: 'previous',
      status: 'success',
    })
    deleteUnreferencedLocalImages.mockClear()
    setMetadataValue.mockRejectedValue(new Error('disk full'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    let caughtError: unknown
    try {
      await store.importMessages(
        [
          {
            id: 'replacement',
            type: 'assistant',
            content: 'replacement',
            timestamp: 2,
            status: 'success',
            images: [
              {
                id: 'new-image',
                url: 'data:image/png;base64,bmV3',
                base64: btoa('new'),
                timestamp: 2,
              },
            ],
          },
        ],
        'replace',
      )
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toMatchObject({
      name: 'PersistenceError',
      cause: {
        originalError: expect.any(Error),
        rollbackError: expect.any(Error),
      },
    })
    expect(store.messages.map((item) => item.id)).toEqual([previous.id])
    expect(deleteUnreferencedLocalImages).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith('Chat import rollback failed:', expect.any(Error))
    consoleError.mockRestore()
  })

  it('filters duplicate merge messages before persisting their images', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()
    const previous = await store.addMessage({
      type: 'assistant',
      content: 'previous',
      status: 'success',
    })
    resolveDisplayUrl.mockClear()
    setMetadataValue.mockClear()

    await store.importMessages(
      [
        {
          id: previous.id,
          type: 'assistant',
          content: 'duplicate',
          timestamp: 2,
          status: 'success',
          images: [
            {
              id: 'skipped-image',
              url: 'data:image/png;base64,c2tpcA==',
              base64: btoa('skip'),
              timestamp: 2,
            },
          ],
        },
      ],
      'merge',
    )

    expect(resolveDisplayUrl).not.toHaveBeenCalled()
    expect(setMetadataValue).not.toHaveBeenCalled()
  })

  it('passes removed current chat images to local image cleanup when clearing messages', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()

    await store.addMessage({
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

    await store.addMessage({
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
