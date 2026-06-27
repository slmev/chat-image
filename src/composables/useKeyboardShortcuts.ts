import { onMounted, onUnmounted } from 'vue'

export interface Shortcut {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  handler: (event: KeyboardEvent) => void
  description: string
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  function handleKeydown(event: KeyboardEvent) {
    // 忽略在输入框中的快捷键（除非有 ctrl/meta 修饰）
    const target = event.target as HTMLElement
    const isInput =
      target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

    for (const shortcut of shortcuts) {
      const wantsCtrl = shortcut.ctrl || shortcut.meta
      const ctrlMatch = wantsCtrl
        ? event.ctrlKey || event.metaKey
        : !(event.ctrlKey || event.metaKey)
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey

      // 没有修饰键的快捷键在输入框中不触发
      if (isInput && !wantsCtrl) continue

      if (event.key.toLowerCase() === shortcut.key.toLowerCase() && ctrlMatch && shiftMatch) {
        event.preventDefault()
        shortcut.handler(event)
        return
      }
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
  })
}
