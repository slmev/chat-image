import { useChatStore } from '../stores/chat'
import { useImageGeneration } from '../composables/useImageGeneration'
import { useConfigStore } from '../stores/config'
import { useHistory } from '../composables/useHistory'
import type {
  ChatAttachment,
  ChatInputAttachment,
  GeneratedImage,
  GenerationMetadata,
  GenerationOptions,
  ImageGenerationResponse,
} from '../types'
import { persistChatAttachments, persistGeneratedImagesFromResponse } from '../utils/images'
import { DEFAULT_GENERATION_OPTIONS, normalizeGenerationOptions } from '../utils/constants'
import { createGenerationMetadata } from '../utils/generation'
import { isImageGenerationCanceledError } from '../services/api'
import { isPersistenceError } from '../utils/storage'
import { deleteUnreferencedLocalImages } from '../platform/imageReferenceCleanup'
import i18n from '../i18n'

// 当前加载或已保存的历史记录 ID。useChat 会被多个组件调用，需要跨实例共享。
let currentHistoryId: string | null = null
let activeGenerationToken: symbol | null = null

export function useChat() {
  const chatStore = useChatStore()
  const configStore = useConfigStore()
  const { generateImage, cancelGeneration } = useImageGeneration()
  const { saveCurrentChat, ensureCurrentChatInHistory, loadHistoryChat, hydrateHistoryList } =
    useHistory()
  const t = i18n.global.t

  function canCommitGeneration(token: symbol, messageId: string): boolean {
    return (
      activeGenerationToken === token &&
      chatStore.messages.some((message) => message.id === messageId && message.status === 'pending')
    )
  }

  async function discardGeneratedImages(images: GeneratedImage[]): Promise<void> {
    images.forEach((image) => {
      if (image.url.startsWith('blob:')) {
        URL.revokeObjectURL(image.url)
      }
    })

    try {
      await deleteUnreferencedLocalImages(images)
    } catch (error) {
      console.warn('Failed to discard generated images:', error)
    }
  }

  async function markPersistenceFailure(
    messageId: string,
    images: GeneratedImage[],
  ): Promise<void> {
    const errorMessage = t('persistenceFailed')
    try {
      await chatStore.updateMessage(messageId, {
        status: 'error',
        error: errorMessage,
        images: undefined,
      })
    } catch {
      chatStore.setMessageErrorInMemory(messageId, errorMessage)
    }
    await discardGeneratedImages(images)
  }

  async function markGenerationFailure(messageId: string, errorMessage: string): Promise<void> {
    try {
      await chatStore.setMessageError(messageId, errorMessage)
    } catch (error) {
      if (isPersistenceError(error)) {
        chatStore.setMessageErrorInMemory(messageId, t('persistenceFailed'))
      }
      throw error
    }
  }

  async function persistInputAttachments(
    attachments: ChatInputAttachment[],
    prompt: string,
  ): Promise<ChatAttachment[]> {
    const persistedAttachments: ChatAttachment[] = []

    for (const attachment of attachments) {
      if (attachment instanceof File) {
        const [persisted] = await persistChatAttachments([attachment], { sourcePrompt: prompt })
        if (persisted) {
          persistedAttachments.push(persisted)
        }
      } else {
        persistedAttachments.push(attachment)
      }
    }

    return persistedAttachments
  }

  function isReusableGenerationAttachment(attachment: ChatAttachment): boolean {
    if (attachment.base64 || attachment.localPath) return true
    return attachment.url.startsWith('data:')
  }

  function reusableGenerationAttachments(attachments: ChatAttachment[]): ChatAttachment[] {
    return attachments.filter(isReusableGenerationAttachment)
  }

  function imageAsAttachment(image: GeneratedImage | null | undefined): ChatAttachment[] {
    if (!image) return []
    return [
      {
        ...image,
        name: `reference-${image.id}.png`,
      },
    ]
  }

  async function appendDerivedImageResult(
    response: ImageGenerationResponse,
    options: {
      content: string
      idPrefix: string
      prompt: string
      generationOptions: GenerationOptions
      sourceImage?: GeneratedImage | null
      sourceMessageId?: string
    },
  ): Promise<void> {
    const images = await persistGeneratedImagesFromResponse(response, {
      idPrefix: options.idPrefix,
      sourcePrompt: options.prompt,
      sourceMessageId: options.sourceMessageId,
    })

    const message = chatStore.addMessage({
      type: 'assistant',
      content: options.content,
      status: 'success',
      images,
      generation: createGenerationMetadata(
        options.prompt,
        options.generationOptions,
        imageAsAttachment(options.sourceImage),
      ),
    })

    try {
      currentHistoryId = await saveCurrentChat(currentHistoryId)
    } catch (error) {
      if (isPersistenceError(error)) {
        chatStore.setMessageErrorInMemory(message.id, t('persistenceFailed'))
        await discardGeneratedImages(images)
      }
      throw error
    }
  }

  async function sendMessage(
    content: string,
    options: GenerationOptions,
    inputAttachments: ChatInputAttachment[] = [],
  ): Promise<void> {
    if (!configStore.isConfigured) {
      throw new Error(t('configureApiFirst'))
    }

    if (!content.trim()) {
      throw new Error(t('enterImageDescription'))
    }

    const generationOptions = normalizeGenerationOptions(options)
    const attachments = await persistInputAttachments(inputAttachments, content)
    const generation = createGenerationMetadata(content, generationOptions, attachments)

    // 添加用户消息
    chatStore.addMessage({
      type: 'user',
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      status: 'success',
    })

    // 添加助手消息（pending 状态）
    const assistantMessage = chatStore.addMessage({
      type: 'assistant',
      content: t('generationInProgress'),
      generation,
      status: 'pending',
    })

    const generationToken = Symbol('generation')
    activeGenerationToken = generationToken
    chatStore.setLoading(true)
    let generatedImages: GeneratedImage[] = []

    try {
      // 生成图片
      generatedImages = (await generateImage(content, generationOptions, attachments)).map(
        (image) => ({
          ...image,
          sourceMessageId: assistantMessage.id,
        }),
      )

      if (!canCommitGeneration(generationToken, assistantMessage.id)) {
        await discardGeneratedImages(generatedImages)
        return
      }

      // 更新助手消息
      await chatStore.addImagesToMessage(assistantMessage.id, generatedImages)

      // 自动保存到历史记录
      currentHistoryId = await saveCurrentChat(currentHistoryId)
    } catch (error) {
      if (activeGenerationToken !== generationToken) {
        if (generatedImages.length > 0) {
          await discardGeneratedImages(generatedImages)
        }
        return
      }

      if (isImageGenerationCanceledError(error)) {
        await chatStore.setMessageCanceled(assistantMessage.id, t('canceled'))
        return
      }

      if (isPersistenceError(error)) {
        await markPersistenceFailure(assistantMessage.id, generatedImages)
        throw error
      }

      // 设置错误状态
      const errorMessage = error instanceof Error ? error.message : t('generationFailed')
      await markGenerationFailure(assistantMessage.id, errorMessage)
      throw error
    } finally {
      if (activeGenerationToken === generationToken) {
        activeGenerationToken = null
        chatStore.setLoading(false)
      }
    }
  }

  async function retryMessage(
    messageId: string,
    content: string,
    options: GenerationOptions,
    attachments: ChatAttachment[] = [],
  ): Promise<void> {
    if (!configStore.isConfigured) {
      throw new Error(t('configureApiFirst'))
    }

    if (!content.trim()) {
      throw new Error(t('enterImageDescription'))
    }

    const generationOptions = normalizeGenerationOptions(options)
    const generation = createGenerationMetadata(content, generationOptions, attachments)

    await chatStore.updateMessage(messageId, {
      content: t('generationInProgress'),
      generation,
      status: 'pending',
      error: undefined,
      images: undefined,
    })
    const generationToken = Symbol('generation')
    activeGenerationToken = generationToken
    chatStore.setLoading(true)
    let generatedImages: GeneratedImage[] = []

    try {
      generatedImages = (await generateImage(content, generationOptions, attachments)).map(
        (image) => ({
          ...image,
          sourceMessageId: messageId,
        }),
      )

      if (!canCommitGeneration(generationToken, messageId)) {
        await discardGeneratedImages(generatedImages)
        return
      }

      await chatStore.addImagesToMessage(messageId, generatedImages)
      currentHistoryId = await saveCurrentChat(currentHistoryId)
    } catch (error) {
      if (activeGenerationToken !== generationToken) {
        if (generatedImages.length > 0) {
          await discardGeneratedImages(generatedImages)
        }
        return
      }

      if (isImageGenerationCanceledError(error)) {
        await chatStore.setMessageCanceled(messageId, t('canceled'))
        currentHistoryId = await saveCurrentChat(currentHistoryId)
        return
      }

      if (isPersistenceError(error)) {
        await markPersistenceFailure(messageId, generatedImages)
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : t('generationFailed')
      await markGenerationFailure(messageId, errorMessage)
      currentHistoryId = await saveCurrentChat(currentHistoryId)
      throw error
    } finally {
      if (activeGenerationToken === generationToken) {
        activeGenerationToken = null
        chatStore.setLoading(false)
      }
    }
  }

  async function retryGeneration(messageId: string, generation: GenerationMetadata): Promise<void> {
    await retryMessage(
      messageId,
      generation.prompt,
      {
        size: generation.size,
        quality: generation.quality,
        n: generation.n,
        ...(generation.style ? { style: generation.style } : {}),
      },
      reusableGenerationAttachments(generation.attachments || []),
    )
  }

  async function editUserPrompt(messageId: string, content: string): Promise<void> {
    const trimmedContent = content.trim()
    if (!trimmedContent) {
      throw new Error(t('enterImageDescription'))
    }

    const messages = chatStore.messages
    const messageIndex = messages.findIndex((message) => message.id === messageId)
    const message = messages[messageIndex]
    if (!message || message.type !== 'user') return

    const assistantMessage = (() => {
      for (let index = messageIndex + 1; index < messages.length; index += 1) {
        const candidate = messages[index]
        if (candidate.type === 'user') return null
        if (candidate.type === 'assistant') return candidate
      }
      return null
    })()

    if (!configStore.isConfigured) {
      throw new Error(t('configureApiFirst'))
    }

    const attachments = (message.attachments || []).map((attachment) => ({
      ...attachment,
      sourcePrompt: trimmedContent,
    }))

    await chatStore.updateMessage(messageId, {
      content: trimmedContent,
      attachments: attachments.length > 0 ? attachments : undefined,
    })

    const targetAssistant =
      assistantMessage ||
      chatStore.addMessage({
        type: 'assistant',
        content: t('generationInProgress'),
        status: 'pending',
      })

    const options = assistantMessage?.generation
      ? {
          size: assistantMessage.generation.size,
          quality: assistantMessage.generation.quality,
          n: assistantMessage.generation.n,
          ...(assistantMessage.generation.style
            ? { style: assistantMessage.generation.style }
            : {}),
        }
      : DEFAULT_GENERATION_OPTIONS

    const candidateAttachments =
      assistantMessage?.generation?.attachments &&
      assistantMessage.generation.attachments.length > 0
        ? assistantMessage.generation.attachments
        : attachments

    await retryMessage(
      targetAssistant.id,
      trimmedContent,
      options,
      reusableGenerationAttachments(candidateAttachments),
    )
  }

  async function cancelCurrentGeneration(): Promise<void> {
    activeGenerationToken = null
    cancelGeneration()
    chatStore.setLoading(false)

    // 更新最后一个 pending 状态的消息为已取消
    const lastPendingMessage = [...chatStore.messages]
      .reverse()
      .find((msg) => msg.type === 'assistant' && msg.status === 'pending')
    if (lastPendingMessage) {
      try {
        await chatStore.setMessageCanceled(lastPendingMessage.id, t('canceled'))
      } catch (error) {
        if (isPersistenceError(error)) {
          chatStore.setMessageErrorInMemory(lastPendingMessage.id, t('persistenceFailed'))
        }
        throw error
      }
    }
  }

  async function cancelActiveGenerationBeforeLeavingChat(): Promise<void> {
    if (!chatStore.isLoading) return
    await cancelCurrentGeneration()
  }

  async function clearChat(): Promise<void> {
    await chatStore.clearMessages()
    currentHistoryId = null
  }

  // 开始新对话
  async function startNewChat(): Promise<void> {
    await cancelActiveGenerationBeforeLeavingChat()

    // 保存当前对话
    if (chatStore.messages.length > 0) {
      currentHistoryId = await saveCurrentChat(currentHistoryId)
    }
    // 清空当前消息
    await chatStore.clearMessages()
    currentHistoryId = null
  }

  // 加载历史对话
  async function loadChat(historyId: string): Promise<boolean> {
    if (currentHistoryId !== historyId) {
      await cancelActiveGenerationBeforeLeavingChat()
    }

    if (chatStore.messages.length > 0 && currentHistoryId !== historyId) {
      currentHistoryId = await saveCurrentChat(currentHistoryId)
    }

    const messages = await loadHistoryChat(historyId)
    if (messages) {
      currentHistoryId = historyId
      return true
    }
    return false
  }

  // 获取当前历史记录 ID
  function getCurrentHistoryId(): string | null {
    return currentHistoryId
  }

  async function ensureCurrentChatSaved(): Promise<string | null> {
    currentHistoryId = await ensureCurrentChatInHistory(currentHistoryId)
    return currentHistoryId
  }

  return {
    chatStore,
    sendMessage,
    retryMessage,
    retryGeneration,
    editUserPrompt,
    appendDerivedImageResult,
    cancelCurrentGeneration,
    clearChat,
    startNewChat,
    loadChat,
    ensureCurrentChatSaved,
    hydrateHistoryList,
    getCurrentHistoryId,
  }
}
