import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTheme } from '../../composables/useTheme'

// Mock matchMedia for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

describe('useTheme', () => {
  const wrappers: VueWrapper[] = []

  function mountTheme() {
    let theme: ReturnType<typeof useTheme> | undefined
    const wrapper = mount(
      defineComponent({
        setup() {
          theme = useTheme()
          return () => h('div')
        },
      }),
    )
    wrappers.push(wrapper)
    if (!theme) throw new Error('Theme composable was not initialized')
    return theme
  }

  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
  })

  it('defaults to system theme', () => {
    const { currentTheme } = mountTheme()
    expect(currentTheme.value).toBe('system')
  })

  it('cycles through themes on toggle', () => {
    const { currentTheme, toggleTheme } = mountTheme()

    expect(currentTheme.value).toBe('system')
    toggleTheme() // system -> light
    expect(currentTheme.value).toBe('light')
    toggleTheme() // light -> dark
    expect(currentTheme.value).toBe('dark')
    toggleTheme() // dark -> system
    expect(currentTheme.value).toBe('system')
  })

  it('applies dark class to document for dark theme', () => {
    const { applyTheme } = mountTheme()
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes dark class for light theme', () => {
    document.documentElement.classList.add('dark')
    const { applyTheme } = mountTheme()
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
