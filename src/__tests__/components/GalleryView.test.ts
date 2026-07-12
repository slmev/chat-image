import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import GalleryView from '../../components/Gallery/GalleryView.vue'
import i18n from '../../i18n'
import { useChatStore } from '../../stores/chat'
import { putWebHistoryRecord } from '../../platform/webPersistence'
import type { ChatHistory, ChatMessage, GeneratedImage, GenerationMetadata } from '../../types'

const mockState = vi.hoisted(() => ({
  downloadSingleImage: vi.fn(),
  downloadMultipleImages: vi.fn(async (_images: GeneratedImage[]) => undefined),
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
    downloadMultipleImages: mockState.downloadMultipleImages,
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

const now = Date.now()
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

function generation(
  prompt: string,
  overrides: Partial<GenerationMetadata> = {},
): GenerationMetadata {
  return {
    prompt,
    size: '1024x1024',
    quality: 'auto',
    n: 1,
    attachmentIds: [],
    ...overrides,
  }
}

function message(
  id: string,
  images: GeneratedImage[],
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  const prompt = images[0]?.sourcePrompt || id
  return {
    id,
    type: 'assistant',
    content: id,
    timestamp: now,
    status: 'success',
    images,
    generation: generation(prompt),
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

  await useChatStore().importMessages(
    [
      message('current-message', [
        image({
          id: 'current-image',
          url: 'blob:current-image',
          sourcePrompt: 'silver moon over water',
          timestamp: now,
        }),
      ]),
    ],
    'replace',
  )

  const savedHistory = history('history-1', {
    title: 'Saved red city',
    isFavorite: true,
  })
  await putWebHistoryRecord(savedHistory, [
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
  ])

  const wrapper = mount(GalleryView, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router, i18n],
    },
  })
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.findAll('.gallery-card')).toHaveLength(2))

  return { wrapper, router }
}

// ConfirmModal 通过 Teleport 渲染到 body，点击其确认按钮需从 document 查询。
async function confirmDeletion() {
  await vi.waitFor(() => {
    if (!document.querySelector('.confirm-overlay')) throw new Error('Confirm modal not open')
  })
  const confirmButton = document.querySelector<HTMLButtonElement>('.confirm-actions .btn-primary')
  if (!confirmButton) throw new Error('Missing confirm button')
  confirmButton.click()
}

describe('GalleryView', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    i18n.global.locale.value = 'zh-CN'
    mockState.downloadSingleImage.mockReset()
    mockState.downloadMultipleImages.mockReset()
    mockState.downloadMultipleImages.mockResolvedValue(undefined)
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
    const favoriteButton = wrapper
      .findAll('.filter-btn')
      .find((button) => button.text().includes('收藏'))
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
    await vi.waitFor(() => expect(emptyWrapper.text()).toContain('还没有图片'))

    emptyWrapper.unmount()
    const { wrapper } = await mountGallery()
    await wrapper.get('.gallery-search-input').setValue('not-found')

    expect(wrapper.text()).toContain('没有匹配图片')
  })

  it('downloads, shares, and previews images from the card actions', async () => {
    const { wrapper } = await mountGallery()

    await wrapper.get('button[aria-label="下载"]').trigger('click')
    expect(mockState.downloadSingleImage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'current-image',
      }),
    )

    await wrapper.get('button[aria-label="分享"]').trigger('click')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('blob:current-image')
    expect(mockState.success).toHaveBeenCalledWith('图片链接已复制到剪贴板')

    await wrapper.get('.image-frame').trigger('click')
    expect(wrapper.find('.preview-overlay').exists()).toBe(true)
    expect(wrapper.find('.preview-panel').exists()).toBe(false)

    await wrapper.get('button[aria-label="图片信息"]').trigger('click')

    expect(wrapper.find('.preview-panel').exists()).toBe(true)
    expect(wrapper.find('.preview-panel').text()).toContain('silver moon over water')
  })

  it('toggles favorite on a current-chat image and persists to the store', async () => {
    const { wrapper } = await mountGallery()
    const chatStore = useChatStore()

    // 当前对话图片默认未收藏。
    const favoriteButton = wrapper.get('button[aria-label="收藏"]')
    await favoriteButton.trigger('click')
    await flushPromises()

    const message = chatStore.messages.find((msg) => msg.id === 'current-message')
    expect(message?.isFavorite).toBe(true)

    // 现在应显示为已收藏（可取消收藏）。
    expect(wrapper.find('button[aria-label="取消收藏"]').exists()).toBe(true)
  })

  it('deletes a single image after confirmation', async () => {
    const { wrapper } = await mountGallery()
    const chatStore = useChatStore()
    expect(wrapper.findAll('.gallery-card')).toHaveLength(2)

    // 删除当前对话图片。
    const deleteButton = wrapper
      .findAll('.card-actions button[aria-label="删除"]')
      .at(0)
    if (!deleteButton) throw new Error('Missing delete button')
    await deleteButton.trigger('click')

    // 确认弹窗 Teleport 到 body，需从 document 查询。
    await confirmDeletion()

    // 删除经过 IndexedDB 异步链，轮询直到卡片减少。
    await vi.waitFor(() => expect(wrapper.findAll('.gallery-card')).toHaveLength(1))
    // 助手消息删空后整条移除。
    expect(chatStore.messages.find((msg) => msg.id === 'current-message')).toBeUndefined()
    expect(wrapper.text()).not.toContain('silver moon over water')
  })

  it('supports multi-select with bulk download and delete', async () => {
    const { wrapper } = await mountGallery()

    await wrapper.get('.select-btn').trigger('click')
    expect(wrapper.find('.selection-bar').exists()).toBe(true)

    // 全选。
    await wrapper.get('.selection-toggle').trigger('click')
    expect(wrapper.text()).toContain('已选 2 张')

    // 批量下载。
    const downloadButton = wrapper
      .findAll('.selection-actions button')
      .find((button) => button.text().includes('下载'))
    if (!downloadButton) throw new Error('Missing bulk download button')
    await downloadButton.trigger('click')
    await flushPromises()
    expect(mockState.downloadMultipleImages).toHaveBeenCalledTimes(1)
    expect(mockState.downloadMultipleImages.mock.calls[0][0]).toHaveLength(2)

    // 批量删除。
    const bulkDeleteButton = wrapper
      .findAll('.selection-actions button')
      .find((button) => button.text().includes('删除'))
    if (!bulkDeleteButton) throw new Error('Missing bulk delete button')
    await bulkDeleteButton.trigger('click')
    await confirmDeletion()

    await vi.waitFor(() => expect(wrapper.findAll('.gallery-card')).toHaveLength(0))
    expect(mockState.success).toHaveBeenCalledWith('已删除 2 张图片')
  })

  it('sorts images by oldest first', async () => {
    const { wrapper } = await mountGallery()

    // 默认最新优先：silver moon (now) 在前。
    const promptsNewest = wrapper.findAll('.card-prompt').map((node) => node.text())
    expect(promptsNewest[0]).toContain('silver moon over water')

    await wrapper.get('.sort-select').setValue('oldest')
    const promptsOldest = wrapper.findAll('.card-prompt').map((node) => node.text())
    expect(promptsOldest[0]).toContain('red city at night')
  })
})
