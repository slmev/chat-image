import { ref } from 'vue'
import type { GeneratedImage } from '../types'
import { useToast } from './useToast'
import { isExternalImageUrl } from '../utils/images'
import { getImageRepository } from '../platform/imageRepository'
import i18n from '../i18n'

export function useImageDownload() {
  const isDownloading = ref(false)
  const { success, error: showError } = useToast()
  const t = i18n.global.t

  // 下载单张图片
  async function downloadSingleImage(image: GeneratedImage): Promise<void> {
    try {
      await getImageRepository().exportImage(image)
      success(isExternalImageUrl(image.url) ? t('openedImageLink') : t('imageSaved'))
    } catch (err) {
      console.error('Download failed:', err)
      showError(t('downloadFailed'))
    }
  }

  // 批量下载图片（使用 JSZip）
  async function downloadMultipleImages(images: GeneratedImage[]): Promise<void> {
    if (images.length === 0) return

    isDownloading.value = true

    try {
      // 动态导入 JSZip
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      const repository = getImageRepository()
      const externalImages = images.filter(image => isExternalImageUrl(image.url))

      // 并行读取可访问的图片，外链读取失败时只记录链接，避免跨域读取触发 403
      const downloadPromises = images.map(async (image, index) => {
        try {
          const blob = await repository.readImageBlob(image)
          const fileName = `image-${index + 1}.png`
          zip.file(fileName, blob)
        } catch (err) {
          console.error(`Failed to download image ${index + 1}:`, err)
        }
      })

      await Promise.all(downloadPromises)

      if (externalImages.length > 0) {
        const links = externalImages.map((image, index) => {
          const prompt = image.sourcePrompt ? `\nPrompt: ${image.sourcePrompt}` : ''
          return `Image ${index + 1}: ${image.url}${prompt}`
        })
        zip.file('external-image-links.txt', links.join('\n\n'))
      }

      // 生成 zip 文件
      const content = await zip.generateAsync({ type: 'blob' })

      // 下载 zip
      const blobUrl = URL.createObjectURL(content)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `ai-images-${Date.now()}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)

      success(t('processedImages', { count: images.length }))
    } catch (err) {
      console.error('Batch download failed:', err)
      showError(t('batchDownloadFailed'))
    } finally {
      isDownloading.value = false
    }
  }

  return {
    isDownloading,
    downloadSingleImage,
    downloadMultipleImages,
  }
}
