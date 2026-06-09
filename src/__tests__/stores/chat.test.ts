import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { STORAGE_KEYS } from '../../utils/constants'

const setMetadataValue = vi.fn<(...args: [string, unknown]) => Promise<void>>()

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('../../platform/metadataStore', () => ({
  getDesktopChatHistory: vi.fn(async () => []),
  setMetadataValue,
}))

describe('chat store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setMetadataValue.mockReset()
    localStorage.clear()
  })

  it('queues immutable snapshots when saving desktop chat history', async () => {
    let releaseFirstSave: () => void = () => {
      throw new Error('First save was not started')
    }
    setMetadataValue.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => {
        releaseFirstSave = resolve
      })
    })
    setMetadataValue.mockResolvedValue(undefined)

    const { useChatStore } = await import('../../stores/chat')
    const store = useChatStore()
    await store.hydrateFromPersistence()

    store.addMessage({
      type: 'user',
      content: 'first prompt',
      status: 'success',
    })
    store.addMessage({
      type: 'assistant',
      content: 'pending image',
      status: 'pending',
    })

    await Promise.resolve()

    expect(setMetadataValue).toHaveBeenCalledTimes(1)
    expect(setMetadataValue.mock.calls[0][0]).toBe(STORAGE_KEYS.CHAT_HISTORY)
    expect(setMetadataValue.mock.calls[0][1]).toMatchObject([
      { content: 'first prompt' },
    ])

    releaseFirstSave()
    await store.flushHistorySave()

    expect(setMetadataValue).toHaveBeenCalledTimes(2)
    expect(setMetadataValue.mock.calls[1][1]).toMatchObject([
      { content: 'first prompt' },
      { content: 'pending image' },
    ])
  })
})
