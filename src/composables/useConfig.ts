import { useConfigStore } from '../stores/config'
import { runtimeFetch } from '../platform/httpClient'
import { DEFAULT_MODEL } from '../utils/constants'

export function useConfig() {
  const configStore = useConfigStore()

  function testApiConnection(): Promise<{ success: boolean; message: string }> {
    if (!configStore.apiConfig) {
      return Promise.resolve({
        success: false,
        message: '请先配置 API 端点和密钥',
      })
    }

    const { endpoint, apiKey } = configStore.apiConfig

    if (!endpoint.trim() || !apiKey.trim()) {
      return Promise.resolve({
        success: false,
        message: 'API 端点和密钥不能为空',
      })
    }

    // 发送一个简单的测试请求（获取模型列表或类似）
    return runtimeFetch(`${endpoint}/v1/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })
      .then(async (response) => {
        if (response.ok) {
          return { success: true, message: 'API 连接成功' }
        } else if (response.status === 401) {
          return { success: false, message: 'API Key 无效' }
        } else if (response.status === 429) {
          return { success: false, message: '请求过于频繁' }
        } else {
          const errorData = await response.json().catch(() => null)
          const errorMsg = errorData?.error?.message || `错误代码: ${response.status}`
          return { success: false, message: errorMsg }
        }
      })
      .catch((error) => {
        console.error('API connection test error:', error)
        return {
          success: false,
          message: '网络连接失败，请检查端点地址和网络',
        }
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
