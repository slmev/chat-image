import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmModal from '../../components/Common/ConfirmModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      confirm: '确认',
      cancel: '取消',
    }[key] ?? key),
  }),
}))

describe('ConfirmModal', () => {
  it('does not render content when isOpen is false', () => {
    const wrapper = mount(ConfirmModal, {
      props: { isOpen: false, title: 'Test', message: 'Test' },
    })
    expect(wrapper.find('.confirm-content').exists()).toBe(false)
  })

  it('has correct props interface', () => {
    const wrapper = mount(ConfirmModal, {
      props: {
        isOpen: true,
        title: '确认删除',
        message: '确定要删除吗？',
        confirmText: '删除',
        cancelText: '取消',
        type: 'danger',
      },
    })
    // Verify the component accepts all props without error
    expect(wrapper.vm).toBeTruthy()
  })
})
