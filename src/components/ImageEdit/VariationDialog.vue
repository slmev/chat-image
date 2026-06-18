<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { X, Loader2, Shuffle } from 'lucide-vue-next'
import { useImageEdit } from '../../composables/useImageEdit'
import { IMAGE_SIZES, IMAGE_QUALITIES, STYLE_TEMPLATES } from '../../utils/constants'
import type { GeneratedImage, StyleTemplate, ImageGenerationResponse } from '../../types'

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

const prompt = ref(props.image.sourcePrompt || '')

watch(() => props.image, (newImage) => {
  prompt.value = newImage.sourcePrompt || ''
})

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
      n: selectedCount.value,
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
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="isOpen" class="dialog-overlay" @click.self="handleClose">
        <div class="dialog-content scale-in">
          <!-- Header -->
          <div class="dialog-header">
            <h2 class="dialog-title">创建图片变体</h2>
            <button @click="handleClose" class="btn-icon">
              <X :size="20" />
            </button>
          </div>

          <!-- Body -->
          <div class="dialog-body">
            <!-- Original Image -->
            <div class="original-image">
              <img
                :src="image.url"
                alt="Original image"
                class="preview-img"
              />
              <div class="image-badge">
                <Shuffle :size="14" />
                <span>原图</span>
              </div>
            </div>

            <!-- Prompt -->
            <div class="form-group">
              <label class="form-label">提示词</label>
              <textarea
                v-model="prompt"
                placeholder="输入或修改提示词来生成变体"
                rows="3"
                class="input-field"
              />
            </div>

            <!-- Options -->
            <div class="options-grid">
              <div class="form-group">
                <label class="form-label">风格</label>
                <select v-model="selectedStyleId" class="select-field">
                  <option value="">保持原风格</option>
                  <option v-for="style in STYLE_TEMPLATES" :key="style.id" :value="style.id">
                    {{ style.name }}
                  </option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">尺寸</label>
                <select v-model="selectedSize" class="select-field">
                  <option v-for="size in IMAGE_SIZES" :key="size.value" :value="size.value">
                    {{ size.label }}
                  </option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">质量</label>
                <select v-model="selectedQuality" class="select-field">
                  <option v-for="quality in IMAGE_QUALITIES" :key="quality.value" :value="quality.value">
                    {{ quality.label }}
                  </option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">数量</label>
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
            <button @click="handleClose" class="btn-secondary">
              取消
            </button>
            <button
              @click="handleSubmit"
              :disabled="!prompt.trim() || isLoading"
              class="btn-primary"
            >
              <Loader2 v-if="isLoading" :size="16" class="spin" />
              <Shuffle v-else :size="16" />
              <span>{{ isLoading ? '生成中...' : '生成变体' }}</span>
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
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.preview-img {
  display: block;
  width: 100%;
  max-height: 300px;
  object-fit: contain;
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
