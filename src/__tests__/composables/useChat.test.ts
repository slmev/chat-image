import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChat } from '../../composables/useChat'
import { useChatStore } from '../../stores/chat'
import { useConfigStore } from '../../stores/config'
import type { GeneratedImage } from '../../types'

const mockState = vi.hoisted(() => ({
  generateImage: vi.fn(),
  cancelGeneration: vi.fn(),
  saveCurrentChat: vi.fn(),
  loadHistoryChat: vi.fn(),
}))

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('../../platform/metadataStore', () => ({
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
    generateImage: mockState.generateImage,
    cancelGeneration: mockState.cancelGeneration,
  }),
}))

vi.mock('../../composables/useHistory', () => ({
  useHistory: () => ({
    saveCurrentChat: mockState.saveCurrentChat,
    loadHistoryChat: mockState.loadHistoryChat,
  }),
}))

function generatedImage(): GeneratedImage {
  return {
    id: 'image-1',
    url: 'blob:image-1',
    timestamp: 1,
  }
}

describe('useChat', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockState.generateImage.mockReset()
    mockState.cancelGeneration.mockReset()
    mockState.saveCurrentChat.mockReset()
    mockState.loadHistoryChat.mockReset()
  })

  it('retries an assistant message without appending new chat messages or history records', async () => {
    mockState.generateImage.mockResolvedValueOnce([generatedImage()])
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    const chatStore = useChatStore()
    const userMessage = chatStore.addMessage({
      type: 'user',
      content: 'a quiet mountain lake',
      status: 'success',
    })
    const assistantMessage = chatStore.addMessage({
      type: 'assistant',
      content: '正在生成图片...',
      status: 'error',
      error: '生成失败',
    })

    const { retryMessage } = useChat()

    await retryMessage(assistantMessage.id, userMessage.content, {
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    })

    expect(chatStore.messages).toHaveLength(2)
    expect(chatStore.messages.map(message => message.id)).toEqual([
      userMessage.id,
      assistantMessage.id,
    ])
    expect(chatStore.messages[1]).toMatchObject({
      id: assistantMessage.id,
      type: 'assistant',
      generationSize: '1024x1024',
      status: 'success',
      images: [expect.objectContaining({ id: 'image-1' })],
    })
    expect(mockState.saveCurrentChat).not.toHaveBeenCalled()
  })

  it('stores the requested generation size on pending assistant messages', async () => {
    mockState.generateImage.mockResolvedValueOnce([generatedImage()])
    mockState.saveCurrentChat.mockResolvedValueOnce('history-1')
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })

    const { sendMessage } = useChat()
    const chatStore = useChatStore()

    await sendMessage('a wide city skyline', {
      size: '1792x1024',
      quality: 'standard',
      n: 1,
    })

    expect(chatStore.messages).toHaveLength(2)
    expect(chatStore.messages[1]).toMatchObject({
      type: 'assistant',
      generationSize: '1792x1024',
      status: 'success',
      images: [expect.objectContaining({ id: 'image-1' })],
    })
  })
})
