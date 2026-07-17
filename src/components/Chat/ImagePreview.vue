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
            :aria-label="t('createVariation')"
            @click.stop="$emit('createVariation', displayImage)"
          >
            <Shuffle :size="16" />
          </button>
          <button
            class="overlay-btn"
            :title="t('editImage')"
            :aria-label="t('editImage')"
            @click.stop="$emit('editImage', displayImage)"
          >
            <Edit :size="16" />
          </button>
          <button
            class="overlay-btn"
            :title="t('downloadImage')"
            :aria-label="t('downloadImage')"
            @click.stop="downloadImage(displayImage)"
          >
            <Download :size="16" />
          </button>
          <button
            class="overlay-btn"
            :title="t('shareImage')"
            :aria-label="t('shareImage')"
            @click.stop="shareImage(displayImage)"
          >
            <Share2 :size="16" />
          </button>
          <button
            class="overlay-btn"
            :title="t('expandImage')"
            :aria-label="t('expandImage')"
            @click.stop="openPreview"
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
          ref="previewOverlayRef"
          class="preview-overlay"
          role="dialog"
          aria-modal="true"
          :aria-label="t('previewImage')"
          @click="closePreview"
        >
          <div
            class="preview-container"
            :class="{ 'has-thumbnails': previewEntries.length > 1 }"
            @click.stop
          >
            <div class="preview-stage">
              <img
                :key="activePreviewEntry.key"
                :src="previewImageUrl || undefined"
                :alt="t('generatedImageAlt')"
                class="preview-image"
              />

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
                      previewDisplayImage.sourcePrompt
                    }}</span>
                  </div>
                  <div class="metadata-item">
                    <span class="metadata-label">{{ t('generatedAt') }}:</span>
                    <span class="metadata-value">{{
                      formatTime(previewDisplayImage.timestamp)
                    }}</span>
                  </div>
                </div>
                <button class="copy-btn" @click.stop="copyPrompt">
                  <Copy :size="14" />
                  <span>{{ t('copyPrompt') }}</span>
                </button>
              </div>
            </div>

            <div
              v-if="previewEntries.length > 1"
              ref="thumbnailStripRef"
              class="preview-thumbnail-strip"
              role="group"
              :aria-label="t('conversationImageStrip')"
            >
              <button
                v-for="(entry, index) in previewEntries"
                :key="entry.key"
                type="button"
                class="preview-thumbnail"
                :class="{ active: entry.key === activePreviewEntry.key }"
                :aria-label="
                  t('previewThumbnailLabel', {
                    index: index + 1,
                    total: previewEntries.length,
                  })
                "
                :aria-current="entry.key === activePreviewEntry.key ? 'true' : undefined"
                @click="selectPreviewImage(entry.key)"
              >
                <img :src="thumbnailUrl(entry) || undefined" alt="" draggable="false" />
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
                @click.stop="downloadImage(previewDisplayImage)"
              >
                <Download :size="14" />
                <span class="preview-btn-label">{{ t('download') }}</span>
              </button>
              <button
                type="button"
                class="preview-btn"
                :title="t('share')"
                :aria-label="t('share')"
                @click.stop="shareImage(previewDisplayImage)"
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
                  @click.stop="downloadImage(previewDisplayImage)"
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
            <button
              class="close-btn"
              :title="t('close')"
              :aria-label="t('close')"
              @click="closePreview"
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
import { ref, computed, nextTick, onUnmounted, watch } from 'vue'
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
import type { ConversationPreviewImage, GeneratedImage } from '../../types'
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
  previewImages?: ConversationPreviewImage[]
  previewKey?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  createVariation: [image: GeneratedImage, sourceMessageId?: string]
  editImage: [image: GeneratedImage, sourceMessageId?: string]
  imageLoad: []
}>()

const { success, error: showError } = useToast()
const { downloadSingleImage } = useImageDownload()
const { t, locale } = useI18n()
const showPreview = ref(false)
const showImageInfo = ref(false)
const previewOverlayRef = ref<HTMLElement>()
const thumbnailStripRef = ref<HTMLElement>()
const displayImage = ref<GeneratedImage>(props.image)
const previewDisplayImage = ref<GeneratedImage>(props.image)
const resolveFailed = ref(false)
const previewResolveFailed = ref(false)
const activePreviewKey = ref('')
const ownedObjectUrls = new Set<string>()
const ownedPreviewObjectUrls = new Set<string>()
let resolveRun = 0
let previewResolveRun = 0
let lastActivePreviewIndex = 0

const previewEntries = computed<ConversationPreviewImage[]>(() => {
  if (props.previewImages?.length) return props.previewImages
  return [
    {
      key: props.previewKey || `standalone:${props.image.id}`,
      messageId: '',
      imageIndex: 0,
      image: props.image,
    },
  ]
})
const initialPreviewEntry = computed<ConversationPreviewImage>(
  () =>
    previewEntries.value.find((entry) => entry.key === props.previewKey) ??
    previewEntries.value[0]!,
)
const activePreviewEntry = computed<ConversationPreviewImage>(() => {
  const activeEntry = previewEntries.value.find((entry) => entry.key === activePreviewKey.value)
  if (activeEntry) return activeEntry
  return (
    previewEntries.value[Math.min(lastActivePreviewIndex, previewEntries.value.length - 1)] ??
    initialPreviewEntry.value
  )
})
const localActionsAvailable = computed(() => isLocalImageActionAvailable(previewDisplayImage.value))
const hasImageInfo = computed(() => Boolean(previewDisplayImage.value.sourcePrompt))
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

