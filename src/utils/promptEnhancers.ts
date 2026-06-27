import type { PromptTemplate } from '../types'

// 提示词增强关键词库
export interface PromptEnhancer {
  category: string
  label: string
  keywords: string[]
}

export const PROMPT_ENHANCERS: PromptEnhancer[] = [
  {
    category: 'lighting',
    label: '光照',
    keywords: [
      'soft natural lighting',
      'golden hour lighting',
      'dramatic lighting',
      'studio lighting',
      'backlit',
      'rim lighting',
      'neon lights',
      'candlelight',
      'moonlight',
      'volumetric lighting',
    ],
  },
  {
    category: 'style',
    label: '风格',
    keywords: [
      'photorealistic',
      'oil painting style',
      'watercolor style',
      'digital art',
      'anime style',
      'pixel art',
      'minimalist',
      'surreal',
      'pop art',
      'ukiyo-e style',
    ],
  },
  {
    category: 'quality',
    label: '质量',
    keywords: [
      'highly detailed',
      '8k resolution',
      'ultra realistic',
      'sharp focus',
      'professional photography',
      'masterpiece',
      'award winning',
      'cinematic',
      'HDR',
      'RAW photo',
    ],
  },
  {
    category: 'mood',
    label: '氛围',
    keywords: [
      'peaceful atmosphere',
      'mysterious mood',
      'vibrant and colorful',
      'dark and moody',
      'dreamy ethereal',
      'cozy warm',
      'epic and grand',
      'nostalgic retro',
      'futuristic sci-fi',
      'whimsical playful',
    ],
  },
  {
    category: 'composition',
    label: '构图',
    keywords: [
      'close-up shot',
      'wide angle',
      'bird eye view',
      'low angle',
      'portrait orientation',
      'landscape orientation',
      'symmetrical composition',
      'rule of thirds',
      'depth of field',
      'bokeh background',
    ],
  },
  {
    category: 'color',
    label: '色调',
    keywords: [
      'warm tones',
      'cool blue tones',
      'monochrome black and white',
      'pastel colors',
      'high contrast',
      'muted earth tones',
      'vivid saturated colors',
      'sepia tone',
      'duotone',
      'neon colors',
    ],
  },
]

// 从用户输入中提取关键词（中英文）
function extractKeywords(input: string): string[] {
  const lower = input.toLowerCase()
  // 匹配英文单词和中文词
  const words = lower.match(/[一-龥]+|[a-z]+/g) || []
  return [...new Set(words)]
}

// 根据用户输入推荐增强关键词
export function getEnhancementSuggestions(
  input: string,
  allTemplates: PromptTemplate[],
): {
  enhancers: { category: string; label: string; suggestions: string[] }[]
  templateMatches: PromptTemplate[]
} {
  const keywords = extractKeywords(input)
  if (keywords.length === 0) {
    return { enhancers: [], templateMatches: [] }
  }

  // 推荐增强关键词（排除用户已有的）
  const lowerInput = input.toLowerCase()
  const enhancers = PROMPT_ENHANCERS.map((enhancer) => {
    const suggestions = enhancer.keywords.filter((kw) => {
      // 如果用户输入中已经包含该关键词，不推荐
      const kwWords = kw.toLowerCase().split(/\s+/)
      return !kwWords.some((w) => lowerInput.includes(w))
    })
    return {
      category: enhancer.category,
      label: enhancer.label,
      suggestions: suggestions.slice(0, 4), // 每类最多 4 个
    }
  }).filter((e) => e.suggestions.length > 0)

  // 匹配模板
  const templateMatches = allTemplates
    .filter((t) => {
      const tLower = `${t.title} ${t.prompt} ${t.tags?.join(' ') || ''}`.toLowerCase()
      return keywords.some((kw) => tLower.includes(kw))
    })
    .slice(0, 3)

  return { enhancers, templateMatches }
}
