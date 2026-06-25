import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImageEditDialog from '../../components/ImageEdit/ImageEditDialog.vue'
import type { GeneratedImage } from '../../types'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      editImageTitle: '编辑图片',
      sourceImageAlt: '源图片',
      zoomIn: '放大',
      zoomOut: '缩小',
      fitToView: '适配',
      zoomLevel: '缩放级别',
      brush: '画笔',
      eraser: '橡皮擦',
      brushSize: '大小',
      undo: '撤销',
      clearMask: '清除遮罩',
      editPromptLabel: '描述要修改的内容',
      editPromptPlaceholder: '例如：将背景改为海滩场景',
      editMaskHint: '在图片上绘制白色区域作为遮罩',
      cancel: '取消',
      processing: '处理中...',
      applyEdit: '应用编辑',
    }[key] ?? key),
  }),
}))

vi.mock('../../composables/useImageEdit', () => ({
  useImageEdit: () => ({
    isLoading: false,
    error: null,
    editImage: vi.fn(),
    cancelEdit: vi.fn(),
  }),
}))

const VIEWPORT_WIDTH = 400
const VIEWPORT_HEIGHT = 300
const IMAGE_WIDTH = 1024
const IMAGE_HEIGHT = 1792

function image(): GeneratedImage {
  return {
    id: 'image-1',
    url: 'blob:image-1',
    timestamp: 1,
  }
}

function parsePx(value: string) {
  return Number.parseFloat(value.replace('px', ''))
}

async function mountDialog() {
  const wrapper = mount(ImageEditDialog, {
    props: {
      image: image(),
      isOpen: true,
    },
    global: {
      stubs: {
        Teleport: true,
        Transition: false,
      },
    },
  })

  await flushPromises()
  return wrapper
}

describe('ImageEditDialog image sizing', () => {
  beforeEach(() => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(IMAGE_WIDTH)
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(IMAGE_HEIGHT)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('image-container')) {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: VIEWPORT_WIDTH,
          bottom: VIEWPORT_HEIGHT,
          width: VIEWPORT_WIDTH,
          height: VIEWPORT_HEIGHT,
          toJSON: () => ({}),
        }
      }

      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
      putImageData: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('fits a portrait image inside the edit viewport by default', async () => {
    const wrapper = await mountDialog()

    const stage = wrapper.get('.image-stage').element as HTMLElement
    const stageWidth = parsePx(stage.style.width)
    const stageHeight = parsePx(stage.style.height)

    expect(stageHeight).toBeLessThanOrEqual(VIEWPORT_HEIGHT)
    expect(stageWidth).toBeLessThanOrEqual(VIEWPORT_WIDTH)
    expect(stageHeight).toBeCloseTo(VIEWPORT_HEIGHT)
  })

  it('keeps the canvas internal size at the source image resolution', async () => {
    const wrapper = await mountDialog()
    const canvas = wrapper.get('canvas').element as HTMLCanvasElement

    expect(canvas.width).toBe(IMAGE_WIDTH)
    expect(canvas.height).toBe(IMAGE_HEIGHT)
  })

  it('zooms the stage without changing the canvas resolution', async () => {
    const wrapper = await mountDialog()
    const stage = wrapper.get('.image-stage').element as HTMLElement
    const canvas = wrapper.get('canvas').element as HTMLCanvasElement
    const initialHeight = parsePx(stage.style.height)

    await wrapper.get('[title="放大"]').trigger('click')

    expect(parsePx(stage.style.height)).toBeGreaterThan(initialHeight)
    expect(wrapper.get('.zoom-value').text()).toBe('125%')
    expect(canvas.width).toBe(IMAGE_WIDTH)
    expect(canvas.height).toBe(IMAGE_HEIGHT)
  })

  it('resets zoom to the fitted view', async () => {
    const wrapper = await mountDialog()
    const stage = wrapper.get('.image-stage').element as HTMLElement
    const fittedHeight = parsePx(stage.style.height)

    await wrapper.get('[title="放大"]').trigger('click')
    await wrapper.get('.zoom-fit-btn').trigger('click')

    expect(parsePx(stage.style.height)).toBeCloseTo(fittedHeight)
    expect(wrapper.get('.zoom-value').text()).toBe('100%')
  })
})
