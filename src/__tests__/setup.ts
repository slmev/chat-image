import 'fake-indexeddb/auto'
import { afterEach, vi } from 'vitest'
import { resetWebPersistenceForTests } from '../platform/webPersistence'

let objectUrlId = 0
const nativeStructuredClone = globalThis.structuredClone

function containsBlob(value: unknown, seen = new Set<object>()): boolean {
  if (value instanceof Blob) return true
  if (!value || typeof value !== 'object' || seen.has(value)) return false
  seen.add(value)
  return Object.values(value).some((item) => containsBlob(item, seen))
}

function clonePreservingBlobs<T>(value: T, seen = new Map<object, unknown>()): T {
  if (value instanceof Blob || !value || typeof value !== 'object') return value
  const existing = seen.get(value)
  if (existing) return existing as T
  const clone: unknown[] | Record<string, unknown> = Array.isArray(value) ? [] : {}
  seen.set(value, clone)
  Object.entries(value).forEach(([key, item]) => {
    ;(clone as Record<string, unknown>)[key] = clonePreservingBlobs(item, seen)
  })
  return clone as T
}

globalThis.structuredClone = <T>(value: T): T =>
  containsBlob(value) ? clonePreservingBlobs(value) : nativeStructuredClone(value)

if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}

if (!Blob.prototype.text) {
  Blob.prototype.text = function (): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(this)
    })
  }
}

Object.defineProperty(URL, 'createObjectURL', {
  configurable: true,
  value: () => `blob:test-${objectUrlId++}`,
})
Object.defineProperty(URL, 'revokeObjectURL', {
  configurable: true,
  value: () => undefined,
})

afterEach(async () => {
  vi.useRealTimers()
  await resetWebPersistenceForTests()
})
