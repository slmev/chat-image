import type { ChatAttachment, ChatMessage, GeneratedImage, GenerationMetadata } from '../types'
import { normalizeGenerationMetadata } from './generation'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

function parseImage(value: unknown): GeneratedImage | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.id.length > 100 ||
    typeof value.url !== 'string' ||
    typeof value.timestamp !== 'number' ||
    !Number.isFinite(value.timestamp) ||
    !isOptionalString(value.base64) ||
    !isOptionalString(value.webStorageKey) ||
    !isOptionalString(value.localPath) ||
    !isOptionalString(value.originalUrl) ||
    !isOptionalString(value.mimeType) ||
    !isOptionalFiniteNumber(value.byteSize) ||
    !isOptionalString(value.sourcePrompt) ||
    !isOptionalString(value.sourceMessageId)
  ) {
    return null
  }

  return value as unknown as GeneratedImage
}

function parseAttachment(value: unknown): ChatAttachment | null {
  const image = parseImage(value)
  if (!image || !isRecord(value) || typeof value.name !== 'string' || value.name.length > 255) {
    return null
  }
  return value as unknown as ChatAttachment
}

function parseImageList(value: unknown): GeneratedImage[] | undefined | null {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return null
  const images = value.map(parseImage)
  return images.every((image): image is GeneratedImage => image !== null) ? images : null
}

function parseAttachmentList(value: unknown): ChatAttachment[] | undefined | null {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return null
  const attachments = value.map(parseAttachment)
  return attachments.every((attachment): attachment is ChatAttachment => attachment !== null)
    ? attachments
    : null
}

function parseGeneration(value: unknown): GenerationMetadata | undefined | null {
  if (value === undefined) return undefined
  if (!isRecord(value)) return null

  const validAttachmentIds =
    value.attachmentIds === undefined ||
    (Array.isArray(value.attachmentIds) &&
      value.attachmentIds.every((attachmentId) => typeof attachmentId === 'string'))
  const attachments = parseAttachmentList(value.attachments)
  const style = value.style
  const validStyle =
    style === undefined ||
    (isRecord(style) &&
      typeof style.id === 'string' &&
      typeof style.name === 'string' &&
      typeof style.description === 'string' &&
      typeof style.promptSuffix === 'string' &&
      typeof style.icon === 'string')

  if (
    typeof value.prompt !== 'string' ||
    typeof value.size !== 'string' ||
    typeof value.quality !== 'string' ||
    typeof value.n !== 'number' ||
    !Number.isFinite(value.n) ||
    !validAttachmentIds ||
    attachments === null ||
    !isOptionalString(value.styleId) ||
    !isOptionalString(value.styleName) ||
    !validStyle
  ) {
    return null
  }

  return normalizeGenerationMetadata({
    ...(value as unknown as GenerationMetadata),
    attachmentIds: Array.isArray(value.attachmentIds) ? value.attachmentIds : [],
    attachments,
  })
}

function parseMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null

  const attachments = parseAttachmentList(value.attachments)
  const images = parseImageList(value.images)
  const generation = parseGeneration(value.generation)
  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.id.length > 100 ||
    (value.type !== 'user' && value.type !== 'assistant') ||
    typeof value.content !== 'string' ||
    value.content.length === 0 ||
    value.content.length > 10000 ||
    typeof value.timestamp !== 'number' ||
    !Number.isFinite(value.timestamp) ||
    value.timestamp <= 0 ||
    (value.status !== 'pending' &&
      value.status !== 'success' &&
      value.status !== 'error' &&
      value.status !== 'canceled') ||
    !isOptionalString(value.error) ||
    (value.isFavorite !== undefined && typeof value.isFavorite !== 'boolean') ||
    attachments === null ||
    images === null ||
    generation === null
  ) {
    return null
  }

  return {
    ...(value as unknown as ChatMessage),
    attachments,
    images,
    generation,
    isFavorite: value.isFavorite ?? false,
  }
}

export function parseImportedMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value)) return null

  const ids = new Set<string>()
  const messages: ChatMessage[] = []
  for (const item of value) {
    const message = parseMessage(item)
    if (!message || ids.has(message.id)) return null
    ids.add(message.id)
    messages.push(message)
  }
  return messages
}
