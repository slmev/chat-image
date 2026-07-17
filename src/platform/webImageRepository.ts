import type { GeneratedImage } from '../types'
import { isBrowserReadableImageUrl, isExternalImageUrl } from '../utils/images'
import type {
  ImageRepository,
  ResolveDisplayUrlOptions,
  SaveGeneratedImageInput,
} from './imageRepository'
import { deleteWebImages, getWebImage, putWebImage } from './webPersistence'

const objectUrlCache = new Map<string, string>()

function revokeCachedObjectUrl(key: string): void {
  const url = objectUrlCache.get(key)
  if (!url) return
  URL.revokeObjectURL(url)
  objectUrlCache.delete(key)
}

function base64ToBlob(base64: string, mimeType = 'image/png'): Blob {
  const byteChars = atob(base64)
  const byteArray = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i)
  }
  return new Blob([byteArray], { type: mimeType })
}

async function displayUrlForStorageKey(key: string): Promise<string> {
  const cached = objectUrlCache.get(key)
  if (cached) return cached

  const blob = await getWebImage(key)
  if (!blob) {
    throw new Error('Stored image data is missing')
  }
  const url = URL.createObjectURL(blob)
  objectUrlCache.set(key, url)
  return url
}

export const webImageRepository: ImageRepository = {
  async saveGeneratedImage(input: SaveGeneratedImageInput): Promise<GeneratedImage> {
    const mimeType = input.mimeType || 'image/png'
    let url = input.url || ''
    let byteSize: number | undefined
    let webStorageKey: string | undefined

    if (input.b64Json) {
      const blob = base64ToBlob(input.b64Json, mimeType)
      byteSize = blob.size
      webStorageKey = `web:${input.storageId || input.id}`
      revokeCachedObjectUrl(webStorageKey)
      await putWebImage(webStorageKey, blob, input.timestamp, mimeType)
      url = await displayUrlForStorageKey(webStorageKey)
    }

    return {
      id: input.id,
      url,
      webStorageKey,
      originalUrl: input.url,
      mimeType,
      byteSize,
      timestamp: input.timestamp,
      sourcePrompt: input.sourcePrompt,
      sourceMessageId: input.sourceMessageId,
    }
  },

  async resolveDisplayUrl(
    image: GeneratedImage,
    options?: ResolveDisplayUrlOptions,
  ): Promise<GeneratedImage> {
    if (image.webStorageKey) {
      return {
        ...image,
        url: await displayUrlForStorageKey(image.webStorageKey),
        base64: undefined,
      }
    }
    if (image.base64) {
      return this.saveGeneratedImage({
        id: image.id,
        storageId: options?.storageId,
        b64Json: image.base64,
        url: image.originalUrl,
        mimeType: image.mimeType,
        timestamp: image.timestamp,
        sourcePrompt: image.sourcePrompt,
        sourceMessageId: image.sourceMessageId,
      })
    }
    return image
  },

  async readImageBlob(image: GeneratedImage): Promise<Blob> {
    if (image.webStorageKey) {
      const blob = await getWebImage(image.webStorageKey)
      if (!blob) throw new Error('图片数据不存在')
      return blob
    }
    if (image.base64) {
      return base64ToBlob(image.base64, image.mimeType)
    }

    if (!image.url) {
      throw new Error('图片数据不存在')
    }

    if (!isBrowserReadableImageUrl(image.url) && !isExternalImageUrl(image.url)) {
      throw new Error('图片链接无效')
    }

    const response = await fetch(image.url)
    if (!response.ok) {
      throw new Error('获取图片失败')
    }
    return response.blob()
  },

  async exportImage(image: GeneratedImage): Promise<void> {
    if (isExternalImageUrl(image.url)) {
      const link = document.createElement('a')
      link.href = image.url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      return
    }

    const blob = await this.readImageBlob(image)
    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = `ai-image-${image.id}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(blobUrl)
  },

  async deleteImageFile(image: GeneratedImage): Promise<void> {
    if (!image.webStorageKey) return
    revokeCachedObjectUrl(image.webStorageKey)
    await deleteWebImages([image.webStorageKey])
  },
}

export function revokeWebImageObjectUrls(images: GeneratedImage[]): void {
  images.forEach((image) => {
    if (!image.webStorageKey) return
    revokeCachedObjectUrl(image.webStorageKey)
  })
}
