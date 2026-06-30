import type {
  ChatAttachment,
  GenerationMetadata,
  GenerationOptions,
  GenerationQuality,
  StyleTemplate,
} from '../types'
import {
  DEFAULT_GENERATION_OPTIONS,
  findImageSizePreset,
  normalizeGenerationOptions,
  normalizeImageQuality,
  normalizeImageSize,
  parseImageSize,
} from './constants'

export function createGenerationMetadata(
  prompt: string,
  options: GenerationOptions,
  attachments: ChatAttachment[] = [],
): GenerationMetadata {
  const normalizedOptions = normalizeGenerationOptions(options)

  return {
    prompt,
    size: normalizedOptions.size,
    quality: normalizedOptions.quality,
    n: normalizedOptions.n,
    ...(normalizedOptions.style
      ? {
          styleId: normalizedOptions.style.id,
          styleName: normalizedOptions.style.name,
          style: normalizedOptions.style,
        }
      : {}),
    attachmentIds: attachments.map((attachment) => attachment.id),
    ...(attachments.length > 0 ? { attachments } : {}),
  }
}

export function generationToOptions(generation: GenerationMetadata): GenerationOptions {
  return {
    size: normalizeImageSize(generation.size),
    quality: normalizeImageQuality(generation.quality),
    n: generation.n,
    ...(generation.style ? { style: generation.style } : {}),
  }
}

export function styleFromGeneration(generation: GenerationMetadata): StyleTemplate | undefined {
  if (generation.style) return generation.style
  if (!generation.styleId || !generation.styleName) return undefined

  return {
    id: generation.styleId,
    name: generation.styleName,
    description: '',
    promptSuffix: '',
    icon: 'sparkles',
  }
}

export function normalizeGenerationMetadata(generation: GenerationMetadata): GenerationMetadata {
  const quality: GenerationQuality = normalizeImageQuality(generation.quality)
  const count = Number(generation.n)
  const style = styleFromGeneration(generation)

  return {
    prompt: generation.prompt,
    size: normalizeImageSize(generation.size),
    quality,
    n: Number.isFinite(count)
      ? Math.min(4, Math.max(1, Math.round(count)))
      : DEFAULT_GENERATION_OPTIONS.n,
    ...(generation.styleId ? { styleId: generation.styleId } : style ? { styleId: style.id } : {}),
    ...(generation.styleName
      ? { styleName: generation.styleName }
      : style
        ? { styleName: style.name }
        : {}),
    ...(style ? { style } : {}),
    attachmentIds: Array.isArray(generation.attachmentIds) ? generation.attachmentIds : [],
    ...(generation.attachments?.length ? { attachments: generation.attachments } : {}),
  }
}

export function generationAspectRatio(generation?: GenerationMetadata): string {
  const size = parseImageSize(generation?.size)
  return size ? `${size.width} / ${size.height}` : '1 / 1'
}

export function generationSizeLabel(generation?: GenerationMetadata): string {
  const size = normalizeImageSize(generation?.size)
  if (size === DEFAULT_GENERATION_OPTIONS.size) return 'Auto'

  const parsed = parseImageSize(size)
  if (!parsed) return 'Auto'

  const ratio = findImageSizePreset(size)?.ratio
  return ratio && ratio !== 'auto'
    ? `${parsed.width}x${parsed.height} ${ratio}`
    : `${parsed.width}x${parsed.height}`
}

export function generationSummaryParts(
  generation: GenerationMetadata,
  labels: {
    autoSize: string
    quality: (quality: GenerationQuality) => string
    noneStyle: string
    referenceCount: (count: number) => string
  },
): string[] {
  const normalized = normalizeGenerationMetadata(generation)
  const size = generationSizeLabel(normalized)

  return [
    labels.quality(normalized.quality),
    size === 'Auto' ? labels.autoSize : size,
    `${normalized.n}`,
    normalized.styleName || labels.noneStyle,
    labels.referenceCount(normalized.attachmentIds.length),
  ]
}
