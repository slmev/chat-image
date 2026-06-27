import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatInput from '../../components/Chat/ChatInput.vue'

const mockState = vi.hoisted(() => ({
  showError: vi.fn(),
  addStyle: vi.fn(),
  deleteStyle: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('../../platform/metadataStore', () => ({
  getMetadataValue: vi.fn(),
  setMetadataValue: vi.fn(),
}))

vi.mock('../../composables/useToast', () => ({
  useToast: () => ({
    error: mockState.showError,
  }),
}))

vi.mock('../../composables/useCustomStyles', async () => {
  const { ref } = await import('vue')
  return {
    useCustomStyles: () => ({
      customStyles: ref([]),
      addStyle: mockState.addStyle,
      deleteStyle: mockState.deleteStyle,
    }),
  }
})

function mountInput() {
  return mount(ChatInput, {
    global: {
      stubs: {
        PromptPanel: true,
        PromptSuggest: true,
        CustomStyleDialog: true,
      },
    },
  })
}

async function selectFiles(wrapper: ReturnType<typeof mountInput>, files: File[]) {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: files,
  })
  await input.trigger('change')
}

async function addFilesFromParent(wrapper: ReturnType<typeof mountInput>, files: File[]) {
  const exposed = wrapper.vm as unknown as { addAttachmentFiles: (files: File[]) => void }
  exposed.addAttachmentFiles(files)
  await wrapper.vm.$nextTick()
}

describe('ChatInput attachments', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    mockState.showError.mockReset()
    mockState.addStyle.mockReset()
    mockState.deleteStyle.mockReset()
    createObjectURL = vi.fn((file: File) => `blob:${file.name}`)
    revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(callback, 0),
    })
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(callback, 0),
    })
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      value: (id: number) => window.clearTimeout(id),
    })
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
      configurable: true,
      value: (id: number) => window.clearTimeout(id),
    })
  })

  it('previews selected attachments, removes one, and emits remaining files on send', async () => {
    const wrapper = mountInput()
    const first = new File(['first'], 'first.png', { type: 'image/png' })
    const second = new File(['second'], 'second.webp', { type: 'image/webp' })

    await selectFiles(wrapper, [first, second])

    expect(wrapper.findAll('.attachment-thumb')).toHaveLength(2)
    expect(wrapper.findAll('.attachment-preview')[0].attributes('src')).toBe('blob:first.png')

    await wrapper.find('.attachment-remove').trigger('click')
    expect(wrapper.findAll('.attachment-thumb')).toHaveLength(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first.png')

    await wrapper.find('textarea').setValue('make a new scene')
    await wrapper.find('.send-btn').trigger('click')

    const event = wrapper.emitted('send')?.[0]
    expect(event?.[0]).toBe('make a new scene')
    expect(event?.[2]).toEqual([second])
    expect(wrapper.findAll('.attachment-thumb')).toHaveLength(0)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second.webp')
  })

  it('accepts attachments added by a parent paste handler', async () => {
    const wrapper = mountInput()
    const pasted = new File(['pasted'], 'pasted.png', { type: 'image/png' })

    await addFilesFromParent(wrapper, [pasted])

    expect(wrapper.findAll('.attachment-thumb')).toHaveLength(1)
    expect(wrapper.find('.attachment-preview').attributes('src')).toBe('blob:pasted.png')

    await wrapper.find('textarea').setValue('use pasted reference')
    await wrapper.find('.send-btn').trigger('click')

    const event = wrapper.emitted('send')?.[0]
    expect(event?.[2]).toEqual([pasted])
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:pasted.png')
  })

  it('validates attachment type, size, and count', async () => {
    const wrapper = mountInput()
    const pdf = new File(['pdf'], 'brief.pdf', { type: 'application/pdf' })
    const large = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', {
      type: 'image/png',
    })

    await selectFiles(wrapper, [pdf, large])

    expect(wrapper.findAll('.attachment-thumb')).toHaveLength(0)
    expect(mockState.showError).toHaveBeenCalledWith('attachmentInvalidType')
    expect(mockState.showError).toHaveBeenCalledWith('attachmentTooLarge')

    await selectFiles(
      wrapper,
      Array.from(
        { length: 5 },
        (_, index) => new File(['ok'], `reference-${index}.png`, { type: 'image/png' }),
      ),
    )

    expect(wrapper.findAll('.attachment-thumb')).toHaveLength(4)
    expect(mockState.showError).toHaveBeenCalledWith('attachmentLimit')
  })
})
