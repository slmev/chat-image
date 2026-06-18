import type { GeneratedImage } from '../types'
import { createBlobUrlFromBase64 } from '../utils/imagePersistence'
import { isBrowserReadableImageUrl, isExternalImageUrl } from '../utils/images'
import type { ImageRepository, SaveGeneratedImageInput } from './imageRepository'

function base64ToBlob(base64: string, mimeType = 'image/png'): Blob {
  const byteChars = atob(base64)
  const byteArray = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i)
  }
  return new Blob([byteArray], { type: mimeType })
}

export const webImageRepository: ImageRepository = {
  async saveGeneratedImage(input: SaveGeneratedImageInput): Promise<GeneratedImage> {
    const url = input.b64Json ? createBlobUrlFromBase64(input.b64Json) : input.url || ''

    return {
      id: input.id,
      url,
      base64: input.b64Json,
      originalUrl: input.url,
      mimeType: 'image/png',
      byteSize: input.b64Json ? base64ToBlob(input.b64Json).size : undefined,
      timestamp: input.timestamp,
      sourcePrompt: input.sourcePrompt,
      sourceMessageId: input.sourceMessageId,
    }
  },

  async resolveDisplayUrl(image: GeneratedImage): Promise<GeneratedImage> {
    if (image.base64) {
      return {
        ...image,
        url: createBlobUrlFromBase64(image.base64),
      }
    }
    return image
  },

  async readImageBlob(image: GeneratedImage): Promise<Blob> {
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

  async deleteImageFile(): Promise<void> {
    return
  },
}
