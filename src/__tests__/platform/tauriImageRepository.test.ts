import { beforeEach, describe, expect, it, vi } from 'vitest'

const mkdir = vi.fn()
const writeFile = vi.fn()
const readFile = vi.fn()
const exists = vi.fn()
const remove = vi.fn()
const pluginFetch = vi.fn()

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: {
    AppData: 'AppData',
  },
  mkdir,
  writeFile,
  readFile,
  exists,
  remove,
}))

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: pluginFetch,
}))

describe('tauri image repository', () => {
  beforeEach(() => {
    mkdir.mockReset()
    mkdir.mockResolvedValue(undefined)
    writeFile.mockReset()
    writeFile.mockResolvedValue(undefined)
    readFile.mockReset()
    exists.mockReset()
    remove.mockReset()
    pluginFetch.mockReset()
    pluginFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/png' : null),
      },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:mock-image'),
    })
  })

  it('persists base64 images to app data and returns a display blob URL', async () => {
    const { tauriImageRepository } = await import('../../platform/tauriImageRepository')

    const result = await tauriImageRepository.saveGeneratedImage({
      id: 'image-1',
      b64Json: btoa('png'),
      timestamp: 1,
      sourcePrompt: 'a lake',
      sourceMessageId: 'message-1',
    })

    expect(mkdir).toHaveBeenCalledWith('images', {
      baseDir: 'AppData',
      recursive: true,
    })
    expect(writeFile).toHaveBeenCalledWith('images/image-1.png', expect.any(Uint8Array), {
      baseDir: 'AppData',
    })
    expect(result).toMatchObject({
      id: 'image-1',
      url: 'blob:mock-image',
      localPath: 'images/image-1.png',
      mimeType: 'image/png',
      byteSize: 3,
      sourcePrompt: 'a lake',
      sourceMessageId: 'message-1',
    })
    expect(result.base64).toBeUndefined()
  })

  it('uses an independent storage path without changing the imported image id', async () => {
    const { tauriImageRepository } = await import('../../platform/tauriImageRepository')

    const result = await tauriImageRepository.saveGeneratedImage({
      id: 'shared-id',
      storageId: 'import-batch-0',
      b64Json: btoa('png'),
      timestamp: 1,
    })

    expect(writeFile).toHaveBeenCalledWith('images/import-batch-0.png', expect.any(Uint8Array), {
      baseDir: 'AppData',
    })
    expect(result).toMatchObject({ id: 'shared-id', localPath: 'images/import-batch-0.png' })
  })

  it('keeps generated base64 displayable when local persistence fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    writeFile.mockRejectedValueOnce(new Error('permission denied'))
    const { tauriImageRepository } = await import('../../platform/tauriImageRepository')
    const base64 = btoa('png')

    const result = await tauriImageRepository.saveGeneratedImage({
      id: 'image-1',
      b64Json: base64,
      timestamp: 1,
    })

    expect(result).toMatchObject({
      id: 'image-1',
      url: 'blob:mock-image',
      base64,
      mimeType: 'image/png',
      byteSize: 3,
    })
    expect(result.localPath).toBeUndefined()
    warn.mockRestore()
  })

  it('localizes external image URLs when resolving desktop display URLs', async () => {
    const { tauriImageRepository } = await import('../../platform/tauriImageRepository')

    const result = await tauriImageRepository.resolveDisplayUrl({
      id: 'remote-image',
      url: 'http://images.example.test/generated.png',
      timestamp: 1,
      sourcePrompt: 'a castle',
    })

    expect(pluginFetch).toHaveBeenCalledWith('http://images.example.test/generated.png')
    expect(writeFile).toHaveBeenCalledWith('images/remote-image.png', expect.any(Uint8Array), {
      baseDir: 'AppData',
    })
    expect(result).toMatchObject({
      id: 'remote-image',
      url: 'blob:mock-image',
      localPath: 'images/remote-image.png',
      originalUrl: 'http://images.example.test/generated.png',
      sourcePrompt: 'a castle',
    })
  })
})
