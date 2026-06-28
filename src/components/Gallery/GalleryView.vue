<template>
  <section id="main-content" :class="['gallery-workbench', `density-${density}`]">
    <aside class="gallery-sidebar" :aria-label="t('galleryFilters')">
      <div class="sidebar-section">
        <label for="gallery-search" class="filter-label">{{ t('promptLabel') }}</label>
        <div class="search-input-wrapper">
          <Search :size="16" class="search-icon" aria-hidden="true" />
          <input
            id="gallery-search"
            v-model="searchQuery"
            type="search"
            class="gallery-search-input"
            :placeholder="t('gallerySearchPlaceholder')"
            :aria-label="t('gallerySearchPlaceholder')"
          />
        </div>
      </div>

      <div class="gallery-stats" aria-live="polite">
        <div class="stat-row">
          <span>{{ t('galleryTotalImages') }}</span>
          <strong>{{ galleryItems.length }}</strong>
        </div>
        <div class="stat-row">
          <span>{{ t('galleryCurrentImages') }}</span>
          <strong>{{ currentImageCount }}</strong>
        </div>
        <div class="stat-row">
          <span>{{ t('galleryHistoryImages') }}</span>
          <strong>{{ historyImageCount }}</strong>
        </div>
      </div>

      <div class="sidebar-section">
        <p class="filter-label">{{ t('galleryRange') }}</p>
        <div class="filter-stack">
          <button
            v-for="filter in scopeFilters"
            :key="filter.id"
            type="button"
            :class="['filter-btn', { active: activeScope === filter.id }]"
            :aria-pressed="activeScope === filter.id"
            @click="activeScope = filter.id"
          >
            <component :is="filter.icon" :size="16" aria-hidden="true" />
            <span>{{ filter.label }}</span>
            <strong>{{ filter.count }}</strong>
          </button>
        </div>
      </div>

      <div class="sidebar-section">
        <label for="gallery-time-range" class="filter-label">{{ t('galleryTimeRange') }}</label>
        <div class="select-wrapper">
          <CalendarDays :size="16" aria-hidden="true" />
          <select
            id="gallery-time-range"
            v-model="timeRange"
            class="time-range-select"
            :aria-label="t('galleryTimeRange')"
          >
            <option v-for="option in timeRangeOptions" :key="option.id" :value="option.id">
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>

      <button
        type="button"
        class="btn-ghost clear-filters-btn"
        :disabled="!hasActiveFilters"
        @click="clearFilters"
      >
        <FilterX :size="16" />
        <span>{{ t('clearFilters') }}</span>
      </button>
    </aside>

    <section class="gallery-main" :aria-label="t('gallery')">
      <header class="gallery-toolbar">
        <div class="toolbar-title">
          <div class="title-icon">
            <ImageIcon :size="18" aria-hidden="true" />
          </div>
          <div>
            <h2>{{ t('gallery') }}</h2>
            <p>{{ t('imageCountText', { count: filteredItems.length }) }}</p>
          </div>
        </div>

        <div class="toolbar-actions">
          <div class="density-toggle" :aria-label="t('galleryDensity')">
            <button
              type="button"
              :class="['density-btn', { active: density === 'comfortable' }]"
              :aria-label="t('galleryDensityComfortable')"
              :title="t('galleryDensityComfortable')"
              :aria-pressed="density === 'comfortable'"
              @click="density = 'comfortable'"
            >
              <LayoutGrid :size="16" />
            </button>
            <button
              type="button"
              :class="['density-btn', { active: density === 'compact' }]"
              :aria-label="t('galleryDensityCompact')"
              :title="t('galleryDensityCompact')"
              :aria-pressed="density === 'compact'"
              @click="density = 'compact'"
            >
              <Columns3 :size="16" />
            </button>
          </div>

          <button type="button" class="btn-secondary back-btn" @click="goToChat">
            <ArrowLeft :size="16" />
            <span>{{ t('backToChat') }}</span>
          </button>
        </div>
      </header>

      <div v-if="isLoading" class="gallery-state">
        <ImageIcon :size="38" aria-hidden="true" />
        <p>{{ t('loading') }}</p>
      </div>

      <div v-else-if="filteredItems.length > 0" ref="galleryGridRef" class="gallery-grid">
        <div
          v-for="(column, columnIndex) in masonryColumns"
          :key="columnIndex"
          class="masonry-column"
        >
          <article v-for="item in column" :key="item.id" class="gallery-card">
            <button
              type="button"
              class="image-frame"
              :aria-label="t('expandImage')"
              @click="openPreview(item)"
            >
              <img
                :src="imageUrl(item)"
                :alt="item.prompt || t('generatedImageAlt')"
                class="gallery-image"
                loading="lazy"
              />
            </button>

            <div class="card-body">
              <p class="card-prompt">{{ item.prompt || t('noPrompt') }}</p>
              <div class="card-meta">
                <span>{{ sourceLabel(item) }}</span>
                <span>{{ formatTime(item.timestamp) }}</span>
              </div>
              <div class="card-actions">
                <button
                  type="button"
                  class="action-btn"
                  :title="t('download')"
                  :aria-label="t('download')"
                  @click="downloadImage(item)"
                >
                  <Download :size="15" />
                </button>
                <button
                  type="button"
                  class="action-btn"
                  :title="t('share')"
                  :aria-label="t('share')"
                  @click="shareImage(item)"
                >
                  <Share2 :size="15" />
                </button>
                <button
                  type="button"
                  class="action-btn"
                  :title="t('expandImage')"
                  :aria-label="t('expandImage')"
                  @click="openPreview(item)"
                >
                  <Maximize2 :size="15" />
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>

      <div v-else class="gallery-state">
        <ImageIcon :size="42" aria-hidden="true" />
        <h3>{{ emptyTitle }}</h3>
        <p>{{ emptyDescription }}</p>
      </div>
    </section>

    <Transition name="preview">
      <div
        v-if="previewItem"
        class="preview-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="t('previewImage')"
        @click.self="closePreview"
      >
        <div class="preview-shell">
          <div class="preview-media">
            <img
              :src="imageUrl(previewItem)"
              :alt="previewItem.prompt || t('generatedImageAlt')"
              class="preview-image"
            />
          </div>

          <aside class="preview-panel">
            <div class="preview-panel-header">
              <h3>{{ t('imageInfo') }}</h3>
              <button
                type="button"
                class="btn-icon preview-close"
                :aria-label="t('close')"
                :title="t('close')"
                @click="closePreview"
              >
                <X :size="18" />
              </button>
            </div>

            <dl class="preview-details">
              <div>
                <dt>{{ t('promptLabel') }}</dt>
                <dd>{{ previewItem.prompt || t('noPrompt') }}</dd>
              </div>
              <div>
                <dt>{{ t('sourceHistory') }}</dt>
                <dd>{{ sourceLabel(previewItem) }}</dd>
              </div>
              <div>
                <dt>{{ t('generatedAt') }}</dt>
                <dd>{{ formatTime(previewItem.timestamp) }}</dd>
              </div>
            </dl>

            <div class="preview-actions">
              <button type="button" class="btn-secondary" @click="downloadImage(previewItem)">
                <Download :size="16" />
                <span>{{ t('download') }}</span>
              </button>
              <button type="button" class="btn-secondary" @click="shareImage(previewItem)">
                <Share2 :size="16" />
                <span>{{ t('share') }}</span>
              </button>
            </div>
          </aside>
        </div>
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Columns3,
  Download,
  Filter,
  FilterX,
  ImageIcon,
  LayoutGrid,
  Maximize2,
  Search,
  Share2,
  Star,
  X,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useHistory } from '../../composables/useHistory'
