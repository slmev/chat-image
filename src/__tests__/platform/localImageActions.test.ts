import { describe, expect, it, vi } from 'vitest'
import type { GeneratedImage } from '../../types'
import {
  LocalImageActionError,
  copyLocalImageToClipboardWithDependencies,
  openLocalImageWithDependencies,
  revealLocalImageWithDependencies,
} from '../../platform/localImageActions'

function localImage(overrides: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    id: 'image-1',
    url: 'blob:image-1',
    localPath: 'images/image-1.png',
    mimeType: 'image/png',
    timestamp: 1,
    ...overrides,
  }
}

describe('local image actions', () => {
  it('opens the AppData image path with the system viewer', async () => {
    const openPath = vi.fn()

    await openLocalImageWithDependencies(localImage(), {
      appDataDir: async () => '/app-data',
      join: async (...paths) => paths.join('/'),
      openPath,
    })

    expect(openPath).toHaveBeenCalledWith('/app-data/images/image-1.png')
  })

  it('reveals the AppData image path in the file manager', async () => {
    const revealItemInDir = vi.fn()

    await revealLocalImageWithDependencies(localImage(), {
      appDataDir: async () => '/app-data',
      join: async (...paths) => paths.join('/'),
      revealItemInDir,
    })

    expect(revealItemInDir).toHaveBeenCalledWith('/app-data/images/image-1.png')
  })

  it('copies a local PNG image to the native clipboard', async () => {
    const clipboardImage = { rid: 1 }
    const readImageBlob = vi.fn(async () => new Blob(['png-bytes'], { type: 'image/png' }))
    const createImageFromBytes = vi.fn(async () => clipboardImage)
    const writeImage = vi.fn()

    await copyLocalImageToClipboardWithDependencies(localImage(), {
      isTauriRuntime: () => true,
      readImageBlob,
      createImageFromBytes,
      writeImage,
    })

    expect(readImageBlob).toHaveBeenCalledWith(localImage())
    expect(createImageFromBytes).toHaveBeenCalledWith(expect.any(Uint8Array))
    expect(writeImage).toHaveBeenCalledWith(clipboardImage)
  })

  it('rejects unavailable runtime or images without localPath', async () => {
    await expect(
      copyLocalImageToClipboardWithDependencies(localImage(), {
        isTauriRuntime: () => false,
        readImageBlob: vi.fn(),
        createImageFromBytes: vi.fn(),
        writeImage: vi.fn(),
      }),
    ).rejects.toMatchObject({
      code: 'not_available',
      message: '当前图片不支持复制到系统剪贴板',
    })

    await expect(
      copyLocalImageToClipboardWithDependencies(localImage({ localPath: undefined }), {
        isTauriRuntime: () => true,
        readImageBlob: vi.fn(),
        createImageFromBytes: vi.fn(),
        writeImage: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(LocalImageActionError)
  })

  it('reports local read failures with a toast-friendly error', async () => {
    await expect(
      copyLocalImageToClipboardWithDependencies(localImage(), {
        isTauriRuntime: () => true,
        readImageBlob: vi.fn(async () => {
          throw new Error('missing')
        }),
        createImageFromBytes: vi.fn(),
        writeImage: vi.fn(),
      }),
    ).rejects.toMatchObject({
      code: 'read_failed',
      message: '读取本地图片失败',
    })
  })

  it('reports clipboard write failures with a toast-friendly error', async () => {
    await expect(
      copyLocalImageToClipboardWithDependencies(localImage(), {
        isTauriRuntime: () => true,
        readImageBlob: vi.fn(async () => new Blob(['png-bytes'], { type: 'image/png' })),
        createImageFromBytes: vi.fn(async () => ({ rid: 1 })),
        writeImage: vi.fn(async () => {
          throw new Error('permission denied')
        }),
      }),
    ).rejects.toMatchObject({
      code: 'write_failed',
      message: '写入系统剪贴板失败',
    })
  })
})
