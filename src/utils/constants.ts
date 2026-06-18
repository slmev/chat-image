import type { StyleTemplate } from '../types'

// 图片尺寸选项
export const IMAGE_SIZES = [
  { value: '1024x1024', label: '方形 (1024×1024)' },
  { value: '1792x1024', label: '横向 (1792×1024)' },
  { value: '1024x1792', label: '纵向 (1024×1792)' },
] as const

// 图片质量选项
export const IMAGE_QUALITIES = [
  { value: 'standard', label: '标准' },
  { value: 'hd', label: '高清' },
] as const

// 图片生成数量范围
export const IMAGE_COUNT_RANGE = { min: 1, max: 4 } as const

// 默认模型
export const DEFAULT_MODEL = 'gpt-image-2'

// 预设风格模板
export const STYLE_TEMPLATES: StyleTemplate[] = [
  {
    id: 'anime',
    name: '动漫',
    description: '日系动漫风格',
    promptSuffix: 'anime style, vibrant colors, detailed illustration',
    icon: 'sparkles',
  },
  {
    id: 'realistic',
    name: '写实',
    description: '真实摄影风格',
    promptSuffix: 'photorealistic, high detail, professional photography',
    icon: 'camera',
  },
  {
    id: 'oil-painting',
    name: '油画',
    description: '油画艺术风格',
    promptSuffix: 'oil painting style, artistic, rich textures, classic art',
    icon: 'palette',
  },
  {
    id: 'watercolor',
    name: '水彩',
    description: '水彩画风格',
    promptSuffix: 'watercolor painting style, soft colors, flowing, artistic',
    icon: 'droplet',
  },
  {
    id: 'sketch',
    name: '素描',
    description: '素描线条风格',
    promptSuffix: 'pencil sketch style, detailed lines, artistic drawing',
    icon: 'pencil',
  },
  {
    id: 'cyberpunk',
    name: '赛博朋克',
    description: '科幻赛博朋克风格',
    promptSuffix: 'cyberpunk style, neon lights, futuristic, dark atmosphere',
    icon: 'zap',
  },
]

// 存储键名
export const STORAGE_KEYS = {
  API_CONFIG: 'chat-image-api-config',
  CHAT_HISTORY: 'chat-image-chat-history',
  THEME: 'chat-image-theme',
  GENERATION_OPTIONS: 'chat-image-generation-options',
  PROMPT_RECENT: 'chat-image-prompt-recent',
  CUSTOM_STYLES: 'chat-image-custom-styles',
} as const

// API 错误消息
export const API_ERROR_MESSAGES = {
  INVALID_KEY: 'API Key 无效，请检查您的密钥',
  RATE_LIMIT: '请求过于频繁，请稍后再试',
  SERVER_ERROR: '服务器错误，请稍后再试',
  NETWORK_ERROR: '网络连接失败，请检查网络',
  UNKNOWN_ERROR: '未知错误，请重试',
} as const