function revokeOwnedUrls(urls: Set<string>) {
  urls.forEach(revokeObjectUrl)
  urls.clear()
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
      revokeOwnedUrls(ownedObjectUrls)
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

      revokeOwnedUrls(ownedObjectUrls)
      displayImage.value = resolved
      if (resolved.url.startsWith('blob:') && resolved.url !== props.image.url) {
        ownedObjectUrls.add(resolved.url)
      }
    } catch (err) {
      if (run !== resolveRun) return
      console.warn('Failed to resolve local image URL:', err)
      revokeOwnedUrls(ownedObjectUrls)
      resolveFailed.value = true
      displayImage.value = props.image
    }
  },
  { immediate: true },
)

watch(
  () => {
    if (!showPreview.value) return null
    const entry = activePreviewEntry.value
    return {
      key: entry.key,
      image: entry.image,
      id: entry.image.id,
      url: entry.image.url,
      localPath: entry.image.localPath,
      base64: entry.image.base64,
      mimeType: entry.image.mimeType,
    }
  },
  async (activeState) => {
    const run = ++previewResolveRun
    if (!activeState) return

    const sourceImage = activeState.image
    previewResolveFailed.value = false
    previewDisplayImage.value = sourceImage
    if (!shouldResolveDisplayUrl(sourceImage)) {
      revokeOwnedUrls(ownedPreviewObjectUrls)
      return
    }

    try {
      const resolved = await getImageRepository().resolveDisplayUrl(sourceImage)
      if (run !== previewResolveRun) {
        if (resolved.url.startsWith('blob:') && resolved.url !== sourceImage.url) {
          revokeObjectUrl(resolved.url)
        }
        return
      }

      revokeOwnedUrls(ownedPreviewObjectUrls)
      previewDisplayImage.value = resolved
      if (resolved.url.startsWith('blob:') && resolved.url !== sourceImage.url) {
        ownedPreviewObjectUrls.add(resolved.url)
      }
    } catch (err) {
      if (run !== previewResolveRun) return
      console.warn('Failed to resolve preview image URL:', err)
      revokeOwnedUrls(ownedPreviewObjectUrls)
      previewResolveFailed.value = true
      previewDisplayImage.value = sourceImage
    }
  },
)

