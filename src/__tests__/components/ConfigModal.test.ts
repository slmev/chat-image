import { DOMWrapper, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConfigModal from '../../components/Config/ConfigModal.vue'

const mockState = vi.hoisted(() => ({
  saveConfig: vi.fn(),
  testApiConnection: vi.fn(),
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
}))

async function triggerButtonByText(text: string) {
  const button = Array.from(document.querySelectorAll('button'))
    .find(item => item.textContent?.includes(text)) as HTMLButtonElement | undefined
  if (!button) {
    throw new Error(`Missing button: ${text}`)
  }
  await new DOMWrapper(button).trigger('click')
}

describe('ConfigModal setup guide', () => {
  beforeEach(() => {
    mockState.saveConfig.mockReset()
    mockState.saveConfig.mockResolvedValue(undefined)
    mockState.testApiConnection.mockReset()
    mockState.testApiConnection.mockResolvedValue({ success: true, message: 'API 连接成功' })
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
})
