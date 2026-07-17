import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ExportImportPanel from '../../components/Chat/ExportImportPanel.vue'
import { useChatStore } from '../../stores/chat'

const mockState = vi.hoisted(() => ({
  exportHistory: vi.fn(),
  importHistory: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        exportImportHistory: 'Import/export history',
        importExport: 'Import/Export',
        export: 'Export',
        exportHistoryAs: 'Export history as {format}',
        jsonFile: 'JSON file',
        exportHistory: 'Export history',
        exporting: 'Exporting...',
        import: 'Import',
        importHistoryFrom: 'Import history from {format}',
        merge: 'Merge',
        mergeDescription: 'Add new messages',
        replace: 'Replace',
        replaceDescription: 'Replace history',
        selectFileToImport: 'Select file',
        importing: 'Importing...',
        importFailedRollbackIncomplete:
          'Import failed and rollback was incomplete. Imported images were kept.',
        close: 'Close',
      })[key] ?? key,
  }),
}))

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('../../composables/useHistory', () => ({
  useHistory: () => ({
    exportHistory: mockState.exportHistory,
    importHistory: mockState.importHistory,
  }),
}))

describe('ExportImportPanel accessibility', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    mockState.exportHistory.mockReset()
    mockState.exportHistory.mockResolvedValue({ canceled: false })
    mockState.importHistory.mockReset()
    mockState.importHistory.mockResolvedValue({ success: true, message: '历史记录已合并' })
  })

  function mountPanel() {
    return mount(ExportImportPanel, {
      global: {
        plugins: [pinia],
      },
    })
  }

  it('labels the trigger and close buttons', async () => {
    const wrapper = mountPanel()

    expect(wrapper.get('.btn-icon').attributes('aria-label')).toBe('Import/export history')
    await wrapper.get('.btn-icon').trigger('click')

    expect(wrapper.get('.close-btn').attributes('aria-label')).toBe('Close')
  })

  it('disables import controls while generating or importing', async () => {
    const chatStore = useChatStore()
    const wrapper = mountPanel()
    await wrapper.get('.btn-icon').trigger('click')

    chatStore.setLoading(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.import-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.hidden-input').attributes('disabled')).toBeDefined()
    expect(
      wrapper
        .findAll('input[type="radio"]')
        .every((input) => input.attributes('disabled') !== undefined),
    ).toBe(true)

    chatStore.setLoading(false)
    chatStore.$patch({ isImportingMessages: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.export-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.import-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.hidden-input').attributes('disabled')).toBeDefined()
  })

  it('disables import controls during export and defends both event handlers', async () => {
    const chatStore = useChatStore()
    let finishExport: (result: { canceled: boolean }) => void = () => undefined
    mockState.exportHistory.mockImplementationOnce(() =>
      chatStore.runHistoryExport(
        () =>
          new Promise((resolve) => {
            finishExport = resolve
          }),
      ),
    )
    const firstPanel = mountPanel()
    const secondPanel = mountPanel()
    await firstPanel.get('.btn-icon').trigger('click')
    await secondPanel.get('.btn-icon').trigger('click')
    await firstPanel.get('.export-btn').trigger('click')
    await secondPanel.vm.$nextTick()

    expect(firstPanel.get('.import-btn').attributes('disabled')).toBeDefined()
    expect(secondPanel.get('.import-btn').attributes('disabled')).toBeDefined()
    expect(secondPanel.get('.hidden-input').attributes('disabled')).toBeDefined()
    expect(
      secondPanel
        .findAll('input[type="radio"]')
        .every((input) => input.attributes('disabled') !== undefined),
    ).toBe(true)

    const fileInput = secondPanel.get('.hidden-input').element as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File(['{}'], 'history.json', { type: 'application/json' })],
    })
    await secondPanel.get('.hidden-input').trigger('change')
    expect(mockState.importHistory).not.toHaveBeenCalled()

    finishExport({ canceled: true })
    await vi.waitFor(() =>
      expect(secondPanel.get('.export-btn').attributes('disabled')).toBeUndefined(),
    )

    chatStore.$patch({ isImportingMessages: true })
    await firstPanel.vm.$nextTick()
    await firstPanel.get('.export-btn').trigger('click')
    expect(mockState.exportHistory).toHaveBeenCalledTimes(1)
  })

  it('shows the localized incomplete rollback message in English', async () => {
    mockState.importHistory.mockResolvedValueOnce({
      success: false,
      message: '导入失败且回滚未完成，部分数据可能已变更；导入图片已保留',
    })
    const wrapper = mountPanel()
    await wrapper.get('.btn-icon').trigger('click')
    const fileInput = wrapper.get('.hidden-input').element as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File(['{}'], 'history.json', { type: 'application/json' })],
    })

    await wrapper.get('.hidden-input').trigger('change')
    await vi.waitFor(() =>
      expect(wrapper.get('.status-message').text()).toContain(
        'Import failed and rollback was incomplete. Imported images were kept.',
      ),
    )
  })
})
