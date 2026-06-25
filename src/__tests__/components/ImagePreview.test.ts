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
    isLocalImageActionAvailable: (image: GeneratedImage) => (
      mockState.tauriRuntime && Boolean(image.localPath)
    ),
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

async function openPreview(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('.image-wrapper').trigger('click')
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
})
