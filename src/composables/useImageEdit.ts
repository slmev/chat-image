import { ref } from 'vue'
import { useConfigStore } from '../stores/config'
import { ImageGenerationService } from '../services/api'
import type {
  GeneratedImage,
  GenerationQuality,
  GenerationSize,
  ImageEditRequest,
  VariationOptions,
  ImageGenerationResponse,
} from '../types'
import { isExternalImageUrl } from '../utils/images'
import { getImageRepository } from '../platform/imageRepository'
import { normalizeGenerationOptions } from '../utils/constants'
import i18n from '../i18n'

export function useImageEdit() {
  const configStore = useConfigStore()
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const t = i18n.global.t

  let currentService: ImageGenerationService | null = null

  function getService(): ImageGenerationService {
    if (!currentService) {
      const config = configStore.apiConfig
      if (!config) {
        throw new Error(t('configureApiFirst'))
      }
      currentService = new ImageGenerationService(config)
    } else {
      const config = configStore.apiConfig
      if (!config) {
        throw new Error(t('configureApiFirst'))
      }
      currentService.updateConfig(config)
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
        throw new Error(t('imageReadNotAllowed'))
      }
      throw err
    }
  }

  /**
   * Create variation of an image by regenerating with modified prompt
   */
  async function createVariation(
    image: GeneratedImage,
    options: VariationOptions,
  ): Promise<ImageGenerationResponse> {
    isLoading.value = true
    error.value = null

    try {
      const service = getService()
      const generationOptions = normalizeGenerationOptions(options)
      const imageBlob = await fetchImageAsBlob(image)

      // Build variation prompt
      const basePrompt = options.prompt?.trim() || image.sourcePrompt || ''
      let variationPrompt = `${basePrompt}, alternative version, different perspective`

      // Append style suffix if selected
      if (generationOptions.style) {
        variationPrompt += `, ${generationOptions.style.promptSuffix}`
      }

      const response = await service.editImage({
        image: imageBlob,
        prompt: variationPrompt,
        size: generationOptions.size,
        quality: generationOptions.quality,
        n: generationOptions.n,
        response_format: 'b64_json',
      })

      return response
    } catch (err) {
      const message = err instanceof Error ? err.message : t('createVariationFailed')
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
    size?: GenerationSize,
    quality?: GenerationQuality,
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
        quality,
      }

      const response = await service.editImage(request)
      return response
    } catch (err) {
      const message = err instanceof Error ? err.message : t('editImageFailed')
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
