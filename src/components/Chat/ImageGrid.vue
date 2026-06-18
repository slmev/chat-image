<template>
  <div :class="['image-grid', `cols-${Math.min(images.length, maxCols)}`]">
    <ImagePreview
      v-for="image in images"
      :key="image.id"
      :image="image"
      @create-variation="$emit('createVariation', $event)"
      @edit-image="$emit('editImage', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import ImagePreview from './ImagePreview.vue'
import type { GeneratedImage } from '../../types'

interface Props {
  images: GeneratedImage[]
  maxCols?: number
}

withDefaults(defineProps<Props>(), {
  maxCols: 2,
})

defineEmits<{
  createVariation: [image: GeneratedImage]
  editImage: [image: GeneratedImage]
}>()
</script>

<style scoped>
.image-grid {
  display: grid;
  gap: 12px;
  width: 100%;
  max-width: 600px;
}

.cols-1 {
  grid-template-columns: 1fr;
}

.cols-2 {
  grid-template-columns: repeat(2, 1fr);
}

.cols-3 {
  grid-template-columns: repeat(2, 1fr);
}

.cols-4 {
  grid-template-columns: repeat(2, 1fr);
}

@media (max-width: 640px) {
  .image-grid {
    max-width: 100%;
  }

  .cols-2,
  .cols-3,
  .cols-4 {
    grid-template-columns: 1fr;
  }
}
</style>
