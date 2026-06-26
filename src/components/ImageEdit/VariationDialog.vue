<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { X, Loader2, Shuffle, ZoomOut, Maximize2, ZoomIn } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useImageEdit } from '../../composables/useImageEdit'
import { IMAGE_SIZES, IMAGE_QUALITIES, STYLE_TEMPLATES } from '../../utils/constants'
import type { GeneratedImage, StyleTemplate, ImageGenerationResponse } from '../../types'
import type { CSSProperties } from 'vue'

interface Props {
  image: GeneratedImage
  isOpen: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  result: [response: ImageGenerationResponse]
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

watch(() => props.image, (newImage) => {
  prompt.value = newImage.sourcePrompt || ''
  if (props.isOpen) {
    setupImage()
  }
})

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    prompt.value = props.image.sourcePrompt || ''
    selectedSize.value = '1024x1024'
    selectedQuality.value = 'standard'
    selectedCount.value = 1
    selectedStyleId.value = ''
    setupImage()
  }
})

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

const selectedSize = ref<'1024x1024' | '1792x1024' | '1024x1792'>('1024x1024')
const selectedQuality = ref<'standard' | 'hd'>('standard')
const selectedCount = ref(1)
const selectedStyleId = ref('')

const selectedStyle = computed<StyleTemplate | undefined>(() => {
  if (!selectedStyleId.value) return undefined
  return STYLE_TEMPLATES.find(s => s.id === selectedStyleId.value)
})

async function handleSubmit() {
  if (!prompt.value.trim()) return

  try {
    const response = await createVariation(props.image, {
      prompt: prompt.value,
      style: selectedStyle.value,
      size: selectedSize.value,
      quality: selectedQuality.value,
      n: Math.min(4, Math.max(1, Math.round(selectedCount.value) || 1)),
    })
    emit('result', response)
    emit('close')
  } catch (err) {
    console.error('Variation failed:', err)
  }
}

function handleClose() {
  emit('close')
}

function imageSizeLabel(value: string): string {
  switch (value) {
    case '1024x1024':
      return t('imageSizeSquare')
    case '1792x1024':
      return t('imageSizeLandscape')
    case '1024x1792':
      return t('imageSizePortrait')
    default:
      return value
  }
}

function imageQualityLabel(value: string): string {
  return value === 'hd' ? t('qualityHd') : t('qualityStandard')
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
              <button
                class="zoom-fit-btn"
                :title="t('fitToView')"
                @click="fitToView"
              >
                <Maximize2 :size="15" />
                <span>{{ t('fitToView') }}</span>
              </button>
              <span class="zoom-value" :aria-label="t('zoomLevel')">
                {{ zoomPercent }}%
              </span>
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

              <div class="form-group">
                <label class="form-label">{{ t('size') }}</label>
                <select v-model="selectedSize" class="select-field">
                  <option v-for="size in IMAGE_SIZES" :key="size.value" :value="size.value">
                    {{ imageSizeLabel(size.value) }}
                  </option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">{{ t('quality') }}</label>
                <select v-model="selectedQuality" class="select-field">
                  <option v-for="quality in IMAGE_QUALITIES" :key="quality.value" :value="quality.value">
                    {{ imageQualityLabel(quality.value) }}
                  </option>
                </select>
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
  height: clamp(220px, 42vh, 420px);
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
