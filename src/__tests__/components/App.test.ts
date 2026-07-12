import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '../../App.vue'
import i18n from '../../i18n'
import { router } from '../../router'

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('../../platform/metadataStore', () => ({
  initializeDesktopPersistence: vi.fn(),
  getMetadataValue: vi.fn(),
  removeMetadataValue: vi.fn(),
  setMetadataValue: vi.fn(),
}))

vi.mock('../../components/Chat/ChatContainer.vue', () => ({
  default: {
    name: 'ChatContainerStub',
    template: '<section id="main-content" class="chat-route-stub">chat</section>',
  },
}))

vi.mock('../../components/Config/SettingsPage.vue', () => ({
  __esModule: true,
  default: {
    name: 'SettingsPageStub',
    template: '<section id="main-content" class="settings-route-stub">settings</section>',
  },
}))

vi.mock('../../components/Config/ConfigModal.vue', () => ({
  __esModule: true,
  default: {
    name: 'ConfigModalStub',
    emits: ['close'],
    template:
      '<div class="config-guide-stub"><button @click="$emit(\'close\')">close</button></div>',
  },
}))

vi.mock('../../components/Layout/HistorySidebar.vue', () => ({
  __esModule: true,
  default: {
    name: 'HistorySidebarStub',
    props: ['isOpen'],
    template: '<aside class="history-sidebar-stub">history</aside>',
  },
}))

vi.mock('../../components/Gallery/GalleryView.vue', () => ({
  __esModule: true,
  default: {
    name: 'GalleryViewStub',
    template: '<section id="main-content" class="gallery-view-stub">gallery</section>',
  },
}))

vi.mock('../../components/Common/ToastNotification.vue', () => ({
  default: {
    name: 'ToastNotificationStub',
    template: '<div />',
  },
}))

vi.mock('../../components/Common/UpdatePrompt.vue', () => ({
  default: {
    name: 'UpdatePromptStub',
    template: '<div />',
  },
}))

const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}))
const mountedWrappers: VueWrapper[] = []

async function mountApp(initialPath = '/') {
  await router.push(initialPath)
  const wrapper = mount(App, {
    attachTo: document.body,
    global: {
      plugins: [createPinia(), router, i18n],
    },
  })
  await router.isReady()
  await flushPromises()
  await vi.waitFor(() => expect(wrapper.find('.persistence-state').exists()).toBe(false))
  mountedWrappers.push(wrapper)
  return wrapper
}

describe('App routing and setup guide', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    i18n.global.locale.value = 'zh-CN'
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    })
  })

  afterEach(async () => {
    for (const wrapper of mountedWrappers.splice(0)) {
      wrapper.unmount()
    }
    document.body.innerHTML = ''
    await router.push('/')
    vi.clearAllMocks()
  })

  it('opens the settings page from the header settings action', async () => {
    const wrapper = await mountApp('/')

    await wrapper.get('button[aria-label="API 配置"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('settings')
    expect(wrapper.find('.settings-route-stub').exists()).toBe(true)
  })

  it('shows the setup guide on chat when no config exists', async () => {
    const wrapper = await mountApp('/')

    expect(wrapper.find('.chat-route-stub').exists()).toBe(true)
    expect(wrapper.find('.config-guide-stub').exists()).toBe(true)
  })

  it('does not show the setup guide on the settings page', async () => {
    const wrapper = await mountApp('/settings')

    expect(wrapper.find('.settings-route-stub').exists()).toBe(true)
    expect(wrapper.find('.config-guide-stub').exists()).toBe(false)
  })

  it('opens the gallery page from the header gallery action', async () => {
    const wrapper = await mountApp('/')

    await wrapper.get('button[aria-label="图片画廊"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('gallery')
    expect(wrapper.find('.gallery-view-stub').exists()).toBe(true)
  })

  it('renders the gallery page directly without the setup guide', async () => {
    const wrapper = await mountApp('/gallery')

    expect(router.currentRoute.value.name).toBe('gallery')
    expect(wrapper.find('.gallery-view-stub').exists()).toBe(true)
    expect(wrapper.find('.config-guide-stub').exists()).toBe(false)
  })

  it('returns to chat and opens history from settings', async () => {
    const wrapper = await mountApp('/settings')

    await wrapper.get('button[aria-label="历史记录"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('chat')
    expect(wrapper.find('.history-sidebar-stub').exists()).toBe(true)
  })

  it('returns to chat and opens history from gallery', async () => {
    const wrapper = await mountApp('/gallery')

    await wrapper.get('button[aria-label="历史记录"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('chat')
    expect(wrapper.find('.history-sidebar-stub').exists()).toBe(true)
  })

  it('returns to chat from settings when starting a new chat', async () => {
    const wrapper = await mountApp('/settings')

    await wrapper.get('button[aria-label="新对话"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('chat'))
  })
})
