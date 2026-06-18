import { describe, it, expect, beforeEach, vi } from 'vitest'
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
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('defaults to system theme', () => {
    const { currentTheme } = useTheme()
    expect(currentTheme.value).toBe('system')
  })

  it('cycles through themes on toggle', () => {
    const { currentTheme, toggleTheme } = useTheme()

    expect(currentTheme.value).toBe('system')
    toggleTheme() // system -> light
    expect(currentTheme.value).toBe('light')
    toggleTheme() // light -> dark
    expect(currentTheme.value).toBe('dark')
    toggleTheme() // dark -> system
    expect(currentTheme.value).toBe('system')
  })

  it('applies dark class to document for dark theme', () => {
    const { applyTheme } = useTheme()
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes dark class for light theme', () => {
    document.documentElement.classList.add('dark')
    const { applyTheme } = useTheme()
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
