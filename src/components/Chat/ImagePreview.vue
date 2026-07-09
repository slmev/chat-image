<template>
  <div class="image-card">
    <!-- Image -->
    <div class="image-wrapper">
      <button
        type="button"
        class="image-open-button"
        :aria-label="t('expandImage')"
        @click="openPreview"
      >
        <img
          :src="imageUrl"
          :alt="t('generatedImageAlt')"
          class="image"
          loading="lazy"
          @load="emit('imageLoad')"
        />
      </button>
      <div class="image-overlay">
        <div class="overlay-actions">
          <button
            class="overlay-btn"
            :title="t('createVariation')"
            @click.stop="$emit('createVariation', displayImage)"
          >
            <Shuffle :size="16" />
          </button>
          <button
            class="overlay-btn"
            :title="t('editImage')"
            @click.stop="$emit('editImage', displayImage)"
          >
            <Edit :size="16" />
          </button>
          <button class="overlay-btn" :title="t('downloadImage')" @click.stop="downloadImage">
            <Download :size="16" />
          </button>
          <button class="overlay-btn" :title="t('shareImage')" @click.stop="shareImage">
            <Share2 :size="16" />
          </button>
          <button class="overlay-btn" :title="t('expandImage')" @click.stop="openPreview">
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
          ref="previewOverlayRef"
          class="preview-overlay"
          role="dialog"
          aria-modal="true"
          :aria-label="t('previewImage')"
          @click="closePreview"
        >
          <div class="preview-container" @click.stop>
            <img :src="imageUrl" :alt="t('generatedImageAlt')" class="preview-image" />

            <!-- Metadata Panel -->
            <div v-if="showImageInfo && hasImageInfo" class="metadata-panel">
              <div class="metadata-header">
                <Info :size="16" />
                <span>{{ t('imageInfo') }}</span>
              </div>
              <div class="metadata-content">
                <div class="metadata-item metadata-prompt-item">
                  <span class="metadata-label">{{ t('promptLabel') }}:</span>
                  <span class="metadata-value metadata-prompt">{{
                    displayImage.sourcePrompt
                  }}</span>
                </div>
                <div class="metadata-item">
                  <span class="metadata-label">{{ t('generatedAt') }}:</span>
                  <span class="metadata-value">{{ formatTime(displayImage.timestamp) }}</span>
                </div>
              </div>
              <button class="copy-btn" @click.stop="copyPrompt">
                <Copy :size="14" />
                <span>{{ t('copyPrompt') }}</span>
              </button>
            </div>

            <div class="preview-actions">
              <button
                v-if="hasImageInfo"
                type="button"
                class="preview-btn"
                :class="{ active: showImageInfo }"
                :title="t('imageInfo')"
                :aria-label="t('imageInfo')"
                :aria-pressed="showImageInfo"
                @click.stop="toggleImageInfo"
              >
                <Info :size="14" />
                <span class="preview-btn-label">{{ t('imageInfo') }}</span>
              </button>
              <button
                type="button"
                class="preview-btn"
                :title="t('createVariation')"
                :aria-label="t('createVariation')"
                @click.stop="requestVariation"
              >
                <Shuffle :size="14" />
                <span class="preview-btn-label">{{ t('variation') }}</span>
              </button>
              <button
                type="button"
                class="preview-btn"
                :title="t('editImage')"
                :aria-label="t('editImage')"
                @click.stop="requestEdit"
              >
                <Edit :size="14" />
                <span class="preview-btn-label">{{ t('edit') }}</span>
              </button>
              <button
                type="button"
                class="preview-btn"
                :title="t('downloadImage')"
                :aria-label="t('downloadImage')"
                @click.stop="downloadImage"
              >
                <Download :size="14" />
                <span class="preview-btn-label">{{ t('download') }}</span>
              </button>
              <button
                type="button"
                class="preview-btn"
                :title="t('share')"
                :aria-label="t('share')"
                @click.stop="shareImage"
              >
                <Share2 :size="14" />
                <span class="preview-btn-label">{{ t('share') }}</span>
              </button>
              <template v-if="localActionsAvailable">
                <button
                  type="button"
                  class="preview-btn"
                  :title="t('openLocalImage')"
                  :aria-label="t('openLocalImage')"
                  @click.stop="openImageFile"
                >
                  <ExternalLink :size="14" />
                  <span class="preview-btn-label">{{ t('open') }}</span>
                </button>
                <button
                  type="button"
                  class="preview-btn"
                  :title="t('revealLocalImage')"
                  :aria-label="t('revealLocalImage')"
                  @click.stop="revealImageFile"
                >
                  <FolderSearch :size="14" />
                  <span class="preview-btn-label">{{ t('reveal') }}</span>
                </button>
                <button
                  type="button"
                  class="preview-btn"
                  :title="t('saveAs')"
                  :aria-label="t('saveAs')"
                  @click.stop="downloadImage"
                >
                  <Save :size="14" />
                  <span class="preview-btn-label">{{ t('saveAs') }}</span>
                </button>
                <button
                  type="button"
                  class="preview-btn"
                  :title="t('copyImageToClipboard')"
                  :aria-label="t('copyImageToClipboard')"
                  @click.stop="copyImageFile"
                >
                  <ClipboardCopy :size="14" />
                  <span class="preview-btn-label">{{ t('copy') }}</span>
                </button>
              </template>
            </div>
            <button class="close-btn" @click="closePreview">
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
import { useI18n } from 'vue-i18n'
import { useToast } from '../../composables/useToast'
import { useImageDownload } from '../../composables/useImageDownload'
import { useFocusTrap } from '../../composables/useFocusTrap'
import { useModalLayer } from '../../composables/useModalLayer'
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

