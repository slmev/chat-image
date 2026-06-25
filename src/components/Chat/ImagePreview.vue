<template>
  <div class="image-card">
    <!-- Image -->
    <div class="image-wrapper" @click="openPreview">
      <img
        :src="imageUrl"
        alt="生成的图片"
        class="image"
        loading="lazy"
      />
      <div class="image-overlay">
        <div class="overlay-actions">
          <button
            @click.stop="$emit('createVariation', displayImage)"
            class="overlay-btn"
            title="创建变体"
          >
            <Shuffle :size="16" />
          </button>
          <button
            @click.stop="$emit('editImage', displayImage)"
            class="overlay-btn"
            title="编辑图片"
          >
            <Edit :size="16" />
          </button>
          <button
            @click.stop="downloadImage"
            class="overlay-btn"
            title="下载图片"
          >
            <Download :size="16" />
          </button>
          <button
            @click.stop="shareImage"
            class="overlay-btn"
            title="分享图片"
          >
            <Share2 :size="16" />
          </button>
          <button
            @click.stop="openPreview"
            class="overlay-btn"
            title="放大查看"
          >
            <Expand :size="16" />
          </button>
        </div>
      </div>
    </div>

    <!-- Preview Modal -->
    <Teleport to="body">
      <Transition name="preview">
        <div
          v-if="showPreview"
          class="preview-overlay"
          @click="closePreview"
        >
          <div class="preview-container" @click.stop>
            <img
              :src="imageUrl"
              alt="生成的图片"
              class="preview-image"
            />

            <!-- Metadata Panel -->
            <div v-if="displayImage.sourcePrompt" class="metadata-panel">
              <div class="metadata-header">
                <Info :size="16" />
                <span>图片信息</span>
              </div>
              <div class="metadata-content">
                <div class="metadata-item">
                  <span class="metadata-label">提示词:</span>
                  <span class="metadata-value">{{ displayImage.sourcePrompt }}</span>
                </div>
                <div class="metadata-item">
                  <span class="metadata-label">生成时间:</span>
                  <span class="metadata-value">{{ formatTime(displayImage.timestamp) }}</span>
                </div>
              </div>
              <button @click.stop="copyPrompt" class="copy-btn">
                <Copy :size="14" />
                <span>复制提示词</span>
              </button>
            </div>

            <div class="preview-actions">
              <button
                @click.stop="$emit('createVariation', displayImage)"
                class="preview-btn"
                title="创建变体"
              >
                <Shuffle :size="18" />
                <span>变体</span>
              </button>
              <button
                @click.stop="$emit('editImage', displayImage)"
                class="preview-btn"
                title="编辑图片"
              >
                <Edit :size="18" />
                <span>编辑</span>
              </button>
              <button
                @click.stop="downloadImage"
                class="preview-btn"
                title="下载图片"
              >
                <Download :size="18" />
                <span>下载</span>
              </button>
              <button
                @click.stop="shareImage"
                class="preview-btn"
                title="分享"
              >
                <Share2 :size="18" />
                <span>分享</span>
              </button>
              <template v-if="localActionsAvailable">
                <button
                  @click.stop="openImageFile"
                  class="preview-btn"
                  title="打开本地图片"
                >
                  <ExternalLink :size="18" />
                  <span>打开</span>
                </button>
                <button
                  @click.stop="revealImageFile"
                  class="preview-btn"
                  title="在文件管理器中显示"
                >
                  <FolderSearch :size="18" />
                  <span>显示</span>
                </button>
                <button
                  @click.stop="downloadImage"
                  class="preview-btn"
                  title="另存为"
                >
                  <Save :size="18" />
                  <span>另存为</span>
                </button>
                <button
                  @click.stop="copyImageFile"
                  class="preview-btn"
                  title="复制图片到剪贴板"
                >
                  <ClipboardCopy :size="18" />
                  <span>复制</span>
                </button>
              </template>
            </div>
            <button
              @click="closePreview"
              class="close-btn"
            >
              <X :size="20" />
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'
import {
  ClipboardCopy,
  Copy,
  Download,
  Edit,
  Expand,
  ExternalLink,
  FolderSearch,
  Info,
  Save,
  Share2,
  Shuffle,
  X,
} from 'lucide-vue-next'
import { useToast } from '../../composables/useToast'
import { useImageDownload } from '../../composables/useImageDownload'
import type { GeneratedImage } from '../../types'
import { isExternalImageUrl, isValidImageUrl } from '../../utils/images'
import { getImageRepository } from '../../platform/imageRepository'
import { isTauriRuntime } from '../../platform/runtime'
import {
  LocalImageActionError,
  copyLocalImageToClipboard,
  isLocalImageActionAvailable,
  openLocalImage,
  revealLocalImage,
} from '../../platform/localImageActions'

