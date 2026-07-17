import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ChatHistory, ChatMessage, GeneratedImage } from '../types'
import { HISTORY_LIST_KEY, HISTORY_MESSAGES_PREFIX, STORAGE_KEYS } from '../utils/constants'
import { PersistenceError } from '../utils/persistenceError'

const DATABASE_NAME = 'chat-image-web'
const DATABASE_VERSION = 1
const MIGRATION_VERSION = 1
const CURRENT_MESSAGES_KEY = 'currentMessages'
const MIGRATION_VERSION_KEY = 'migrationVersion'

interface StateRecord {
  key: string
  value: unknown
}

export interface WebHistoryRecord {
  id: string
  history: ChatHistory
  messages: ChatMessage[]
}

interface WebImageRecord {
  key: string
  blob: Blob
  mimeType: string
  byteSize: number
  timestamp: number
}

interface WebPersistenceSchema extends DBSchema {
  state: {
    key: string
    value: StateRecord
  }
  histories: {
    key: string
    value: WebHistoryRecord
  }
  images: {
    key: string
    value: WebImageRecord
  }
}

let databasePromise: Promise<IDBPDatabase<WebPersistenceSchema>> | null = null
let initializationPromise: Promise<void> | null = null

function getDatabase(): Promise<IDBPDatabase<WebPersistenceSchema>> {
  if (!databasePromise) {
    databasePromise = openDB<WebPersistenceSchema>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(database) {
        database.createObjectStore('state', { keyPath: 'key' })
        database.createObjectStore('histories', { keyPath: 'id' })
        database.createObjectStore('images', { keyPath: 'key' })
      },
    }).catch((error) => {
      databasePromise = null
      throw new PersistenceError('Failed to open web storage', { cause: error })
    })
  }
  return databasePromise
}

function readLegacyValue<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key)
  return raw === null ? fallback : (JSON.parse(raw) as T)
}

function base64ToBlob(base64: string, mimeType = 'image/png'): Blob {
  const characters = atob(base64)
  const bytes = new Uint8Array(characters.length)
  for (let index = 0; index < characters.length; index += 1) {
    bytes[index] = characters.charCodeAt(index)
  }
  return new Blob([bytes], { type: mimeType })
}

function durableImageUrl(image: GeneratedImage): string {
  if (image.webStorageKey && (image.url.startsWith('blob:') || image.url.startsWith('data:'))) {
    return ''
  }
  return image.url
}

export function prepareMessagesForWebStorage(messages: ChatMessage[]): ChatMessage[] {
  const prepared = messages.map((message) => ({
    ...message,
    attachments: message.attachments?.map((attachment) => ({
      ...attachment,
      url: durableImageUrl(attachment),
      base64: undefined,
    })),
    images: message.images?.map((image) => ({
      ...image,
      url: durableImageUrl(image),
      base64: undefined,
    })),
    generation: message.generation
      ? {
          ...message.generation,
          attachments: message.generation.attachments?.map((attachment) => ({
            ...attachment,
            url: durableImageUrl(attachment),
            base64: undefined,
          })),
        }
      : undefined,
  }))
  return JSON.parse(JSON.stringify(prepared)) as ChatMessage[]
}

function prepareLegacyMessages(
  messages: ChatMessage[],
  imageRecords: Map<string, WebImageRecord>,
): ChatMessage[] {
  const migrateImage = <T extends GeneratedImage>(image: T): T => {
    if (!image.base64) return image

    const key = image.webStorageKey || `legacy:${image.id}`
    if (!imageRecords.has(key)) {
      const blob = base64ToBlob(image.base64, image.mimeType)
      imageRecords.set(key, {
        key,
        blob,
        mimeType: image.mimeType || blob.type || 'image/png',
        byteSize: blob.size,
        timestamp: image.timestamp,
      })
    }

    return {
      ...image,
      webStorageKey: key,
      url: '',
      base64: undefined,
    }
  }

  const prepared = messages.map((message) => ({
    ...message,
    isFavorite: message.isFavorite ?? false,
    attachments: message.attachments?.map((attachment) => ({
      ...migrateImage(attachment),
      name: attachment.name,
    })),
    images: message.images?.map(migrateImage),
    generation: message.generation
      ? {
          ...message.generation,
          attachments: message.generation.attachments?.map((attachment) => ({
            ...migrateImage(attachment),
            name: attachment.name,
          })),
        }
      : undefined,
  }))
  return JSON.parse(JSON.stringify(prepared)) as ChatMessage[]
}

function removeLegacyWebStorage(historyList: unknown[]): void {
  const historyIds = historyList.flatMap((history) =>
    typeof history === 'object' &&
    history !== null &&
    'id' in history &&
    typeof history.id === 'string'
      ? [history.id]
      : [],
  )
  localStorage.removeItem(STORAGE_KEYS.CHAT_HISTORY)
  localStorage.removeItem(HISTORY_LIST_KEY)
  historyIds.forEach((historyId) => {
    localStorage.removeItem(HISTORY_MESSAGES_PREFIX + historyId)
  })
}

