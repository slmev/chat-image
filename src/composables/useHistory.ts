import { ref, computed } from 'vue'
import { useChatStore } from '../stores/chat'
import type { ChatExportData, ChatHistory, ChatMessage } from '../types'
import type { DesktopHistoryImportData } from '../platform/desktopHistoryImport'
import { generateId } from '../utils/storage'
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
import { deleteUnreferencedLocalImages } from '../platform/imageReferenceCleanup'

// 获取历史记录列表
function getHistoryList(): ChatHistory[] {
  try {
    const data = localStorage.getItem(HISTORY_LIST_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

// 保存历史记录列表
async function setHistoryList(list: ChatHistory[]): Promise<void> {
  if (isTauriRuntime()) {
    await setMetadataValue(HISTORY_LIST_KEY, list)
    return
  }

  try {
    localStorage.setItem(HISTORY_LIST_KEY, JSON.stringify(list))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('Storage quota exceeded for history list')
    }
  }
}

// 获取历史对话消息
function getHistoryMessages(historyId: string): ChatMessage[] {
  try {
    const data = localStorage.getItem(HISTORY_MESSAGES_PREFIX + historyId)
    if (!data) return []
    return JSON.parse(data) as ChatMessage[]
  } catch {
    return []
  }
}

async function readHistoryMessages(historyId: string): Promise<ChatMessage[]> {
  return isTauriRuntime()
    ? await getMetadataValue<ChatMessage[]>(HISTORY_MESSAGES_PREFIX + historyId, [])
    : getHistoryMessages(historyId)
}

function collectImages(messages: ChatMessage[]) {
  return messages.flatMap(message => message.images || [])
}

function collectLocalImagePaths(messages: ChatMessage[]): Set<string> {
  return new Set(collectImages(messages)
    .map(image => image.localPath)
    .filter((localPath): localPath is string => Boolean(localPath)))
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// 保存历史对话消息
async function setHistoryMessages(historyId: string, messages: ChatMessage[]): Promise<void> {
  const key = HISTORY_MESSAGES_PREFIX + historyId
  if (isTauriRuntime()) {
    await setMetadataValue(key, stripBase64FromMessages(messages))
    return
  }

  try {
    localStorage.setItem(key, JSON.stringify(messages))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('Storage quota exceeded, attempting to trim history...')
      // 尝试清理最旧的历史记录后重试
      trimOldHistories()
      try {
        localStorage.setItem(key, JSON.stringify(messages))
      } catch {
        try {
          localStorage.setItem(key, JSON.stringify(stripBase64FromMessages(messages)))
          console.warn('Saved history without image base64 data')
        } catch {
          console.error('Still cannot save after trimming old histories')
        }
      }
    }
  }
}

// 清理最旧的历史记录以释放空间
function trimOldHistories(): void {
  try {
    const list: ChatHistory[] = JSON.parse(localStorage.getItem(HISTORY_LIST_KEY) || '[]')
    if (list.length <= 5) return

    // 按时间排序，保留最近 5 条
    const sorted = list.sort((a, b) => b.timestamp - a.timestamp)
    const toRemove = sorted.slice(5)

    toRemove.forEach(h => {
      localStorage.removeItem(HISTORY_MESSAGES_PREFIX + h.id)
    })

    const kept = sorted.slice(0, 5)
    localStorage.setItem(HISTORY_LIST_KEY, JSON.stringify(kept))
  } catch {
    // ignore
  }
}

// 删除历史对话消息
async function deleteHistoryMessages(historyId: string): Promise<void> {
  if (isTauriRuntime()) {
    await removeMetadataValue(HISTORY_MESSAGES_PREFIX + historyId)
    return
  }

  localStorage.removeItem(HISTORY_MESSAGES_PREFIX + historyId)
}

export function useHistory() {
  const chatStore = useChatStore()

  const searchQuery = ref('')
  const showFavoritesOnly = ref(false)
  const historyList = ref<ChatHistory[]>(getHistoryList())

  if (isTauriRuntime()) {
    void getMetadataValue<ChatHistory[]>(HISTORY_LIST_KEY, []).then(list => {
      historyList.value = list
    })
  }

  async function ensureDesktopHistoryHydrated(): Promise<void> {
    await initializeDesktopPersistence()
    if (!chatStore.hasHydratedDesktopHistory) {
      await chatStore.hydrateFromPersistence()
    }
    await chatStore.flushHistorySave()
  }

  async function readHistoryMessageMap(list: ChatHistory[]): Promise<Record<string, ChatMessage[]>> {
    return Object.fromEntries(
      await Promise.all(
        list.map(async item => [
          item.id,
          await readHistoryMessages(item.id),
        ] as const),
      ),
    )
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
    await Promise.all(snapshot.historyList.map(item =>
      setHistoryMessages(item.id, snapshot.historyMessages[item.id] || []),
    ))
    await Promise.all(Array.from(snapshot.knownHistoryIds)
      .filter(historyId => !snapshot.historyMessages[historyId])
      .map(historyId => deleteHistoryMessages(historyId)))
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
        ...currentHistoryList.map(item => item.id),
        ...data.historyList.map(item => item.id),
      ]),
    }

    try {
      if (mode === 'replace') {
        await Promise.all(currentHistoryList.map(item => deleteHistoryMessages(item.id)))
        await setHistoryList(data.historyList)
        await Promise.all(data.historyList.map(item =>
          setHistoryMessages(item.id, data.historyMessages[item.id] || []),
        ))
        historyList.value = data.historyList
        await chatStore.importMessages(data.currentMessages, 'replace')
        return []
      }

      const existingMessageIds = new Set(chatStore.messages.map(message => message.id))
      const existingHistoryIds = new Set(currentHistoryList.map(item => item.id))
      const uniqueCurrentMessages = data.currentMessages.filter(message => !existingMessageIds.has(message.id))
      const newHistoryItems = data.historyList.filter(item => !existingHistoryIds.has(item.id))
      const mergedHistoryList = [...currentHistoryList, ...newHistoryItems]
      const usedImportedImagePaths = collectLocalImagePaths(uniqueCurrentMessages)
      newHistoryItems.forEach(item => {
        collectLocalImagePaths(data.historyMessages[item.id] || []).forEach(path => {
          usedImportedImagePaths.add(path)
        })
      })

      await setHistoryList(mergedHistoryList)
      await Promise.all(newHistoryItems.map(item =>
        setHistoryMessages(item.id, data.historyMessages[item.id] || []),
      ))
      historyList.value = mergedHistoryList
      await chatStore.importMessages(data.currentMessages, 'merge')
      return data.writtenImagePaths.filter(path => !usedImportedImagePaths.has(path))
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
      result = result.filter(msg => msg.isFavorite)
    }

    const query = searchQuery.value.trim().toLowerCase()
    if (query) {
      result = result.filter(msg => {
        if (msg.content.toLowerCase().includes(query)) return true
        if (msg.error?.toLowerCase().includes(query)) return true
        return false
      })
    }

    return result
  })

  // 收藏的消息
  const favoriteMessages = computed(() => {
    return chatStore.messages.filter(msg => msg.isFavorite)
  })

  // 搜索历史记录
  function searchHistory(query: string): ChatHistory[] {
    const lowerQuery = query.toLowerCase()
    return historyList.value.filter(h =>
      h.title.toLowerCase().includes(lowerQuery)
    )
  }

  // 保存当前对话到历史记录
  async function saveCurrentChat(): Promise<string | null> {
    if (chatStore.messages.length === 0) return null

    const firstUserMessage = chatStore.messages.find(m => m.type === 'user')
    const title = firstUserMessage?.content.slice(0, 50) || '新对话'
    const historyId = generateId()

    const history: ChatHistory = {
      id: historyId,
      title,
      timestamp: Date.now(),
      messageCount: chatStore.messages.length,
      isFavorite: false,
      preview: firstUserMessage?.content.slice(0, 100),
    }

    // 保存消息内容
    await chatStore.flushHistorySave()
    await setHistoryMessages(historyId, chatStore.messages)

    // 更新历史列表
    historyList.value.unshift(history)
    await setHistoryList(historyList.value)

    return historyId
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
    historyList.value = historyList.value.filter(h => h.id !== id)
    await setHistoryList(historyList.value)
    await deleteHistoryMessages(id)
    await deleteUnreferencedLocalImages(collectImages(removedMessages))
  }

  // 清空所有历史记录
  async function clearHistory(): Promise<void> {
    const removedMessages = (await Promise.all(
      historyList.value.map(h => readHistoryMessages(h.id)),
    )).flat()
    // 删除所有历史消息
    await Promise.all(historyList.value.map(h => deleteHistoryMessages(h.id)))
    historyList.value = []
    await setHistoryList([])
    await deleteUnreferencedLocalImages(collectImages(removedMessages))
  }

  // 切换收藏状态
  async function toggleHistoryFavorite(id: string): Promise<void> {
    const item = historyList.value.find(h => h.id === id)
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

  // 删除消息
  async function deleteMessage(messageId: string): Promise<void> {
    await chatStore.deleteMessage(messageId)
  }

  // 切换消息收藏
  async function toggleFavorite(messageId: string): Promise<void> {
    await chatStore.toggleFavorite(messageId)
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
      messages: chatStore.messages,
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
  async function importHistory(file: File, mode: 'replace' | 'merge'): Promise<{ success: boolean; message: string }> {
    try {
      if (isTauriRuntime() && isZipHistoryFile(file)) {
        await ensureDesktopHistoryHydrated()
        const { importDesktopHistoryZip, cleanupDesktopImportedImages } = await import('../platform/desktopHistoryImport')
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
      const isValid = data.messages.every(msg => {
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
    searchHistory,
    saveCurrentChat,
    loadHistoryChat,
    deleteHistoryItem,
    clearHistory,
    toggleHistoryFavorite,
    deleteMessage,
    toggleFavorite,
    exportHistory,
    importHistory,
    clearSearch,
    toggleFavoritesFilter,
  }
}
