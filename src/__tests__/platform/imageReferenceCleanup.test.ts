import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatAttachment, ChatHistory, ChatMessage, GeneratedImage } from '../../types'
import { STORAGE_KEYS } from '../../utils/constants'
import { HISTORY_LIST_KEY, HISTORY_MESSAGES_PREFIX } from '../../platform/metadataStore'

const metadata = new Map<string, unknown>()
const deleteImageFile = vi.fn<(...args: [GeneratedImage]) => Promise<void>>()
const readDir = vi.fn()
const stat = vi.fn()
const appDataDir = vi.fn()
const openPath = vi.fn()

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('../../platform/metadataStore', async () => {
  const actual = await vi.importActual<typeof import('../../platform/metadataStore')>(
    '../../platform/metadataStore',
  )
  return {
    ...actual,
    getMetadataValue: vi.fn(
      async <T>(key: string, defaultValue: T): Promise<T> =>
        metadata.has(key) ? (metadata.get(key) as T) : defaultValue,
    ),
  }
})

vi.mock('../../platform/imageRepository', () => ({
  getImageRepository: () => ({
    deleteImageFile,
  }),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: {
    AppData: 'AppData',
  },
  readDir,
  stat,
}))

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath,
}))

function image(localPath: string): GeneratedImage {
  return {
    id: localPath,
    url: '',
    localPath,
    timestamp: 1,
  }
}

function attachment(localPath: string): ChatAttachment {
  return {
    ...image(localPath),
    name: localPath.split('/').pop() || 'reference.png',
  }
}

function message(images: GeneratedImage[], attachments: ChatAttachment[] = []): ChatMessage {
  return {
    id: 'message-' + images.map((item) => item.localPath).join('-'),
    type: 'assistant',
    content: 'generated',
    timestamp: 1,
    status: 'success',
    attachments,
    images,
  }
}

