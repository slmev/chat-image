<template>
  <Transition name="compare">
    <div v-if="isOpen" class="compare-overlay" @click.self="emit('close')">
      <div class="compare-container">
        <!-- Header -->
        <div class="compare-header">
          <h2 class="compare-title">
            <Scale :size="20" />
            <span>{{ t('imageCompare') }}</span>
          </h2>
          <button class="btn-icon" @click="emit('close')">
            <X :size="20" />
          </button>
        </div>

        <!-- Compare View -->
        <div class="compare-body">
          <div ref="compareRef" class="compare-view">
            <!-- Left Image -->
            <div class="compare-left">
              <img :src="leftUrl" :alt="t('originalImage')" class="compare-image" />
              <div class="compare-label">{{ t('originalImage') }}</div>
            </div>

            <!-- Slider -->
            <div
              class="compare-slider"
              :style="{ left: sliderPosition + '%' }"
              @mousedown="startDrag"
              @touchstart.prevent="startDrag"
            >
              <div class="slider-line"></div>
              <div class="slider-handle">
                <ChevronsLeftRight :size="16" />
              </div>
            </div>

            <!-- Right Image -->
            <div class="compare-right" :style="{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }">
              <img :src="rightUrl" :alt="t('variationImage')" class="compare-image" />
              <div class="compare-label">{{ t('variationImage') }}</div>
            </div>
          </div>

          <!-- Info -->
          <div class="compare-info">
            <div class="info-item">
              <span class="info-label">{{ t('leftPrompt') }}:</span>
              <span class="info-value">{{ leftImage.sourcePrompt || t('none') }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ t('rightPrompt') }}:</span>
              <span class="info-value">{{ rightImage.sourcePrompt || t('none') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, toRef } from 'vue'
import { X, Scale, ChevronsLeftRight } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useModalLayer } from '../../composables/useModalLayer'
import type { GeneratedImage } from '../../types'
import { getImageRepository } from '../../platform/imageRepository'
import { isExternalImageUrl, isValidImageUrl } from '../../utils/images'
import { isTauriRuntime } from '../../platform/runtime'

interface Props {
  isOpen: boolean
  leftImage: GeneratedImage
  rightImage: GeneratedImage
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const compareRef = ref<HTMLElement>()
const sliderPosition = ref(50)
const isDragging = ref(false)

const leftUrl = ref('')
const rightUrl = ref('')
const ownedObjectUrls = new Set<string>()
let resolveRun = 0

useModalLayer(toRef(props, 'isOpen'), () => emit('close'))

function shouldResolveDisplayUrl(image: GeneratedImage): boolean {
  const validUrl = isValidImageUrl(image.url)
  return Boolean(
    (image.localPath && !validUrl) ||
    (image.base64 && !validUrl) ||
    (isTauriRuntime() && isExternalImageUrl(image.url)),
  )
}

function revokeObjectUrl(url: string) {
  if (url && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url)
  }
}

function revokeOwnedObjectUrls() {
  ownedObjectUrls.forEach(revokeObjectUrl)
  ownedObjectUrls.clear()
}

async function resolveImageUrl(image: GeneratedImage): Promise<string> {
  if (!shouldResolveDisplayUrl(image)) {
    return isValidImageUrl(image.url) ? image.url : ''
  }
  try {
    const resolved = await getImageRepository().resolveDisplayUrl(image)
    if (resolved.url.startsWith('blob:') && resolved.url !== image.url) {
      ownedObjectUrls.add(resolved.url)
    }
    return resolved.url
  } catch (err) {
    console.warn('Failed to resolve compare image URL:', err)
    return isValidImageUrl(image.url) ? image.url : ''
  }
}

watch(
  () => [props.isOpen, props.leftImage, props.rightImage] as const,
  async () => {
    if (!props.isOpen) {
      revokeOwnedObjectUrls()
      leftUrl.value = ''
      rightUrl.value = ''
      return
    }
    const run = ++resolveRun
    revokeOwnedObjectUrls()
    const [left, right] = await Promise.all([
      resolveImageUrl(props.leftImage),
      resolveImageUrl(props.rightImage),
    ])
    if (run !== resolveRun) {
      // A newer resolve superseded this one; drop any URLs it created.
      revokeOwnedObjectUrls()
      return
    }
    leftUrl.value = left
    rightUrl.value = right
  },
  { immediate: true },
)

function updateSliderPosition(clientX: number) {
  if (!compareRef.value) return

  const rect = compareRef.value.getBoundingClientRect()
  const x = clientX - rect.left
  const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
  sliderPosition.value = percentage
}

function startDrag(event: MouseEvent | TouchEvent) {
  isDragging.value = true

  const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX
  updateSliderPosition(clientX)

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  document.addEventListener('touchmove', onDrag)
  document.addEventListener('touchend', stopDrag)
}

function onDrag(event: MouseEvent | TouchEvent) {
  if (!isDragging.value) return

  const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX
  updateSliderPosition(clientX)
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('touchmove', onDrag)
  document.removeEventListener('touchend', stopDrag)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('touchmove', onDrag)
  document.removeEventListener('touchend', stopDrag)
  revokeOwnedObjectUrls()
})
</script>

<style scoped>
.compare-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  backdrop-filter: blur(8px);
}

.compare-container {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-xl);
}

.compare-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.compare-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.compare-body {
  padding: 24px;
  overflow-y: auto;
}

.compare-view {
  position: relative;
  width: 100%;
  aspect-ratio: 16/10;
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: col-resize;
  user-select: none;
}

.compare-left,
.compare-right {
  position: absolute;
  inset: 0;
}

.compare-right {
  z-index: 2;
}

.compare-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.compare-label {
  position: absolute;
  top: 12px;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 12px;
  font-weight: 500;
  border-radius: var(--radius-full);
  backdrop-filter: blur(4px);
}

.compare-left .compare-label {
  left: 12px;
}

.compare-right .compare-label {
  right: 12px;
}

.compare-slider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  z-index: 3;
  cursor: col-resize;
}

.slider-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  background: white;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.5);
}

.slider-handle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 36px;
  height: 36px;
  background: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  color: var(--color-text-primary);
}

.compare-info {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  gap: 8px;
  font-size: 14px;
}

.info-label {
  color: var(--color-text-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.info-value {
  color: var(--color-text-primary);
}

/* Transitions */
.compare-enter-active,
.compare-leave-active {
  transition: all var(--transition-slow);
}

.compare-enter-from,
.compare-leave-to {
  opacity: 0;
}

.compare-enter-from .compare-container,
.compare-leave-to .compare-container {
  transform: scale(0.95);
}

@media (max-width: 640px) {
  .compare-body {
    padding: 16px;
  }

  .slider-handle {
    width: 28px;
    height: 28px;
  }
}
</style>
