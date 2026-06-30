<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { X, Loader2, ZoomOut, Maximize2, ZoomIn } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useImageEdit } from '../../composables/useImageEdit'
import EditToolbar from './EditToolbar.vue'
import type { GeneratedImage, ImageGenerationResponse } from '../../types'
import type { CSSProperties } from 'vue'

interface Props {
  image: GeneratedImage
  isOpen: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  result: [response: ImageGenerationResponse, prompt: string]
}>()

const { isLoading, error, editImage, cancelEdit } = useImageEdit()
const { t } = useI18n()

const canvasRef = ref<HTMLCanvasElement>()
const imageRef = ref<HTMLImageElement>()
const viewportRef = ref<HTMLDivElement>()
const prompt = ref('')
const brushSize = ref(20)
const isEraser = ref(false)
const isDrawing = ref(false)
const naturalSize = ref({ width: 0, height: 0 })
const fitScale = ref(1)
const zoomLevel = ref(1)

let ctx: CanvasRenderingContext2D | null = null
let lastX = 0
let lastY = 0
let drawHistory: ImageData[] = []

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25

const displayScale = computed(() => fitScale.value * zoomLevel.value)
const zoomPercent = computed(() => Math.round(zoomLevel.value * 100))
const stageStyle = computed<CSSProperties>(() => ({
  width: `${naturalSize.value.width * displayScale.value}px`,
  height: `${naturalSize.value.height * displayScale.value}px`,
}))

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    handleClose()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', updateFitScale)
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

async function setupCanvas() {
  await nextTick()

  const canvas = canvasRef.value
  const img = imageRef.value
  if (!canvas || !img) return

  // 等待图片加载完成
  if (!img.complete || img.naturalWidth === 0) {
    await new Promise<void>((resolve) => {
      img.onload = () => resolve()
      img.onerror = () => resolve()
      if (img.complete && img.naturalWidth > 0) resolve()
    })
  }

  // 使用图片实际尺寸，如果为 0 则使用默认值
  const w = img.naturalWidth || 1024
  const h = img.naturalHeight || 1024

  naturalSize.value = { width: w, height: h }
  zoomLevel.value = MIN_ZOOM

  canvas.width = w
  canvas.height = h

  ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, w, h)
    drawHistory = []
  }

  await nextTick()
  updateFitScale()
}

function startDrawing(event: MouseEvent | TouchEvent) {
  if (!ctx || !canvasRef.value) return

  isDrawing.value = true
  const rect = canvasRef.value.getBoundingClientRect()
  const scaleX = canvasRef.value.width / rect.width
  const scaleY = canvasRef.value.height / rect.height

  if (event instanceof MouseEvent) {
    lastX = (event.clientX - rect.left) * scaleX
    lastY = (event.clientY - rect.top) * scaleY
  } else {
    lastX = (event.touches[0].clientX - rect.left) * scaleX
    lastY = (event.touches[0].clientY - rect.top) * scaleY
  }

  drawHistory.push(ctx.getImageData(0, 0, canvasRef.value.width, canvasRef.value.height))
  if (drawHistory.length > 20) {
    drawHistory.shift()
  }
}

function draw(event: MouseEvent | TouchEvent) {
  if (!isDrawing.value || !ctx || !canvasRef.value) return

  const rect = canvasRef.value.getBoundingClientRect()
  const scaleX = canvasRef.value.width / rect.width
  const scaleY = canvasRef.value.height / rect.height

  let currentX: number, currentY: number
  if (event instanceof MouseEvent) {
    currentX = (event.clientX - rect.left) * scaleX
    currentY = (event.clientY - rect.top) * scaleY
  } else {
    currentX = (event.touches[0].clientX - rect.left) * scaleX
    currentY = (event.touches[0].clientY - rect.top) * scaleY
  }

  ctx.beginPath()
  ctx.moveTo(lastX, lastY)
  ctx.lineTo(currentX, currentY)
  ctx.lineWidth = brushSize.value * scaleX
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (isEraser.value) {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  }

  ctx.stroke()

  lastX = currentX
  lastY = currentY
}

function stopDrawing() {
  isDrawing.value = false
}

function undo() {
  if (!ctx || !canvasRef.value || drawHistory.length === 0) return

  const previousState = drawHistory.pop()
  if (previousState) {
    ctx.putImageData(previousState, 0, 0)
  }
}

function clearCanvas() {
  if (!ctx || !canvasRef.value) return
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  drawHistory = []
}

async function handleSubmit() {
  if (!prompt.value.trim() || !canvasRef.value) return

  try {
    const canvas = canvasRef.value
    const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height)
    const hasDrawing = imageData?.data.some((val, i) => i % 4 === 3 && val > 0)

    let maskBlob: Blob | undefined
    if (hasDrawing) {
      maskBlob = await new Promise<Blob | undefined>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error(t('unknownError')))
          }
        }, 'image/png')
      })
    }

    const response = await editImage(props.image, maskBlob, prompt.value)
    emit('result', response, prompt.value)
    emit('close')
  } catch (err) {
    console.error('Edit failed:', err)
  }
}

function handleClose() {
  cancelEdit()
  emit('close')
}

watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) {
      prompt.value = ''
      brushSize.value = 20
      isEraser.value = false
      drawHistory = []
      setupCanvas()
    }
  },
)

onMounted(() => {
  if (props.isOpen) {
    setupCanvas()
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="isOpen" class="dialog-overlay" @click.self="handleClose">
        <div class="dialog-content scale-in">
          <!-- Header -->
          <div class="dialog-header">
            <h2 class="dialog-title">{{ t('editImageTitle') }}</h2>
            <button class="btn-icon" @click="handleClose">
              <X :size="20" />
            </button>
          </div>

          <!-- Body -->
          <div class="dialog-body">
            <!-- Image with Canvas -->
            <div ref="viewportRef" class="image-container">
              <div class="image-stage" :style="stageStyle">
                <img
                  ref="imageRef"
                  :src="image.url"
                  :alt="t('sourceImageAlt')"
                  class="source-image"
                />
                <canvas
                  ref="canvasRef"
                  class="mask-canvas"
                  @mousedown="startDrawing"
                  @mousemove="draw"
                  @mouseup="stopDrawing"
                  @mouseleave="stopDrawing"
                  @touchstart.prevent="startDrawing"
                  @touchmove.prevent="draw"
                  @touchend="stopDrawing"
                />
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

            <!-- Toolbar -->
            <EditToolbar
              v-model:brush-size="brushSize"
              v-model:is-eraser="isEraser"
              @undo="undo"
              @clear="clearCanvas"
            />

            <!-- Prompt -->
            <div class="form-group">
              <label class="form-label">{{ t('editPromptLabel') }}</label>
              <textarea
                v-model="prompt"
                :placeholder="t('editPromptPlaceholder')"
                rows="3"
                class="input-field"
              />
            </div>

            <!-- Error -->
            <div v-if="error" class="error-message">
              {{ error }}
            </div>

            <!-- Info -->
            <p class="info-text">
              {{ t('editMaskHint') }}
            </p>
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
              <span>{{ isLoading ? t('processing') : t('applyEdit') }}</span>
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
  max-width: 700px;
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

.image-container {
  height: clamp(260px, 52vh, 520px);
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

.source-image {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
  pointer-events: none;
}

.mask-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  touch-action: none;
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

.info-text {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
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
