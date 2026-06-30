import { describe, expect, it } from 'vitest'
import { webImageRepository } from '../../platform/webImageRepository'

describe('web image repository', () => {
  it('saves generated base64 images as data URLs and keeps base64', async () => {
    const base64 = btoa('png')

    const result = await webImageRepository.saveGeneratedImage({
      id: 'image-1',
      b64Json: base64,
      mimeType: 'image/webp',
      timestamp: 1,
      sourcePrompt: 'a lake',
      sourceMessageId: 'message-1',
    })

    expect(result).toMatchObject({
      id: 'image-1',
      url: `data:image/webp;base64,${base64}`,
      base64,
      mimeType: 'image/webp',
      byteSize: 3,
      sourcePrompt: 'a lake',
      sourceMessageId: 'message-1',
    })
  })

  it('resolves historical base64 images as data URLs', async () => {
    const base64 = btoa('png')

    const result = await webImageRepository.resolveDisplayUrl({
      id: 'image-1',
      url: 'blob:stale-image',
      base64,
      mimeType: 'image/png',
      timestamp: 1,
    })

    expect(result).toMatchObject({
      id: 'image-1',
      url: `data:image/png;base64,${base64}`,
      base64,
    })
  })
})
