import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChat } from '../../composables/useChat'
import { useChatStore } from '../../stores/chat'
import { useConfigStore } from '../../stores/config'
import { ImageGenerationCanceledError } from '../../services/api'
import { PersistenceError } from '../../utils/storage'
import type {
  ChatAttachment,
  ChatMessage,
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
  deleteUnreferencedLocalImages: vi.fn(),
  setWebCurrentMessages: vi.fn(),
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
  deleteUnreferencedLocalImages: mockState.deleteUnreferencedLocalImages,
}))

vi.mock('../../platform/webPersistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/webPersistence')>()),
  setWebCurrentMessages: mockState.setWebCurrentMessages,
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
    mockState.deleteUnreferencedLocalImages.mockReset()
    mockState.deleteUnreferencedLocalImages.mockResolvedValue(undefined)
    mockState.setWebCurrentMessages.mockReset()
    mockState.setWebCurrentMessages.mockResolvedValue(undefined)
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    await useChatStore().hydrateFromPersistence()
    await useChat().clearChat()
  })

  it('retries an assistant message without appending new chat messages and saves the result', async () => {
    mockState.generateImage.mockResolvedValueOnce([generatedImage()])
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    const chatStore = useChatStore()
    const userMessage = await chatStore.addMessage({
      type: 'user',
      content: 'a quiet mountain lake',
      status: 'success',
    })
    const assistantMessage = await chatStore.addMessage({
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
    expect(mockState.saveCurrentChat).toHaveBeenCalledTimes(1)
  })

  it('does not call the image API when the retry target no longer exists', async () => {
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    const chatStore = useChatStore()

    await expect(
      useChat().retryMessage('missing-message', 'retry stale message', {
        size: 'auto',
        quality: 'auto',
        n: 1,
      }),
    ).resolves.toBeUndefined()

    expect(mockState.generateImage).not.toHaveBeenCalled()
    expect(chatStore.messages).toEqual([])
    expect(chatStore.isLoading).toBe(false)
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
    const assistantMessage = await chatStore.addMessage({
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

  it('ignores a concurrent send while the first send is persisting attachments', async () => {
    let finishAttachmentPersistence: (attachments: ChatAttachment[]) => void = () => undefined
    mockState.persistChatAttachments.mockReturnValueOnce(
      new Promise<ChatAttachment[]>((resolve) => {
        finishAttachmentPersistence = resolve
      }),
    )
    mockState.generateImage.mockResolvedValue([generatedImage()])
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    const chat = useChat()
    const firstSend = chat.sendMessage('first prompt', { size: 'auto', quality: 'auto', n: 1 }, [
      new File(['reference'], 'reference.png', { type: 'image/png' }),
    ])
    const secondSend = chat.sendMessage('second prompt', {
      size: 'auto',
      quality: 'auto',
      n: 1,
    })

    finishAttachmentPersistence([attachment()])
    await Promise.all([firstSend, secondSend])

    expect(mockState.generateImage).toHaveBeenCalledTimes(1)
    expect(mockState.generateImage).toHaveBeenCalledWith(
      'first prompt',
      { size: 'auto', quality: 'auto', n: 1 },
      [attachment()],
    )
    expect(chat.chatStore.messages).toHaveLength(2)
    expect(chat.chatStore.messages[0]).toMatchObject({ content: 'first prompt' })
    expect(chat.chatStore.messages[1]).toMatchObject({ status: 'success' })
    expect(chat.chatStore.isLoading).toBe(false)
  })

  it('rejects after marking the assistant message as failed when generation fails', async () => {
    mockState.generateImage.mockRejectedValueOnce(new Error('image service unavailable'))
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })

    const { sendMessage } = useChat()
    const chatStore = useChatStore()

    await expect(
      sendMessage('a broken generation', {
        size: 'auto',
        quality: 'auto',
        n: 1,
      }),
    ).rejects.toThrow('image service unavailable')

    expect(chatStore.messages).toHaveLength(2)
    expect(chatStore.messages[1]).toMatchObject({
      type: 'assistant',
      status: 'error',
      error: 'image service unavailable',
    })
    expect(chatStore.isLoading).toBe(false)
  })

  it('resolves after marking the assistant message as canceled when generation is canceled', async () => {
    mockState.generateImage.mockRejectedValueOnce(new ImageGenerationCanceledError())
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })

    const { sendMessage } = useChat()
    const chatStore = useChatStore()

    await expect(
      sendMessage('cancel this generation', {
        size: 'auto',
        quality: 'auto',
        n: 1,
      }),
    ).resolves.toBeUndefined()

    expect(chatStore.messages).toHaveLength(2)
    expect(chatStore.messages[1]).toMatchObject({
      type: 'assistant',
      status: 'canceled',
      content: 'Canceled',
    })
    expect(chatStore.isLoading).toBe(false)
  })

  it('keeps a canceled message canceled when a late generation result resolves', async () => {
    let resolveGeneration: (images: GeneratedImage[]) => void = () => undefined
    mockState.generateImage.mockReturnValueOnce(
      new Promise<GeneratedImage[]>((resolve) => {
        resolveGeneration = resolve
      }),
    )
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    const chat = useChat()
    const chatStore = useChatStore()
    const sendPromise = chat.sendMessage('cancel late result', {
      size: 'auto',
      quality: 'auto',
      n: 1,
    })
    await vi.waitFor(() => expect(mockState.generateImage).toHaveBeenCalledOnce())

    await chat.cancelCurrentGeneration()
    resolveGeneration([generatedImage()])
    await expect(sendPromise).resolves.toBeUndefined()

    expect(chatStore.messages[1]).toMatchObject({ status: 'canceled' })
    expect(chatStore.messages[1].images).toBeUndefined()
    expect(mockState.deleteUnreferencedLocalImages).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'image-1' }),
    ])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:image-1')
  })

  it('does not let a canceled operation clear loading for a newer generation', async () => {
    let resolveFirst: (images: GeneratedImage[]) => void = () => undefined
    let resolveSecond: (images: GeneratedImage[]) => void = () => undefined
    mockState.generateImage
      .mockReturnValueOnce(
        new Promise<GeneratedImage[]>((resolve) => {
          resolveFirst = resolve
        }),
      )
      .mockReturnValueOnce(
        new Promise<GeneratedImage[]>((resolve) => {
          resolveSecond = resolve
        }),
      )
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    const chat = useChat()
    const firstPromise = chat.sendMessage('first prompt', {
      size: 'auto',
      quality: 'auto',
      n: 1,
    })
    await vi.waitFor(() => expect(mockState.generateImage).toHaveBeenCalledTimes(1))
    await chat.cancelCurrentGeneration()

    const secondPromise = chat.sendMessage('second prompt', {
      size: 'auto',
      quality: 'auto',
      n: 1,
    })
    await vi.waitFor(() => expect(mockState.generateImage).toHaveBeenCalledTimes(2))
    resolveFirst([{ ...generatedImage(), id: 'first-image', url: 'blob:first-image' }])
    await expect(firstPromise).resolves.toBeUndefined()

    expect(chat.chatStore.isLoading).toBe(true)
    expect(chat.chatStore.messages.at(-1)).toMatchObject({ status: 'pending' })

    resolveSecond([{ ...generatedImage(), id: 'second-image', url: 'blob:second-image' }])
    await expect(secondPromise).resolves.toBeUndefined()
    expect(chat.chatStore.isLoading).toBe(false)
    expect(chat.chatStore.messages.at(-1)).toMatchObject({
      status: 'success',
      images: [expect.objectContaining({ id: 'second-image' })],
    })
  })

  it('marks a completed generation as failed and discards images when persistence fails', async () => {
    mockState.generateImage.mockResolvedValueOnce([generatedImage()])
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockState.setWebCurrentMessages
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new PersistenceError('Failed to save chat history'))
    const chatStore = useChatStore()

    await expect(
      useChat().sendMessage('cannot persist result', {
        size: 'auto',
        quality: 'auto',
        n: 1,
      }),
    ).rejects.toBeInstanceOf(PersistenceError)

    expect(chatStore.messages[1]).toMatchObject({
      status: 'error',
      error: 'Unable to save changes locally. Check storage space and try again.',
    })
    expect(chatStore.messages[1].images).toBeUndefined()
    expect(mockState.deleteUnreferencedLocalImages).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'image-1' }),
    ])
    consoleError.mockRestore()
  })

  it('does not start generation when the initial message batch cannot be persisted', async () => {
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    mockState.setWebCurrentMessages.mockRejectedValueOnce(
      new PersistenceError('Failed to save chat history'),
    )
    const persistedAttachment = attachment()
    mockState.persistChatAttachments.mockResolvedValueOnce([persistedAttachment])

    await expect(
      useChat().sendMessage(
        'cannot persist prompt',
        {
          size: 'auto',
          quality: 'auto',
          n: 1,
        },
        [new File(['reference'], 'reference.png', { type: 'image/png' })],
      ),
    ).rejects.toBeInstanceOf(PersistenceError)

    expect(useChatStore().messages).toEqual([])
    expect(mockState.generateImage).not.toHaveBeenCalled()
    expect(mockState.deleteUnreferencedLocalImages).toHaveBeenCalledWith([persistedAttachment])
  })

  it('rejects import while the initial message batch is still being persisted', async () => {
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    let markSaveStarted: () => void = () => undefined
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve
    })
    let rejectSave: (error: Error) => void = () => undefined
    mockState.setWebCurrentMessages.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject
          markSaveStarted()
        }),
    )
    const chatStore = useChatStore()
    const sendPromise = useChat().sendMessage('persist before generating', {
      size: 'auto',
      quality: 'auto',
      n: 1,
    })
    await saveStarted

    await expect(chatStore.importMessages([], 'replace')).rejects.toThrow(
      'generation is in progress',
    )
    rejectSave(new PersistenceError('Failed to save chat history'))
    await expect(sendPromise).rejects.toBeInstanceOf(PersistenceError)

    expect(mockState.generateImage).not.toHaveBeenCalled()
    expect(chatStore.messages).toEqual([])
    expect(chatStore.isLoading).toBe(false)
  })

  it('keeps import blocked until an initial send cancellation is persisted', async () => {
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    let markSaveStarted: () => void = () => undefined
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve
    })
    let finishSave: () => void = () => undefined
    mockState.setWebCurrentMessages.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
          markSaveStarted()
        }),
    )
    const chat = useChat()
    const chatStore = useChatStore()
    const sendPromise = chat.sendMessage('cancel before persistence finishes', {
      size: 'auto',
      quality: 'auto',
      n: 1,
    })
    await saveStarted

    const cancelPromise = chat.cancelCurrentGeneration()
    expect(chatStore.isLoading).toBe(true)
    await expect(chatStore.importMessages([], 'replace')).rejects.toThrow(
      'generation is in progress',
    )

    finishSave()
    await Promise.all([cancelPromise, sendPromise])
    expect(mockState.generateImage).not.toHaveBeenCalled()
    expect(chatStore.messages[1]).toMatchObject({ status: 'canceled' })
    expect(chatStore.isLoading).toBe(false)
    await expect(chatStore.importMessages([], 'replace')).resolves.toBeUndefined()
  })

  it('rolls back the pending retry state and skips generation when persistence fails', async () => {
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    const chatStore = useChatStore()
    const assistantMessage = await chatStore.addMessage({
      type: 'assistant',
      content: 'previous failure',
      status: 'error',
      error: 'previous failure',
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockState.setWebCurrentMessages.mockRejectedValue(
      new PersistenceError('Failed to save chat history'),
    )

    await expect(
      useChat().retryMessage(assistantMessage.id, 'retry without storage', {
        size: 'auto',
        quality: 'auto',
        n: 1,
      }),
    ).rejects.toBeInstanceOf(PersistenceError)

    expect(chatStore.messages[0]).toMatchObject({
      content: 'previous failure',
      status: 'error',
      error: 'previous failure',
    })
    expect(mockState.generateImage).not.toHaveBeenCalled()
    expect(chatStore.isLoading).toBe(false)
    consoleError.mockRestore()
  })

  it('rejects import while a retry pending state is still being persisted', async () => {
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    const chatStore = useChatStore()
    const assistantMessage = await chatStore.addMessage({
      type: 'assistant',
      content: 'previous failure',
      status: 'error',
      error: 'previous failure',
    })
    let markSaveStarted: () => void = () => undefined
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve
    })
    let rejectSave: (error: Error) => void = () => undefined
    mockState.setWebCurrentMessages.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject
          markSaveStarted()
        }),
    )
    const retryPromise = useChat().retryMessage(assistantMessage.id, 'retry after save', {
      size: 'auto',
      quality: 'auto',
      n: 1,
    })
    await saveStarted

    await expect(chatStore.importMessages([], 'replace')).rejects.toThrow(
      'generation is in progress',
    )
    rejectSave(new PersistenceError('Failed to save chat history'))
    await expect(retryPromise).rejects.toBeInstanceOf(PersistenceError)

    expect(mockState.generateImage).not.toHaveBeenCalled()
    expect(chatStore.messages[0]).toMatchObject({
      content: 'previous failure',
      status: 'error',
      error: 'previous failure',
    })
    expect(chatStore.isLoading).toBe(false)
  })

  it('keeps import blocked until an initial retry cancellation is persisted', async () => {
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    const chatStore = useChatStore()
    const assistantMessage = await chatStore.addMessage({
      type: 'assistant',
      content: 'previous failure',
      status: 'error',
      error: 'previous failure',
    })
    let markSaveStarted: () => void = () => undefined
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve
    })
    let finishSave: () => void = () => undefined
    mockState.setWebCurrentMessages.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
          markSaveStarted()
        }),
    )
    const chat = useChat()
    const retryPromise = chat.retryMessage(assistantMessage.id, 'cancel retry', {
      size: 'auto',
      quality: 'auto',
      n: 1,
    })
    await saveStarted

    const cancelPromise = chat.cancelCurrentGeneration()
    expect(chatStore.isLoading).toBe(true)
    await expect(chatStore.importMessages([], 'replace')).rejects.toThrow(
      'generation is in progress',
    )

    finishSave()
    await Promise.all([cancelPromise, retryPromise])
    expect(mockState.generateImage).not.toHaveBeenCalled()
    expect(chatStore.messages[0]).toMatchObject({ status: 'canceled' })
    expect(chatStore.isLoading).toBe(false)
  })

  it('rejects retry failures after saving the failed assistant message', async () => {
    mockState.generateImage.mockRejectedValueOnce(new Error('retry failed'))
    const configStore = useConfigStore()
    await configStore.saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
    const chatStore = useChatStore()
    const assistantMessage = await chatStore.addMessage({
      type: 'assistant',
      content: '生成失败',
      status: 'error',
      error: '生成失败',
    })

    await expect(
      useChat().retryMessage(assistantMessage.id, 'try again', {
        size: 'auto',
        quality: 'auto',
        n: 1,
      }),
    ).rejects.toThrow('retry failed')

    expect(chatStore.messages[0]).toMatchObject({
      id: assistantMessage.id,
      status: 'error',
      error: 'retry failed',
    })
    expect(mockState.saveCurrentChat).toHaveBeenCalledTimes(1)
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
    const userMessage = await chatStore.addMessage({
      type: 'user',
      content: 'old prompt',
      status: 'success',
    })
    const assistantMessage = await chatStore.addMessage({
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
    const userMessage = await chatStore.addMessage({
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
    await chatStore.addMessage({
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
    await chatStore.addMessage({
      type: 'user',
      content: 'make a landscape',
      status: 'success',
    })
    const sourceMessage = await chatStore.addMessage({
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

  it('marks a derived result as failed and discards it when history persistence fails', async () => {
    const derivedImage = generatedImage()
    mockState.persistGeneratedImagesFromResponse.mockResolvedValueOnce([derivedImage])
    mockState.saveCurrentChat.mockRejectedValueOnce(new PersistenceError('history save failed'))
    const chatStore = useChatStore()

    await expect(
      useChat().appendDerivedImageResult(imageResponse(), {
        content: 'variationGenerated',
        idPrefix: 'variation',
        prompt: 'make it snowy',
        generationOptions: {
          size: '1024x1024',
          quality: 'medium',
          n: 1,
        },
      }),
    ).rejects.toBeInstanceOf(PersistenceError)

    expect(chatStore.messages.at(-1)).toMatchObject({
      status: 'error',
      error: 'Unable to save changes locally. Check storage space and try again.',
    })
    expect(chatStore.messages.at(-1)?.images).toBeUndefined()
    const persistedMessages = mockState.setWebCurrentMessages.mock.calls.at(-1)?.[0] as
      | ChatMessage[]
      | undefined
    expect(persistedMessages?.at(-1)).toMatchObject({
      status: 'error',
      error: 'Unable to save changes locally. Check storage space and try again.',
    })
    expect(persistedMessages?.at(-1)?.images).toBeUndefined()
    expect(mockState.deleteUnreferencedLocalImages).toHaveBeenCalledWith([derivedImage])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:image-1')
  })

  it('discards a derived image when its message cannot be persisted', async () => {
    const derivedImage = generatedImage()
    mockState.persistGeneratedImagesFromResponse.mockResolvedValueOnce([derivedImage])
    mockState.setWebCurrentMessages.mockRejectedValueOnce(
      new PersistenceError('Failed to save chat history'),
    )

    await expect(
      useChat().appendDerivedImageResult(imageResponse(), {
        content: 'variationGenerated',
        idPrefix: 'variation',
        prompt: 'make it snowy',
        generationOptions: {
          size: '1024x1024',
          quality: 'medium',
          n: 1,
        },
      }),
    ).rejects.toBeInstanceOf(PersistenceError)

    expect(useChatStore().messages).toEqual([])
    expect(mockState.deleteUnreferencedLocalImages).toHaveBeenCalledWith([derivedImage])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:image-1')
  })

  it('runs a concurrent update after a failed derived message has rolled back', async () => {
    const derivedImage = generatedImage()
    mockState.persistGeneratedImagesFromResponse.mockResolvedValueOnce([derivedImage])
    let markFirstSaveStarted: () => void = () => undefined
    const firstSaveStarted = new Promise<void>((resolve) => {
      markFirstSaveStarted = resolve
    })
    let rejectFirstSave: (error: Error) => void = () => undefined
    mockState.setWebCurrentMessages.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectFirstSave = reject
          markFirstSaveStarted()
        }),
    )

    const chatStore = useChatStore()
    const appendPromise = useChat().appendDerivedImageResult(imageResponse(), {
      content: 'variationGenerated',
      idPrefix: 'variation',
      prompt: 'make it snowy',
      generationOptions: {
        size: '1024x1024',
        quality: 'medium',
        n: 1,
      },
    })
    await firstSaveStarted
    const retainedMessage = chatStore.messages.at(-1)
    if (!retainedMessage) throw new Error('Expected the derived message to be applied in memory')
    const favoritePromise = chatStore.setFavorite(retainedMessage.id, true)

    rejectFirstSave(new PersistenceError('Failed to save chat history'))
    await expect(appendPromise).rejects.toBeInstanceOf(PersistenceError)
    await expect(favoritePromise).resolves.toBeUndefined()

    expect(chatStore.messages).toEqual([])
    expect(mockState.deleteUnreferencedLocalImages).toHaveBeenCalledWith([derivedImage])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:image-1')
  })

  it('discards a derived image when an import starts before its message is added', async () => {
    const derivedImage = generatedImage()
    let finishImagePersistence: (images: GeneratedImage[]) => void = () => undefined
    mockState.persistGeneratedImagesFromResponse.mockReturnValueOnce(
      new Promise<GeneratedImage[]>((resolve) => {
        finishImagePersistence = resolve
      }),
    )
    const chatStore = useChatStore()
    const appendPromise = useChat().appendDerivedImageResult(imageResponse(), {
      content: 'variationGenerated',
      idPrefix: 'variation',
      prompt: 'make it snowy',
      generationOptions: {
        size: '1024x1024',
        quality: 'medium',
        n: 1,
      },
    })
    await vi.waitFor(() =>
      expect(mockState.persistGeneratedImagesFromResponse).toHaveBeenCalledTimes(1),
    )

    let finishImport: () => void = () => undefined
    const importGate = new Promise<void>((resolve) => {
      finishImport = resolve
    })
    const importPromise = chatStore.runMessageImport(async () => {
      await importGate
    })
    await vi.waitFor(() => expect(chatStore.isImportingMessages).toBe(true))

    finishImagePersistence([derivedImage])
    await expect(appendPromise).rejects.toThrow('import is in progress')
    expect(mockState.deleteUnreferencedLocalImages).toHaveBeenCalledWith([derivedImage])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:image-1')

    finishImport()
    await expect(importPromise).resolves.toBeUndefined()
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
    await vi.waitFor(() => expect(mockState.generateImage).toHaveBeenCalledOnce())
    expect(chatStore.messages[1]).toMatchObject({
      type: 'assistant',
      status: 'pending',
    })

    await chat.loadChat('target-history')

    expect(mockState.cancelGeneration).toHaveBeenCalledTimes(1)
    expect(chatStore.isLoading).toBe(false)
    expect(chatStore.messages[1]).toMatchObject({
      type: 'assistant',
      status: 'canceled',
    })
    expect(mockState.cancelGeneration.mock.invocationCallOrder[0]).toBeLessThan(
      mockState.saveCurrentChat.mock.invocationCallOrder[0],
    )
    expect(mockState.saveCurrentChat).toHaveBeenCalledWith(null)
    expect(mockState.loadHistoryChat).toHaveBeenCalledWith('target-history')

    rejectGeneration(new ImageGenerationCanceledError())
    await expect(sendPromise).resolves.toBeUndefined()
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
    await vi.waitFor(() => expect(mockState.generateImage).toHaveBeenCalledOnce())

    await chat.startNewChat()

    expect(mockState.cancelGeneration).toHaveBeenCalledTimes(1)
    expect(mockState.saveCurrentChat).toHaveBeenCalledWith(null)
    expect(chatStore.isLoading).toBe(false)
    expect(chatStore.messages).toHaveLength(0)

    rejectGeneration(new ImageGenerationCanceledError())
    await expect(sendPromise).resolves.toBeUndefined()
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
