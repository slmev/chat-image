import type { GeneratedImage } from '../types'
import { isTauriRuntime } from './runtime'
import { webImageRepository } from './webImageRepository'
import { tauriImageRepository } from './tauriImageRepository'

export interface SaveGeneratedImageInput {
  id: string
  url?: string
  b64Json?: string
  mimeType?: string
  timestamp: number
  sourcePrompt?: string
  sourceMessageId?: string
}

export interface ImageRepository {
  saveGeneratedImage(input: SaveGeneratedImageInput): Promise<GeneratedImage>
  resolveDisplayUrl(image: GeneratedImage): Promise<GeneratedImage>
  readImageBlob(image: GeneratedImage): Promise<Blob>
  exportImage(image: GeneratedImage): Promise<void>
  deleteImageFile(image: GeneratedImage): Promise<void>
}

export function getImageRepository(): ImageRepository {
  return isTauriRuntime() ? tauriImageRepository : webImageRepository
}
