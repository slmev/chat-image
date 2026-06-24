import { DOMWrapper, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConfigModal from '../../components/Config/ConfigModal.vue'

const mockState = vi.hoisted(() => ({
  isTauriRuntime: true,
  success: vi.fn(),
  warning: vi.fn(),
  showError: vi.fn(),
  saveConfig: vi.fn(),
  clearConfig: vi.fn(),
  testApiConnection: vi.fn(),
  getLocalImageStorageStats: vi.fn(),
  getLocalDataDirectory: vi.fn(),
  openLocalDataDirectory: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (!params) return key
      return `${key}:${JSON.stringify(params)}`
    },
  }),
}))

vi.mock('../../composables/useConfig', () => ({
  useConfig: () => ({
    configStore: {
      isConfigured: false,
      saveConfig: mockState.saveConfig,
      clearConfig: mockState.clearConfig,
    },
    testApiConnection: mockState.testApiConnection,
    initializeConfig: () => ({
      endpoint: 'https://api.example.test',
      apiKey: 'key',
      model: 'gpt-image-2',
    }),
  }),
}))

vi.mock('../../composables/useToast', () => ({
  useToast: () => ({
    success: mockState.success,
    warning: mockState.warning,
    error: mockState.showError,
  }),
}))

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => mockState.isTauriRuntime,
}))

vi.mock('../../platform/imageReferenceCleanup', () => ({
  getLocalImageStorageStats: mockState.getLocalImageStorageStats,
  getLocalDataDirectory: mockState.getLocalDataDirectory,
  openLocalDataDirectory: mockState.openLocalDataDirectory,
  cleanupOrphanedLocalImages: vi.fn(),
}))

async function triggerButtonByText(text: string) {
  const button = Array.from(document.querySelectorAll('button'))
    .find(item => item.textContent?.includes(text)) as HTMLButtonElement | undefined
  if (!button) {
    throw new Error(`Missing button: ${text}`)
  }
  await new DOMWrapper(button).trigger('click')
}

describe('ConfigModal desktop storage controls', () => {
  beforeEach(() => {
    mockState.isTauriRuntime = true
    mockState.success.mockReset()
    mockState.warning.mockReset()
    mockState.showError.mockReset()
    mockState.saveConfig.mockReset()
    mockState.saveConfig.mockResolvedValue(undefined)
    mockState.clearConfig.mockReset()
    mockState.clearConfig.mockResolvedValue(undefined)
    mockState.testApiConnection.mockReset()
    mockState.testApiConnection.mockResolvedValue({ success: true, message: 'API 连接成功' })
    mockState.getLocalImageStorageStats.mockReset()
    mockState.getLocalImageStorageStats.mockResolvedValue({
      totalCount: 2,
      totalBytes: 1536,
      orphanCount: 1,
      orphanBytes: 512,
    })
    mockState.getLocalDataDirectory.mockReset()
    mockState.getLocalDataDirectory.mockResolvedValue('/app-data/chat-image')
    mockState.openLocalDataDirectory.mockReset()
    mockState.openLocalDataDirectory.mockResolvedValue(undefined)
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows desktop storage stats and data directory in Tauri', async () => {
    mount(ConfigModal, { attachTo: document.body })
    await vi.dynamicImportSettled()

    expect(document.body.textContent).toContain('localStorage')
    expect(document.body.textContent).toContain('/app-data/chat-image')
    expect(document.body.textContent).toContain('openDirectory')
    expect(mockState.getLocalImageStorageStats).toHaveBeenCalled()
    expect(mockState.getLocalDataDirectory).toHaveBeenCalled()
  })

  it('hides desktop storage controls outside Tauri', async () => {
    mockState.isTauriRuntime = false

    mount(ConfigModal, { attachTo: document.body })
    await vi.dynamicImportSettled()

    expect(document.body.textContent).not.toContain('localStorage')
    expect(mockState.getLocalImageStorageStats).not.toHaveBeenCalled()
    expect(mockState.getLocalDataDirectory).not.toHaveBeenCalled()
  })

  it('opens the data directory from the storage section', async () => {
    mount(ConfigModal, { attachTo: document.body })
    await vi.dynamicImportSettled()

    await triggerButtonByText('openDirectory')

    expect(mockState.openLocalDataDirectory).toHaveBeenCalled()
  })

  it('shows a toast when opening the data directory fails', async () => {
    mockState.openLocalDataDirectory.mockRejectedValueOnce(new Error('open failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    mount(ConfigModal, { attachTo: document.body })
    await vi.dynamicImportSettled()
    await triggerButtonByText('openDirectory')

    expect(mockState.showError).toHaveBeenCalledWith('openDataDirectoryFailed')
    consoleError.mockRestore()
  })

  it('refreshes storage stats and data directory together', async () => {
    mount(ConfigModal, { attachTo: document.body })
    await vi.dynamicImportSettled()

    mockState.getLocalDataDirectory.mockResolvedValueOnce('/app-data/updated')
    await triggerButtonByText('refresh')

    expect(mockState.getLocalImageStorageStats).toHaveBeenCalledTimes(2)
    expect(mockState.getLocalDataDirectory).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('/app-data/updated')
  })

  it('tests connection with local form values without saving config', async () => {
    mount(ConfigModal, { attachTo: document.body })
    await vi.dynamicImportSettled()

    await triggerButtonByText('testConnection')

    expect(mockState.saveConfig).not.toHaveBeenCalled()
    expect(mockState.testApiConnection).toHaveBeenCalledWith({
      endpoint: 'https://api.example.test',
      apiKey: 'key',
      model: 'gpt-image-2',
    })
  })
})
