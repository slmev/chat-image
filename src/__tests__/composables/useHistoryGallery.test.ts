import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHistory } from '../../composables/useHistory'
import { useChatStore } from '../../stores/chat'
import * as webPersistence from '../../platform/webPersistence'
import {
  getWebHistoryRecords,
  putWebHistoryRecord,
  putWebImage,
} from '../../platform/webPersistence'
import { PersistenceError } from '../../utils/persistenceError'
import type {
  ChatAttachment,
  ChatHistory,
  ChatMessage,
  GeneratedImage,
  GenerationMetadata,
} from '../../types'

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('../../platform/metadataStore', () => ({
  HISTORY_LIST_KEY: 'chat-image-history-list',
  HISTORY_MESSAGES_PREFIX: 'chat-image-history-messages-',
  getDesktopChatHistory: vi.fn(async () => []),
  getMetadataValue: vi.fn(),
  initializeDesktopPersistence: vi.fn(),
  removeMetadataValue: vi.fn(),
  setMetadataValue: vi.fn(),
}))

const deleteUnreferencedLocalImages = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('../../platform/imageReferenceCleanup', () => ({ deleteUnreferencedLocalImages }))

const persistWebHistoryRecord = putWebHistoryRecord

function image(overrides: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    id: 'image-1',
    url: 'blob:image-1',
    timestamp: 1,
    sourcePrompt: 'a quiet lake',
    ...overrides,
  }
}

function generation(
  prompt: string,
  overrides: Partial<GenerationMetadata> = {},
): GenerationMetadata {
  return {
    prompt,
    size: '1024x1024',
    quality: 'auto',
    n: 1,
    attachmentIds: [],
    ...overrides,
  }
}

function attachment(overrides: Partial<ChatAttachment> = {}): ChatAttachment {
  return {
    id: 'attachment-1',
    name: 'reference.png',
    url: 'blob:reference',
    timestamp: 1,
    ...overrides,
  }
}

function message(
  id: string,
  images: GeneratedImage[],
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  const prompt = images[0]?.sourcePrompt || id
  return {
    id,
    type: 'assistant',
    content: id,
    timestamp: 1,
    status: 'success',
    images,
    generation: generation(prompt),
    ...overrides,
  }
}

function history(id: string, overrides: Partial<ChatHistory> = {}): ChatHistory {
  return {
    id,
    title: id,
    timestamp: 1,
    messageCount: 1,
    isFavorite: false,
    ...overrides,
  }
}

