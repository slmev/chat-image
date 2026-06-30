import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigStore } from '../../stores/config'
import { useImageEdit } from '../../composables/useImageEdit'
import type { GeneratedImage, ImageGenerationResponse, StyleTemplate } from '../../types'

const mockState = vi.hoisted(() => {
  const service = {
    generateImage: vi.fn(),
    editImage: vi.fn(),
    updateConfig: vi.fn(),
    cancelRequest: vi.fn(),
  }

  return {
    service,
    ImageGenerationService: vi.fn(function ImageGenerationService() {
      return service
    }),
    readImageBlob: vi.fn(),
  }
})

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('../../platform/metadataStore', () => ({
  getMetadataValue: vi.fn(),
  removeMetadataValue: vi.fn(),
  setMetadataValue: vi.fn(),
}))

vi.mock('../../services/api', () => ({
  ImageGenerationService: mockState.ImageGenerationService,
}))

vi.mock('../../platform/imageRepository', () => ({
  getImageRepository: () => ({
    readImageBlob: mockState.readImageBlob,
  }),
}))

function image(): GeneratedImage {
  return {
    id: 'image-1',
    url: 'blob:image-1',
    sourcePrompt: 'a mountain cabin',
    timestamp: 1,
  }
}

function style(): StyleTemplate {
  return {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Film still',
    promptSuffix: 'cinematic lighting, film still',
    icon: 'sparkles',
  }
}

function response(): ImageGenerationResponse {
  return {
    created: 1,
    data: [{ b64_json: 'variation' }],
  }
}

describe('useImageEdit', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockState.service.generateImage.mockReset()
    mockState.service.editImage.mockReset()
    mockState.service.updateConfig.mockReset()
    mockState.service.cancelRequest.mockReset()
    mockState.ImageGenerationService.mockClear()
    mockState.readImageBlob.mockReset()

    await useConfigStore().saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
  })

  it('creates variations through image edits using the source image blob', async () => {
    const sourceImage = image()
    const sourceBlob = new Blob(['source'], { type: 'image/png' })
    const apiResponse = response()
    mockState.readImageBlob.mockResolvedValueOnce(sourceBlob)
    mockState.service.editImage.mockResolvedValueOnce(apiResponse)

    const result = await useImageEdit().createVariation(sourceImage, {
      prompt: 'make it winter',
      style: style(),
      size: '2048x1152',
      quality: 'high',
      n: 2,
    })

    expect(result).toBe(apiResponse)
    expect(mockState.readImageBlob).toHaveBeenCalledWith(sourceImage)
    expect(mockState.service.generateImage).not.toHaveBeenCalled()
    expect(mockState.service.editImage).toHaveBeenCalledWith({
      image: sourceBlob,
      prompt:
        'make it winter, alternative version, different perspective, cinematic lighting, film still',
      size: '2048x1152',
      quality: 'high',
      n: 2,
      response_format: 'b64_json',
    })
  })
})
