<template>
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
    <button
      v-for="style in styles"
      :key="style.id"
      :class="[
        'p-3 rounded-lg border-2 transition-all duration-200',
        selectedStyle?.id === style.id
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900'
          : 'border-gray-200 dark:border-gray-700 hover:border-blue-300',
      ]"
      @click="selectStyle(style)"
    >
      <div class="flex flex-col items-center gap-2">
        <component :is="getIcon(style.icon)" class="w-6 h-6" />
        <span class="font-medium text-sm">{{ style.name }}</span>
        <span class="text-xs text-gray-500">{{ style.description }}</span>
      </div>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Sparkles, Camera, Palette, Droplet, Pencil, Zap } from 'lucide-vue-next'
import { STYLE_TEMPLATES } from '../../utils/constants'
import type { StyleTemplate } from '../../types'

interface Emits {
  (e: 'select', style: StyleTemplate | null): void
}

const emit = defineEmits<Emits>()

const styles = STYLE_TEMPLATES
const selectedStyle = ref<StyleTemplate | null>(null)

function getIcon(iconName: string) {
  const iconMap = {
    sparkles: Sparkles,
    camera: Camera,
    palette: Palette,
    droplet: Droplet,
    pencil: Pencil,
    zap: Zap,
  }
  return iconMap[iconName as keyof typeof iconMap] || Sparkles
}

function selectStyle(style: StyleTemplate) {
  if (selectedStyle.value?.id === style.id) {
    // 取消选择
    selectedStyle.value = null
    emit('select', null)
  } else {
    // 选择风格
    selectedStyle.value = style
    emit('select', style)
  }
}
</script>
