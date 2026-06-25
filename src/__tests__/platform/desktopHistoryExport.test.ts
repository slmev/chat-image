import JSZip from 'jszip'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatAttachment, ChatHistory, ChatMessage, DesktopHistoryExportData, GeneratedImage } from '../../types'

const readImageBlob = vi.fn<(...args: [GeneratedImage]) => Promise<Blob>>()
const save = vi.fn()
const writeFile = vi.fn()

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('../../platform/imageRepository', () => ({
  getImageRepository: () => ({
    readImageBlob,
  }),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile,
}))

function image(id: string, localPath: string): GeneratedImage {
  return {
    id,
    url: 'blob:' + id,
    localPath,
    base64: 'should-not-export',
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

async function readZip(bytes: Uint8Array): Promise<{
  zip: JSZip
  data: DesktopHistoryExportData
}> {
  const zip = await JSZip.loadAsync(bytes)
  const historyJson = await zip.file('history.json')?.async('string')
  if (!historyJson) throw new Error('Missing history.json')
  return {
    zip,
    data: JSON.parse(historyJson) as DesktopHistoryExportData,
  }
}

describe('desktop history ZIP export', () => {
  beforeEach(() => {
    readImageBlob.mockReset()
    readImageBlob.mockImplementation(async image => (
      new Blob([`bytes:${image.localPath}`], { type: image.mimeType || 'image/png' })
    ))
    save.mockReset()
    writeFile.mockReset()
  })

  it('exports current chat with history.json and images', async () => {
    const { buildDesktopHistoryExportZip } = await import('../../platform/desktopHistoryExport')
    const currentImage = image('image-1', 'images/current.png')
    const reference = attachment('attachment-1', 'images/reference.webp')

    const result = await buildDesktopHistoryExportZip({
      currentMessages: [message('message-1', [currentImage], [reference])],
      historyList: [],
      historyMessages: {},
      exportedAt: 123,
    })
    const { zip, data } = await readZip(result.bytes)

    expect(data).toMatchObject({
      version: 2,
      exportedAt: 123,
      kind: 'desktop-zip',
      historyList: [],
      historyMessages: {},
    })
    expect(data.currentMessages[0].images?.[0]).toMatchObject({
      id: 'image-1',
      url: 'images/current.png',
      localPath: 'images/current.png',
    })
    expect(data.currentMessages[0].attachments?.[0]).toMatchObject({
      id: 'attachment-1',
      name: 'attachment-1.png',
      url: 'images/reference.webp',
      localPath: 'images/reference.webp',
    })
    expect(data.currentMessages[0].images?.[0]).not.toHaveProperty('base64')
    expect(data.currentMessages[0].attachments?.[0]).not.toHaveProperty('base64')
    expect(zip.file('images/current.png')).toBeTruthy()
    expect(zip.file('images/reference.webp')).toBeTruthy()
    await expect(zip.file('images/current.png')?.async('string')).resolves.toBe('bytes:images/current.png')
    await expect(zip.file('images/reference.webp')?.async('string')).resolves.toBe('bytes:images/reference.webp')
    expect(result.imageCount).toBe(2)
    expect(result.missingImageCount).toBe(0)
  })

  it('includes saved history list and each history message set', async () => {
    const { buildDesktopHistoryExportZip } = await import('../../platform/desktopHistoryExport')
    const historyList: ChatHistory[] = [{
      id: 'history-1',
      title: 'saved',
      timestamp: 1,
      messageCount: 1,
      isFavorite: false,
    }]

    const result = await buildDesktopHistoryExportZip({
      currentMessages: [],
      historyList,
      historyMessages: {
        'history-1': [message('history-message', [image('image-2', 'images/history.png')])],
      },
      exportedAt: 123,
    })
    const { zip, data } = await readZip(result.bytes)

    expect(data.historyList).toEqual(historyList)
    expect(data.historyMessages['history-1'][0].id).toBe('history-message')
    expect(data.historyMessages['history-1'][0].images?.[0].localPath).toBe('images/history.png')
    expect(zip.file('images/history.png')).toBeTruthy()
  })

  it('writes only one ZIP image when multiple messages reference the same local path', async () => {
    const { buildDesktopHistoryExportZip } = await import('../../platform/desktopHistoryExport')
    const sharedImage = image('image-shared', 'images/shared.png')

    const result = await buildDesktopHistoryExportZip({
      currentMessages: [
        message('message-1', [sharedImage]),
        message('message-2', [image('image-shared-copy', 'images/shared.png')]),
      ],
      historyList: [],
      historyMessages: {},
      exportedAt: 123,
    })
    const { zip, data } = await readZip(result.bytes)

    expect(result.imageCount).toBe(1)
    expect(readImageBlob).toHaveBeenCalledTimes(1)
    expect(zip.file(/^images\/shared\.png$/)).toHaveLength(1)
    expect(data.currentMessages[0].images?.[0].localPath).toBe('images/shared.png')
    expect(data.currentMessages[1].images?.[0].localPath).toBe('images/shared.png')
  })

  it('keeps metadata and omits the file when an image cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    readImageBlob.mockRejectedValueOnce(new Error('missing file'))
    const { buildDesktopHistoryExportZip } = await import('../../platform/desktopHistoryExport')

    const result = await buildDesktopHistoryExportZip({
      currentMessages: [message('message-1', [image('image-missing', 'images/missing.png')])],
      historyList: [],
      historyMessages: {},
      exportedAt: 123,
    })
    const { zip, data } = await readZip(result.bytes)

    expect(result.imageCount).toBe(0)
    expect(result.missingImageCount).toBe(1)
    expect(data.currentMessages[0].images?.[0].localPath).toBeUndefined()
    expect(data.currentMessages[0].images?.[0].url).toBe('blob:image-missing')
    expect(zip.file('images/missing.png')).toBeNull()
    warn.mockRestore()
  })

  it('returns canceled without building or writing when the save dialog is canceled', async () => {
    save.mockResolvedValue(null)
    const { exportDesktopHistoryZip } = await import('../../platform/desktopHistoryExport')

    await expect(exportDesktopHistoryZip({
      currentMessages: [message('message-1', [image('image-1', 'images/current.png')])],
      historyList: [],
      historyMessages: {},
      exportedAt: 123,
    })).resolves.toEqual({ canceled: true })

    expect(readImageBlob).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })
})
