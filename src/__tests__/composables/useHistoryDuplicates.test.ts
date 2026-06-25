import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChat } from '../../composables/useChat'
import { useHistory } from '../../composables/useHistory'
import { useConfigStore } from '../../stores/config'
import { useChatStore } from '../../stores/chat'
import type { ChatHistory, ChatMessage, GeneratedImage, GenerationOptions } from '../../types'

const HISTORY_LIST_KEY = 'chat-image-history-list'
const HISTORY_MESSAGES_PREFIX = 'chat-image-history-messages-'

const generateImage = vi.fn<(...args: [string, GenerationOptions]) => Promise<GeneratedImage[]>>()
const cancelGeneration = vi.fn()

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

vi.mock('../../composables/useImageGeneration', () => ({
  useImageGeneration: () => ({
    generateImage,
    cancelGeneration,
  }),
}))

function generatedImage(): GeneratedImage {
  return {
    id: 'image-1',
    url: 'blob:image-1',
    timestamp: 1,
  }
}

function message(id: string): ChatMessage {
  return {
    id,
    type: 'assistant',
    content: id,
    timestamp: 1,
    status: 'success',
  }
}

function history(id: string, overrides: Partial<ChatHistory> = {}): ChatHistory {
  return {
    id,
    title: id,
    timestamp: 1,
    messageCount: 2,
    isFavorite: false,
    ...overrides,
  }
}

function readHistoryList(): ChatHistory[] {
  return JSON.parse(localStorage.getItem(HISTORY_LIST_KEY) || '[]') as ChatHistory[]
}

async function configureApi() {
  await useConfigStore().saveConfig({
    endpoint: 'https://api.example.test',
    apiKey: 'sk-test',
    model: 'gpt-image-2',
  })
}

describe('history duplicate prevention', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    generateImage.mockReset()
    generateImage.mockResolvedValue([generatedImage()])
    cancelGeneration.mockReset()
  })

  it('updates the saved current chat instead of creating a duplicate when starting a new chat', async () => {
    await configureApi()
    const chat = useChat()

    await chat.sendMessage('a quiet mountain lake', {
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    })
    const firstHistory = readHistoryList()
    expect(firstHistory).toHaveLength(1)

    await chat.startNewChat()

    const nextHistory = readHistoryList()
    expect(nextHistory).toHaveLength(1)
    expect(nextHistory[0].id).toBe(firstHistory[0].id)
    expect(chat.chatStore.messages).toEqual([])
  })

  it('shares the current history id across separate useChat instances', async () => {
    await configureApi()
    const chatForInput = useChat()

    await chatForInput.sendMessage('a glass greenhouse', {
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    })
    const firstHistory = readHistoryList()
    expect(firstHistory).toHaveLength(1)

    const chatForHeader = useChat()
    await chatForHeader.startNewChat()

    const nextHistory = readHistoryList()
    expect(nextHistory).toHaveLength(1)
    expect(nextHistory[0].id).toBe(firstHistory[0].id)
  })

  it('removes existing histories with identical message id snapshots', async () => {
    const olderDuplicate = history('older-duplicate', { timestamp: 10 })
    const favoriteDuplicate = history('favorite-duplicate', {
      timestamp: 1,
      isFavorite: true,
    })
    const unique = history('unique', { timestamp: 5 })
    localStorage.setItem(HISTORY_LIST_KEY, JSON.stringify([
      olderDuplicate,
      favoriteDuplicate,
      unique,
    ]))
    localStorage.setItem(HISTORY_MESSAGES_PREFIX + olderDuplicate.id, JSON.stringify([
      message('same-user'),
      message('same-assistant'),
    ]))
    localStorage.setItem(HISTORY_MESSAGES_PREFIX + favoriteDuplicate.id, JSON.stringify([
      message('same-user'),
      message('same-assistant'),
    ]))
    localStorage.setItem(HISTORY_MESSAGES_PREFIX + unique.id, JSON.stringify([
      message('unique-message'),
    ]))

    const { historyList } = useHistory()
    await flushPromises()

    expect(historyList.value.map(item => item.id)).toEqual([
      favoriteDuplicate.id,
      unique.id,
    ])
    expect(readHistoryList().map(item => item.id)).toEqual([
      favoriteDuplicate.id,
      unique.id,
    ])
    expect(localStorage.getItem(HISTORY_MESSAGES_PREFIX + olderDuplicate.id)).toBeNull()
    expect(localStorage.getItem(HISTORY_MESSAGES_PREFIX + favoriteDuplicate.id)).not.toBeNull()
  })

  it('renames a saved history item and persists the title', async () => {
    const savedHistory = history('history-1', { title: 'Original title' })
    localStorage.setItem(HISTORY_LIST_KEY, JSON.stringify([savedHistory]))

    const { historyList, renameHistoryItem } = useHistory()
    await flushPromises()
    await renameHistoryItem(savedHistory.id, '  Renamed title  ')

    expect(historyList.value[0].title).toBe('Renamed title')
    expect(readHistoryList()[0].title).toBe('Renamed title')
  })

  it('keeps a renamed title when saving the same history again', async () => {
    const savedHistory = history('history-1', { title: 'Renamed title' })
    localStorage.setItem(HISTORY_LIST_KEY, JSON.stringify([savedHistory]))
    await useChatStore().importMessages([
      {
        ...message('user-message'),
        type: 'user',
        content: 'first generated prompt',
      },
      message('assistant-message'),
    ], 'replace')

    await useHistory().saveCurrentChat(savedHistory.id)

    expect(readHistoryList()[0].title).toBe('Renamed title')
  })
})
