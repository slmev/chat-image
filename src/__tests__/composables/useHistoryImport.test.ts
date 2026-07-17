import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ChatHistory, ChatMessage, GeneratedImage } from '../../types'
import { STORAGE_KEYS } from '../../utils/constants'

const HISTORY_LIST_KEY = 'chat-image-history-list'
const HISTORY_MESSAGES_PREFIX = 'chat-image-history-messages-'

const metadata = new Map<string, unknown>()
const initializeDesktopPersistence = vi.fn<() => Promise<void>>()
const getDesktopChatHistory = vi.fn<() => Promise<ChatMessage[]>>()
const getMetadataValue = vi.fn(
  async <T>(key: string, defaultValue: T): Promise<T> =>
    metadata.has(key) ? (metadata.get(key) as T) : defaultValue,
)
const setMetadataValue = vi.fn(async (key: string, value: unknown): Promise<void> => {
  metadata.set(key, value)
})
const removeMetadataValue = vi.fn(async (key: string): Promise<void> => {
  metadata.delete(key)
})
const importDesktopHistoryZip = vi.fn()
const cleanupDesktopImportedImages = vi.fn<(...args: [string[]]) => Promise<void>>()
const deleteUnreferencedLocalImages = vi.fn<(...args: [unknown[]]) => Promise<void>>()
const resolveDisplayUrl = vi.fn(async (image: GeneratedImage) => image)

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('../../platform/metadataStore', () => ({
  HISTORY_LIST_KEY,
  HISTORY_MESSAGES_PREFIX,
  initializeDesktopPersistence,
  getDesktopChatHistory,
  getMetadataValue,
  setMetadataValue,
  removeMetadataValue,
}))

vi.mock('../../platform/desktopHistoryImport', () => ({
  importDesktopHistoryZip,
  cleanupDesktopImportedImages,
}))

vi.mock('../../platform/imageReferenceCleanup', () => ({
  deleteUnreferencedLocalImages,
}))

vi.mock('../../platform/imageRepository', () => ({
  getImageRepository: () => ({
    resolveDisplayUrl,
  }),
}))

function message(id: string, content = id): ChatMessage {
  return {
    id,
    type: 'assistant',
    content,
    timestamp: 1,
    status: 'success',
  }
}

function messageWithImage(id: string, localPath: string): ChatMessage {
  return {
    ...message(id),
    images: [
      {
        id: `${id}-image`,
        url: localPath,
        localPath,
        timestamp: 1,
      },
    ],
  }
}

function history(id: string): ChatHistory {
  return {
    id,
    title: id,
    timestamp: 1,
    messageCount: 1,
    isFavorite: false,
  }
}

function importedData(
  options: {
    currentMessages?: ChatMessage[]
    historyList?: ChatHistory[]
    historyMessages?: Record<string, ChatMessage[]>
    writtenImagePaths?: string[]
  } = {},
) {
  const importedHistory = options.historyList ?? [history('new-history')]
  return {
    currentMessages: options.currentMessages ?? [message('new-current')],
    historyList: importedHistory,
    historyMessages:
      options.historyMessages ??
      Object.fromEntries(importedHistory.map((item) => [item.id, [message(`${item.id}-message`)]])),
    writtenImagePaths: options.writtenImagePaths ?? ['images/imported.png'],
  }
}

function importFile(): File {
  return new File(['zip'], 'history.zip', { type: 'application/zip' })
}

async function runImport(mode: 'replace' | 'merge', currentHistoryId?: string) {
  const { useHistory } = await import('../../composables/useHistory')
  const { useChatStore } = await import('../../stores/chat')
  const chatStore = useChatStore()
  await chatStore.hydrateFromPersistence()
  if (currentHistoryId) {
    chatStore.setCurrentHistoryId(currentHistoryId)
  }
  return {
    chatStore,
    result: await useHistory().importHistory(importFile(), mode),
  }
}

