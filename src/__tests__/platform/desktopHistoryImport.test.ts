import JSZip from 'jszip'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatAttachment, ChatHistory, ChatMessage, DesktopHistoryExportData, GeneratedImage } from '../../types'

const mkdir = vi.fn()
const writeFile = vi.fn()
const exists = vi.fn()
const remove = vi.fn()

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: {
    AppData: 'AppData',
  },
  mkdir,
  writeFile,
  exists,
  remove,
}))

function image(id: string, localPath: string): GeneratedImage {
  return {
    id,
    url: localPath,
    localPath,
    mimeType: 'image/png',
    timestamp: 1,
  }
}

function attachment(id: string, localPath: string): ChatAttachment {
  return {
    ...image(id, localPath),
    name: `${id}.png`,
  }
}

function message(
  id: string,
  images: GeneratedImage[] = [],
  attachments: ChatAttachment[] = [],
): ChatMessage {
  return {
    id,
    type: 'assistant',
    content: 'generated',
    timestamp: 1,
    status: 'success',
    attachments,
    images,
  }
}

async function zipFile(
  data: DesktopHistoryExportData | null,
  files: Record<string, string> = {},
): Promise<File> {
  const zip = new JSZip()
  if (data) {
    zip.file('history.json', JSON.stringify(data))
  }
  Object.entries(files).forEach(([path, content]) => {
    zip.file(path, content)
  })
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  return new File([buffer], 'history.zip', { type: 'application/zip' })
}

function exportData(overrides: Partial<DesktopHistoryExportData> = {}): DesktopHistoryExportData {
  return {
    version: 2,
    exportedAt: 123,
    kind: 'desktop-zip',
    currentMessages: [message('current-message', [image('current-image', 'images/current.png')])],
    historyList: [],
    historyMessages: {},
    ...overrides,
  }
}

describe('desktop history ZIP import', () => {
  beforeEach(() => {
    mkdir.mockReset()
    mkdir.mockResolvedValue(undefined)
    writeFile.mockReset()
    writeFile.mockResolvedValue(undefined)
    exists.mockReset()
    exists.mockResolvedValue(false)
    remove.mockReset()
    remove.mockResolvedValue(undefined)
  })

  it('imports a valid ZIP and rewrites image paths for current and saved history', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')
    const historyList: ChatHistory[] = [{
      id: 'history-1',
      title: 'saved',
      timestamp: 1,
      messageCount: 1,
      isFavorite: false,
    }]

    const result = await importDesktopHistoryZip(await zipFile(exportData({
      historyList,
      historyMessages: {
        'history-1': [message('history-message', [image('history-image', 'images/history.png')])],
      },
    }), {
      'images/current.png': 'current-bytes',
      'images/history.png': 'history-bytes',
    }), { now: 1000 })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.message)

    expect(result.data.currentMessages[0].images?.[0]).toMatchObject({
      url: 'images/import-1000-0-current.png',
      localPath: 'images/import-1000-0-current.png',
      byteSize: 13,
    })
    expect(result.data.historyMessages['history-1'][0].images?.[0]).toMatchObject({
      url: 'images/import-1000-1-history.png',
      localPath: 'images/import-1000-1-history.png',
      byteSize: 13,
    })
    expect(result.data.writtenImagePaths).toEqual([
      'images/import-1000-0-current.png',
      'images/import-1000-1-history.png',
    ])
    expect(writeFile).toHaveBeenCalledTimes(2)
  })

  it('imports attachment image files and preserves attachment metadata', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')

    const result = await importDesktopHistoryZip(await zipFile(exportData({
      currentMessages: [
        message('current-message', [], [
          attachment('reference-image', 'images/reference.webp'),
        ]),
      ],
    }), {
      'images/reference.webp': 'reference-bytes',
    }), { now: 1000 })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.message)

    expect(result.data.currentMessages[0].attachments?.[0]).toMatchObject({
      id: 'reference-image',
      name: 'reference-image.png',
      url: 'images/import-1000-0-reference.webp',
      localPath: 'images/import-1000-0-reference.webp',
      byteSize: 15,
    })
    expect(result.data.writtenImagePaths).toEqual([
      'images/import-1000-0-reference.webp',
    ])
  })

  it('fails without writing when history.json is missing', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')

    await expect(importDesktopHistoryZip(await zipFile(null))).resolves.toEqual({
      success: false,
      message: 'ZIP 包缺少 history.json',
    })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('fails without writing when a referenced image file is missing', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')

    await expect(importDesktopHistoryZip(await zipFile(exportData()))).resolves.toEqual({
      success: false,
      message: 'ZIP 包缺少图片文件：images/current.png',
    })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('rejects unsafe image paths before writing files', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')

    await expect(importDesktopHistoryZip(await zipFile(exportData({
      currentMessages: [message('current-message', [image('bad-image', 'images/../secret.png')])],
    }), {
      'images/../secret.png': 'bad',
    }))).resolves.toEqual({
      success: false,
      message: 'ZIP 包包含不安全的图片路径：images/../secret.png',
    })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('chooses a non-conflicting target path when imported image names collide locally', async () => {
    exists.mockImplementation(async (path: string) => path === 'images/import-1000-0-current.png')
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')

    const result = await importDesktopHistoryZip(await zipFile(exportData(), {
      'images/current.png': 'current-bytes',
    }), { now: 1000 })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.message)
    expect(result.data.currentMessages[0].images?.[0].localPath).toBe(
      'images/import-1000-0-current-2.png',
    )
    expect(writeFile).toHaveBeenCalledWith(
      'images/import-1000-0-current-2.png',
      expect.any(Uint8Array),
      { baseDir: 'AppData' },
    )
  })

  it('cleans up already written images when a later image write fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    exists
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    writeFile
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('write failed'))
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')

    const result = await importDesktopHistoryZip(await zipFile(exportData({
      currentMessages: [
        message('message-1', [image('image-1', 'images/one.png')]),
        message('message-2', [image('image-2', 'images/two.png')]),
      ],
    }), {
      'images/one.png': 'one',
      'images/two.png': 'two',
    }), { now: 1000 })

    expect(result).toEqual({
      success: false,
      message: '导入图片写入失败',
    })
    expect(remove).toHaveBeenCalledWith(
      'images/import-1000-0-one.png',
      { baseDir: 'AppData' },
    )
    warn.mockRestore()
  })
})
