import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearWebHistoryRecords,
  deleteWebHistoryRecords,
  getWebCurrentMessages,
  getWebHistoryRecord,
  getWebHistoryRecords,
  getWebImage,
  initializeWebPersistence,
  prepareMessagesForWebExport,
  putWebHistoryRecord,
  putWebImage,
  setWebCurrentMessages,
} from '../../platform/webPersistence'
import type { ChatHistory, ChatMessage, GeneratedImage } from '../../types'
import { HISTORY_LIST_KEY, HISTORY_MESSAGES_PREFIX, STORAGE_KEYS } from '../../utils/constants'
import { PersistenceError } from '../../utils/persistenceError'

function image(overrides: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    id: 'image-1',
    url: 'blob:runtime-image',
    mimeType: 'image/png',
    timestamp: 1,
    ...overrides,
  }
}

function message(id: string, storedImage?: GeneratedImage): ChatMessage {
  return {
    id,
    type: 'assistant',
    content: id,
    timestamp: 1,
    status: 'success',
    images: storedImage ? [storedImage] : undefined,
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

describe('web persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('migrates legacy chats and stores a repeated image once by key', async () => {
    const base64 = btoa('png')
    const legacyImage = image({
      url: `data:image/png;base64,${base64}`,
      base64,
    })
    const savedHistory = history('history-1')

    localStorage.setItem(
      STORAGE_KEYS.CHAT_HISTORY,
      JSON.stringify([message('current', legacyImage)]),
    )
    localStorage.setItem(HISTORY_LIST_KEY, JSON.stringify([savedHistory]))
    localStorage.setItem(
      HISTORY_MESSAGES_PREFIX + savedHistory.id,
      JSON.stringify([message('saved', legacyImage)]),
    )

    await initializeWebPersistence()

    const currentImage = (await getWebCurrentMessages())[0].images?.[0]
    const historyImage = (await getWebHistoryRecord(savedHistory.id))?.messages[0].images?.[0]
    expect(currentImage).toMatchObject({ webStorageKey: 'legacy:image-1', url: '' })
    expect(historyImage).toMatchObject({ webStorageKey: 'legacy:image-1', url: '' })
    expect(currentImage).not.toHaveProperty('base64')
    expect(historyImage).not.toHaveProperty('base64')
    expect(await (await getWebImage('legacy:image-1'))?.text()).toBe('png')
    expect(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY)).toBeNull()
    expect(localStorage.getItem(HISTORY_LIST_KEY)).toBeNull()
    expect(localStorage.getItem(HISTORY_MESSAGES_PREFIX + savedHistory.id)).toBeNull()
  })

  it('keeps legacy keys when migration fails', async () => {
    const invalidImage = image({ base64: '%%%', url: 'data:image/png;base64,%%%' })
    localStorage.setItem(
      STORAGE_KEYS.CHAT_HISTORY,
      JSON.stringify([message('current', invalidImage)]),
    )

    await expect(initializeWebPersistence()).rejects.toBeInstanceOf(PersistenceError)
    expect(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY)).not.toBeNull()
  })

  it('retries legacy cleanup after verified data was migrated', async () => {
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify([message('current')]))
    const nativeRemoveItem = Storage.prototype.removeItem
    const removeItem = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementationOnce(() => {
        throw new DOMException('cleanup failed', 'InvalidStateError')
      })
      .mockImplementation(function (this: Storage, key: string) {
        nativeRemoveItem.call(this, key)
      })

    await expect(initializeWebPersistence()).rejects.toBeInstanceOf(PersistenceError)
    expect(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY)).not.toBeNull()

    removeItem.mockRestore()
    await initializeWebPersistence()
    expect(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY)).toBeNull()
  })

  it('saves, reloads, deletes, and clears current and saved chats', async () => {
    const storedImage = image({ webStorageKey: 'web:image-1', base64: btoa('png') })
    const currentMessages = [message('current', storedImage)]
    const firstHistory = history('history-1')
    const secondHistory = history('history-2')

    await setWebCurrentMessages(currentMessages)
    await putWebHistoryRecord(firstHistory, [message('saved-1')])
    await putWebHistoryRecord(secondHistory, [message('saved-2')])

    expect(await getWebCurrentMessages()).toEqual([
      message('current', image({ webStorageKey: 'web:image-1', url: '' })),
    ])
    expect((await getWebHistoryRecords()).map((record) => record.id)).toEqual([
      firstHistory.id,
      secondHistory.id,
    ])

    await deleteWebHistoryRecords([firstHistory.id])
    expect(await getWebHistoryRecord(firstHistory.id)).toBeUndefined()
    expect(await getWebHistoryRecord(secondHistory.id)).toBeDefined()

    await clearWebHistoryRecords()
    expect(await getWebHistoryRecords()).toEqual([])
  })

  it('reconstructs portable base64 data for export', async () => {
    const blob = new Blob(['png'], { type: 'image/png' })
    await putWebImage('web:image-1', blob, 1)
    const storedMessages = [
      message(
        'current',
        image({
          webStorageKey: 'web:image-1',
          url: 'blob:runtime-image',
          originalUrl: 'https://example.test/image.png',
        }),
      ),
    ]

    const exported = await prepareMessagesForWebExport(storedMessages)

    expect(exported[0].images?.[0]).toMatchObject({
      url: 'https://example.test/image.png',
      base64: btoa('png'),
    })
    expect(exported[0].images?.[0]).not.toHaveProperty('webStorageKey')
  })
})
