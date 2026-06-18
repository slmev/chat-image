import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildGeneratedImagesFromResponse,
  createImageUrlFromResponseItem,
  isBrowserReadableImageUrl,
  isExternalImageUrl,
  isValidImageUrl,
} from '../../utils/images'

describe('image utils', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('classifies browser-readable image URLs', () => {
    expect(isBrowserReadableImageUrl('blob:https://example.com/id')).toBe(true)
    expect(isBrowserReadableImageUrl('data:image/png;base64,abc')).toBe(true)
    expect(isBrowserReadableImageUrl('https://example.com/image.png')).toBe(false)
  })

  it('classifies external image URLs', () => {
    expect(isExternalImageUrl('https://example.com/image.png')).toBe(true)
    expect(isExternalImageUrl('http://example.com/image.png')).toBe(true)
    expect(isExternalImageUrl('blob:https://example.com/id')).toBe(false)
  })

  it('allows safe image protocols', () => {
    expect(isValidImageUrl('https://example.com/image.png')).toBe(true)
    expect(isValidImageUrl('blob:https://example.com/id')).toBe(true)
    expect(isValidImageUrl('data:image/png;base64,abc')).toBe(true)
    expect(isValidImageUrl('javascript:alert(1)')).toBe(false)
  })

  it('falls back to API image URLs when base64 is not present', () => {
    expect(createImageUrlFromResponseItem({ url: 'https://example.com/image.png' })).toBe(
      'https://example.com/image.png',
    )
  })

  it('creates blob URLs from base64 response items', () => {
    const createObjectURL = vi.fn(() => 'blob:mock-image')
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })

    expect(createImageUrlFromResponseItem({ b64_json: btoa('png') })).toBe('blob:mock-image')
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
  })

  it('prefers base64 over API image URLs', () => {
    const createObjectURL = vi.fn(() => 'blob:preferred-image')
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })

    expect(
      createImageUrlFromResponseItem({
        url: 'https://example.com/image.png',
        b64_json: btoa('png'),
      }),
    ).toBe('blob:preferred-image')
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
  })

  it('builds generated images from an API response', () => {
    const images = buildGeneratedImagesFromResponse(
      {
        created: Date.now(),
        data: [{ url: 'https://example.com/image.png' }],
      },
      {
        idPrefix: 'edited',
        sourcePrompt: 'test prompt',
        sourceMessageId: 'message-1',
      },
    )

    expect(images).toHaveLength(1)
    expect(images[0]).toMatchObject({
      url: 'https://example.com/image.png',
      sourcePrompt: 'test prompt',
      sourceMessageId: 'message-1',
    })
    expect(images[0].id).toMatch(/^edited-/)
  })

  it('keeps base64 on generated images for refresh recovery', () => {
    const createObjectURL = vi.fn(() => 'blob:persisted-image')
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })

    const base64 = btoa('png')
    const images = buildGeneratedImagesFromResponse(
      {
        created: Date.now(),
        data: [{ url: 'https://example.com/image.png', b64_json: base64 }],
      },
      {
        sourcePrompt: 'test prompt',
      },
    )

    expect(images[0]).toMatchObject({
      url: 'blob:persisted-image',
      base64,
      sourcePrompt: 'test prompt',
    })
  })
})
