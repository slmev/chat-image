import type { ChatMessage } from '../types'
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

export function reviveStoredImageUrls(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(msg => {
    if (!msg.images && !msg.attachments) return msg

    return {
      ...msg,
      attachments: msg.attachments?.map(attachment => ({
        ...attachment,
        url: attachment.base64
          ? createBlobUrlFromBase64(attachment.base64, attachment.mimeType)
          : attachment.url,
      })),
      images: msg.images?.map(img => ({
        ...img,
        url: img.base64 ? createBlobUrlFromBase64(img.base64, img.mimeType) : img.url,
      })),
    }
  })
}

export function stripBase64FromMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(msg => {
    if (!msg.images && !msg.attachments) return msg

    return {
      ...msg,
      attachments: msg.attachments?.map(attachment => ({
        ...attachment,
        base64: undefined,
      })),
      images: msg.images?.map(img => ({
        ...img,
        base64: undefined,
      })),
    }
  })
}

export async function resolveStoredImageUrls(messages: ChatMessage[]): Promise<ChatMessage[]> {
  const repository = getImageRepository()

  return Promise.all(messages.map(async msg => {
    if (!msg.images && !msg.attachments) return msg

    const attachments = msg.attachments
      ? await Promise.all(msg.attachments.map(async attachment => ({
          ...(await repository.resolveDisplayUrl(attachment)),
          name: attachment.name,
        })))
      : undefined

    const images = msg.images
      ? await Promise.all(msg.images.map(image => repository.resolveDisplayUrl(image)))
      : undefined

    return {
      ...msg,
      attachments,
      images,
    }
  }))
}
