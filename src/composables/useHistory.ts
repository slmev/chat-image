import { ref, computed } from 'vue'
import { useChatStore } from '../stores/chat'
import type {
  ChatExportData,
  ChatHistory,
  ChatMessage,
  GalleryImageItem,
  GeneratedImage,
} from '../types'
import type { DesktopHistoryImportData } from '../platform/desktopHistoryImport'
import { PersistenceError, generateId } from '../utils/storage'
import { stripBase64FromMessages } from '../utils/imagePersistence'
import {
  HISTORY_LIST_KEY,
  HISTORY_MESSAGES_PREFIX,
  getMetadataValue,
  initializeDesktopPersistence,
  removeMetadataValue,
  setMetadataValue,
} from '../platform/metadataStore'
import { isTauriRuntime } from '../platform/runtime'
import i18n from '../i18n'
import { deleteUnreferencedLocalImages } from '../platform/imageReferenceCleanup'
import {
  clearWebHistoryRecords,
  deleteWebHistoryRecords,
  getWebHistoryRecord,
  getWebHistoryRecords,
  putWebHistoryRecord,
  syncWebHistoryRecords,
  prepareMessagesForWebExport,
} from '../platform/webPersistence'

// 保存历史记录列表
async function setHistoryList(list: ChatHistory[]): Promise<void> {
  if (!isTauriRuntime()) {
    await syncWebHistoryRecords(list)
    return
  }

  try {
    await setMetadataValue(HISTORY_LIST_KEY, list)
  } catch (error) {
    throw new PersistenceError('Failed to save history list', { cause: error })
  }
}

async function readHistoryMessages(historyId: string): Promise<ChatMessage[]> {
  return isTauriRuntime()
    ? await getMetadataValue<ChatMessage[]>(HISTORY_MESSAGES_PREFIX + historyId, [])
    : (await getWebHistoryRecord(historyId))?.messages || []
}

function collectImages(messages: ChatMessage[]) {
  return messages.flatMap((message) => [
    ...(message.attachments || []),
    ...(message.images || []),
    ...(message.generation?.attachments || []),
  ])
}

function galleryImageDedupeKey(image: GeneratedImage): string {
  if (image.id) return `id:${image.id}`
  if (image.localPath) return `local:${image.localPath}`
  return `url:${image.url}`
}

function promptForGalleryImage(message: ChatMessage): string {
  return message.generation?.prompt || ''
}

function collectGalleryImageItems(
  messages: ChatMessage[],
  source: {
    type: GalleryImageItem['sourceType']
    history?: ChatHistory
  },
  seenKeys: Set<string>,
): GalleryImageItem[] {
  const items: GalleryImageItem[] = []

  messages.forEach((message) => {
    message.images?.forEach((image) => {
      const dedupeKey = galleryImageDedupeKey(image)
      if (seenKeys.has(dedupeKey)) return
      seenKeys.add(dedupeKey)

      items.push({
        id: `${source.type}:${source.history?.id || 'current'}:${dedupeKey}`,
        image,
        sourceMessage: message,
        sourceMessageId: image.sourceMessageId || message.id,
        sourceHistoryId: source.history?.id,
        sourceHistoryTitle: source.history?.title,
        sourceType: source.type,
        prompt: promptForGalleryImage(message),
        timestamp: image.timestamp || message.timestamp,
        isFavorite: Boolean(message.isFavorite || source.history?.isFavorite),
      })
    })
  })

  return items
}

