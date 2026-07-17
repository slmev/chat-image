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
  getGenerationOptions,
  setGenerationOptions,
} from '../../utils/storage'

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
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      expect(getFromStorage('bad-json', 'fallback')).toBe('fallback')
      expect(consoleError).toHaveBeenCalledWith(
        'Error reading from localStorage key bad-json:',
        expect.any(SyntaxError),
      )
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
})
