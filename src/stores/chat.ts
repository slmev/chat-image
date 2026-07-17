import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type { ChatMessage, GeneratedImage } from '../types'
import { PersistenceError, generateId } from '../utils/storage'
import {
  imageStorageIdentity,
  resolveImportedImageUrls,
  resolveStoredImageUrls,
  revokeCachedBlobUrlsForImages,
} from '../utils/imagePersistence'
import { getDesktopChatHistory, setMetadataValue } from '../platform/metadataStore'
import { isTauriRuntime } from '../platform/runtime'
import { STORAGE_KEYS } from '../utils/constants'
import { deleteUnreferencedLocalImages } from '../platform/imageReferenceCleanup'
import {
  getWebCurrentMessages,
  initializeWebPersistence,
  setWebCurrentMessages,
} from '../platform/webPersistence'

interface RemoveImagesOptions {
  deferCleanup?: boolean
  writeToken?: HistoryWriteToken
}

type NewChatMessage = Omit<ChatMessage, 'id' | 'timestamp'>
type ImportMode = 'replace' | 'merge'

export type ImportMessagesCommit = (messages: ChatMessage[], mode: ImportMode) => Promise<void>
export type HistoryWriteToken = symbol

export const useChatStore = defineStore('chat', () => {
  // State
  const messages = ref<ChatMessage[]>([])
  const isLoading = ref(false)
  const isImportingMessages = ref(false)
  const isExportingHistory = ref(false)
  const hasHydratedPersistence = ref(false)
  const hasHydratedDesktopHistory = computed(
    () => !isTauriRuntime() || hasHydratedPersistence.value,
  )
  let pendingHistorySave: Promise<void> = Promise.resolve()
  let pendingMutation: Promise<void> = Promise.resolve()
  let mutationCount = 0
  let activeMutationToken: symbol | null = null
  let activeImportToken: symbol | null = null
  const activeHistoryWriteTokens = new Set<HistoryWriteToken>()

  function cloneMessageList(source: ChatMessage[]): ChatMessage[] {
    const rawMessages = toRaw(source)
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(rawMessages)
      } catch {
        // Fall through to JSON cloning for Vue proxy edge cases in test/runtime environments.
      }
    }
    return JSON.parse(JSON.stringify(rawMessages)) as ChatMessage[]
  }

  function cloneMessages(): ChatMessage[] {
    return cloneMessageList(messages.value)
  }

  function messageStateMatches(snapshot: ChatMessage[]): boolean {
    return JSON.stringify(cloneMessages()) === JSON.stringify(snapshot)
  }

  function requirePersistenceHydration(): void {
    if (!hasHydratedPersistence.value) {
      throw new PersistenceError('Chat persistence has not been initialized')
    }
  }

  function requireMessageWriteAccess(writeToken?: symbol): void {
    if (
      activeImportToken &&
      activeImportToken !== writeToken &&
      (!writeToken || !activeHistoryWriteTokens.has(writeToken))
    ) {
      throw new Error('Chat messages cannot be changed while an import is in progress')
    }
  }

  function enqueueMutation<T>(operation: () => Promise<T>, token: symbol): Promise<T> {
    if (activeMutationToken === token) {
      return operation()
    }

    const run = async () => {
      activeMutationToken = token
      try {
        return await operation()
      } finally {
        activeMutationToken = null
      }
    }
    const startsImmediately = mutationCount === 0
    mutationCount += 1
    const mutation = startsImmediately ? run() : pendingMutation.then(run)
    pendingMutation = mutation.then(
      () => undefined,
      () => undefined,
    )
    void mutation.then(
      () => {
        mutationCount -= 1
      },
      () => {
        mutationCount -= 1
      },
    )
    return mutation
  }

  function runMessageMutation<T>(operation: () => Promise<T>, writeToken?: symbol): Promise<T> {
    requirePersistenceHydration()
    requireMessageWriteAccess(writeToken)
    return enqueueMutation(operation, writeToken ?? Symbol('message-write'))
  }

  async function commitMessageState(nextMessages: ChatMessage[]): Promise<void> {
    const previousMessages = cloneMessages()
    messages.value = nextMessages
    const appliedSnapshot = cloneMessages()
    const save = persistSnapshot(appliedSnapshot)
    pendingHistorySave = save.catch(() => undefined)

    try {
      await save
    } catch (error) {
      if (messageStateMatches(appliedSnapshot)) {
        messages.value = previousMessages
      }
      throw error
    }
  }

  function collectMessageImagesForCleanup(chatMessages: ChatMessage[]): GeneratedImage[] {
    return chatMessages.flatMap((message) => [
      ...(message.attachments || []),
      ...(message.images || []),
      ...(message.generation?.attachments || []),
    ])
  }

  // Web 端仅释放旧 base64 降级缓存。仓储拥有的 URL 会在确认全局无引用并
  // 实际删除图片时由 webImageRepository 释放。
  function revokeRemovedWebBlobUrls(removedImages: GeneratedImage[]): void {
    if (isTauriRuntime()) return
    const stillReferenced = new Set(
      collectMessageImagesForCleanup(messages.value).map((image) => image.id),
    )
    revokeCachedBlobUrlsForImages(removedImages.filter((image) => !stillReferenced.has(image.id)))
  }

  // Computed
  const messageCount = computed(() => messages.value.length)
  const lastMessage = computed(() => messages.value[messages.value.length - 1] || null)

  // Actions
  async function addMessages(newMessages: NewChatMessage[]): Promise<ChatMessage[]> {
    if (newMessages.length === 0) return []
    return runMessageMutation(async () => {
      const createdMessages = newMessages.map<ChatMessage>((message) => ({
        ...message,
        id: generateId(),
        timestamp: Date.now(),
        isFavorite: false,
      }))
      await commitMessageState([...messages.value, ...createdMessages])
      return createdMessages
    })
  }

  async function addMessage(message: NewChatMessage): Promise<ChatMessage> {
    const [createdMessage] = await addMessages([message])
    return createdMessage
  }

  async function deleteMessage(messageId: string): Promise<void> {
    await runMessageMutation(async () => {
      const index = messages.value.findIndex((msg) => msg.id === messageId)
      if (index !== -1) {
        const removedImages = collectMessageImagesForCleanup([messages.value[index]])
        await commitMessageState(messages.value.filter((message) => message.id !== messageId))
        await cleanupRemovedImages(removedImages)
      }
    })
  }

  async function toggleFavorite(messageId: string): Promise<void> {
    await runMessageMutation(async () => {
      const message = messages.value.find((msg) => msg.id === messageId)
      if (!message) return
      const nextMessages = messages.value.map((item) =>
        item.id === messageId ? { ...item, isFavorite: !message.isFavorite } : item,
      )
      await commitMessageState(nextMessages)
    })
  }

  async function setFavorite(messageId: string, isFavorite: boolean): Promise<void> {
    await setMessagesFavorite([messageId], isFavorite)
  }

  async function setMessagesFavorite(
    messageIds: string[],
    isFavorite: boolean,
    writeToken?: HistoryWriteToken,
  ): Promise<void> {
    const targetIds = new Set(messageIds)
    if (targetIds.size === 0) return
    await runMessageMutation(async () => {
      let changed = false
      const nextMessages = messages.value.map((message) => {
        if (!targetIds.has(message.id) || Boolean(message.isFavorite) === isFavorite) {
          return message
        }
        changed = true
        return { ...message, isFavorite }
      })

      if (changed) {
        await commitMessageState(nextMessages)
      }
    }, writeToken)
  }

  // 从当前对话中删除指定图片。图片按其所属消息删除；若某条助手消息因此不再有图片，则整条删除。
  async function removeImages(
    targetImages: GeneratedImage[],
    options: RemoveImagesOptions = {},
  ): Promise<GeneratedImage[]> {
    const targetKeys = new Set(targetImages.map(imageStorageIdentity))
    if (targetKeys.size === 0) return []
    return runMessageMutation(async () => {
      const removedImages: GeneratedImage[] = []
      const nextMessages: ChatMessage[] = []
      let changed = false

      for (const message of messages.value) {
        const originalImages = message.images
        if (!originalImages || originalImages.length === 0) {
          nextMessages.push(message)
          continue
        }

        const keptImages = originalImages.filter(
          (image) => !targetKeys.has(imageStorageIdentity(image)),
        )
        if (keptImages.length === originalImages.length) {
          nextMessages.push(message)
          continue
        }

        changed = true
        removedImages.push(
          ...originalImages.filter((image) => targetKeys.has(imageStorageIdentity(image))),
        )

        // 助手消息删空后连同消息一并移除；用户消息保留（其图片是附件语义）。
        if (keptImages.length === 0 && message.type === 'assistant') {
          continue
        }

        nextMessages.push({ ...message, images: keptImages.length > 0 ? keptImages : undefined })
      }

      if (!changed) return []

      await commitMessageState(nextMessages)
      if (!options.deferCleanup) {
        await cleanupRemovedImages(removedImages)
      }
      return removedImages
    }, options.writeToken)
  }

  async function commitImportedMessages(
    newMessages: ChatMessage[],
    mode: ImportMode,
    importToken: symbol,
  ): Promise<void> {
    await runMessageMutation(async () => {
      const previousMessages = cloneMessages()
      // Migrate imported messages to ensure isFavorite field exists.
      const normalizedMessages = newMessages.map((msg) => ({
        ...msg,
        isFavorite: msg.isFavorite ?? false,
      }))
      const candidates =
        mode === 'replace'
          ? normalizedMessages
          : normalizedMessages.filter(
              (message) => !messages.value.some((existing) => existing.id === message.id),
            )
      if (mode === 'merge' && candidates.length === 0) return

      const { messages: migratedMessages, persistedImages } = await resolveImportedImageUrls(
        candidates,
        `import-${generateId()}`,
      )
      const nextMessages =
        mode === 'replace' ? migratedMessages : [...messages.value, ...migratedMessages]

      try {
        await commitMessageState(nextMessages)
      } catch (originalError) {
        try {
          await restoreMessagesSnapshotInternal(previousMessages)
        } catch (rollbackError) {
          console.error('Chat import rollback failed:', rollbackError)
          throw new PersistenceError('Chat import failed and rollback was incomplete', {
            cause: { originalError, rollbackError },
          })
        }
        await cleanupRemovedImages(persistedImages)
        throw originalError
      }

      if (mode === 'replace') {
        await cleanupRemovedImages(collectMessageImagesForCleanup(previousMessages))
      }
    }, importToken)
  }

  async function runMessageImport<T>(
    operation: (commit: ImportMessagesCommit) => Promise<T>,
  ): Promise<T> {
    requirePersistenceHydration()
    if (activeImportToken) {
      throw new Error('A chat message import is already in progress')
    }
    if (isExportingHistory.value) {
      throw new Error('Chat messages cannot be imported while a history export is in progress')
    }
    if (isLoading.value) {
      throw new Error('Chat messages cannot be imported while generation is in progress')
    }

    const importToken = Symbol('chat-message-import')
    activeImportToken = importToken
    isImportingMessages.value = true

    try {
      return await enqueueMutation(async () => {
        if (isLoading.value) {
          throw new Error('Chat messages cannot be imported while generation is in progress')
        }
        return await operation((newMessages, mode) =>
          commitImportedMessages(newMessages, mode, importToken),
        )
      }, importToken)
    } finally {
      if (activeImportToken === importToken) {
        activeImportToken = null
        isImportingMessages.value = false
      }
    }
  }

  async function runHistoryWrite<T>(
    operation: (token: HistoryWriteToken) => Promise<T>,
  ): Promise<T> {
    requireMessageWriteAccess()
    const token = Symbol('history-write')
    activeHistoryWriteTokens.add(token)

    try {
      return await enqueueMutation(() => operation(token), token)
    } finally {
      activeHistoryWriteTokens.delete(token)
    }
  }

  async function runHistoryRead<T>(operation: () => Promise<T>): Promise<T> {
    return await enqueueMutation(operation, Symbol('history-read'))
  }

  async function runHistoryExport<T>(operation: () => Promise<T>): Promise<T> {
    if (activeImportToken) {
      throw new Error('Chat history cannot be exported while an import is in progress')
    }
    if (isExportingHistory.value) {
      throw new Error('A chat history export is already in progress')
    }

    isExportingHistory.value = true
    try {
      return await operation()
    } finally {
      isExportingHistory.value = false
    }
  }

  async function importMessages(newMessages: ChatMessage[], mode: ImportMode): Promise<void> {
    await runMessageImport((commit) => commit(newMessages, mode))
  }

  async function updateMessage(messageId: string, updates: Partial<ChatMessage>): Promise<void> {
    await runMessageMutation(async () => {
      const index = messages.value.findIndex((msg) => msg.id === messageId)
      if (index !== -1) {
        const nextMessages = [...messages.value]
        nextMessages[index] = { ...messages.value[index], ...updates }
        await commitMessageState(nextMessages)
      }
    })
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

  async function cancelLastPendingMessage(content: string): Promise<void> {
    await runMessageMutation(async () => {
      const pendingMessage = [...messages.value]
        .reverse()
        .find((message) => message.type === 'assistant' && message.status === 'pending')
      if (!pendingMessage) return

      const nextMessages = messages.value.map((message) =>
        message.id === pendingMessage.id
          ? { ...message, status: 'canceled' as const, content, error: undefined }
          : message,
      )
      await commitMessageState(nextMessages)
    })
  }

  async function setMessageErrorInMemory(messageId: string, error: string): Promise<void> {
    await runMessageMutation(async () => {
      const index = messages.value.findIndex((message) => message.id === messageId)
      if (index === -1) return

      messages.value[index] = {
        ...messages.value[index],
        status: 'error',
        error,
        images: undefined,
      }
    })
  }

  async function clearMessages(): Promise<void> {
    await runMessageMutation(async () => {
      const removedImages = collectMessageImagesForCleanup(messages.value)
      await commitMessageState([])
      await cleanupRemovedImages(removedImages)
    })
  }

  async function restoreMessagesSnapshot(
    snapshot: ChatMessage[],
    writeToken?: HistoryWriteToken,
  ): Promise<void> {
    await runMessageMutation(() => restoreMessagesSnapshotInternal(snapshot), writeToken)
  }

  async function restoreMessagesSnapshotInternal(snapshot: ChatMessage[]): Promise<void> {
    const restoredSnapshot = cloneMessageList(snapshot)
    messages.value = restoredSnapshot
    const save = persistSnapshot(cloneMessageList(restoredSnapshot))
    pendingHistorySave = save.catch(() => undefined)
    await save
  }

  async function cleanupRemovedImages(removedImages: GeneratedImage[]): Promise<void> {
    if (removedImages.length === 0) return
    try {
      revokeRemovedWebBlobUrls(removedImages)
      await deleteUnreferencedLocalImages(removedImages)
    } catch (error) {
      console.warn('Failed to clean up removed images:', error)
    }
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
    if (activeMutationToken) {
      await pendingHistorySave
      return
    }
    await pendingMutation
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
    isImportingMessages,
    isExportingHistory,
    messageCount,
    lastMessage,
    hasHydratedDesktopHistory,
    hasHydratedPersistence,
    addMessage,
    addMessages,
    updateMessage,
    addImagesToMessage,
    setMessageError,
    setMessageCanceled,
    cancelLastPendingMessage,
    setMessageErrorInMemory,
    clearMessages,
    setLoading,
    deleteMessage,
    toggleFavorite,
    setFavorite,
    setMessagesFavorite,
    removeImages,
    restoreMessagesSnapshot,
    cleanupRemovedImages,
    importMessages,
    runMessageImport,
    runHistoryWrite,
    runHistoryRead,
    runHistoryExport,
    flushHistorySave,
    hydrateFromPersistence,
  }
})
