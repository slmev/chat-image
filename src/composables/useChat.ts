import { useChatStore } from '../stores/chat'
import { useImageGeneration } from '../composables/useImageGeneration'
import { useConfigStore } from '../stores/config'
import { useHistory } from '../composables/useHistory'
import type { ChatAttachment, GenerationOptions } from '../types'
import { persistChatAttachments } from '../utils/images'
import i18n from '../i18n'

// 当前加载或已保存的历史记录 ID。useChat 会被多个组件调用，需要跨实例共享。
let currentHistoryId: string | null = null

export function useChat() {
  const chatStore = useChatStore()
  const configStore = useConfigStore()
  const { generateImage, cancelGeneration } = useImageGeneration()
  const { saveCurrentChat, loadHistoryChat } = useHistory()
  const t = i18n.global.t

  async function sendMessage(
    content: string,
    options: GenerationOptions,
    files: File[] = [],
  ): Promise<void> {
    if (!configStore.isConfigured) {
      throw new Error(t('configureApiFirst'))
    }

    if (!content.trim()) {
      throw new Error(t('enterImageDescription'))
    }

    const attachments = files.length > 0
      ? await persistChatAttachments(files, { sourcePrompt: content })
      : []

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
      generationSize: options.size,
      generationQuality: options.quality,
      generationCount: options.n,
      status: 'pending',
    })

    chatStore.setLoading(true)

    try {
      // 生成图片
      const images = await generateImage(content, options, attachments)

      // 更新助手消息
      await chatStore.addImagesToMessage(assistantMessage.id, images)

      // 自动保存到历史记录
      currentHistoryId = await saveCurrentChat(currentHistoryId)
    } catch (error) {
      // 设置错误状态
      const errorMessage = error instanceof Error ? error.message : t('generationFailed')
      await chatStore.setMessageError(assistantMessage.id, errorMessage)
    } finally {
      chatStore.setLoading(false)
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

    await chatStore.updateMessage(messageId, {
      content: t('generationInProgress'),
      generationSize: options.size,
      generationQuality: options.quality,
      generationCount: options.n,
      status: 'pending',
      error: undefined,
      images: undefined,
    })
    chatStore.setLoading(true)

    try {
      const images = await generateImage(content, options, attachments)
      await chatStore.addImagesToMessage(messageId, images)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('generationFailed')
      await chatStore.setMessageError(messageId, errorMessage)
    } finally {
      chatStore.setLoading(false)
    }
  }

  async function cancelCurrentGeneration(): Promise<void> {
    cancelGeneration()
    chatStore.setLoading(false)

    // 更新最后一个 pending 状态的消息为已取消
    const lastPendingMessage = chatStore.messages.find(
      msg => msg.type === 'assistant' && msg.status === 'pending'
    )
    if (lastPendingMessage) {
      await chatStore.setMessageError(lastPendingMessage.id, t('canceled'))
    }
  }

  async function clearChat(): Promise<void> {
    await chatStore.clearMessages()
    currentHistoryId = null
  }

  // 开始新对话
  async function startNewChat(): Promise<void> {
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

  return {
    chatStore,
    sendMessage,
    retryMessage,
    cancelCurrentGeneration,
    clearChat,
    startNewChat,
    loadChat,
    getCurrentHistoryId,
  }
}
