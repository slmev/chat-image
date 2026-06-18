import { Image } from '@tauri-apps/api/image'
import type { GeneratedImage } from '../types'
import { getImageRepository } from './imageRepository'
import { isTauriRuntime } from './runtime'

export class LocalImageActionError extends Error {
  readonly code:
    | 'not_available'
    | 'missing_local_path'
    | 'read_failed'
    | 'copy_not_supported'
    | 'write_failed'

  constructor(
    code:
      | 'not_available'
      | 'missing_local_path'
      | 'read_failed'
      | 'copy_not_supported'
      | 'write_failed',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'LocalImageActionError'
    this.code = code
  }
}

export interface LocalImageActionDependencies {
  isTauriRuntime: () => boolean
  appDataDir: () => Promise<string>
  join: (...paths: string[]) => Promise<string>
  openPath: (path: string) => Promise<void>
  revealItemInDir: (path: string) => Promise<void>
  readImageBlob: (image: GeneratedImage) => Promise<Blob>
  createImageFromBytes: (bytes: Uint8Array) => Promise<unknown>
  writeImage: (image: unknown) => Promise<void>
}

export function isLocalImageActionAvailable(image: GeneratedImage): boolean {
  return isTauriRuntime() && Boolean(image.localPath)
}

export async function absoluteLocalImagePath(image: GeneratedImage): Promise<string> {
  if (!image.localPath) {
    throw new LocalImageActionError('missing_local_path', '该图片没有本地文件')
  }

  const { appDataDir, join } = await import('@tauri-apps/api/path')
  return join(await appDataDir(), image.localPath)
}

export async function openLocalImage(image: GeneratedImage): Promise<void> {
  const { openPath } = await import('@tauri-apps/plugin-opener')
  await openPath(await absoluteLocalImagePath(image))
}

export async function revealLocalImage(image: GeneratedImage): Promise<void> {
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
  await revealItemInDir(await absoluteLocalImagePath(image))
}

export async function copyLocalImageToClipboard(image: GeneratedImage): Promise<void> {
  await copyLocalImageToClipboardWithDependencies(image, {
    isTauriRuntime,
    readImageBlob: image => getImageRepository().readImageBlob(image),
    createImageFromBytes: bytes => Image.fromBytes(bytes),
    writeImage: async image => {
      const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager')
      await writeImage(image as Image)
    },
  })
}

export async function openLocalImageWithDependencies(
  image: GeneratedImage,
  dependencies: Pick<LocalImageActionDependencies, 'appDataDir' | 'join' | 'openPath'>,
): Promise<void> {
  await dependencies.openPath(await absoluteLocalImagePathWithDependencies(image, dependencies))
}

export async function revealLocalImageWithDependencies(
  image: GeneratedImage,
  dependencies: Pick<LocalImageActionDependencies, 'appDataDir' | 'join' | 'revealItemInDir'>,
): Promise<void> {
  await dependencies.revealItemInDir(await absoluteLocalImagePathWithDependencies(image, dependencies))
}

export async function copyLocalImageToClipboardWithDependencies(
  image: GeneratedImage,
  dependencies: Pick<
    LocalImageActionDependencies,
    'isTauriRuntime' | 'readImageBlob' | 'createImageFromBytes' | 'writeImage'
  >,
): Promise<void> {
  if (!dependencies.isTauriRuntime() || !image.localPath) {
    throw new LocalImageActionError('not_available', '当前图片不支持复制到系统剪贴板')
  }

  let blob: Blob
  try {
    blob = await dependencies.readImageBlob(image)
  } catch (error) {
    throw new LocalImageActionError('read_failed', '读取本地图片失败', { cause: error })
  }

  let bytes: Uint8Array
  try {
    bytes = await blobToPngBytes(blob)
  } catch (error) {
    throw new LocalImageActionError('copy_not_supported', '不支持复制该图片到剪贴板', {
      cause: error,
    })
  }

  let clipboardImage: unknown
  try {
    clipboardImage = await dependencies.createImageFromBytes(bytes)
  } catch (error) {
    throw new LocalImageActionError('copy_not_supported', '不支持复制该图片到剪贴板', {
      cause: error,
    })
  }

  try {
    await dependencies.writeImage(clipboardImage)
  } catch (error) {
    throw new LocalImageActionError('write_failed', '写入系统剪贴板失败', { cause: error })
  }
}

async function absoluteLocalImagePathWithDependencies(
  image: GeneratedImage,
  dependencies: Pick<LocalImageActionDependencies, 'appDataDir' | 'join'>,
): Promise<string> {
  if (!image.localPath) {
    throw new LocalImageActionError('missing_local_path', '该图片没有本地文件')
  }

  return dependencies.join(await dependencies.appDataDir(), image.localPath)
}

async function blobToPngBytes(blob: Blob): Promise<Uint8Array> {
  if (blob.type === 'image/png' || !canUseCanvas()) {
    return new Uint8Array(await blob.arrayBuffer())
  }

  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas 2D context is unavailable')
    }

    context.drawImage(bitmap, 0, 0)
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => {
        if (result) {
          resolve(result)
        } else {
          reject(new Error('PNG conversion failed'))
        }
      }, 'image/png')
    })
    return new Uint8Array(await pngBlob.arrayBuffer())
  } finally {
    bitmap.close()
  }
}

function canUseCanvas(): boolean {
  return typeof document !== 'undefined' && typeof createImageBitmap === 'function'
}
