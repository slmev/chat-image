import JSZip from 'jszip'
import type { ChatHistory, ChatMessage, DesktopHistoryExportData, GeneratedImage } from '../types'
import { stripBase64FromMessages } from '../utils/imagePersistence'
import { getImageRepository } from './imageRepository'
import { isTauriRuntime } from './runtime'

const ZIP_HISTORY_FILE = 'history.json'
const ZIP_IMAGE_DIR = 'images'

export interface DesktopHistoryExportInput {
  currentMessages: ChatMessage[]
  historyList: ChatHistory[]
  historyMessages: Record<string, ChatMessage[]>
  exportedAt?: number
}

export type DesktopHistoryExportResult =
  | { canceled: true }
  | { canceled: false; path: string; imageCount: number; missingImageCount: number }

interface ZipBuildResult {
  bytes: Uint8Array
  imageCount: number
  missingImageCount: number
}

function cloneMessages(messages: ChatMessage[]): ChatMessage[] {
  return stripBase64FromMessages(messages).map(message => ({
    ...message,
    images: message.images?.map(image => ({ ...image })),
  }))
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || 'image'
}

function uniqueZipImagePath(localPath: string, usedPaths: Set<string>): string {
  const name = basename(localPath).replace(/[^A-Za-z0-9._-]/g, '_')
  const dotIndex = name.lastIndexOf('.')
  const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name
  const extension = dotIndex > 0 ? name.slice(dotIndex) : ''
  let candidate = `${ZIP_IMAGE_DIR}/${name}`
  let suffix = 2

  while (usedPaths.has(candidate)) {
    candidate = `${ZIP_IMAGE_DIR}/${stem}-${suffix}${extension}`
    suffix += 1
  }

  usedPaths.add(candidate)
  return candidate
}

function collectLocalImages(messages: ChatMessage[], imagesByPath: Map<string, GeneratedImage>): void {
  messages.forEach(message => {
    message.images?.forEach(image => {
      if (image.localPath && !imagesByPath.has(image.localPath)) {
        imagesByPath.set(image.localPath, image)
      }
    })
  })
}

function rewriteImagePaths(
  messages: ChatMessage[],
  imagePathMap: Map<string, string>,
): ChatMessage[] {
  return messages.map(message => {
    if (!message.images) return message

    return {
      ...message,
      images: message.images.map(image => {
        if (!image.localPath) return image

        const localPath = imagePathMap.get(image.localPath) || image.localPath
        return {
          ...image,
          url: localPath,
          localPath,
        }
      }),
    }
  })
}

async function addImagesToZip(
  zip: JSZip,
  imagesByPath: Map<string, GeneratedImage>,
  imagePathMap: Map<string, string>,
): Promise<{ imageCount: number; missingImageCount: number }> {
  const repository = getImageRepository()
  let imageCount = 0
  let missingImageCount = 0

  for (const [localPath, image] of imagesByPath) {
    const zipPath = imagePathMap.get(localPath)
    if (!zipPath) continue

    try {
      const blob = await repository.readImageBlob(image)
      zip.file(zipPath, new Uint8Array(await blob.arrayBuffer()))
      imageCount += 1
    } catch (error) {
      missingImageCount += 1
      console.warn('Failed to include local image in history export:', error)
    }
  }

  return { imageCount, missingImageCount }
}

export async function buildDesktopHistoryExportZip(
  input: DesktopHistoryExportInput,
): Promise<ZipBuildResult> {
  const zip = new JSZip()
  const currentMessages = cloneMessages(input.currentMessages)
  const historyList = input.historyList.map(item => ({ ...item }))
  const historyMessages = Object.fromEntries(
    Object.entries(input.historyMessages).map(([historyId, messages]) => [
      historyId,
      cloneMessages(messages),
    ]),
  )

  const imagesByPath = new Map<string, GeneratedImage>()
  const imagePathMap = new Map<string, string>()
  const usedZipPaths = new Set<string>()

  collectLocalImages(currentMessages, imagesByPath)
  Object.values(historyMessages).forEach(messages => collectLocalImages(messages, imagesByPath))

  imagesByPath.forEach((_image, localPath) => {
    imagePathMap.set(localPath, uniqueZipImagePath(localPath, usedZipPaths))
  })

  const imageStats = await addImagesToZip(zip, imagesByPath, imagePathMap)
  const data: DesktopHistoryExportData = {
    version: 2,
    exportedAt: input.exportedAt ?? Date.now(),
    kind: 'desktop-zip',
    currentMessages: rewriteImagePaths(currentMessages, imagePathMap),
    historyList,
    historyMessages: Object.fromEntries(
      Object.entries(historyMessages).map(([historyId, messages]) => [
        historyId,
        rewriteImagePaths(messages, imagePathMap),
      ]),
    ),
  }

  zip.file(ZIP_HISTORY_FILE, JSON.stringify(data, null, 2))

  return {
    bytes: await zip.generateAsync({ type: 'uint8array' }),
    ...imageStats,
  }
}

export async function exportDesktopHistoryZip(
  input: DesktopHistoryExportInput,
): Promise<DesktopHistoryExportResult> {
  if (!isTauriRuntime()) {
    throw new Error('桌面 ZIP 导出仅支持桌面端')
  }

  const { save } = await import('@tauri-apps/plugin-dialog')
  const { writeFile } = await import('@tauri-apps/plugin-fs')

  const target = await save({
    title: '导出历史记录',
    defaultPath: `chat-image-history-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  })

  if (!target) return { canceled: true }

  const zip = await buildDesktopHistoryExportZip(input)
  await writeFile(target, zip.bytes)

  return {
    canceled: false,
    path: target,
    imageCount: zip.imageCount,
    missingImageCount: zip.missingImageCount,
  }
}
