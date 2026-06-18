import { ref } from 'vue'

export function useRegisterSW() {
  return {
    needRefresh: ref(false),
    updateServiceWorker: () => undefined,
  }
}
