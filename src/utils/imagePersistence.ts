import type { ChatMessage } from '../types'
import { getImageRepository } from '../platform/imageRepository'

export function createBlobUrlFromBase64(base64: string): string {
  const byteChars = atob(base64)
  const byteArray = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i)
  }

  const blob = new Blob([byteArray], { type: 'image/png' })
  return URL.createObjectURL(blob)
}

export function reviveStoredImageUrls(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(msg => {
    if (!msg.images) return msg

    return {
      ...msg,
      images: msg.images.map(img => ({
        ...img,
        url: img.base64 ? createBlobUrlFromBase64(img.base64) : img.url,
      })),
    }
  })
}

export function stripBase64FromMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(msg => {
    if (!msg.images) return msg

    return {
      ...msg,
      images: msg.images.map(img => ({
        ...img,
        base64: undefined,
      })),
    }
  })
}

export async function resolveStoredImageUrls(messages: ChatMessage[]): Promise<ChatMessage[]> {
  const repository = getImageRepository()

  return Promise.all(messages.map(async msg => {
    if (!msg.images) return msg

    const images = await Promise.all(
      msg.images.map(image => repository.resolveDisplayUrl(image)),
    )

    return {
      ...msg,
      images,
    }
  }))
}