describe('useHistory gallery images', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    deleteUnreferencedLocalImages.mockClear()
    await useChatStore().hydrateFromPersistence()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('waits for an active import before reading a web gallery snapshot', async () => {
    const chatStore = useChatStore()
    const historyApi = useHistory()
    await historyApi.loadGalleryImages()
    const importedHistory = history('imported-history', { title: 'Imported session' })
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
      await putWebHistoryRecord(importedHistory, [
        message('imported-message', [image({ id: 'imported-image' })]),
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

  it('aggregates current and saved history images while deduping shared images', async () => {
    const sharedImage = image({
      id: 'shared-image',
      url: 'blob:shared-current',
      timestamp: 100,
      sourcePrompt: 'current prompt',
    })
    const savedHistory = history('history-1', {
      title: 'Saved session',
      timestamp: 200,
      isFavorite: true,
    })

    await useChatStore().importMessages(
      [
        {
          id: 'user-reference-message',
          type: 'user',
          content: 'use this reference',
          timestamp: 1,
          status: 'success',
          attachments: [attachment({ id: 'reference-only' })],
        },
        message('current-message', [sharedImage], { isFavorite: true }),
      ],
      'replace',
    )

    await putWebHistoryRecord(savedHistory, [
      message('duplicate-history-message', [
        image({
          id: 'shared-image',
          url: 'blob:shared-history',
          timestamp: 90,
          sourcePrompt: 'duplicate prompt',
        }),
      ]),
      message('unique-history-message', [
        image({
          id: 'history-image',
          url: 'blob:history-image',
          timestamp: 80,
          sourcePrompt: 'saved prompt',
        }),
      ]),
    ])

    const items = await useHistory().loadGalleryImages()

    expect(items).toHaveLength(2)
    expect(items.map((item) => item.image.id)).toEqual(['shared-image', 'history-image'])
    expect(items[0]).toMatchObject({
      sourceType: 'current',
      prompt: 'current prompt',
      isFavorite: true,
    })
    expect(items[1]).toMatchObject({
      sourceType: 'history',
      sourceHistoryId: 'history-1',
      sourceHistoryTitle: 'Saved session',
      prompt: 'saved prompt',
      isFavorite: false,
    })
  })

  it('keeps the same image id distinct by web storage key and deletes only one entity', async () => {
    await putWebImage('web:entity-a', new Blob(['a']), 1)
    await putWebImage('web:entity-b', new Blob(['b']), 1)
    const entityA = image({ id: 'shared-id', webStorageKey: 'web:entity-a', url: '' })
    const entityB = image({ id: 'shared-id', webStorageKey: 'web:entity-b', url: '' })
    await useChatStore().importMessages([message('current-a', [entityA])], 'replace')
    await putWebHistoryRecord(history('history-a'), [message('history-a-message', [entityA])])
    await putWebHistoryRecord(history('history-b'), [message('history-b-message', [entityB])])

    const chat = useHistory()
    const items = await chat.loadGalleryImages()

    expect(items).toHaveLength(2)
    expect(items.map((item) => item.image.webStorageKey).sort()).toEqual([
      'web:entity-a',
      'web:entity-b',
    ])

    await chat.deleteGalleryItems(
      items.filter((item) => item.image.webStorageKey === 'web:entity-a'),
    )

    const remaining = await chat.loadGalleryImages()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].image).toMatchObject({
      id: 'shared-id',
      webStorageKey: 'web:entity-b',
    })
  })

  it('deletes a shared image from both current chat and history', async () => {
    await useChatStore().importMessages(
      [message('current-message', [image({ id: 'shared', url: 'blob:cur' })])],
      'replace',
    )
    await putWebHistoryRecord(history('h1', { messageCount: 2 }), [
      message('dup', [image({ id: 'shared', url: 'blob:hist-dup' })]),
      message('keep', [image({ id: 'other', url: 'blob:other' })]),
    ])

    const chat = useHistory()
    const items = await chat.loadGalleryImages()
    const shared = items.filter((item) => item.image.id === 'shared')
    expect(shared).toHaveLength(1)

    await chat.deleteGalleryItems(shared)

    // 当前对话的助手消息删空后应被移除。
    expect(useChatStore().messages.some((m) => m.id === 'current-message')).toBe(false)

    // 历史中同 id 的副本也应被清除，避免刷新后重现。
    const remaining = await useHistory().loadGalleryImages()
    expect(remaining.map((item) => item.image.id)).toEqual(['other'])
    expect(deleteUnreferencedLocalImages).toHaveBeenCalledTimes(1)
  })

  it('keeps a committed gallery deletion successful when cleanup fails', async () => {
    await useChatStore().importMessages(
      [message('current-message', [image({ id: 'remove', url: 'blob:remove' })])],
      'replace',
    )
    const chat = useHistory()
    const items = await chat.loadGalleryImages()
    deleteUnreferencedLocalImages.mockRejectedValueOnce(new Error('reference scan failed'))
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(chat.deleteGalleryItems(items)).resolves.toBeUndefined()

    expect(useChatStore().messages).toEqual([])
    expect(consoleWarn).toHaveBeenCalledWith(
      'Failed to clean up removed images:',
      expect.any(Error),
    )
  })

  it('persists the updated messageCount after deleting a history image', async () => {
    await useChatStore().importMessages([], 'replace')
    await putWebHistoryRecord(history('h1', { messageCount: 3 }), [
      message('m1', [image({ id: 'a', url: 'blob:a' })]),
      message('m2', [image({ id: 'b', url: 'blob:b' })]),
      message('m3', [image({ id: 'c', url: 'blob:c' })]),
    ])

    const chat = useHistory()
    const items = await chat.loadGalleryImages()
    await chat.deleteGalleryItems(items.filter((item) => item.image.id === 'b'))

    expect(chat.historyList.value.find((h) => h.id === 'h1')?.messageCount).toBe(2)

    // 重新读回 IndexedDB（模拟刷新），计数与消息数都应为 2。
    const records = await getWebHistoryRecords()
    const record = records.find((r) => r.id === 'h1')
    expect(record?.history.messageCount).toBe(2)
    expect(record?.messages).toHaveLength(2)
  })

  it('deletes the whole history record when its last image is removed', async () => {
    await useChatStore().importMessages([], 'replace')
    await putWebHistoryRecord(history('h1', { messageCount: 1 }), [
      message('only', [image({ id: 'solo', url: 'blob:solo' })]),
    ])

    const chat = useHistory()
    const items = await chat.loadGalleryImages()
    await chat.deleteGalleryItems(items)

    expect(chat.historyList.value.some((h) => h.id === 'h1')).toBe(false)
    expect(await getWebHistoryRecords()).toHaveLength(0)
  })

  it('rolls back all favorite changes when the second history write fails', async () => {
    await putWebHistoryRecord(history('h1', { timestamp: 2 }), [
      message('m1', [image({ id: 'a', url: 'blob:a' })], { isFavorite: false }),
    ])
    await putWebHistoryRecord(history('h2', { timestamp: 1 }), [
      message('m2', [image({ id: 'b', url: 'blob:b' })], { isFavorite: false }),
    ])

    const chat = useHistory()
    const items = await chat.loadGalleryImages()
    let writeCount = 0
    vi.spyOn(webPersistence, 'putWebHistoryRecord').mockImplementation(async (...args) => {
      writeCount += 1
      if (writeCount === 2) throw new Error('second history write failed')
      await persistWebHistoryRecord(...args)
    })

    await expect(chat.setGalleryItemsFavorite(items, true)).rejects.toThrow(
      'second history write failed',
    )

    const records = await getWebHistoryRecords()
    expect(records.map((record) => record.messages[0].isFavorite)).toEqual([false, false])
  })

  it('rolls back all image deletions and skips cleanup when a later history write fails', async () => {
    await putWebHistoryRecord(history('h1', { timestamp: 2, messageCount: 2 }), [
      message('shared-1', [image({ id: 'shared', url: 'blob:shared-1' })]),
      message('keep-1', [image({ id: 'keep-1', url: 'blob:keep-1' })]),
    ])
    await putWebHistoryRecord(history('h2', { timestamp: 1, messageCount: 2 }), [
      message('shared-2', [image({ id: 'shared', url: 'blob:shared-2' })]),
      message('keep-2', [image({ id: 'keep-2', url: 'blob:keep-2' })]),
    ])

    const chat = useHistory()
    const items = await chat.loadGalleryImages()
    let writeCount = 0
    vi.spyOn(webPersistence, 'putWebHistoryRecord').mockImplementation(async (...args) => {
      writeCount += 1
      if (writeCount === 2) throw new Error('second history write failed')
      await persistWebHistoryRecord(...args)
    })

    await expect(
      chat.deleteGalleryItems(items.filter((item) => item.image.id === 'shared')),
    ).rejects.toThrow('second history write failed')

    const records = await getWebHistoryRecords()
    expect(records).toHaveLength(2)
    expect(records.every((record) => record.history.messageCount === 2)).toBe(true)
    expect(
      records.every((record) =>
        record.messages.some((item) => item.images?.some((entry) => entry.id === 'shared')),
      ),
    ).toBe(true)
    expect(deleteUnreferencedLocalImages).not.toHaveBeenCalled()
  })

  it('restores in-memory snapshots and reports both errors when rollback also fails', async () => {
    await useChatStore().importMessages(
      [message('current-shared', [image({ id: 'shared', url: 'blob:current-shared' })])],
      'replace',
    )
    await putWebHistoryRecord(history('h1', { timestamp: 2, messageCount: 2 }), [
      message('shared-1', [image({ id: 'shared', url: 'blob:shared-1' })]),
      message('keep-1', [image({ id: 'keep-1', url: 'blob:keep-1' })]),
    ])
    await putWebHistoryRecord(history('h2', { timestamp: 1, messageCount: 2 }), [
      message('shared-2', [image({ id: 'shared', url: 'blob:shared-2' })]),
      message('keep-2', [image({ id: 'keep-2', url: 'blob:keep-2' })]),
    ])

    const chat = useHistory()
    const items = await chat.loadGalleryImages()
    let writeCount = 0
    vi.spyOn(webPersistence, 'putWebHistoryRecord').mockImplementation(async (...args) => {
      writeCount += 1
      if (writeCount === 2) throw new Error('original write failed')
      if (writeCount === 3) throw new Error('rollback write failed')
      await persistWebHistoryRecord(...args)
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    let caughtError: unknown
    try {
      await chat.deleteGalleryItems(items.filter((item) => item.image.id === 'shared'))
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(PersistenceError)
    const cause = (caughtError as PersistenceError).cause as {
      originalError: unknown
      rollbackErrors: unknown[]
    }
    expect(cause.originalError).toEqual(expect.any(Error))
    expect(cause.rollbackErrors).toEqual([expect.any(Error)])
    expect(useChatStore().messages[0].images?.[0].id).toBe('shared')
    expect(chat.historyList.value.map((item) => item.messageCount)).toEqual([2, 2])
    expect(deleteUnreferencedLocalImages).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith(
      'Gallery mutation rollback failed:',
      expect.any(Array),
    )
  })

  it('keeps gallery favorites independent from the history favorite', async () => {
    await useChatStore().importMessages([], 'replace')
    await putWebHistoryRecord(history('h1', { messageCount: 1, isFavorite: true }), [
      message('m1', [image({ id: 'a', url: 'blob:a' })], { isFavorite: false }),
    ])

    const chat = useHistory()
    let items = await chat.loadGalleryImages()
    expect(items[0].isFavorite).toBe(false)

    await chat.setGalleryItemsFavorite(items, true)
    items = await chat.loadGalleryImages()
    expect(items[0].isFavorite).toBe(true)

    await chat.setGalleryItemsFavorite(items, false)
    items = await chat.loadGalleryImages()
    expect(items[0].isFavorite).toBe(false)

    const record = (await getWebHistoryRecords()).find((r) => r.id === 'h1')
    expect(record?.history.isFavorite).toBe(true)
    expect(record?.messages[0].isFavorite).toBe(false)
  })
})
