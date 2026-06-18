<template>
  <Transition name="gallery">
    <div v-if="isOpen" class="gallery-overlay" @click.self="$emit('close')">
      <div class="gallery-container">
        <!-- Header -->
        <div class="gallery-header">
          <h2 class="gallery-title">
            <ImageIcon :size="20" />
            <span>图片画廊</span>
          </h2>
          <div class="gallery-actions">
            <span class="image-count">{{ allImages.length }} 张图片</span>
            <button @click="$emit('close')" class="btn-icon">
              <X :size="20" />
            </button>
          </div>
        </div>

        <!-- Filters -->
        <div class="gallery-filters">
          <button
            v-for="filter in filters"
            :key="filter.id"
            @click="activeFilter = filter.id"
            :class="['filter-btn', { active: activeFilter === filter.id }]"
          >
            <component :is="filter.icon" :size="16" />
            <span>{{ filter.label }}</span>
          </button>
        </div>

        <!-- Image Grid -->
        <div class="gallery-grid" ref="gridRef">
          <div
            v-for="image in filteredImages"
            :key="image.id"
            class="gallery-item"
            @click="openPreview(image)"
          >
            <img
              :src="getImageUrl(image)"
              :alt="image.sourcePrompt || 'AI 生成图片'"
              class="gallery-image"
              loading="lazy"
            />
            <div class="gallery-item-overlay">
              <p class="image-prompt">{{ image.sourcePrompt?.slice(0, 50) || '无提示词' }}{{ (image.sourcePrompt?.length || 0) > 50 ? '...' : '' }}</p>
              <div class="image-actions">
                <button @click.stop="downloadImage(image)" class="action-btn" title="下载">
                  <Download :size="16" />
                </button>
                <button @click.stop="shareImage(image)" class="action-btn" title="分享">
                  <Share2 :size="16" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="filteredImages.length === 0" class="gallery-empty">
          <ImageIcon :size="48" />
          <p>暂无图片</p>
        </div>
      </div>

      <!-- Image Preview -->
      <Transition name="preview">
        <div v-if="previewImage" class="preview-overlay" @click.self="closePreview">
          <div class="preview-container">
            <img :src="getImageUrl(previewImage)" :alt="previewImage.sourcePrompt" class="preview-image" />
            <div class="preview-info">
              <p class="preview-prompt">{{ previewImage.sourcePrompt || '无提示词' }}</p>
              <p class="preview-time">{{ formatTime(previewImage.timestamp) }}</p>
            </div>
            <button @click="closePreview" class="preview-close">
              <X :size="24" />
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { X, Download, Share2, ImageIcon, Clock, Star, Filter } from 'lucide-vue-next'
import { useChatStore } from '../../stores/chat'
import { useImageDownload } from '../../composables/useImageDownload'
import { useToast } from '../../composables/useToast'
import type { GeneratedImage } from '../../types'
import { isExternalImageUrl } from '../../utils/images'
import { getImageRepository } from '../../platform/imageRepository'

interface Props {
  isOpen: boolean
}

defineProps<Props>()
defineEmits<{
  close: []
}>()

const chatStore = useChatStore()
const { downloadSingleImage } = useImageDownload()
const { success, error: showError } = useToast()

const activeFilter = ref<'all' | 'recent' | 'favorite'>('all')
const previewImage = ref<GeneratedImage | null>(null)

const filters = [
  { id: 'all' as const, label: '全部', icon: Filter },
  { id: 'recent' as const, label: '最近', icon: Clock },
  { id: 'favorite' as const, label: '收藏', icon: Star },
]

// 获取所有图片
const allImages = computed(() => {
  const images: GeneratedImage[] = []
  chatStore.messages.forEach(msg => {
    if (msg.images) {
      images.push(...msg.images)
    }
  })
  return images
})