import { useImageDownload } from '../../composables/useImageDownload'
import { useToast } from '../../composables/useToast'
import type { GalleryImageItem, GeneratedImage } from '../../types'
import { getImageRepository } from '../../platform/imageRepository'
import { isExternalImageUrl, isValidImageUrl } from '../../utils/images'

type ScopeFilter = 'all' | 'recent' | 'favorite'
type TimeRange = 'all' | 'today' | 'week' | 'month'
type Density = 'comfortable' | 'compact'

const router = useRouter()
const { t, locale } = useI18n()
const { loadGalleryImages } = useHistory()
const { downloadSingleImage } = useImageDownload()
const { success, error: showError } = useToast()

const galleryItems = ref<GalleryImageItem[]>([])
const displayImages = ref<Record<string, GeneratedImage>>({})
const isLoading = ref(true)
const searchQuery = ref('')
const activeScope = ref<ScopeFilter>('all')
const timeRange = ref<TimeRange>('all')
const density = ref<Density>('comfortable')
const previewItem = ref<GalleryImageItem | null>(null)
const galleryGridRef = ref<HTMLElement | null>(null)
const galleryGridWidth = ref(0)
const ownedObjectUrls = new Set<string>()
let galleryResizeObserver: ResizeObserver | null = null

const currentImageCount = computed(
  () => galleryItems.value.filter((item) => item.sourceType === 'current').length,
)

