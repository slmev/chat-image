<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { ArrowLeftRight, X, Loader2, Shuffle, ZoomOut, Maximize2, ZoomIn } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useImageEdit } from '../../composables/useImageEdit'
import {
  DEFAULT_GENERATION_OPTIONS,
  IMAGE_COUNT_RANGE,
  IMAGE_QUALITIES,
  IMAGE_SIZE_PRESETS,
  STYLE_TEMPLATES,
  findImageSizePreset,
  normalizeImageQuality,
  normalizeImageSize,
  parseImageSize,
  type ImageSizePreset,
} from '../../utils/constants'
import type {
  GeneratedImage,
  GenerationQuality,
  GenerationSize,
  StyleTemplate,
  ImageGenerationResponse,
  VariationOptions,
} from '../../types'
import type { CSSProperties } from 'vue'

interface Props {
  image: GeneratedImage
  isOpen: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  result: [response: ImageGenerationResponse, options: VariationOptions]
}>()

const { isLoading, error, createVariation } = useImageEdit()
const { t } = useI18n()

const prompt = ref(props.image.sourcePrompt || '')
const imageRef = ref<HTMLImageElement>()
const viewportRef = ref<HTMLDivElement>()
const naturalSize = ref({ width: 0, height: 0 })
const fitScale = ref(1)
const zoomLevel = ref(1)

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25

const displayScale = computed(() => fitScale.value * zoomLevel.value)
const zoomPercent = computed(() => Math.round(zoomLevel.value * 100))
const stageStyle = computed<CSSProperties>(() => ({
  width: `${naturalSize.value.width * displayScale.value}px`,
  height: `${naturalSize.value.height * displayScale.value}px`,
}))

watch(
  () => props.image,
  (newImage) => {
    prompt.value = newImage.sourcePrompt || ''
    if (props.isOpen) {
      setupImage()
    }
  },
)

watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) {
      prompt.value = props.image.sourcePrompt || ''
      setSizeValue(DEFAULT_GENERATION_OPTIONS.size)
      selectedQuality.value = DEFAULT_GENERATION_OPTIONS.quality
      selectedCount.value = DEFAULT_GENERATION_OPTIONS.n
      selectedStyleId.value = ''
      setupImage()
    }
  },
)

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    handleClose()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', updateFitScale)
  if (props.isOpen) {
    setupImage()
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updateFitScale)
})

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function zoomIn() {
  zoomLevel.value = clampZoom(zoomLevel.value + ZOOM_STEP)
}

function zoomOut() {
  zoomLevel.value = clampZoom(zoomLevel.value - ZOOM_STEP)
}

function fitToView() {
  zoomLevel.value = MIN_ZOOM
}

function updateFitScale() {
  const viewport = viewportRef.value
  const { width, height } = naturalSize.value
  if (!viewport || width <= 0 || height <= 0) return

  const rect = viewport.getBoundingClientRect()
  const viewportWidth = rect.width || viewport.clientWidth
  const viewportHeight = rect.height || viewport.clientHeight
  if (viewportWidth <= 0 || viewportHeight <= 0) return

  fitScale.value = Math.min(viewportWidth / width, viewportHeight / height)
}

async function setupImage() {
  await nextTick()

  const img = imageRef.value
  if (!img) return

  if (!img.complete || img.naturalWidth === 0) {
    await new Promise<void>((resolve) => {
      img.onload = () => resolve()
      img.onerror = () => resolve()
      if (img.complete && img.naturalWidth > 0) resolve()
    })
  }

  naturalSize.value = {
    width: img.naturalWidth || 1024,
    height: img.naturalHeight || 1024,
  }
  zoomLevel.value = MIN_ZOOM

  await nextTick()
  updateFitScale()
}

const selectedSize = ref<GenerationSize>(DEFAULT_GENERATION_OPTIONS.size)
const selectedSizePreset = ref<string>(DEFAULT_GENERATION_OPTIONS.size)
const widthInput = ref('')
const heightInput = ref('')
const selectedQuality = ref<GenerationQuality>(DEFAULT_GENERATION_OPTIONS.quality)
const selectedCount = ref(DEFAULT_GENERATION_OPTIONS.n)
const selectedStyleId = ref('')
const isAutoSize = computed(() => selectedSizePreset.value === DEFAULT_GENERATION_OPTIONS.size)

