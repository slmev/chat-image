import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ChatMessage, GeneratedImage } from '../../types'
import { PersistenceError } from '../../utils/persistenceError'

const persistenceControl = vi.hoisted(() => ({
  failNextCurrentWrite: false,
  writtenImageKeys: [] as string[],
}))

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('../../platform/metadataStore', () => ({
  getDesktopChatHistory: vi.fn(async () => []),
  setMetadataValue: vi.fn(),
}))

vi.mock('../../platform/webPersistence', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../platform/webPersistence')>()
  return {
    ...original,
    setWebCurrentMessages: async (messages: ChatMessage[]) => {
      if (persistenceControl.failNextCurrentWrite) {
        persistenceControl.failNextCurrentWrite = false
        throw new PersistenceError('Failed to save chat history')
      }
      await original.setWebCurrentMessages(messages)
    },
    putWebImage: async (...args: Parameters<typeof original.putWebImage>) => {
      persistenceControl.writtenImageKeys.push(args[0])
      await original.putWebImage(...args)
    },
  }
})

function message(id: string, image: GeneratedImage): ChatMessage {
  return {
    id,
    type: 'assistant',
    content: id,
    timestamp: 1,
    status: 'success',
    images: [image],
  }
}

describe('chat store web image imports', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    persistenceControl.failNextCurrentWrite = false
    persistenceControl.writtenImageKeys = []
  })

  it('preserves old bytes and deletes staged data when same-id import metadata fails', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const { webImageRepository } = await import('../../platform/webImageRepository')
    const { getWebImage } = await import('../../platform/webPersistence')
    const store = useChatStore()
    await store.hydrateFromPersistence()

    const originalImage = await webImageRepository.saveGeneratedImage({
      id: 'shared-image',
      b64Json: btoa('original'),
      timestamp: 1,
    })
    await store.importMessages([message('original-message', originalImage)], 'replace')
    persistenceControl.writtenImageKeys = []
    persistenceControl.failNextCurrentWrite = true

    await expect(
      store.importMessages(
        [
          message('replacement-message', {
            id: 'shared-image',
            url: 'data:image/png;base64,aW1wb3J0ZWQ=',
            base64: btoa('imported'),
            timestamp: 2,
          }),
        ],
        'replace',
      ),
    ).rejects.toThrow('Failed to save chat history')

    const [stagedKey] = persistenceControl.writtenImageKeys
    expect(stagedKey).toMatch(/^web:import-/)
    expect(store.messages.map((item) => item.id)).toEqual(['original-message'])
    expect(await (await webImageRepository.readImageBlob(originalImage)).text()).toBe('original')
    expect(await getWebImage(stagedKey)).toBeUndefined()
  })
})
