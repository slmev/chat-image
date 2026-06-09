import { useChatStore } from '../stores/chat'
import { useImageGeneration } from '../composables/useImageGeneration'
import { useConfigStore } from '../stores/config'
import { useHistory } from '../composables/useHistory'
import type { GenerationOptions } from '../types'

export function useChat() {
  const chatStore = useChatStore()
  const configStore = useConfigStore()
  const { generateImage, cancelGeneration } = useImageGeneration()
  const { saveCurrentChat, loadHistoryChat } = useHistory()

  // 当前加载的历史记录 ID
  let currentHistoryId: string | null = null

  async function sendMessage(
    content: string,
    options: GenerationOptions
  ): Promise<void> {
    if (!configStore.isConfigured) {
      throw new Error('请先配置 API')
    }

    if (!content.trim()) {
      throw new Error('请输入图片描述')
    }

    // 添加用户消息
    chatStore.addMessage({
      type: 'user',
      content,
      status: 'success',
    })

    // 添加助手消息（pending 状态）
    const assistantMessage = chatStore.addMessage({
      type: 'assistant',
      content: '正在生成图片...',
      status: 'pending',
    })

    chatStore.setLoading(true)

    try {
      // 生成图片
      const images = await generateImage(content, options)

      // 更新助手消息
      await chatStore.addImagesToMessage(assistantMessage.id, images)

      // 自动保存到历史记录
      currentHistoryId = await saveCurrentChat()
    } catch (error) {
      // 设置错误状态
      const errorMessage = error instanceof Error ? error.message : '生成失败'
      await chatStore.setMessageError(assistantMessage.id, errorMessage)
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
      await chatStore.setMessageError(lastPendingMessage.id, '已取消')
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
      await saveCurrentChat()
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
    cancelCurrentGeneration,
    clearChat,
    startNewChat,
    loadChat,
    getCurrentHistoryId,
  }
}
