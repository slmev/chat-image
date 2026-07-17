import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Header from '../../components/Layout/Header.vue'
import i18n from '../../i18n'

const mockState = vi.hoisted(() => ({
  startNewChat: vi.fn(),
  clearChat: vi.fn(),
  routerPush: vi.fn(),
  showError: vi.fn(),
  isImportingMessages: false,
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockState.routerPush,
  }),
}))

vi.mock('../../composables/useChat', () => ({
  useChat: () => ({
    chatStore: {
      messageCount: 1,
      get isImportingMessages() {
        return mockState.isImportingMessages
      },
    },
    startNewChat: mockState.startNewChat,
    clearChat: mockState.clearChat,
  }),
}))

vi.mock('../../composables/useToast', () => ({
  useToast: () => ({
    error: mockState.showError,
  }),
}))

describe('Header failure feedback', () => {
  beforeEach(() => {
    mockState.startNewChat.mockReset()
    mockState.startNewChat.mockResolvedValue(undefined)
    mockState.clearChat.mockReset()
    mockState.clearChat.mockResolvedValue(undefined)
    mockState.routerPush.mockReset()
    mockState.routerPush.mockResolvedValue(undefined)
    mockState.showError.mockReset()
    mockState.isImportingMessages = false
    i18n.global.locale.value = 'zh-CN'
  })

  function mountHeader() {
    return mount(Header, {
      global: {
        plugins: [i18n],
        stubs: {
          ConfigSwitcher: true,
          ThemeToggle: true,
          ExportImportPanel: true,
          ConfirmModal: {
            props: ['isOpen'],
            emits: ['confirm', 'cancel'],
            template:
              '<div v-if="isOpen" class="confirm-stub"><button class="confirm-action" @click="$emit(\'confirm\')">confirm</button></div>',
          },
        },
      },
    })
  }

  it('shows a toast when starting a new chat fails', async () => {
    mockState.startNewChat.mockRejectedValueOnce(new Error('start failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const wrapper = mountHeader()

    await wrapper.get('button[aria-label="新对话"]').trigger('click')
    await flushPromises()

    expect(mockState.showError).toHaveBeenCalledWith('新建对话失败')
    consoleError.mockRestore()
  })

  it('shows a toast when clearing the current chat fails', async () => {
    mockState.clearChat.mockRejectedValueOnce(new Error('clear failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const wrapper = mountHeader()

    await wrapper.get('button[aria-label="清空对话"]').trigger('click')
    await wrapper.get('.confirm-action').trigger('click')
    await flushPromises()

    expect(mockState.showError).toHaveBeenCalledWith('清空对话失败')
    consoleError.mockRestore()
  })

  it('disables new and clear chat actions while importing', () => {
    mockState.isImportingMessages = true
    const wrapper = mountHeader()

    expect(wrapper.get('button[aria-label="新对话"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button[aria-label="清空对话"]').attributes('disabled')).toBeDefined()
  })
})
