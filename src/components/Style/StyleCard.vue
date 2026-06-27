<template>
  <div :class="['style-card', { active: isSelected }]" @click="$emit('select', style)">
    <div class="style-icon">
      <component :is="iconComponent" :size="24" />
    </div>
    <div class="style-info">
      <h4 class="style-name">{{ style.name }}</h4>
      <p class="style-desc">{{ style.description }}</p>
    </div>
    <div v-if="isSelected" class="check-icon">
      <Check :size="16" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import { Check, Sparkles, Camera, Palette, Droplet, Pencil, Zap } from 'lucide-vue-next'
import type { StyleTemplate } from '../../types'

interface Props {
  style: StyleTemplate
  isSelected?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
})

defineEmits<{
  select: [style: StyleTemplate]
}>()

const iconMap: Record<string, Component> = {
  sparkles: Sparkles,
  camera: Camera,
  palette: Palette,
  droplet: Droplet,
  pencil: Pencil,
  zap: Zap,
}

const iconComponent = computed(() => {
  return iconMap[props.style.icon] || Sparkles
})
</script>

<style scoped>
.style-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-base);
}

.style-card:hover {
  border-color: var(--color-border-hover);
  box-shadow: var(--shadow-sm);
}

.style-card.active {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}

.style-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  color: var(--color-primary);
  flex-shrink: 0;
}

.style-card.active .style-icon {
  background: var(--color-primary);
  color: white;
}

.style-info {
  flex: 1;
  min-width: 0;
}

.style-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 2px;
}

.style-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.check-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  border-radius: 50%;
  color: white;
}
</style>