const historyImageCount = computed(
  () => galleryItems.value.filter((item) => item.sourceType === 'history').length,
)

const favoriteCount = computed(() => galleryItems.value.filter((item) => item.isFavorite).length)

const recentCount = computed(
  () => galleryItems.value.filter((item) => isRecent(item.timestamp)).length,
)

const scopeFilters = computed(() => [
  {
    id: 'all' as const,
    label: t('all'),
    icon: Filter,
    count: galleryItems.value.length,
  },
  {
    id: 'recent' as const,
    label: t('recent'),
    icon: Clock,
    count: recentCount.value,
  },
  {
    id: 'favorite' as const,
    label: t('favorite'),
    icon: Star,
    count: favoriteCount.value,
  },
])

const timeRangeOptions = computed(() => [
  { id: 'all' as const, label: t('galleryTimeAll') },
  { id: 'today' as const, label: t('galleryTimeToday') },
  { id: 'week' as const, label: t('galleryTimeWeek') },
  { id: 'month' as const, label: t('galleryTimeMonth') },
])

const filteredItems = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const cutoff = timeRangeCutoff(timeRange.value)

  return galleryItems.value
    .filter((item) => {
      if (activeScope.value === 'recent' && !isRecent(item.timestamp)) return false
      if (activeScope.value === 'favorite' && !item.isFavorite) return false
      if (cutoff !== null && item.timestamp < cutoff) return false

      if (!query) return true
      return item.prompt.toLowerCase().includes(query)
    })
    .sort((a, b) => b.timestamp - a.timestamp)
})

const masonryColumnCount = computed(() => {
  const tileSize = density.value === 'compact' ? 188 : 244
  const gap = 16
  const width = galleryGridWidth.value
  if (width <= 0) return 1
  return Math.max(1, Math.floor((width + gap) / (tileSize + gap)))
})

const masonryColumns = computed(() => {
  const columnCount = masonryColumnCount.value
  const columns = Array.from({ length: columnCount }, () => [] as GalleryImageItem[])
  const columnHeights = Array.from({ length: columnCount }, () => 0)
  const tileSize = density.value === 'compact' ? 188 : 244

  filteredItems.value.forEach((item) => {
    const targetColumn = columnHeights.indexOf(Math.min(...columnHeights))
    columns[targetColumn].push(item)
    columnHeights[targetColumn] += estimatedGalleryCardHeight(item, tileSize)
  })

  return columns
})

const hasActiveFilters = computed(
  () =>
    Boolean(searchQuery.value.trim()) || activeScope.value !== 'all' || timeRange.value !== 'all',
)

const emptyTitle = computed(() =>
  galleryItems.value.length === 0 ? t('galleryNoImagesTitle') : t('galleryNoResultsTitle'),
)

const emptyDescription = computed(() =>
  galleryItems.value.length === 0 ? t('galleryNoImagesHint') : t('galleryNoResultsHint'),
)

onMounted(() => {
  void refreshGalleryImages()
  window.addEventListener('resize', updateGalleryGridWidth)
})

onUnmounted(() => {
  revokeOwnedObjectUrls()
  galleryResizeObserver?.disconnect()
  window.removeEventListener('resize', updateGalleryGridWidth)
})

watch(
  () => filteredItems.value.length,
  async (count) => {
    if (count === 0) return
    await nextTick()
    setupGalleryResizeObserver()
    updateGalleryGridWidth()
  },
  { flush: 'post' },
)

async function refreshGalleryImages() {
  isLoading.value = true
  try {
    const items = await loadGalleryImages()
    galleryItems.value = items
    await resolveDisplayImages(items)
  } catch (err) {
    console.error('Failed to load gallery images:', err)
    showError(t('unknownError'))
  } finally {
    isLoading.value = false
    await nextTick()
    setupGalleryResizeObserver()
    updateGalleryGridWidth()
  }
}

async function resolveDisplayImages(items: GalleryImageItem[]) {
  revokeOwnedObjectUrls()
  const entries = await Promise.all(
    items.map(async (item) => {
      try {
        const resolved = await getImageRepository().resolveDisplayUrl(item.image)
        if (resolved.url.startsWith('blob:') && resolved.url !== item.image.url) {
          ownedObjectUrls.add(resolved.url)
        }
        return [item.id, resolved] as const
      } catch (err) {
        console.warn('Failed to resolve gallery image URL:', err)
        return [item.id, item.image] as const
      }
    }),
  )

  displayImages.value = Object.fromEntries(entries)
}

function revokeOwnedObjectUrls() {
  ownedObjectUrls.forEach((url) => {
    if (typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url)
    }
  })
  ownedObjectUrls.clear()
}

