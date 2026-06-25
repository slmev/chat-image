import type { GeneratedImage } from '../types'
import { isExternalImageUrl } from '../utils/images'
import type { ImageRepository, SaveGeneratedImageInput } from './imageRepository'
import { openLocalImage } from './localImageActions'

const IMAGE_DIR = 'images'

function base64ToBytes(base64: string): Uint8Array {
  const byteChars = atob(base64)
  const bytes = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i)
  }
  return bytes
}

function extensionFromMimeType(mimeType?: string): string {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/gif') return 'gif'
  return 'png'
}

function bytesToBlob(bytes: Uint8Array, mimeType = 'image/png'): Blob {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  return new Blob([buffer], { type: mimeType })
}

function fallbackGeneratedImage(input: SaveGeneratedImageInput): GeneratedImage {
  if (input.b64Json) {
    try {
      const bytes = base64ToBytes(input.b64Json)
      const mimeType = input.mimeType || 'image/png'
      return {
        id: input.id,
        url: URL.createObjectURL(bytesToBlob(bytes, mimeType)),
        base64: input.b64Json,
        originalUrl: input.url,
        mimeType,
        byteSize: bytes.byteLength,
        timestamp: input.timestamp,
        sourcePrompt: input.sourcePrompt,
        sourceMessageId: input.sourceMessageId,
      }
    } catch {
      // Fall through to the original URL fallback when the response payload is malformed.
    }
  }

  return {
    id: input.id,
    url: input.url || '',
    originalUrl: input.url,
    timestamp: input.timestamp,
    sourcePrompt: input.sourcePrompt,
    sourceMessageId: input.sourceMessageId,
  }
}

async function readLocalBytes(localPath: string): Promise<Uint8Array> {
  const { readFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
  return readFile(localPath, { baseDir: BaseDirectory.AppData })
}

async function writeLocalBytes(localPath: string, bytes: Uint8Array): Promise<void> {
  const { mkdir, writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
  await mkdir(IMAGE_DIR, { baseDir: BaseDirectory.AppData, recursive: true })
  await writeFile(localPath, bytes, { baseDir: BaseDirectory.AppData })
}

async function downloadExternalImage(url: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const { fetch } = await import('@tauri-apps/plugin-http')
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('下载远程图片失败')
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/png'
  const buffer = await response.arrayBuffer()
  return { bytes: new Uint8Array(buffer), mimeType }
}

async function displayUrlFromLocalPath(localPath: string, mimeType = 'image/png'): Promise<string> {
  const bytes = await readLocalBytes(localPath)
  return URL.createObjectURL(bytesToBlob(bytes, mimeType))
}

export const tauriImageRepository: ImageRepository = {
  async saveGeneratedImage(input: SaveGeneratedImageInput): Promise<GeneratedImage> {
    try {
      const downloaded = input.b64Json
        ? { bytes: base64ToBytes(input.b64Json), mimeType: input.mimeType || 'image/png' }
        : input.url && isExternalImageUrl(input.url)
          ? await downloadExternalImage(input.url)
          : null

      if (!downloaded) {
        return {
          id: input.id,
          url: input.url || '',
          originalUrl: input.url,
          timestamp: input.timestamp,
          sourcePrompt: input.sourcePrompt,
          sourceMessageId: input.sourceMessageId,
        }
      }

      const extension = extensionFromMimeType(downloaded.mimeType)
      const localPath = `${IMAGE_DIR}/${input.id}.${extension}`
      await writeLocalBytes(localPath, downloaded.bytes)

      return {
        id: input.id,
        url: URL.createObjectURL(bytesToBlob(downloaded.bytes, downloaded.mimeType)),
        localPath,
        originalUrl: input.url,
        mimeType: downloaded.mimeType,
        byteSize: downloaded.bytes.byteLength,
        timestamp: input.timestamp,
        sourcePrompt: input.sourcePrompt,
        sourceMessageId: input.sourceMessageId,
      }
    } catch (error) {
      console.warn('Failed to persist generated image locally:', error)
      return fallbackGeneratedImage(input)
    }
  },

  async resolveDisplayUrl(image: GeneratedImage): Promise<GeneratedImage> {
    if (image.localPath) {
      return {
        ...image,
        url: await displayUrlFromLocalPath(image.localPath, image.mimeType),
        base64: undefined,
      }
    }

    if (image.base64) {
      return this.saveGeneratedImage({
        id: image.id,
        b64Json: image.base64,
        url: image.originalUrl,
        mimeType: image.mimeType,
        timestamp: image.timestamp,
        sourcePrompt: image.sourcePrompt,
        sourceMessageId: image.sourceMessageId,
      })
    }

    if (isExternalImageUrl(image.url)) {
      return this.saveGeneratedImage({
        id: image.id,
        url: image.url,
        timestamp: image.timestamp,
        sourcePrompt: image.sourcePrompt,
        sourceMessageId: image.sourceMessageId,
      })
    }

    return image
  },

  async readImageBlob(image: GeneratedImage): Promise<Blob> {
    if (image.localPath) {
      const bytes = await readLocalBytes(image.localPath)
      return bytesToBlob(bytes, image.mimeType)
    }

    if (image.base64) {
      return bytesToBlob(base64ToBytes(image.base64), image.mimeType)
    }

    throw new Error('该图片没有可读取的本地文件')
  },

  async exportImage(image: GeneratedImage): Promise<void> {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')

    const target = await save({
      title: '保存图片',
      defaultPath: `ai-image-${image.id}.${extensionFromMimeType(image.mimeType)}`,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    })

    if (!target) return

    const blob = await this.readImageBlob(image)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    await writeFile(target, bytes)
  },

  async deleteImageFile(image: GeneratedImage): Promise<void> {
    if (!image.localPath) return
    const { remove, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    if (await exists(image.localPath, { baseDir: BaseDirectory.AppData })) {
      await remove(image.localPath, { baseDir: BaseDirectory.AppData })
    }
  },
}

export async function openImageInSystemViewer(image: GeneratedImage): Promise<void> {
  await openLocalImage(image)
}
