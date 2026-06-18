import { ref, onMounted, onUnmounted, type Ref } from 'vue'

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function useFocusTrap(containerRef: Ref<HTMLElement | undefined>) {
  const previousActiveElement = ref<HTMLElement | null>(null)

  function getFocusableElements(): HTMLElement[] {
    if (!containerRef.value) return []
    return Array.from(containerRef.value.querySelectorAll(FOCUSABLE_SELECTORS))
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return

    const focusable = getFocusableElements()
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  function activate() {
    previousActiveElement.value = document.activeElement as HTMLElement
    const focusable = getFocusableElements()
    if (focusable.length > 0) {
      focusable[0].focus()
    }
    document.addEventListener('keydown', handleKeydown)
  }

  function deactivate() {
    document.removeEventListener('keydown', handleKeydown)
    if (previousActiveElement.value) {
      previousActiveElement.value.focus()
      previousActiveElement.value = null
    }
  }

  onMounted(() => {
    activate()
  })

  onUnmounted(() => {
    deactivate()
  })

  return { activate, deactivate }
}
