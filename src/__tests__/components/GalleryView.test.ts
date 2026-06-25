import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import GalleryView from '../../components/Gallery/GalleryView.vue'
import i18n from '../../i18n'
import { useChatStore } from '../../stores/chat'
import type { ChatHistory, ChatMessage, GeneratedImage } from '../../types'

const HISTORY_LIST_KEY = 'chat-image-history-list'
const HISTORY_MESSAGES_PREFIX = 'chat-image-history-messages-'

const mockState = vi.hoisted(() => ({
  downloadSingleImage: vi.fn(),
  success: vi.fn(),
  showError: vi.fn(),
  resolveDisplayUrl: vi.fn(async (image: GeneratedImage) => image),
  readImageBlob: vi.fn(async () => new Blob(['image'], { type: 'image/png' })),
}))

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('../../platform/metadataStore', () => ({
  HISTORY_LIST_KEY: 'chat-image-history-list',
  HISTORY_MESSAGES_PREFIX: 'chat-image-history-messages-',
  getDesktopChatHistory: vi.fn(async () => []),
  getMetadataValue: vi.fn(),
  initializeDesktopPersistence: vi.fn(),
  removeMetadataValue: vi.fn(),
  setMetadataValue: vi.fn(),
}))

vi.mock('../../platform/imageReferenceCleanup', () => ({
  deleteUnreferencedLocalImages: vi.fn(),
}))

vi.mock('../../composables/useImageDownload', () => ({
  useImageDownload: () => ({
    downloadSingleImage: mockState.downloadSingleImage,
  }),
}))

vi.mock('../../composables/useToast', () => ({
  useToast: () => ({
    success: mockState.success,
    error: mockState.showError,
  }),
}))

vi.mock('../../platform/imageRepository', () => ({
  getImageRepository: () => ({
    resolveDisplayUrl: mockState.resolveDisplayUrl,
    readImageBlob: mockState.readImageBlob,
  }),
}))

const now = new Date('2026-06-26T08:00:00.000Z').getTime()
const oldTimestamp = now - 10 * 24 * 60 * 60 * 1000

function image(overrides: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    id: 'image-1',
    url: 'blob:image-1',
    timestamp: now,
    sourcePrompt: 'silver moon over water',
    ...overrides,
  }
}

function message(id: string, images: GeneratedImage[], overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    type: 'assistant',
    content: id,
    timestamp: now,
    status: 'success',
    images,
    ...overrides,
  }
}

function history(id: string, overrides: Partial<ChatHistory> = {}): ChatHistory {
  return {
    id,
    title: 'Saved gallery',
    timestamp: now,
    messageCount: 1,
    isFavorite: false,
    ...overrides,
  }
}

async function mountGallery() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chat', component: { template: '<div />' } },
      { path: '/gallery', name: 'gallery', component: { template: '<div />' } },
    ],
  })
  await router.push('/gallery')
  await router.isReady()

  await useChatStore().importMessages([
    message('current-message', [
      image({
        id: 'current-image',
        url: 'blob:current-image',
        sourcePrompt: 'silver moon over water',
        timestamp: now,
      }),
    ]),
  ], 'replace')

  const savedHistory = history('history-1', {
    title: 'Saved red city',
    isFavorite: true,
  })
  localStorage.setItem(HISTORY_LIST_KEY, JSON.stringify([savedHistory]))
  localStorage.setItem(HISTORY_MESSAGES_PREFIX + savedHistory.id, JSON.stringify([
    message('duplicate-history-message', [
      image({
        id: 'current-image',
        url: 'blob:duplicate',
        sourcePrompt: 'duplicate image',
        timestamp: now - 1000,
      }),
    ]),
    message('history-message', [
      image({
        id: 'history-image',
        url: 'https://images.example.test/red-city.png',
        sourcePrompt: 'red city at night',
        timestamp: oldTimestamp,
      }),
    ]),
  ]))

  const wrapper = mount(GalleryView, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router, i18n],
    },
  })
  await flushPromises()

  return { wrapper, router }
}

describe('GalleryView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    localStorage.clear()
    document.body.innerHTML = ''
    i18n.global.locale.value = 'zh-CN'
    mockState.downloadSingleImage.mockReset()
    mockState.success.mockReset()
    mockState.showError.mockReset()
    mockState.resolveDisplayUrl.mockClear()
    mockState.readImageBlob.mockClear()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async () => undefined),
      },
    })
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('renders current and history images without showing duplicates', async () => {
    const { wrapper } = await mountGallery()

    expect(wrapper.findAll('.gallery-card')).toHaveLength(2)
    expect(wrapper.text()).toContain('silver moon over water')
    expect(wrapper.text()).toContain('red city at night')
    expect(wrapper.text()).toContain('全部图片')
    expect(wrapper.text()).toContain('当前对话')
    expect(wrapper.text()).toContain('历史记录')
  })

  it('filters by prompt search, favorites, and time range', async () => {
    const { wrapper } = await mountGallery()

    await wrapper.get('.gallery-search-input').setValue('silver')
    expect(wrapper.findAll('.gallery-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('silver moon over water')
    expect(wrapper.text()).not.toContain('red city at night')

    await wrapper.get('.clear-filters-btn').trigger('click')
    const favoriteButton = wrapper.findAll('.filter-btn')
      .find(button => button.text().includes('收藏'))
    if (!favoriteButton) throw new Error('Missing favorite filter')
    await favoriteButton.trigger('click')
    expect(wrapper.findAll('.gallery-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('red city at night')

    await wrapper.get('.clear-filters-btn').trigger('click')
    await wrapper.get('.time-range-select').setValue('week')
    expect(wrapper.findAll('.gallery-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('silver moon over water')
    expect(wrapper.text()).not.toContain('red city at night')
  })

  it('shows distinct empty states for no images and no matching filters', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'chat', component: { template: '<div />' } },
        { path: '/gallery', name: 'gallery', component: { template: '<div />' } },
      ],
    })
    await router.push('/gallery')
    await router.isReady()

    const emptyWrapper = mount(GalleryView, {
      global: {
        plugins: [pinia, router, i18n],
      },
    })
    await flushPromises()

    expect(emptyWrapper.text()).toContain('还没有图片')

    emptyWrapper.unmount()
    const { wrapper } = await mountGallery()
    await wrapper.get('.gallery-search-input').setValue('not-found')

    expect(wrapper.text()).toContain('没有匹配图片')
  })

  it('downloads, shares, and previews images from the card actions', async () => {
    const { wrapper } = await mountGallery()

    await wrapper.get('button[aria-label="下载"]').trigger('click')
    expect(mockState.downloadSingleImage).toHaveBeenCalledWith(expect.objectContaining({
      id: 'current-image',
    }))

    await wrapper.get('button[aria-label="分享"]').trigger('click')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('blob:current-image')
    expect(mockState.success).toHaveBeenCalledWith('图片链接已复制到剪贴板')

    await wrapper.get('.image-frame').trigger('click')
    expect(wrapper.find('.preview-overlay').exists()).toBe(true)
    expect(wrapper.text()).toContain('图片信息')
    expect(wrapper.text()).toContain('silver moon over water')
  })
})
