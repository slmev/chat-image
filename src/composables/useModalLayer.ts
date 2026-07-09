import { computed, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue'

interface ModalLayer {
  id: symbol
  onEscape: () => void
}

const layers: ModalLayer[] = []
let isListening = false
const stackVersion = ref(0)

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return

  const topLayer = layers[layers.length - 1]
  if (!topLayer) return

  event.preventDefault()
  event.stopImmediatePropagation()
  topLayer.onEscape()
}

function ensureListener(): void {
  if (isListening) return
  document.addEventListener('keydown', handleKeydown, true)
  isListening = true
}

function cleanupListener(): void {
  if (layers.length > 0 || !isListening) return
  document.removeEventListener('keydown', handleKeydown, true)
  isListening = false
}

function notifyStackChanged(): void {
  stackVersion.value += 1
}

function removeLayer(id: symbol): void {
  const index = layers.findIndex((layer) => layer.id === id)
  if (index !== -1) {
    layers.splice(index, 1)
    notifyStackChanged()
  }
  cleanupListener()
}

export function useModalLayer(
  isActive: Ref<boolean>,
  onEscape: () => void,
): { isTopLayer: ComputedRef<boolean> } {
  const id = Symbol('modal-layer')
  const isTopLayer = computed(() => {
    stackVersion.value
    return layers[layers.length - 1]?.id === id
  })

  watch(
    isActive,
    (active) => {
      removeLayer(id)
      if (active) {
        layers.push({ id, onEscape })
        notifyStackChanged()
        ensureListener()
      }
    },
    { immediate: true },
  )

  onUnmounted(() => removeLayer(id))

  return { isTopLayer }
}
