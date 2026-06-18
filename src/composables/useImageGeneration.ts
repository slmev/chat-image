import { useConfigStore } from '../stores/config'
import { createImageGenerationService } from '../services/api'
import type { GenerationOptions, GeneratedImage } from '../types'
import { persistGeneratedImagesFromResponse } from '../utils/images'

// 保存当前服务的引用，以便可以取消请求
let currentService: ReturnType<typeof createImageGenerationService> | null = null

export function useImageGeneration() {
  const configStore = useConfigStore()

  async function generateImage(
    prompt: string,
    options: GenerationOptions
  ): Promise<GeneratedImage[]> {
    if (!configStore.apiConfig) {
      throw new Error('请先配置 API')
    }

    // 创建新的服务实例
    currentService = createImageGenerationService(configStore.apiConfig)

    // 如果有风格模板，添加到提示词
    const finalPrompt = options.style
      ? `${prompt}, ${options.style.promptSuffix}`
      : prompt

    try {
      const response = await currentService.generateImage(finalPrompt, {
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
