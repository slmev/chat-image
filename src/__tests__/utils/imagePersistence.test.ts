import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, GeneratedImage } from '../../types'

const mockState = vi.hoisted(() => ({
  resolveDisplayUrl: vi.fn(),
}))

vi.mock('../../platform/imageRepository', () => ({
  getImageRepository: () => ({
    resolveDisplayUrl: mockState.resolveDisplayUrl,
  }),
}))

describe('image persistence', () => {
  beforeEach(() => {
    mockState.resolveDisplayUrl.mockReset()
  })

  it('keeps loading history when a stored local image cannot be resolved', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const firstImage: GeneratedImage = {
      id: 'missing-image',
      url: 'images/missing.png',
      localPath: 'images/missing.png',
      timestamp: 1,
    }
    const secondImage: GeneratedImage = {
      id: 'ok-image',
      url: 'images/ok.png',
      localPath: 'images/ok.png',
      timestamp: 2,
    }
    mockState.resolveDisplayUrl
      .mockRejectedValueOnce(new Error('missing file'))
      .mockResolvedValueOnce({
        ...secondImage,
        url: 'blob:ok-image',
      })

    const { resolveStoredImageUrls } = await import('../../utils/imagePersistence')
    const result = await resolveStoredImageUrls([
      {
        id: 'message-1',
        type: 'assistant',
        content: 'done',
        timestamp: 1,
        status: 'success',
        images: [firstImage, secondImage],
      },
    ])

    expect(result[0].images).toEqual([
      firstImage,
      {
        ...secondImage,
        url: 'blob:ok-image',
      },
    ])
    warn.mockRestore()
  })

  it('replaces blob URLs with a durable local path when stripping base64 data', async () => {
    const { stripBase64FromMessages } = await import('../../utils/imagePersistence')
    const messages: ChatMessage[] = [
      {
        id: 'message-1',
        type: 'assistant',
        content: 'done',
        timestamp: 1,
        status: 'success',
        images: [
          {
            id: 'local-image',
            url: 'blob:local-image',
            localPath: 'images/local-image.png',
            base64: 'image-data',
            timestamp: 1,
          },
        ],
      },
    ]

    const result = stripBase64FromMessages(messages)

    expect(result[0].images?.[0]).toMatchObject({
      url: 'images/local-image.png',
      localPath: 'images/local-image.png',
    })
    expect(result[0].images?.[0].base64).toBeUndefined()
  })

  it('replaces blob URLs with a durable original URL when stripping base64 data', async () => {
    const { stripBase64FromMessages } = await import('../../utils/imagePersistence')
    const messages: ChatMessage[] = [
      {
        id: 'message-1',
        type: 'assistant',
        content: 'done',
        timestamp: 1,
        status: 'success',
        images: [
          {
            id: 'remote-image',
            url: 'blob:remote-image',
            originalUrl: 'https://example.test/image.png',
            base64: 'image-data',
            timestamp: 1,
          },
        ],
      },
    ]

    const result = stripBase64FromMessages(messages)

    expect(result[0].images?.[0]).toMatchObject({
      url: 'https://example.test/image.png',
      originalUrl: 'https://example.test/image.png',
    })
    expect(result[0].images?.[0].base64).toBeUndefined()
  })

  it('resolves and strips generation-only attachments', async () => {
    const storedAttachment = {
      id: 'generation-reference',
      name: 'reference.png',
      url: 'images/reference.png',
      localPath: 'images/reference.png',
      base64: 'image-data',
      timestamp: 1,
    }
    mockState.resolveDisplayUrl.mockResolvedValue({
      ...storedAttachment,
      url: 'blob:generation-reference',
    })
    const messages: ChatMessage[] = [
      {
        id: 'message-1',
        type: 'assistant',
        content: 'done',
        timestamp: 1,
        status: 'success',
        generation: {
          prompt: 'use the reference',
          size: 'auto',
          quality: 'auto',
          n: 1,
          attachmentIds: [storedAttachment.id],
          attachments: [storedAttachment],
        },
      },
    ]

    const { resolveStoredImageUrls, stripBase64FromMessages } =
      await import('../../utils/imagePersistence')
    const resolved = await resolveStoredImageUrls(messages)
    const stripped = stripBase64FromMessages(resolved)

    expect(mockState.resolveDisplayUrl).toHaveBeenCalledWith(storedAttachment)
    expect(stripped[0].generation?.attachments?.[0]).toMatchObject({
      url: 'images/reference.png',
      localPath: 'images/reference.png',
    })
    expect(stripped[0].generation?.attachments?.[0].base64).toBeUndefined()
  })
})
