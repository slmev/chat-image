import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MessageBubble from '../../components/Chat/MessageBubble.vue'
import type {
  ChatAttachment,
  ChatMessage,
  GeneratedImage,
  GenerationMetadata,
  StyleTemplate,
} from '../../types'

const mockState = vi.hoisted(() => ({
  retryGeneration: vi.fn(),
  editUserPrompt: vi.fn(),
  showSuccess: vi.fn(),
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
    t: (key: string) => (key === 'generating' ? '正在生成图片' : key),
  }),
}))

vi.mock('../../composables/useChat', () => ({
  useChat: () => ({
    retryGeneration: mockState.retryGeneration,
    editUserPrompt: mockState.editUserPrompt,
  }),
}))

vi.mock('../../composables/useToast', () => ({
  useToast: () => ({
    success: mockState.showSuccess,
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

function generation(overrides: Partial<GenerationMetadata> = {}): GenerationMetadata {
  return {
    prompt: 'redesign this room',
    size: 'auto',
    quality: 'auto',
    n: 1,
    attachmentIds: [],
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
          template:
            '<button class="image-preview-stub" @click="$emit(\'imageLoad\')">{{ image.id }}</button>',
        },
        MessageActions: {
          props: {
            messageId: {
              type: String,
              required: true,
            },
            canEditPrompt: {
              type: Boolean,
              default: false,
            },
          },
          template:
            '<div class="message-actions-stub"><button v-if="canEditPrompt" class="edit-prompt-stub" @click="$emit(\'editPrompt\', messageId)">edit</button></div>',
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
    mockState.retryGeneration.mockReset()
    mockState.editUserPrompt.mockReset()
    mockState.showSuccess.mockReset()
    mockState.showError.mockReset()
    mockState.downloadMultipleImages.mockReset()
  })

  it('shows a glass placeholder and cancel action for pending assistant messages', async () => {
    const wrapper = mountBubble(
      message({
        generation: generation({ size: '1024x1792' }),
      }),
    )

    const placeholder = wrapper.find('.generation-placeholder')

    expect(wrapper.text()).not.toContain('正在生成图片')
    expect(placeholder.exists()).toBe(true)
    expect(placeholder.attributes('role')).toBe('status')
    expect(placeholder.attributes('aria-label')).toBe('正在生成图片')
    expect(placeholder.attributes('style')).toContain('aspect-ratio: 1024 / 1792')

    await wrapper.find('.placeholder-cancel-btn').trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('uses the requested generation size for placeholder aspect ratio', () => {
    const wideWrapper = mountBubble(
      message({
        generation: generation({ size: '2048x1152' }),
      }),
    )
    const customWrapper = mountBubble(
      message({
        generation: generation({ size: '1234x777' }),
      }),
    )
    const defaultWrapper = mountBubble(message())

    expect(wideWrapper.find('.generation-placeholder').attributes('style')).toContain(
      'aspect-ratio: 2048 / 1152',
    )
    expect(customWrapper.find('.generation-placeholder').attributes('style')).toContain(
      'aspect-ratio: 1234 / 777',
    )
    expect(defaultWrapper.find('.generation-placeholder').attributes('style')).toContain(
      'aspect-ratio: 1 / 1',
    )
  })

  it('renders generated images without a success text bubble', () => {
    const wrapper = mountBubble(
      message({
        content: '图片已生成',
        status: 'success',
        images: [image()],
      }),
    )

    expect(wrapper.text()).not.toContain('图片已生成')
    expect(wrapper.find('.assistant-bubble').exists()).toBe(false)
    expect(wrapper.find('.image-preview-stub').exists()).toBe(true)
  })

  it('forwards generated image load events with the message id', async () => {
    const assistantMessage = message({
      id: 'assistant-message',
      content: '图片已生成',
      status: 'success',
      images: [image()],
    })
    const wrapper = mountBubble(assistantMessage)

    await wrapper.find('.image-preview-stub').trigger('click')

    expect(wrapper.emitted('imageLoad')?.[0]).toEqual(['assistant-message'])
  })

  it('renders user message attachments below the message bubble', () => {
    const wrapper = mountBubble(
      message({
        type: 'user',
        content: 'use these references',
        status: 'success',
        attachments: [
          attachment({ id: 'attachment-1', name: 'first.png', url: 'blob:first' }),
          attachment({ id: 'attachment-2', name: 'second.webp', url: 'blob:second' }),
        ],
      }),
    )

    const thumbnails = wrapper.findAll('.user-attachment-image')
    expect(thumbnails).toHaveLength(2)
    expect(thumbnails[0].attributes('src')).toBe('blob:first')
    expect(thumbnails[0].attributes('alt')).toBe('first.png')
  })

  it('edits user prompt text inline from the conversation record', async () => {
    mockState.editUserPrompt.mockResolvedValueOnce(undefined)
    const userMessage = message({
      type: 'user',
      content: 'original prompt',
      status: 'success',
    })

    const wrapper = mountBubble(userMessage)
    await wrapper.find('.edit-prompt-stub').trigger('click')

    const textarea = wrapper.find('.prompt-edit-textarea')
    expect(textarea.exists()).toBe(true)

    await textarea.setValue('updated prompt')
    await wrapper.findAll('.prompt-edit-btn')[0].trigger('click')

    expect(mockState.editUserPrompt).toHaveBeenCalledWith(userMessage.id, 'updated prompt')
  })

  it('retries failed assistant messages from stored generation metadata', async () => {
    const reference = attachment()
    const selectedStyle = style()
    mockState.retryGeneration.mockResolvedValueOnce(undefined)
    const storedGeneration = generation({
      size: '1792x1024',
      quality: 'high',
      n: 2,
      styleId: selectedStyle.id,
      styleName: selectedStyle.name,
      style: selectedStyle,
      attachmentIds: [reference.id],
      attachments: [reference],
    })
    const assistantMessage = message({
      type: 'assistant',
      content: '生成失败',
      status: 'error',
      error: '生成失败',
      generation: storedGeneration,
    })

    const wrapper = mountBubble(assistantMessage)
    await wrapper.find('.retry-btn').trigger('click')

    expect(mockState.retryGeneration).toHaveBeenCalledWith(assistantMessage.id, storedGeneration)
  })
})
