import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ChatContainer from '../../components/Chat/ChatContainer.vue'
import { useConfigStore } from '../../stores/config'
import type { ChatMessage } from '../../types'

const mockState = vi.hoisted(() => ({
  showError: vi.fn(),
  sendMessage: vi.fn(),
  cancelCurrentGeneration: vi.fn(),
  startNewChat: vi.fn(),
  deleteMessage: vi.fn(),
  toggleFavorite: vi.fn(),
  clearSearch: vi.fn(),
  addStyle: vi.fn(),
  deleteStyle: vi.fn(),
  chatStore: {
    messages: [] as ChatMessage[],
    isLoading: false,
  },
}))

vi.mock('vue-i18n', () => ({
  createI18n: () => ({
    global: {
      t: (key: string) => key,
    },
  }),
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

vi.mock('../../composables/useChat', () => ({
  useChat: () => ({
    chatStore: mockState.chatStore,
    sendMessage: mockState.sendMessage,
    cancelCurrentGeneration: mockState.cancelCurrentGeneration,
    startNewChat: mockState.startNewChat,
  }),
}))

vi.mock('../../composables/useHistory', () => ({
  useHistory: () => ({
    searchQuery: '',
    showFavoritesOnly: false,
    filteredMessages: mockState.chatStore.messages,
    deleteMessage: mockState.deleteMessage,
    toggleFavorite: mockState.toggleFavorite,
    clearSearch: mockState.clearSearch,
  }),
}))

vi.mock('../../composables/usePromptSuggestions', () => ({
  usePromptSuggestions: () => ({
    templates: {
      value: [
        { id: 'people-1', category: 'people', title: 'People', prompt: 'people' },
        { id: 'landscape-1', category: 'landscape', title: 'Landscape', prompt: 'landscape' },
        { id: 'animals-1', category: 'animals', title: 'Animals', prompt: 'animals' },
        { id: 'abstract-1', category: 'abstract', title: 'Abstract', prompt: 'abstract' },
      ],
    },
  }),
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

const mountedWrappers: VueWrapper[] = []

mockState.chatStore = reactive(mockState.chatStore)

async function mountContainer() {
  const pinia = createPinia()
  setActivePinia(pinia)
  await useConfigStore().saveConfig({
    endpoint: 'https://api.example.test',
    apiKey: 'sk-test',
    model: 'gpt-image-2',
  })

  const wrapper = mount(ChatContainer, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
      stubs: {
        SearchBar: true,
        MessageBubble: true,
        PromptPanel: true,
        PromptSuggest: true,
        CustomStyleDialog: true,
      },
    },
  })
  mountedWrappers.push(wrapper)
  await wrapper.vm.$nextTick()
  return wrapper
}

function pasteEvent(files: File[] = [], types: string[] = []): ClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    configurable: true,
    value: {
      files,
      items: files.map((file) => ({
        kind: 'file',
        getAsFile: () => file,
      })),
      types,
    },
  })
  return event
}

describe('ChatContainer clipboard attachments', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    vi.clearAllMocks()
    mockState.chatStore.messages.splice(0)
    mockState.chatStore.isLoading = false
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((file: File) => `blob:${file.name}`),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
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

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
      wrapper.unmount()
    }
    document.body.innerHTML = ''
  })

  it('adds pasted image files as chat input attachments', async () => {
    const wrapper = await mountContainer()
    const file = new File(['image'], 'clipboard.png', { type: 'image/png' })
    const event = pasteEvent([file])

    document.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.findAll('.attachment-thumb')).toHaveLength(1)
    expect(wrapper.find('.attachment-preview').attributes('src')).toBe('blob:clipboard.png')
  })

  it('leaves plain text paste untouched', async () => {
    const wrapper = await mountContainer()
    const event = pasteEvent([], ['text/plain'])

    document.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    expect(event.defaultPrevented).toBe(false)
    expect(wrapper.findAll('.attachment-thumb')).toHaveLength(0)
  })

  it('ignores pasted images inside dialogs', async () => {
    const wrapper = await mountContainer()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const input = document.createElement('input')
    dialog.appendChild(input)
    document.body.appendChild(dialog)
    const file = new File(['image'], 'dialog.png', { type: 'image/png' })
    const event = pasteEvent([file])

    input.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    expect(event.defaultPrevented).toBe(false)
    expect(wrapper.findAll('.attachment-thumb')).toHaveLength(0)
  })

  it('shows a toast when sending a message fails', async () => {
    mockState.sendMessage.mockRejectedValueOnce(new Error('send failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const wrapper = await mountContainer()

    await wrapper.get('.quick-start-card').trigger('click')
    await flushPromises()

    expect(mockState.showError).toHaveBeenCalledWith('sendMessageFailed')
    consoleError.mockRestore()
  })

  it('scrolls to the bottom when sent messages are appended', async () => {
    mockState.sendMessage.mockImplementationOnce(async (content: string) => {
      mockState.chatStore.messages.push(
        {
          id: 'user-message',
          type: 'user',
          content,
          timestamp: 1,
          status: 'success',
          isFavorite: false,
        },
        {
          id: 'assistant-message',
          type: 'assistant',
          content: 'generationInProgress',
          timestamp: 2,
          status: 'pending',
          isFavorite: false,
        },
      )
    })
    const wrapper = await mountContainer()
    const messagesArea = wrapper.get('.messages-area').element as HTMLElement
    Object.defineProperty(messagesArea, 'scrollHeight', {
      configurable: true,
      value: 720,
    })

    await wrapper.get('.quick-start-card').trigger('click')
    await flushPromises()

    expect(messagesArea.scrollTop).toBe(720)
  })
})
