import type { GenerationOptions, GenerationQuality, GenerationSize, StyleTemplate } from '../types'

// 图片尺寸选项
export const IMAGE_SIZE_PRESETS = [
  { value: 'auto', ratio: 'auto', width: null, height: null, labelKey: 'imageSizeAuto' },
  { value: '1024x1024', ratio: '1:1', width: 1024, height: 1024, labelKey: 'imageSize1x1' },
  { value: '1536x1024', ratio: '3:2', width: 1536, height: 1024, labelKey: 'imageSize3x2' },
  { value: '1024x1536', ratio: '2:3', width: 1024, height: 1536, labelKey: 'imageSize2x3' },
  { value: '1344x1024', ratio: '4:3', width: 1344, height: 1024, labelKey: 'imageSize4x3' },
  { value: '1024x1344', ratio: '3:4', width: 1024, height: 1344, labelKey: 'imageSize3x4' },
  { value: '1024x1792', ratio: '9:16', width: 1024, height: 1792, labelKey: 'imageSize9x16' },
  { value: '2048x2048', ratio: '1:1', width: 2048, height: 2048, labelKey: 'imageSize1x1_2k' },
  { value: '2048x1152', ratio: '16:9', width: 2048, height: 1152, labelKey: 'imageSize16x9_2k' },
  { value: '1152x2048', ratio: '9:16', width: 1152, height: 2048, labelKey: 'imageSize9x16_2k' },
  { value: '4096x2304', ratio: '16:9', width: 4096, height: 2304, labelKey: 'imageSize16x9_4k' },
  { value: '2304x4096', ratio: '9:16', width: 2304, height: 4096, labelKey: 'imageSize9x16_4k' },
] as const

export const IMAGE_SIZES = IMAGE_SIZE_PRESETS

// 图片质量选项
export const IMAGE_QUALITIES = [
  { value: 'auto', labelKey: 'qualityAuto' },
  { value: 'high', labelKey: 'qualityHigh' },
  { value: 'medium', labelKey: 'qualityMedium' },
  { value: 'low', labelKey: 'qualityLow' },
] as const

export const DEFAULT_GENERATION_OPTIONS = {
  size: 'auto',
  quality: 'auto',
  n: 1,
} satisfies Omit<GenerationOptions, 'style'>

export type ImageSizePreset = (typeof IMAGE_SIZE_PRESETS)[number]

export function normalizeImageQuality(value: unknown): GenerationQuality {
  switch (value) {
    case 'auto':
    case 'high':
    case 'medium':
    case 'low':
      return value
    case 'hd':
      return 'high'
    case 'standard':
      return 'medium'
    default:
      return DEFAULT_GENERATION_OPTIONS.quality
  }
}

export function parseImageSize(value: unknown): { width: number; height: number } | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d+)x(\d+)$/)
  if (!match) return null

  const width = Number.parseInt(match[1], 10)
  const height = Number.parseInt(match[2], 10)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }

  return { width, height }
}

export function normalizeImageSize(value: unknown): GenerationSize {
  if (value === 'auto') return 'auto'
  const parsed = parseImageSize(value)
  return parsed ? `${parsed.width}x${parsed.height}` : DEFAULT_GENERATION_OPTIONS.size
}

export function findImageSizePreset(value: unknown): ImageSizePreset | undefined {
  const normalized = normalizeImageSize(value)
  return IMAGE_SIZE_PRESETS.find((preset) => preset.value === normalized)
}

export function normalizeGenerationOptions(value: unknown): GenerationOptions {
  const options = value && typeof value === 'object' ? (value as Partial<GenerationOptions>) : {}
  const count = Number(options.n)

  return {
    size: normalizeImageSize(options.size),
    quality: normalizeImageQuality(options.quality),
    n: Number.isFinite(count)
      ? Math.min(IMAGE_COUNT_RANGE.max, Math.max(IMAGE_COUNT_RANGE.min, Math.round(count)))
      : DEFAULT_GENERATION_OPTIONS.n,
    ...(options.style ? { style: options.style } : {}),
  }
}

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
