import { useConfigStore } from '../stores/config'
import { createImageGenerationService } from '../services/api'
import type { ChatAttachment, GenerationOptions, GeneratedImage } from '../types'
import { getImageRepository } from '../platform/imageRepository'
import { persistGeneratedImagesFromResponse } from '../utils/images'
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

    // 创建新的服务实例
    currentService = createImageGenerationService(configStore.apiConfig)

    // 如果有风格模板，添加到提示词
    const finalPrompt = options.style ? `${prompt}, ${options.style.promptSuffix}` : prompt

    try {
      const repository = getImageRepository()
      const response =
        attachments.length > 0
          ? await currentService.editImage({
              image: await Promise.all(
                attachments.map((attachment) => repository.readImageBlob(attachment)),
              ),
              prompt: finalPrompt,
              size: options.size,
              quality: options.quality,
              n: options.n,
              response_format: 'b64_json',
            })
          : await currentService.generateImage(finalPrompt, {
              size: options.size,
              quality: options.quality,
              n: options.n,
            })

      const images: GeneratedImage[] = await persistGeneratedImagesFromResponse(response, {
        sourcePrompt: finalPrompt,
      })

      return images
    } catch (error) {
      console.error('Image generation failed:', error)
      throw error
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
