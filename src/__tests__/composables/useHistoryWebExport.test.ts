import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ChatMessage } from '../../types'

const prepareMessagesForWebExport = vi.hoisted(() => vi.fn())

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('../../platform/metadataStore', () => ({
  HISTORY_LIST_KEY: 'chat-image-history-list',
  HISTORY_MESSAGES_PREFIX: 'chat-image-history-messages-',
  getDesktopChatHistory: vi.fn(async () => []),
  getMetadataValue: vi.fn(),
  initializeDesktopPersistence: vi.fn(),
  removeMetadataValue: vi.fn(),
  setMetadataValue: vi.fn(),
}))

vi.mock('../../platform/webPersistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/webPersistence')>()),
  prepareMessagesForWebExport,
}))

function newMessage(content: string): Omit<ChatMessage, 'id' | 'timestamp'> {
  return {
    type: 'user',
    content,
    status: 'success',
  }
}

describe('useHistory web export', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    prepareMessagesForWebExport.mockReset()
    prepareMessagesForWebExport.mockImplementation(async (messages: ChatMessage[]) => messages)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    const { useChatStore } = await import('../../stores/chat')
    await useChatStore().hydrateFromPersistence()
  })

  it('keeps portable image preparation inside the FIFO snapshot', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const { useHistory } = await import('../../composables/useHistory')
    const chatStore = useChatStore()
    await chatStore.addMessage(newMessage('included in export'))

    let markPreparationStarted: () => void = () => undefined
    const preparationStarted = new Promise<void>((resolve) => {
      markPreparationStarted = resolve
    })
    let finishPreparation: () => void = () => undefined
    const preparationGate = new Promise<void>((resolve) => {
      finishPreparation = resolve
    })
    let exportedMessages: ChatMessage[] = []
    prepareMessagesForWebExport.mockImplementationOnce(async (messages: ChatMessage[]) => {
      exportedMessages = JSON.parse(JSON.stringify(messages)) as ChatMessage[]
      markPreparationStarted()
      await preparationGate
      return messages
    })

    const exportPromise = useHistory().exportHistory()
    await preparationStarted

    let queuedWriteFinished = false
    const queuedWrite = chatStore.addMessage(newMessage('after snapshot')).then(() => {
      queuedWriteFinished = true
    })
    await Promise.resolve()
    expect(queuedWriteFinished).toBe(false)
    expect(chatStore.messages.map((message) => message.content)).toEqual(['included in export'])

    finishPreparation()
    await expect(exportPromise).resolves.toEqual({ canceled: false })
    await queuedWrite

    expect(exportedMessages.map((message) => message.content)).toEqual(['included in export'])
    expect(chatStore.messages.map((message) => message.content)).toEqual([
      'included in export',
      'after snapshot',
    ])
  })

  it('releases the FIFO queue before triggering the browser download', async () => {
    const { useChatStore } = await import('../../stores/chat')
    const { useHistory } = await import('../../composables/useHistory')
    const chatStore = useChatStore()
    await chatStore.addMessage(newMessage('included in export'))

    let writeStartedDuringClick = false
    let downloadWrite: Promise<ChatMessage> | undefined
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementationOnce(() => {
      downloadWrite = chatStore.addMessage(newMessage('started by click'))
      writeStartedDuringClick = chatStore.messages.some(
        (message) => message.content === 'started by click',
      )
    })

    await expect(useHistory().exportHistory()).resolves.toEqual({ canceled: false })
    await downloadWrite

    expect(writeStartedDuringClick).toBe(true)
  })
})