describe('deleteUnreferencedLocalImages', () => {
  beforeEach(() => {
    metadata.clear()
    deleteImageFile.mockReset()
    deleteImageFile.mockResolvedValue(undefined)
    readDir.mockReset()
    stat.mockReset()
    appDataDir.mockReset()
    appDataDir.mockResolvedValue('/Users/me/Library/Application Support/chat-image')
    openPath.mockReset()
    openPath.mockResolvedValue(undefined)
    readDir.mockResolvedValue([])
  })

  it('deletes local images that are no longer referenced', async () => {
    const { deleteUnreferencedLocalImages } = await import('../../platform/imageReferenceCleanup')

    await deleteUnreferencedLocalImages([image('images/orphan.png')])

    expect(deleteImageFile).toHaveBeenCalledWith(
      expect.objectContaining({
        localPath: 'images/orphan.png',
      }),
    )
  })

  it('keeps local images still referenced by current chat history', async () => {
    const referenced = image('images/referenced.png')
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message([referenced])])

    const { deleteUnreferencedLocalImages } = await import('../../platform/imageReferenceCleanup')

    await deleteUnreferencedLocalImages([referenced])

    expect(deleteImageFile).not.toHaveBeenCalled()
  })

  it('keeps local images still referenced by saved history items', async () => {
    const referenced = image('images/history.png')
    const history: ChatHistory = {
      id: 'history-1',
      title: 'history',
      timestamp: 1,
      messageCount: 1,
      isFavorite: false,
    }
    metadata.set(HISTORY_LIST_KEY, [history])
    metadata.set(HISTORY_MESSAGES_PREFIX + history.id, [message([referenced])])

    const { deleteUnreferencedLocalImages } = await import('../../platform/imageReferenceCleanup')

    await deleteUnreferencedLocalImages([referenced])

    expect(deleteImageFile).not.toHaveBeenCalled()
  })

  it('keeps local attachment images still referenced by current chat history', async () => {
    const referenced = attachment('images/reference.webp')
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message([], [referenced])])

    const { deleteUnreferencedLocalImages } = await import('../../platform/imageReferenceCleanup')

    await deleteUnreferencedLocalImages([referenced])

    expect(deleteImageFile).not.toHaveBeenCalled()
  })

  it('continues deleting other images when one file delete fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    deleteImageFile.mockRejectedValueOnce(new Error('delete failed')).mockResolvedValue(undefined)

    const { deleteUnreferencedLocalImages } = await import('../../platform/imageReferenceCleanup')

    await deleteUnreferencedLocalImages([image('images/fail.png'), image('images/success.png')])

    expect(deleteImageFile).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith(
      'Failed to delete unreferenced image file:',
      expect.any(Error),
    )
    warn.mockRestore()
  })

  it('reports local image storage stats and excludes referenced images from orphans', async () => {
    readDir.mockResolvedValue([
      { name: 'referenced.png', isFile: true, isDirectory: false, isSymlink: false },
      { name: 'orphan.png', isFile: true, isDirectory: false, isSymlink: false },
      { name: 'nested', isFile: false, isDirectory: true, isSymlink: false },
    ])
    stat.mockImplementation(async (path: string) => ({
      isFile: true,
      isDirectory: false,
      isSymlink: false,
      size: path.includes('referenced') ? 100 : 250,
    }))
    metadata.set(STORAGE_KEYS.CHAT_HISTORY, [message([image('images/referenced.png')])])

    const { getLocalImageStorageStats } = await import('../../platform/imageReferenceCleanup')

    await expect(getLocalImageStorageStats()).resolves.toEqual({
      totalCount: 2,
      totalBytes: 350,
      orphanCount: 1,
      orphanBytes: 250,
    })
  })

  it('cleans only orphaned local image files and returns cleanup totals', async () => {
    readDir.mockResolvedValue([
      { name: 'referenced.png', isFile: true, isDirectory: false, isSymlink: false },
      { name: 'orphan.png', isFile: true, isDirectory: false, isSymlink: false },
    ])
    stat.mockImplementation(async (path: string) => ({
      isFile: true,
      isDirectory: false,
      isSymlink: false,
      size: path.includes('referenced') ? 100 : 250,
    }))
    metadata.set(HISTORY_LIST_KEY, [
      {
        id: 'history-1',
        title: 'history',
        timestamp: 1,
        messageCount: 1,
        isFavorite: false,
      },
    ])
    metadata.set(HISTORY_MESSAGES_PREFIX + 'history-1', [message([image('images/referenced.png')])])

    const { cleanupOrphanedLocalImages } = await import('../../platform/imageReferenceCleanup')

    await expect(cleanupOrphanedLocalImages()).resolves.toMatchObject({
      totalCount: 1,
      totalBytes: 100,
      orphanCount: 0,
      orphanBytes: 0,
      deletedCount: 1,
      deletedBytes: 250,
      failedCount: 0,
    })
    expect(deleteImageFile).toHaveBeenCalledTimes(1)
    expect(deleteImageFile).toHaveBeenCalledWith(
      expect.objectContaining({
        localPath: 'images/orphan.png',
      }),
    )
  })

  it('keeps failed orphan deletions in cleanup result', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    readDir.mockResolvedValue([
      { name: 'fail.png', isFile: true, isDirectory: false, isSymlink: false },
      { name: 'success.png', isFile: true, isDirectory: false, isSymlink: false },
    ])
    stat.mockImplementation(async (path: string) => ({
      isFile: true,
      isDirectory: false,
      isSymlink: false,
      size: path.includes('fail') ? 100 : 250,
    }))
    deleteImageFile.mockRejectedValueOnce(new Error('delete failed')).mockResolvedValue(undefined)

    const { cleanupOrphanedLocalImages } = await import('../../platform/imageReferenceCleanup')

    await expect(cleanupOrphanedLocalImages()).resolves.toMatchObject({
      totalCount: 1,
      totalBytes: 100,
      orphanCount: 1,
      orphanBytes: 100,
      deletedCount: 1,
      deletedBytes: 250,
      failedCount: 1,
    })
    warn.mockRestore()
  })

  it('returns the Tauri app data directory', async () => {
    const { getLocalDataDirectory } = await import('../../platform/imageReferenceCleanup')

    await expect(getLocalDataDirectory()).resolves.toBe(
      '/Users/me/Library/Application Support/chat-image',
    )
  })

  it('opens the Tauri app data directory in the system file manager', async () => {
    const { openLocalDataDirectory } = await import('../../platform/imageReferenceCleanup')

    await openLocalDataDirectory()

    expect(openPath).toHaveBeenCalledWith('/Users/me/Library/Application Support/chat-image')
  })
})