function isRecent(timestamp: number): boolean {
  return timestamp >= Date.now() - 24 * 60 * 60 * 1000
}

function timeRangeCutoff(range: TimeRange): number | null {
  if (range === 'all') return null

  const now = new Date()
  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  }

  const days = range === 'week' ? 7 : 30
  return Date.now() - days * 24 * 60 * 60 * 1000
}

function updateGalleryGridWidth() {
  galleryGridWidth.value = galleryGridRef.value?.clientWidth || 0
}

function setupGalleryResizeObserver() {
  galleryResizeObserver?.disconnect()
  galleryResizeObserver = null

  if (typeof ResizeObserver === 'undefined' || !galleryGridRef.value) return

  galleryResizeObserver = new ResizeObserver((entries) => {
    galleryGridWidth.value = entries[0]?.contentRect.width || 0
  })
  galleryResizeObserver.observe(galleryGridRef.value)
}

function estimatedGalleryCardHeight(item: GalleryImageItem, tileSize: number): number {
  const size = item.sourceMessage.generationSize
  const imageHeight =
    size === '1792x1024'
      ? tileSize * (1024 / 1792)
      : size === '1024x1792'
        ? tileSize * (1792 / 1024)
        : tileSize

  return imageHeight + 116
}

function displayImage(item: GalleryImageItem): GeneratedImage {
  return displayImages.value[item.id] || item.image
}

function imageUrl(item: GalleryImageItem): string {
  const url = displayImage(item).url
  if (!url || !isValidImageUrl(url)) return ''
  return url
}

function sourceLabel(item: GalleryImageItem): string {
  if (item.sourceHistoryTitle) return item.sourceHistoryTitle
  return t('currentChat')
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function clearFilters() {
  searchQuery.value = ''
  activeScope.value = 'all'
  timeRange.value = 'all'
}

async function goToChat() {
  await router.push({ name: 'chat' })
}

function openPreview(item: GalleryImageItem) {
  previewItem.value = item
}

function closePreview() {
  previewItem.value = null
}

async function downloadImage(item: GalleryImageItem) {
  await downloadSingleImage(displayImage(item))
}

async function shareImage(item: GalleryImageItem) {
  try {
    const image = displayImage(item)
    const url = imageUrl(item)
    if (!url) {
      showError(t('invalidImageLink'))
      return
    }

    if (navigator.share && !isExternalImageUrl(url)) {
      const blob = await getImageRepository().readImageBlob(image)
      const file = new File([blob], `ai-image-${image.id}.png`, { type: blob.type || 'image/png' })
      await navigator.share({
        title: t('generatedImageShareTitle'),
        text: item.prompt || t('generatedImageShareText'),
        files: [file],
      })
      return
    }

    if (navigator.share && isExternalImageUrl(url)) {
      await navigator.share({
        title: t('generatedImageShareTitle'),
        text: item.prompt || t('generatedImageShareText'),
        url,
      })
      return
    }

    await navigator.clipboard.writeText(url)
    success(t('imageLinkCopied'))
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      showError(t('shareFailed'))
    }
  }
}
</script>

<style scoped>
.gallery-workbench {
  --gallery-tile-size: 244px;
  display: grid;
  grid-template-columns: 286px minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-bg-secondary) 88%, transparent),
      transparent 45%
    ),
    var(--color-bg-primary);
  overflow: hidden;
}

.gallery-workbench.density-compact {
  --gallery-tile-size: 188px;
}

.gallery-sidebar {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
  padding: 18px;
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, var(--color-bg-primary));
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
}

.sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.filter-label {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0;
}

.search-input-wrapper,
.select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon,
.select-wrapper svg {
  position: absolute;
  left: 12px;
  color: var(--color-text-tertiary);
  pointer-events: none;
}

.gallery-search-input,
.time-range-select {
  width: 100%;
  height: 38px;
  padding: 0 12px 0 38px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-primary);
  font-size: 13px;
  outline: none;
  transition: all var(--transition-base);
}

.gallery-search-input:focus,
.time-range-select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.gallery-stats {
  display: grid;
  gap: 8px;
  padding: 12px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.stat-row strong {
  color: var(--color-text-primary);
  font-size: 14px;
}

.filter-stack {
  display: grid;
  gap: 8px;
}

.filter-btn {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  transition: all var(--transition-base);
}

.filter-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.filter-btn.active {
  border-color: color-mix(in srgb, var(--color-primary) 62%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary-light) 72%, var(--color-bg-primary));
  color: var(--color-primary-hover);
}

