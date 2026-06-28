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

function message(id: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    type: 'assistant',
    content: id,
    timestamp: 1,
    status: 'success',
    ...overrides,
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
      size: 'auto',
      quality: 'auto',
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
      size: 'auto',
      quality: 'auto',
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

  it('continues a saved chat after reload without creating another history', async () => {
    await configureApi()
    const chat = useChat()

    await chat.sendMessage('a courtyard with paper lanterns', {
      size: 'auto',
      quality: 'auto',
      n: 1,
    })
    const firstHistory = readHistoryList()
    expect(firstHistory).toHaveLength(1)

    vi.resetModules()
    setActivePinia(createPinia())
    const { useChat: useFreshChat } = await import('../../composables/useChat')
    const reloadedChat = useFreshChat()

    await reloadedChat.sendMessage('add rain reflections', {
      size: 'auto',
      quality: 'auto',
      n: 1,
    })

    const nextHistory = readHistoryList()
    expect(nextHistory).toHaveLength(1)
    expect(nextHistory[0]).toMatchObject({
      id: firstHistory[0].id,
      messageCount: 4,
    })
  })

  it('updates a prefix-matched history when saving without a current history id', async () => {
    const savedHistory = history('history-1', {
      title: 'first generated prompt',
      messageCount: 2,
    })
    const savedMessages = [
      message('user-1', { type: 'user', content: 'first generated prompt' }),
      message('assistant-1'),
    ]
    const currentMessages = [
      ...savedMessages,
      message('user-2', { type: 'user', content: 'follow up prompt' }),
      message('assistant-2'),
    ]
    localStorage.setItem(HISTORY_LIST_KEY, JSON.stringify([savedHistory]))
    localStorage.setItem(HISTORY_MESSAGES_PREFIX + savedHistory.id, JSON.stringify(savedMessages))
    await useChatStore().importMessages(currentMessages, 'replace')

    const historyApi = useHistory()
    await flushPromises()
    const savedId = await historyApi.saveCurrentChat(null)

    expect(savedId).toBe(savedHistory.id)
    expect(readHistoryList()).toHaveLength(1)
    expect(readHistoryList()[0]).toMatchObject({
      id: savedHistory.id,
      messageCount: 4,
    })
    expect(
      JSON.parse(localStorage.getItem(HISTORY_MESSAGES_PREFIX + savedHistory.id) || '[]').map(
        (item: ChatMessage) => item.id,
      ),
    ).toEqual(['user-1', 'assistant-1', 'user-2', 'assistant-2'])
  })

  it('removes existing histories with identical message id snapshots and preserves favorites', async () => {
    const newerDuplicate = history('newer-duplicate', { timestamp: 10 })
    const favoriteDuplicate = history('favorite-duplicate', {
      timestamp: 1,
      isFavorite: true,
    })
    const unique = history('unique', { timestamp: 5 })
    localStorage.setItem(
      HISTORY_LIST_KEY,
      JSON.stringify([newerDuplicate, favoriteDuplicate, unique]),
    )
    localStorage.setItem(
      HISTORY_MESSAGES_PREFIX + newerDuplicate.id,
      JSON.stringify([message('same-user'), message('same-assistant')]),
    )
    localStorage.setItem(
      HISTORY_MESSAGES_PREFIX + favoriteDuplicate.id,
      JSON.stringify([message('same-user'), message('same-assistant')]),
    )
    localStorage.setItem(
      HISTORY_MESSAGES_PREFIX + unique.id,
      JSON.stringify([message('unique-message')]),
    )

    const { historyList } = useHistory()
    await flushPromises()

    expect(historyList.value.map((item) => item.id)).toEqual([newerDuplicate.id, unique.id])
    expect(readHistoryList()[0]).toMatchObject({
      id: newerDuplicate.id,
      isFavorite: true,
    })
    expect(localStorage.getItem(HISTORY_MESSAGES_PREFIX + favoriteDuplicate.id)).toBeNull()
    expect(localStorage.getItem(HISTORY_MESSAGES_PREFIX + newerDuplicate.id)).not.toBeNull()
  })

  it('merges prefix-related history snapshots and keeps the complete renamed record', async () => {
    const shorterSnapshot = history('shorter-snapshot', {
      title: 'Renamed title',
      timestamp: 10,
      messageCount: 2,
      isFavorite: true,
    })
    const longerSnapshot = history('longer-snapshot', {
      title: 'first generated prompt',
      timestamp: 20,
      messageCount: 4,
    })
    const shortMessages = [
      message('shared-user', { type: 'user', content: 'first generated prompt' }),
      message('shared-assistant'),
    ]
    const longMessages = [
      ...shortMessages,
      message('follow-up-user', { type: 'user', content: 'follow up prompt' }),
      message('follow-up-assistant'),
    ]
    localStorage.setItem(HISTORY_LIST_KEY, JSON.stringify([shorterSnapshot, longerSnapshot]))
    localStorage.setItem(
      HISTORY_MESSAGES_PREFIX + shorterSnapshot.id,
      JSON.stringify(shortMessages),
    )
    localStorage.setItem(HISTORY_MESSAGES_PREFIX + longerSnapshot.id, JSON.stringify(longMessages))

    const { historyList } = useHistory()
    await flushPromises()

    expect(historyList.value).toHaveLength(1)
    expect(historyList.value[0]).toMatchObject({
      id: longerSnapshot.id,
      title: 'Renamed title',
      messageCount: 4,
      isFavorite: true,
    })
    expect(localStorage.getItem(HISTORY_MESSAGES_PREFIX + shorterSnapshot.id)).toBeNull()
    expect(
      JSON.parse(localStorage.getItem(HISTORY_MESSAGES_PREFIX + longerSnapshot.id) || '[]').map(
        (item: ChatMessage) => item.id,
      ),
    ).toEqual(['shared-user', 'shared-assistant', 'follow-up-user', 'follow-up-assistant'])
  })

  it('does not merge separate chats with the same title and prompt', async () => {
    const first = history('first-history', { title: 'same prompt' })
    const second = history('second-history', { title: 'same prompt' })
    localStorage.setItem(HISTORY_LIST_KEY, JSON.stringify([first, second]))
    localStorage.setItem(
      HISTORY_MESSAGES_PREFIX + first.id,
      JSON.stringify([
        message('first-user', { type: 'user', content: 'same prompt' }),
        message('first-assistant'),
      ]),
    )
    localStorage.setItem(
      HISTORY_MESSAGES_PREFIX + second.id,
      JSON.stringify([
        message('second-user', { type: 'user', content: 'same prompt' }),
        message('second-assistant'),
      ]),
    )

    const { historyList } = useHistory()
    await flushPromises()

    expect(historyList.value.map((item) => item.id)).toEqual([first.id, second.id])
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
    await useChatStore().importMessages(
      [
        {
          ...message('user-message'),
          type: 'user',
          content: 'first generated prompt',
        },
        message('assistant-message'),
      ],
      'replace',
    )

    await useHistory().saveCurrentChat(savedHistory.id)

    expect(readHistoryList()[0].title).toBe('Renamed title')
  })
})
