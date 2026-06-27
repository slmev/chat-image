import { ref } from 'vue'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number
}

const toasts = ref<Toast[]>([])
let toastId = 0

export function useToast() {
  function addToast(type: Toast['type'], message: string, duration = 3000) {
    const id = `toast-${++toastId}`
    const toast: Toast = { id, type, message, duration }
    toasts.value.push(toast)

    if (duration > 0) {
      setTimeout(() => removeToast(id), duration)
    }
  }

  function removeToast(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function success(message: string, duration?: number) {
    addToast('success', message, duration)
  }

  function error(message: string, duration?: number) {
    addToast('error', message, duration)
  }

  function warning(message: string, duration?: number) {
    addToast('warning', message, duration)
  }

  function info(message: string, duration?: number) {
    addToast('info', message, duration)
  }

  return {
    toasts,
    success,
    error,
    warning,
    info,
    removeToast,
  }
}
