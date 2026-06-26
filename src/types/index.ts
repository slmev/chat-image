// API 相关类型
export interface ApiConfig {
  endpoint: string
  apiKey: string
  model: string
}

export interface ApiConfigProfile extends ApiConfig {
  id: string
  name: string
}

export interface ApiConfigState {
  configs: ApiConfigProfile[]
  activeConfigId: string | null
}

export interface ImageGenerationRequest {
  model: string
  prompt: string
  n: number
  size: '1024x1024' | '1792x1024' | '1024x1792'
  quality: 'standard' | 'hd'
  response_format: 'b64_json'
}

export interface ImageGenerationResponse {
  created: number
  data: Array<{
    url?: string
    b64_json?: string
  }>
}

export interface ApiError {
  error: {
    message: string
    type: string
    code: string
  }
}

// 消息相关类型
export type MessageType = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  type: MessageType
  content: string
  timestamp: number
  attachments?: ChatAttachment[]
  images?: GeneratedImage[]
  generationSize?: GenerationOptions['size']
  generationQuality?: GenerationOptions['quality']
  generationCount?: GenerationOptions['n']
  generationStyle?: GenerationOptions['style']
  status: 'pending' | 'success' | 'error'
  error?: string
  isFavorite?: boolean
}

export interface GeneratedImage {
  id: string
  url: string
  base64?: string
  localPath?: string
  originalUrl?: string
  mimeType?: string
  byteSize?: number
  timestamp: number
  sourcePrompt?: string
  sourceMessageId?: string
}

export interface ChatAttachment extends GeneratedImage {
  name: string
}

export interface GalleryImageItem {
  id: string
  image: GeneratedImage
  sourceMessage: ChatMessage
  sourceMessageId: string
  sourceHistoryId?: string
  sourceHistoryTitle?: string
  sourceType: 'current' | 'history'
  prompt: string
  timestamp: number
  isFavorite: boolean
}

// 风格模板类型
export interface StyleTemplate {
  id: string
  name: string
  description: string
  promptSuffix: string
  icon: string
}

// 配置选项类型
export interface GenerationOptions {
  size: '1024x1024' | '1792x1024' | '1024x1792'
  quality: 'standard' | 'hd'
  n: number
  style?: StyleTemplate
}

// 主题类型
export type Theme = 'light' | 'dark' | 'system'

// 导出数据格式
export interface ChatExportData {
  version: number
  exportedAt: number
  messages: ChatMessage[]
}

export interface DesktopHistoryExportData {
  version: 2
  exportedAt: number
  kind: 'desktop-zip'
  currentMessages: ChatMessage[]
  historyList: ChatHistory[]
  historyMessages: Record<string, ChatMessage[]>
}

// 聊天历史记录
export interface ChatHistory {
  id: string
  title: string
  timestamp: number
  messageCount: number
  isFavorite: boolean
  preview?: string
}

// 图片编辑类型
export interface ImageEditRequest {
  image: File | Blob | Array<File | Blob>
  mask?: File | Blob
  prompt: string
  size?: '1024x1024' | '1792x1024' | '1024x1792'
  quality?: 'standard' | 'hd'
  n?: number
  response_format?: 'b64_json'
}

export interface VariationOptions {
  prompt: string
  style?: StyleTemplate
  size: '1024x1024' | '1792x1024' | '1024x1792'
  quality: 'standard' | 'hd'
  n: number
}

// 提示词建议类型
export type PromptCategory = 'people' | 'landscape' | 'products' | 'animals' | 'abstract' | 'architecture'

export interface PromptTemplate {
  id: string
  category: PromptCategory
  title: string
  prompt: string
  description?: string
  tags?: string[]
}

export interface PromptCategoryInfo {
  id: PromptCategory
  name: string
  icon: string
}