watch(
  () => (showPreview.value ? previewEntries.value.map((entry) => entry.key) : null),
  (keys) => {
    if (!keys || keys.includes(activePreviewKey.value)) return
    const fallbackIndex = Math.min(lastActivePreviewIndex, keys.length - 1)
    if (fallbackIndex < 0) {
      closePreview()
      return
    }
    activePreviewKey.value = keys[fallbackIndex]
    showImageInfo.value = false
    void nextTick(scrollActiveThumbnailIntoView)
  },
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

const previewImageUrl = computed(() => {
  if (!isValidImageUrl(previewDisplayImage.value.url)) {
    if (shouldResolveDisplayUrl(activePreviewEntry.value.image) && !previewResolveFailed.value) {
      return ''
    }
    console.warn('Invalid preview image URL detected:', previewDisplayImage.value.url)
    return ''
  }
  return previewDisplayImage.value.url
})

function thumbnailUrl(entry: ConversationPreviewImage): string {
  if (entry.key === activePreviewEntry.value.key && previewImageUrl.value) {
    return previewImageUrl.value
  }
  return isValidImageUrl(entry.image.url) ? entry.image.url : ''
}

function scrollActiveThumbnailIntoView() {
  const thumbnail = thumbnailStripRef.value?.querySelector<HTMLElement>(
    '.preview-thumbnail[aria-current="true"]',
  )
  if (typeof thumbnail?.scrollIntoView === 'function') {
    thumbnail.scrollIntoView({ block: 'nearest', inline: 'center' })
  }
}

function selectPreviewImage(key: string) {
  const index = previewEntries.value.findIndex((entry) => entry.key === key)
  if (index === -1 || key === activePreviewEntry.value.key) return
  lastActivePreviewIndex = index
  activePreviewKey.value = key
  showImageInfo.value = false
  void nextTick(scrollActiveThumbnailIntoView)
}

function openPreview() {
  const initialIndex = previewEntries.value.findIndex(
    (entry) => entry.key === initialPreviewEntry.value.key,
  )
  lastActivePreviewIndex = Math.max(0, initialIndex)
  activePreviewKey.value = initialPreviewEntry.value.key
  showPreview.value = true
  showImageInfo.value = false
  document.body.style.overflow = 'hidden'
  void nextTick(scrollActiveThumbnailIntoView)
}

function closePreview() {
  showPreview.value = false
  showImageInfo.value = false
  activePreviewKey.value = ''
  previewResolveRun += 1
  revokeOwnedUrls(ownedPreviewObjectUrls)
  document.body.style.overflow = ''
}

function toggleImageInfo() {
  if (hasImageInfo.value) {
    showImageInfo.value = !showImageInfo.value
  }
}

function requestVariation() {
  const sourceMessageId = activePreviewEntry.value.messageId
  if (sourceMessageId) {
    emit('createVariation', previewDisplayImage.value, sourceMessageId)
  } else {
    emit('createVariation', previewDisplayImage.value)
  }
}

function requestEdit() {
  const sourceMessageId = activePreviewEntry.value.messageId
  if (sourceMessageId) {
    emit('editImage', previewDisplayImage.value, sourceMessageId)
  } else {
    emit('editImage', previewDisplayImage.value)
  }
}

onUnmounted(() => {
  if (showPreview.value) {
    document.body.style.overflow = ''
  }
  revokeOwnedUrls(ownedObjectUrls)
  revokeOwnedUrls(ownedPreviewObjectUrls)
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
  if (previewDisplayImage.value.sourcePrompt) {
    try {
      await navigator.clipboard.writeText(previewDisplayImage.value.sourcePrompt)
      success(t('promptCopied'))
    } catch {
      showError(t('copyFailed'))
    }
  }
}

async function downloadImage(image: GeneratedImage) {
  await downloadSingleImage(image)
}

async function openImageFile() {
  try {
    await openLocalImage(previewDisplayImage.value)
    success(t('openedLocalImage'))
  } catch (err) {
    console.error('Open local image failed:', err)
    showError(localImageErrorMessage(err, t('openLocalImageFailed')))
  }
}

async function revealImageFile() {
  try {
    await revealLocalImage(previewDisplayImage.value)
    success(t('revealedLocalImage'))
  } catch (err) {
    console.error('Reveal local image failed:', err)
    showError(localImageErrorMessage(err, t('revealLocalImageFailed')))
  }
}

async function copyImageFile() {
  try {
    await copyLocalImageToClipboard(previewDisplayImage.value)
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

async function shareImage(image: GeneratedImage) {
  try {
    const url = isValidImageUrl(image.url) ? image.url : ''
    if (!url) {
      showError(t('invalidImageLink'))
      return
    }

    if (navigator.share && !isExternalImageUrl(url)) {
      const blob = await getImageRepository().readImageBlob(image)
      const file = new File([blob], 'ai-image.png', { type: blob.type || 'image/png' })
      await navigator.share({
        title: t('generatedImageShareTitle'),
        text: image.sourcePrompt || t('generatedImageShareText'),
        files: [file],
      })
    } else if (navigator.share && isExternalImageUrl(url)) {
      await navigator.share({
        title: t('generatedImageShareTitle'),
        text: image.sourcePrompt || t('generatedImageShareText'),
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
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-bottom: 44px;
}

.preview-stage {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
}

.preview-image {
  max-width: 100%;
  max-height: calc(100vh - 164px);
  border-radius: var(--radius-lg);
  object-fit: contain;
}

.preview-container.has-thumbnails .preview-image {
  max-height: calc(100vh - 246px);
}

.preview-thumbnail-strip {
  display: flex;
  gap: 8px;
  width: min(76vw, 720px);
  max-width: 100%;
  padding: 7px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.28) transparent;
  background: rgba(2, 6, 23, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 15px;
  box-shadow: 0 18px 48px -28px rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(18px) saturate(1.15);
}

.preview-thumbnail {
  position: relative;
  flex: 0 0 54px;
  width: 54px;
  height: 54px;
  padding: 2px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.88);
  opacity: 0.64;
  cursor: pointer;
  transition:
    opacity var(--transition-base),
    border-color var(--transition-base),
    transform var(--transition-base),
    box-shadow var(--transition-base);
}

.preview-thumbnail:hover {
  opacity: 0.92;
  border-color: rgba(255, 255, 255, 0.58);
}

.preview-thumbnail:focus-visible {
  opacity: 1;
  border-color: rgba(255, 255, 255, 0.78);
  outline: none;
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.9);
}

.preview-thumbnail.active {
  opacity: 1;
  border-color: rgba(255, 255, 255, 0.96);
  transform: translateY(-1px);
  box-shadow:
    0 0 0 2px rgba(59, 130, 246, 0.8),
    0 10px 24px -14px rgba(37, 99, 235, 0.95);
}

.preview-thumbnail img {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 7px;
  object-fit: cover;
  user-select: none;
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
  bottom: 0;
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

@media (max-width: 640px) {
  .preview-overlay {
    padding: 52px 12px 12px;
  }

  .preview-container {
    max-width: 100%;
    max-height: calc(100vh - 64px);
  }

  .preview-image {
    max-height: calc(100vh - 148px);
  }

  .preview-container.has-thumbnails .preview-image {
    max-height: calc(100vh - 228px);
  }

  .preview-thumbnail-strip {
    width: calc(100vw - 24px);
  }

  .close-btn {
    top: -44px;
  }
}
</style>