const selectedStyle = computed<StyleTemplate | undefined>(() => {
  if (!selectedStyleId.value) return undefined
  return STYLE_TEMPLATES.find((s) => s.id === selectedStyleId.value)
})

async function handleSubmit() {
  if (!prompt.value.trim()) return

  try {
    const options: VariationOptions = {
      prompt: prompt.value,
      style: selectedStyle.value,
      size: selectedSize.value,
      quality: selectedQuality.value,
      n: Math.min(
        IMAGE_COUNT_RANGE.max,
        Math.max(IMAGE_COUNT_RANGE.min, Math.round(selectedCount.value) || 1),
      ),
    }
    const response = await createVariation(props.image, options)
    emit('result', response, options)
    emit('close')
  } catch (err) {
    console.error('Variation failed:', err)
  }
}

function handleClose() {
  emit('close')
}

function imageSizeLabel(preset: ImageSizePreset): string {
  return t(preset.labelKey)
}

function imageQualityLabel(value: string): string {
  switch (normalizeImageQuality(value)) {
    case 'high':
      return t('qualityHigh')
    case 'medium':
      return t('qualityMedium')
    case 'low':
      return t('qualityLow')
    case 'auto':
    default:
      return t('qualityAuto')
  }
}

function ratioIconStyle(preset: ImageSizePreset) {
  if (!preset.width || !preset.height) return {}
  return { aspectRatio: `${preset.width} / ${preset.height}` }
}

