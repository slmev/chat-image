import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHistory } from '../../composables/useHistory'
import { useChatStore } from '../../stores/chat'
import { getWebHistoryRecords, putWebHistoryRecord } from '../../platform/webPersistence'
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

vi.mock('../../platform/imageReferenceCleanup', () => ({
  deleteUnreferencedLocalImages: vi.fn(),
}))

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
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
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
      isFavorite: true,
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

  it('sets favorite on history messages at the message level', async () => {
    await useChatStore().importMessages([], 'replace')
    await putWebHistoryRecord(history('h1', { messageCount: 1 }), [
      message('m1', [image({ id: 'a', url: 'blob:a' })], { isFavorite: false }),
    ])

    const chat = useHistory()
    const items = await chat.loadGalleryImages()
    await chat.setGalleryItemsFavorite(items, true)

    const record = (await getWebHistoryRecords()).find((r) => r.id === 'h1')
    expect(record?.messages[0].isFavorite).toBe(true)
  })
})
