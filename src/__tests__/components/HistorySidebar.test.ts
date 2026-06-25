import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import HistorySidebar from '../../components/Layout/HistorySidebar.vue'
import i18n from '../../i18n'
import type { ChatHistory } from '../../types'

const HISTORY_LIST_KEY = 'chat-image-history-list'

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

vi.mock('../../composables/useChat', () => ({
  useChat: () => ({
    clearChat: vi.fn(),
    loadChat: vi.fn(),
  }),
}))

function history(overrides: Partial<ChatHistory> = {}): ChatHistory {
  return {
    id: 'history-1',
    title: 'Original title',
    timestamp: Date.now(),
    messageCount: 1,
    isFavorite: false,
    ...overrides,
  }
}

function readHistoryList(): ChatHistory[] {
  return JSON.parse(localStorage.getItem(HISTORY_LIST_KEY) || '[]') as ChatHistory[]
}

describe('HistorySidebar rename', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.body.innerHTML = ''
    i18n.global.locale.value = 'zh-CN'
  })

  it('renames a saved conversation inline', async () => {
    localStorage.setItem(HISTORY_LIST_KEY, JSON.stringify([history()]))

    const wrapper = mount(HistorySidebar, {
      props: {
        isOpen: true,
      },
      global: {
        plugins: [i18n],
        stubs: {
          ConfirmModal: true,
        },
      },
    })
    await flushPromises()

    await wrapper.get('button[aria-label="重命名"]').trigger('click')
    const input = wrapper.get('input[aria-label="对话标题"]')
    await input.setValue('Renamed title')
    await input.trigger('keydown.enter')
    await flushPromises()

    expect(wrapper.text()).toContain('Renamed title')
    expect(readHistoryList()[0].title).toBe('Renamed title')
  })
})
