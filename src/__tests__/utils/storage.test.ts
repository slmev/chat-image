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
      const createObjectURL = vi.fn(() => 'blob:restored-image')
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: createObjectURL,
      })

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
              base64: btoa('webp'),
              mimeType: 'image/webp',
              timestamp: Date.now(),
            },
          ],
          images: [
            {
              id: 'image-1',
              url: 'https://example.com/image.png',
              base64: btoa('png'),
              timestamp: Date.now(),
              sourcePrompt: 'test prompt',
            },
          ],
        },
      ]

      setChatHistory(messages)

      const restored = getChatHistory()
      expect(restored[0].attachments?.[0]).toMatchObject({
        url: 'blob:restored-image',
        base64: btoa('webp'),
        name: 'reference.webp',
      })
      expect(restored[0].images?.[0]).toMatchObject({
        url: 'blob:restored-image',
        base64: btoa('png'),
      })
      expect(createObjectURL).toHaveBeenCalledTimes(2)
    })
  })
})