.filter-btn strong {
  color: currentColor;
  font-size: 12px;
}

.clear-filters-btn {
  justify-content: flex-start;
  margin-top: auto;
  border-radius: 8px;
}

.clear-filters-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.gallery-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.gallery-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 68px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-primary) 88%, transparent);
  backdrop-filter: blur(12px);
}

.toolbar-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-accent) 12%, var(--color-bg-primary));
  color: var(--color-accent);
  border: 1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-border));
}

.toolbar-title h2 {
  color: var(--color-text-primary);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

.toolbar-title p {
  color: var(--color-text-tertiary);
  font-size: 13px;
  line-height: 1.4;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.density-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.density-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.density-btn:hover,
.density-btn.active {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-sm);
}

.back-btn {
  height: 38px;
  padding-inline: 12px;
  border-radius: 8px;
}

.gallery-grid {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex: 1;
  min-height: 0;
  padding: 20px;
  overflow-y: auto;
}

.masonry-column {
  display: grid;
  flex: 1 1 0;
  gap: 16px;
  min-width: 0;
}

.gallery-card {
  display: block;
  position: relative;
  min-width: 0;
  overflow: hidden;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
  transition:
    border-color var(--transition-base),
    box-shadow var(--transition-base);
}

.gallery-card:hover {
  z-index: 1;
  border-color: var(--color-border-hover);
  box-shadow: var(--shadow-lg);
}

.image-frame {
  display: block;
  width: 100%;
  min-height: 148px;
  padding: 0;
  background: var(--color-bg-tertiary);
  border: 0;
  cursor: zoom-in;
  overflow: hidden;
  line-height: 0;
}

.gallery-image {
  display: block;
  width: 100%;
  height: auto;
}

.card-body {
  display: grid;
  gap: 10px;
  padding: 12px;
}

.card-prompt {
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.card-meta {
  display: grid;
  gap: 3px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  line-height: 1.35;
}

.card-meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 7px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.action-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.gallery-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 36px;
  color: var(--color-text-tertiary);
  text-align: center;
}

.gallery-state h3 {
  color: var(--color-text-primary);
  font-size: 17px;
  font-weight: 700;
}

.gallery-state p {
  max-width: 360px;
  font-size: 14px;
  line-height: 1.5;
}

.preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: rgb(0 0 0 / 0.82);
  backdrop-filter: blur(10px);
}

.preview-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
  gap: 18px;
  width: min(1180px, 100%);
  max-height: min(86vh, 840px);
}

.preview-media {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
}

.preview-image {
  display: block;
  max-width: 100%;
  max-height: min(86vh, 840px);
  border-radius: 8px;
  object-fit: contain;
  box-shadow: 0 24px 70px -32px rgb(0 0 0 / 0.7);
}

.preview-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 16px;
  background: color-mix(in srgb, var(--color-bg-primary) 94%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
  border-radius: 8px;
  box-shadow: var(--shadow-xl);
}

.preview-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-border);
}

.preview-panel-header h3 {
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: 700;
}

.preview-details {
  display: grid;
  gap: 14px;
  min-height: 0;
  padding: 14px 0;
  overflow-y: auto;
}

.preview-details dt {
  margin-bottom: 5px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0;
}

.preview-details dd {
  color: var(--color-text-primary);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.preview-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: auto;
}

.preview-actions .btn-secondary {
  height: 38px;
  padding-inline: 12px;
  border-radius: 8px;
}

.preview-enter-active,
.preview-leave-active {
  transition: opacity var(--transition-base);
}

.preview-enter-from,
.preview-leave-to {
  opacity: 0;
}

@media (max-width: 920px) {
  .gallery-workbench {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .gallery-sidebar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
    max-height: 300px;
  }

  .gallery-stats {
    align-self: start;
  }

  .clear-filters-btn {
    margin-top: 0;
  }

  .preview-shell {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .preview-panel {
    max-height: none;
  }
}

@media (max-width: 640px) {
  .gallery-sidebar {
    grid-template-columns: 1fr;
    max-height: 44vh;
    padding: 14px;
  }

  .gallery-toolbar {
    align-items: stretch;
    flex-direction: column;
    min-height: 0;
  }

  .toolbar-actions {
    justify-content: space-between;
  }

  .back-btn span {
    display: none;
  }

  .gallery-grid {
    gap: 14px;
    padding: 14px;
  }

  .masonry-column {
    gap: 14px;
  }

  .preview-overlay {
    padding: 14px;
  }

  .preview-actions {
    grid-template-columns: 1fr;
  }
}
</style>