interface Props {
  image: GeneratedImage
}

const props = defineProps<Props>()

defineEmits<{
  createVariation: [image: GeneratedImage]
  editImage: [image: GeneratedImage]
}>()

const { success, error: showError } = useToast()
const { downloadSingleImage } = useImageDownload()
const showPreview = ref(false)
const displayImage = ref<GeneratedImage>(props.image)
const resolveFailed = ref(false)
const ownedObjectUrls = new Set<string>()
let resolveRun = 0

const localActionsAvailable = computed(() => isLocalImageActionAvailable(displayImage.value))

function shouldResolveDisplayUrl(image: GeneratedImage): boolean {
  const validUrl = isValidImageUrl(image.url)
  return Boolean(
    (image.localPath && !validUrl)
    || (image.base64 && !validUrl)
    || (isTauriRuntime() && isExternalImageUrl(image.url)),
  )
}

function revokeObjectUrl(url: string) {
  if (typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url)
  }
}

function revokeOwnedObjectUrls() {
  ownedObjectUrls.forEach(revokeObjectUrl)
  ownedObjectUrls.clear()
}

watch(
  () => [
    props.image.id,
    props.image.url,
    props.image.localPath,
    props.image.base64,
    props.image.mimeType,
  ] as const,
  async () => {
    const run = ++resolveRun
    resolveFailed.value = false

    if (!shouldResolveDisplayUrl(props.image)) {
      revokeOwnedObjectUrls()
      displayImage.value = props.image
      return
    }

    try {
      const resolved = await getImageRepository().resolveDisplayUrl(props.image)
      if (run !== resolveRun) {
        if (resolved.url.startsWith('blob:') && resolved.url !== props.image.url) {
          revokeObjectUrl(resolved.url)
        }
        return
      }

      revokeOwnedObjectUrls()
      displayImage.value = resolved
      if (resolved.url.startsWith('blob:') && resolved.url !== props.image.url) {
        ownedObjectUrls.add(resolved.url)
      }
    } catch (err) {
      if (run !== resolveRun) return
      console.warn('Failed to resolve local image URL:', err)
      revokeOwnedObjectUrls()
      resolveFailed.value = true
      displayImage.value = props.image
    }
  },
  { immediate: true },
)

const imageUrl = computed(() => {
  // 校验 URL 安全性
  if (!isValidImageUrl(displayImage.value.url)) {
    if (shouldResolveDisplayUrl(props.image) && !resolveFailed.value) {
      return ''
    }
    console.warn('Invalid image URL detected:', displayImage.value.url)
    return ''
  }
  return displayImage.value.url
})

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && showPreview.value) {
    closePreview()
  }
}

function openPreview() {
  showPreview.value = true
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', handleKeydown)
}

function closePreview() {
  showPreview.value = false
  document.body.style.overflow = ''
  document.removeEventListener('keydown', handleKeydown)
}

onUnmounted(() => {
  if (showPreview.value) {
    document.removeEventListener('keydown', handleKeydown)
  }
  revokeOwnedObjectUrls()
})

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function copyPrompt() {
  if (displayImage.value.sourcePrompt) {
    try {
      await navigator.clipboard.writeText(displayImage.value.sourcePrompt)
      success('提示词已复制')
    } catch {
      showError('复制失败')
    }
  }
}

async function downloadImage() {
  await downloadSingleImage(displayImage.value)
}

