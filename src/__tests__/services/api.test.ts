import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageGenerationService } from '../../services/api'

const mockState = vi.hoisted(() => ({
  runtimeFetch: vi.fn(),
}))

vi.mock('../../platform/httpClient', () => ({
  runtimeFetch: mockState.runtimeFetch,
}))

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ImageGenerationService', () => {
  beforeEach(() => {
    mockState.runtimeFetch.mockReset()
  })

  it('sends image generation requests through the runtime HTTP client', async () => {
    mockState.runtimeFetch.mockResolvedValueOnce(
      jsonResponse({
        created: 1,
        data: [{ b64_json: 'image-bytes' }],
      }),
    )
    const service = new ImageGenerationService({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })

    const result = await service.generateImage('draw a desk', {
      size: '2048x1152',
      quality: 'high',
      n: 2,
    })

    expect(result.data[0].b64_json).toBe('image-bytes')
    expect(mockState.runtimeFetch).toHaveBeenCalledWith(
      'https://api.example.test/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-test',
        },
        signal: expect.any(AbortSignal),
      }),
    )
    const init = mockState.runtimeFetch.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'gpt-image-2',
      prompt: 'draw a desk',
      n: 2,
      size: '2048x1152',
      quality: 'high',
      response_format: 'b64_json',
    })
  })

  it('sends image edit requests as form data through the runtime HTTP client', async () => {
    mockState.runtimeFetch.mockResolvedValueOnce(
      jsonResponse({
        created: 1,
        data: [{ b64_json: 'edited-image' }],
      }),
    )
    const image = new Blob(['image'], { type: 'image/png' })
    const mask = new Blob(['mask'], { type: 'image/png' })
    const service = new ImageGenerationService({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })

    await service.editImage({
      image,
      mask,
      prompt: 'replace background',
      size: 'auto',
      quality: 'medium',
    })

    const init = mockState.runtimeFetch.mock.calls[0][1] as RequestInit
    const body = init.body as FormData

    expect(mockState.runtimeFetch).toHaveBeenCalledWith(
      'https://api.example.test/v1/images/edits',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk-test',
        },
        signal: expect.any(AbortSignal),
      }),
    )
    expect(body.get('image')).toBeInstanceOf(Blob)
    expect(body.get('mask')).toBeInstanceOf(Blob)
    expect(body.get('prompt')).toBe('replace background')
    expect(body.get('model')).toBe('gpt-image-2')
    expect(body.get('n')).toBe('1')
    expect(body.get('size')).toBe('auto')
    expect(body.get('quality')).toBe('medium')
    expect(body.get('response_format')).toBe('b64_json')
  })

  it('sends multiple image edit inputs as repeated form data fields', async () => {
    mockState.runtimeFetch.mockResolvedValueOnce(
      jsonResponse({
        created: 1,
        data: [{ b64_json: 'edited-image' }],
      }),
    )
    const firstImage = new Blob(['first'], { type: 'image/png' })
    const secondImage = new Blob(['second'], { type: 'image/webp' })
    const service = new ImageGenerationService({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })

    await service.editImage({
      image: [firstImage, secondImage],
      prompt: 'use both references',
      size: '1536x1024',
      quality: 'low',
      n: 3,
    })

    const init = mockState.runtimeFetch.mock.calls[0][1] as RequestInit
    const body = init.body as FormData

    const images = body.getAll('image')
    expect(images).toHaveLength(2)
    expect(images[0]).toBeInstanceOf(Blob)
    expect(images[1]).toBeInstanceOf(Blob)
    expect(body.get('prompt')).toBe('use both references')
    expect(body.get('size')).toBe('1536x1024')
    expect(body.get('quality')).toBe('low')
    expect(body.get('n')).toBe('3')
  })

  it('maps abort errors to the existing cancellation message', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    mockState.runtimeFetch.mockRejectedValueOnce(abortError)
    const service = new ImageGenerationService({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })

    await expect(service.generateImage('draw')).rejects.toThrow('请求已取消')
  })

  it('maps API status errors as before', async () => {
    mockState.runtimeFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          error: { message: 'invalid key' },
        },
        401,
      ),
    )
    const service = new ImageGenerationService({
      endpoint: 'https://api.example.test',
      apiKey: 'bad-key',
      model: 'gpt-image-2',
    })

    await expect(service.generateImage('draw')).rejects.toThrow('API Key 无效，请检查您的密钥')
  })

  it('uses API error messages for unhandled status codes', async () => {
    mockState.runtimeFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          error: { message: 'unsupported image size' },
        },
        400,
      ),
    )
    const service = new ImageGenerationService({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })

    await expect(service.generateImage('draw')).rejects.toThrow('unsupported image size')
  })
})
