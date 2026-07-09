import { DOMWrapper, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConfigModal from '../../components/Config/ConfigModal.vue'

const mockState = vi.hoisted(() => ({
  saveConfig: vi.fn(),
  testApiConnection: vi.fn(),
  showError: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../composables/useConfig', () => ({
  useConfig: () => ({
    configStore: {
      isConfigured: false,
      saveConfig: mockState.saveConfig,
    },
    testApiConnection: mockState.testApiConnection,
    initializeConfig: () => ({
      endpoint: 'https://api.example.test',
      apiKey: 'key',
      model: 'gpt-image-2',
    }),
  }),
  localizeApiTestResult: (result: { success: boolean; message: string }) => result.message,
}))

vi.mock('../../composables/useToast', () => ({
  useToast: () => ({
    error: mockState.showError,
  }),
}))

async function triggerButtonByText(text: string) {
  const button = Array.from(document.querySelectorAll('button')).find((item) =>
    item.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
  if (!button) {
    throw new Error(`Missing button: ${text}`)
  }
  await new DOMWrapper(button).trigger('click')
}

async function triggerButtonByLabel(label: string) {
  const button = document.querySelector(`button[aria-label="${label}"]`) as
    | HTMLButtonElement
    | undefined
  if (!button) {
    throw new Error(`Missing button label: ${label}`)
  }
  await new DOMWrapper(button).trigger('click')
}

describe('ConfigModal setup guide', () => {
  beforeEach(() => {
    mockState.saveConfig.mockReset()
    mockState.saveConfig.mockResolvedValue(undefined)
    mockState.testApiConnection.mockReset()
    mockState.testApiConnection.mockResolvedValue({ success: true, message: 'API 连接成功' })
    mockState.showError.mockReset()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
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

  it('saves the quick setup config', async () => {
    mount(ConfigModal, { attachTo: document.body })
    await vi.dynamicImportSettled()

    await triggerButtonByText('saveConfig')

    expect(mockState.saveConfig).toHaveBeenCalledWith({
      endpoint: 'https://api.example.test',
      apiKey: 'key',
      model: 'gpt-image-2',
    })
  })

  it('shows a toast when saving config fails', async () => {
    mockState.saveConfig.mockRejectedValueOnce(new Error('save failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mount(ConfigModal, { attachTo: document.body })
    await vi.dynamicImportSettled()

    await triggerButtonByText('saveConfig')
    await vi.dynamicImportSettled()

    expect(mockState.showError).toHaveBeenCalledWith('unknownError')
    consoleError.mockRestore()
  })

  it('shows a toast when testing the API connection throws', async () => {
    mockState.testApiConnection.mockRejectedValueOnce(new Error('test failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mount(ConfigModal, { attachTo: document.body })
    await vi.dynamicImportSettled()

    await triggerButtonByText('testConnection')
    await vi.dynamicImportSettled()

    expect(mockState.showError).toHaveBeenCalledWith('unknownError')
    consoleError.mockRestore()
  })

  it('closes the unsaved confirmation with Escape without reopening it', async () => {
    mount(ConfigModal, { attachTo: document.body })
    await vi.dynamicImportSettled()

    const endpoint = document.querySelector('#endpoint') as HTMLInputElement
    endpoint.value = 'https://changed.example.test'
    endpoint.dispatchEvent(new Event('input', { bubbles: true }))
    await triggerButtonByLabel('close')

    expect(document.body.textContent).toContain('unsavedChanges')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await vi.dynamicImportSettled()

    expect(document.body.textContent).not.toContain('unsavedChanges')
  })
})
