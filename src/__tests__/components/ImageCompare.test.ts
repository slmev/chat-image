import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImageCompare from '../../components/Chat/ImageCompare.vue'
import type { GeneratedImage } from '../../types'

const mockState = vi.hoisted(() => ({
  resolveDisplayUrl: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('../../platform/imageRepository', () => ({
  getImageRepository: () => ({
    resolveDisplayUrl: mockState.resolveDisplayUrl,
  }),
}))

function image(id: string): GeneratedImage {
  return {
    id,
    url: `https://images.example.test/${id}.png`,
    timestamp: 1,
  }
}

describe('ImageCompare display URLs', () => {
  beforeEach(() => {
    mockState.resolveDisplayUrl.mockReset()
    vi.spyOn(URL, 'revokeObjectURL').mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('revokes URLs that finish resolving after the comparison closes', async () => {
    const resolvers = new Map<string, (image: GeneratedImage) => void>()
    mockState.resolveDisplayUrl.mockImplementation(
      (source: GeneratedImage) =>
        new Promise<GeneratedImage>((resolve) => {
          resolvers.set(source.id, resolve)
        }),
    )
    const wrapper = mount(ImageCompare, {
      props: {
        isOpen: true,
        leftImage: image('left'),
        rightImage: image('right'),
      },
      global: { stubs: { Transition: false } },
    })
    await vi.waitFor(() => expect(mockState.resolveDisplayUrl).toHaveBeenCalledTimes(2))

    await wrapper.setProps({ isOpen: false })
    resolvers.get('left')?.({ ...image('left'), url: 'blob:late-left' })
    resolvers.get('right')?.({ ...image('right'), url: 'blob:late-right' })
    await flushPromises()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late-left')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late-right')
  })

  it('does not revoke newer URLs when an older resolution finishes late', async () => {
    const oldResolvers = new Map<string, (image: GeneratedImage) => void>()
    mockState.resolveDisplayUrl.mockImplementation((source: GeneratedImage) => {
      if (source.id.startsWith('old-')) {
        return new Promise<GeneratedImage>((resolve) => {
          oldResolvers.set(source.id, resolve)
        })
      }
      return Promise.resolve({ ...source, url: `blob:${source.id}` })
    })
    const wrapper = mount(ImageCompare, {
      props: {
        isOpen: true,
        leftImage: image('old-left'),
        rightImage: image('old-right'),
      },
      global: { stubs: { Transition: false } },
    })
    await vi.waitFor(() => expect(mockState.resolveDisplayUrl).toHaveBeenCalledTimes(2))

    await wrapper.setProps({
      leftImage: image('new-left'),
      rightImage: image('new-right'),
    })
    await flushPromises()
    oldResolvers.get('old-left')?.({ ...image('old-left'), url: 'blob:old-left' })
    oldResolvers.get('old-right')?.({ ...image('old-right'), url: 'blob:old-right' })
    await flushPromises()

    const renderedUrls = wrapper.findAll('img').map((node) => node.attributes('src'))
    expect(renderedUrls).toEqual(['blob:new-left', 'blob:new-right'])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old-left')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old-right')
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:new-left')
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:new-right')
  })
})
