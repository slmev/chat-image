import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type { ChatMessage, GeneratedImage } from '../types'
import { PersistenceError, generateId } from '../utils/storage'
import { resolveStoredImageUrls, revokeCachedBlobUrlsForImages } from '../utils/imagePersistence'
import { getDesktopChatHistory, setMetadataValue } from '../platform/metadataStore'
import { isTauriRuntime } from '../platform/runtime'
import { STORAGE_KEYS } from '../utils/constants'
import { deleteUnreferencedLocalImages } from '../platform/imageReferenceCleanup'
import {
  getWebCurrentMessages,
  initializeWebPersistence,
  setWebCurrentMessages,
} from '../platform/webPersistence'
import { revokeWebImageObjectUrls } from '../platform/webImageRepository'

export const useChatStore = defineStore('chat', () => {
  // State
  const messages = ref<ChatMessage[]>([])
  const isLoading = ref(false)
  const hasHydratedPersistence = ref(false)
  const hasHydratedDesktopHistory = computed(
    () => !isTauriRuntime() || hasHydratedPersistence.value,
  )
  let pendingHistorySave: Promise<void> = Promise.resolve()

  function cloneMessages(): ChatMessage[] {
    const rawMessages = toRaw(messages.value)
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(rawMessages)
      } catch {
        // Fall through to JSON cloning for Vue proxy edge cases in test/runtime environments.
      }
    }
    return JSON.parse(JSON.stringify(rawMessages)) as ChatMessage[]
  }

  function collectMessageImagesForCleanup(chatMessages: ChatMessage[]): GeneratedImage[] {
    return chatMessages.flatMap((message) => [
      ...(message.attachments || []),
      ...(message.images || []),
      ...(message.generation?.attachments || []),
    ])
  }

  // Web 端：释放被移除图片的缓存 blob URL，但排除当前视图仍引用的 id
  // （历史记录稍后载入时 getCachedBlobUrl 会按需重建）。
  function revokeRemovedWebBlobUrls(removedImages: GeneratedImage[]): void {
    if (isTauriRuntime()) return
    const stillReferenced = new Set(
      collectMessageImagesForCleanup(messages.value).map((image) => image.id),
    )
    revokeCachedBlobUrlsForImages(removedImages.filter((image) => !stillReferenced.has(image.id)))
    revokeWebImageObjectUrls(removedImages.filter((image) => !stillReferenced.has(image.id)))
  }

  // Computed
  const messageCount = computed(() => messages.value.length)
  const lastMessage = computed(() => messages.value[messages.value.length - 1] || null)

  // Actions
  function addMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const newMessage: ChatMessage = {
      ...message,
      id: generateId(),
      timestamp: Date.now(),
      isFavorite: false,
    }

    messages.value.push(newMessage)
    void saveHistory().catch((error) => {
      console.error('Save chat history failed:', error)
    })

    return newMessage
  }

  async function deleteMessage(messageId: string): Promise<void> {
    const index = messages.value.findIndex((msg) => msg.id === messageId)
    if (index !== -1) {
      const removedImages = collectMessageImagesForCleanup([messages.value[index]])
      messages.value.splice(index, 1)
      await saveHistory()
      revokeRemovedWebBlobUrls(removedImages)
      await deleteUnreferencedLocalImages(removedImages)
    }
  }

  async function toggleFavorite(messageId: string): Promise<void> {
    const message = messages.value.find((msg) => msg.id === messageId)
    if (message) {
      message.isFavorite = !message.isFavorite
      await saveHistory()
    }
  }

  async function importMessages(
    newMessages: ChatMessage[],
    mode: 'replace' | 'merge',
  ): Promise<void> {
    // Migrate imported messages to ensure isFavorite field exists
    const normalizedMessages = newMessages.map((msg) => ({
      ...msg,
      isFavorite: msg.isFavorite ?? false,
    }))
    const migratedMessages = await resolveStoredImageUrls(normalizedMessages)

    if (mode === 'replace') {
      const removedImages = collectMessageImagesForCleanup(messages.value)
      messages.value = migratedMessages
      await saveHistory()
      await deleteUnreferencedLocalImages(removedImages)
    } else {
      // Merge: add only messages with new IDs
      const existingIds = new Set(messages.value.map((m) => m.id))
      const uniqueNew = migratedMessages.filter((m) => !existingIds.has(m.id))
      messages.value.push(...uniqueNew)
      await saveHistory()
    }
  }

  async function updateMessage(messageId: string, updates: Partial<ChatMessage>): Promise<void> {
    const index = messages.value.findIndex((msg) => msg.id === messageId)
    if (index !== -1) {
      const previousMessage = messages.value[index]
      const nextMessage = { ...previousMessage, ...updates }
      messages.value[index] = nextMessage
      try {
        await saveHistory()
      } catch (error) {
        if (toRaw(messages.value[index]) === nextMessage) {
          messages.value[index] = previousMessage
        }
        throw error
      }
    }
  }

  async function addImagesToMessage(messageId: string, images: GeneratedImage[]): Promise<void> {
    await updateMessage(messageId, {
      images,
      status: 'success',
    })
  }

  async function setMessageError(messageId: string, error: string): Promise<void> {
    await updateMessage(messageId, {
      status: 'error',
      error,
    })
  }

  async function setMessageCanceled(messageId: string, content: string): Promise<void> {
    await updateMessage(messageId, {
      status: 'canceled',
      content,
      error: undefined,
    })
  }

  function setMessageErrorInMemory(messageId: string, error: string): void {
    const index = messages.value.findIndex((message) => message.id === messageId)
    if (index === -1) return

    messages.value[index] = {
      ...messages.value[index],
      status: 'error',
      error,
      images: undefined,
    }
  }

  async function clearMessages(): Promise<void> {
    await flushHistorySave()
    const removedImages = collectMessageImagesForCleanup(messages.value)
    messages.value = []
    pendingHistorySave = persistSnapshot(cloneMessages())
    await pendingHistorySave
    revokeRemovedWebBlobUrls(removedImages)
    await deleteUnreferencedLocalImages(removedImages)
  }

  function saveHistory(): Promise<void> {
    if (!hasHydratedPersistence.value) return Promise.resolve()
    const snapshot = cloneMessages()
    const save = pendingHistorySave.then(() => persistSnapshot(snapshot))
    pendingHistorySave = save.catch(() => undefined)
    return save
  }

  async function persistSnapshot(snapshot: ChatMessage[]): Promise<void> {
    try {
      if (isTauriRuntime()) {
        await setMetadataValue(STORAGE_KEYS.CHAT_HISTORY, snapshot)
      } else {
        await setWebCurrentMessages(snapshot)
      }
    } catch (error) {
      if (error instanceof PersistenceError) throw error
      throw new PersistenceError('Failed to save chat history', { cause: error })
    }
  }

  async function flushHistorySave(): Promise<void> {
    await pendingHistorySave
  }

  function setLoading(value: boolean): void {
    isLoading.value = value
  }

  async function hydrateFromPersistence(): Promise<void> {
    if (isTauriRuntime()) {
      messages.value = await getDesktopChatHistory()
    } else {
      await initializeWebPersistence()
      messages.value = await resolveStoredImageUrls(await getWebCurrentMessages())
    }
    hasHydratedPersistence.value = true
  }

  return {
    messages,
    isLoading,
    messageCount,
    lastMessage,
    hasHydratedDesktopHistory,
    hasHydratedPersistence,
    addMessage,
    updateMessage,
    addImagesToMessage,
    setMessageError,
    setMessageCanceled,
    setMessageErrorInMemory,
    clearMessages,
    setLoading,
    deleteMessage,
    toggleFavorite,
    importMessages,
    flushHistorySave,
    hydrateFromPersistence,
  }
})