function toDimension(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function setSizeValue(size: string): void {
  const normalizedSize = normalizeImageSize(size)
  selectedSize.value = normalizedSize

  const preset = findImageSizePreset(normalizedSize)
  selectedSizePreset.value = preset?.value ?? 'custom'

  const parsed = parseImageSize(normalizedSize)
  widthInput.value = parsed ? String(parsed.width) : ''
  heightInput.value = parsed ? String(parsed.height) : ''
}

function applySizePreset(preset: ImageSizePreset): void {
  setSizeValue(preset.value)
}

function handleDimensionInput(): void {
  const width = toDimension(widthInput.value)
  const height = toDimension(heightInput.value)

  selectedSizePreset.value = 'custom'
  selectedSize.value = width && height ? `${width}x${height}` : DEFAULT_GENERATION_OPTIONS.size
}

function swapDimensions(): void {
  if (isAutoSize.value || !widthInput.value || !heightInput.value) return

  const nextWidth = heightInput.value
  heightInput.value = widthInput.value
  widthInput.value = nextWidth
  handleDimensionInput()
}

function styleLabel(style: StyleTemplate): string {
  switch (style.id) {
    case 'anime':
      return t('styleAnime')
    case 'realistic':
      return t('styleRealistic')
    case 'oil-painting':
      return t('styleOilPainting')
    case 'watercolor':
      return t('styleWatercolor')
    case 'sketch':
      return t('styleSketch')
    case 'cyberpunk':
      return t('styleCyberpunk')
    default:
      return style.name
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="isOpen" class="dialog-overlay" @click.self="handleClose">
        <div class="dialog-content scale-in">
          <!-- Header -->
          <div class="dialog-header">
            <h2 class="dialog-title">{{ t('createImageVariation') }}</h2>
            <button class="btn-icon" @click="handleClose">
              <X :size="20" />
            </button>
          </div>

          <!-- Body -->
          <div class="dialog-body">
            <!-- Original Image -->
            <div ref="viewportRef" class="original-image">
              <div class="image-stage" :style="stageStyle">
                <img
                  ref="imageRef"
                  :src="image.url"
                  :alt="t('originalImage')"
                  class="preview-img"
                  @load="setupImage"
                />
              </div>
              <div class="image-badge">
                <Shuffle :size="14" />
                <span>{{ t('originalImage') }}</span>
              </div>
            </div>

            <!-- Zoom controls -->
            <div class="zoom-controls">
              <button
                class="zoom-btn"
                :disabled="zoomLevel <= MIN_ZOOM"
                :title="t('zoomOut')"
                :aria-label="t('zoomOut')"
                @click="zoomOut"
              >
                <ZoomOut :size="16" />
              </button>
              <button class="zoom-fit-btn" :title="t('fitToView')" @click="fitToView">
                <Maximize2 :size="15" />
                <span>{{ t('fitToView') }}</span>
              </button>
              <span class="zoom-value" :aria-label="t('zoomLevel')"> {{ zoomPercent }}% </span>
              <button
                class="zoom-btn"
                :disabled="zoomLevel >= MAX_ZOOM"
                :title="t('zoomIn')"
                :aria-label="t('zoomIn')"
                @click="zoomIn"
              >
                <ZoomIn :size="16" />
              </button>
            </div>

            <!-- Prompt -->
            <div class="form-group">
              <label class="form-label">{{ t('prompt') }}</label>
              <textarea
                v-model="prompt"
                :placeholder="t('variationPromptPlaceholder')"
                rows="3"
                class="input-field"
              />
            </div>

            <!-- Options -->
            <div class="options-grid">
              <div class="form-group">
                <label class="form-label">{{ t('style') }}</label>
                <select v-model="selectedStyleId" class="select-field">
                  <option value="">{{ t('keepOriginalStyle') }}</option>
                  <option v-for="style in STYLE_TEMPLATES" :key="style.id" :value="style.id">
                    {{ styleLabel(style) }}
                  </option>
                </select>
              </div>

              <div class="form-group size-form-group">
                <label class="form-label">{{ t('size') }}</label>
                <div class="size-controls">
                  <div class="dimension-row">
                    <label class="dimension-field">
                      <span class="dimension-label">W</span>
                      <input
                        v-model="widthInput"
                        class="dimension-input"
                        type="number"
                        inputmode="numeric"
                        min="1"
                        step="1"
                        :disabled="isAutoSize"
                        :aria-label="t('width')"
                        @input="handleDimensionInput"
                      />
                    </label>
                    <button
                      type="button"
                      class="swap-size-btn"
                      :disabled="isAutoSize || !widthInput || !heightInput"
                      :aria-label="t('swapDimensions')"
                      :title="t('swapDimensions')"
                      @click="swapDimensions"
                    >
                      <ArrowLeftRight :size="14" />
                    </button>
                    <label class="dimension-field">
                      <span class="dimension-label">H</span>
                      <input
                        v-model="heightInput"
                        class="dimension-input"
                        type="number"
                        inputmode="numeric"
                        min="1"
                        step="1"
                        :disabled="isAutoSize"
                        :aria-label="t('height')"
                        @input="handleDimensionInput"
                      />
                    </label>
                  </div>
                  <div class="ratio-grid" role="radiogroup" :aria-label="t('aspectRatio')">
                    <button
                      v-for="preset in IMAGE_SIZE_PRESETS"
                      :key="preset.value"
                      type="button"
                      :class="['ratio-card', { active: selectedSizePreset === preset.value }]"
                      role="radio"
                      :aria-checked="selectedSizePreset === preset.value"
                      @click="applySizePreset(preset)"
                    >
                      <span
                        class="ratio-icon"
                        :class="{ auto: preset.value === 'auto' }"
                        :style="ratioIconStyle(preset)"
                        aria-hidden="true"
                      >
                        <span v-if="preset.value === 'auto'">A</span>
                      </span>
                      <span class="ratio-label">{{ imageSizeLabel(preset) }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">{{ t('quality') }}</label>
                <div class="quality-segmented" role="radiogroup" :aria-label="t('quality')">
                  <button
                    v-for="quality in IMAGE_QUALITIES"
                    :key="quality.value"
                    type="button"
                    :class="['quality-segment', { active: selectedQuality === quality.value }]"
                    role="radio"
                    :aria-checked="selectedQuality === quality.value"
                    @click="selectedQuality = quality.value"
                  >
                    {{ imageQualityLabel(quality.value) }}
                  </button>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">{{ t('count') }}</label>
                <input
                  v-model.number="selectedCount"
                  type="number"
                  min="1"
                  max="4"
                  class="input-field"
                />
              </div>
            </div>

            <!-- Error -->
            <div v-if="error" class="error-message">
              {{ error }}
            </div>
          </div>

          <!-- Footer -->
          <div class="dialog-footer">
            <button class="btn-secondary" @click="handleClose">
              {{ t('cancel') }}
            </button>
            <button
              :disabled="!prompt.trim() || isLoading"
              class="btn-primary"
              @click="handleSubmit"
            >
              <Loader2 v-if="isLoading" :size="16" class="spin" />
              <Shuffle v-else :size="16" />
              <span>{{ isLoading ? t('generatingDots') : t('generateVariation') }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
  padding: 20px;
  backdrop-filter: blur(4px);
}

.dialog-content {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 550px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xl);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.dialog-body {
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.original-image {
  position: relative;
  flex: 0 0 auto;
  height: clamp(220px, 42vh, 420px);
  min-height: 220px;
  border-radius: var(--radius-md);
  overflow: auto;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.image-stage {
  position: relative;
  flex: none;
  margin: 0 auto;
  min-width: 1px;
  min-height: 1px;
}

.preview-img {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
}

.image-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  backdrop-filter: blur(8px);
  width: fit-content;
  z-index: 1;
}

.zoom-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: -8px;
}

.zoom-btn,
.zoom-fit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.zoom-btn {
  width: 32px;
}

.zoom-fit-btn {
  gap: 6px;
  padding: 0 10px;
  font-size: 12px;
}

.zoom-btn:hover:not(:disabled),
.zoom-fit-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.zoom-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.zoom-value {
  min-width: 48px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
  text-align: center;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.options-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.size-form-group {
  grid-column: 1 / -1;
}

.size-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dimension-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.dimension-field {
  width: 118px;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.dimension-label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-tertiary);
}

.dimension-input {
  min-width: 0;
  width: 100%;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  outline: none;
}

.dimension-input:disabled {
  color: var(--color-text-tertiary);
  cursor: not-allowed;
}

.swap-size-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.swap-size-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.swap-size-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ratio-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(78px, 1fr));
  gap: 6px;
}

.ratio-card {
  min-height: 54px;
  padding: 7px;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-base);
}

.ratio-card:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  color: var(--color-text-primary);
}