async function migrateLegacyWebStorage(database: IDBPDatabase<WebPersistenceSchema>) {
  try {
    const migration = await database.get('state', MIGRATION_VERSION_KEY)
    if (migration?.value === MIGRATION_VERSION) {
      let legacyHistoryList: unknown
      try {
        legacyHistoryList = readLegacyValue<unknown>(HISTORY_LIST_KEY, [])
      } catch {
        // IndexedDB was already verified. Keep malformed legacy keys for manual recovery.
        return
      }
      if (!Array.isArray(legacyHistoryList)) return
      removeLegacyWebStorage(legacyHistoryList)
      return
    }

    const legacyHistoryList = readLegacyValue<ChatHistory[]>(HISTORY_LIST_KEY, [])
    const legacyCurrent = readLegacyValue<ChatMessage[]>(STORAGE_KEYS.CHAT_HISTORY, [])
    const imageRecords = new Map<string, WebImageRecord>()
    const currentMessages = prepareLegacyMessages(legacyCurrent, imageRecords)
    const histories = legacyHistoryList.map<WebHistoryRecord>((history) => ({
      id: history.id,
      history,
      messages: prepareLegacyMessages(
        readLegacyValue<ChatMessage[]>(HISTORY_MESSAGES_PREFIX + history.id, []),
        imageRecords,
      ),
    }))

    const transaction = database.transaction(['state', 'histories', 'images'], 'readwrite')
    const requests = [
      transaction.objectStore('state').put({ key: CURRENT_MESSAGES_KEY, value: currentMessages }),
      ...histories.map((history) => transaction.objectStore('histories').put(history)),
      ...Array.from(imageRecords.values()).map((image) =>
        transaction.objectStore('images').put(image),
      ),
    ]
    await Promise.all([...requests, transaction.done])

    const [storedCurrent, storedHistories, storedImages] = await Promise.all([
      database.get('state', CURRENT_MESSAGES_KEY),
      database.getAll('histories'),
      database.getAll('images'),
    ])
    const storedHistoryIds = new Set(storedHistories.map((history) => history.id))
    const storedImageKeys = new Set(storedImages.map((image) => image.key))
    if (
      !storedCurrent ||
      storedHistories.length !== histories.length ||
      histories.some((history) => !storedHistoryIds.has(history.id)) ||
      storedImages.length !== imageRecords.size ||
      Array.from(imageRecords.keys()).some((key) => !storedImageKeys.has(key))
    ) {
      throw new Error('Web storage migration verification failed')
    }

    await database.put('state', {
      key: MIGRATION_VERSION_KEY,
      value: MIGRATION_VERSION,
    })
    const storedMigration = await database.get('state', MIGRATION_VERSION_KEY)
    if (storedMigration?.value !== MIGRATION_VERSION) {
      throw new Error('Web storage migration marker verification failed')
    }

    removeLegacyWebStorage(legacyHistoryList)
  } catch (error) {
    throw new PersistenceError('Failed to migrate web storage', { cause: error })
  }
}

export async function initializeWebPersistence(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = getDatabase()
      .then(migrateLegacyWebStorage)
      .catch((error) => {
        initializationPromise = null
        throw error
      })
  }
  await initializationPromise
}

export async function getWebCurrentMessages(): Promise<ChatMessage[]> {
  await initializeWebPersistence()
  const record = await (await getDatabase()).get('state', CURRENT_MESSAGES_KEY)
  return (record?.value as ChatMessage[] | undefined) || []
}

export async function setWebCurrentMessages(messages: ChatMessage[]): Promise<void> {
  await initializeWebPersistence()
  try {
    await (
      await getDatabase()
    ).put('state', {
      key: CURRENT_MESSAGES_KEY,
      value: prepareMessagesForWebStorage(messages),
    })
  } catch (error) {
    throw new PersistenceError('Failed to save chat history', { cause: error })
  }
}

export async function getWebHistoryRecords(): Promise<WebHistoryRecord[]> {
  await initializeWebPersistence()
  return (await (await getDatabase()).getAll('histories')).sort(
    (left, right) => right.history.timestamp - left.history.timestamp,
  )
}

export async function getWebHistoryRecord(id: string): Promise<WebHistoryRecord | undefined> {
  await initializeWebPersistence()
  return (await getDatabase()).get('histories', id)
}

export async function putWebHistoryRecord(
  history: ChatHistory,
  messages: ChatMessage[],
): Promise<void> {
  await initializeWebPersistence()
  try {
    await (
      await getDatabase()
    ).put('histories', {
      id: history.id,
      history: JSON.parse(JSON.stringify(history)) as ChatHistory,
      messages: prepareMessagesForWebStorage(messages),
    })
  } catch (error) {
    throw new PersistenceError('Failed to save history', { cause: error })
  }
}

