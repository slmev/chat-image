import JSZip from 'jszip'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatAttachment,
  ChatHistory,
  ChatMessage,
  DesktopHistoryExportData,
  GeneratedImage,
} from '../../types'

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
  files: Record<string, string | Uint8Array> = {},
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

function streamedEntry(chunks: Array<Uint8Array | { byteLength: number }>) {
  const handlers: {
    data?: (chunk: Uint8Array) => void
    end?: () => void
    error?: (error: Error) => void
  } = {}
  let isPaused = false
  const pause = vi.fn(() => {
    isPaused = true
    return stream
  })
  const stream = {
    on: vi.fn((event: 'data' | 'end' | 'error', handler: (...args: never[]) => void) => {
      handlers[event] = handler as never
      return stream
    }),
    pause,
    resume: vi.fn(() => {
      chunks.forEach((chunk) => {
        if (!isPaused) handlers.data?.(chunk as Uint8Array)
      })
      if (!isPaused) handlers.end?.()
      return stream
    }),
  }

  return {
    entry: {
      internalStream: vi.fn(() => stream),
    },
    pause,
  }
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
    const historyList: ChatHistory[] = [
      {
        id: 'history-1',
        title: 'saved',
        timestamp: 1,
        messageCount: 1,
        isFavorite: false,
      },
    ]

    const result = await importDesktopHistoryZip(
      await zipFile(
        exportData({
          historyList,
          historyMessages: {
            'history-1': [
              message('history-message', [image('history-image', 'images/history.png')]),
            ],
          },
        }),
        {
          'images/current.png': 'current-bytes',
          'images/history.png': 'history-bytes',
        },
      ),
      { now: 1000 },
    )

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

    const result = await importDesktopHistoryZip(
      await zipFile(
        exportData({
          currentMessages: [
            message(
              'current-message',
              [],
              [attachment('reference-image', 'images/reference.webp')],
            ),
          ],
        }),
        {
          'images/reference.webp': 'reference-bytes',
        },
      ),
      { now: 1000 },
    )

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.message)

    expect(result.data.currentMessages[0].attachments?.[0]).toMatchObject({
      id: 'reference-image',
      name: 'reference-image.png',
      url: 'images/import-1000-0-reference.webp',
      localPath: 'images/import-1000-0-reference.webp',
      byteSize: 15,
    })
    expect(result.data.writtenImagePaths).toEqual(['images/import-1000-0-reference.webp'])
  })

  it('imports and rewrites generation attachments in current and saved history', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')
    const currentReference = attachment('current-reference', 'images/current-reference.png')
    const historyReference = attachment('history-reference', 'images/history-reference.png')
    const currentMessage = message('current-message')
    currentMessage.generation = {
      prompt: 'current prompt',
      size: '1024x1024',
      quality: 'auto',
      n: 1,
      attachmentIds: [currentReference.id],
      attachments: [currentReference],
    }
    const historyMessage = message('history-message')
    historyMessage.generation = {
      prompt: 'history prompt',
      size: '1024x1024',
      quality: 'auto',
      n: 1,
      attachmentIds: [historyReference.id],
      attachments: [historyReference],
    }
    const savedHistory: ChatHistory = {
      id: 'history-1',
      title: 'saved',
      timestamp: 1,
      messageCount: 1,
      isFavorite: false,
    }

    const result = await importDesktopHistoryZip(
      await zipFile(
        exportData({
          currentMessages: [currentMessage],
          historyList: [savedHistory],
          historyMessages: { [savedHistory.id]: [historyMessage] },
        }),
        {
          'images/current-reference.png': 'current-reference-bytes',
          'images/history-reference.png': 'history-reference-bytes',
        },
      ),
      { now: 1000 },
    )

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.message)

    expect(result.data.currentMessages[0].generation?.attachments?.[0]).toMatchObject({
      id: currentReference.id,
      name: currentReference.name,
      localPath: 'images/import-1000-0-current-reference.png',
      byteSize: 23,
    })
    expect(
      result.data.historyMessages[savedHistory.id][0].generation?.attachments?.[0],
    ).toMatchObject({
      id: historyReference.id,
      name: historyReference.name,
      localPath: 'images/import-1000-1-history-reference.png',
      byteSize: 23,
    })
    expect(result.data.writtenImagePaths).toEqual([
      'images/import-1000-0-current-reference.png',
      'images/import-1000-1-history-reference.png',
    ])
  })

  it('normalizes legacy generation metadata while validating an import', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')
    const legacyMessage = message('legacy-message')
    legacyMessage.generation = {
      prompt: 'legacy prompt',
      size: '1024x1024',
      quality: 'hd',
      n: 2,
    } as unknown as ChatMessage['generation']

    const result = await importDesktopHistoryZip(
      await zipFile(
        exportData({
          currentMessages: [legacyMessage],
        }),
      ),
    )

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.message)
    expect(result.data.currentMessages[0].generation).toMatchObject({
      quality: 'high',
      attachmentIds: [],
    })
  })

  it('allows more than 1000 messages in one message array when the total limit is not exceeded', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')
    const currentMessages = Array.from({ length: 1001 }, (_, index) => message(`current-${index}`))

    const result = await importDesktopHistoryZip(
      await zipFile(
        exportData({
          currentMessages,
        }),
      ),
    )

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.message)
    expect(result.data.currentMessages).toHaveLength(1001)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('rejects duplicate message IDs within one conversation', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')

    await expect(
      importDesktopHistoryZip(
        await zipFile(
          exportData({
            currentMessages: [message('duplicate'), message('duplicate')],
          }),
        ),
      ),
    ).resolves.toEqual({
      success: false,
      message: 'history.json 格式不正确',
    })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('rejects duplicate history IDs', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')
    const duplicateHistory: ChatHistory = {
      id: 'duplicate-history',
      title: 'duplicate',
      timestamp: 1,
      messageCount: 0,
      isFavorite: false,
    }

    await expect(
      importDesktopHistoryZip(
        await zipFile(
          exportData({
            currentMessages: [],
            historyList: [duplicateHistory, { ...duplicateHistory }],
            historyMessages: { [duplicateHistory.id]: [] },
          }),
        ),
      ),
    ).resolves.toEqual({
      success: false,
      message: 'history.json 格式不正确',
    })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('rejects an empty history ID', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')
    const invalidHistory: ChatHistory = {
      id: '',
      title: 'invalid',
      timestamp: 1,
      messageCount: 0,
      isFavorite: false,
    }

    await expect(
      importDesktopHistoryZip(
        await zipFile(
          exportData({
            currentMessages: [],
            historyList: [invalidHistory],
            historyMessages: { '': [] },
          }),
        ),
      ),
    ).resolves.toEqual({
      success: false,
      message: 'history.json 格式不正确',
    })
  })

  it('normalizes imported history message counts from validated messages', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')
    const savedHistory: ChatHistory = {
      id: 'history-1',
      title: 'saved',
      timestamp: 1,
      messageCount: 99,
      isFavorite: false,
    }

    const result = await importDesktopHistoryZip(
      await zipFile(
        exportData({
          currentMessages: [],
          historyList: [savedHistory],
          historyMessages: { [savedHistory.id]: [message('history-message')] },
        }),
      ),
    )

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.message)
    expect(result.data.historyList[0].messageCount).toBe(1)
  })

  it('fails when total message count exceeds the import limit', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')
    const currentMessages = Array.from({ length: 5001 }, (_, index) => message(`current-${index}`))

    await expect(
      importDesktopHistoryZip(
        await zipFile(
          exportData({
            currentMessages,
          }),
        ),
      ),
    ).resolves.toEqual({
      success: false,
      message: '消息数量超过限制（最多 5000 条）',
    })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('fails without writing when history.json is missing', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')

    await expect(importDesktopHistoryZip(await zipFile(null))).resolves.toEqual({
      success: false,
      message: 'ZIP 包缺少 history.json',
    })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('fails before reading when the ZIP archive is too large', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')
    const file = await zipFile(exportData(), {
      'images/current.png': 'current-bytes',
    })
    Object.defineProperty(file, 'size', {
      configurable: true,
      value: 251 * 1024 * 1024,
    })

    await expect(importDesktopHistoryZip(file)).resolves.toEqual({
      success: false,
      message: 'ZIP 包超过大小限制（最多 250MB）',
    })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('pauses history decompression as soon as the uncompressed limit is exceeded', async () => {
    const historyEntry = streamedEntry([{ byteLength: 10 * 1024 * 1024 + 1 }])
    const fakeZip = {
      file: vi.fn((path: string) => (path === 'history.json' ? historyEntry.entry : null)),
    }
    vi.resetModules()
    vi.doMock('jszip', () => ({
      default: {
        loadAsync: vi.fn(async () => fakeZip),
      },
    }))
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')

    await expect(importDesktopHistoryZip(new File(['zip'], 'history.zip'))).resolves.toEqual({
      success: false,
      message: 'history.json 超过大小限制（最多 10MB）',
    })
    expect(historyEntry.pause).toHaveBeenCalledTimes(1)
    expect(writeFile).not.toHaveBeenCalled()
    vi.doUnmock('jszip')
    vi.resetModules()
  })

  it('fails before writing when image count exceeds the limit', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')
    const currentMessages = Array.from({ length: 1000 }, (_, index) =>
      message(`current-${index}`, [image(`image-${index}`, `images/current-${index}.png`)]),
    )
    const historyList: ChatHistory[] = [
      {
        id: 'history-1',
        title: 'saved',
        timestamp: 1,
        messageCount: 1,
        isFavorite: false,
      },
    ]

    await expect(
      importDesktopHistoryZip(
        await zipFile(
          exportData({
            currentMessages,
            historyList,
            historyMessages: {
              'history-1': [message('history-message', [image('history-image', 'images/h.png')])],
            },
          }),
        ),
      ),
    ).resolves.toEqual({
      success: false,
      message: '图片数量超过限制（最多 1000 张）',
    })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('fails before writing when a referenced image file exceeds the size limit', async () => {
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')
    const oversizedImage = new Uint8Array(25 * 1024 * 1024 + 1)

    await expect(
      importDesktopHistoryZip(
        await zipFile(exportData(), {
          'images/current.png': oversizedImage,
        }),
      ),
    ).resolves.toEqual({
      success: false,
      message: '图片文件超过大小限制（最多 25MB）：images/current.png',
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

    await expect(
      importDesktopHistoryZip(
        await zipFile(
          exportData({
            currentMessages: [
              message('current-message', [image('bad-image', 'images/../secret.png')]),
            ],
          }),
          {
            'images/../secret.png': 'bad',
          },
        ),
      ),
    ).resolves.toEqual({
      success: false,
      message: 'ZIP 包包含不安全的图片路径：images/../secret.png',
    })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('chooses a non-conflicting target path when imported image names collide locally', async () => {
    exists.mockImplementation(async (path: string) => path === 'images/import-1000-0-current.png')
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')

    const result = await importDesktopHistoryZip(
      await zipFile(exportData(), {
        'images/current.png': 'current-bytes',
      }),
      { now: 1000 },
    )

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
    exists.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    writeFile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('write failed'))
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')

    const result = await importDesktopHistoryZip(
      await zipFile(
        exportData({
          currentMessages: [
            message('message-1', [image('image-1', 'images/one.png')]),
            message('message-2', [image('image-2', 'images/two.png')]),
          ],
        }),
        {
          'images/one.png': 'one',
          'images/two.png': 'two',
        },
      ),
      { now: 1000 },
    )

    expect(result).toEqual({
      success: false,
      message: '导入图片写入失败',
    })
    expect(remove).toHaveBeenCalledWith('images/import-1000-0-one.png', { baseDir: 'AppData' })
    warn.mockRestore()
  })

  it('cleans up already written images when total image bytes exceed the limit', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const maxImageBytes = 25 * 1024 * 1024
    const imageCount = 41
    const imagePaths = Array.from({ length: imageCount }, (_, index) => `images/${index}.png`)
    const historyBytes = new TextEncoder().encode(
      JSON.stringify(
        exportData({
          currentMessages: imagePaths.map((path, index) =>
            message(`message-${index}`, [image(`image-${index}`, path)]),
          ),
        }),
      ),
    )
    const fakeZip = {
      file: vi.fn((path: string) => {
        if (path === 'history.json') {
          return streamedEntry([historyBytes]).entry
        }
        if (imagePaths.includes(path)) {
          return streamedEntry([{ byteLength: maxImageBytes }]).entry
        }
        return null
      }),
    }
    vi.resetModules()
    vi.doMock('jszip', () => ({
      default: {
        loadAsync: vi.fn(async () => fakeZip),
      },
    }))
    let existsCallCount = 0
    exists.mockImplementation(async () => {
      existsCallCount += 1
      return existsCallCount > imageCount - 1
    })
    const { importDesktopHistoryZip } = await import('../../platform/desktopHistoryImport')

    const result = await importDesktopHistoryZip(new File(['zip'], 'history.zip'), { now: 1000 })

    expect(result).toEqual({
      success: false,
      message: '图片文件总大小超过限制（最多 1GB）',
    })
    expect(writeFile).toHaveBeenCalledTimes(imageCount - 1)
    expect(remove).toHaveBeenCalledTimes(imageCount - 1)
    vi.doUnmock('jszip')
    vi.resetModules()
    warn.mockRestore()
  })
})
