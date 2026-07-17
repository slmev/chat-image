import { useConfigStore } from '../stores/config'
import { createImageGenerationService, ImageGenerationCanceledError } from '../services/api'
import type { ChatAttachment, GenerationOptions, GeneratedImage } from '../types'
import { getImageRepository } from '../platform/imageRepository'
import { persistGeneratedImagesFromResponse } from '../utils/images'
import { normalizeGenerationOptions } from '../utils/constants'
import i18n from '../i18n'

// 保存当前服务的引用，以便可以取消请求
let currentService: ReturnType<typeof createImageGenerationService> | null = null

export function useImageGeneration() {
  const configStore = useConfigStore()
  const t = i18n.global.t

  async function generateImage(
    prompt: string,
    options: GenerationOptions,
    attachments: ChatAttachment[] = [],
  ): Promise<GeneratedImage[]> {
    if (!configStore.apiConfig) {
      throw new Error(t('configureApiFirst'))
    }

    currentService?.cancelRequest()
    const service = createImageGenerationService(configStore.apiConfig)
    currentService = service

    const generationOptions = normalizeGenerationOptions(options)

    // 如果有风格模板，添加到提示词
    const finalPrompt = generationOptions.style
      ? `${prompt}, ${generationOptions.style.promptSuffix}`
      : prompt

    try {
      const repository = getImageRepository()
      let response
      if (attachments.length > 0) {
        const inputImages = await Promise.all(
          attachments.map((attachment) => repository.readImageBlob(attachment)),
        )
        if (currentService !== service) {
          throw new ImageGenerationCanceledError()
        }
        response = await service.editImage({
          image: inputImages,
          prompt: finalPrompt,
          size: generationOptions.size,
          quality: generationOptions.quality,
          n: generationOptions.n,
          response_format: 'b64_json',
        })
      } else {
        response = await service.generateImage(finalPrompt, {
          size: generationOptions.size,
          quality: generationOptions.quality,
          n: generationOptions.n,
        })
      }

      if (currentService !== service) {
        throw new ImageGenerationCanceledError()
      }

      const images: GeneratedImage[] = await persistGeneratedImagesFromResponse(response, {
        sourcePrompt: finalPrompt,
      })

      return images
    } catch (error) {
      console.error('Image generation failed:', error)
      throw error
    } finally {
      if (currentService === service) {
        currentService = null
      }
    }
  }

  function cancelGeneration(): void {
    if (currentService) {
      currentService.cancelRequest()
      currentService = null
    }
  }

  return {
    generateImage,
    cancelGeneration,
  }
}
