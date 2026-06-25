import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VariationDialog from '../../components/ImageEdit/VariationDialog.vue'
import type { GeneratedImage } from '../../types'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      createImageVariation: '创建图片变体',
      originalImage: '原图',
      zoomIn: '放大',
      zoomOut: '缩小',
      fitToView: '适配',
      zoomLevel: '缩放级别',
      prompt: '提示词',
      variationPromptPlaceholder: '输入或修改提示词来生成变体',
      style: '风格',
      keepOriginalStyle: '保持原风格',
      size: '尺寸',
      quality: '质量',
      count: '数量',
      cancel: '取消',
      generatingDots: '生成中...',
      generateVariation: '生成变体',
      imageSizeSquare: '方形 (1024x1024)',
      imageSizeLandscape: '横向 (1792x1024)',
      imageSizePortrait: '纵向 (1024x1792)',
      qualityStandard: '标准',
      qualityHd: '高清',
      styleAnime: '动漫',
      styleRealistic: '写实',
      styleOilPainting: '油画',
      styleWatercolor: '水彩',
      styleSketch: '素描',
      styleCyberpunk: '赛博朋克',
    }[key] ?? key),
  }),
}))

vi.mock('../../composables/useImageEdit', () => ({
  useImageEdit: () => ({
    isLoading: false,
    error: null,
    createVariation: vi.fn(),
  }),
}))

const VIEWPORT_WIDTH = 400
const VIEWPORT_HEIGHT = 280

let imageWidth = 1024
let imageHeight = 1792

function image(overrides: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    id: 'image-1',
    url: 'blob:image-1',
    sourcePrompt: 'source prompt',
    timestamp: 1,
    ...overrides,
  }
}

function parsePx(value: string) {
  return Number.parseFloat(value.replace('px', ''))
}

async function mountDialog(sourceImage = image()) {
  const wrapper = mount(VariationDialog, {
    props: {
      image: sourceImage,
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

describe('VariationDialog image sizing', () => {
  beforeEach(() => {
    imageWidth = 1024
    imageHeight = 1792
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockImplementation(() => imageWidth)
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockImplementation(() => imageHeight)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('original-image')) {
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
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('fits a portrait source image inside the preview viewport by default', async () => {
    const wrapper = await mountDialog()

    const stage = wrapper.get('.image-stage').element as HTMLElement
    const stageWidth = parsePx(stage.style.width)
    const stageHeight = parsePx(stage.style.height)

    expect(stageHeight).toBeLessThanOrEqual(VIEWPORT_HEIGHT)
    expect(stageWidth).toBeLessThanOrEqual(VIEWPORT_WIDTH)
    expect(stageHeight).toBeCloseTo(VIEWPORT_HEIGHT)
  })

  it('zooms the preview stage', async () => {
    const wrapper = await mountDialog()
    const stage = wrapper.get('.image-stage').element as HTMLElement
    const initialHeight = parsePx(stage.style.height)

    await wrapper.get('[title="放大"]').trigger('click')

    expect(parsePx(stage.style.height)).toBeGreaterThan(initialHeight)
    expect(wrapper.get('.zoom-value').text()).toBe('125%')
  })

  it('resets zoom to the fitted preview size', async () => {
    const wrapper = await mountDialog()
    const stage = wrapper.get('.image-stage').element as HTMLElement
    const fittedHeight = parsePx(stage.style.height)

    await wrapper.get('[title="放大"]').trigger('click')
    await wrapper.get('.zoom-fit-btn').trigger('click')

    expect(parsePx(stage.style.height)).toBeCloseTo(fittedHeight)
    expect(wrapper.get('.zoom-value').text()).toBe('100%')
  })

  it('resets prompt and zoom when the source image changes', async () => {
    const wrapper = await mountDialog()

    await wrapper.get('[title="放大"]').trigger('click')
    expect(wrapper.get('.zoom-value').text()).toBe('125%')

    imageWidth = 1792
    imageHeight = 1024
    await wrapper.setProps({
      image: image({
        id: 'image-2',
        url: 'blob:image-2',
        sourcePrompt: 'next prompt',
      }),
    })
    await flushPromises()

    const stage = wrapper.get('.image-stage').element as HTMLElement
    expect(parsePx(stage.style.width)).toBeCloseTo(VIEWPORT_WIDTH)
    expect(wrapper.get('.zoom-value').text()).toBe('100%')
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('next prompt')
  })
})
