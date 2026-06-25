<template>
  <Transition name="compare">
    <div v-if="isOpen" class="compare-overlay" @click.self="$emit('close')">
      <div class="compare-container">
        <!-- Header -->
        <div class="compare-header">
          <h2 class="compare-title">
            <Scale :size="20" />
            <span>{{ t('imageCompare') }}</span>
          </h2>
          <button @click="$emit('close')" class="btn-icon">
            <X :size="20" />
          </button>
        </div>

        <!-- Compare View -->
        <div class="compare-body">
          <div class="compare-view" ref="compareRef">
            <!-- Left Image -->
            <div class="compare-left">
              <img :src="getImageUrl(leftImage)" :alt="t('originalImage')" class="compare-image" />
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
              <img :src="getImageUrl(rightImage)" :alt="t('variationImage')" class="compare-image" />
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
import { ref, onUnmounted } from 'vue'
import { X, Scale, ChevronsLeftRight } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { GeneratedImage } from '../../types'

interface Props {
  isOpen: boolean
  leftImage: GeneratedImage
  rightImage: GeneratedImage
}

defineProps<Props>()
defineEmits<{
  close: []
}>()

const { t } = useI18n()
const compareRef = ref<HTMLElement>()
const sliderPosition = ref(50)
const isDragging = ref(false)

function getImageUrl(image: GeneratedImage): string {
  return image.url
}

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