const emit = defineEmits<{
  createVariation: [image: GeneratedImage]
  editImage: [image: GeneratedImage]
  imageLoad: []
}>()

const { success, error: showError } = useToast()
const { downloadSingleImage } = useImageDownload()
const { t, locale } = useI18n()
const showPreview = ref(false)
const showImageInfo = ref(false)
const previewOverlayRef = ref<HTMLElement>()
const displayImage = ref<GeneratedImage>(props.image)
const resolveFailed = ref(false)
const ownedObjectUrls = new Set<string>()
let resolveRun = 0

const localActionsAvailable = computed(() => isLocalImageActionAvailable(displayImage.value))
const hasImageInfo = computed(() => Boolean(displayImage.value.sourcePrompt))
const { isTopLayer: isPreviewTopLayer } = useModalLayer(showPreview, closePreview)
const isPreviewTrapActive = computed(() => showPreview.value && isPreviewTopLayer.value)
useFocusTrap(previewOverlayRef, { isActive: isPreviewTrapActive })

function shouldResolveDisplayUrl(image: GeneratedImage): boolean {
  const validUrl = isValidImageUrl(image.url)
  return Boolean(
    (image.localPath && !validUrl) ||
    (image.base64 && !validUrl) ||
    (isTauriRuntime() && isExternalImageUrl(image.url)),
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
  () =>
    [
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

function openPreview() {
  showPreview.value = true
  showImageInfo.value = false
  document.body.style.overflow = 'hidden'
}

function closePreview() {
  showPreview.value = false
  showImageInfo.value = false
  document.body.style.overflow = ''
}

function toggleImageInfo() {
  if (hasImageInfo.value) {
    showImageInfo.value = !showImageInfo.value
  }
}

function requestVariation() {
  emit('createVariation', displayImage.value)
}

function requestEdit() {
  emit('editImage', displayImage.value)
}

onUnmounted(() => {
  if (showPreview.value) {
    document.body.style.overflow = ''
  }
  revokeOwnedObjectUrls()
})

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(locale.value, {
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
      success(t('promptCopied'))
    } catch {
      showError(t('copyFailed'))
    }
  }
}

async function downloadImage() {
  await downloadSingleImage(displayImage.value)
}

async function openImageFile() {
  try {
    await openLocalImage(displayImage.value)
    success(t('openedLocalImage'))
  } catch (err) {
    console.error('Open local image failed:', err)
    showError(localImageErrorMessage(err, t('openLocalImageFailed')))
  }
}

async function revealImageFile() {
  try {
    await revealLocalImage(displayImage.value)
    success(t('revealedLocalImage'))
  } catch (err) {
    console.error('Reveal local image failed:', err)
    showError(localImageErrorMessage(err, t('revealLocalImageFailed')))
  }
}

async function copyImageFile() {
  try {
    await copyLocalImageToClipboard(displayImage.value)
    success(t('imageCopiedToClipboard'))
  } catch (err) {
    console.error('Copy local image failed:', err)
    showError(localImageErrorMessage(err, t('copyImageFailed')))
  }
}

function localImageErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof LocalImageActionError) {
    const matches: Record<string, string> = {
      missing_local_path: 'missingLocalFile',
      not_available: 'imageClipboardUnavailable',
      read_failed: 'readLocalImageFailed',
      copy_not_supported: 'copyImageNotSupported',
      write_failed: 'writeClipboardFailed',
    }
    return matches[error.code] ? t(matches[error.code]) : error.message
  }
  return fallback
}

async function shareImage() {
  try {
    const url = imageUrl.value
    if (!url) {
      showError(t('invalidImageLink'))
      return
    }

    if (navigator.share && !isExternalImageUrl(url)) {
      const blob = await getImageRepository().readImageBlob(displayImage.value)
      const file = new File([blob], 'ai-image.png', { type: blob.type || 'image/png' })
      await navigator.share({
        title: t('generatedImageShareTitle'),
        text: displayImage.value.sourcePrompt || t('generatedImageShareText'),
        files: [file],
      })
    } else if (navigator.share && isExternalImageUrl(url)) {
      await navigator.share({
        title: t('generatedImageShareTitle'),
        text: displayImage.value.sourcePrompt || t('generatedImageShareText'),
        url,
      })
    } else {
      await navigator.clipboard.writeText(url)
      success(t('imageLinkCopied'))
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      showError(t('shareFailed'))
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
  overflow: hidden;
}

.image-open-button {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: inherit;
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
  background: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0) 50%);
  opacity: 0;
  transition: opacity var(--transition-base);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
  pointer-events: none;
}

.image-card:hover .image-overlay,
.image-card:focus-within .image-overlay {
  opacity: 1;
}

.overlay-actions {
  display: flex;
  gap: 10px;
  padding: 6px;
  pointer-events: auto;
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
  top: 50%;
  left: 50%;
  z-index: 2;
  width: min(520px, calc(100vw - 48px));
  max-height: min(70vh, 560px);
  overflow-y: auto;
  transform: translate(-50%, -50%);
  background: rgba(2, 6, 23, 0.88);
  border-radius: var(--radius-lg);
  padding: 18px;
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 24px 70px -32px rgba(0, 0, 0, 0.85);
}

.metadata-header {
  display: flex;
  align-items: center;
  justify-content: center;
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

.metadata-prompt {
  font-size: 14px;
  line-height: 1.65;
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
  bottom: -46px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  max-width: min(88vw, 720px);
  padding: 0;
}

.preview-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.preview-btn:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.preview-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.preview-btn-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
