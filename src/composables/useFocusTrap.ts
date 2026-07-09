import { nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

interface FocusTrapOptions {
  // 可选的响应式激活开关。传入后，焦点陷阱按其真假值激活/停用，
  // 适用于内嵌在常驻组件中、靠 v-if 显隐的浮层（组件本身不卸载）。
  // 不传时，退回到「随组件挂载激活、卸载停用」的行为，
  // 适用于自身随 v-if 挂载/卸载的独立弹窗组件。
  isActive?: Ref<boolean>
}

export function useFocusTrap(
  containerRef: Ref<HTMLElement | undefined>,
  options: FocusTrapOptions = {},
) {
  const previousActiveElement = ref<HTMLElement | null>(null)
  let isTrapped = false

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
      if (
        document.activeElement === first ||
        !containerRef.value?.contains(document.activeElement)
      ) {
        event.preventDefault()
        last.focus()
      }
    } else {
      if (
        document.activeElement === last ||
        !containerRef.value?.contains(document.activeElement)
      ) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  function activate() {
    if (isTrapped) return
    isTrapped = true
    previousActiveElement.value = document.activeElement as HTMLElement
    const focusable = getFocusableElements()
    if (focusable.length > 0) {
      focusable[0].focus()
    }
    document.addEventListener('keydown', handleKeydown)
  }

  function deactivate() {
    if (!isTrapped) return
    isTrapped = false
    document.removeEventListener('keydown', handleKeydown)
    if (previousActiveElement.value) {
      previousActiveElement.value.focus()
      previousActiveElement.value = null
    }
  }

  if (options.isActive) {
    const source = options.isActive
    watch(
      source,
      (active) => {
        if (active) {
          // 等待 v-if 内容渲染后再取焦点元素。
          void nextTick(activate)
        } else {
          deactivate()
        }
      },
      { immediate: true },
    )
    // 组件卸载时兜底解绑，避免遗留 document 监听。
    onUnmounted(deactivate)
  } else {
    onMounted(activate)
    onUnmounted(deactivate)
  }

  return { activate, deactivate }
}
