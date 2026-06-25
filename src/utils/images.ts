import type { ChatAttachment, GeneratedImage, ImageGenerationResponse } from '../types'
import { getImageRepository } from '../platform/imageRepository'
import { createBlobUrlFromBase64 } from './imagePersistence'
import { generateId } from './storage'

type ImageResponseItem = ImageGenerationResponse['data'][number]

export function isBrowserReadableImageUrl(url: string): boolean {
  return url.startsWith('blob:') || url.startsWith('data:')
}

export function isExternalImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:', 'data:', 'blob:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

export function createImageUrlFromResponseItem(item: ImageResponseItem): string {
  if (item.b64_json) {
    return createBlobUrlFromBase64(item.b64_json)
  }

  return item.url || ''
}

export function buildGeneratedImagesFromResponse(
  response: ImageGenerationResponse,
  options: {
    sourcePrompt: string
    sourceMessageId?: string
    idPrefix?: string
  },
): GeneratedImage[] {
  return response.data.map((item, index) => {
    const id = options.idPrefix
      ? `${options.idPrefix}-${generateId()}`
      : generateId()

    return {
      id,
      url: createImageUrlFromResponseItem(item),
      base64: item.b64_json,
      timestamp: Date.now() + index,
      sourcePrompt: options.sourcePrompt,
      sourceMessageId: options.sourceMessageId,
    }
  })
}

export async function persistGeneratedImagesFromResponse(
  response: ImageGenerationResponse,
  options: {
    sourcePrompt: string
    sourceMessageId?: string
    idPrefix?: string
  },
): Promise<GeneratedImage[]> {
  const repository = getImageRepository()

  return Promise.all(response.data.map((item, index) => {
    const id = options.idPrefix
      ? `${options.idPrefix}-${generateId()}`
      : generateId()

    return repository.saveGeneratedImage({
      id,
      b64Json: item.b64_json,
      url: item.url,
      timestamp: Date.now() + index,
      sourcePrompt: options.sourcePrompt,
      sourceMessageId: options.sourceMessageId,
    })
  }))
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

export async function persistChatAttachments(
  files: File[],
  options: {
    sourcePrompt?: string
  } = {},
): Promise<ChatAttachment[]> {
  const repository = getImageRepository()

  return Promise.all(files.map(async (file, index) => {
    const mimeType = file.type || 'image/png'
    const savedImage = await repository.saveGeneratedImage({
      id: `attachment-${generateId()}`,
      b64Json: await blobToBase64(file),
      mimeType,
      timestamp: Date.now() + index,
      sourcePrompt: options.sourcePrompt,
    })

    return {
      ...savedImage,
      name: file.name,
      mimeType,
      byteSize: file.size || savedImage.byteSize,
    }
  }))
}
