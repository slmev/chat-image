import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImagePreview from '../../components/Chat/ImagePreview.vue'
import type { GeneratedImage } from '../../types'

const mockState = vi.hoisted(() => ({
  tauriRuntime: true,
  success: vi.fn(),
  showError: vi.fn(),
  downloadSingleImage: vi.fn(),
  openLocalImage: vi.fn(),
  revealLocalImage: vi.fn(),
  copyLocalImageToClipboard: vi.fn(),
  resolveDisplayUrl: vi.fn(),
  readImageBlob: vi.fn(),
}))

vi.mock('../../composables/useToast', () => ({
  useToast: () => ({
    success: mockState.success,
    error: mockState.showError,
  }),
}))

vi.mock('../../composables/useImageDownload', () => ({
  useImageDownload: () => ({
    downloadSingleImage: mockState.downloadSingleImage,
  }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'zh-CN' },
    t: (key: string) =>
      ({
        generatedImageAlt: '生成的图片',
        createVariation: '创建变体',
        editImage: '编辑图片',
        downloadImage: '下载图片',
        shareImage: '分享图片',
        expandImage: '放大查看',
        imageInfo: '图片信息',
        promptLabel: '提示词',
        generatedAt: '生成时间',
        copyPrompt: '复制提示词',
        variation: '变体',
        edit: '编辑',
        download: '下载',
        share: '分享',
        openLocalImage: '打开本地图片',
        open: '打开',
        revealLocalImage: '在文件管理器中显示',
        reveal: '显示',
        saveAs: '另存为',
        copyImageToClipboard: '复制图片到剪贴板',
        copy: '复制',
        promptCopied: '提示词已复制',
        copyFailed: '复制失败',
        openedLocalImage: '已打开本地图片',
        openLocalImageFailed: '打开本地图片失败',
        revealedLocalImage: '已在文件管理器中显示',
        revealLocalImageFailed: '显示本地图片失败',
        imageCopiedToClipboard: '图片已复制到剪贴板',
        copyImageFailed: '复制图片失败',
        invalidImageLink: '图片链接无效',
        generatedImageShareTitle: 'AI 生成的图片',
        generatedImageShareText: '查看这张 AI 生成的图片',
        imageLinkCopied: '图片链接已复制到剪贴板',
        shareFailed: '分享失败',
        missingLocalFile: '该图片没有本地文件',
        imageClipboardUnavailable: '当前图片不支持复制到系统剪贴板',
        readLocalImageFailed: '读取本地图片失败',
        copyImageNotSupported: '不支持复制该图片到剪贴板',
        writeClipboardFailed: '写入系统剪贴板失败',
        previewThumbnailLabel: '查看对话图片',
      })[key] ?? key,
  }),
}))

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => mockState.tauriRuntime,
}))

vi.mock('../../platform/localImageActions', () => {
  class LocalImageActionError extends Error {
    readonly code: string

    constructor(code: string, message: string) {
      super(message)
      this.name = 'LocalImageActionError'
      this.code = code
    }
  }

  return {
    LocalImageActionError,
    isLocalImageActionAvailable: (image: GeneratedImage) =>
      mockState.tauriRuntime && Boolean(image.localPath),
    openLocalImage: mockState.openLocalImage,
    revealLocalImage: mockState.revealLocalImage,
    copyLocalImageToClipboard: mockState.copyLocalImageToClipboard,
  }
})

vi.mock('../../platform/imageRepository', () => ({
  getImageRepository: () => ({
    resolveDisplayUrl: mockState.resolveDisplayUrl,
    readImageBlob: mockState.readImageBlob,
  }),
}))

function image(overrides: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    id: 'image-1',
    url: 'blob:image-1',
    localPath: 'images/image-1.png',
    mimeType: 'image/png',
    timestamp: 1,
    ...overrides,
  }
}

function previewEntry(key: string, source: GeneratedImage, imageIndex: number) {
  return {
    key,
    messageId: key.split(':')[0],
    imageIndex,
    image: source,
  }
}

async function openPreview(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('.image-open-button').trigger('click')
}

