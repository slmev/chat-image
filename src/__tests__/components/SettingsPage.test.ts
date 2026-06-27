import { DOMWrapper, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import SettingsPage from '../../components/Config/SettingsPage.vue'
import { useConfigStore } from '../../stores/config'

const mockState = vi.hoisted(() => ({
  routerPush: vi.fn(),
  testApiConnection: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  showError: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockState.routerPush,
  }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (!params) return key
      return `${key}:${JSON.stringify(params)}`
    },
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

vi.mock('../../composables/useConfig', () => ({
  useConfig: () => ({
    testApiConnection: mockState.testApiConnection,
  }),
}))

vi.mock('../../composables/useToast', () => ({
  useToast: () => ({
    success: mockState.success,
    warning: mockState.warning,
    error: mockState.showError,
  }),
}))

vi.mock('../../platform/imageReferenceCleanup', () => ({
  cleanupOrphanedLocalImages: vi.fn(),
  getLocalDataDirectory: vi.fn(),
  getLocalImageStorageStats: vi.fn(),
  openLocalDataDirectory: vi.fn(),
}))

function mountPage() {
  return mount(SettingsPage, {
    attachTo: document.body,
    global: {
      stubs: {
        ConfirmModal: true,
      },
    },
  })
}

async function clickButtonByText(text: string) {
  const button = Array.from(document.querySelectorAll('button')).find((item) =>
    item.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
  if (!button) {
    throw new Error(`Missing button: ${text}`)
  }
  await new DOMWrapper(button).trigger('click')
}

describe('SettingsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.body.innerHTML = ''
    mockState.routerPush.mockReset()
    mockState.testApiConnection.mockReset()
    mockState.testApiConnection.mockResolvedValue({ success: true, message: 'API 连接成功' })
    mockState.success.mockReset()
    mockState.warning.mockReset()
    mockState.showError.mockReset()
  })

  it('lists configs and manually activates the selected config', async () => {
    const store = useConfigStore()
    const first = await store.addConfig({
      name: 'Primary',
      endpoint: 'https://primary.example.test',
      apiKey: 'sk-primary',
      model: 'gpt-image-2',
    })
    const second = await store.addConfig({
      name: 'Backup',
      endpoint: 'https://backup.example.test',
      apiKey: 'sk-backup',
      model: 'gpt-image-2',
    })

    mountPage()
    await vi.dynamicImportSettled()

    expect(document.body.textContent).toContain('Primary')
    expect(document.body.textContent).toContain('Backup')
    expect(store.activeConfigId).toBe(first.id)

    await clickButtonByText('Backup')
    await clickButtonByText('setActive')

    expect(store.activeConfigId).toBe(second.id)
    expect(mockState.success).toHaveBeenCalledWith('activeConfigSaved')
  })

  it('adds a config without replacing the existing active config', async () => {
    const store = useConfigStore()
    const first = await store.addConfig({
      name: 'Primary',
      endpoint: 'https://primary.example.test',
      apiKey: 'sk-primary',
      model: 'gpt-image-2',
    })

    const wrapper = mountPage()
    await vi.dynamicImportSettled()

    await clickButtonByText('addConfig')
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('Backup')
    await inputs[1].setValue('https://backup.example.test')
    await inputs[2].setValue('sk-backup')
    await inputs[3].setValue('gpt-image-2')
    await clickButtonByText('saveConfig')

    expect(store.configs).toHaveLength(2)
    expect(store.activeConfigId).toBe(first.id)
    expect(store.configs[1]).toMatchObject({
      name: 'Backup',
      endpoint: 'https://backup.example.test',
    })
  })

  it('tests the connection with unsaved form values', async () => {
    const wrapper = mountPage()
    await vi.dynamicImportSettled()

    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('Primary')
    await inputs[1].setValue('https://api.example.test')
    await inputs[2].setValue('sk-test')
    await inputs[3].setValue('gpt-image-2')
    await clickButtonByText('testConnection')

    expect(mockState.testApiConnection).toHaveBeenCalledWith({
      endpoint: 'https://api.example.test',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
    })
  })
})