describe('useHistory desktop ZIP import', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    metadata.clear()
    initializeDesktopPersistence.mockReset()
    initializeDesktopPersistence.mockResolvedValue(undefined)
    getDesktopChatHistory.mockReset()
    getDesktopChatHistory.mockImplementation(
      async () => (metadata.get(STORAGE_KEYS.CHAT_HISTORY) as ChatMessage[]) || [],
    )
    getMetadataValue.mockClear()
    getMetadataValue.mockImplementation(
      async <T>(key: string, defaultValue: T): Promise<T> =>
        metadata.has(key) ? (metadata.get(key) as T) : defaultValue,
    )
    setMetadataValue.mockClear()
    setMetadataValue.mockImplementation(async (key: string, value: unknown): Promise<void> => {
      metadata.set(key, value)
    })
    removeMetadataValue.mockClear()
    removeMetadataValue.mockImplementation(async (key: string): Promise<void> => {
      metadata.delete(key)
    })
    importDesktopHistoryZip.mockReset()
    importDesktopHistoryZip.mockResolvedValue({
      success: true,
      data: importedData(),
    })
    cleanupDesktopImportedImages.mockReset()
    cleanupDesktopImportedImages.mockResolvedValue(undefined)
    deleteUnreferencedLocalImages.mockReset()
    deleteUnreferencedLocalImages.mockResolvedValue(undefined)
    resolveDisplayUrl.mockClear()
    localStorage.clear()
  })

  it('replaces current chat and saved history from a desktop ZIP', async () => {
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    metadata.set(HISTORY_LIST_KEY, [history('old-history')])
    metadata.set(HISTORY_MESSAGES_PREFIX + 'old-history', [message('old-history-message')])
    const data = importedData()
    importDesktopHistoryZip.mockResolvedValue({ success: true, data })

    const { chatStore, result } = await runImport('replace')

    expect(result).toEqual({ success: true, message: '历史记录已替换' })
    expect(chatStore.messages).toEqual([expect.objectContaining({ id: 'new-current' })])
    expect(metadata.get(STORAGE_KEYS.CHAT_HISTORY)).toEqual([
      expect.objectContaining({ id: 'new-current' }),
    ])
    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([expect.objectContaining({ id: 'new-history' })])
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + 'new-history')).toEqual([
      expect.objectContaining({ id: 'new-history-message' }),
    ])
    expect(metadata.has(HISTORY_MESSAGES_PREFIX + 'old-history')).toBe(false)
  })

  it('keeps a completed replace import when old image cleanup fails', async () => {
    const oldHistory = history('old-history')
    const cleanupError = new Error('reference scan failed')
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    metadata.set(HISTORY_LIST_KEY, [oldHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + oldHistory.id, [
      messageWithImage('old-history-message', 'images/old-history.png'),
    ])
    deleteUnreferencedLocalImages.mockRejectedValueOnce(cleanupError)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const { chatStore, result } = await runImport('replace')

    expect(result).toEqual({ success: true, message: '历史记录已替换' })
    expect(chatStore.messages).toEqual([expect.objectContaining({ id: 'new-current' })])
    expect(metadata.get(STORAGE_KEYS.CHAT_HISTORY)).toEqual([
      expect.objectContaining({ id: 'new-current' }),
    ])
    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([expect.objectContaining({ id: 'new-history' })])
    expect(cleanupDesktopImportedImages).not.toHaveBeenCalled()
    expect(consoleWarn).toHaveBeenCalledWith(
      'Failed to clean up images replaced by desktop ZIP import:',
      cleanupError,
    )
    consoleWarn.mockRestore()
  })

  it('merges current messages and only new saved histories from a desktop ZIP', async () => {
    const existingHistory = history('existing-history')
    const newHistory = history('new-history')
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('shared-current')])
    metadata.set(HISTORY_LIST_KEY, [existingHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + existingHistory.id, [
      message('existing-history-message'),
    ])
    importDesktopHistoryZip.mockResolvedValue({
      success: true,
      data: importedData({
        currentMessages: [message('shared-current'), message('new-current')],
        historyList: [existingHistory, newHistory],
        historyMessages: {
          [existingHistory.id]: [message('imported-existing-message')],
          [newHistory.id]: [message('new-history-message')],
        },
      }),
    })

    const { chatStore, result } = await runImport('merge')

    expect(result).toEqual({ success: true, message: '历史记录已合并' })
    expect(chatStore.messages.map((item) => item.id)).toEqual(['shared-current', 'new-current'])
    expect((metadata.get(HISTORY_LIST_KEY) as ChatHistory[]).map((item) => item.id)).toEqual([
      'existing-history',
      'new-history',
    ])
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + existingHistory.id)).toEqual([
      expect.objectContaining({ id: 'existing-history-message' }),
    ])
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + newHistory.id)).toEqual([
      expect.objectContaining({ id: 'new-history-message' }),
    ])
  })

  it('cleans imported images that merge skips because the message or history already exists', async () => {
    const existingHistory = history('existing-history')
    const newHistory = history('new-history')
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('shared-current')])
    metadata.set(HISTORY_LIST_KEY, [existingHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + existingHistory.id, [
      message('existing-history-message'),
    ])
    importDesktopHistoryZip.mockResolvedValue({
      success: true,
      data: importedData({
        currentMessages: [
          messageWithImage('shared-current', 'images/skip-current.png'),
          messageWithImage('new-current', 'images/use-current.png'),
        ],
        historyList: [existingHistory, newHistory],
        historyMessages: {
          [existingHistory.id]: [
            messageWithImage('imported-existing-message', 'images/skip-history.png'),
          ],
          [newHistory.id]: [messageWithImage('new-history-message', 'images/use-history.png')],
        },
        writtenImagePaths: [
          'images/skip-current.png',
          'images/use-current.png',
          'images/skip-history.png',
          'images/use-history.png',
        ],
      }),
    })

    const { result } = await runImport('merge')

    expect(result).toEqual({ success: true, message: '历史记录已合并' })
    expect(cleanupDesktopImportedImages).toHaveBeenCalledWith([
      'images/skip-current.png',
      'images/skip-history.png',
    ])
  })

  it('keeps a committed merge successful when unused image cleanup fails', async () => {
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    const data = importedData()
    importDesktopHistoryZip.mockResolvedValue({ success: true, data })
    const cleanupError = new Error('cleanup module unavailable')
    cleanupDesktopImportedImages.mockRejectedValue(cleanupError)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const { chatStore, result } = await runImport('merge')

    expect(result).toEqual({ success: true, message: '历史记录已合并' })
    expect(chatStore.messages.map((item) => item.id)).toEqual(['old-current', 'new-current'])
    expect(warn).toHaveBeenCalledWith('Failed to clean up unused imported images:', cleanupError)
    warn.mockRestore()
  })

  it('does not mutate data when ZIP validation fails', async () => {
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    metadata.set(HISTORY_LIST_KEY, [history('old-history')])
    importDesktopHistoryZip.mockResolvedValue({
      success: false,
      message: 'ZIP 包缺少 history.json',
    })

    const { result } = await runImport('replace')

    expect(result).toEqual({ success: false, message: 'ZIP 包缺少 history.json' })
    expect(metadata.get(STORAGE_KEYS.CHAT_HISTORY)).toEqual([message('old-current')])
    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([history('old-history')])
    expect(cleanupDesktopImportedImages).not.toHaveBeenCalled()
  })

  it('rejects JSON messages with invalid scalar fields', async () => {
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    const { useChatStore } = await import('../../stores/chat')
    const { useHistory } = await import('../../composables/useHistory')
    const chatStore = useChatStore()
    await chatStore.hydrateFromPersistence()
    const file = new File(
      [
        JSON.stringify({
          version: 1,
          messages: [
            {
              id: 123,
              type: 'system',
              content: 'malformed',
              timestamp: 1,
              status: 'done',
            },
          ],
        }),
      ],
      'history.json',
      { type: 'application/json' },
    )

    await expect(useHistory().importHistory(file, 'replace')).resolves.toEqual({
      success: false,
      message: '文件数据格式不正确',
    })
    expect(chatStore.messages.map((item) => item.id)).toEqual(['old-current'])
  })

  it('rejects duplicate message IDs in a JSON import', async () => {
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    const { useChatStore } = await import('../../stores/chat')
    const { useHistory } = await import('../../composables/useHistory')
    const chatStore = useChatStore()
    await chatStore.hydrateFromPersistence()
    const file = new File(
      [
        JSON.stringify({
          version: 1,
          messages: [message('duplicate'), message('duplicate')],
        }),
      ],
      'history.json',
      { type: 'application/json' },
    )

    await expect(useHistory().importHistory(file, 'replace')).resolves.toEqual({
      success: false,
      message: '文件数据格式不正确',
    })
    expect(chatStore.messages.map((item) => item.id)).toEqual(['old-current'])
  })

  it('blocks history writes for the entire ZIP import workflow', async () => {
    const existingHistory = history('old-history')
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    metadata.set(HISTORY_LIST_KEY, [existingHistory])

    let finishImport: () => void = () => undefined
    importDesktopHistoryZip.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishImport = () => resolve({ success: false, message: 'ZIP 包缺少 history.json' })
        }),
    )
    const { useHistory } = await import('../../composables/useHistory')
    const { useChatStore } = await import('../../stores/chat')
    const chatStore = useChatStore()
    await chatStore.hydrateFromPersistence()
    const historyApi = useHistory()

    const importPromise = historyApi.importHistory(importFile(), 'replace')
    await vi.waitFor(() => expect(chatStore.isImportingMessages).toBe(true))
    await vi.waitFor(() => expect(importDesktopHistoryZip).toHaveBeenCalledTimes(1))

    await expect(historyApi.clearHistory()).rejects.toThrow('import is in progress')
    await expect(historyApi.toggleHistoryFavorite(existingHistory.id)).rejects.toThrow(
      'import is in progress',
    )
    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([existingHistory])

    finishImport()
    await expect(importPromise).resolves.toEqual({
      success: false,
      message: 'ZIP 包缺少 history.json',
    })
    expect(chatStore.isImportingMessages).toBe(false)
  })

  it('waits for a history save that started before the ZIP import lock', async () => {
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    metadata.set(HISTORY_LIST_KEY, [])
    importDesktopHistoryZip.mockResolvedValue({
      success: false,
      message: 'ZIP 包缺少 history.json',
    })

    let markWriteStarted: () => void = () => undefined
    const writeStarted = new Promise<void>((resolve) => {
      markWriteStarted = resolve
    })
    let finishWrite: () => void = () => undefined
    const writeGate = new Promise<void>((resolve) => {
      finishWrite = resolve
    })
    setMetadataValue.mockImplementation(async (key: string, value: unknown): Promise<void> => {
      if (key.startsWith(HISTORY_MESSAGES_PREFIX)) {
        markWriteStarted()
        await writeGate
      }
      metadata.set(key, value)
    })

    const { useHistory } = await import('../../composables/useHistory')
    const { useChatStore } = await import('../../stores/chat')
    const chatStore = useChatStore()
    await chatStore.hydrateFromPersistence()
    const historyApi = useHistory()
    const savePromise = historyApi.saveCurrentChat()
    await writeStarted

    const importPromise = historyApi.importHistory(importFile(), 'replace')
    await vi.waitFor(() => expect(chatStore.isImportingMessages).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(importDesktopHistoryZip).not.toHaveBeenCalled()

    finishWrite()
    await expect(savePromise).resolves.toEqual(expect.any(String))
    await expect(importPromise).resolves.toEqual({
      success: false,
      message: 'ZIP 包缺少 history.json',
    })
    expect(importDesktopHistoryZip).toHaveBeenCalledTimes(1)
  })

  it('waits for a clear operation that started before the ZIP import lock', async () => {
    const oldHistory = history('old-history')
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    metadata.set(HISTORY_LIST_KEY, [oldHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + oldHistory.id, [message('old-history-message')])
    importDesktopHistoryZip.mockResolvedValue({
      success: false,
      message: 'ZIP 包缺少 history.json',
    })

    const { useHistory } = await import('../../composables/useHistory')
    const { useChatStore } = await import('../../stores/chat')
    const chatStore = useChatStore()
    await chatStore.hydrateFromPersistence()
    const historyApi = useHistory()
    await historyApi.hydrateHistoryList()

    let markReadStarted: () => void = () => undefined
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve
    })
    let finishRead: () => void = () => undefined
    const readGate = new Promise<void>((resolve) => {
      finishRead = resolve
    })
    getMetadataValue.mockImplementation(async <T>(key: string, defaultValue: T): Promise<T> => {
      if (key === HISTORY_MESSAGES_PREFIX + oldHistory.id) {
        markReadStarted()
        await readGate
      }
      return metadata.has(key) ? (metadata.get(key) as T) : defaultValue
    })

    const clearPromise = historyApi.clearHistory()
    await readStarted
    const importPromise = historyApi.importHistory(importFile(), 'replace')
    await vi.waitFor(() => expect(chatStore.isImportingMessages).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(importDesktopHistoryZip).not.toHaveBeenCalled()

    finishRead()
    await expect(clearPromise).resolves.toBeUndefined()
    await expect(importPromise).resolves.toEqual({
      success: false,
      message: 'ZIP 包缺少 history.json',
    })
    expect(importDesktopHistoryZip).toHaveBeenCalledTimes(1)
  })

  it('waits for every replace deletion to settle before rolling back', async () => {
    const firstHistory = history('old-history-1')
    const secondHistory = history('old-history-2')
    const firstMessages = [message('old-history-message-1')]
    const secondMessages = [message('old-history-message-2')]
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    metadata.set(HISTORY_LIST_KEY, [firstHistory, secondHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + firstHistory.id, firstMessages)
    metadata.set(HISTORY_MESSAGES_PREFIX + secondHistory.id, secondMessages)
    importDesktopHistoryZip.mockResolvedValue({ success: true, data: importedData() })
    const { useHistory } = await import('../../composables/useHistory')
    const { useChatStore } = await import('../../stores/chat')
    const chatStore = useChatStore()
    await chatStore.hydrateFromPersistence()
    const historyApi = useHistory()
    await historyApi.hydrateHistoryList()

    let finishSecondDelete: () => void = () => undefined
    const secondDeleteGate = new Promise<void>((resolve) => {
      finishSecondDelete = resolve
    })
    removeMetadataValue.mockImplementation(async (key: string): Promise<void> => {
      if (key === HISTORY_MESSAGES_PREFIX + firstHistory.id) {
        throw new Error('first delete failed')
      }
      if (key === HISTORY_MESSAGES_PREFIX + secondHistory.id) {
        await secondDeleteGate
      }
      metadata.delete(key)
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    let importSettled = false
    const importPromise = historyApi.importHistory(importFile(), 'replace').then((result) => {
      importSettled = true
      return result
    })
    await vi.waitFor(() => expect(removeMetadataValue).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(importSettled).toBe(false)

    finishSecondDelete()
    await expect(importPromise).resolves.toEqual({
      success: false,
      message: '导入失败，现有数据已保持不变',
    })
    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([firstHistory, secondHistory])
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + firstHistory.id)).toEqual(firstMessages)
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + secondHistory.id)).toEqual(secondMessages)
    consoleError.mockRestore()
  })

  it('waits for an active history clear before reading a history to load', async () => {
    const oldHistory = history('old-history')
    const currentMessage = message('current-message')
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [currentMessage])
    metadata.set(HISTORY_LIST_KEY, [oldHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + oldHistory.id, [message('old-history-message')])

    const { useHistory } = await import('../../composables/useHistory')
    const { useChatStore } = await import('../../stores/chat')
    const chatStore = useChatStore()
    await chatStore.hydrateFromPersistence()
    const historyApi = useHistory()
    await historyApi.hydrateHistoryList()

    let markReadStarted: () => void = () => undefined
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve
    })
    let finishRead: () => void = () => undefined
    const readGate = new Promise<void>((resolve) => {
      finishRead = resolve
    })
    let historyReadCount = 0
    getMetadataValue.mockImplementation(async <T>(key: string, defaultValue: T): Promise<T> => {
      if (key === HISTORY_MESSAGES_PREFIX + oldHistory.id) {
        historyReadCount += 1
        if (historyReadCount === 1) {
          markReadStarted()
          await readGate
        }
      }
      return metadata.has(key) ? (metadata.get(key) as T) : defaultValue
    })

    const clearPromise = historyApi.clearHistory()
    await readStarted
    const loadPromise = historyApi.loadHistoryChat(oldHistory.id)
    await vi.waitFor(() => expect(chatStore.isImportingMessages).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(historyReadCount).toBe(1)

    finishRead()
    await expect(clearPromise).resolves.toBeUndefined()
    await expect(loadPromise).resolves.toBeNull()
    expect(historyReadCount).toBe(2)
    expect(chatStore.messages).toEqual([currentMessage])
  })

  it('rolls back metadata and cleans imported images when commit fails', async () => {
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    metadata.set(HISTORY_LIST_KEY, [history('old-history')])
    metadata.set(HISTORY_MESSAGES_PREFIX + 'old-history', [message('old-history-message')])
    const data = importedData({ writtenImagePaths: ['images/imported.png'] })
    importDesktopHistoryZip.mockResolvedValue({ success: true, data })
    setMetadataValue.mockImplementation(async (key: string, value: unknown): Promise<void> => {
      if (
        key === HISTORY_LIST_KEY &&
        Array.isArray(value) &&
        value.some((item) => item.id === 'new-history')
      ) {
        throw new Error('store failed')
      }
      metadata.set(key, value)
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const { result } = await runImport('replace')

    expect(result).toEqual({ success: false, message: '导入失败，现有数据已保持不变' })
    expect(metadata.get(STORAGE_KEYS.CHAT_HISTORY)).toEqual([
      expect.objectContaining({ id: 'old-current' }),
    ])
    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([expect.objectContaining({ id: 'old-history' })])
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + 'old-history')).toEqual([
      expect.objectContaining({ id: 'old-history-message' }),
    ])
    expect(cleanupDesktopImportedImages).toHaveBeenCalledWith(['images/imported.png'])
    expect(consoleError).toHaveBeenCalledWith('Desktop ZIP import commit error:', expect.any(Error))
    consoleError.mockRestore()
  })

  it('keeps imported images when ZIP rollback is incomplete', async () => {
    const oldHistory = history('old-history')
    const newHistory = history('new-history')
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    metadata.set(HISTORY_LIST_KEY, [oldHistory])
    metadata.set(HISTORY_MESSAGES_PREFIX + oldHistory.id, [message('old-history-message')])
    const importedPath = 'images/imported.png'
    const data = importedData({
      currentMessages: [message('new-current')],
      historyList: [newHistory],
      historyMessages: {
        [newHistory.id]: [messageWithImage('new-history-message', importedPath)],
      },
      writtenImagePaths: [importedPath],
    })
    importDesktopHistoryZip.mockResolvedValue({ success: true, data })
    let oldCurrentWriteCount = 0
    setMetadataValue.mockImplementation(async (key: string, value: unknown): Promise<void> => {
      if (
        key === STORAGE_KEYS.CHAT_HISTORY &&
        Array.isArray(value) &&
        value.some((item) => item.id === 'new-current')
      ) {
        throw new Error('current chat commit failed')
      }
      if (
        key === STORAGE_KEYS.CHAT_HISTORY &&
        Array.isArray(value) &&
        value.some((item) => item.id === 'old-current')
      ) {
        oldCurrentWriteCount += 1
        if (oldCurrentWriteCount === 2) {
          throw new Error('current chat rollback retry failed')
        }
      }
      if (
        key === HISTORY_LIST_KEY &&
        Array.isArray(value) &&
        value.some((item) => item.id === oldHistory.id)
      ) {
        throw new Error('history list rollback failed')
      }
      metadata.set(key, value)
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const { chatStore, result } = await runImport('replace', oldHistory.id)

    expect(result).toEqual({
      success: false,
      message: '导入失败且回滚未完成，部分数据可能已变更；导入图片已保留',
    })
    expect(chatStore.currentHistoryId).toBeNull()
    expect(cleanupDesktopImportedImages).not.toHaveBeenCalled()
    expect(metadata.get(HISTORY_LIST_KEY)).toEqual([newHistory])
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + oldHistory.id)).toEqual([
      message('old-history-message'),
    ])
    expect(metadata.get(HISTORY_MESSAGES_PREFIX + newHistory.id)).toMatchObject([
      { images: [{ localPath: importedPath }] },
    ])
    const rollbackErrors = consoleError.mock.calls.find(
      ([message]) => message === 'Desktop ZIP import rollback failed:',
    )?.[1]
    expect(rollbackErrors).toEqual([expect.any(Error), expect.any(Error)])
  })

  it('maps an incomplete JSON import rollback to the retained-images result', async () => {
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message('old-current')])
    const { useChatStore } = await import('../../stores/chat')
    const { useHistory } = await import('../../composables/useHistory')
    const chatStore = useChatStore()
    await chatStore.hydrateFromPersistence()
    chatStore.setCurrentHistoryId('old-history')
    setMetadataValue.mockRejectedValue(new Error('disk unavailable'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const file = new File(
      [
        JSON.stringify({
          version: 1,
          messages: [message('new-current')],
        }),
      ],
      'history.json',
      { type: 'application/json' },
    )

    const result = await useHistory().importHistory(file, 'replace')

    expect(result).toEqual({
      success: false,
      message: '导入失败且回滚未完成，部分数据可能已变更；导入图片已保留',
    })
    expect(chatStore.currentHistoryId).toBeNull()
    expect(chatStore.messages.map((item) => item.id)).toEqual(['old-current'])
    expect(cleanupDesktopImportedImages).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
