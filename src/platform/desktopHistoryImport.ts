import JSZip from 'jszip'
import type { ChatHistory, ChatMessage, DesktopHistoryExportData, GeneratedImage } from '../types'
import { parseImportedMessages } from '../utils/chatImportValidation'
import { isTauriRuntime } from './runtime'

const ZIP_HISTORY_FILE = 'history.json'
const ZIP_IMAGE_DIR = 'images'
const MAX_ZIP_BYTES = 250 * 1024 * 1024
const MAX_HISTORY_JSON_BYTES = 10 * 1024 * 1024
const MAX_HISTORY_COUNT = 500
const MAX_TOTAL_MESSAGES = 5000
const MAX_IMAGE_COUNT = 1000
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 1024 * 1024 * 1024

export interface DesktopHistoryImportData {
  currentMessages: ChatMessage[]
  historyList: ChatHistory[]
  historyMessages: Record<string, ChatMessage[]>
  writtenImagePaths: string[]
}

export type DesktopHistoryImportResult =
  | { success: true; data: DesktopHistoryImportData }
  | { success: false; message: string }

export interface DesktopHistoryImportOptions {
  now?: number
}

class DesktopHistoryImportError extends Error {}

interface StreamableZipEntry extends JSZip.JSZipObject {
  internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>
}

function readZipEntryLimited(
  entry: JSZip.JSZipObject,
  maxBytes: number,
  tooLargeMessage: string,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const stream = (entry as StreamableZipEntry).internalStream('uint8array')
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    let settled = false

    stream
      .on('data', (chunk) => {
        if (settled) return

        totalBytes += chunk.byteLength
        if (totalBytes > maxBytes) {
          settled = true
          stream.pause()
          reject(new DesktopHistoryImportError(tooLargeMessage))
          return
        }
        chunks.push(chunk)
      })
      .on('end', () => {
        if (settled) return
        settled = true

        if (chunks.length === 1) {
          resolve(chunks[0])
          return
        }

        const bytes = new Uint8Array(totalBytes)
        let offset = 0
        chunks.forEach((chunk) => {
          bytes.set(chunk, offset)
          offset += chunk.byteLength
        })
        resolve(bytes)
      })
      .on('error', (error) => {
        if (settled) return
        settled = true
        reject(error)
      })
      .resume()
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    attachments: message.attachments?.map((attachment) => ({
      ...attachment,
      base64: undefined,
    })),
    images: message.images?.map((image) => ({
      ...image,
      base64: undefined,
    })),
    generation: message.generation
      ? {
          ...message.generation,
          attachments: message.generation.attachments?.map((attachment) => ({
            ...attachment,
            base64: undefined,
          })),
        }
      : undefined,
  }))
}

function validateMessages(value: unknown): ChatMessage[] {
  const messages = parseImportedMessages(value)
  if (!messages) {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }
  return messages
}

