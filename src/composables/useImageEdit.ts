import { ref } from 'vue'
import { useConfigStore } from '../stores/config'
import { ImageGenerationService } from '../services/api'
import type { GeneratedImage, ImageEditRequest, VariationOptions, ImageGenerationResponse } from '../types'
import { isExternalImageUrl } from '../utils/images'
import { getImageRepository } from '../platform/imageRepository'

export function useImageEdit() {
  const configStore = useConfigStore()
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  let currentService: ImageGenerationService | null = null

  function getService(): ImageGenerationService {
    if (!currentService) {
      const config = configStore.apiConfig
      if (!config) {
        throw new Error('请先配置 API')
      }
      currentService = new ImageGenerationService(config)
    } else {
      currentService.updateConfig(configStore.apiConfig!)
    }
    return currentService
  }

  /**
   * Fetch image as Blob from URL
   */
  async function fetchImageAsBlob(image: GeneratedImage): Promise<Blob> {
    try {
      return await getImageRepository().readImageBlob(image)
    } catch (err) {
      if (isExternalImageUrl(image.url)) {
        throw new Error('该图片链接不允许前端读取，请使用 base64 返回或重新生成')
      }
      throw err
    }
  }

  /**
   * Create variation of an image by regenerating with modified prompt
   */
  async function createVariation(
    image: GeneratedImage,
    options: VariationOptions
  ): Promise<ImageGenerationResponse> {
    isLoading.value = true
    error.value = null

    try {
      const service = getService()

      // Build variation prompt
      const basePrompt = image.sourcePrompt || options.prompt
      let variationPrompt = `${basePrompt}, alternative version, different perspective`

      // Append style suffix if selected
      if (options.style) {
        variationPrompt += `, ${options.style.promptSuffix}`
      }

      const response = await service.generateImage(variationPrompt, {
        size: options.size,
        quality: options.quality,
        n: options.n,
      })

      return response
    } catch (err) {
      const message = err instanceof Error ? err.message : '创建变体失败'
      error.value = message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Edit an image with optional mask (inpainting)
   */
  async function editImage(
    image: GeneratedImage,
    mask: Blob | undefined,
    prompt: string,
    size?: '1024x1024' | '1792x1024' | '1024x1792'
  ): Promise<ImageGenerationResponse> {
    isLoading.value = true
    error.value = null

    try {
      const service = getService()
      const imageBlob = await fetchImageAsBlob(image)

      const request: ImageEditRequest = {
        image: imageBlob,
        mask,
        prompt,
        size,
      }

      const response = await service.editImage(request)
      return response
    } catch (err) {
      const message = err instanceof Error ? err.message : '编辑图片失败'
      error.value = message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Cancel current request
   */
  function cancelEdit(): void {
    if (currentService) {
      currentService.cancelRequest()
    }
  }

  return {
    isLoading,
    error,
    fetchImageAsBlob,
    createVariation,
    editImage,
    cancelEdit,
  }
}
