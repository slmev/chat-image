import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatHistory, ChatMessage, GeneratedImage } from '../../types'
import { STORAGE_KEYS } from '../../utils/constants'
import { HISTORY_LIST_KEY, HISTORY_MESSAGES_PREFIX } from '../../platform/metadataStore'

const metadata = new Map<string, unknown>()
const deleteImageFile = vi.fn<(...args: [GeneratedImage]) => Promise<void>>()

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('../../platform/metadataStore', async () => {
  const actual = await vi.importActual<typeof import('../../platform/metadataStore')>(
    '../../platform/metadataStore',
  )
  return {
    ...actual,
    getMetadataValue: vi.fn(async <T>(key: string, defaultValue: T): Promise<T> => (
      metadata.has(key) ? metadata.get(key) as T : defaultValue
    )),
  }
})

vi.mock('../../platform/imageRepository', () => ({
  getImageRepository: () => ({
    deleteImageFile,
  }),
}))

function image(localPath: string): GeneratedImage {
  return {
    id: localPath,
    url: '',
    localPath,
    timestamp: 1,
  }
}

function message(images: GeneratedImage[]): ChatMessage {
  return {
    id: 'message-' + images.map(item => item.localPath).join('-'),
    type: 'assistant',
    content: 'generated',
    timestamp: 1,
    status: 'success',
    images,
  }
}

describe('deleteUnreferencedLocalImages', () => {
  beforeEach(() => {
    metadata.clear()
    deleteImageFile.mockReset()
  })

  it('deletes local images that are no longer referenced', async () => {
    const { deleteUnreferencedLocalImages } = await import('../../platform/imageReferenceCleanup')

    await deleteUnreferencedLocalImages([image('images/orphan.png')])

    expect(deleteImageFile).toHaveBeenCalledWith(expect.objectContaining({
      localPath: 'images/orphan.png',
    }))
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

  it('continues deleting other images when one file delete fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    deleteImageFile
      .mockRejectedValueOnce(new Error('delete failed'))
      .mockResolvedValue(undefined)

    const { deleteUnreferencedLocalImages } = await import('../../platform/imageReferenceCleanup')

    await deleteUnreferencedLocalImages([
      image('images/fail.png'),
      image('images/success.png'),
    ])

    expect(deleteImageFile).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith(
      'Failed to delete unreferenced image file:',
      expect.any(Error),
    )
    warn.mockRestore()
  })
})
