import type { ChatHistory, ChatMessage, GeneratedImage } from '../types'
import { STORAGE_KEYS } from '../utils/constants'
import { getImageRepository } from './imageRepository'
import {
  HISTORY_LIST_KEY,
  HISTORY_MESSAGES_PREFIX,
  getMetadataValue,
} from './metadataStore'
import { isTauriRuntime } from './runtime'

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