function collectLocalImagePaths(messages: ChatMessage[]): Set<string> {
  return new Set(
    collectImages(messages)
      .map((image) => image.localPath)
      .filter((localPath): localPath is string => Boolean(localPath)),
  )
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const historyList = ref<ChatHistory[]>([])

function messageIds(messages: ChatMessage[]): string[] {
  return messages.map((message) => message.id)
}

function isPrefixSequence(shorter: string[], longer: string[]): boolean {
  if (shorter.length > longer.length) return false
  return shorter.every((id, index) => id === longer[index])
}

function hasSnapshotRelation(left: string[], right: string[]): boolean {
  return isPrefixSequence(left, right) || isPrefixSequence(right, left)
}

interface HistorySnapshot {
  item: ChatHistory
  messages: ChatMessage[]
  ids: string[]
}

function chooseMergedHistory(items: HistorySnapshot[]): HistorySnapshot {
  return (
    [...items].sort((a, b) => {
      if (a.messages.length !== b.messages.length) {
        return b.messages.length - a.messages.length
      }
      return b.item.timestamp - a.item.timestamp
    })[0] ?? items[0]
  )
}

async function removeDuplicateHistories(
  list: ChatHistory[],
  defaultHistoryTitle: (messages: ChatMessage[]) => string,
): Promise<ChatHistory[]> {
  const snapshots = (
    await Promise.all(
      list.map(async (item) => {
        const messages = await readHistoryMessages(item.id)
        return {
          item,
          messages,
          ids: messageIds(messages),
        }
      }),
    )
  ).filter((snapshot) => snapshot.messages.length > 0)

  if (snapshots.length <= 1) return list

  const parents = snapshots.map((_, index) => index)

  function find(index: number): number {
    if (parents[index] !== index) {
      parents[index] = find(parents[index])
    }
    return parents[index]
  }

  function union(left: number, right: number): void {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) {
      parents[rightRoot] = leftRoot
    }
  }

  for (let left = 0; left < snapshots.length; left += 1) {
    for (let right = left + 1; right < snapshots.length; right += 1) {
      if (hasSnapshotRelation(snapshots[left].ids, snapshots[right].ids)) {
        union(left, right)
      }
    }
  }

  const groupedSnapshots = new Map<number, HistorySnapshot[]>()
  snapshots.forEach((snapshot, index) => {
    const root = find(index)
    const group = groupedSnapshots.get(root) || []
    group.push(snapshot)
    groupedSnapshots.set(root, group)
  })

  const idsToRemove = new Set<string>()
  const mergedSnapshots = new Map<string, HistorySnapshot>()

  groupedSnapshots.forEach((group) => {
    if (group.length <= 1) return

    const merged = chooseMergedHistory(group)
    const mergedTitle = (() => {
      const renamedItem = [...group]
        .sort((a, b) => {
          if (a.messages.length !== b.messages.length) {
            return b.messages.length - a.messages.length
          }
          return b.item.timestamp - a.item.timestamp
        })
        .find(({ item, messages }) => {
          return item.title.trim() !== defaultHistoryTitle(messages)
        })
      return renamedItem?.item.title.trim() || merged.item.title
    })()
    const keep = {
      ...merged.item,
      title: mergedTitle,
      timestamp: Math.max(...group.map(({ item }) => item.timestamp)),
      messageCount: merged.messages.length,
      isFavorite: group.some(({ item }) => item.isFavorite),
      preview: merged.messages.find((message) => message.type === 'user')?.content.slice(0, 100),
    }

    mergedSnapshots.set(keep.id, {
      item: keep,
      messages: merged.messages,
      ids: merged.ids,
    })

    group.forEach(({ item }) => {
      if (item.id !== keep.id) {
        idsToRemove.add(item.id)
      }
    })
  })

  if (idsToRemove.size === 0) return list

  await Promise.all(
    Array.from(mergedSnapshots.values()).map(async ({ item, messages }) => {
      await setHistoryMessages(item.id, messages)
    }),
  )

  await Promise.all(Array.from(idsToRemove).map((id) => deleteHistoryMessages(id)))
  const deduped = list
    .filter((item) => !idsToRemove.has(item.id))
    .map((item) => mergedSnapshots.get(item.id)?.item || item)
  await setHistoryList(deduped)
  return deduped
}

async function refreshHistoryList(
  defaultHistoryTitle: (messages: ChatMessage[]) => string,
): Promise<void> {
  const list = isTauriRuntime()
    ? await getMetadataValue<ChatHistory[]>(HISTORY_LIST_KEY, [])
    : (await getWebHistoryRecords()).map((record) => record.history)
  historyList.value = await removeDuplicateHistories(list, defaultHistoryTitle)
}