async function triggerBodyButton(title: string) {
  const button = document.querySelector(`[title="${title}"]`) as HTMLButtonElement | null
  if (!button) {
    throw new Error(`Missing button: ${title}`)
  }
  await new DOMWrapper(button).trigger('click')
}

describe('ImagePreview local image actions', () => {
  beforeEach(() => {
    mockState.success.mockReset()
    mockState.showError.mockReset()
    mockState.downloadSingleImage.mockReset()
    mockState.openLocalImage.mockReset()
    mockState.revealLocalImage.mockReset()
    mockState.copyLocalImageToClipboard.mockReset()
    mockState.resolveDisplayUrl.mockReset()
    mockState.resolveDisplayUrl.mockImplementation(async (image: GeneratedImage) => ({
      ...image,
      url: 'blob:resolved-local-image',
    }))
    mockState.readImageBlob.mockReset()
    mockState.readImageBlob.mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    mockState.tauriRuntime = true
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows desktop local image actions for Tauri images with localPath', async () => {
    const wrapper = mount(ImagePreview, { props: { image: image() } })

    await openPreview(wrapper)

    expect(document.body.textContent).toContain('打开')
    expect(document.body.textContent).toContain('显示')
    expect(document.body.textContent).toContain('另存为')
    expect(document.body.textContent).toContain('复制')
  })

  it('hides desktop local image actions outside Tauri', async () => {
    mockState.tauriRuntime = false
    const wrapper = mount(ImagePreview, { props: { image: image() } })

    await openPreview(wrapper)

    expect(document.body.textContent).not.toContain('打开')
    expect(document.body.textContent).not.toContain('显示')
    expect(document.body.textContent).not.toContain('另存为')
    expect(document.body.textContent).not.toContain('复制')
  })

  it('hides desktop local image actions when localPath is missing', async () => {
    const wrapper = mount(ImagePreview, { props: { image: image({ localPath: undefined }) } })

    await openPreview(wrapper)

    expect(document.body.textContent).not.toContain('打开')
    expect(document.body.textContent).not.toContain('显示')
    expect(document.body.textContent).not.toContain('另存为')
    expect(document.body.textContent).not.toContain('复制')
  })

  it('toggles enlarged image info from the preview action button', async () => {
    const wrapper = mount(ImagePreview, {
      props: { image: image({ sourcePrompt: 'silver moon over water' }) },
    })

    await openPreview(wrapper)

    expect(document.querySelector('.metadata-panel')).toBeNull()

    await triggerBodyButton('图片信息')

    expect(document.querySelector('.metadata-panel')?.textContent).toContain(
      'silver moon over water',
    )

    await triggerBodyButton('图片信息')

    expect(document.querySelector('.metadata-panel')).toBeNull()
  })

  it('opens on the clicked conversation image and switches through the thumbnail strip', async () => {
    const first = image({ id: 'shared-id', url: 'blob:first', sourcePrompt: 'first prompt' })
    const second = image({ id: 'shared-id', url: 'blob:second', sourcePrompt: 'second prompt' })
    const previewImages = [
      previewEntry('assistant-1:0', first, 0),
      previewEntry('assistant-2:0', second, 0),
    ]
    const wrapper = mount(ImagePreview, {
      props: {
        image: second,
        previewImages,
        previewKey: 'assistant-2:0',
      },
    })

    await openPreview(wrapper)

    const thumbnails = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.preview-thumbnail'),
    )
    expect(thumbnails).toHaveLength(2)
    expect(document.querySelector<HTMLImageElement>('.preview-image')?.src).toContain('blob:second')
    expect(thumbnails[1].getAttribute('aria-current')).toBe('true')

    await triggerBodyButton('图片信息')
    expect(document.querySelector('.metadata-panel')?.textContent).toContain('second prompt')

    await new DOMWrapper(thumbnails[0]).trigger('click')

    expect(document.querySelector<HTMLImageElement>('.preview-image')?.src).toContain('blob:first')
    expect(thumbnails[0].getAttribute('aria-current')).toBe('true')
    expect(document.querySelector('.metadata-panel')).toBeNull()

    await triggerBodyButton('编辑图片')
    expect(wrapper.emitted('editImage')?.at(-1)).toEqual([first, 'assistant-1'])
    await triggerBodyButton('创建变体')
    expect(wrapper.emitted('createVariation')?.at(-1)).toEqual([first, 'assistant-1'])
  })

  it('ignores a stale image resolution after switching thumbnails', async () => {
    let finishSlowResolution: () => void = () => undefined
    const slowResolution = new Promise<void>((resolve) => {
      finishSlowResolution = resolve
    })
    mockState.resolveDisplayUrl.mockImplementation(async (source: GeneratedImage) => {
      if (source.id === 'slow-image') {
        await slowResolution
      }
      return { ...source, url: `blob:resolved-${source.id}` }
    })
    const slow = image({
      id: 'slow-image',
      url: 'https://images.example.test/slow.png',
      localPath: undefined,
    })
    const fast = image({
      id: 'fast-image',
      url: 'https://images.example.test/fast.png',
      localPath: undefined,
    })
    const wrapper = mount(ImagePreview, {
      props: {
        image: slow,
        previewImages: [
          previewEntry('assistant-1:0', slow, 0),
          previewEntry('assistant-2:0', fast, 0),
        ],
        previewKey: 'assistant-1:0',
      },
    })

    await openPreview(wrapper)
    const thumbnails = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.preview-thumbnail'),
    )
    await new DOMWrapper(thumbnails[1]).trigger('click')
    await flushPromises()

    expect(document.querySelector<HTMLImageElement>('.preview-image')?.src).toContain(
      'blob:resolved-fast-image',
    )

    finishSlowResolution()
    await flushPromises()

    expect(document.querySelector<HTMLImageElement>('.preview-image')?.src).toContain(
      'blob:resolved-fast-image',
    )
  })

  it('falls back to the adjacent image when the active entry is removed', async () => {
    const first = image({ id: 'first-image', url: 'blob:first' })
    const second = image({ id: 'second-image', url: 'blob:second' })
    const firstEntry = previewEntry('assistant-1:0', first, 0)
    const secondEntry = previewEntry('assistant-2:0', second, 0)
    const wrapper = mount(ImagePreview, {
      props: {
        image: second,
        previewImages: [firstEntry, secondEntry],
        previewKey: secondEntry.key,
      },
    })

    await openPreview(wrapper)
    await wrapper.setProps({ previewImages: [firstEntry] })
    await flushPromises()

    expect(document.querySelector<HTMLImageElement>('.preview-image')?.src).toContain('blob:first')
    expect(document.querySelector('.preview-thumbnail-strip')).toBeNull()
  })

  it('resolves only the adjacent fallback when the active entry is removed', async () => {
    mockState.resolveDisplayUrl.mockImplementation(async (source: GeneratedImage) => ({
      ...source,
      url: `blob:resolved-${source.id}`,
    }))
    const first = image({
      id: 'first-image',
      url: 'https://images.example.test/first.png',
      localPath: undefined,
    })
    const removed = image({
      id: 'removed-image',
      url: 'https://images.example.test/removed.png',
      localPath: undefined,
    })
    const adjacent = image({
      id: 'adjacent-image',
      url: 'https://images.example.test/adjacent.png',
      localPath: undefined,
    })
    const firstEntry = previewEntry('assistant-1:0', first, 0)
    const removedEntry = previewEntry('assistant-2:0', removed, 0)
    const adjacentEntry = previewEntry('assistant-3:0', adjacent, 0)
    const wrapper = mount(ImagePreview, {
      props: {
        image: removed,
        previewImages: [firstEntry, removedEntry, adjacentEntry],
        previewKey: removedEntry.key,
      },
    })

    await openPreview(wrapper)
    await flushPromises()
    mockState.resolveDisplayUrl.mockClear()

    await wrapper.setProps({ previewImages: [firstEntry, adjacentEntry] })
    await flushPromises()

    expect(mockState.resolveDisplayUrl.mock.calls.map(([source]) => source.id)).toEqual([
      'adjacent-image',
    ])
  })

  it('keeps the existing single-image preview without a thumbnail strip', async () => {
    const wrapper = mount(ImagePreview, { props: { image: image() } })

    await openPreview(wrapper)

    expect(document.querySelector('.preview-thumbnail-strip')).toBeNull()
  })

  it('keeps the enlarged preview open when requesting a variation from it', async () => {
    const sourceImage = image({ localPath: undefined })
    const wrapper = mount(ImagePreview, { props: { image: sourceImage } })

    await openPreview(wrapper)
    await triggerBodyButton('创建变体')

    expect(wrapper.emitted('createVariation')?.[0]).toEqual([sourceImage])
    expect(document.querySelector('.preview-overlay')).not.toBeNull()
  })

  it('labels the enlarged preview close button', async () => {
    const wrapper = mount(ImagePreview, { props: { image: image({ localPath: undefined }) } })

    await openPreview(wrapper)

    const closeButton = document.querySelector('.close-btn') as HTMLButtonElement | null
    expect(closeButton?.getAttribute('aria-label')).toBe('close')
  })

  it('keeps the enlarged preview open when requesting image edit from it', async () => {
    const sourceImage = image({ localPath: undefined })
    const wrapper = mount(ImagePreview, { props: { image: sourceImage } })

    await openPreview(wrapper)
    await triggerBodyButton('编辑图片')

    expect(wrapper.emitted('editImage')?.[0]).toEqual([sourceImage])
    expect(document.querySelector('.preview-overlay')).not.toBeNull()
  })

  it('resolves desktop local paths before rendering images', async () => {
    const localImage = image({
      url: 'images/image-1.png',
      localPath: 'images/image-1.png',
    })
    const wrapper = mount(ImagePreview, { props: { image: localImage } })

    await flushPromises()

    expect(mockState.resolveDisplayUrl).toHaveBeenCalledWith(localImage)
    expect(wrapper.find('img.image').attributes('src')).toBe('blob:resolved-local-image')
  })

  it('resolves external URLs through the desktop repository before rendering', async () => {
    const remoteImage = image({
      url: 'http://images.example.test/generated.png',
      localPath: undefined,
    })
    const wrapper = mount(ImagePreview, { props: { image: remoteImage } })

    await flushPromises()

    expect(mockState.resolveDisplayUrl).toHaveBeenCalledWith(remoteImage)
    expect(wrapper.find('img.image').attributes('src')).toBe('blob:resolved-local-image')
  })

  it('runs local actions and reports success', async () => {
    const wrapper = mount(ImagePreview, { props: { image: image() } })

    await openPreview(wrapper)
    await triggerBodyButton('打开本地图片')
    await triggerBodyButton('在文件管理器中显示')
    await triggerBodyButton('复制图片到剪贴板')

    expect(mockState.openLocalImage).toHaveBeenCalledWith(image())
    expect(mockState.revealLocalImage).toHaveBeenCalledWith(image())
    expect(mockState.copyLocalImageToClipboard).toHaveBeenCalledWith(image())
    expect(mockState.success).toHaveBeenCalledWith('已打开本地图片')
    expect(mockState.success).toHaveBeenCalledWith('已在文件管理器中显示')
    expect(mockState.success).toHaveBeenCalledWith('图片已复制到剪贴板')
  })

  it('reports local action failures', async () => {
    const error = new Error('boom')
    mockState.openLocalImage.mockRejectedValueOnce(error)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const wrapper = mount(ImagePreview, { props: { image: image() } })

    await openPreview(wrapper)
    await triggerBodyButton('打开本地图片')

    expect(mockState.showError).toHaveBeenCalledWith('打开本地图片失败')
    consoleError.mockRestore()
  })

  it('emits when the inline image finishes loading', async () => {
    mockState.tauriRuntime = false
    const wrapper = mount(ImagePreview, {
      props: { image: image({ localPath: undefined }) },
    })

    await wrapper.find('.image').trigger('load')

    expect(wrapper.emitted('imageLoad')).toHaveLength(1)
  })
})