function validateHistory(value: unknown): ChatHistory {
  if (!isRecord(value)) {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.id.length > 100 ||
    typeof value.title !== 'string' ||
    value.title.length === 0 ||
    value.title.length > 1000 ||
    typeof value.timestamp !== 'number' ||
    !Number.isFinite(value.timestamp) ||
    value.timestamp <= 0 ||
    typeof value.messageCount !== 'number' ||
    !Number.isInteger(value.messageCount) ||
    value.messageCount < 0 ||
    typeof value.isFavorite !== 'boolean'
  ) {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  if (
    value.preview !== undefined &&
    (typeof value.preview !== 'string' || value.preview.length > 10000)
  ) {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  return value as unknown as ChatHistory
}

function validateExportData(value: unknown): Omit<
  DesktopHistoryExportData,
  'currentMessages' | 'historyList' | 'historyMessages'
> & {
  currentMessages: ChatMessage[]
  historyList: ChatHistory[]
  historyMessages: Record<string, ChatMessage[]>
} {
  if (!isRecord(value) || value.version !== 2 || value.kind !== 'desktop-zip') {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  if (
    typeof value.exportedAt !== 'number' ||
    !Array.isArray(value.historyList) ||
    !isRecord(value.historyMessages)
  ) {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  const currentMessages = validateMessages(value.currentMessages)
  const historyList = value.historyList.map(validateHistory)
  if (historyList.length > MAX_HISTORY_COUNT) {
    throw new DesktopHistoryImportError(`历史记录数量超过限制（最多 ${MAX_HISTORY_COUNT} 条）`)
  }
  if (new Set(historyList.map((history) => history.id)).size !== historyList.length) {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }
  const historyIds = new Set(historyList.map((history) => history.id))
  const historyMessages = Object.fromEntries(
    Object.entries(value.historyMessages).map(([historyId, messages]) => {
      if (!historyIds.has(historyId)) {
        throw new DesktopHistoryImportError('history.json 格式不正确')
      }
      return [historyId, validateMessages(messages)]
    }),
  )

  for (const history of historyList) {
    if (!Object.prototype.hasOwnProperty.call(historyMessages, history.id)) {
      throw new DesktopHistoryImportError('history.json 格式不正确')
    }
  }

  const totalMessages =
    currentMessages.length +
    Object.values(historyMessages).reduce((sum, messages) => sum + messages.length, 0)
  if (totalMessages > MAX_TOTAL_MESSAGES) {
    throw new DesktopHistoryImportError(`消息数量超过限制（最多 ${MAX_TOTAL_MESSAGES} 条）`)
  }
  const normalizedHistoryList = historyList.map((history) => ({
    ...history,
    messageCount: historyMessages[history.id].length,
  }))

  return {
    version: 2,
    exportedAt: value.exportedAt,
    kind: 'desktop-zip',
    currentMessages,
    historyList: normalizedHistoryList,
    historyMessages,
  }
}

function assertSafeZipImagePath(path: string): void {
  const segments = path.split('/')
  const isUnsafe =
    path.includes('\\') ||
    path.startsWith('/') ||
    !path.startsWith(`${ZIP_IMAGE_DIR}/`) ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')

  if (isUnsafe) {
    throw new DesktopHistoryImportError(`ZIP 包包含不安全的图片路径：${path}`)
  }
}

function collectImagePaths(messages: ChatMessage[], paths: Set<string>): void {
  messages.forEach((message) => {
    message.attachments?.forEach((attachment) => {
      if (!attachment.localPath) return
      assertSafeZipImagePath(attachment.localPath)
      paths.add(attachment.localPath)
    })
    message.images?.forEach((image) => {
      if (!image.localPath) return
      assertSafeZipImagePath(image.localPath)
      paths.add(image.localPath)
    })
    message.generation?.attachments?.forEach((attachment) => {
      if (!attachment.localPath) return
      assertSafeZipImagePath(attachment.localPath)
      paths.add(attachment.localPath)
    })
  })
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() || 'image.png'
}

function splitExtension(filename: string): { stem: string; extension: string } {
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex > 0
    ? { stem: filename.slice(0, dotIndex), extension: filename.slice(dotIndex) }
    : { stem: filename, extension: '' }
}

function sanitizeFilename(filename: string): string {
  const sanitized = filename.replace(/[^A-Za-z0-9._-]/g, '_')
  return sanitized && sanitized !== '.' && sanitized !== '..' ? sanitized : 'image.png'
}

async function appDataPathExists(localPath: string): Promise<boolean> {
  const { exists, BaseDirectory } = await import('@tauri-apps/plugin-fs')
  return exists(localPath, { baseDir: BaseDirectory.AppData })
}

async function uniqueImportPath(
  sourcePath: string,
  index: number,
  timestamp: number,
  usedPaths: Set<string>,
): Promise<string> {
  const filename = sanitizeFilename(basename(sourcePath))
  const { stem, extension } = splitExtension(filename)
  let suffix = 0

  while (true) {
    const suffixText = suffix === 0 ? '' : `-${suffix + 1}`
    const candidate = `${ZIP_IMAGE_DIR}/import-${timestamp}-${index}-${stem}${suffixText}${extension}`
    if (!usedPaths.has(candidate) && !(await appDataPathExists(candidate))) {
      usedPaths.add(candidate)
      return candidate
    }
    suffix += 1
  }
}

async function writeImageFile(localPath: string, bytes: Uint8Array): Promise<void> {
  const { mkdir, writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
  await mkdir(ZIP_IMAGE_DIR, { baseDir: BaseDirectory.AppData, recursive: true })
  await writeFile(localPath, bytes, { baseDir: BaseDirectory.AppData })
}

export async function cleanupDesktopImportedImages(paths: string[]): Promise<void> {
  if (!isTauriRuntime()) return
  const { remove, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs')

  await Promise.all(
    paths.map(async (path) => {
      try {
        if (await exists(path, { baseDir: BaseDirectory.AppData })) {
          await remove(path, { baseDir: BaseDirectory.AppData })
        }
      } catch (error) {
        console.warn('Failed to clean up imported image file:', error)
      }
    }),
  )
}

function rewriteImageList<T extends GeneratedImage>(
  images: T[] | undefined,
  pathMap: Map<string, { localPath: string; byteSize: number }>,
): T[] | undefined {
  return images?.map((image) => {
    if (!image.localPath) return image

    const imported = pathMap.get(image.localPath)
    if (!imported) return image

    return {
      ...image,
      url: imported.localPath,
      localPath: imported.localPath,
      byteSize: imported.byteSize,
      base64: undefined,
    }
  })
}

function rewriteMessages(
  messages: ChatMessage[],
  pathMap: Map<string, { localPath: string; byteSize: number }>,
): ChatMessage[] {
  return cloneMessages(messages).map((message) => {
    if (!message.images && !message.attachments && !message.generation?.attachments) return message

    return {
      ...message,
      attachments: rewriteImageList(message.attachments, pathMap),
      images: rewriteImageList(message.images, pathMap),
      generation: message.generation
        ? {
            ...message.generation,
            attachments: rewriteImageList(message.generation.attachments, pathMap),
          }
        : undefined,
    }
  })
}

export async function importDesktopHistoryZip(
  file: File,
  options: DesktopHistoryImportOptions = {},
): Promise<DesktopHistoryImportResult> {
  if (!isTauriRuntime()) {
    return { success: false, message: '桌面 ZIP 导入仅支持桌面端' }
  }

  const writtenImagePaths: string[] = []

  try {
    if (file.size > MAX_ZIP_BYTES) {
      return { success: false, message: 'ZIP 包超过大小限制（最多 250MB）' }
    }

    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(await file.arrayBuffer())
    } catch {
      return { success: false, message: 'ZIP 包损坏，无法读取' }
    }

    const historyFile = zip.file(ZIP_HISTORY_FILE)
    if (!historyFile) {
      return { success: false, message: 'ZIP 包缺少 history.json' }
    }

    let parsedData: unknown
    try {
      const historyBytes = await readZipEntryLimited(
        historyFile,
        MAX_HISTORY_JSON_BYTES,
        'history.json 超过大小限制（最多 10MB）',
      )
      parsedData = JSON.parse(new TextDecoder().decode(historyBytes))
    } catch (error) {
      if (error instanceof DesktopHistoryImportError) {
        return { success: false, message: error.message }
      }
      return { success: false, message: 'history.json 格式不正确' }
    }

    const data = validateExportData(parsedData)
    const imagePaths = new Set<string>()
    collectImagePaths(data.currentMessages, imagePaths)
    Object.values(data.historyMessages).forEach((messages) =>
      collectImagePaths(messages, imagePaths),
    )
    if (imagePaths.size > MAX_IMAGE_COUNT) {
      return { success: false, message: `图片数量超过限制（最多 ${MAX_IMAGE_COUNT} 张）` }
    }

    const imageFiles = new Map<string, JSZip.JSZipObject>()
    for (const imagePath of imagePaths) {
      const imageFile = zip.file(imagePath)
      if (!imageFile) {
        return { success: false, message: `ZIP 包缺少图片文件：${imagePath}` }
      }
      imageFiles.set(imagePath, imageFile)
    }

    let totalImageBytes = 0
    const pathMap = new Map<string, { localPath: string; byteSize: number }>()
    const usedPaths = new Set<string>()
    const timestamp = options.now ?? Date.now()
    let index = 0

    for (const [sourcePath, imageFile] of imageFiles) {
      const bytes = await readZipEntryLimited(
        imageFile,
        MAX_IMAGE_BYTES,
        `图片文件超过大小限制（最多 25MB）：${sourcePath}`,
      )
      totalImageBytes += bytes.byteLength
      if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
        throw new DesktopHistoryImportError('图片文件总大小超过限制（最多 1GB）')
      }

      const localPath = await uniqueImportPath(sourcePath, index, timestamp, usedPaths)
      try {
        await writeImageFile(localPath, bytes)
      } catch {
        throw new DesktopHistoryImportError('导入图片写入失败')
      }
      writtenImagePaths.push(localPath)
      pathMap.set(sourcePath, { localPath, byteSize: bytes.byteLength })
      index += 1
    }

    return {
      success: true,
      data: {
        currentMessages: rewriteMessages(data.currentMessages, pathMap),
        historyList: data.historyList.map((history) => ({ ...history })),
        historyMessages: Object.fromEntries(
          Object.entries(data.historyMessages).map(([historyId, messages]) => [
            historyId,
            rewriteMessages(messages, pathMap),
          ]),
        ),
        writtenImagePaths,
      },
    }
  } catch (error) {
    await cleanupDesktopImportedImages(writtenImagePaths)
    if (error instanceof DesktopHistoryImportError) {
      return { success: false, message: error.message }
    }
    console.error('Desktop ZIP import error:', error)
    return { success: false, message: '导入 ZIP 包失败，请检查文件内容' }
  }
}