// 保存历史对话消息
async function setHistoryMessages(historyId: string, messages: ChatMessage[]): Promise<void> {
  const key = HISTORY_MESSAGES_PREFIX + historyId
  if (!isTauriRuntime()) {
    const history =
      historyList.value.find((item) => item.id === historyId) ||
      (await getWebHistoryRecord(historyId))?.history
    if (!history) {
      throw new PersistenceError('Failed to save history messages')
    }
    await putWebHistoryRecord(history, messages)
    return
  }

  try {
    await setMetadataValue(key, stripBase64FromMessages(messages))
  } catch (error) {
    throw new PersistenceError('Failed to save history messages', { cause: error })
  }
}

// 删除历史对话消息
async function deleteHistoryMessages(historyId: string): Promise<void> {
  if (!isTauriRuntime()) {
    await deleteWebHistoryRecords([historyId])
    return
  }

  await removeMetadataValue(HISTORY_MESSAGES_PREFIX + historyId)
}

export function useHistory() {
  const chatStore = useChatStore()

  const searchQuery = ref('')
  const showFavoritesOnly = ref(false)
  const t = i18n.global.t
  const defaultHistoryTitle = (messages: ChatMessage[]): string => {
    const firstUserMessage = messages.find((message) => message.type === 'user')
    return firstUserMessage?.content.slice(0, 50) || t('newChat')
  }
  void refreshHistoryList(defaultHistoryTitle).catch((error) => {
    console.error('Failed to load history list:', error)
  })

  async function hydrateHistoryList(): Promise<void> {
    await refreshHistoryList(defaultHistoryTitle)
  }

  async function ensureDesktopHistoryHydrated(): Promise<void> {
    await initializeDesktopPersistence()
    if (!chatStore.hasHydratedDesktopHistory) {
      await chatStore.hydrateFromPersistence()
    }
    await chatStore.flushHistorySave()
  }

  async function findMatchingHistory(messages: ChatMessage[]): Promise<ChatHistory | undefined> {
    const currentIds = messageIds(messages)
    const candidates = await Promise.all(
      historyList.value.map(async (item) => ({
        item,
        messages: await readHistoryMessages(item.id),
      })),
    )

    return candidates
      .filter(({ messages: candidateMessages }) => candidateMessages.length > 0)
      .filter(({ messages: candidateMessages }) =>
        hasSnapshotRelation(currentIds, messageIds(candidateMessages)),
      )
      .sort((a, b) => {
        const leftLength = a.messages.length
        const rightLength = b.messages.length
        if (leftLength !== rightLength) {
          return rightLength - leftLength
        }
        return b.item.timestamp - a.item.timestamp
      })[0]?.item
  }

  async function readHistoryMessageMap(
    list: ChatHistory[],
  ): Promise<Record<string, ChatMessage[]>> {
    return Object.fromEntries(
      await Promise.all(
        list.map(async (item) => [item.id, await readHistoryMessages(item.id)] as const),
      ),
    )
  }

  async function loadGalleryImages(): Promise<GalleryImageItem[]> {
    if (isTauriRuntime()) {
      await ensureDesktopHistoryHydrated()
      historyList.value = await getMetadataValue<ChatHistory[]>(HISTORY_LIST_KEY, historyList.value)
    } else {
      await hydrateHistoryList()
    }

    const seenKeys = new Set<string>()
    const items = collectGalleryImageItems(chatStore.messages, { type: 'current' }, seenKeys)

    const savedHistories = [...historyList.value].sort((a, b) => b.timestamp - a.timestamp)
    const savedMessages = await Promise.all(
      savedHistories.map((history) => readHistoryMessages(history.id)),
    )

    savedMessages.forEach((messages, index) => {
      items.push(
        ...collectGalleryImageItems(
          messages,
          { type: 'history', history: savedHistories[index] },
          seenKeys,
        ),
      )
    })

    return items.sort((a, b) => b.timestamp - a.timestamp)
  }

  function isZipHistoryFile(file: File): boolean {
    return file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip'
  }

  async function restoreDesktopSnapshot(snapshot: {
    currentMessages: ChatMessage[]
    historyList: ChatHistory[]
    historyMessages: Record<string, ChatMessage[]>
    knownHistoryIds: Set<string>
  }): Promise<void> {
    await setHistoryList(snapshot.historyList)
    await Promise.all(
      snapshot.historyList.map((item) =>
        setHistoryMessages(item.id, snapshot.historyMessages[item.id] || []),
      ),
    )
    await Promise.all(
      Array.from(snapshot.knownHistoryIds)
        .filter((historyId) => !snapshot.historyMessages[historyId])
        .map((historyId) => deleteHistoryMessages(historyId)),
    )
    historyList.value = snapshot.historyList
    await chatStore.importMessages(snapshot.currentMessages, 'replace')
  }

  async function commitDesktopZipImport(
    data: DesktopHistoryImportData,
    mode: 'replace' | 'merge',
  ): Promise<string[]> {
    const currentHistoryList = await getMetadataValue<ChatHistory[]>(
      HISTORY_LIST_KEY,
      historyList.value,
    )
    const currentHistoryMessages = await readHistoryMessageMap(currentHistoryList)
    const snapshot = {
      currentMessages: cloneData(chatStore.messages),
      historyList: cloneData(currentHistoryList),
      historyMessages: cloneData(currentHistoryMessages),
      knownHistoryIds: new Set([
        ...currentHistoryList.map((item) => item.id),
        ...data.historyList.map((item) => item.id),
      ]),
    }
    const replacedImages =
      mode === 'replace'
        ? [
            ...collectImages(snapshot.currentMessages),
            ...Object.values(snapshot.historyMessages).flatMap(collectImages),
          ]
        : []

    try {
      if (mode === 'replace') {
        await Promise.all(currentHistoryList.map((item) => deleteHistoryMessages(item.id)))
        await setHistoryList(data.historyList)
        await Promise.all(
          data.historyList.map((item) =>
            setHistoryMessages(item.id, data.historyMessages[item.id] || []),
          ),
        )
        historyList.value = data.historyList
        await chatStore.importMessages(data.currentMessages, 'replace')
        await deleteUnreferencedLocalImages(replacedImages)
        return []
      }

      const existingMessageIds = new Set(chatStore.messages.map((message) => message.id))
      const existingHistoryIds = new Set(currentHistoryList.map((item) => item.id))
      const uniqueCurrentMessages = data.currentMessages.filter(
        (message) => !existingMessageIds.has(message.id),
      )
      const newHistoryItems = data.historyList.filter((item) => !existingHistoryIds.has(item.id))
      const mergedHistoryList = [...currentHistoryList, ...newHistoryItems]
      const usedImportedImagePaths = collectLocalImagePaths(uniqueCurrentMessages)
      newHistoryItems.forEach((item) => {
        collectLocalImagePaths(data.historyMessages[item.id] || []).forEach((path) => {
          usedImportedImagePaths.add(path)
        })
      })

      await setHistoryList(mergedHistoryList)
      await Promise.all(
        newHistoryItems.map((item) =>
          setHistoryMessages(item.id, data.historyMessages[item.id] || []),
        ),
      )
      historyList.value = mergedHistoryList
      await chatStore.importMessages(data.currentMessages, 'merge')
      return data.writtenImagePaths.filter((path) => !usedImportedImagePaths.has(path))
    } catch (error) {
      try {
        await restoreDesktopSnapshot(snapshot)
      } catch (rollbackError) {
        console.error('Desktop ZIP import rollback failed:', rollbackError)
      }
      throw error
    }
  }

  // 过滤后的消息
  const filteredMessages = computed(() => {
    let result = chatStore.messages

    if (showFavoritesOnly.value) {
      result = result.filter((msg) => msg.isFavorite)
    }

    const query = searchQuery.value.trim().toLowerCase()
    if (query) {
      result = result.filter((msg) => {
        if (msg.content.toLowerCase().includes(query)) return true
        if (msg.error?.toLowerCase().includes(query)) return true
        if (msg.images?.some((img) => img.sourcePrompt?.toLowerCase().includes(query))) return true
        if (msg.attachments?.some((att) => att.sourcePrompt?.toLowerCase().includes(query)))
          return true
        return false
      })
    }

    return result
  })

  // 收藏的消息
  const favoriteMessages = computed(() => {
    return chatStore.messages.filter((msg) => msg.isFavorite)
  })

  // 搜索历史记录
  function searchHistory(query: string): ChatHistory[] {
    const lowerQuery = query.toLowerCase()
    return historyList.value.filter((h) => h.title.toLowerCase().includes(lowerQuery))
  }

  // 保存当前对话到历史记录
  async function saveCurrentChat(existingHistoryId?: string | null): Promise<string | null> {
    if (chatStore.messages.length === 0) return null

    const firstUserMessage = chatStore.messages.find((m) => m.type === 'user')
    const existingHistory = existingHistoryId
      ? historyList.value.find((item) => item.id === existingHistoryId)
      : undefined
    const historyCandidate = existingHistory ?? (await findMatchingHistory(chatStore.messages))
    const title = historyCandidate?.title || firstUserMessage?.content.slice(0, 50) || t('newChat')
    const historyId = historyCandidate?.id || generateId()

    const history: ChatHistory = {
      id: historyId,
      title,
      timestamp: Date.now(),
      messageCount: chatStore.messages.length,
      isFavorite: historyCandidate?.isFavorite ?? false,
      preview: firstUserMessage?.content.slice(0, 100),
    }

    await chatStore.flushHistorySave()
    const previousList = historyList.value
    const nextList = historyCandidate
      ? historyList.value.map((item) => (item.id === historyId ? history : item))
      : [history, ...historyList.value]

    if (!isTauriRuntime()) {
      await putWebHistoryRecord(history, chatStore.messages)
      historyList.value = nextList
    } else {
      await setHistoryMessages(historyId, chatStore.messages)
      historyList.value = nextList
      try {
        await setHistoryList(historyList.value)
      } catch (error) {
        historyList.value = previousList
        throw error
      }
    }

    historyList.value = await removeDuplicateHistories(historyList.value, defaultHistoryTitle)

    if (historyList.value.some((item) => item.id === historyId)) {
      return historyId
    }

    return (await findMatchingHistory(chatStore.messages))?.id || historyId
  }

  async function ensureCurrentChatInHistory(
    existingHistoryId?: string | null,
  ): Promise<string | null> {
    if (chatStore.messages.length === 0) return null

    await chatStore.flushHistorySave()
    const existingHistory = existingHistoryId
      ? historyList.value.find((item) => item.id === existingHistoryId)
      : undefined
    const historyCandidate = existingHistory ?? (await findMatchingHistory(chatStore.messages))

    if (historyCandidate) {
      return historyCandidate.id
    }

    return saveCurrentChat(null)
  }

  // 加载历史对话
  async function loadHistoryChat(historyId: string): Promise<ChatMessage[] | null> {
    const messages = await readHistoryMessages(historyId)
    if (messages.length === 0) return null

    // 恢复消息到 chatStore
    await chatStore.clearMessages()
    await chatStore.importMessages(messages, 'replace')

    return messages
  }

  // 删除历史记录
  async function deleteHistoryItem(id: string): Promise<void> {
    const removedMessages = await readHistoryMessages(id)
    const nextList = historyList.value.filter((history) => history.id !== id)
    if (isTauriRuntime()) {
      await setHistoryList(nextList)
      await deleteHistoryMessages(id)
    } else {
      await deleteWebHistoryRecords([id])
    }
    historyList.value = nextList
    await deleteUnreferencedLocalImages(collectImages(removedMessages))
  }

  // 清空所有历史记录
  async function clearHistory(): Promise<void> {
    const removedMessages = (
      await Promise.all(historyList.value.map((h) => readHistoryMessages(h.id)))
    ).flat()
    if (isTauriRuntime()) {
      await Promise.all(historyList.value.map((history) => deleteHistoryMessages(history.id)))
      await setHistoryList([])
    } else {
      await clearWebHistoryRecords()
    }
    historyList.value = []
    await deleteUnreferencedLocalImages(collectImages(removedMessages))
  }

  // 切换收藏状态
  async function toggleHistoryFavorite(id: string): Promise<void> {
    const item = historyList.value.find((h) => h.id === id)
    if (item) {
      const previousValue = item.isFavorite
      item.isFavorite = !previousValue
      try {
        await setHistoryList(historyList.value)
      } catch (error) {
        item.isFavorite = previousValue
        throw error
      }
    }
  }

  async function renameHistoryItem(id: string, title: string): Promise<void> {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return

    const item = historyList.value.find((h) => h.id === id)
    if (!item || item.title === trimmedTitle) return

    const previousTitle = item.title
    item.title = trimmedTitle
    try {
      await setHistoryList(historyList.value)
    } catch (error) {
      item.title = previousTitle
      throw error
    }
  }

  // 删除消息
  async function deleteMessage(messageId: string): Promise<void> {
    await chatStore.deleteMessage(messageId)
  }

  // 切换消息收藏
  async function toggleFavorite(messageId: string): Promise<void> {
    await chatStore.toggleFavorite(messageId)
  }

  // 将历史对话中指定消息的收藏状态设为目标值，写回并同步列表。
  async function setHistoryMessagesFavorite(
    historyId: string,
    messageIdsToUpdate: Set<string>,
    isFavorite: boolean,
  ): Promise<void> {
    const messages = await readHistoryMessages(historyId)
    let changed = false
    const nextMessages = messages.map((message) => {
      if (!messageIdsToUpdate.has(message.id) || Boolean(message.isFavorite) === isFavorite) {
        return message
      }
      changed = true
      return { ...message, isFavorite }
    })
    if (!changed) return
    await setHistoryMessages(historyId, nextMessages)
  }

  // 从历史对话中删除指定图片；助手消息删空则移除，历史删空则删除整条记录。
  async function deleteImagesFromHistory(
    historyId: string,
    imageIds: Set<string>,
  ): Promise<GeneratedImage[]> {
    const messages = await readHistoryMessages(historyId)
    const removedImages: GeneratedImage[] = []
    const nextMessages: ChatMessage[] = []

    for (const message of messages) {
      const originalImages = message.images
      if (!originalImages || originalImages.length === 0) {
        nextMessages.push(message)
        continue
      }
      const keptImages = originalImages.filter((image) => !imageIds.has(image.id))
      if (keptImages.length === originalImages.length) {
        nextMessages.push(message)
        continue
      }
      removedImages.push(...originalImages.filter((image) => imageIds.has(image.id)))
      if (keptImages.length === 0 && message.type === 'assistant') continue
      nextMessages.push({
        ...message,
        images: keptImages.length > 0 ? keptImages : undefined,
      })
    }

    if (removedImages.length === 0) return []

    if (nextMessages.length === 0) {
      await deleteHistoryItem(historyId)
      return removedImages
    }

    // 先更新列表中的 messageCount，再写回消息：web 端 setHistoryMessages 会用
    // historyList 里的 history 组装 IndexedDB 记录，若不先更新则持久化的计数会是旧值。
    const history = historyList.value.find((item) => item.id === historyId)
    if (history) {
      const updated: ChatHistory = { ...history, messageCount: nextMessages.length }
      historyList.value = historyList.value.map((item) => (item.id === historyId ? updated : item))
    }

    await setHistoryMessages(historyId, nextMessages)
    if (isTauriRuntime()) {
      await setHistoryList(historyList.value)
    }
    return removedImages
  }

  // 画廊：将一组图片项的收藏状态设为目标值（消息级），覆盖当前对话与历史对话。
  async function setGalleryItemsFavorite(
    items: GalleryImageItem[],
    isFavorite: boolean,
  ): Promise<void> {
    const currentMessageIds = new Set<string>()
    const historyMessageIds = new Map<string, Set<string>>()

    for (const item of items) {
      const messageId = item.sourceMessage.id
      if (item.sourceType === 'current' || !item.sourceHistoryId) {
        currentMessageIds.add(messageId)
      } else {
        const ids = historyMessageIds.get(item.sourceHistoryId) || new Set<string>()
        ids.add(messageId)
        historyMessageIds.set(item.sourceHistoryId, ids)
      }
    }

    for (const messageId of currentMessageIds) {
      await chatStore.setFavorite(messageId, isFavorite)
    }
    for (const [historyId, ids] of historyMessageIds) {
      await setHistoryMessagesFavorite(historyId, ids, isFavorite)
    }
  }

  // 画廊：删除一组图片项。因去重后同一 image.id 可能同时存在于当前对话与历史，
  // 需从所有来源删除，避免刷新后历史副本重现。
  async function deleteGalleryItems(items: GalleryImageItem[]): Promise<void> {
    if (items.length === 0) return
    const imageIds = new Set(items.map((item) => item.image.id))

    await chatStore.removeImages(Array.from(imageIds))

    const removedImages: GeneratedImage[] = []
    for (const history of [...historyList.value]) {
      removedImages.push(...(await deleteImagesFromHistory(history.id, imageIds)))
    }

    if (removedImages.length > 0) {
      await deleteUnreferencedLocalImages(removedImages)
    }
  }

  // 导出历史记录
  async function exportHistory(): Promise<{ canceled: boolean }> {
    if (isTauriRuntime()) {
      await ensureDesktopHistoryHydrated()
      const desktopHistoryList = await getMetadataValue<ChatHistory[]>(
        HISTORY_LIST_KEY,
        historyList.value,
      )
      historyList.value = desktopHistoryList
      const historyMessages = await readHistoryMessageMap(desktopHistoryList)

      const { exportDesktopHistoryZip } = await import('../platform/desktopHistoryExport')
      return exportDesktopHistoryZip({
        currentMessages: chatStore.messages,
        historyList: desktopHistoryList,
        historyMessages,
      })
    }

    const exportData: ChatExportData = {
      version: 1,
      exportedAt: Date.now(),
      messages: await prepareMessagesForWebExport(chatStore.messages),
    }

    const json = JSON.stringify(exportData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `chat-image-history-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    return { canceled: false }
  }

  // 导入历史记录
  async function importHistory(
    file: File,
    mode: 'replace' | 'merge',
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (isTauriRuntime() && isZipHistoryFile(file)) {
        await ensureDesktopHistoryHydrated()
        const { importDesktopHistoryZip, cleanupDesktopImportedImages } =
          await import('../platform/desktopHistoryImport')
        const result = await importDesktopHistoryZip(file)
        if (!result.success) {
          return result
        }

        try {
          const unusedImagePaths = await commitDesktopZipImport(result.data, mode)
          if (unusedImagePaths.length > 0) {
            await cleanupDesktopImportedImages(unusedImagePaths)
          }
        } catch (error) {
          await cleanupDesktopImportedImages(result.data.writtenImagePaths)
          console.error('Desktop ZIP import commit error:', error)
          return { success: false, message: '导入失败，现有数据已保持不变' }
        }

        return { success: true, message: mode === 'replace' ? '历史记录已替换' : '历史记录已合并' }
      }

      const text = await file.text()
      const data = JSON.parse(text) as ChatExportData

      if (!data.version || !Array.isArray(data.messages)) {
        return { success: false, message: '无效的文件格式' }
      }

      // 验证消息数量限制
      if (data.messages.length > 1000) {
        return { success: false, message: '消息数量超过限制（最多 1000 条）' }
      }

      // 验证每条消息
      const isValid = data.messages.every((msg) => {
        if (!msg.id || !msg.type || !msg.content || !msg.timestamp || !msg.status) {
          return false
        }
        // 字段长度限制
        if (msg.id.length > 100 || msg.content.length > 10000) {
          return false
        }
        return true
      })

      if (!isValid) {
        return { success: false, message: '文件数据格式不正确' }
      }

      await chatStore.importMessages(data.messages, mode)
      return { success: true, message: mode === 'replace' ? '历史记录已替换' : '历史记录已合并' }
    } catch (error) {
      console.error('Import error:', error)
      return { success: false, message: '导入失败，请检查文件格式' }
    }
  }

  // 清除搜索
  function clearSearch(): void {
    searchQuery.value = ''
  }

  // 切换收藏筛选
  function toggleFavoritesFilter(): void {
    showFavoritesOnly.value = !showFavoritesOnly.value
  }

  return {
    searchQuery,
    showFavoritesOnly,
    filteredMessages,
    favoriteMessages,
    historyList,
    hydrateHistoryList,
    searchHistory,
    saveCurrentChat,
    ensureCurrentChatInHistory,
    loadHistoryChat,
    loadGalleryImages,
    deleteHistoryItem,
    clearHistory,
    toggleHistoryFavorite,
    renameHistoryItem,
    deleteMessage,
    toggleFavorite,
    setGalleryItemsFavorite,
    deleteGalleryItems,
    exportHistory,
    importHistory,
    clearSearch,
    toggleFavoritesFilter,
  }
}
