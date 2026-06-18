import JSZip from 'jszip'
import type { ChatHistory, ChatMessage, DesktopHistoryExportData, GeneratedImage } from '../types'
import { isTauriRuntime } from './runtime'

const ZIP_HISTORY_FILE = 'history.json'
const ZIP_IMAGE_DIR = 'images'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(message => ({
    ...message,
    images: message.images?.map(image => ({
      ...image,
      base64: undefined,
    })),
  }))
}

function validateImage(value: unknown): GeneratedImage {
  if (!isRecord(value)) {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  if (
    typeof value.id !== 'string'
    || typeof value.url !== 'string'
    || typeof value.timestamp !== 'number'
  ) {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  if (value.localPath !== undefined && typeof value.localPath !== 'string') {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  return value as unknown as GeneratedImage
}

function validateMessage(value: unknown): ChatMessage {
  if (!isRecord(value)) {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  if (
    typeof value.id !== 'string'
    || value.id.length > 100
    || (value.type !== 'user' && value.type !== 'assistant')
    || typeof value.content !== 'string'
    || value.content.length > 10000
    || typeof value.timestamp !== 'number'
    || (value.status !== 'pending' && value.status !== 'success' && value.status !== 'error')
  ) {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  if (value.images !== undefined && !Array.isArray(value.images)) {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  if (value.error !== undefined && typeof value.error !== 'string') {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  if (value.isFavorite !== undefined && typeof value.isFavorite !== 'boolean') {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  const images = value.images?.map(validateImage)
  return {
    ...value,
    images,
    isFavorite: value.isFavorite ?? false,
  } as ChatMessage
}

function validateMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length > 1000) {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }
  return value.map(validateMessage)
}

function validateHistory(value: unknown): ChatHistory {
  if (!isRecord(value)) {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  if (
    typeof value.id !== 'string'
    || value.id.length > 100
    || typeof value.title !== 'string'
    || typeof value.timestamp !== 'number'
    || typeof value.messageCount !== 'number'
    || typeof value.isFavorite !== 'boolean'
  ) {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  if (value.preview !== undefined && typeof value.preview !== 'string') {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  return value as unknown as ChatHistory
}

function validateExportData(value: unknown): Omit<DesktopHistoryExportData, 'currentMessages' | 'historyList' | 'historyMessages'> & {
  currentMessages: ChatMessage[]
  historyList: ChatHistory[]
  historyMessages: Record<string, ChatMessage[]>
} {
  if (!isRecord(value) || value.version !== 2 || value.kind !== 'desktop-zip') {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  if (
    typeof value.exportedAt !== 'number'
    || !Array.isArray(value.historyList)
    || !isRecord(value.historyMessages)
  ) {
    throw new DesktopHistoryImportError('history.json 格式不正确')
  }

  const currentMessages = validateMessages(value.currentMessages)
  const historyList = value.historyList.map(validateHistory)
  const historyIds = new Set(historyList.map(history => history.id))
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

  return {
    version: 2,
    exportedAt: value.exportedAt,
    kind: 'desktop-zip',
    currentMessages,
    historyList,
    historyMessages,
  }
}

function assertSafeZipImagePath(path: string): void {
  const segments = path.split('/')
  const isUnsafe = path.includes('\\')
    || path.startsWith('/')
    || !path.startsWith(`${ZIP_IMAGE_DIR}/`)
    || segments.some(segment => !segment || segment === '.' || segment === '..')

  if (isUnsafe) {
    throw new DesktopHistoryImportError(`ZIP 包包含不安全的图片路径：${path}`)
  }
}

function collectImagePaths(messages: ChatMessage[], paths: Set<string>): void {
  messages.forEach(message => {
    message.images?.forEach(image => {
      if (!image.localPath) return
      assertSafeZipImagePath(image.localPath)
      paths.add(image.localPath)
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

  await Promise.all(paths.map(async path => {
    try {
      if (await exists(path, { baseDir: BaseDirectory.AppData })) {
        await remove(path, { baseDir: BaseDirectory.AppData })
      }
    } catch (error) {
      console.warn('Failed to clean up imported image file:', error)
    }
  }))
}

function rewriteMessages(
  messages: ChatMessage[],
  pathMap: Map<string, { localPath: string; byteSize: number }>,
): ChatMessage[] {
  return cloneMessages(messages).map(message => {
    if (!message.images) return message

    return {
      ...message,
      images: message.images.map(image => {
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
      }),
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
      parsedData = JSON.parse(await historyFile.async('string'))
    } catch {
      return { success: false, message: 'history.json 格式不正确' }
    }

    const data = validateExportData(parsedData)
    const imagePaths = new Set<string>()
    collectImagePaths(data.currentMessages, imagePaths)
    Object.values(data.historyMessages).forEach(messages => collectImagePaths(messages, imagePaths))

    const imageFiles = new Map<string, JSZip.JSZipObject>()
    for (const imagePath of imagePaths) {
      const imageFile = zip.file(imagePath)
      if (!imageFile) {
        return { success: false, message: `ZIP 包缺少图片文件：${imagePath}` }
      }
      imageFiles.set(imagePath, imageFile)
    }

    const pathMap = new Map<string, { localPath: string; byteSize: number }>()
    const usedPaths = new Set<string>()
    const timestamp = options.now ?? Date.now()
    let index = 0

    for (const [sourcePath, imageFile] of imageFiles) {
      const bytes = await imageFile.async('uint8array')
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
        historyList: data.historyList.map(history => ({ ...history })),
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
