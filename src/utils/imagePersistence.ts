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

export function createDataUrlFromBase64(base64: string, mimeType = 'image/png'): string {
  return `data:${mimeType};base64,${base64}`
}

// blob URL 按 image.id 缓存复用，供仍需要 object URL 的降级路径使用。
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
          ? createDataUrlFromBase64(attachment.base64, attachment.mimeType)
          : attachment.url,
      })),
      images: msg.images?.map((img) => ({
        ...img,
        url: img.base64 ? createDataUrlFromBase64(img.base64, img.mimeType) : img.url,
      })),
    }
  })
}

export function stripBase64FromMessages(messages: ChatMessage[]): ChatMessage[] {
  function stripImageData<T extends GeneratedImage>(image: T): T {
    const isDurableUrl = (url: string | undefined): url is string =>
      Boolean(url && !url.startsWith('data:') && !url.startsWith('blob:'))
    const fallbackUrl = isDurableUrl(image.url)
      ? image.url
      : isDurableUrl(image.originalUrl)
        ? image.originalUrl
        : image.localPath || image.url

    if (!image.localPath && !isDurableUrl(image.url) && !isDurableUrl(image.originalUrl)) {
      return image
    }

    return {
      ...image,
      base64: undefined,
      url: isDurableUrl(image.url) ? image.url : fallbackUrl,
    }
  }

  return messages.map((msg) => {
    if (!msg.images && !msg.attachments) return msg

    return {
      ...msg,
      attachments: msg.attachments?.map(stripImageData),
      images: msg.images?.map(stripImageData),
    }
  })
}

export async function resolveStoredImageUrls(messages: ChatMessage[]): Promise<ChatMessage[]> {
  const repository = getImageRepository()

  async function resolveImage<T extends GeneratedImage>(image: T): Promise<T> {
    try {
      return (await repository.resolveDisplayUrl(image)) as T
    } catch (error) {
      console.warn('Failed to resolve stored image URL:', error)
      return image
    }
  }

  return Promise.all(
    messages.map(async (msg) => {
      if (!msg.images && !msg.attachments) return msg

      const attachments = msg.attachments
        ? await Promise.all(
            msg.attachments.map(async (attachment) => ({
              ...(await resolveImage(attachment)),
              name: attachment.name,
            })),
          )
        : undefined

      const images = msg.images
        ? await Promise.all(msg.images.map((image) => resolveImage(image)))
        : undefined

      return {
        ...msg,
        attachments,
        images,
      }
    }),
  )
}