.ratio-card.active {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.ratio-icon {
  width: 24px;
  max-height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, currentColor 12%, transparent);
  border: 1px solid currentColor;
  border-radius: 4px;
}

.ratio-icon.auto {
  aspect-ratio: 1;
  border-style: dashed;
  font-size: 10px;
  font-weight: 700;
}

.ratio-label {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quality-segmented {
  display: inline-flex;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
}

.quality-segment {
  min-width: 44px;
  height: 32px;
  padding: 0 10px;
  background: transparent;
  border: 0;
  border-right: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-base);
  white-space: nowrap;
}

.quality-segment:last-child {
  border-right: 0;
}

.quality-segment:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.quality-segment.active {
  background: var(--color-primary);
  color: white;
}

.error-message {
  padding: 12px 16px;
  background: #fef2f2;
  color: #dc2626;
  border-radius: var(--radius-md);
  font-size: 13px;
}

:root.dark .error-message {
  background: #451a1a;
  color: #f87171;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

@media (max-width: 520px) {
  .dialog-overlay {
    align-items: stretch;
    padding: 10px;
  }

  .dialog-content {
    max-height: calc(100vh - 20px);
    max-height: calc(100dvh - 20px);
  }

  .dialog-header,
  .dialog-footer {
    padding: 14px 16px;
  }

  .dialog-body {
    min-height: 0;
    padding: 16px;
    gap: 16px;
  }

  .original-image {
    height: clamp(190px, 34vh, 300px);
    min-height: 190px;
  }

  .options-grid {
    grid-template-columns: 1fr;
  }

  .dimension-field {
    flex: 1 1 120px;
    width: auto;
  }

  .dialog-footer {
    flex-wrap: wrap;
  }

  .dialog-footer .btn-secondary,
  .dialog-footer .btn-primary {
    flex: 1 1 140px;
  }
}

/* Transitions */
.dialog-enter-active,
.dialog-leave-active {
  transition: all var(--transition-slow);
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .dialog-content,
.dialog-leave-to .dialog-content {
  transform: scale(0.95);
}
</style>
