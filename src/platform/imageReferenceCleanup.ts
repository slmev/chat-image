import type { ChatHistory, ChatMessage, GeneratedImage } from '../types'
import { STORAGE_KEYS } from '../utils/constants'
import { getImageRepository } from './imageRepository'
import {
  HISTORY_LIST_KEY,
  HISTORY_MESSAGES_PREFIX,
  getMetadataValue,
} from './metadataStore'
import { isTauriRuntime } from './runtime'

const IMAGE_DIR = 'images'

export interface LocalImageStorageStats {
  totalCount: number
  totalBytes: number
  orphanCount: number
  orphanBytes: number
}

export interface OrphanImageCleanupResult extends LocalImageStorageStats {
  deletedCount: number
  deletedBytes: number
  failedCount: number
}

interface LocalImageFile {
  name: string
  localPath: string
  byteSize: number
}

const EMPTY_STATS: LocalImageStorageStats = {
  totalCount: 0,
  totalBytes: 0,
  orphanCount: 0,
  orphanBytes: 0,
}

function collectLocalPaths(messages: ChatMessage[]): Set<string> {
  const paths = new Set<string>()
  for (const message of messages) {
    for (const image of message.images || []) {
      if (image.localPath) {
        paths.add(image.localPath)
      }
    }
  }
  return paths
}

async function getAllReferencedLocalPaths(): Promise<Set<string>> {
  const references = new Set<string>()
  const currentMessages = await getMetadataValue<ChatMessage[]>(STORAGE_KEYS.CHAT_HISTORY, [])
  collectLocalPaths(currentMessages).forEach(path => references.add(path))

  const historyList = await getMetadataValue<ChatHistory[]>(HISTORY_LIST_KEY, [])
  await Promise.all(historyList.map(async history => {
    const messages = await getMetadataValue<ChatMessage[]>(
      HISTORY_MESSAGES_PREFIX + history.id,
      [],
    )
    collectLocalPaths(messages).forEach(path => references.add(path))
  }))

  return references
}

async function listLocalImageFiles(): Promise<LocalImageFile[]> {
  if (!isTauriRuntime()) return []

  const { readDir, stat, BaseDirectory } = await import('@tauri-apps/plugin-fs')
  let entries: Awaited<ReturnType<typeof readDir>>
  try {
    entries = await readDir(IMAGE_DIR, { baseDir: BaseDirectory.AppData })
  } catch {
    return []
  }

  const files = await Promise.all(entries
    .filter(entry => entry.isFile)
    .map(async entry => {
      const localPath = `${IMAGE_DIR}/${entry.name}`
      try {
        const info = await stat(localPath, { baseDir: BaseDirectory.AppData })
        return {
          name: entry.name,
          localPath,
          byteSize: info.size,
        }
      } catch {
        return {
          name: entry.name,
          localPath,
          byteSize: 0,
        }
      }
    }))

  return files
}

async function getOrphanLocalImageFiles(): Promise<{
  files: LocalImageFile[]
  orphanFiles: LocalImageFile[]
}> {
  const files = await listLocalImageFiles()
  if (files.length === 0) {
    return {
      files,
      orphanFiles: [],
    }
  }

  const references = await getAllReferencedLocalPaths()
  return {
    files,
    orphanFiles: files.filter(file => !references.has(file.localPath)),
  }
}

function uniqueImagesByLocalPath(images: GeneratedImage[]): GeneratedImage[] {
  const seen = new Set<string>()
  return images.filter(image => {
    if (!image.localPath || seen.has(image.localPath)) return false
    seen.add(image.localPath)
    return true
  })
}

export async function deleteUnreferencedLocalImages(
  candidates: GeneratedImage[],
): Promise<void> {
  if (!isTauriRuntime()) return

  const localImages = uniqueImagesByLocalPath(candidates)
  if (localImages.length === 0) return

  const references = await getAllReferencedLocalPaths()
  const repository = getImageRepository()
  await Promise.all(localImages.map(async image => {
    if (image.localPath && !references.has(image.localPath)) {
      try {
        await repository.deleteImageFile(image)
      } catch (error) {
        console.warn('Failed to delete unreferenced image file:', error)
      }
    }
  }))
}

export async function getLocalImageStorageStats(): Promise<LocalImageStorageStats> {
  if (!isTauriRuntime()) return { ...EMPTY_STATS }

  const { files, orphanFiles } = await getOrphanLocalImageFiles()
  return {
    totalCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.byteSize, 0),
    orphanCount: orphanFiles.length,
    orphanBytes: orphanFiles.reduce((sum, file) => sum + file.byteSize, 0),
  }
}

export async function cleanupOrphanedLocalImages(): Promise<OrphanImageCleanupResult> {
  if (!isTauriRuntime()) {
    return {
      ...EMPTY_STATS,
      deletedCount: 0,
      deletedBytes: 0,
      failedCount: 0,
    }
  }

  const { files, orphanFiles } = await getOrphanLocalImageFiles()
  const repository = getImageRepository()
  let deletedCount = 0
  let deletedBytes = 0
  let failedCount = 0
  const failedFiles: LocalImageFile[] = []

  await Promise.all(orphanFiles.map(async file => {
    try {
      await repository.deleteImageFile({
        id: file.name,
        url: '',
        localPath: file.localPath,
        byteSize: file.byteSize,
        timestamp: Date.now(),
      })
      deletedCount += 1
      deletedBytes += file.byteSize
    } catch (error) {
      failedCount += 1
      failedFiles.push(file)
      console.warn('Failed to delete orphan image file:', error)
    }
  }))

  return {
    totalCount: files.length - deletedCount,
    totalBytes: files.reduce((sum, file) => sum + file.byteSize, 0) - deletedBytes,
    orphanCount: failedFiles.length,
    orphanBytes: failedFiles.reduce((sum, file) => sum + file.byteSize, 0),
    deletedCount,
    deletedBytes,
    failedCount,
  }
}