async function openImageFile() {
  try {
    await openLocalImage(displayImage.value)
    success('已打开本地图片')
  } catch (err) {
    console.error('Open local image failed:', err)
    showError(localImageErrorMessage(err, '打开本地图片失败'))
  }
}

async function revealImageFile() {
  try {
    await revealLocalImage(displayImage.value)
    success('已在文件管理器中显示')
  } catch (err) {
    console.error('Reveal local image failed:', err)
    showError(localImageErrorMessage(err, '显示本地图片失败'))
  }
}

async function copyImageFile() {
  try {
    await copyLocalImageToClipboard(displayImage.value)
    success('图片已复制到剪贴板')
  } catch (err) {
    console.error('Copy local image failed:', err)
    showError(localImageErrorMessage(err, '复制图片失败'))
  }
}

function localImageErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof LocalImageActionError) {
    return error.message
  }
  return fallback
}

async function shareImage() {
  try {
    const url = imageUrl.value
    if (!url) {
      showError('图片链接无效')
      return
    }

    if (navigator.share && !isExternalImageUrl(url)) {
      const blob = await getImageRepository().readImageBlob(displayImage.value)
      const file = new File([blob], 'ai-image.png', { type: blob.type || 'image/png' })
      await navigator.share({
        title: 'AI 生成的图片',
        text: displayImage.value.sourcePrompt || '查看这张 AI 生成的图片',
        files: [file],
      })
    } else if (navigator.share && isExternalImageUrl(url)) {
      await navigator.share({
        title: 'AI 生成的图片',
        text: displayImage.value.sourcePrompt || '查看这张 AI 生成的图片',
        url,
      })
    } else {
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
.image-card {
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  transition: all var(--transition-base);
}

.image-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}

.image-wrapper {
  position: relative;
  cursor: pointer;
  overflow: hidden;
}

.image {
  width: 100%;
  height: auto;
  display: block;
  transition: transform var(--transition-slow);
}

.image-card:hover .image {
  transform: scale(1.02);
}

.image-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.6) 0%,
    rgba(0, 0, 0, 0) 50%
  );
  opacity: 0;
  transition: opacity var(--transition-base);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
}

.image-card:hover .image-overlay {
  opacity: 1;
}

.overlay-actions {
  display: flex;
  gap: 10px;
  padding: 6px;
  background: rgba(15, 23, 42, 0.36);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 40px -26px rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px) saturate(1.1);
}

.overlay-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(248, 250, 252, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: var(--radius-md);
  color: #0f172a;
  cursor: pointer;
  transition: all var(--transition-base);
  box-shadow:
    0 10px 24px -16px rgba(0, 0, 0, 0.65),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
}

.overlay-btn:hover {
  background: #ffffff;
  color: #020617;
  transform: translateY(-2px);
  box-shadow:
    0 16px 30px -16px rgba(0, 0, 0, 0.72),
    inset 0 1px 0 rgba(255, 255, 255, 0.86);
}

/* Preview Modal */
.preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 40px;
  backdrop-filter: blur(8px);
}

.preview-container {
  position: relative;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  gap: 20px;
}

.preview-image {
  max-width: 100%;
  max-height: 85vh;
  border-radius: var(--radius-lg);
  object-fit: contain;
}

/* Metadata Panel */
.metadata-panel {
  position: absolute;
  right: -320px;
  top: 0;
  width: 300px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: var(--radius-lg);
  padding: 16px;
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.metadata-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 14px;
  font-weight: 600;
}

.metadata-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.metadata-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metadata-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.metadata-value {
  font-size: 13px;
  color: white;
  line-height: 1.5;
  word-break: break-word;
}

.copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  margin-top: 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-md);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base);
}

.copy-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.preview-actions {
  position: absolute;
  bottom: -60px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  max-width: min(88vw, 720px);
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.preview-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 72px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: var(--radius-full);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base);
}

.preview-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.close-btn {
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

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Preview Transition */
.preview-enter-active,
.preview-leave-active {
  transition: all var(--transition-slow);
}

.preview-enter-from,
.preview-leave-to {
  opacity: 0;
}

.preview-enter-from .preview-container,
.preview-leave-to .preview-container {
  transform: scale(0.95);
}
</style>
