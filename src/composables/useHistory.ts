import { ref, computed } from 'vue'
import { useChatStore } from '../stores/chat'
import type { HistoryWriteToken, ImportMessagesCommit } from '../stores/chat'
import type {
  ChatExportData,
  ChatHistory,
  ChatMessage,
  GalleryImageItem,
  GeneratedImage,
} from '../types'
import type { DesktopHistoryImportData } from '../platform/desktopHistoryImport'
import { PersistenceError, generateId } from '../utils/storage'
import { imageStorageIdentity, stripBase64FromMessages } from '../utils/imagePersistence'
import { parseImportedMessages } from '../utils/chatImportValidation'
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
  return imageStorageIdentity(image)
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
        isFavorite: Boolean(message.isFavorite),
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

class DesktopZipImportRollbackError extends PersistenceError {}
class HistoryDeduplicationRollbackError extends PersistenceError {}
const IMPORT_ROLLBACK_INCOMPLETE_MESSAGE =
  '导入失败且回滚未完成，部分数据可能已变更；导入图片已保留'

async function waitForAllOrThrow(promises: Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(promises)
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )
  if (failure) throw failure.reason
}

async function restoreHistoryRecordsSnapshot(
  snapshotList: ChatHistory[],
  snapshotMessages: Map<string, ChatMessage[]>,
  newHistoryIds: Iterable<string> = [],
): Promise<unknown[]> {
  const rollbackErrors: unknown[] = []
  historyList.value = cloneData(snapshotList)

  try {
    await setHistoryList(snapshotList)
  } catch (error) {
    rollbackErrors.push(error)
  }

  for (const [historyId, messages] of snapshotMessages) {
    try {
      await setHistoryMessages(historyId, messages)
    } catch (error) {
      rollbackErrors.push(error)
    }
  }

  for (const historyId of newHistoryIds) {
    if (snapshotMessages.has(historyId)) continue
    try {
      await deleteHistoryMessages(historyId)
    } catch (error) {
      rollbackErrors.push(error)
    }
  }

  historyList.value = cloneData(snapshotList)
  return rollbackErrors
}

