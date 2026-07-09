import { DOMWrapper, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CustomStyleDialog from '../../components/Style/CustomStyleDialog.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

describe('CustomStyleDialog', () => {
  async function clickButtonByLabel(label: string) {
    const button = document.querySelector(`button[aria-label="${label}"]`) as
      | HTMLButtonElement
      | undefined
    if (!button) {
      throw new Error(`Missing button label: ${label}`)
    }
    await new DOMWrapper(button).trigger('click')
  }

  it('ignores Escape while closed', async () => {
    const wrapper = mount(CustomStyleDialog, {
      props: {
        isOpen: false,
      },
      attachTo: document.body,
    })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toBeUndefined()
    expect(document.body.textContent).not.toContain('unsavedChanges')

    wrapper.unmount()
  })

  it('prompts before closing a dirty open form', async () => {
    const wrapper = mount(CustomStyleDialog, {
      props: {
        isOpen: true,
      },
      attachTo: document.body,
    })

    const input = document.querySelector('#style-name') as HTMLInputElement | null
    if (!input) {
      throw new Error('Missing style name input')
    }
    await new DOMWrapper(input).setValue('My style')
    await clickButtonByLabel('close')

    expect(document.body.textContent).toContain('unsavedChanges')
    expect(wrapper.emitted('close')).toBeUndefined()

    wrapper.unmount()
  })
})
