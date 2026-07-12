import { describe, expect, it } from 'vitest'
import { webImageRepository } from '../../platform/webImageRepository'

describe('web image repository', () => {
  it('stores generated base64 images as blobs', async () => {
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
      url: expect.stringMatching(/^blob:/),
      webStorageKey: 'web:image-1',
      mimeType: 'image/webp',
      byteSize: 3,
      sourcePrompt: 'a lake',
      sourceMessageId: 'message-1',
    })
    expect(result).not.toHaveProperty('base64')
    expect(await (await webImageRepository.readImageBlob(result)).text()).toBe('png')
  })

  it('migrates historical base64 images to blob storage', async () => {
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
      url: expect.stringMatching(/^blob:/),
      webStorageKey: 'web:image-1',
    })
    expect(result).not.toHaveProperty('base64')
    expect(await (await webImageRepository.readImageBlob(result)).text()).toBe('png')
  })
})
