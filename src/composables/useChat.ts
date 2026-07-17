import { useChatStore } from '../stores/chat'
import { useImageGeneration } from '../composables/useImageGeneration'
import { useConfigStore } from '../stores/config'
import { useHistory } from '../composables/useHistory'
import type {
  ChatAttachment,
  ChatInputAttachment,
  ChatMessage,
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
import { imageStorageIdentity } from '../utils/imagePersistence'
import { deleteUnreferencedLocalImages } from '../platform/imageReferenceCleanup'
import i18n from '../i18n'

let activeGenerationToken: symbol | null = null

export function useChat() {
  const chatStore = useChatStore()
  const configStore = useConfigStore()
  const { generateImage, cancelGeneration } = useImageGeneration()
  const { saveCurrentChat, ensureCurrentChatInHistory, loadHistoryChat, hydrateHistoryList } =
    useHistory()
  const t = i18n.global.t

  function requireChatMessageWritesAvailable(): void {
    if (chatStore.isImportingMessages) {
      throw new Error('Chat messages cannot be changed while an import is in progress')
    }
  }

  function canCommitGeneration(token: symbol, messageId: string): boolean {
    return (
      activeGenerationToken === token &&
      chatStore.messages.some((message) => message.id === messageId && message.status === 'pending')
    )
  }

  async function discardGeneratedImages(images: GeneratedImage[]): Promise<void> {
    const referencedKeys = new Set(
      chatStore.messages
        .flatMap((message) => [
          ...(message.attachments || []),
          ...(message.images || []),
          ...(message.generation?.attachments || []),
        ])
        .map(imageStorageIdentity),
    )
    const discardedImages = images.filter(
      (image) => !referencedKeys.has(imageStorageIdentity(image)),
    )
    if (discardedImages.length === 0) return

    discardedImages.forEach((image) => {
      if (image.url.startsWith('blob:')) {
        URL.revokeObjectURL(image.url)
      }
    })

    try {
      await deleteUnreferencedLocalImages(discardedImages)
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
      try {
        await chatStore.setMessageErrorInMemory(messageId, errorMessage)
      } catch (error) {
        console.warn('Failed to mark a message after a persistence error:', error)
      }
    }
    await discardGeneratedImages(images)
  }

  async function markGenerationFailure(messageId: string, errorMessage: string): Promise<void> {
    try {
      await chatStore.setMessageError(messageId, errorMessage)
    } catch (error) {
      if (isPersistenceError(error)) {
        await chatStore.setMessageErrorInMemory(messageId, t('persistenceFailed'))
      }
      throw error
    }
  }

  async function persistInputAttachments(
    attachments: ChatInputAttachment[],
    prompt: string,
  ): Promise<{ attachments: ChatAttachment[]; persistedAttachments: ChatAttachment[] }> {
    const persistedAttachments: ChatAttachment[] = []
    const newlyPersistedAttachments: ChatAttachment[] = []

    try {
      for (const attachment of attachments) {
        if (attachment instanceof File) {
          const [persisted] = await persistChatAttachments([attachment], { sourcePrompt: prompt })
          if (persisted) {
            persistedAttachments.push(persisted)
            newlyPersistedAttachments.push(persisted)
          }
        } else {
          persistedAttachments.push(attachment)
        }
      }
    } catch (error) {
      await discardGeneratedImages(newlyPersistedAttachments)
      throw error
    }

    return {
      attachments: persistedAttachments,
      persistedAttachments: newlyPersistedAttachments,
    }
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
    requireChatMessageWritesAvailable()
    const images = await persistGeneratedImagesFromResponse(response, {
      idPrefix: options.idPrefix,
      sourcePrompt: options.prompt,
      sourceMessageId: options.sourceMessageId,
    })

    let message: ChatMessage
    try {
      message = await chatStore.addMessage({
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
    } catch (error) {
      await discardGeneratedImages(images)
      throw error
    }

    try {
      chatStore.setCurrentHistoryId(await saveCurrentChat(chatStore.currentHistoryId))
    } catch (error) {
      if (isPersistenceError(error)) {
        await markPersistenceFailure(message.id, images)
      }
      throw error
    }
  }

  async function sendMessage(
    content: string,
    options: GenerationOptions,
    inputAttachments: ChatInputAttachment[] = [],
  ): Promise<void> {
    requireChatMessageWritesAvailable()
    if (!configStore.isConfigured) {
      throw new Error(t('configureApiFirst'))
    }

    if (!content.trim()) {
      throw new Error(t('enterImageDescription'))
    }

    if (chatStore.isLoading) return

    const generationOptions = normalizeGenerationOptions(options)
    const generationToken = Symbol('generation')
    activeGenerationToken = generationToken
    chatStore.setLoading(true)

    try {
      const { attachments, persistedAttachments } = await persistInputAttachments(
        inputAttachments,
        content,
      )

      if (activeGenerationToken !== generationToken) {
        await discardGeneratedImages(persistedAttachments)
        return
      }

      try {
        requireChatMessageWritesAvailable()
      } catch (error) {
        await discardGeneratedImages(persistedAttachments)
        throw error
      }

      const generation = createGenerationMetadata(content, generationOptions, attachments)
      let assistantMessage: ChatMessage

      try {
        const createdMessages = await chatStore.addMessages([
          {
            type: 'user',
            content,
            attachments: attachments.length > 0 ? attachments : undefined,
            status: 'success',
          },
          {
            type: 'assistant',
            content: t('generationInProgress'),
            generation,
            status: 'pending',
          },
        ])
        assistantMessage = createdMessages[1]
      } catch (error) {
        await discardGeneratedImages(persistedAttachments)
        throw error
      }

      if (activeGenerationToken !== generationToken) {
        const currentMessage = chatStore.messages.find(
          (message) => message.id === assistantMessage.id,
        )
        if (currentMessage?.status === 'pending') {
          await chatStore.setMessageCanceled(assistantMessage.id, t('canceled'))
        }
        return
      }

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
        chatStore.setCurrentHistoryId(await saveCurrentChat(chatStore.currentHistoryId))
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
      }
    } finally {
      if (activeGenerationToken === generationToken) {
        activeGenerationToken = null
      }
      if (!activeGenerationToken) {
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
    requireChatMessageWritesAvailable()
    if (!configStore.isConfigured) {
      throw new Error(t('configureApiFirst'))
    }

    if (!content.trim()) {
      throw new Error(t('enterImageDescription'))
    }

    const retryTarget = chatStore.messages.find((message) => message.id === messageId)
    if (!retryTarget || retryTarget.type !== 'assistant') return
    if (chatStore.isLoading) return

    const generationOptions = normalizeGenerationOptions(options)
    const generation = createGenerationMetadata(content, generationOptions, attachments)
    const generationToken = Symbol('generation')
    activeGenerationToken = generationToken
    chatStore.setLoading(true)

    try {
      await chatStore.updateMessage(messageId, {
        content: t('generationInProgress'),
        generation,
        status: 'pending',
        error: undefined,
        images: undefined,
      })
      if (activeGenerationToken !== generationToken) {
        const currentMessage = chatStore.messages.find((message) => message.id === messageId)
        if (currentMessage?.status === 'pending') {
          await chatStore.setMessageCanceled(messageId, t('canceled'))
        }
        return
      }
      if (!canCommitGeneration(generationToken, messageId)) return
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
        chatStore.setCurrentHistoryId(await saveCurrentChat(chatStore.currentHistoryId))
      } catch (error) {
        if (activeGenerationToken !== generationToken) {
          if (generatedImages.length > 0) {
            await discardGeneratedImages(generatedImages)
          }
          return
        }

        if (isImageGenerationCanceledError(error)) {
          await chatStore.setMessageCanceled(messageId, t('canceled'))
          chatStore.setCurrentHistoryId(await saveCurrentChat(chatStore.currentHistoryId))
          return
        }

        if (isPersistenceError(error)) {
          await markPersistenceFailure(messageId, generatedImages)
          throw error
        }

        const errorMessage = error instanceof Error ? error.message : t('generationFailed')
        await markGenerationFailure(messageId, errorMessage)
        chatStore.setCurrentHistoryId(await saveCurrentChat(chatStore.currentHistoryId))
        throw error
      }
    } finally {
      if (activeGenerationToken === generationToken) {
        activeGenerationToken = null
      }
      if (!activeGenerationToken) {
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
    requireChatMessageWritesAvailable()
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
      assistantMessage ??
      (await chatStore.addMessage({
        type: 'assistant',
        content: t('generationInProgress'),
        status: 'pending',
      }))

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

    try {
      await chatStore.cancelLastPendingMessage(t('canceled'))
    } catch (error) {
      const lastPendingMessage = [...chatStore.messages]
        .reverse()
        .find((message) => message.type === 'assistant' && message.status === 'pending')
      if (isPersistenceError(error) && lastPendingMessage) {
        await chatStore.setMessageErrorInMemory(lastPendingMessage.id, t('persistenceFailed'))
      }
      throw error
    } finally {
      if (!activeGenerationToken) {
        chatStore.setLoading(false)
      }
    }
  }

  async function cancelActiveGenerationBeforeLeavingChat(): Promise<void> {
    if (!chatStore.isLoading) return
    await cancelCurrentGeneration()
  }

  async function clearChat(): Promise<void> {
    requireChatMessageWritesAvailable()
    await chatStore.clearMessages()
    chatStore.setCurrentHistoryId(null)
  }

  // 开始新对话
  async function startNewChat(): Promise<void> {
    requireChatMessageWritesAvailable()
    await cancelActiveGenerationBeforeLeavingChat()

    // 保存当前对话
    if (chatStore.messages.length > 0) {
      chatStore.setCurrentHistoryId(await saveCurrentChat(chatStore.currentHistoryId))
    }
    // 清空当前消息
    await chatStore.clearMessages()
    chatStore.setCurrentHistoryId(null)
  }

  // 加载历史对话
  async function loadChat(historyId: string): Promise<boolean> {
    requireChatMessageWritesAvailable()
    if (chatStore.currentHistoryId !== historyId) {
      await cancelActiveGenerationBeforeLeavingChat()
    }

    if (chatStore.messages.length > 0 && chatStore.currentHistoryId !== historyId) {
      chatStore.setCurrentHistoryId(await saveCurrentChat(chatStore.currentHistoryId))
    }

    const messages = await loadHistoryChat(historyId)
    if (messages) {
      chatStore.setCurrentHistoryId(historyId)
      return true
    }
    return false
  }

  // 获取当前历史记录 ID
  function getCurrentHistoryId(): string | null {
    return chatStore.currentHistoryId
  }

  async function ensureCurrentChatSaved(): Promise<string | null> {
    requireChatMessageWritesAvailable()
    chatStore.setCurrentHistoryId(await ensureCurrentChatInHistory(chatStore.currentHistoryId))
    return chatStore.currentHistoryId
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
