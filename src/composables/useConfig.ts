import { useConfigStore } from '../stores/config'
import { runtimeFetch } from '../platform/httpClient'
import { DEFAULT_MODEL } from '../utils/constants'
import type { ApiConfig } from '../types'

// 测试结果用与语言无关的 code 表示，由调用方负责 i18n 翻译，避免在组件里反向映射中文文案。
export type ApiTestCode =
  | 'apiConfigRequired'
  | 'apiConfigFieldsRequired'
  | 'apiConnectionSuccess'
  | 'invalidApiKey'
  | 'rateLimited'
  | 'serverError'
  | 'networkConnectionFailed'

export interface ApiTestResult {
  success: boolean
  code: ApiTestCode
  // serverError 时由服务器返回的原始错误信息（若有），否则为 HTTP 状态码。
  detail?: string
  status?: number
}

/**
 * 将结构化的测试结果翻译为本地化文本。
 * 服务器错误优先展示服务端返回的具体信息，否则以状态码拼接 i18n key。
 */
export function localizeApiTestResult(
  result: ApiTestResult,
  t: (key: string, named?: Record<string, unknown>) => string,
): string {
  if (result.code === 'serverError') {
    return result.detail || t('apiTestServerError', { code: result.status ?? '' })
  }
  return t(result.code)
}

export function useConfig() {
  const configStore = useConfigStore()

  function testApiConnection(config: ApiConfig | null = configStore.apiConfig): Promise<ApiTestResult> {
    if (!config) {
      return Promise.resolve({ success: false, code: 'apiConfigRequired' })
    }

    const { endpoint, apiKey } = config

    if (!endpoint.trim() || !apiKey.trim()) {
      return Promise.resolve({ success: false, code: 'apiConfigFieldsRequired' })
    }

    // 去掉末尾斜杠，避免用户粘贴的端点产生 `host//v1/models` 双斜杠
    const normalizedEndpoint = endpoint.replace(/\/+$/, '')

    // 发送一个简单的测试请求（获取模型列表或类似）
    return runtimeFetch(`${normalizedEndpoint}/v1/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })
      .then(async (response): Promise<ApiTestResult> => {
        if (response.ok) {
          return { success: true, code: 'apiConnectionSuccess' }
        } else if (response.status === 401) {
          return { success: false, code: 'invalidApiKey' }
        } else if (response.status === 429) {
          return { success: false, code: 'rateLimited' }
        } else {
          const errorData = await response.json().catch(() => null)
          return {
            success: false,
            code: 'serverError',
            detail: errorData?.error?.message,
            status: response.status,
          }
        }
      })
      .catch((error): ApiTestResult => {
        console.error('API connection test error:', error)
        return { success: false, code: 'networkConnectionFailed' }
      })
  }

  function initializeConfig() {
    const savedConfig = configStore.apiConfig
    return {
      endpoint: savedConfig?.endpoint || '',
      apiKey: savedConfig?.apiKey || '',
      model: savedConfig?.model || DEFAULT_MODEL,
    }
  }

  return {
    configStore,
    testApiConnection,
    initializeConfig,
  }
}
