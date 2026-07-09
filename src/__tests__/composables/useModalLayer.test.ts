/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useModalLayer } from '../../composables/useModalLayer'

function dispatchEscape() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

describe('useModalLayer', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('sends Escape only to the top active layer', async () => {
    const lowerEscape = vi.fn()
    const upperEscape = vi.fn()

    const Component = defineComponent({
      setup() {
        const lowerOpen = ref(true)
        const upperOpen = ref(true)
        useModalLayer(lowerOpen, lowerEscape)
        useModalLayer(upperOpen, () => {
          upperEscape()
          upperOpen.value = false
        })
        return { lowerOpen, upperOpen }
      },
      template: '<div />',
    })

    const wrapper = mount(Component, { attachTo: document.body })

    dispatchEscape()
    await nextTick()

    expect(upperEscape).toHaveBeenCalledTimes(1)
    expect(lowerEscape).not.toHaveBeenCalled()

    dispatchEscape()
    await nextTick()

    expect(upperEscape).toHaveBeenCalledTimes(1)
    expect(lowerEscape).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('stops Escape from reaching lower-priority document listeners', () => {
    const layerEscape = vi.fn()
    const documentEscape = vi.fn()

    const Component = defineComponent({
      setup() {
        const isOpen = ref(true)
        useModalLayer(isOpen, layerEscape)
      },
      template: '<div />',
    })

    document.addEventListener('keydown', documentEscape)
    const wrapper = mount(Component, { attachTo: document.body })

    dispatchEscape()

    expect(layerEscape).toHaveBeenCalledTimes(1)
    expect(documentEscape).not.toHaveBeenCalled()

    wrapper.unmount()
    document.removeEventListener('keydown', documentEscape)
  })
})