async function cleanupRemovedHistoryImages(images: GeneratedImage[]): Promise<void> {
  if (images.length === 0) return
  try {
    await deleteUnreferencedLocalImages(images)
  } catch (error) {
    console.warn('Failed to clean up removed history images:', error)
  }
}

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

  const deduped = list
    .filter((item) => !idsToRemove.has(item.id))
    .map((item) => mergedSnapshots.get(item.id)?.item || item)
  const snapshotMessages = new Map(
    snapshots.map(({ item, messages }) => [item.id, cloneData(messages)] as const),
  )
  const removedImages = snapshots
    .filter(({ item }) => idsToRemove.has(item.id))
    .flatMap(({ messages }) => collectImages(messages))

  try {
    await waitForAllOrThrow(
      Array.from(mergedSnapshots.values()).map(async ({ item, messages }) => {
        await setHistoryMessages(item.id, messages)
      }),
    )

    const deleteResults = await Promise.allSettled(
      Array.from(idsToRemove).map((id) => deleteHistoryMessages(id)),
    )
    const failedDelete = deleteResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    if (failedDelete) throw failedDelete.reason
    await setHistoryList(deduped)
    await cleanupRemovedHistoryImages(removedImages)
    return deduped
  } catch (originalError) {
    const rollbackErrors = await restoreHistoryRecordsSnapshot(list, snapshotMessages)
    if (rollbackErrors.length > 0) {
      console.error('History deduplication rollback failed:', rollbackErrors)
      throw new HistoryDeduplicationRollbackError(
        'History deduplication failed and rollback was incomplete',
        { cause: { originalError, rollbackErrors } },
      )
    }
    throw originalError
  }
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

  function requireHistoryWritesAvailable(): void {
    if (chatStore.isImportingMessages) {
      throw new Error('Chat history cannot be changed while an import is in progress')
    }
  }

  async function runHistoryWrite<T>(
    operation: (token: HistoryWriteToken) => Promise<T>,
  ): Promise<T> {
    requireHistoryWritesAvailable()
    return await chatStore.runHistoryWrite(operation)
  }

  const defaultHistoryTitle = (messages: ChatMessage[]): string => {
    const firstUserMessage = messages.find((message) => message.type === 'user')
    return firstUserMessage?.content.slice(0, 50) || t('newChat')
  }
  if (chatStore.hasHydratedPersistence) {
    void runHistoryWrite(() => refreshHistoryList(defaultHistoryTitle)).catch((error) => {
      console.error('Failed to load history list:', error)
    })
  }

  async function hydrateHistoryList(): Promise<void> {
    await runHistoryWrite(() => refreshHistoryList(defaultHistoryTitle))
  }

  async function ensureDesktopHistoryHydrated(): Promise<void> {
    await initializeDesktopPersistence()
    if (!chatStore.hasHydratedDesktopHistory) {
      await chatStore.hydrateFromPersistence()
    }
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

  async function rollbackDesktopHistoryWrite(
    snapshotList: ChatHistory[],
    snapshotMessages: Map<string, ChatMessage[]>,
    originalError: unknown,
    newHistoryIds: Iterable<string> = [],
  ): Promise<never> {
    const rollbackErrors = await restoreHistoryRecordsSnapshot(
      snapshotList,
      snapshotMessages,
      newHistoryIds,
    )
    if (rollbackErrors.length > 0) {
      console.error('Desktop history write rollback failed:', rollbackErrors)
      throw new PersistenceError('Desktop history write failed and rollback was incomplete', {
        cause: { originalError, rollbackErrors },
      })
    }
    throw originalError
  }

  interface GalleryMutationSnapshot {
    currentMessages: ChatMessage[]
    historyList: ChatHistory[]
    historyMessages: Map<string, ChatMessage[]>
  }

  async function captureGalleryMutationSnapshot(
    historyIds: Iterable<string>,
  ): Promise<GalleryMutationSnapshot> {
    const uniqueHistoryIds = Array.from(new Set(historyIds))
    const historyMessages = new Map(
      await Promise.all(
        uniqueHistoryIds.map(
          async (historyId) =>
            [historyId, cloneData(await readHistoryMessages(historyId))] as const,
        ),
      ),
    )

    return {
      currentMessages: cloneData(chatStore.messages),
      historyList: cloneData(historyList.value),
      historyMessages,
    }
  }

  async function restoreGalleryMutationSnapshot(
    snapshot: GalleryMutationSnapshot,
    restoreHistoryList: boolean,
    writeToken: HistoryWriteToken,
  ): Promise<unknown[]> {
    const rollbackErrors: unknown[] = []
    historyList.value = cloneData(snapshot.historyList)

    try {
      await chatStore.restoreMessagesSnapshot(snapshot.currentMessages, writeToken)
    } catch (error) {
      rollbackErrors.push(error)
    }

    if (restoreHistoryList) {
      try {
        await setHistoryList(snapshot.historyList)
      } catch (error) {
        rollbackErrors.push(error)
      }
    }

    for (const [historyId, messages] of snapshot.historyMessages) {
      try {
        await setHistoryMessages(historyId, messages)
      } catch (error) {
        rollbackErrors.push(error)
      }
    }

    historyList.value = cloneData(snapshot.historyList)
    return rollbackErrors
  }

  async function rollbackGalleryMutation(
    snapshot: GalleryMutationSnapshot,
    originalError: unknown,
    restoreHistoryList: boolean,
    writeToken: HistoryWriteToken,
  ): Promise<never> {
    const rollbackErrors = await restoreGalleryMutationSnapshot(
      snapshot,
      restoreHistoryList,
      writeToken,
    )
    if (rollbackErrors.length > 0) {
      console.error('Gallery mutation rollback failed:', rollbackErrors)
      throw new PersistenceError('Gallery mutation failed and rollback was incomplete', {
        cause: { originalError, rollbackErrors },
      })
    }
    throw originalError
  }

  async function loadGalleryImages(): Promise<GalleryImageItem[]> {
    return chatStore.runHistoryRead(async () => {
      if (isTauriRuntime()) {
        await ensureDesktopHistoryHydrated()
        historyList.value = await getMetadataValue<ChatHistory[]>(
          HISTORY_LIST_KEY,
          historyList.value,
        )
      } else {
        await refreshHistoryList(defaultHistoryTitle)
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
    })
  }

  function isZipHistoryFile(file: File): boolean {
    return file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip'
  }

  async function restoreDesktopSnapshot(
    snapshot: {
      currentMessages: ChatMessage[]
      historyList: ChatHistory[]
      historyMessages: Record<string, ChatMessage[]>
      knownHistoryIds: Set<string>
    },
    commitMessages: ImportMessagesCommit,
  ): Promise<unknown[]> {
    const rollbackErrors: unknown[] = []
    let historyListRestored = false

    try {
      await setHistoryList(snapshot.historyList)
      historyList.value = cloneData(snapshot.historyList)
      historyListRestored = true
    } catch (error) {
      rollbackErrors.push(error)
    }

    for (const item of snapshot.historyList) {
      try {
        await setHistoryMessages(item.id, snapshot.historyMessages[item.id] || [])
      } catch (error) {
        rollbackErrors.push(error)
      }
    }

    if (historyListRestored) {
      for (const historyId of snapshot.knownHistoryIds) {
        if (Object.prototype.hasOwnProperty.call(snapshot.historyMessages, historyId)) continue
        try {
          await deleteHistoryMessages(historyId)
        } catch (error) {
          rollbackErrors.push(error)
        }
      }
    }

    try {
      await commitMessages(snapshot.currentMessages, 'replace')
    } catch (error) {
      rollbackErrors.push(error)
    }

    return rollbackErrors
  }

  async function commitDesktopZipImport(
    data: DesktopHistoryImportData,
    mode: 'replace' | 'merge',
    commitMessages: ImportMessagesCommit,
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
        await waitForAllOrThrow(currentHistoryList.map((item) => deleteHistoryMessages(item.id)))
        await setHistoryList(data.historyList)
        await waitForAllOrThrow(
          data.historyList.map((item) =>
            setHistoryMessages(item.id, data.historyMessages[item.id] || []),
          ),
        )
        historyList.value = data.historyList
        await commitMessages(data.currentMessages, 'replace')
      } else {
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
        await waitForAllOrThrow(
          newHistoryItems.map((item) =>
            setHistoryMessages(item.id, data.historyMessages[item.id] || []),
          ),
        )
        historyList.value = mergedHistoryList
        await commitMessages(data.currentMessages, 'merge')
        return data.writtenImagePaths.filter((path) => !usedImportedImagePaths.has(path))
      }
    } catch (error) {
      const rollbackErrors = await restoreDesktopSnapshot(snapshot, commitMessages)
      if (rollbackErrors.length > 0) {
        console.error('Desktop ZIP import rollback failed:', rollbackErrors)
        throw new DesktopZipImportRollbackError(
          'Desktop ZIP import failed and rollback was incomplete',
          { cause: { originalError: error, rollbackErrors } },
        )
      }
      throw error
    }

    try {
      await deleteUnreferencedLocalImages(replacedImages)
    } catch (error) {
      console.warn('Failed to clean up images replaced by desktop ZIP import:', error)
    }
    return []
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
  function saveCurrentChat(existingHistoryId?: string | null): Promise<string | null> {
    return runHistoryWrite(async () => {
      if (chatStore.messages.length === 0) return null
      return saveCurrentChatInternal(existingHistoryId)
    })
  }

  async function saveCurrentChatInternal(
    existingHistoryId?: string | null,
  ): Promise<string | null> {
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

    const previousList = cloneData(historyList.value)
    const nextList = historyCandidate
      ? historyList.value.map((item) => (item.id === historyId ? history : item))
      : [history, ...historyList.value]
    const replacedMessages = historyCandidate ? cloneData(await readHistoryMessages(historyId)) : []

    if (!isTauriRuntime()) {
      await putWebHistoryRecord(history, chatStore.messages)
      historyList.value = nextList
    } else {
      const snapshotMessages = new Map<string, ChatMessage[]>()
      if (historyCandidate) {
        snapshotMessages.set(historyId, replacedMessages)
      }
      try {
        await setHistoryMessages(historyId, chatStore.messages)
        historyList.value = nextList
        await setHistoryList(nextList)
      } catch (error) {
        await rollbackDesktopHistoryWrite(
          previousList,
          snapshotMessages,
          error,
          historyCandidate ? [] : [historyId],
        )
      }
    }

    try {
      historyList.value = await removeDuplicateHistories(historyList.value, defaultHistoryTitle)
    } catch (error) {
      if (error instanceof HistoryDeduplicationRollbackError) throw error
      console.warn('Failed to deduplicate saved histories:', error)
    }
    await cleanupRemovedHistoryImages(collectImages(replacedMessages))

    if (historyList.value.some((item) => item.id === historyId)) {
      return historyId
    }

    return (await findMatchingHistory(chatStore.messages))?.id || historyId
  }

  function ensureCurrentChatInHistory(existingHistoryId?: string | null): Promise<string | null> {
    return runHistoryWrite(() => ensureCurrentChatInHistoryInternal(existingHistoryId))
  }

  async function ensureCurrentChatInHistoryInternal(
    existingHistoryId?: string | null,
  ): Promise<string | null> {
    if (chatStore.messages.length === 0) return null

    const existingHistory = existingHistoryId
      ? historyList.value.find((item) => item.id === existingHistoryId)
      : undefined
    const historyCandidate = existingHistory ?? (await findMatchingHistory(chatStore.messages))

    if (historyCandidate) {
      return historyCandidate.id
    }

    return saveCurrentChatInternal(null)
  }

  // 加载历史对话
  async function loadHistoryChat(historyId: string): Promise<ChatMessage[] | null> {
    return chatStore.runMessageImport(async (commitMessages) => {
      const messages = await readHistoryMessages(historyId)
      if (messages.length === 0) return null

      // 恢复消息到 chatStore
      await commitMessages(messages, 'replace')

      return messages
    })
  }

  // 删除历史记录
  function deleteHistoryItem(id: string): Promise<void> {
    return runHistoryWrite(async () => {
      const removedMessages = cloneData(await readHistoryMessages(id))
      const previousList = cloneData(historyList.value)
      const nextList = previousList.filter((history) => history.id !== id)
      if (isTauriRuntime()) {
        try {
          await setHistoryList(nextList)
          await deleteHistoryMessages(id)
        } catch (error) {
          await rollbackDesktopHistoryWrite(previousList, new Map([[id, removedMessages]]), error)
        }
      } else {
        await deleteWebHistoryRecords([id])
      }
      historyList.value = nextList
      await cleanupRemovedHistoryImages(collectImages(removedMessages))
    })
  }

  // 清空所有历史记录
  function clearHistory(): Promise<void> {
    return runHistoryWrite(async () => {
      const targetHistories = cloneData(historyList.value)
      const removedMessageEntries = await Promise.all(
        targetHistories.map(
          async (item) => [item.id, cloneData(await readHistoryMessages(item.id))] as const,
        ),
      )
      const removedMessages = removedMessageEntries.flatMap(([, messages]) => messages)
      if (isTauriRuntime()) {
        try {
          const deleteResults = await Promise.allSettled(
            targetHistories.map((history) => deleteHistoryMessages(history.id)),
          )
          const failedDelete = deleteResults.find(
            (result): result is PromiseRejectedResult => result.status === 'rejected',
          )
          if (failedDelete) throw failedDelete.reason
          await setHistoryList([])
        } catch (error) {
          await rollbackDesktopHistoryWrite(targetHistories, new Map(removedMessageEntries), error)
        }
      } else {
        await clearWebHistoryRecords()
      }
      historyList.value = []
      await cleanupRemovedHistoryImages(collectImages(removedMessages))
    })
  }

  // 切换收藏状态
  function toggleHistoryFavorite(id: string): Promise<void> {
    return runHistoryWrite(async () => {
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
    })
  }

  function renameHistoryItem(id: string, title: string): Promise<void> {
    return runHistoryWrite(async () => {
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
    })
  }

  // 删除消息
  async function deleteMessage(messageId: string): Promise<void> {
    await chatStore.deleteMessage(messageId)
  }

  // 切换消息收藏
  async function toggleFavorite(messageId: string): Promise<void> {
    await chatStore.toggleFavorite(messageId)
  }

  function removeImagesFromMessages(
    messages: ChatMessage[],
    imageKeys: Set<string>,
  ): { messages: ChatMessage[]; removedImages: GeneratedImage[] } {
    const removedImages: GeneratedImage[] = []
    const nextMessages: ChatMessage[] = []

    for (const message of messages) {
      const originalImages = message.images
      if (!originalImages || originalImages.length === 0) {
        nextMessages.push(message)
        continue
      }
      const keptImages = originalImages.filter(
        (image) => !imageKeys.has(imageStorageIdentity(image)),
      )
      if (keptImages.length === originalImages.length) {
        nextMessages.push(message)
        continue
      }
      removedImages.push(
        ...originalImages.filter((image) => imageKeys.has(imageStorageIdentity(image))),
      )
      if (keptImages.length === 0 && message.type === 'assistant') continue
      nextMessages.push({
        ...message,
        images: keptImages.length > 0 ? keptImages : undefined,
      })
    }

    return { messages: nextMessages, removedImages }
  }

  async function persistHistoryImageRemoval(
    history: ChatHistory,
    nextMessages: ChatMessage[],
  ): Promise<void> {
    const nextHistoryList =
      nextMessages.length === 0
        ? historyList.value.filter((item) => item.id !== history.id)
        : historyList.value.map((item) =>
            item.id === history.id ? { ...item, messageCount: nextMessages.length } : item,
          )

    if (nextMessages.length === 0) {
      if (isTauriRuntime()) {
        await setHistoryList(nextHistoryList)
        await deleteHistoryMessages(history.id)
      } else {
        await deleteWebHistoryRecords([history.id])
      }
      historyList.value = nextHistoryList
      return
    }

    // Web 端会从 historyList 读取同一条记录的 messageCount 后整体写回。
    historyList.value = nextHistoryList
    await setHistoryMessages(history.id, nextMessages)
    if (isTauriRuntime()) {
      await setHistoryList(nextHistoryList)
    }
  }

  // 画廊：将一组图片项的收藏状态设为目标值（消息级），覆盖当前对话与历史对话。
  function setGalleryItemsFavorite(items: GalleryImageItem[], isFavorite: boolean): Promise<void> {
    return runHistoryWrite((writeToken) =>
      setGalleryItemsFavoriteInternal(items, isFavorite, writeToken),
    )
  }

  async function setGalleryItemsFavoriteInternal(
    items: GalleryImageItem[],
    isFavorite: boolean,
    writeToken: HistoryWriteToken,
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

    const snapshot = await captureGalleryMutationSnapshot(historyMessageIds.keys())
    try {
      await chatStore.setMessagesFavorite(Array.from(currentMessageIds), isFavorite, writeToken)

      for (const [historyId, ids] of historyMessageIds) {
        const messages = snapshot.historyMessages.get(historyId) || []
        let changed = false
        const nextMessages = messages.map((message) => {
          if (!ids.has(message.id) || Boolean(message.isFavorite) === isFavorite) {
            return message
          }
          changed = true
          return { ...message, isFavorite }
        })
        if (changed) {
          await setHistoryMessages(historyId, nextMessages)
        }
      }
    } catch (error) {
      await rollbackGalleryMutation(snapshot, error, false, writeToken)
    }
  }

  // 画廊：删除一组存储实体。同一实体可能同时存在于当前对话与历史，
  // 需从所有来源删除，避免刷新后历史副本重现。
  function deleteGalleryItems(items: GalleryImageItem[]): Promise<void> {
    return runHistoryWrite((writeToken) => deleteGalleryItemsInternal(items, writeToken))
  }

  async function deleteGalleryItemsInternal(
    items: GalleryImageItem[],
    writeToken: HistoryWriteToken,
  ): Promise<void> {
    if (items.length === 0) return
    const imageKeys = new Set(items.map((item) => imageStorageIdentity(item.image)))
    const snapshot = await captureGalleryMutationSnapshot(
      historyList.value.map((history) => history.id),
    )
    const removedImages: GeneratedImage[] = []

    try {
      removedImages.push(
        ...(await chatStore.removeImages(
          items.map((item) => item.image),
          { deferCleanup: true, writeToken },
        )),
      )

      for (const history of snapshot.historyList) {
        const result = removeImagesFromMessages(
          snapshot.historyMessages.get(history.id) || [],
          imageKeys,
        )
        if (result.removedImages.length === 0) continue

        removedImages.push(...result.removedImages)
        await persistHistoryImageRemoval(history, result.messages)
      }
    } catch (error) {
      await rollbackGalleryMutation(snapshot, error, true, writeToken)
    }

    await chatStore.cleanupRemovedImages(removedImages)
  }

  // 导出历史记录
  function exportHistory(): Promise<{ canceled: boolean }> {
    return chatStore.runHistoryExport(exportHistoryInternal)
  }

  async function exportHistoryInternal(): Promise<{ canceled: boolean }> {
    if (isTauriRuntime()) {
      const {
        buildDesktopHistoryExportZip,
        selectDesktopHistoryExportPath,
        writeDesktopHistoryExportZip,
      } = await import('../platform/desktopHistoryExport')
      const target = await selectDesktopHistoryExportPath()
      if (!target) return { canceled: true }

      const archive = await runHistoryWrite(async () => {
        await ensureDesktopHistoryHydrated()
        const desktopHistoryList = await getMetadataValue<ChatHistory[]>(
          HISTORY_LIST_KEY,
          historyList.value,
        )
        historyList.value = desktopHistoryList
        const historyMessages = await readHistoryMessageMap(desktopHistoryList)
        return buildDesktopHistoryExportZip({
          currentMessages: chatStore.messages,
          historyList: desktopHistoryList,
          historyMessages,
        })
      })
      return writeDesktopHistoryExportZip(target, archive)
    }

    const json = await runHistoryWrite(async () => {
      const exportData: ChatExportData = {
        version: 1,
        exportedAt: Date.now(),
        messages: await prepareMessagesForWebExport(chatStore.messages),
      }
      return JSON.stringify(exportData, null, 2)
    })
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
    return chatStore.runMessageImport(async (commitMessages) => {
      try {
        if (isTauriRuntime() && isZipHistoryFile(file)) {
          await ensureDesktopHistoryHydrated()
          const { importDesktopHistoryZip, cleanupDesktopImportedImages } =
            await import('../platform/desktopHistoryImport')
          const result = await importDesktopHistoryZip(file)
          if (!result.success) {
            return result
          }

          let unusedImagePaths: string[]
          try {
            unusedImagePaths = await commitDesktopZipImport(result.data, mode, commitMessages)
          } catch (error) {
            if (error instanceof DesktopZipImportRollbackError) {
              chatStore.setCurrentHistoryId(null)
              return {
                success: false,
                message: IMPORT_ROLLBACK_INCOMPLETE_MESSAGE,
              }
            }
            try {
              await cleanupDesktopImportedImages(result.data.writtenImagePaths)
            } catch (cleanupError) {
              console.warn('Failed to clean up imported images after rollback:', cleanupError)
            }
            console.error('Desktop ZIP import commit error:', error)
            return { success: false, message: '导入失败，现有数据已保持不变' }
          }

          if (unusedImagePaths.length > 0) {
            try {
              await cleanupDesktopImportedImages(unusedImagePaths)
            } catch (error) {
              console.warn('Failed to clean up unused imported images:', error)
            }
          }

          if (mode === 'replace') {
            chatStore.setCurrentHistoryId(null)
          }

          return {
            success: true,
            message: mode === 'replace' ? '历史记录已替换' : '历史记录已合并',
          }
        }

        const text = await file.text()
        const data = JSON.parse(text) as ChatExportData

        if (data.version !== 1 || !Array.isArray(data.messages)) {
          return { success: false, message: '无效的文件格式' }
        }

        // 验证消息数量限制
        if (data.messages.length > 1000) {
          return { success: false, message: '消息数量超过限制（最多 1000 条）' }
        }

        const importedMessages = parseImportedMessages(data.messages)
        if (!importedMessages) {
          return { success: false, message: '文件数据格式不正确' }
        }

        await commitMessages(importedMessages, mode)
        if (mode === 'replace') {
          chatStore.setCurrentHistoryId(null)
        }
        return {
          success: true,
          message: mode === 'replace' ? '历史记录已替换' : '历史记录已合并',
        }
      } catch (error) {
        console.error('Import error:', error)
        if (
          error instanceof PersistenceError &&
          error.message === 'Chat import failed and rollback was incomplete'
        ) {
          chatStore.setCurrentHistoryId(null)
          return { success: false, message: IMPORT_ROLLBACK_INCOMPLETE_MESSAGE }
        }
        return { success: false, message: '导入失败，请检查文件格式' }
      }
    })
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
