import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MessageBubble from '../../components/Chat/MessageBubble.vue'
import { useChatStore } from '../../stores/chat'
import type { ChatAttachment, ChatMessage, GeneratedImage, StyleTemplate } from '../../types'

const mockState = vi.hoisted(() => ({
  retryMessage: vi.fn(),
  showError: vi.fn(),
  downloadMultipleImages: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  createI18n: () => ({
    global: {
      t: (key: string) => key,
    },
  }),
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

function attachment(overrides: Partial<ChatAttachment> = {}): ChatAttachment {
  return {
    id: 'attachment-1',
    name: 'reference.png',
    url: 'blob:reference',
    timestamp: 1,
    ...overrides,
  }
}

function style(): StyleTemplate {
  return {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Cinematic lighting',
    promptSuffix: 'cinematic lighting, film still',
    icon: 'sparkles',
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

  it('renders user message attachments below the message bubble', () => {
    const wrapper = mountBubble(message({
      type: 'user',
      content: 'use these references',
      status: 'success',
      attachments: [
        attachment({ id: 'attachment-1', name: 'first.png', url: 'blob:first' }),
        attachment({ id: 'attachment-2', name: 'second.webp', url: 'blob:second' }),
      ],
    }))

    const thumbnails = wrapper.findAll('.user-attachment-image')
    expect(thumbnails).toHaveLength(2)
    expect(thumbnails[0].attributes('src')).toBe('blob:first')
    expect(thumbnails[0].attributes('alt')).toBe('first.png')
  })

  it('retries failed assistant messages with the previous user attachments', async () => {
    const reference = attachment()
    const selectedStyle = style()
    mockState.retryMessage.mockResolvedValueOnce(undefined)
    const chatStore = useChatStore()
    const userMessage = chatStore.addMessage({
      type: 'user',
      content: 'redesign this room',
      status: 'success',
      attachments: [reference],
    })
    const assistantMessage = chatStore.addMessage({
      type: 'assistant',
      content: '生成失败',
      status: 'error',
      error: '生成失败',
      generationSize: '1792x1024',
      generationQuality: 'hd',
      generationCount: 2,
      generationStyle: selectedStyle,
    })

    const wrapper = mountBubble(assistantMessage)
    await wrapper.find('.retry-btn').trigger('click')

    expect(userMessage.attachments).toEqual([reference])
    expect(mockState.retryMessage).toHaveBeenCalledWith(
      assistantMessage.id,
      'redesign this room',
      {
        size: '1792x1024',
        quality: 'hd',
        n: 2,
        style: selectedStyle,
      },
      [reference],
    )
  })
})
