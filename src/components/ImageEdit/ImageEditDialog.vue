<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { X, Loader2 } from 'lucide-vue-next'
import { useImageEdit } from '../../composables/useImageEdit'
import EditToolbar from './EditToolbar.vue'
import type { GeneratedImage, ImageGenerationResponse } from '../../types'

interface Props {
  image: GeneratedImage
  isOpen: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  result: [response: ImageGenerationResponse]
}>()

const { isLoading, error, editImage, cancelEdit } = useImageEdit()

const canvasRef = ref<HTMLCanvasElement>()
const imageRef = ref<HTMLImageElement>()
const prompt = ref('')
const brushSize = ref(20)
const isEraser = ref(false)
const isDrawing = ref(false)

let ctx: CanvasRenderingContext2D | null = null
let lastX = 0
let lastY = 0
let drawHistory: ImageData[] = []

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    handleClose()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

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

  canvas.width = w
  canvas.height = h

  ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, w, h)
    drawHistory = []
  }
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
            reject(new Error('创建遮罩图片失败'))
          }
        }, 'image/png')
      })
    }

    const response = await editImage(props.image, maskBlob, prompt.value)
    emit('result', response)
    emit('close')
  } catch (err) {
    console.error('Edit failed:', err)
  }
}

function handleClose() {
  cancelEdit()
  emit('close')
}

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    prompt.value = ''
    brushSize.value = 20
    isEraser.value = false
    drawHistory = []
    setupCanvas()
  }
})

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
            <h2 class="dialog-title">编辑图片</h2>
            <button @click="handleClose" class="btn-icon">
              <X :size="20" />
            </button>
          </div>

          <!-- Body -->
          <div class="dialog-body">
            <!-- Image with Canvas -->
            <div class="image-container">
              <img
                ref="imageRef"
                :src="image.url"
                alt="Source image"
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

            <!-- Toolbar -->
            <EditToolbar
              v-model:brushSize="brushSize"
              v-model:isEraser="isEraser"
              @undo="undo"
              @clear="clearCanvas"
            />

            <!-- Prompt -->
            <div class="form-group">
              <label class="form-label">描述要修改的内容</label>
              <textarea
                v-model="prompt"
                placeholder="例如：将背景改为海滩场景"
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
              在图片上绘制白色区域作为遮罩，AI 将只修改遮罩覆盖的区域。不绘制遮罩则修改整张图片。
            </p>
          </div>

          <!-- Footer -->
          <div class="dialog-footer">
            <button @click="handleClose" class="btn-secondary">
              取消
            </button>
            <button
              @click="handleSubmit"
              :disabled="!prompt.trim() || isLoading"
              class="btn-primary"
            >
              <Loader2 v-if="isLoading" :size="16" class="spin" />
              <span>{{ isLoading ? '处理中...' : '应用编辑' }}</span>
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
  position: relative;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.source-image {
  display: block;
  width: 100%;
  height: auto;
}

.mask-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
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
