import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useImageGeneration } from '../../composables/useImageGeneration'
import { useConfigStore } from '../../stores/config'
import type { ChatAttachment, GeneratedImage, ImageGenerationResponse } from '../../types'

const mockState = vi.hoisted(() => {
  const service = {
    generateImage: vi.fn(),
    editImage: vi.fn(),
    cancelRequest: vi.fn(),
  }

  return {
    service,
    createImageGenerationService: vi.fn(() => service),
    readImageBlob: vi.fn(),
    persistGeneratedImagesFromResponse: vi.fn(),
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
  createImageGenerationService: mockState.createImageGenerationService,
}))

vi.mock('../../platform/imageRepository', () => ({
  getImageRepository: () => ({
    readImageBlob: mockState.readImageBlob,
  }),
}))

vi.mock('../../utils/images', () => ({
  persistGeneratedImagesFromResponse: mockState.persistGeneratedImagesFromResponse,
}))

function response(): ImageGenerationResponse {
  return {
    created: 1,
    data: [{ b64_json: 'image' }],
  }
}

function generatedImage(): GeneratedImage {
  return {
    id: 'generated-1',
    url: 'blob:generated-1',
    timestamp: 1,
  }
}

function attachment(id: string): ChatAttachment {
  return {
    id,
    name: `${id}.png`,
    url: `blob:${id}`,
    base64: btoa(id),
    mimeType: 'image/png',
    timestamp: 1,
  }
}

describe('useImageGeneration', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockState.service.generateImage.mockReset()
    mockState.service.editImage.mockReset()
    mockState.service.cancelRequest.mockReset()
    mockState.createImageGenerationService.mockClear()
    mockState.readImageBlob.mockReset()
    mockState.persistGeneratedImagesFromResponse.mockReset()

    await useConfigStore().saveConfig({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
  })

  it('uses text generation when no attachments are provided', async () => {
    const apiResponse = response()
    mockState.service.generateImage.mockResolvedValueOnce(apiResponse)
    mockState.persistGeneratedImagesFromResponse.mockResolvedValueOnce([generatedImage()])

    const result = await useImageGeneration().generateImage('draw a lake', {
      size: 'auto',
      quality: 'auto',
      n: 1,
    })

    expect(result).toEqual([generatedImage()])
    expect(mockState.service.generateImage).toHaveBeenCalledWith('draw a lake', {
      size: 'auto',
      quality: 'auto',
      n: 1,
    })
    expect(mockState.service.editImage).not.toHaveBeenCalled()
    expect(mockState.persistGeneratedImagesFromResponse).toHaveBeenCalledWith(apiResponse, {
      sourcePrompt: 'draw a lake',
    })
  })

  it('uses image edits with all attachment blobs as references', async () => {
    const firstBlob = new Blob(['first'], { type: 'image/png' })
    const secondBlob = new Blob(['second'], { type: 'image/webp' })
    const apiResponse = response()
    mockState.readImageBlob.mockResolvedValueOnce(firstBlob).mockResolvedValueOnce(secondBlob)
    mockState.service.editImage.mockResolvedValueOnce(apiResponse)
    mockState.persistGeneratedImagesFromResponse.mockResolvedValueOnce([generatedImage()])

    await useImageGeneration().generateImage(
      'draw a product photo',
      {
        size: '2304x4096',
        quality: 'high',
        n: 2,
      },
      [attachment('reference-1'), attachment('reference-2')],
    )

    expect(mockState.service.generateImage).not.toHaveBeenCalled()
    expect(mockState.service.editImage).toHaveBeenCalledWith({
      image: [firstBlob, secondBlob],
      prompt: 'draw a product photo',
      size: '2304x4096',
      quality: 'high',
      n: 2,
      response_format: 'b64_json',
    })
  })
})
