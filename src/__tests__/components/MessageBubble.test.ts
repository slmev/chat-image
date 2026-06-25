import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MessageBubble from '../../components/Chat/MessageBubble.vue'
import type { ChatMessage, GeneratedImage } from '../../types'

const mockState = vi.hoisted(() => ({
  retryMessage: vi.fn(),
  showError: vi.fn(),
  downloadMultipleImages: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key === 'generating' ? '正在生成图片' : key,
  }),
}))

vi.mock('../../composables/useChat', () => ({
  useChat: () => ({
    retryMessage: mockState.retryMessage,
  }),
}))

vi.mock('../../composables/useToast', () => ({
  useToast: () => ({
    error: mockState.showError,
  }),
}))

vi.mock('../../composables/useImageDownload', () => ({
  useImageDownload: () => ({
    downloadMultipleImages: mockState.downloadMultipleImages,
  }),
}))

function image(overrides: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    id: 'image-1',
    url: 'blob:image-1',
    timestamp: 1,
    ...overrides,
  }
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    type: 'assistant',
    content: '正在生成图片...',
    timestamp: 1,
    status: 'pending',
    ...overrides,
  }
}

function mountBubble(chatMessage: ChatMessage) {
  return mount(MessageBubble, {
    props: {
      message: chatMessage,
    },
    global: {
      stubs: {
        ImagePreview: {
          props: ['image'],
          template: '<div class="image-preview-stub">{{ image.id }}</div>',
        },
        MessageActions: {
          template: '<div class="message-actions-stub" />',
        },
        VariationDialog: true,
        ImageEditDialog: true,
        ConfirmModal: true,
      },
    },
  })
}

describe('MessageBubble generation display', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockState.retryMessage.mockReset()
    mockState.showError.mockReset()
    mockState.downloadMultipleImages.mockReset()
  })

  it('shows a glass placeholder and cancel action for pending assistant messages', async () => {
    const wrapper = mountBubble(message({
      generationSize: '1024x1792',
    }))

    const placeholder = wrapper.find('.generation-placeholder')

    expect(wrapper.text()).not.toContain('正在生成图片')
    expect(placeholder.exists()).toBe(true)
    expect(placeholder.attributes('role')).toBe('status')
    expect(placeholder.attributes('aria-label')).toBe('正在生成图片')
    expect(placeholder.attributes('style')).toContain('aspect-ratio: 9 / 16')

    await wrapper.find('.placeholder-cancel-btn').trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('uses the requested generation size for placeholder aspect ratio', () => {
    const wideWrapper = mountBubble(message({
      generationSize: '1792x1024',
    }))
    const defaultWrapper = mountBubble(message())

    expect(wideWrapper.find('.generation-placeholder').attributes('style')).toContain('aspect-ratio: 16 / 9')
    expect(defaultWrapper.find('.generation-placeholder').attributes('style')).toContain('aspect-ratio: 9 / 16')
  })

  it('renders generated images without a success text bubble', () => {
    const wrapper = mountBubble(message({
      content: '图片已生成',
      status: 'success',
      images: [image()],
    }))

    expect(wrapper.text()).not.toContain('图片已生成')
    expect(wrapper.find('.assistant-bubble').exists()).toBe(false)
    expect(wrapper.find('.image-preview-stub').exists()).toBe(true)
  })
})