// 过滤图片
const filteredImages = computed(() => {
  let images = allImages.value

  switch (activeFilter.value) {
    case 'recent': {
      // 最近 24 小时
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
      images = images.filter(img => img.timestamp > oneDayAgo)
      break
    }
    case 'favorite': {
      // 收藏的消息中的图片
      const favoriteMsgIds = new Set(
        chatStore.messages.filter(msg => msg.isFavorite).map(msg => msg.id)
      )
      images = images.filter(img => favoriteMsgIds.has(img.sourceMessageId || ''))
      break
    }
  }

  return images.sort((a, b) => b.timestamp - a.timestamp)
})

function getImageUrl(image: GeneratedImage): string {
  return image.url
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function openPreview(image: GeneratedImage) {
  previewImage.value = image
}

function closePreview() {
  previewImage.value = null
}

async function downloadImage(image: GeneratedImage) {
  await downloadSingleImage(image)
}

async function shareImage(image: GeneratedImage) {
  try {
    const url = getImageUrl(image)
    if (navigator.share) {
      if (!isExternalImageUrl(url)) {
        const blob = await getImageRepository().readImageBlob(image)
        const file = new File([blob], 'ai-image.png', { type: blob.type || 'image/png' })

        await navigator.share({
          title: 'AI 生成的图片',
          text: image.sourcePrompt || '查看这张 AI 生成的图片',
          files: [file],
        })
      } else if (isExternalImageUrl(url)) {
        await navigator.share({
          title: 'AI 生成的图片',
          text: image.sourcePrompt || '查看这张 AI 生成的图片',
          url,
        })
      } else {
        showError('图片链接无效')
      }
    } else {
      // 复制到剪贴板
      await navigator.clipboard.writeText(url)
      success('图片链接已复制到剪贴板')
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      showError('分享失败')
    }
  }
}
</script>

<style scoped>
.gallery-overlay {
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

.gallery-container {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 1200px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-xl);
}

.gallery-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.gallery-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.gallery-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.image-count {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.gallery-filters {
  display: flex;
  gap: 8px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
}

.filter-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.filter-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.filter-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.gallery-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-base);
}

.gallery-item:hover {
  transform: scale(1.02);
  box-shadow: var(--shadow-lg);
}

.gallery-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gallery-item-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, transparent 50%);
  opacity: 0;
  transition: opacity var(--transition-base);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 12px;
}

.gallery-item:hover .gallery-item-overlay {
  opacity: 1;
}

.image-prompt {
  font-size: 12px;
  color: white;
  margin-bottom: 8px;
  line-height: 1.4;
}

.image-actions {
  display: flex;
  gap: 8px;
}

.image-actions .action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: var(--radius-md);
  color: white;
  cursor: pointer;
  transition: all var(--transition-base);
}

.image-actions .action-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.gallery-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--color-text-tertiary);
  gap: 16px;
}

.gallery-empty p {
  font-size: 16px;
}

/* Preview */
.preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.preview-container {
  position: relative;
  max-width: 90vw;
  max-height: 85vh;
}

.preview-image {
  max-width: 100%;
  max-height: 80vh;
  border-radius: var(--radius-lg);
  object-fit: contain;
}

.preview-info {
  position: absolute;
  bottom: -60px;
  left: 0;
  right: 0;
  text-align: center;
}

.preview-prompt {
  font-size: 14px;
  color: white;
  margin-bottom: 4px;
}

.preview-time {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.preview-close {
  position: absolute;
  top: -48px;
  right: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  transition: all var(--transition-base);
}

.preview-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Transitions */
.gallery-enter-active,
.gallery-leave-active {
  transition: all var(--transition-slow);
}

.gallery-enter-from,
.gallery-leave-to {
  opacity: 0;
}

.gallery-enter-from .gallery-container,
.gallery-leave-to .gallery-container {
  transform: scale(0.95);
}

.preview-enter-active,
.preview-leave-active {
  transition: all var(--transition-base);
}

.preview-enter-from,
.preview-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .gallery-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    padding: 16px;
  }

  .gallery-filters {
    overflow-x: auto;
    padding: 12px 16px;
  }

  .preview-overlay {
    padding: 20px;
  }
}
</style>
