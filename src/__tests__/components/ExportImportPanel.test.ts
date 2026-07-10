import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ExportImportPanel from '../../components/Chat/ExportImportPanel.vue'

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
        import: 'Import',
        importHistoryFrom: 'Import history from {format}',
        merge: 'Merge',
        mergeDescription: 'Add new messages',
        replace: 'Replace',
        replaceDescription: 'Replace history',
        selectFileToImport: 'Select file',
        close: 'Close',
      })[key] ?? key,
  }),
}))

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('../../composables/useHistory', () => ({
  useHistory: () => ({
    exportHistory: vi.fn(),
    importHistory: vi.fn(),
  }),
}))

describe('ExportImportPanel accessibility', () => {
  it('labels the trigger and close buttons', async () => {
    const wrapper = mount(ExportImportPanel)

    expect(wrapper.get('.btn-icon').attributes('aria-label')).toBe('Import/export history')
    await wrapper.get('.btn-icon').trigger('click')

    expect(wrapper.get('.close-btn').attributes('aria-label')).toBe('Close')
  })
})
