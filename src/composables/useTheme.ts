import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { Theme } from '../types'
import { getTheme, setTheme } from '../utils/storage'
import { getMetadataValue, setMetadataValue } from '../platform/metadataStore'
import { isTauriRuntime } from '../platform/runtime'
import { STORAGE_KEYS } from '../utils/constants'

export function useTheme() {
  const currentTheme = ref<Theme>(getTheme())
  let mediaQueryCleanup: (() => void) | null = null

  function applyTheme(theme: Theme) {
    const root = document.documentElement

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      root.classList.toggle('dark', systemTheme === 'dark')
    } else {
      root.classList.toggle('dark', theme === 'dark')
    }

    if (isTauriRuntime()) {
      void setMetadataValue(STORAGE_KEYS.THEME, theme)
    } else {
      setTheme(theme)
    }
    currentTheme.value = theme
  }

  function toggleTheme() {
    const themes: Theme[] = ['light', 'dark', 'system']
    const currentIndex = themes.indexOf(currentTheme.value)
    const nextIndex = (currentIndex + 1) % themes.length
    const nextTheme = themes[nextIndex]

    applyTheme(nextTheme)

    // 取当前背景色
    const oldBg = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-bg-primary')
      .trim()

    // 创建遮罩（完全覆盖，与当前背景色一致）
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      background:${oldBg};pointer-events:none;
    `
    document.body.appendChild(overlay)

    // 等浏览器绘制完遮罩后再切换主题
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // 淡出遮罩，露出新主题
        overlay.style.transition = 'opacity 500ms ease'
        overlay.style.opacity = '0'
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true })
        setTimeout(() => overlay.remove(), 600)
      })
    })
  }

  // 清理媒体查询监听器
  function cleanupMediaQuery() {
    if (mediaQueryCleanup) {
      mediaQueryCleanup()
      mediaQueryCleanup = null
    }
  }

  // 监听系统主题变化
  watch(currentTheme, (newTheme) => {
    cleanupMediaQuery()

    if (newTheme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => {
        if (currentTheme.value === 'system') {
          applyTheme('system')
        }
      }

      mediaQuery.addEventListener('change', handler)
      mediaQueryCleanup = () => {
        mediaQuery.removeEventListener('change', handler)
      }
    }
  })

  onMounted(async () => {
    if (isTauriRuntime()) {
      currentTheme.value = await getMetadataValue<Theme>(STORAGE_KEYS.THEME, currentTheme.value)
    }
    applyTheme(currentTheme.value)
  })

  onUnmounted(() => {
    cleanupMediaQuery()
  })

  return {
    currentTheme,
    applyTheme,
    toggleTheme,
  }
}
