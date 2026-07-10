import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getFromStorage,
  setToStorage,
  removeFromStorage,
  generateId,
  getTheme,
  setTheme,
  getApiConfig,
  getApiConfigState,
  setApiConfig,
  setApiConfigState,
  getChatHistory,
  setChatHistory,
  getGenerationOptions,
  setGenerationOptions,
} from '../../utils/storage'
import type { ChatMessage } from '../../types'

describe('storage utils', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('getFromStorage / setToStorage', () => {
    it('returns default value when key does not exist', () => {
      expect(getFromStorage('nonexistent', 'default')).toBe('default')
    })

    it('stores and retrieves a value', () => {
      setToStorage('test-key', { a: 1 })
      expect(getFromStorage('test-key', null)).toEqual({ a: 1 })
    })

    it('returns default on invalid JSON', () => {
      localStorage.setItem('bad-json', '{invalid')
      expect(getFromStorage('bad-json', 'fallback')).toBe('fallback')
    })
  })

  describe('removeFromStorage', () => {
    it('removes a stored key', () => {
      setToStorage('to-remove', 'value')
      removeFromStorage('to-remove')
      expect(localStorage.getItem('to-remove')).toBeNull()
    })
  })

  describe('generateId', () => {
    it('returns a string', () => {
      expect(typeof generateId()).toBe('string')
    })

    it('generates unique ids', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()))
      expect(ids.size).toBe(100)
    })
  })

  describe('theme storage', () => {
    it('defaults to system', () => {
      expect(getTheme()).toBe('system')
    })

    it('stores and retrieves theme', () => {
      setTheme('dark')
      expect(getTheme()).toBe('dark')
    })
  })

  describe('generation options storage', () => {
    it('normalizes legacy quality values when reading stored options', () => {
      localStorage.setItem(
        'chat-image-generation-options',
        JSON.stringify({
          size: '1792x1024',
          quality: 'hd',
          n: 2,
        }),
      )

      expect(getGenerationOptions()).toMatchObject({
        size: '1792x1024',
        quality: 'high',
        n: 2,
      })
    })

    it('stores normalized generation options', () => {
      setGenerationOptions({
        size: '1536x1024',
        quality: 'medium',
        n: 1,
      })

      expect(
        JSON.parse(localStorage.getItem('chat-image-generation-options') || '{}'),
      ).toMatchObject({
        size: '1536x1024',
        quality: 'medium',
        n: 1,
      })
    })
  })

  describe('API config storage', () => {
    it('returns null when no config stored', () => {
      expect(getApiConfig()).toBeNull()
    })

    it('encodes and decodes API key', () => {
      const config = {
        endpoint: 'https://api.test.com',
        apiKey: 'sk-test123',
        model: 'gpt-image-2',
      }
      setApiConfig(config)
      const retrieved = getApiConfig()
      expect(retrieved?.apiKey).toBe('sk-test123')
      expect(retrieved?.endpoint).toBe('https://api.test.com')
    })

    it('stores and restores multiple API config profiles', () => {
      setApiConfigState({
        activeConfigId: 'profile-2',
        configs: [
          {
            id: 'profile-1',
            name: 'Primary',
            endpoint: 'https://primary.example.test',
            apiKey: 'sk-primary',
            model: 'gpt-image-2',
          },
          {
            id: 'profile-2',
            name: 'Backup',
            endpoint: 'https://backup.example.test',
            apiKey: 'sk-backup',
            model: 'gpt-image-2',
          },
        ],
      })

      const raw = JSON.parse(localStorage.getItem('chat-image-api-config') || '{}')
      expect(raw.configs[0].apiKey).not.toBe('sk-primary')

      const restored = getApiConfigState()
      expect(restored.activeConfigId).toBe('profile-2')
      expect(restored.configs[0].apiKey).toBe('sk-primary')
      expect(getApiConfig()?.endpoint).toBe('https://backup.example.test')
    })
  })

  describe('chat history storage', () => {
    it('persists base64 and revives image URLs on read', () => {
      const webpBase64 = btoa('webp')
      const pngBase64 = btoa('png')

      const messages: ChatMessage[] = [
        {
          id: 'message-1',
          type: 'assistant',
          content: '图片已生成',
          timestamp: Date.now(),
          status: 'success',
          attachments: [
            {
              id: 'attachment-1',
              name: 'reference.webp',
              url: 'https://example.com/reference.webp',
              base64: webpBase64,
              mimeType: 'image/webp',
              timestamp: Date.now(),
            },
          ],
          images: [
            {
              id: 'image-1',
              url: 'https://example.com/image.png',
              base64: pngBase64,
              timestamp: Date.now(),
              sourcePrompt: 'test prompt',
            },
          ],
        },
      ]

      setChatHistory(messages)

      const restored = getChatHistory()
      expect(restored[0].attachments?.[0]).toMatchObject({
        url: `data:image/webp;base64,${webpBase64}`,
        base64: webpBase64,
        name: 'reference.webp',
      })
      expect(restored[0].images?.[0]).toMatchObject({
        url: `data:image/png;base64,${pngBase64}`,
        base64: pngBase64,
      })
    })

    it('removes base64 and data URLs when quota fallback strips image data', () => {
      const pngBase64 = btoa('png')
      const writes: Array<{ key: string; value: string }> = []
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
        writes.push({ key, value })
        if (writes.length <= 2) {
          throw new DOMException('quota exceeded', 'QuotaExceededError')
        }
      })

      setChatHistory([
        {
          id: 'message-1',
          type: 'assistant',
          content: '图片已生成',
          timestamp: Date.now(),
          status: 'success',
          attachments: [
            {
              id: 'attachment-1',
              name: 'reference.png',
              url: `data:image/png;base64,${pngBase64}`,
              originalUrl: 'https://example.com/reference.png',
              base64: pngBase64,
              mimeType: 'image/png',
              timestamp: Date.now(),
            },
          ],
          images: [
            {
              id: 'image-1',
              url: `data:image/png;base64,${pngBase64}`,
              localPath: 'images/image-1.png',
              base64: pngBase64,
              mimeType: 'image/png',
              timestamp: Date.now(),
            },
          ],
        },
      ])

      const fallbackMessages = JSON.parse(writes[2].value) as ChatMessage[]
      expect(JSON.stringify(fallbackMessages)).not.toContain(pngBase64)
      expect(JSON.stringify(fallbackMessages)).not.toContain('data:image')
      expect(fallbackMessages[0].attachments?.[0]).not.toHaveProperty('base64')
      expect(fallbackMessages[0].attachments?.[0]).toMatchObject({
        url: 'https://example.com/reference.png',
      })
      expect(fallbackMessages[0].images?.[0]).not.toHaveProperty('base64')
      expect(fallbackMessages[0].images?.[0]).toMatchObject({
        url: 'images/image-1.png',
      })
    })

    it('keeps base64 fallback images when no durable URL is available', async () => {
      const pngBase64 = btoa('png')
      const writes: Array<{ key: string; value: string }> = []
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
        writes.push({ key, value })
        if (writes.length <= 2) {
          throw new DOMException('quota exceeded', 'QuotaExceededError')
        }
      })

      await setChatHistory([
        {
          id: 'message-1',
          type: 'assistant',
          content: '图片已生成',
          timestamp: Date.now(),
          status: 'success',
          images: [
            {
              id: 'image-1',
              url: `data:image/png;base64,${pngBase64}`,
              base64: pngBase64,
              mimeType: 'image/png',
              timestamp: Date.now(),
            },
          ],
        },
      ])

      const fallbackMessages = JSON.parse(writes[2].value) as ChatMessage[]
      expect(fallbackMessages[0].images?.[0]).toMatchObject({
        url: `data:image/png;base64,${pngBase64}`,
        base64: pngBase64,
      })
    })

    it('rejects when all chat history save fallbacks fail', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      })

      await expect(
        setChatHistory([
          {
            id: 'message-1',
            type: 'user',
            content: 'unsaved',
            timestamp: Date.now(),
            status: 'success',
          },
        ]),
      ).rejects.toThrow('Failed to save chat history')
    })
  })
})
