import type { ApiConfig, ImageGenerationRequest, ImageGenerationResponse, ImageEditRequest } from '../types'
import { runtimeFetch } from '../platform/httpClient'
import { API_ERROR_MESSAGES } from '../utils/constants'

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
    options: {
      size?: '1024x1024' | '1792x1024' | '1024x1792'
      quality?: 'standard' | 'hd'
      n?: number
    } = {}
  ): Promise<ImageGenerationResponse> {
    // 取消之前的请求
    this.cancelRequest()

    // 创建新的 AbortController
    this.abortController = new AbortController()

    const {
      size = '1024x1024',
      quality = 'standard',
      n = 1,
    } = options

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
          'Authorization': `Bearer ${this.config.apiKey}`,
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
    images.forEach(image => {
      formData.append('image', image)
    })
    if (request.mask) {
      formData.append('mask', request.mask)
    }
    formData.append('prompt', request.prompt)
    formData.append('model', this.config.model)
    formData.append('n', String(request.n ?? 1))
    formData.append('response_format', request.response_format ?? 'b64_json')
    if (request.size) {
      formData.append('size', request.size)
    }
    if (request.quality) {
      formData.append('quality', request.quality)
    }

    try {
      const response = await runtimeFetch(`${this.config.endpoint}/v1/images/edits`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
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
  private handleApiError(status: number, errorData: any): Error {
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
        const errorMessage = errorData?.error?.message || API_ERROR_MESSAGES.UNKNOWN_ERROR
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
