import type { ChatMessage, GeneratedImage } from '../types'
import { getImageRepository } from '../platform/imageRepository'

export function createBlobUrlFromBase64(base64: string, mimeType = 'image/png'): string {
  const byteChars = atob(base64)
  const byteArray = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i)
  }

  const blob = new Blob([byteArray], { type: mimeType })
  return URL.createObjectURL(blob)
}

// blob URL 按 image.id 缓存复用：reviveStoredImageUrls / resolveDisplayUrl 会被反复调用
// （如每次读取历史、切换会话），若每次都新建 URL 而不释放，旧 URL 会无界泄漏。
const blobUrlCache = new Map<string, string>()

export function getCachedBlobUrl(key: string, base64: string, mimeType?: string): string {
  const existing = blobUrlCache.get(key)
  if (existing) return existing

  const url = createBlobUrlFromBase64(base64, mimeType)
  blobUrlCache.set(key, url)
  return url
}

export function revokeCachedBlobUrls(keys: Iterable<string>): void {
  for (const key of keys) {
    const url = blobUrlCache.get(key)
    if (url) {
      if (typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url)
      }
      blobUrlCache.delete(key)
    }
  }
}

export function revokeCachedBlobUrlsForImages(images: GeneratedImage[]): void {
  revokeCachedBlobUrls(images.map((image) => image.id).filter(Boolean))
}

export function reviveStoredImageUrls(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((msg) => {
    if (!msg.images && !msg.attachments) return msg

    return {
      ...msg,
      attachments: msg.attachments?.map((attachment) => ({
        ...attachment,
        url: attachment.base64
          ? getCachedBlobUrl(attachment.id, attachment.base64, attachment.mimeType)
          : attachment.url,
      })),
      images: msg.images?.map((img) => ({
        ...img,
        url: img.base64 ? getCachedBlobUrl(img.id, img.base64, img.mimeType) : img.url,
      })),
    }
  })
}

export function stripBase64FromMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((msg) => {
    if (!msg.images && !msg.attachments) return msg

    return {
      ...msg,
      attachments: msg.attachments?.map((attachment) => ({
        ...attachment,
        base64: undefined,
      })),
      images: msg.images?.map((img) => ({
        ...img,
        base64: undefined,
      })),
    }
  })
}

export async function resolveStoredImageUrls(messages: ChatMessage[]): Promise<ChatMessage[]> {
  const repository = getImageRepository()

  return Promise.all(
    messages.map(async (msg) => {
      if (!msg.images && !msg.attachments) return msg

      const attachments = msg.attachments
        ? await Promise.all(
            msg.attachments.map(async (attachment) => ({
              ...(await repository.resolveDisplayUrl(attachment)),
              name: attachment.name,
            })),
          )
        : undefined

      const images = msg.images
        ? await Promise.all(msg.images.map((image) => repository.resolveDisplayUrl(image)))
        : undefined

      return {
        ...msg,
        attachments,
        images,
      }
    }),
  )
}
