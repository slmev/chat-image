import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteUnreferencedLocalImages } from '../../platform/imageReferenceCleanup'
import { putWebHistoryRecord, setWebCurrentMessages } from '../../platform/webPersistence'
import type { ChatAttachment, ChatHistory, ChatMessage, GeneratedImage } from '../../types'

const deleteImageFile = vi.fn<(...args: [GeneratedImage]) => Promise<void>>()

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('../../platform/imageRepository', () => ({
  getImageRepository: () => ({ deleteImageFile }),
}))

function image(id: string): GeneratedImage {
  return {
    id,
    url: `blob:${id}`,
    webStorageKey: `web:${id}`,
    timestamp: 1,
  }
}

function message(id: string, storedImage?: GeneratedImage): ChatMessage {
  return {
    id,
    type: 'assistant',
    content: id,
    timestamp: 1,
    status: 'success',
    images: storedImage ? [storedImage] : undefined,
  }
}

describe('web image reference cleanup', () => {
  beforeEach(() => {
    deleteImageFile.mockReset()
    deleteImageFile.mockResolvedValue(undefined)
  })

  it('keeps current and saved references and deletes only orphaned blobs', async () => {
    const currentImage = image('current')
    const historyAttachment = {
      ...image('history-reference'),
      name: 'reference.png',
    } satisfies ChatAttachment
    const savedHistory: ChatHistory = {
      id: 'history-1',
      title: 'Saved history',
      timestamp: 1,
      messageCount: 1,
      isFavorite: false,
    }
    const historyMessage = message('saved')
    historyMessage.generation = {
      prompt: 'saved',
      size: 'auto',
      quality: 'auto',
      n: 1,
      attachmentIds: [historyAttachment.id],
      attachments: [historyAttachment],
    }

    await setWebCurrentMessages([message('current', currentImage)])
    await putWebHistoryRecord(savedHistory, [historyMessage])

    const orphan = image('orphan')
    await deleteUnreferencedLocalImages([currentImage, historyAttachment, orphan])

    expect(deleteImageFile).toHaveBeenCalledTimes(1)
    expect(deleteImageFile).toHaveBeenCalledWith(orphan)
  })
})