export async function deleteWebHistoryRecords(ids: string[]): Promise<void> {
  await initializeWebPersistence()
  try {
    const transaction = (await getDatabase()).transaction('histories', 'readwrite')
    const requests = ids.map((id) => transaction.store.delete(id))
    await Promise.all([...requests, transaction.done])
  } catch (error) {
    throw new PersistenceError('Failed to delete history', { cause: error })
  }
}

export async function clearWebHistoryRecords(): Promise<void> {
  await initializeWebPersistence()
  try {
    await (await getDatabase()).clear('histories')
  } catch (error) {
    throw new PersistenceError('Failed to clear history', { cause: error })
  }
}

export async function putWebImage(
  key: string,
  blob: Blob,
  timestamp: number,
  mimeType = blob.type || 'image/png',
): Promise<void> {
  await initializeWebPersistence()
  try {
    await (
      await getDatabase()
    ).put('images', {
      key,
      blob,
      mimeType,
      byteSize: blob.size,
      timestamp,
    })
  } catch (error) {
    throw new PersistenceError('Failed to save image', { cause: error })
  }
}

export async function getWebImage(key: string): Promise<Blob | undefined> {
  await initializeWebPersistence()
  return (await (await getDatabase()).get('images', key))?.blob
}

export async function deleteWebImages(keys: string[]): Promise<void> {
  await initializeWebPersistence()
  const transaction = (await getDatabase()).transaction('images', 'readwrite')
  const requests = keys.map((key) => transaction.store.delete(key))
  await Promise.all([...requests, transaction.done])
}

export async function getWebReferencedImageKeys(): Promise<Set<string>> {
  const [currentMessages, histories] = await Promise.all([
    getWebCurrentMessages(),
    getWebHistoryRecords(),
  ])
  const keys = new Set<string>()
  const collect = (messages: ChatMessage[]) => {
    messages.forEach((message) => {
      ;[...(message.attachments || []), ...(message.images || [])].forEach((image) => {
        if (image.webStorageKey) keys.add(image.webStorageKey)
      })
      message.generation?.attachments?.forEach((image) => {
        if (image.webStorageKey) keys.add(image.webStorageKey)
      })
    })
  }
  collect(currentMessages)
  histories.forEach((history) => collect(history.messages))
  return keys
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export async function prepareMessagesForWebExport(messages: ChatMessage[]): Promise<ChatMessage[]> {
  const exportImage = async <T extends GeneratedImage>(image: T): Promise<T> => {
    if (!image.webStorageKey) return image
    const blob = await getWebImage(image.webStorageKey)
    if (!blob) throw new PersistenceError('Failed to export image')
    const base64 = await blobToBase64(blob)
    const portableImage = { ...image }
    delete portableImage.webStorageKey
    return {
      ...portableImage,
      url:
        image.originalUrl || `data:${image.mimeType || blob.type || 'image/png'};base64,${base64}`,
      base64,
    } as T
  }

  return Promise.all(
    messages.map(async (message) => ({
      ...message,
      attachments: message.attachments
        ? await Promise.all(
            message.attachments.map(async (attachment) => ({
              ...(await exportImage(attachment)),
              name: attachment.name,
            })),
          )
        : undefined,
      images: message.images ? await Promise.all(message.images.map(exportImage)) : undefined,
      generation: message.generation
        ? {
            ...message.generation,
            attachments: message.generation.attachments
              ? await Promise.all(
                  message.generation.attachments.map(async (attachment) => ({
                    ...(await exportImage(attachment)),
                    name: attachment.name,
                  })),
                )
              : undefined,
          }
        : undefined,
    })),
  )
}

export async function syncWebHistoryRecords(list: ChatHistory[]): Promise<void> {
  await initializeWebPersistence()
  const database = await getDatabase()
  const existingRecords = await database.getAll('histories')
  const existingById = new Map(existingRecords.map((record) => [record.id, record]))
  const nextIds = new Set(list.map((history) => history.id))

  try {
    const transaction = database.transaction('histories', 'readwrite')
    const requests = [
      ...existingRecords
        .filter((existing) => !nextIds.has(existing.id))
        .map((existing) => transaction.store.delete(existing.id)),
      ...list.map((history) => {
        const existing = existingById.get(history.id)
        return transaction.store.put({
          id: history.id,
          history: JSON.parse(JSON.stringify(history)) as ChatHistory,
          messages: existing?.messages || [],
        })
      }),
    ]
    await Promise.all([...requests, transaction.done])
  } catch (error) {
    throw new PersistenceError('Failed to save history list', { cause: error })
  }
}

export async function resetWebPersistenceForTests(): Promise<void> {
  await initializationPromise?.catch(() => undefined)
  const database = await databasePromise?.catch(() => null)
  if (database) {
    const transaction = database.transaction(['state', 'histories', 'images'], 'readwrite')
    const requests = [
      transaction.objectStore('state').clear(),
      transaction.objectStore('histories').clear(),
      transaction.objectStore('images').clear(),
    ]
    await Promise.all([...requests, transaction.done])
  }
  initializationPromise = null
}
