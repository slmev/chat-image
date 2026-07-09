import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChat } from '../../composables/useChat'
import { useChatStore } from '../../stores/chat'
import { useConfigStore } from '../../stores/config'
import type {
  ChatAttachment,
  GeneratedImage,
  ImageGenerationResponse,
  StyleTemplate,
} from '../../types'

const mockState = vi.hoisted(() => ({
  generateImage: vi.fn(),
  cancelGeneration: vi.fn(),
  saveCurrentChat: vi.fn(),
  loadHistoryChat: vi.fn(),
  persistChatAttachments: vi.fn(),
  persistGeneratedImagesFromResponse: vi.fn(),
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

vi.mock('../../utils/images', () => ({
  persistChatAttachments: mockState.persistChatAttachments,
  persistGeneratedImagesFromResponse: mockState.persistGeneratedImagesFromResponse,
}))

function generatedImage(): GeneratedImage {
  return {
    id: 'image-1',
    url: 'blob:image-1',
    timestamp: 1,
  }
}

function imageResponse(): ImageGenerationResponse {
  return {
    created: 1,
    data: [{ b64_json: 'image' }],
  }
}

function attachment(): ChatAttachment {
  return {
    id: 'attachment-1',
    name: 'reference.png',
    url: 'blob:attachment-1',
    base64: btoa('reference'),
    mimeType: 'image/png',
    timestamp: 1,
  }
}

function style(): StyleTemplate {
  return {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Cinematic lighting',
    promptSuffix: 'cinematic lighting, film still',
    icon: 'sparkles',
  }
}

describe('useChat', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockState.generateImage.mockReset()
    mockState.cancelGeneration.mockReset()
    mockState.saveCurrentChat.mockReset()
    mockState.loadHistoryChat.mockReset()
    mockState.persistChatAttachments.mockReset()
    mockState.persistGeneratedImagesFromResponse.mockReset()
    await useChat().clearChat()
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
      size: 'auto',
      quality: 'auto',
      n: 1,
    })

    expect(chatStore.messages).toHaveLength(2)
    expect(chatStore.messages.map((message) => message.id)).toEqual([
      userMessage.id,
      assistantMessage.id,
    ])
    expect(chatStore.messages[1]).toMatchObject({
      id: assistantMessage.id,
      type: 'assistant',
      generation: {
        prompt: 'a quiet mountain lake',
        size: 'auto',
        quality: 'auto',
        n: 1,
        attachmentIds: [],
      },
      status: 'success',
      images: [expect.objectContaining({ id: 'image-1' })],
    })
    expect(mockState.saveCurrentChat).not.toHaveBeenCalled()
  })

  it('passes retry attachments through to image generation', async () => {
    const reference = attachment()
    mockState.generateImage.mockResolvedValueOnce([generatedImage()])
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    const chatStore = useChatStore()
    const assistantMessage = chatStore.addMessage({
      type: 'assistant',
      content: '正在生成图片...',
      status: 'error',
      error: '生成失败',
    })

    const { retryMessage } = useChat()
    const options = {
      size: '1024x1024',
      quality: 'medium' as const,
      n: 1,
    }

    await retryMessage(assistantMessage.id, 'use this reference', options, [reference])

    expect(mockState.generateImage).toHaveBeenCalledWith('use this reference', options, [reference])
  })

  it('stores the requested generation options on pending assistant messages', async () => {
    mockState.generateImage.mockResolvedValueOnce([generatedImage()])
    mockState.saveCurrentChat.mockResolvedValueOnce('history-1')
    const selectedStyle = style()
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })

    const { sendMessage } = useChat()
    const chatStore = useChatStore()

    await sendMessage('a wide city skyline', {
      size: '4096x2304',
      quality: 'high',
      n: 2,
      style: selectedStyle,
    })

    expect(chatStore.messages).toHaveLength(2)
    expect(chatStore.messages[1]).toMatchObject({
      type: 'assistant',
      generation: {
        prompt: 'a wide city skyline',
        size: '4096x2304',
        quality: 'high',
        n: 2,
        styleId: selectedStyle.id,
        styleName: selectedStyle.name,
        style: selectedStyle,
        attachmentIds: [],
      },
      status: 'success',
      images: [expect.objectContaining({ id: 'image-1' })],
    })
  })

  it('persists uploaded files before storing the user message and generating', async () => {
    const reference = attachment()
    const file = new File(['reference'], 'reference.png', { type: 'image/png' })
    mockState.persistChatAttachments.mockResolvedValueOnce([reference])
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
    const options = {
      size: '1024x1536',
      quality: 'low' as const,
      n: 1,
    }

    await sendMessage('use this as a reference', options, [file])

    expect(mockState.persistChatAttachments).toHaveBeenCalledWith([file], {
      sourcePrompt: 'use this as a reference',
    })
    expect(chatStore.messages[0]).toMatchObject({
      type: 'user',
      content: 'use this as a reference',
      attachments: [expect.objectContaining({ id: 'attachment-1', name: 'reference.png' })],
    })
    expect(mockState.generateImage).toHaveBeenCalledWith('use this as a reference', options, [
      reference,
    ])
  })

  it('regenerates when editing a historical user prompt without existing generation metadata', async () => {
    mockState.generateImage.mockResolvedValueOnce([generatedImage()])
    mockState.saveCurrentChat.mockResolvedValueOnce('history-1')
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    const chatStore = useChatStore()
    const userMessage = chatStore.addMessage({
      type: 'user',
      content: 'old prompt',
      status: 'success',
    })
    const assistantMessage = chatStore.addMessage({
      type: 'assistant',
      content: 'old result',
      status: 'success',
      images: [generatedImage()],
    })

    const { editUserPrompt } = useChat()

    await editUserPrompt(userMessage.id, 'new prompt')

    expect(chatStore.messages[0]).toMatchObject({
      id: userMessage.id,
      content: 'new prompt',
    })
    expect(chatStore.messages[1]).toMatchObject({
      id: assistantMessage.id,
      status: 'success',
      generation: {
        prompt: 'new prompt',
        size: 'auto',
        quality: 'auto',
        n: 1,
        attachmentIds: [],
      },
      images: [expect.objectContaining({ id: 'image-1' })],
    })
    expect(mockState.generateImage).toHaveBeenCalledWith(
      'new prompt',
      {
        size: 'auto',
        quality: 'auto',
        n: 1,
      },
      [],
    )
    expect(mockState.saveCurrentChat).toHaveBeenCalled()
  })

  it('regenerates edited historical prompts without unreadable stale blob references', async () => {
    mockState.generateImage.mockResolvedValueOnce([generatedImage()])
    mockState.saveCurrentChat.mockResolvedValueOnce('history-1')
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    const chatStore = useChatStore()
    const userMessage = chatStore.addMessage({
      type: 'user',
      content: 'old prompt',
      status: 'success',
      attachments: [
        {
          id: 'stale-reference',
          name: 'stale.png',
          url: 'blob:stale-reference',
          timestamp: 1,
        },
      ],
    })
    chatStore.addMessage({
      type: 'assistant',
      content: 'old result',
      status: 'success',
      images: [generatedImage()],
    })

    const { editUserPrompt } = useChat()

    await editUserPrompt(userMessage.id, 'new prompt')

    expect(mockState.generateImage).toHaveBeenCalledWith(
      'new prompt',
      {
        size: 'auto',
        quality: 'auto',
        n: 1,
      },
      [],
    )
    expect(chatStore.messages[1]).toMatchObject({
      status: 'success',
      generation: {
        prompt: 'new prompt',
        attachmentIds: [],
      },
    })
  })

  it('appends derived image results and saves the current history item', async () => {
    const derivedImage = generatedImage()
    mockState.persistGeneratedImagesFromResponse.mockResolvedValueOnce([derivedImage])
    mockState.saveCurrentChat.mockResolvedValueOnce('history-1')
    const sourceImage = generatedImage()
    const chatStore = useChatStore()
    chatStore.addMessage({
      type: 'user',
      content: 'make a landscape',
      status: 'success',
    })
    const sourceMessage = chatStore.addMessage({
      type: 'assistant',
      content: 'done',
      status: 'success',
      images: [sourceImage],
    })

    await useChat().appendDerivedImageResult(imageResponse(), {
      content: 'variationGenerated',
      idPrefix: 'variation',
      prompt: 'make it snowy',
      generationOptions: {
        size: '1024x1024',
        quality: 'medium',
        n: 1,
      },
      sourceImage,
      sourceMessageId: sourceMessage.id,
    })

    expect(mockState.persistGeneratedImagesFromResponse).toHaveBeenCalledWith(imageResponse(), {
      idPrefix: 'variation',
      sourcePrompt: 'make it snowy',
      sourceMessageId: sourceMessage.id,
    })
    expect(chatStore.messages.at(-1)).toMatchObject({
      type: 'assistant',
      content: 'variationGenerated',
      status: 'success',
      images: [derivedImage],
      generation: {
        prompt: 'make it snowy',
        size: '1024x1024',
        quality: 'medium',
        n: 1,
        attachmentIds: [sourceImage.id],
        attachments: [expect.objectContaining({ id: sourceImage.id })],
      },
    })
    expect(mockState.saveCurrentChat).toHaveBeenCalledTimes(1)
  })

  it('cancels an active generation before loading a different history item', async () => {
    let rejectGeneration: (error: Error) => void = () => undefined
    mockState.generateImage.mockReturnValueOnce(
      new Promise<GeneratedImage[]>((_, reject) => {
        rejectGeneration = reject
      }),
    )
    mockState.saveCurrentChat.mockResolvedValueOnce('current-history')
    mockState.loadHistoryChat.mockResolvedValueOnce([
      {
        id: 'loaded-message',
        type: 'user',
        content: 'loaded',
        timestamp: 1,
        status: 'success',
      },
    ])
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })

    const chat = useChat()
    const chatStore = useChatStore()
    const sendPromise = chat.sendMessage('current prompt', {
      size: 'auto',
      quality: 'auto',
      n: 1,
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(chatStore.isLoading).toBe(true)
    expect(chatStore.messages[1]).toMatchObject({
      type: 'assistant',
      status: 'pending',
    })

    await chat.loadChat('target-history')

    expect(mockState.cancelGeneration).toHaveBeenCalledTimes(1)
    expect(chatStore.isLoading).toBe(false)
    expect(chatStore.messages[1]).toMatchObject({
      type: 'assistant',
      status: 'error',
    })
    expect(mockState.cancelGeneration.mock.invocationCallOrder[0]).toBeLessThan(
      mockState.saveCurrentChat.mock.invocationCallOrder[0],
    )
    expect(mockState.saveCurrentChat).toHaveBeenCalledWith(null)
    expect(mockState.loadHistoryChat).toHaveBeenCalledWith('target-history')

    rejectGeneration(new Error('请求已取消'))
    await sendPromise
  })

  it('does not cancel when loading a history item without an active generation', async () => {
    mockState.loadHistoryChat.mockResolvedValueOnce([
      {
        id: 'loaded-message',
        type: 'user',
        content: 'loaded',
        timestamp: 1,
        status: 'success',
      },
    ])

    await useChat().loadChat('target-history')

    expect(mockState.cancelGeneration).not.toHaveBeenCalled()
    expect(mockState.loadHistoryChat).toHaveBeenCalledWith('target-history')
  })

  it('cancels an active generation before starting a new chat', async () => {
    let rejectGeneration: (error: Error) => void = () => undefined
    mockState.generateImage.mockReturnValueOnce(
      new Promise<GeneratedImage[]>((_, reject) => {
        rejectGeneration = reject
      }),
    )
    mockState.saveCurrentChat.mockResolvedValueOnce('current-history')
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })

    const chat = useChat()
    const chatStore = useChatStore()
    const sendPromise = chat.sendMessage('current prompt', {
      size: 'auto',
      quality: 'auto',
      n: 1,
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(chatStore.isLoading).toBe(true)

    await chat.startNewChat()

    expect(mockState.cancelGeneration).toHaveBeenCalledTimes(1)
    expect(mockState.saveCurrentChat).toHaveBeenCalledWith(null)
    expect(chatStore.isLoading).toBe(false)
    expect(chatStore.messages).toHaveLength(0)

    rejectGeneration(new Error('请求已取消'))
    await sendPromise
  })

  it('saves the current conversation before loading a different history item', async () => {
    mockState.generateImage.mockResolvedValueOnce([generatedImage()])
    mockState.saveCurrentChat
      .mockResolvedValueOnce('current-history')
      .mockResolvedValueOnce('current-history')
    mockState.loadHistoryChat.mockResolvedValueOnce([
      {
        id: 'loaded-message',
        type: 'user',
        content: 'loaded',
        timestamp: 1,
        status: 'success',
      },
    ])
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })

    const chat = useChat()
    await chat.sendMessage('current prompt', {
      size: 'auto',
      quality: 'auto',
      n: 1,
    })
    await chat.loadChat('target-history')

    expect(mockState.saveCurrentChat.mock.calls[1]).toEqual(['current-history'])
    expect(mockState.saveCurrentChat.mock.invocationCallOrder[1]).toBeLessThan(
      mockState.loadHistoryChat.mock.invocationCallOrder[0],
    )
    expect(mockState.loadHistoryChat).toHaveBeenCalledWith('target-history')
  })
})
