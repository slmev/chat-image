import { describe, expect, it, vi } from 'vitest'
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

  it('replaces the cached object URL when overwriting the same storage key', async () => {
    const first = await webImageRepository.saveGeneratedImage({
      id: 'same-image',
      b64Json: btoa('first'),
      timestamp: 1,
    })
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL')

    const second = await webImageRepository.saveGeneratedImage({
      id: 'same-image',
      b64Json: btoa('second'),
      timestamp: 2,
    })

    expect(second.url).not.toBe(first.url)
    expect(revokeObjectUrl).toHaveBeenCalledWith(first.url)
    expect(await (await webImageRepository.readImageBlob(second)).text()).toBe('second')
  })

  it('uses an independent storage key without changing the imported image id', async () => {
    const original = await webImageRepository.saveGeneratedImage({
      id: 'shared-id',
      b64Json: btoa('original'),
      timestamp: 1,
    })

    const imported = await webImageRepository.saveGeneratedImage({
      id: 'shared-id',
      storageId: 'import-batch-0',
      b64Json: btoa('imported'),
      timestamp: 2,
    })

    expect(imported).toMatchObject({ id: 'shared-id', webStorageKey: 'web:import-batch-0' })
    expect(await (await webImageRepository.readImageBlob(original)).text()).toBe('original')
    expect(await (await webImageRepository.readImageBlob(imported)).text()).toBe('imported')
  })
})
