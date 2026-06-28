import type {
  ApiConfig,
  GenerationOptions,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageEditRequest,
} from '../types'
import { runtimeFetch } from '../platform/httpClient'
import { API_ERROR_MESSAGES, normalizeGenerationOptions } from '../utils/constants'

function getApiErrorMessage(errorData: unknown): string | undefined {
  if (!errorData || typeof errorData !== 'object' || !('error' in errorData)) {
    return undefined
  }

  const error = (errorData as { error?: unknown }).error
  if (!error || typeof error !== 'object' || !('message' in error)) {
    return undefined
  }

  const message = (error as { message?: unknown }).message
  return typeof message === 'string' ? message : undefined
}

export class ImageGenerationService {
  private config: ApiConfig
  private abortController: AbortController | null = null

  constructor(config: ApiConfig) {
    this.config = config
  }

  /**
   * 取消当前请求
   */
  cancelRequest(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  /**
   * 生成图片
   */
  async generateImage(
    prompt: string,
    options: Partial<Pick<GenerationOptions, 'size' | 'quality' | 'n'>> = {},
  ): Promise<ImageGenerationResponse> {
    // 取消之前的请求
    this.cancelRequest()

    // 创建新的 AbortController
    this.abortController = new AbortController()

    const { size, quality, n } = normalizeGenerationOptions(options)

    const requestBody: ImageGenerationRequest = {
      model: this.config.model,
      prompt,
      n,
      size,
      quality,
      response_format: 'b64_json',
    }

    try {
      const response = await runtimeFetch(`${this.config.endpoint}/v1/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: this.abortController.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw this.handleApiError(response.status, errorData)
      }

      const data: ImageGenerationResponse = await response.json()
      this.abortController = null
      return data
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('请求已取消')
        }
        throw error
      }
      throw new Error(API_ERROR_MESSAGES.NETWORK_ERROR)
    }
  }

  /**
   * 编辑图片
   */
  async editImage(request: ImageEditRequest): Promise<ImageGenerationResponse> {
    // 取消之前的请求
    this.cancelRequest()

    // 创建新的 AbortController
    this.abortController = new AbortController()

    const formData = new FormData()
    const images = Array.isArray(request.image) ? request.image : [request.image]
    images.forEach((image) => {
      formData.append('image', image)
    })
    if (request.mask) {
      formData.append('mask', request.mask)
    }
    const generationOptions = normalizeGenerationOptions(request)
    formData.append('prompt', request.prompt)
    formData.append('model', this.config.model)
    formData.append('n', String(generationOptions.n))
    formData.append('response_format', request.response_format ?? 'b64_json')
    formData.append('size', generationOptions.size)
    formData.append('quality', generationOptions.quality)

    try {
      const response = await runtimeFetch(`${this.config.endpoint}/v1/images/edits`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: formData,
        signal: this.abortController.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw this.handleApiError(response.status, errorData)
      }

      const data: ImageGenerationResponse = await response.json()
      this.abortController = null
      return data
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('请求已取消')
        }
        throw error
      }
      throw new Error(API_ERROR_MESSAGES.NETWORK_ERROR)
    }
  }

  /**
   * 处理 API 错误
   */
  private handleApiError(status: number, errorData: unknown): Error {
    switch (status) {
      case 401:
        return new Error(API_ERROR_MESSAGES.INVALID_KEY)
      case 429:
        return new Error(API_ERROR_MESSAGES.RATE_LIMIT)
      case 500:
      case 502:
      case 503:
        return new Error(API_ERROR_MESSAGES.SERVER_ERROR)
      default: {
        const errorMessage = getApiErrorMessage(errorData) || API_ERROR_MESSAGES.UNKNOWN_ERROR
        return new Error(errorMessage)
      }
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: ApiConfig) {
    this.config = config
  }
}

// 创建默认服务实例
export function createImageGenerationService(config: ApiConfig): ImageGenerationService {
  return new ImageGenerationService(config)
}
