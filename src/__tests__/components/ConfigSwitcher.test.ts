import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ConfigSwitcher from '../../components/Config/ConfigSwitcher.vue'
import { useConfigStore } from '../../stores/config'

const mockState = vi.hoisted(() => ({
  routerPush: vi.fn(),
  success: vi.fn(),
  showError: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockState.routerPush,
  }),
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
  removeMetadataValue: vi.fn(),
  setMetadataValue: vi.fn(),
}))

vi.mock('../../composables/useToast', () => ({
  useToast: () => ({
    success: mockState.success,
    error: mockState.showError,
  }),
}))

async function seedConfigs(count: number): Promise<void> {
  const store = useConfigStore()
  for (let index = 0; index < count; index += 1) {
    await store.addConfig({
      name: `Config ${index + 1}`,
      endpoint: `https://api.example.test/${index + 1}`,
      apiKey: `sk-${index + 1}`,
      model: `model-${index + 1}`,
    })
  }
}

function mountSwitcher(variant: 'header' | 'inline' = 'header') {
  return mount(ConfigSwitcher, {
    attachTo: document.body,
    props: { variant },
  })
}

describe('ConfigSwitcher', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockState.routerPush.mockReset()
    mockState.success.mockReset()
    mockState.showError.mockReset()
  })

  it('shows a not-configured trigger and routes to settings when there are no configs', async () => {
    const wrapper = mountSwitcher()

    const trigger = wrapper.get('.switcher-trigger')
    expect(trigger.text()).toContain('notConfigured')
    expect(trigger.find('.switcher-caret').exists()).toBe(false)

    await trigger.trigger('click')

    expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'settings' })
    expect(wrapper.find('.switcher-menu').exists()).toBe(false)

    wrapper.unmount()
  })

  it('renders a read-only trigger without a caret for a single config', async () => {
    await seedConfigs(1)
    const wrapper = mountSwitcher()

    const trigger = wrapper.get('.switcher-trigger')
    expect(trigger.text()).toContain('Config 1')
    expect(trigger.find('.switcher-caret').exists()).toBe(false)

    await trigger.trigger('click')
    expect(wrapper.find('.switcher-menu').exists()).toBe(false)

    wrapper.unmount()
  })

  it('opens the menu and switches the active config', async () => {
    await seedConfigs(2)
    const store = useConfigStore()
    const firstActive = store.activeConfigId
    const wrapper = mountSwitcher()

    await wrapper.get('.switcher-trigger').trigger('click')
    expect(wrapper.find('.switcher-menu').exists()).toBe(true)

    const items = wrapper.findAll('.switcher-item')
    expect(items).toHaveLength(2)

    const inactive = items.find((item) => !item.classes('active'))
    expect(inactive).toBeTruthy()
    await inactive!.trigger('click')
    await flushPromises()

    expect(store.activeConfigId).not.toBe(firstActive)
    expect(mockState.success).toHaveBeenCalledWith('activeConfigSaved')
    // Menu closes after selection.
    expect(wrapper.find('.switcher-menu').exists()).toBe(false)

    wrapper.unmount()
  })

  it('does not re-activate or toast when selecting the already-active config', async () => {
    await seedConfigs(2)
    const store = useConfigStore()
    const activateSpy = vi.spyOn(store, 'activateConfig')
    const wrapper = mountSwitcher()

    await wrapper.get('.switcher-trigger').trigger('click')
    const activeItem = wrapper.findAll('.switcher-item').find((item) => item.classes('active'))
    expect(activeItem).toBeTruthy()
    await activeItem!.trigger('click')

    expect(activateSpy).not.toHaveBeenCalled()
    expect(mockState.success).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('navigates to settings from the manage entry', async () => {
    await seedConfigs(2)
    const wrapper = mountSwitcher()

    await wrapper.get('.switcher-trigger').trigger('click')
    await wrapper.get('.switcher-manage').trigger('click')

    expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'settings' })

    wrapper.unmount()
  })
})
